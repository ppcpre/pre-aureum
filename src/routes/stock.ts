import { Hono } from "hono";
import type { Env, Timeframe } from "../types";
import { getJSON, putJSON } from "../lib/kv-cache";
import { fetchLatestPrice, fetchTimeSeries } from "../lib/yahoo-finance";
import { getCandles, getPreviousDayCandle, upsertCandles } from "../lib/candles-db";
import { buildSRLevels, pickNearestLevels } from "../lib/sr-engine";
import { isKnownSymbol, STOCK_WATCHLIST } from "../lib/stock-symbols";

export const stockRoute = new Hono<{ Bindings: Env }>();

const PRICE_TTL_SECONDS = 240; // a bit under the 5-min poll interval

// GET /api/price/stock — the curated watchlist, so pages can list them.
stockRoute.get("/", (c) => c.json({ items: STOCK_WATCHLIST }));

// GET /api/price/stock/:symbol — latest price, served from KV cache.
stockRoute.get("/:symbol", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  if (!isKnownSymbol(symbol)) return c.json({ error: "unknown_symbol" }, 404);

  const key = `price:stock:${symbol}:latest`;
  const cached = await getJSON<{ price: number; ts: number }>(c.env.CACHE, key);
  if (cached) return c.json(cached);

  try {
    const price = await fetchLatestPrice(symbol);
    const payload = { price, ts: Math.floor(Date.now() / 1000) };
    await putJSON(c.env.CACHE, key, payload, PRICE_TTL_SECONDS);
    return c.json(payload);
  } catch (err) {
    return c.json({ error: "upstream_fetch_failed", message: (err as Error).message }, 502);
  }
});

// GET /api/price/stock/:symbol/history?tf=D1
stockRoute.get("/:symbol/history", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  if (!isKnownSymbol(symbol)) return c.json({ error: "unknown_symbol" }, 404);
  const tf = (c.req.query("tf") ?? "D1") as Timeframe;

  let candles = await getCandles(c.env.DB, symbol, tf, 100);
  if (candles.length === 0) {
    try {
      candles = await fetchTimeSeries(symbol, tf);
      await upsertCandles(c.env.DB, symbol, tf, candles);
    } catch (err) {
      return c.json({ error: "upstream_fetch_failed", message: (err as Error).message }, 502);
    }
  }
  return c.json({ symbol, timeframe: tf, candles });
});

// GET /api/sr/stock/:symbol?tf=D1
export const stockSrRoute = new Hono<{ Bindings: Env }>();
stockSrRoute.get("/:symbol", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  if (!isKnownSymbol(symbol)) return c.json({ error: "unknown_symbol" }, 404);
  const tf = (c.req.query("tf") ?? "D1") as Timeframe;

  try {
    let candles = await getCandles(c.env.DB, symbol, tf, 150);
    if (candles.length === 0) {
      candles = await fetchTimeSeries(symbol, tf);
      await upsertCandles(c.env.DB, symbol, tf, candles);
    }

    const previousDayCandle = await getPreviousDayCandle(c.env, symbol);
    const currentPrice = await fetchLatestPrice(symbol);
    const levels = pickNearestLevels(buildSRLevels(candles, previousDayCandle, currentPrice), currentPrice);

    return c.json({ symbol, timeframe: tf, currentPrice, levels });
  } catch (err) {
    return c.json({ error: "upstream_fetch_failed", message: (err as Error).message }, 502);
  }
});
