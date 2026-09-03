import { Hono } from "hono";
import type { Env } from "./types";
import { priceRoute } from "./routes/price";
import { srRoute } from "./routes/sr";
import { fetchLatestPrice, fetchTimeSeries } from "./lib/twelvedata";
import { putJSON } from "./lib/kv-cache";
import { upsertCandles } from "./lib/candles-db";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true, env: c.env.ENVIRONMENT }));

app.route("/api/price", priceRoute);
app.route("/api/sr", srRoute);

// Anything that isn't an API route falls through to the static frontend.
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

const GOLD_SYMBOL = "XAU/USD";
const LATEST_PRICE_KEY = "price:XAU_USD:latest";

/**
 * Day Trade Mode: runs every 5 minutes (see wrangler.jsonc `triggers.crons`).
 * Refreshes the latest-price cache and appends the current H4/D1 candles.
 * Scalp Mode (10-15s polling) is intentionally not wired up yet — see README
 * for why (free-tier Twelve Data quota needs validating first).
 */
async function pollGoldPrice(env: Env): Promise<void> {
  const price = await fetchLatestPrice(env, GOLD_SYMBOL);
  await putJSON(env.CACHE, LATEST_PRICE_KEY, { price, ts: Math.floor(Date.now() / 1000) }, 90);

  for (const tf of ["H4", "D1"] as const) {
    const candles = await fetchTimeSeries(env, GOLD_SYMBOL, tf, 5);
    await upsertCandles(env.DB, GOLD_SYMBOL, tf, candles);
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(pollGoldPrice(env));
  },
} satisfies ExportedHandler<Env>;
