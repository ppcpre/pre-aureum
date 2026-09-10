import { Hono } from "hono";
import type { Env, Timeframe } from "../types";
import { getPreviousDayCandle } from "../lib/candles-db";
import { buildSRLevels, calculateRSI, pickNearestLevels } from "../lib/sr-engine";
import { GOLD_CANDLE_COUNT, getCachedGoldPrice, getGoldCandles } from "../lib/gold-refresh";

export const srRoute = new Hono<{ Bindings: Env }>();

const GOLD_SYMBOL = "XAU/USD";

// GET /api/sr/gold?tf=H4 — support/resistance levels for one timeframe.
srRoute.get("/gold", async (c) => {
  const tf = (c.req.query("tf") ?? "H4") as Timeframe;

  try {
    const candles = await getGoldCandles(c.env, tf, GOLD_CANDLE_COUNT);

    // Pivot points always need the daily candle regardless of which timeframe
    // is being viewed — keep it topped up too (no-op if tf itself is "D1").
    // Best-effort: this is a side channel for pivot calc, not what the caller
    // actually asked to view, so a failure here shouldn't 502 the whole request.
    if (tf !== "D1") {
      try {
        await getGoldCandles(c.env, "D1", GOLD_CANDLE_COUNT);
      } catch (err) {
        console.error("[sr] D1 top-up failed:", err);
      }
    }

    const previousDayCandle = await getPreviousDayCandle(c.env, GOLD_SYMBOL);
    const { price: currentPrice } = await getCachedGoldPrice(c.env);
    const levels = pickNearestLevels(buildSRLevels(candles, previousDayCandle, currentPrice), currentPrice);
    const rsi = calculateRSI(candles);

    return c.json({ symbol: GOLD_SYMBOL, timeframe: tf, currentPrice, levels, rsi: rsi !== undefined ? Math.round(rsi * 10) / 10 : null });
  } catch (err) {
    return c.json({ error: "upstream_fetch_failed", message: (err as Error).message }, 502);
  }
});
