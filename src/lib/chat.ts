import type { Env } from "../types";
import { CHAT_TOOL_DEFS, executeChatTool, toOpenAiTools } from "./chat-tools";
import { logChatUsage } from "./chat-usage";

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
- Only ever answer with your final response text. Do not narrate your reasoning.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface WorkersAiMessage {
  role: string;
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
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
  writer: SSEWriter
): Promise<void> {
  const messages: WorkersAiMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m): WorkersAiMessage => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  try {
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

      const text = (message?.content ?? "").trim();
      await sendEvent(writer, { type: "text", text: text || "(ไม่มีคำตอบจากโมเดล)" });
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
