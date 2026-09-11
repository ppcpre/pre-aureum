import { Hono } from "hono";
import type { Env } from "../types";
import { requireAdmin } from "../lib/auth";
import { runChat, type ChatAttachment, type ChatMessage } from "../lib/chat";
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

// Attachments never touch Twelve Data/Yahoo quotas, but they DO cost real
// Neurons per request (an image adds real prompt tokens — see the vision
// test: a single 1x1 pixel already cost ~37 Neurons) — kept small and
// capped so one message can't balloon the daily Neuron budget shared with
// news-sentiment analysis.
const MAX_ATTACHMENTS = 3;
const MAX_IMAGE_DATA_URL_LENGTH = 6_000_000; // ~4.3MB of actual image bytes after base64's ~33% overhead
const MAX_TEXT_FILE_LENGTH = 50_000; // characters

function validateAttachments(attachments: ChatAttachment[]): string | null {
  if (attachments.length > MAX_ATTACHMENTS) return `แนบไฟล์ได้สูงสุด ${MAX_ATTACHMENTS} ไฟล์ต่อข้อความ`;
  for (const a of attachments) {
    if (a.type === "image") {
      if (!a.dataUrl || !a.dataUrl.startsWith("data:image/")) return `ไฟล์ "${a.name}" ไม่ใช่รูปภาพที่รองรับ`;
      if (a.dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) return `รูป "${a.name}" ใหญ่เกินไป (จำกัดไม่เกิน ~4MB/รูป)`;
    } else if (a.type === "text") {
      if (a.content === undefined) return `ไฟล์ "${a.name}" อ่านเนื้อหาไม่ได้`;
      if (a.content.length > MAX_TEXT_FILE_LENGTH) return `ไฟล์ "${a.name}" ยาวเกินไป (จำกัดไม่เกิน ${MAX_TEXT_FILE_LENGTH.toLocaleString()} ตัวอักษร)`;
    } else {
      return "ไม่รองรับไฟล์ประเภทนี้ — แนบได้แค่รูปภาพหรือไฟล์ข้อความ (.txt/.md)";
    }
  }
  return null;
}

// POST /api/admin/chat — streams an SSE response (text deltas + tool-call events).
chatRoute.post("/", requireAdmin, async (c) => {
  const body = await c.req
    .json<{ message?: string; history?: ChatMessage[]; attachments?: ChatAttachment[] }>()
    .catch(() => ({ message: undefined, history: undefined, attachments: undefined }));
  const attachments = body.attachments ?? [];
  // Text is optional when an attachment carries the actual question (e.g. "look at this chart") —
  // only reject when there's truly nothing to go on.
  const message = body.message?.trim() || (attachments.length > 0 ? "ดูไฟล์แนบนี้ให้หน่อย" : "");
  if (!message) return c.json({ error: "message required" }, 400);

  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const sendError = (text: string) => writer.write(encoder.encode(`data: ${JSON.stringify({ type: "error", message: text })}\n\n`));

  const attachmentError = validateAttachments(attachments);
  const allowed = attachmentError ? true : await checkAndIncrementDailyQuota(c.env);

  if (attachmentError) {
    await sendError(attachmentError);
    await writer.close();
  } else if (!allowed) {
    await sendError("ถึงขีดจำกัดข้อความต่อวันแล้ว (กันโควตา Neurons ฟรีของ Cloudflare หมดจากบั๊ก) ลองใหม่พรุ่งนี้");
    await writer.close();
  } else {
    // Runs after this handler returns the streaming Response below.
    c.executionCtx.waitUntil(runChat(c.env, body.history ?? [], message, writer, attachments));
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
