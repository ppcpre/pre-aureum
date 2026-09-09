import { Hono } from "hono";
import type { Env, Timeframe } from "../types";
import { getCachedGoldPrice, getGoldCandles } from "../lib/gold-refresh";

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

  let candles;
  try {
    candles = await getGoldCandles(c.env, tf, 100);
  } catch (err) {
    return c.json({ error: "upstream_fetch_failed", message: (err as Error).message }, 502);
  }

  return c.json({ symbol: GOLD_SYMBOL, timeframe: tf, candles });
});
