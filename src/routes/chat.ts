import { Hono } from "hono";
import type { Env } from "../types";
import { requireAdmin } from "../lib/auth";
import { runChat, type ChatMessage } from "../lib/chat";
import { getRecentUsage, getUsageSummary } from "../lib/chat-usage";

export const chatRoute = new Hono<{ Bindings: Env }>();

// Soft safety net (separate from the per-response max_tokens cost cap) —
// caps total messages/day even for the admin, in case of a client bug that
// loops requests. Not a hard spend cap, just a sane ceiling.
const DAILY_MESSAGE_LIMIT = 200;

async function checkAndIncrementDailyQuota(env: Env): Promise<boolean> {
  const dateKey = new Date().toISOString().slice(0, 10);
  const key = `chat:quota:${dateKey}`;
  const current = Number((await env.CACHE.get(key)) ?? "0");
  if (current >= DAILY_MESSAGE_LIMIT) return false;
  await env.CACHE.put(key, String(current + 1), { expirationTtl: 60 * 60 * 26 });
  return true;
}

// POST /api/admin/chat — streams an SSE response (text deltas + tool-call events).
chatRoute.post("/", requireAdmin, async (c) => {
  const body = await c.req
    .json<{ message?: string; history?: ChatMessage[] }>()
    .catch(() => ({ message: undefined, history: undefined }));
  const message = body.message?.trim();
  if (!message) return c.json({ error: "message required" }, 400);

  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();

  const allowed = await checkAndIncrementDailyQuota(c.env);
  if (!allowed) {
    const encoder = new TextEncoder();
    await writer.write(
      encoder.encode(
        `data: ${JSON.stringify({
          type: "error",
          message: "ถึงขีดจำกัดข้อความต่อวันแล้ว (ป้องกันค่าใช้จ่ายบานปลาย) ลองใหม่พรุ่งนี้",
        })}\n\n`
      )
    );
    await writer.close();
  } else {
    // Runs after this handler returns the streaming Response below.
    c.executionCtx.waitUntil(runChat(c.env, body.history ?? [], message, writer));
  }

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

// GET /api/admin/chat/usage — token/cost dashboard data.
chatRoute.get("/usage", requireAdmin, async (c) => {
  const [summary, recent] = await Promise.all([getUsageSummary(c.env.DB), getRecentUsage(c.env.DB, 20)]);
  return c.json({ ...summary, recent });
});
