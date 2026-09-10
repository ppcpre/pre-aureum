import type { Candle, Env, Timeframe } from "../types";
import { fetchLatestPrice, fetchTimeSeries } from "./twelvedata";
import { getCandles, upsertCandles } from "./candles-db";
import { getJSON, putJSON } from "./kv-cache";

const GOLD_SYMBOL = "XAU/USD";
const LATEST_PRICE_KEY = "price:XAU_USD:latest";
// No standing cron keeps this warm anymore (removed 2026-09-08 — gold price is
// only ever fetched on demand now) — this TTL is what actually paces live
// Twelve Data calls while someone has a page open.
//
// ⚠️ Raised from 90s to 300s on 2026-09-08, same day, after the original
// value (combined with refreshGoldTail's original 240s) burned through
// Twelve Data's free 800-credit/day quota within hours of going live (hit
// "1301 API credits used" mid-afternoon — confirmed via the API's own error
// response, not a guess). Every failed over-quota request still appears to
// count against the daily total, so this isn't just about steady-state
// pacing — a tight cooldown here directly shortens how long 800 credits
// lasts once traffic (or repeated testing) is frequent.
const LATEST_PRICE_TTL_SECONDS = 300;

// Not just a "cache successes" TTL — also how long a FAILED fetch backs off
// before the next caller is allowed to retry live. Short (60s) so it still
// recovers quickly once the real problem (quota, network, whatever) clears.
//
// ⚠️ Added 2026-09-09 after finding this gap in the Cloudflare request log:
// getCachedGoldPrice originally only cached on success, so a failure was
// retried live on EVERY call — the frontend's 60s auto-poll (a page just
// left open) meant a fresh Twelve Data call, and a fresh error, every single
// minute all day during Twelve Data's quota outage, instead of backing off
// after the first failure. See withFailureBackoff below.
const FAILURE_COOLDOWN_SECONDS = 60;

/**
 * Wraps a live fetch with a KV cooldown that's set on FAILURE, not just
 * success — mirrors refreshGoldTail's cooldown-before-attempting pattern
 * below, generalized so getCachedGoldPrice and the cold-start candle
 * backfills in routes/price.ts and routes/sr.ts all back off the same way
 * instead of each caller retrying live during an outage. Re-throws the
 * original error after recording the cooldown, so callers keep their
 * normal try/catch → 502 handling.
 */
async function withFailureBackoff<T>(env: Env, cooldownKey: string, fn: () => Promise<T>): Promise<T> {
  if (await env.CACHE.get(cooldownKey)) {
    throw new Error("Temporarily unavailable — a recent fetch failed, backing off before retrying");
  }
  try {
    return await fn();
  } catch (err) {
    await env.CACHE.put(cooldownKey, "1", { expirationTtl: FAILURE_COOLDOWN_SECONDS });
    throw err;
  }
}

/**
 * Shared by routes/price.ts and routes/sr.ts so both read the same cached
 * spot price instead of each doing their own live fetch. Returns `ts` as
 * when the price was actually fetched (not "now") — the frontend shows this
 * as "อัปเดตล่าสุด", so it has to reflect real staleness, not request time.
 */
export async function getCachedGoldPrice(env: Env): Promise<{ price: number; ts: number }> {
  const cached = await getJSON<{ price: number; ts: number }>(env.CACHE, LATEST_PRICE_KEY);
  if (cached) return cached;

  return withFailureBackoff(env, `${LATEST_PRICE_KEY}:failure-cooldown`, async () => {
    const price = await fetchLatestPrice(env, GOLD_SYMBOL);
    const payload = { price, ts: Math.floor(Date.now() / 1000) };
    await putJSON(env.CACHE, LATEST_PRICE_KEY, payload, LATEST_PRICE_TTL_SECONDS);
    return payload;
  });
}

/**
 * One-time full-range backfill for a timeframe that has no candles in D1
 * yet — used by routes/price.ts and routes/sr.ts. Goes through the same
 * failure backoff as getCachedGoldPrice: without it, an empty D1 table plus
 * a failing Twelve Data call meant every single request re-attempted the
 * full backfill live, uncached, with no cooldown at all.
 */
export async function backfillGoldCandles(env: Env, tf: Timeframe, outputsize: number) {
  return withFailureBackoff(env, `gold-backfill:${tf}:failure-cooldown`, async () => {
    const candles = await fetchTimeSeries(env, GOLD_SYMBOL, tf, outputsize);
    await upsertCandles(env.DB, GOLD_SYMBOL, tf, candles);
    return candles;
  });
}

// How long a tail-refresh "counts" before the next request is allowed to
// trigger another live Twelve Data call for that timeframe. Not a data
// freshness guarantee (D1 could be older if refreshes keep failing) — just
// a cap on API usage so opening the same page twice in five seconds, or two
// tabs open at once, doesn't double the call volume.
//
// ⚠️ Raised from 240s to 1800s (30 min) on 2026-09-08 — see the note on
// LATEST_PRICE_TTL_SECONDS above. routes/sr.ts calls this for BOTH the
// viewed timeframe AND (separately) "D1" on every non-D1 view, so with 5
// timeframes this was up to 6 independent cooldown buckets each capable of
// firing every 240s — that adds up fast against a 800/day budget. 30 min
// per bucket keeps worst-case usage well under budget even with someone
// actively clicking through every timeframe.
const REFRESH_COOLDOWN_SECONDS = 1800;

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

// Below this, a timeframe's D1 row count can never grow past what
// refreshGoldTail's 5-candle tail-refresh adds — used to tell "cold start,
// needs a real backfill" apart from "already has history, just top up".
//
// ⚠️ Added 2026-09-09 after finding gold's own D1 (daily) timeframe stuck at
// just 8 rows in production despite being live for days: every caller's
// `candles.length === 0 ? backfill : tail-refresh` check (price.ts, sr.ts,
// gold-signal.ts, trend-analysis.ts — 4 separate copies of the same logic)
// only ever backfilled on a TRULY empty table. D1 had picked up a handful of
// rows early on (before this pattern existed) and then never qualified for
// "empty" again — refreshGoldTail kept it topped up 5 rows at a time,
// forever, but nothing ever fetched the deeper history. Centralizing the
// check here (instead of a 5th copy) fixes it once for every caller.
// How many candles S/R + signal callers should request. Needs to clear 200
// so calculateEMA(candles, 200) — EMA200, the "trend" leg of both the Zone
// Finder bias score and the multi-timeframe buy/sell signal — can actually
// produce a value instead of always failing that leg and capping every
// signal at ~67/100 (added slack to 210, added 2026-09-09 per user request:
// "ทำ EMA200").
export const GOLD_CANDLE_COUNT = 210;

// ⚠️ Set to 200 (not some smaller "good enough" number like the original 50)
// specifically so a timeframe already sitting at exactly the OLD healthy
// level (150, from before GOLD_CANDLE_COUNT existed) still re-qualifies for
// one more real backfill up to 210 — otherwise every already-populated
// timeframe would stay capped at 150 forever (still short of the 200 EMA200
// needs) since the tail-refresh path only ever adds 5 candles at a time and
// never re-backfills once a timeframe is judged "healthy".
const MIN_HEALTHY_CANDLES = 200;

/**
 * The one function gold routes should call for "give me up to `count`
 * candles for this timeframe, refreshed as needed" — replaces each route's
 * own copy of the cold-start-backfill-vs-tail-refresh branch above.
 */
export async function getGoldCandles(env: Env, tf: Timeframe, count: number): Promise<Candle[]> {
  const candles = await getCandles(env.DB, GOLD_SYMBOL, tf, count);

  if (candles.length < MIN_HEALTHY_CANDLES) {
    try {
      return await backfillGoldCandles(env, tf, count);
    } catch (err) {
      // Nothing at all to fall back to — let the caller's existing
      // try/catch → 502 handle it, same as before this was centralized.
      if (candles.length === 0) throw err;
      // Already had *some* candles (just not enough) — degrade to those
      // rather than erroring, matching refreshGoldTail's best-effort
      // philosophy elsewhere in this file.
      console.error(`[gold-refresh] backfill failed for ${tf}, falling back to ${candles.length} existing candle(s):`, err);
      return candles;
    }
  }

  await refreshGoldTail(env, tf);
  return getCandles(env.DB, GOLD_SYMBOL, tf, count);
}
