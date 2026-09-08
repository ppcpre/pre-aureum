import { Hono } from "hono";
import type { Env, Timeframe } from "../types";
import { fetchTimeSeries } from "../lib/twelvedata";
import { getCandles, upsertCandles } from "../lib/candles-db";
import { getCachedGoldPrice, refreshGoldTail } from "../lib/gold-refresh";

export const priceRoute = new Hono<{ Bindings: Env }>();

const GOLD_SYMBOL = "XAU/USD";

// GET /api/price/gold — latest spot price (cached, see lib/gold-refresh.ts).
priceRoute.get("/gold", async (c) => {
  try {
    return c.json(await getCachedGoldPrice(c.env));
  } catch (err) {
    return c.json({ error: "upstream_fetch_failed", message: (err as Error).message }, 502);
  }
});

// GET /api/price/gold/history?tf=H4 — OHLC candles for one timeframe.
priceRoute.get("/gold/history", async (c) => {
  const tf = (c.req.query("tf") ?? "H4") as Timeframe;

  let candles = await getCandles(c.env.DB, GOLD_SYMBOL, tf, 100);
  if (candles.length === 0) {
    try {
      // Nothing stored yet for this timeframe — backfill the full range once.
      candles = await fetchTimeSeries(c.env, GOLD_SYMBOL, tf, 100);
      await upsertCandles(c.env.DB, GOLD_SYMBOL, tf, candles);
    } catch (err) {
      return c.json({ error: "upstream_fetch_failed", message: (err as Error).message }, 502);
    }
  } else {
    // Already have history — top up just the last few candles (throttled per
    // timeframe, see gold-refresh.ts) instead of a standing cron, so the
    // chart only makes a live API call when someone is actually viewing it.
    await refreshGoldTail(c.env, tf);
    candles = await getCandles(c.env.DB, GOLD_SYMBOL, tf, 100);
  }

  return c.json({ symbol: GOLD_SYMBOL, timeframe: tf, candles });
});
