import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../types";
import { CHAT_TOOLS, executeChatTool } from "./chat-tools";
import { logChatUsage } from "./chat-usage";

// User explicitly chose Sonnet 5 for this feature (cost vs. capability
// tradeoff) — see chat history. Don't "upgrade" this without asking.
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 4096; // chat Q&A, not long-form generation — deliberate cost cap
const MAX_ITERATIONS = 6; // hard ceiling so a tool-call loop can't run away

const SYSTEM_PROMPT = `You are the AI assistant embedded in Aureum, a gold (XAU/USD) and Thai stock (SET) trading analytics dashboard. You help the admin (the only user of this chat) understand price action, support/resistance, and news.

Rules:
- You have tools to look up live gold price, gold S/R, Thai stock price, Thai stock S/R, latest news, and the stock screener. ALWAYS call the relevant tool before stating a price, level, or news fact — your training data has no live market data and gold/stock prices move constantly.
- If a tool returns an error (e.g. missing API key), say plainly that the data isn't available right now — never invent a plausible-sounding number.
- This is an analysis tool, not investment advice. If asked "should I buy/sell", walk through what the data shows (support held, trend, news) and explicitly say you can't tell them what to do.
- Answer in the language the user writes in (Thai or English). Keep answers concise — this is a chat, not a report.
- Thai stock data is currently sourced from an unofficial feed with known accuracy caveats (see the app's own disclaimers) — mention this if the user seems to be relying heavily on a Thai stock price/level for a decision.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type SSEWriter = WritableStreamDefaultWriter<Uint8Array>;

const encoder = new TextEncoder();

async function sendEvent(writer: SSEWriter, data: unknown): Promise<void> {
  await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

const TOOL_LABELS: Record<string, string> = {
  get_gold_price: "กำลังเช็คราคาทอง…",
  get_gold_support_resistance: "กำลังเช็คแนวรับ-แนวต้านทอง…",
  get_stock_price: "กำลังเช็คราคาหุ้น…",
  get_stock_support_resistance: "กำลังเช็คแนวรับ-แนวต้านหุ้น…",
  get_latest_news: "กำลังเช็คข่าวล่าสุด…",
  get_stock_screener: "กำลังเช็ค screener…",
};

/**
 * Runs the tool-use agentic loop for one chat turn, streaming text deltas
 * and tool-call transparency events to `writer` as newline-delimited SSE
 * `data:` frames. Always closes `writer` itself (success or failure) —
 * callers must not close it again.
 */
export async function runChat(
  env: Env,
  history: ChatMessage[],
  userMessage: string,
  writer: SSEWriter
): Promise<void> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m): Anthropic.MessageParam => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: CHAT_TOOLS,
        messages,
      });

      stream.on("text", (delta) => {
        void sendEvent(writer, { type: "text", text: delta });
      });

      const message = await stream.finalMessage();

      await logChatUsage(env.DB, {
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
        cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
      });

      if (message.stop_reason === "pause_turn") {
        // No server-side tools are declared, so this shouldn't fire — handled
        // defensively per the SDK docs rather than assumed away.
        messages.push({ role: "assistant", content: message.content });
        continue;
      }

      if (message.stop_reason !== "tool_use") {
        break; // end_turn, max_tokens, stop_sequence, refusal — done either way
      }

      messages.push({ role: "assistant", content: message.content });

      const toolUseBlocks = message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tool of toolUseBlocks) {
        await sendEvent(writer, { type: "tool_call", tool: tool.name, label: TOOL_LABELS[tool.name] ?? tool.name });
        const result = await executeChatTool(env, tool.name, tool.input);
        await sendEvent(writer, { type: "tool_result", tool: tool.name });
        toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: result });
      }

      messages.push({ role: "user", content: toolResults });
    }

    await sendEvent(writer, { type: "done" });
  } catch (err) {
    console.error("[chat] error:", err);
    await sendEvent(writer, { type: "error", message: (err as Error).message });
  } finally {
    await writer.close();
  }
}
