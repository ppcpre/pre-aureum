import type { Env, Timeframe } from "../types";
import * as twelvedata from "./twelvedata";
import * as yahoo from "./yahoo-finance";
import { getStockPrice } from "./stock-price";
import { getCandles, getPreviousDayCandle, upsertCandles } from "./candles-db";
import { buildSRLevels, pickNearestLevels } from "./sr-engine";
import { isKnownSymbol, STOCK_WATCHLIST } from "./stock-symbols";
import { buildScreener } from "./screener";

const GOLD_SYMBOL = "XAU/USD";
const TIMEFRAMES = ["M15", "H1", "H4", "D1", "W1"] as const;
const WATCHLIST_SYMBOLS = STOCK_WATCHLIST.map((s) => s.symbol);

interface ToolDef {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: readonly string[] }>;
    required: string[];
  };
}

/**
 * Read-only tools grounding the admin AI chat in this app's own data
 * pipelines (same functions the REST routes use — no HTTP round-trip to
 * self). Deliberately no write/action tools: this assistant can look things
 * up, never place an order, change a setting, or touch Auto Trade.
 */
export const CHAT_TOOL_DEFS: ToolDef[] = [
  {
    name: "get_gold_price",
    description: "Get the current spot price of gold (XAU/USD).",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_gold_support_resistance",
    description: "Get support/resistance levels for gold (XAU/USD) at a given timeframe.",
    parameters: {
      type: "object",
      properties: { timeframe: { type: "string", description: "One of M15, H1, H4, D1, W1", enum: TIMEFRAMES } },
      required: ["timeframe"],
    },
  },
  {
    name: "get_stock_price",
    description: `Get the current price of a Thai stock. Only these symbols are available: ${WATCHLIST_SYMBOLS.join(", ")}.`,
    parameters: {
      type: "object",
      properties: { symbol: { type: "string", enum: WATCHLIST_SYMBOLS } },
      required: ["symbol"],
    },
  },
  {
    name: "get_stock_support_resistance",
    description: "Get support/resistance levels for a Thai stock at a given timeframe.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", enum: WATCHLIST_SYMBOLS },
        timeframe: { type: "string", enum: TIMEFRAMES },
      },
      required: ["symbol", "timeframe"],
    },
  },
  {
    name: "get_latest_news",
    description: "Get the most recent news items (with sentiment/impact if already classified).",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "1-20, default 10" } },
      required: [],
    },
  },
  {
    name: "get_stock_screener",
    description:
      "Get the Thai stock screener: 24h % change and a signal (gainer/loser/near_support/breakout_resistance/normal) for every watchlist symbol.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

/** OpenAI Chat Completions tool-call shape — what this model's request/response format expects. */
export function toOpenAiTools() {
  return CHAT_TOOL_DEFS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export async function executeChatTool(env: Env, name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "get_gold_price": {
        const price = await twelvedata.fetchLatestPrice(env, GOLD_SYMBOL);
        return JSON.stringify({ symbol: GOLD_SYMBOL, price });
      }

      case "get_gold_support_resistance": {
        const timeframe = args.timeframe as Timeframe;
        let candles = await getCandles(env.DB, GOLD_SYMBOL, timeframe, 150);
        if (candles.length === 0) {
          candles = await twelvedata.fetchTimeSeries(env, GOLD_SYMBOL, timeframe, 150);
          await upsertCandles(env.DB, GOLD_SYMBOL, timeframe, candles);
        }
        const previousDayCandle = await getPreviousDayCandle(env, GOLD_SYMBOL);
        const currentPrice = await twelvedata.fetchLatestPrice(env, GOLD_SYMBOL);
        const levels = pickNearestLevels(buildSRLevels(candles, previousDayCandle, currentPrice), currentPrice);
        return JSON.stringify({ symbol: GOLD_SYMBOL, timeframe, currentPrice, levels });
      }

      case "get_stock_price": {
        const symbol = String(args.symbol ?? "");
        if (!isKnownSymbol(symbol)) return JSON.stringify({ error: `unknown symbol ${symbol}` });
        const { price } = await getStockPrice(env, symbol);
        return JSON.stringify({ symbol, price });
      }

      case "get_stock_support_resistance": {
        const symbol = String(args.symbol ?? "");
        const timeframe = args.timeframe as Timeframe;
        if (!isKnownSymbol(symbol)) return JSON.stringify({ error: `unknown symbol ${symbol}` });
        let candles = await getCandles(env.DB, symbol, timeframe, 150);
        if (candles.length === 0) {
          candles = await yahoo.fetchTimeSeries(symbol, timeframe);
          await upsertCandles(env.DB, symbol, timeframe, candles);
        }
        const previousDayCandle = await getPreviousDayCandle(env, symbol);
        const { price: currentPrice } = await getStockPrice(env, symbol);
        const levels = pickNearestLevels(buildSRLevels(candles, previousDayCandle, currentPrice), currentPrice);
        return JSON.stringify({ symbol, timeframe, currentPrice, levels });
      }

      case "get_latest_news": {
        const limit = Math.min(Number(args.limit ?? 10) || 10, 20);
        const { results } = await env.DB.prepare(
          `SELECT source, title, summary, published_at, sentiment, impact FROM news ORDER BY published_at DESC LIMIT ?`
        )
          .bind(limit)
          .all();
        return JSON.stringify({ items: results ?? [] });
      }

      case "get_stock_screener":
        return JSON.stringify({ items: await buildScreener(env) });

      default:
        return JSON.stringify({ error: `unknown tool ${name}` });
    }
  } catch (err) {
    // Return the failure AS a tool result so the model can explain it to the
    // user naturally (e.g. "gold price isn't available yet") instead of the
    // whole chat turn erroring out.
    return JSON.stringify({ error: (err as Error).message });
  }
}
