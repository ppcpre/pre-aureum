import type { Env, Timeframe } from "../types";
import { fetchLatestPrice, fetchTimeSeries } from "./twelvedata";
import { upsertCandles } from "./candles-db";
import { getJSON, putJSON } from "./kv-cache";

const GOLD_SYMBOL = "XAU/USD";
const LATEST_PRICE_KEY = "price:XAU_USD:latest";
// No standing cron keeps this warm anymore (removed 2026-09-08 — gold price is
// only ever fetched on demand now) — this TTL is what actually paces live
// Twelve Data calls while someone has a page open.
const LATEST_PRICE_TTL_SECONDS = 90;

/**
 * Shared by routes/price.ts and routes/sr.ts so both read the same cached
 * spot price instead of each doing their own live fetch. Returns `ts` as
 * when the price was actually fetched (not "now") — the frontend shows this
 * as "อัปเดตล่าสุด", so it has to reflect real staleness, not request time.
 */
export async function getCachedGoldPrice(env: Env): Promise<{ price: number; ts: number }> {
  const cached = await getJSON<{ price: number; ts: number }>(env.CACHE, LATEST_PRICE_KEY);
  if (cached) return cached;

  const price = await fetchLatestPrice(env, GOLD_SYMBOL);
  const payload = { price, ts: Math.floor(Date.now() / 1000) };
  await putJSON(env.CACHE, LATEST_PRICE_KEY, payload, LATEST_PRICE_TTL_SECONDS);
  return payload;
}

// How long a tail-refresh "counts" before the next request is allowed to
// trigger another live Twelve Data call for that timeframe. Not a data
// freshness guarantee (D1 could be older if refreshes keep failing) — just
// a cap on API usage so opening the same page twice in five seconds, or two
// tabs open at once, doesn't double the call volume.
const REFRESH_COOLDOWN_SECONDS = 240;

/**
 * Tops up the last few candles for one gold timeframe from Twelve Data —
 * called on-demand from the price/history/S-R routes instead of a standing
 * cron (removed 2026-09-08: "ไม่ต้องดึงตลอดเวลา ค่อยดึงตอนที่เปิด web app"),
 * so a live API call only happens when someone is actually using the app.
 * Throttled per-timeframe via a short KV cooldown (see above) rather than
 * on every single request. Best-effort: a failure here (e.g. API key not
 * set, or Twelve Data hiccup) never breaks the page — callers just fall
 * back to whatever candles are already in D1.
 */
export async function refreshGoldTail(env: Env, tf: Timeframe): Promise<void> {
  const cooldownKey = `gold-refresh:${tf}`;
  const onCooldown = await env.CACHE.get(cooldownKey);
  if (onCooldown) return;
  await env.CACHE.put(cooldownKey, "1", { expirationTtl: REFRESH_COOLDOWN_SECONDS });

  try {
    const candles = await fetchTimeSeries(env, GOLD_SYMBOL, tf, 5);
    await upsertCandles(env.DB, GOLD_SYMBOL, tf, candles);
  } catch (err) {
    console.error(`[gold-refresh] failed for ${tf}:`, err);
  }
}
