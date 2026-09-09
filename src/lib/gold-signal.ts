import type { Env, Timeframe } from "../types";
import { getCandles, getPreviousDayCandle } from "./candles-db";
import { buildSRLevels, calculateEMA } from "./sr-engine";
import { backfillGoldCandles, getCachedGoldPrice, refreshGoldTail } from "./gold-refresh";

const GOLD_SYMBOL = "XAU/USD";
const ALL_TIMEFRAMES: Timeframe[] = ["M15", "H1", "H4", "D1", "W1"];

export type SignalLabel = "buy" | "sell" | "hold";

export interface TimeframeSignal {
  tf: Timeframe;
  signal: SignalLabel;
  score: number; // 0-100
}

/**
 * Same 3-factor scoring already used (and tested) by zone-finder.ts's
 * "Bias" — reused as-is, not reinvented, just computed per-timeframe and
 * relabeled buy/sell/hold instead of bullish/bearish/neutral: price holding
 * above the nearest support, EMA50 above EMA200 (trend), and enough room
 * before the nearest resistance. Each worth ~33.3 points; >=67 = buy,
 * <=33 = sell, otherwise hold.
 *
 * Reads candles from D1 (with the same on-demand refresh + failure-backoff
 * as the rest of the gold routes — see gold-refresh.ts) rather than ever
 * fetching Twelve Data directly here, so scoring 5 timeframes at once still
 * only costs at most 5 throttled tail-refreshes, not 5 uncached live calls.
 */
async function computeOneTimeframe(env: Env, tf: Timeframe, currentPrice: number): Promise<TimeframeSignal> {
  let candles = await getCandles(env.DB, GOLD_SYMBOL, tf, 150);
  if (candles.length === 0) {
    try {
      candles = await backfillGoldCandles(env, tf, 150);
    } catch {
      candles = [];
    }
  } else {
    await refreshGoldTail(env, tf);
    candles = await getCandles(env.DB, GOLD_SYMBOL, tf, 150);
  }

  const previousDayCandle = await getPreviousDayCandle(env, GOLD_SYMBOL);
  const levels = candles.length > 0 ? buildSRLevels(candles, previousDayCandle, currentPrice) : [];

  const nearestSupport = levels.filter((l) => l.type === "support").sort((a, b) => b.price - a.price)[0];
  const nearestResistance = levels.filter((l) => l.type === "resistance").sort((a, b) => a.price - b.price)[0];
  const ema50 = calculateEMA(candles, 50);
  const ema200 = calculateEMA(candles, 200);
  const trendUp = ema50 !== undefined && ema200 !== undefined ? ema50 > ema200 : undefined;

  const perItem = 100 / 3;
  let score = 0;
  if (nearestSupport && currentPrice >= nearestSupport.price) score += perItem;
  if (trendUp) score += perItem;
  if (nearestResistance && ((nearestResistance.price - currentPrice) / currentPrice) * 100 > 0.3) score += perItem;

  const rounded = Math.round(score);
  const signal: SignalLabel = rounded >= 67 ? "buy" : rounded <= 33 ? "sell" : "hold";

  return { tf, signal, score: rounded };
}

/** All 5 timeframes at once — one shared current price (already cached, see gold-refresh.ts). */
export async function computeGoldSignals(env: Env): Promise<TimeframeSignal[]> {
  const { price: currentPrice } = await getCachedGoldPrice(env);

  // D1 backs pivot points for every timeframe's score (same convention as
  // routes/sr.ts) — top it up once up front instead of once per timeframe.
  await refreshGoldTail(env, "D1");

  return Promise.all(ALL_TIMEFRAMES.map((tf) => computeOneTimeframe(env, tf, currentPrice)));
}
