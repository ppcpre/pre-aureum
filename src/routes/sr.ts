import { Hono } from "hono";
import type { Env, Timeframe } from "../types";
import { fetchLatestPrice, fetchTimeSeries } from "../lib/twelvedata";
import { getCandles, getPreviousDayCandle, upsertCandles } from "../lib/candles-db";
import { buildSRLevels, pickNearestLevels } from "../lib/sr-engine";

export const srRoute = new Hono<{ Bindings: Env }>();

const GOLD_SYMBOL = "XAU/USD";

// GET /api/sr/gold?tf=H4 — support/resistance levels for one timeframe.
srRoute.get("/gold", async (c) => {
  const tf = (c.req.query("tf") ?? "H4") as Timeframe;

  try {
    let candles = await getCandles(c.env.DB, GOLD_SYMBOL, tf, 150);
    if (candles.length === 0) {
      candles = await fetchTimeSeries(c.env, GOLD_SYMBOL, tf, 150);
      await upsertCandles(c.env.DB, GOLD_SYMBOL, tf, candles);
    }

    const previousDayCandle = await getPreviousDayCandle(c.env, GOLD_SYMBOL);
    const currentPrice = await fetchLatestPrice(c.env, GOLD_SYMBOL);
    const levels = pickNearestLevels(buildSRLevels(candles, previousDayCandle, currentPrice), currentPrice);

    return c.json({ symbol: GOLD_SYMBOL, timeframe: tf, currentPrice, levels });
  } catch (err) {
    return c.json({ error: "upstream_fetch_failed", message: (err as Error).message }, 502);
  }
});
