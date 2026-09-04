import type { Env } from "../types";
import { getJSON, putJSON } from "./kv-cache";
import { fetchLatestPrice } from "./yahoo-finance";

const PRICE_TTL_SECONDS = 240; // a bit under the hourly cron refresh — see index.ts

/**
 * KV-cached Thai stock quote — shared by the REST routes, the screener, and
 * the chat tools so none of them hit Yahoo Finance directly on every call.
 * Matters a lot more now that the watchlist is full SET50 (50 symbols):
 * without this, a single screener page load or chat tool call could fire 50
 * live requests against an unofficial, rate-limit-prone endpoint.
 */
export async function getStockPrice(env: Env, symbol: string): Promise<{ price: number; ts: number }> {
  const key = `price:stock:${symbol}:latest`;
  const cached = await getJSON<{ price: number; ts: number }>(env.CACHE, key);
  if (cached) return cached;

  const price = await fetchLatestPrice(symbol);
  const payload = { price, ts: Math.floor(Date.now() / 1000) };
  await putJSON(env.CACHE, key, payload, PRICE_TTL_SECONDS);
  return payload;
}
