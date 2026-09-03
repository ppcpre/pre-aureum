import { Hono } from "hono";
import type { Env, Timeframe } from "../types";
import { getJSON, putJSON } from "../lib/kv-cache";
import { fetchLatestPrice, fetchTimeSeries } from "../lib/twelvedata";
import { getCandles, upsertCandles } from "../lib/candles-db";

export const priceRoute = new Hono<{ Bindings: Env }>();

const GOLD_SYMBOL = "XAU/USD";
const LATEST_PRICE_KEY = "price:XAU_USD:latest";
const LATEST_PRICE_TTL_SECONDS = 90; // a bit more than the 5-min poll interval's margin

// GET /api/price/gold — latest spot price, served from KV cache.
priceRoute.get("/gold", async (c) => {
  const cached = await getJSON<{ price: number; ts: number }>(c.env.CACHE, LATEST_PRICE_KEY);
  if (cached) return c.json(cached);

  // Cache miss (e.g. first request before the cron has run yet) — fetch live.
  const price = await fetchLatestPrice(c.env, GOLD_SYMBOL);
  const payload = { price, ts: Math.floor(Date.now() / 1000) };
  await putJSON(c.env.CACHE, LATEST_PRICE_KEY, payload, LATEST_PRICE_TTL_SECONDS);
  return c.json(payload);
});

// GET /api/price/gold/history?tf=H4 — OHLC candles for one timeframe.
priceRoute.get("/gold/history", async (c) => {
  const tf = (c.req.query("tf") ?? "H4") as Timeframe;

  let candles = await getCandles(c.env.DB, GOLD_SYMBOL, tf, 100);
  if (candles.length === 0) {
    // Nothing stored yet for this timeframe — backfill once from Twelve Data.
    candles = await fetchTimeSeries(c.env, GOLD_SYMBOL, tf, 100);
    await upsertCandles(c.env.DB, GOLD_SYMBOL, tf, candles);
  }

  return c.json({ symbol: GOLD_SYMBOL, timeframe: tf, candles });
});
