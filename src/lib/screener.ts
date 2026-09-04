import type { Env } from "../types";
import { fetchLatestPrice, fetchTimeSeries } from "./yahoo-finance";
import { getCandles, getPreviousDayCandle, upsertCandles } from "./candles-db";
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

export async function buildScreener(env: Env): Promise<ScreenerRow[]> {
  const rows: ScreenerRow[] = [];

  for (const { symbol, name } of STOCK_WATCHLIST) {
    try {
      let candles = await getCandles(env.DB, symbol, "D1", 30);
      if (candles.length === 0) {
        candles = await fetchTimeSeries(symbol, "D1");
        await upsertCandles(env.DB, symbol, "D1", candles);
      }

      const currentPrice = await fetchLatestPrice(symbol);
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
