import type { Env } from "../types";
import { CHAT_TOOL_DEFS, executeChatTool, toOpenAiTools } from "./chat-tools";
import { logChatUsage } from "./chat-usage";
import { saveChatMessage } from "./chat-history";

// Chosen for solid Thai-language quality (user's explicit requirement) —
// verified 2026-09-04 by testing directly (see README): this model returns
// an OpenAI Chat-Completions-shaped response (choices[0].message), NOT the
// simpler {response, tool_calls} shape most Workers AI docs/examples show —
// that's why this file calls env.AI.run() directly with OpenAI-style tool
// definitions and a manual loop, instead of @cloudflare/ai-utils'
// runWithTools (which assumes the simpler shape and silently did not pass
// tools through to this model when we tried it).
const MODEL = "@cf/qwen/qwen3.8-27b";
const MAX_ITERATIONS = 4;

const SYSTEM_PROMPT = `You are the AI assistant embedded in Aureum, a gold (XAU/USD) and Thai stock (SET) trading analytics dashboard. You help the admin (the only user of this chat) understand price action, support/resistance, and news.

Rules:
- You have tools to look up live gold price, gold S/R, Thai stock price, Thai stock S/R, latest news, and the stock screener. ALWAYS call the relevant tool before stating a price, level, or news fact — your training data has no live market data and gold/stock prices move constantly.
- If a tool returns an error (e.g. missing API key), say plainly that the data isn't available right now — never invent a plausible-sounding number.
- This is an analysis tool, not investment advice. If asked "should I buy/sell", walk through what the data shows (support held, trend, news) and explicitly say you can't tell them what to do.
- Answer in the language the user writes in (Thai or English) — respond fluently and naturally in Thai when the user writes Thai. Keep answers concise — this is a chat, not a report.
- Thai stock data is currently sourced from an unofficial feed with known accuracy caveats (see the app's own disclaimers) — mention this if the user seems to be relying heavily on a Thai stock price/level for a decision.
- The user can attach images (e.g. a chart screenshot) or plain-text files to a message. When an image is attached, actually look at it and describe/analyze what's relevant to the question — don't ignore it. A price or level you merely SEE in an attached chart is not live data — if the question needs the current real price/level, still call the matching tool rather than reading it off the image.
- Only ever answer with your final response text. Do not narrate your reasoning.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * One attachment on the CURRENT outgoing message only — never persisted or
 * resent on later turns (see saveChatMessage below, which stores just a
 * "📎 filename" note). Keeps image tokens/Neurons paid once per attachment,
 * not repeated on every subsequent turn the way full history replay would.
 */
export interface ChatAttachment {
  type: "image" | "text";
  name: string;
  dataUrl?: string; // images only — "data:image/png;base64,..."
  content?: string; // text files only — raw text
}

type WorkersAiContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

interface WorkersAiMessage {
  role: string;
  content: string | WorkersAiContentPart[] | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
}

/**
 * Plain text files get inlined straight into the text block (a text file is
 * just more text to read — no special API needed). Images become separate
 * `image_url` parts in an OpenAI-style content array — verified directly
 * against this exact model (@cf/qwen/qwen3.8-27b correctly read a test
 * image's color back), since Cloudflare's own published examples for this
 * shape have been reported inaccurate elsewhere.
 */
function buildUserContent(userMessage: string, attachments: ChatAttachment[]): string | WorkersAiContentPart[] {
  const images = attachments.filter((a) => a.type === "image" && a.dataUrl);
  const textFiles = attachments.filter((a) => a.type === "text" && a.content !== undefined);

  let text = userMessage;
  for (const f of textFiles) {
    text += `\n\n[ไฟล์แนบ: ${f.name}]\n${f.content}`;
  }

  if (images.length === 0) return text;
  return [{ type: "text", text }, ...images.map((img) => ({ type: "image_url" as const, image_url: { url: img.dataUrl! } }))];
}

const TOOL_LABELS: Record<string, string> = {
  get_gold_price: "กำลังเช็คราคาทอง…",
  get_gold_support_resistance: "กำลังเช็คแนวรับ-แนวต้านทอง…",
  get_stock_price: "กำลังเช็คราคาหุ้น…",
  get_stock_support_resistance: "กำลังเช็คแนวรับ-แนวต้านหุ้น…",
  get_latest_news: "กำลังเช็คข่าวล่าสุด…",
  get_stock_screener: "กำลังเช็ค screener…",
};

type SSEWriter = WritableStreamDefaultWriter<Uint8Array>;

const encoder = new TextEncoder();

async function sendEvent(writer: SSEWriter, data: unknown): Promise<void> {
  await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Manual tool-use loop against Workers AI, streaming tool-call transparency
 * events + the final answer to `writer` as SSE `data:` frames. No native
 * per-word streaming for this model (response arrives as one chunk) — see
 * the note in the module comment above for why. Always closes `writer`.
 */
export async function runChat(
  env: Env,
  history: ChatMessage[],
  userMessage: string,
  writer: SSEWriter,
  attachments: ChatAttachment[] = []
): Promise<void> {
  const messages: WorkersAiMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m): WorkersAiMessage => ({ role: m.role, content: m.content })),
    { role: "user", content: buildUserContent(userMessage, attachments) },
  ];

  try {
    // Persist a readable note, never the actual image/file bytes — D1 isn't
    // for storing attachments, and re-showing "📎 filename" on reload is
    // enough context for a human; the model itself never sees the
    // attachment again on later turns either (see buildUserContent above).
    const attachmentNote = attachments.length > 0 ? "\n\n" + attachments.map((a) => `📎 ${a.name}`).join("\n") : "";
    await saveChatMessage(env.DB, "user", userMessage + attachmentNote);

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const result = (await env.AI.run(MODEL, {
        messages,
        tools: toOpenAiTools(),
      } as any)) as any;

      const choice = result?.choices?.[0];
      const message = choice?.message;

      if (result?.usage) {
        await logChatUsage(env.DB, {
          model: MODEL,
          promptTokens: result.usage.prompt_tokens ?? 0,
          completionTokens: result.usage.completion_tokens ?? 0,
        });
      }

      const toolCalls = message?.tool_calls as WorkersAiMessage["tool_calls"];

      if (toolCalls && toolCalls.length > 0) {
        messages.push({ role: "assistant", content: message.content ?? "", tool_calls: toolCalls });

        for (const call of toolCalls) {
          const name = call.function.name;
          const args = parseToolArguments(call.function.arguments);
          await sendEvent(writer, { type: "tool_call", tool: name, label: TOOL_LABELS[name] ?? name });
          const toolResult = await executeChatTool(env, name, args);
          await sendEvent(writer, { type: "tool_result", tool: name });
          messages.push({ role: "tool", tool_call_id: call.id, name, content: toolResult });
        }
        continue; // loop again so the model can produce a final answer from the tool results
      }

      const text = (message?.content ?? "").trim() || "(ไม่มีคำตอบจากโมเดล)";
      await sendEvent(writer, { type: "text", text });
      await saveChatMessage(env.DB, "assistant", text);
      break;
    }

    await sendEvent(writer, { type: "done" });
  } catch (err) {
    console.error("[chat] error:", err);
    await sendEvent(writer, { type: "error", message: (err as Error).message });
  } finally {
    await writer.close();
  }
}

// Re-exported so callers/tests can inspect what tools this chat can use.
export { CHAT_TOOL_DEFS };
