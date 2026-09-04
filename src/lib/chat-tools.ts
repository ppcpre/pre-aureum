import type Anthropic from "@anthropic-ai/sdk";
import type { Env, Timeframe } from "../types";
import * as twelvedata from "./twelvedata";
import * as yahoo from "./yahoo-finance";
import { getCandles, getPreviousDayCandle, upsertCandles } from "./candles-db";
import { buildSRLevels, pickNearestLevels } from "./sr-engine";
import { isKnownSymbol, STOCK_WATCHLIST } from "./stock-symbols";
import { buildScreener } from "./screener";

const GOLD_SYMBOL = "XAU/USD";
const TIMEFRAMES = ["M15", "H1", "H4", "D1", "W1"] as const;
const WATCHLIST_SYMBOLS = STOCK_WATCHLIST.map((s) => s.symbol);

/**
 * Read-only tools grounding the admin AI chat in this app's own data
 * pipelines (same functions the REST routes use — no HTTP round-trip to
 * self). Deliberately no write/action tools: this assistant can look things
 * up, never place an order, change a setting, or touch Auto Trade.
 */
export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_gold_price",
    description: "Get the current spot price of gold (XAU/USD).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_gold_support_resistance",
    description: "Get support/resistance levels for gold (XAU/USD) at a given timeframe.",
    input_schema: {
      type: "object",
      properties: { timeframe: { type: "string", enum: TIMEFRAMES } },
      required: ["timeframe"],
      additionalProperties: false,
    },
  },
  {
    name: "get_stock_price",
    description: `Get the current price of a Thai stock. Only these symbols are available: ${WATCHLIST_SYMBOLS.join(", ")}.`,
    input_schema: {
      type: "object",
      properties: { symbol: { type: "string", enum: WATCHLIST_SYMBOLS } },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "get_stock_support_resistance",
    description: "Get support/resistance levels for a Thai stock at a given timeframe.",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string", enum: WATCHLIST_SYMBOLS },
        timeframe: { type: "string", enum: TIMEFRAMES },
      },
      required: ["symbol", "timeframe"],
      additionalProperties: false,
    },
  },
  {
    name: "get_latest_news",
    description: "Get the most recent news items (with sentiment/impact if already classified).",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 20 } },
      additionalProperties: false,
    },
  },
  {
    name: "get_stock_screener",
    description:
      "Get the Thai stock screener: 24h % change and a signal (gainer/loser/near_support/breakout_resistance/normal) for every watchlist symbol.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export async function executeChatTool(env: Env, name: string, input: unknown): Promise<string> {
  try {
    switch (name) {
      case "get_gold_price": {
        const price = await twelvedata.fetchLatestPrice(env, GOLD_SYMBOL);
        return JSON.stringify({ symbol: GOLD_SYMBOL, price });
      }

      case "get_gold_support_resistance": {
        const { timeframe } = input as { timeframe: Timeframe };
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
        const { symbol } = input as { symbol: string };
        if (!isKnownSymbol(symbol)) return JSON.stringify({ error: `unknown symbol ${symbol}` });
        const price = await yahoo.fetchLatestPrice(symbol);
        return JSON.stringify({ symbol, price });
      }

      case "get_stock_support_resistance": {
        const { symbol, timeframe } = input as { symbol: string; timeframe: Timeframe };
        if (!isKnownSymbol(symbol)) return JSON.stringify({ error: `unknown symbol ${symbol}` });
        let candles = await getCandles(env.DB, symbol, timeframe, 150);
        if (candles.length === 0) {
          candles = await yahoo.fetchTimeSeries(symbol, timeframe);
          await upsertCandles(env.DB, symbol, timeframe, candles);
        }
        const previousDayCandle = await getPreviousDayCandle(env, symbol);
        const currentPrice = await yahoo.fetchLatestPrice(symbol);
        const levels = pickNearestLevels(buildSRLevels(candles, previousDayCandle, currentPrice), currentPrice);
        return JSON.stringify({ symbol, timeframe, currentPrice, levels });
      }

      case "get_latest_news": {
        const { limit } = (input as { limit?: number }) ?? {};
        const { results } = await env.DB.prepare(
          `SELECT source, title, summary, published_at, sentiment, impact FROM news ORDER BY published_at DESC LIMIT ?`
        )
          .bind(Math.min(limit ?? 10, 20))
          .all();
        return JSON.stringify({ items: results ?? [] });
      }

      case "get_stock_screener": {
        const rows = await buildScreener(env);
        return JSON.stringify({ items: rows });
      }

      default:
        return JSON.stringify({ error: `unknown tool ${name}` });
    }
  } catch (err) {
    // Return the failure AS a tool result so Claude can explain it to the
    // user naturally (e.g. "gold price isn't available yet") instead of
    // the whole chat turn erroring out.
    return JSON.stringify({ error: (err as Error).message });
  }
}
