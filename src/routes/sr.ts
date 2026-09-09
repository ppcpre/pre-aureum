import { Hono } from "hono";
import type { Env, Timeframe } from "../types";
import { getCandles, getPreviousDayCandle } from "../lib/candles-db";
import { buildSRLevels, calculateRSI, pickNearestLevels } from "../lib/sr-engine";
import { backfillGoldCandles, getCachedGoldPrice, refreshGoldTail } from "../lib/gold-refresh";

export const srRoute = new Hono<{ Bindings: Env }>();

const GOLD_SYMBOL = "XAU/USD";

// GET /api/sr/gold?tf=H4 — support/resistance levels for one timeframe.
srRoute.get("/gold", async (c) => {
  const tf = (c.req.query("tf") ?? "H4") as Timeframe;

  try {
    let candles = await getCandles(c.env.DB, GOLD_SYMBOL, tf, 150);
    if (candles.length === 0) {
      candles = await backfillGoldCandles(c.env, tf, 150);
    } else {
      // On-demand top-up (throttled, see gold-refresh.ts) instead of a standing cron.
      await refreshGoldTail(c.env, tf);
      candles = await getCandles(c.env.DB, GOLD_SYMBOL, tf, 150);
    }

    // Pivot points always need the daily candle regardless of which timeframe
    // is being viewed — keep it topped up too (no-op if tf itself is "D1").
    if (tf !== "D1") await refreshGoldTail(c.env, "D1");

    const previousDayCandle = await getPreviousDayCandle(c.env, GOLD_SYMBOL);
    const { price: currentPrice } = await getCachedGoldPrice(c.env);
    const levels = pickNearestLevels(buildSRLevels(candles, previousDayCandle, currentPrice), currentPrice);
    const rsi = calculateRSI(candles);

    return c.json({ symbol: GOLD_SYMBOL, timeframe: tf, currentPrice, levels, rsi: rsi !== undefined ? Math.round(rsi * 10) / 10 : null });
  } catch (err) {
    return c.json({ error: "upstream_fetch_failed", message: (err as Error).message }, 502);
  }
});
