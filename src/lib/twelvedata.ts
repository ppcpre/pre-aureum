import type { Candle, Env, Timeframe } from "../types";

const BASE_URL = "https://api.twelvedata.com";

// Twelve Data interval strings per our internal timeframe labels.
const INTERVAL: Record<Timeframe, string> = {
  M15: "15min",
  H1: "1h",
  H4: "4h",
  D1: "1day",
  W1: "1week",
};

interface QuoteResponse {
  price?: string;
  code?: number;
  message?: string;
}

interface TimeSeriesValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
}

interface TimeSeriesResponse {
  values?: TimeSeriesValue[];
  status?: string;
  code?: number;
  message?: string;
}

/** Fetch the current spot price for a symbol, e.g. "XAU/USD". */
export async function fetchLatestPrice(env: Env, symbol: string): Promise<number> {
  const url = `${BASE_URL}/price?symbol=${encodeURIComponent(symbol)}&apikey=${env.TWELVEDATA_API_KEY}`;
  const res = await fetch(url);
  const data = (await res.json()) as QuoteResponse;

  if (!data.price) {
    throw new Error(`Twelve Data quote error: ${data.message ?? "no price in response"}`);
  }
  return Number(data.price);
}

/** Fetch recent OHLC candles for a symbol + timeframe, oldest first. */
export async function fetchTimeSeries(
  env: Env,
  symbol: string,
  timeframe: Timeframe,
  outputsize = 100
): Promise<Candle[]> {
  const interval = INTERVAL[timeframe];
  const url =
    `${BASE_URL}/time_series?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${interval}&outputsize=${outputsize}&order=ASC&apikey=${env.TWELVEDATA_API_KEY}`;

  const res = await fetch(url);
  const data = (await res.json()) as TimeSeriesResponse;

  if (!data.values) {
    throw new Error(`Twelve Data time_series error: ${data.message ?? "no values in response"}`);
  }

  return data.values.map((v) => ({
    ts: Math.floor(new Date(v.datetime.replace(" ", "T") + "Z").getTime() / 1000),
    open: Number(v.open),
    high: Number(v.high),
    low: Number(v.low),
    close: Number(v.close),
    volume: v.volume ? Number(v.volume) : undefined,
  }));
}
