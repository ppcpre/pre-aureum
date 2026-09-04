import type { Env } from "../types";
import { getCandles, getPreviousDayCandle } from "./candles-db";
import { buildSRLevels, pickNearestLevels } from "./sr-engine";
import { STOCK_WATCHLIST } from "./stock-symbols";

export type ScreenerSignal = "gainer" | "loser" | "near_support" | "breakout_resistance" | "normal";

export interface ScreenerRow {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  signal: ScreenerSignal;
  nearestSupport?: number;
  nearestResistance?: number;
}

function classifySignal(
  changePct: number,
  currentPrice: number,
  nearestSupport: number | undefined,
  priorTenDayHigh: number | undefined
): ScreenerSignal {
  if (changePct >= 3) return "gainer";
  if (changePct <= -3) return "loser";
  if (nearestSupport !== undefined && ((currentPrice - nearestSupport) / currentPrice) * 100 <= 0.5) {
    return "near_support";
  }
  if (priorTenDayHigh !== undefined && currentPrice > priorTenDayHigh) return "breakout_resistance";
  return "normal";
}

/**
 * Builds the screener from D1 ONLY — no live Yahoo Finance fetches, no KV
 * price-cache dependency either (that cache's 4-min TTL is tuned for a
 * single-symbol "live price right now" view, not for keeping 50 rows
 * populated). "Current price" here is the latest cached D1 daily close —
 * appropriate anyway for daily-granularity screening (24h change, near-
 * support) and it means a symbol shows up as soon as cron has ever reached
 * it, not just within the last few minutes.
 *
 * Why no live fetches at all: this loops the full SET50 watchlist (50
 * symbols). Cloudflare Workers caps a single invocation at 50 subrequests
 * on the Free plan — a live fetch per symbol would blow past that in one
 * request. The hourly cron (pollStockPrices in index.ts, its own separate
 * invocation with its own budget, processed in batches) is what actually
 * populates D1 — a symbol just doesn't appear here until cron has reached
 * it for the first time.
 */
export async function buildScreener(env: Env): Promise<ScreenerRow[]> {
  const rows: ScreenerRow[] = [];

  for (const { symbol, name } of STOCK_WATCHLIST) {
    try {
      const candles = await getCandles(env.DB, symbol, "D1", 30);
      if (candles.length === 0) continue; // cron hasn't reached this symbol yet

      const currentPrice = candles[candles.length - 1].close;
      const previousDayCandle = await getPreviousDayCandle(env, symbol);
      const changePct = previousDayCandle
        ? ((currentPrice - previousDayCandle.close) / previousDayCandle.close) * 100
        : 0;

      const levels = pickNearestLevels(buildSRLevels(candles, previousDayCandle, currentPrice), currentPrice);
      const nearestSupport = levels.filter((l) => l.type === "support").sort((a, b) => b.price - a.price)[0]?.price;
      const nearestResistance = levels
        .filter((l) => l.type === "resistance")
        .sort((a, b) => a.price - b.price)[0]?.price;

      const priorTenDayHigh = candles.length > 1 ? Math.max(...candles.slice(0, -1).slice(-10).map((c) => c.high)) : undefined;

      rows.push({
        symbol,
        name,
        price: currentPrice,
        changePct: Math.round(changePct * 100) / 100,
        signal: classifySignal(changePct, currentPrice, nearestSupport, priorTenDayHigh),
        nearestSupport,
        nearestResistance,
      });
    } catch (err) {
      console.error(`[screener] failed for ${symbol}:`, err);
    }
  }

  return rows;
}
