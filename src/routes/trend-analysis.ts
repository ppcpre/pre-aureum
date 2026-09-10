import { Hono } from "hono";
import type { Env, Timeframe } from "../types";
import { GOLD_CANDLE_COUNT, getGoldCandles } from "../lib/gold-refresh";
import { computeTrendAnalysis } from "../lib/trend-analysis";

export const trendAnalysisRoute = new Hono<{ Bindings: Env }>();

const GOLD_SYMBOL = "XAU/USD";

// GET /api/trend-analysis/gold?tf=W1 — candles + RSI series + auto-fitted
// price/RSI trend channels + RSI=50 crossings + divergence, for the
// "RSI & แนวรับแนวต้าน" page. Same on-demand cache/cooldown as every other
// gold route (see gold-refresh.ts) — no direct Twelve Data calls here.
trendAnalysisRoute.get("/gold", async (c) => {
  const tf = (c.req.query("tf") ?? "W1") as Timeframe;

  try {
    const candles = await getGoldCandles(c.env, tf, GOLD_CANDLE_COUNT);
    const analysis = computeTrendAnalysis(candles);

    return c.json({ symbol: GOLD_SYMBOL, timeframe: tf, candles, ...analysis });
  } catch (err) {
    return c.json({ error: "upstream_fetch_failed", message: (err as Error).message }, 502);
  }
});
