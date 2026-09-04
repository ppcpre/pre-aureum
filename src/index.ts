import { Hono } from "hono";
import type { Env } from "./types";
import { priceRoute } from "./routes/price";
import { srRoute } from "./routes/sr";
import { newsRoute } from "./routes/news";
import { adminRoute } from "./routes/admin";
import { stockRoute, stockSrRoute } from "./routes/stock";
import { screenerRoute } from "./routes/screener";
import { chatRoute } from "./routes/chat";
import { dashboardSummaryRoute } from "./routes/dashboard-summary";
import { fetchLatestPrice, fetchTimeSeries } from "./lib/twelvedata";
import * as yahoo from "./lib/yahoo-finance";
import { putJSON } from "./lib/kv-cache";
import { upsertCandles } from "./lib/candles-db";
import { analyzePendingSentiment, pollNews } from "./lib/news-poll";
import { STOCK_WATCHLIST } from "./lib/stock-symbols";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true, env: c.env.ENVIRONMENT }));

app.route("/api/price", priceRoute);
app.route("/api/sr", srRoute);
app.route("/api/news", newsRoute);
app.route("/api/admin", adminRoute);
app.route("/api/price/stock", stockRoute);
app.route("/api/sr/stock", stockSrRoute);
app.route("/api/screener", screenerRoute);
app.route("/api/admin/chat", chatRoute);
app.route("/api/dashboard-summary", dashboardSummaryRoute);

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
  try {
    const price = await fetchLatestPrice(env, GOLD_SYMBOL);
    await putJSON(env.CACHE, LATEST_PRICE_KEY, { price, ts: Math.floor(Date.now() / 1000) }, 90);

    for (const tf of ["H4", "D1"] as const) {
      const candles = await fetchTimeSeries(env, GOLD_SYMBOL, tf, 5);
      await upsertCandles(env.DB, GOLD_SYMBOL, tf, candles);
    }
  } catch (err) {
    // Expected to fail until TWELVEDATA_API_KEY is set — don't let it block pollNews().
    console.error("[cron] pollGoldPrice failed:", err);
  }
}

/**
 * Yahoo Finance (unofficial, .BK tickers) — accuracy-testing phase of M6.
 * Runs HOURLY (its own cron entry, "0 * * * *" — see wrangler.jsonc).
 *
 * Two real constraints shape this function, both found by testing against
 * production limits rather than assumed:
 *
 * 1. Cloudflare Workers caps a single invocation at 50 subrequests on the
 *    Free plan. The watchlist is the full SET50 (50 symbols) — fetching
 *    price + history for all of them in one run would need up to 100
 *    external requests and simply fail partway through. So this only
 *    processes a BATCH per run (rotating cursor stored in KV), cycling
 *    through the whole watchlist over several hours instead of all at once.
 * 2. Yahoo Finance is unofficial and rate-limit-prone (see lib/yahoo-
 *    finance.ts) — on top of the subrequest cap, spreading requests out
 *    over time is also just being a better citizen of an endpoint with no
 *    contracted rate limit.
 *
 * Only fetches D1 (daily) history here — that's what the screener and the
 * default dashboard view need. Other timeframes (H4, M15, ...) still fill
 * in lazily, one live fetch at a time, the first time a page actually asks
 * for them (see routes/stock.ts) — that path is a single symbol, nowhere
 * near the subrequest cap.
 */
const STOCK_BATCH_SIZE = 15; // 15 symbols × 2 fetches (price + D1) = 30 subrequests, well under the 50 cap
const STOCK_BATCH_CURSOR_KEY = "stock-poll:cursor";

async function pollStockPrices(env: Env): Promise<void> {
  const cursor = Number((await env.CACHE.get(STOCK_BATCH_CURSOR_KEY)) ?? "0") || 0;
  const batch = STOCK_WATCHLIST.slice(cursor, cursor + STOCK_BATCH_SIZE);
  const nextCursor = cursor + STOCK_BATCH_SIZE >= STOCK_WATCHLIST.length ? 0 : cursor + STOCK_BATCH_SIZE;
  await env.CACHE.put(STOCK_BATCH_CURSOR_KEY, String(nextCursor));

  for (const { symbol } of batch) {
    try {
      const price = await yahoo.fetchLatestPrice(symbol);
      await putJSON(env.CACHE, `price:stock:${symbol}:latest`, { price, ts: Math.floor(Date.now() / 1000) }, 240);

      const candles = await yahoo.fetchTimeSeries(symbol, "D1");
      await upsertCandles(env.DB, symbol, "D1", candles);
    } catch (err) {
      console.error(`[cron] pollStockPrices failed for ${symbol}:`, err);
    }
  }
}

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    const tasks: Promise<unknown>[] = [];

    // "*/5 * * * *" — gold + news, cheap (1 symbol, a handful of RSS feeds).
    if (event.cron === "*/5 * * * *") {
      tasks.push(pollGoldPrice(env), pollNews(env).then(() => analyzePendingSentiment(env)));
    }

    // "0 * * * *" — Thai stocks, hourly (see pollStockPrices() for why not 5-min).
    if (event.cron === "0 * * * *") {
      tasks.push(pollStockPrices(env));
    }

    ctx.waitUntil(Promise.allSettled(tasks));
  },
} satisfies ExportedHandler<Env>;
