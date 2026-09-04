import { Hono } from "hono";
import type { Env } from "../types";
import { requireAdmin } from "../lib/auth";
import { runChat, type ChatMessage } from "../lib/chat";
import { getUsageSummary } from "../lib/chat-usage";
import { clearChatHistory, getChatHistory } from "../lib/chat-history";

export const chatRoute = new Hono<{ Bindings: Env }>();

// Soft safety net — caps total messages/day even for the admin, in case of a
// client bug that loops requests. Workers AI's free allocation (10,000
// Neurons/day) is shared across every model on the whole Cloudflare account,
// so a runaway loop here could also starve the news-sentiment feature.
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
          message: "ถึงขีดจำกัดข้อความต่อวันแล้ว (กันโควตา Neurons ฟรีของ Cloudflare หมดจากบั๊ก) ลองใหม่พรุ่งนี้",
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

// GET /api/admin/chat/history — persisted conversation (single ongoing thread).
chatRoute.get("/history", requireAdmin, async (c) => {
  const messages = await getChatHistory(c.env.DB, 50);
  return c.json({ messages });
});

// DELETE /api/admin/chat/history — start a fresh conversation.
chatRoute.delete("/history", requireAdmin, async (c) => {
  await clearChatHistory(c.env.DB);
  return c.json({ ok: true });
});

// GET /api/admin/chat/usage — token usage + today's message quota.
// No $ estimate: Workers AI bills in Neurons (free: 10,000/day, shared
// across every model on the account), not a flat $/token rate we can
// compute client-side — see lib/chat-usage.ts.
chatRoute.get("/usage", requireAdmin, async (c) => {
  const dateKey = new Date().toISOString().slice(0, 10);
  const messagesToday = Number((await c.env.CACHE.get(`chat:quota:${dateKey}`)) ?? "0");
  const summary = await getUsageSummary(c.env.DB);
  return c.json({ ...summary, messagesToday, dailyMessageLimit: DAILY_MESSAGE_LIMIT });
});
