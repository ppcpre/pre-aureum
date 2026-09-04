import type { Candle, Timeframe } from "../types";

/**
 * Yahoo Finance's undocumented chart endpoint. Free, no signup, no key —
 * but it is NOT an official/contracted API: no SLA, no redistribution
 * license, can change or block requests without notice. This is also what
 * Thai retail devs commonly reach for (yfinance + ".BK" suffix) — confirmed
 * via research 2026-09-04, see README.
 *
 * ⚠️ Known reliability issue (reported since early 2024, still worth
 * re-checking): Yahoo's .BK (Thai) prices have shown anomalies for some
 * tickers — wrong prices, missing volume on some dates. Don't trust this
 * blindly; that's the whole point of the accuracy-testing phase we're in.
 *
 * Deliberately used here ONLY for that accuracy-testing phase of M6 (see
 * chat history + README). Before a real public launch, replace this with
 * a licensed source (Twelve Data Pro — SET needs their Pro plan — or
 * EODHD's commercial plan) or restrict Thai-stock pages to admin-only.
 */
const CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

// Yahoo has no native 4h interval — H4 candles are built by merging 4
// consecutive 1h candles fetched at "H1_SOURCE_INTERVAL".
const YAHOO_PARAMS: Record<Exclude<Timeframe, "H4">, { interval: string; range: string }> = {
  M15: { interval: "15m", range: "5d" },
  H1: { interval: "60m", range: "1mo" },
  D1: { interval: "1d", range: "6mo" },
  W1: { interval: "1wk", range: "2y" },
};
const H1_SOURCE_FOR_H4 = { interval: "60m", range: "3mo" };

interface YahooChartResponse {
  chart: {
    result?: [
      {
        timestamp: number[];
        indicators: {
          quote: [{ open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }];
        };
      },
    ];
    error?: { code: string; description: string } | null;
  };
}

/** Thai SET tickers use the ".BK" suffix on Yahoo, e.g. "PTT" -> "PTT.BK". */
export function toYahooSymbol(setSymbol: string): string {
  return `${setSymbol}.BK`;
}

async function fetchChart(yahooSymbol: string, interval: string, range: string): Promise<Candle[]> {
  const url = `${CHART_BASE_URL}/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AureumBot/0.1)" },
  });
  if (!res.ok) throw new Error(`Yahoo Finance fetch failed for ${yahooSymbol}: HTTP ${res.status}`);

  const data = (await res.json()) as YahooChartResponse;
  if (data.chart.error) throw new Error(`Yahoo Finance error for ${yahooSymbol}: ${data.chart.error.description}`);

  const result = data.chart.result?.[0];
  if (!result) throw new Error(`Yahoo Finance returned no data for ${yahooSymbol}`);

  const { timestamp, indicators } = result;
  const q = indicators.quote[0];

  const candles: Candle[] = [];
  for (let i = 0; i < timestamp.length; i++) {
    if (q.open[i] == null || q.high[i] == null || q.low[i] == null || q.close[i] == null) continue; // non-trading gap
    candles.push({
      ts: timestamp[i],
      open: q.open[i]!,
      high: q.high[i]!,
      low: q.low[i]!,
      close: q.close[i]!,
      volume: q.volume[i] ?? undefined,
    });
  }
  return candles;
}

/** Merge N consecutive source candles into one, one output candle per N input candles. */
function mergeCandles(candles: Candle[], groupSize: number): Candle[] {
  const merged: Candle[] = [];
  for (let i = 0; i + groupSize <= candles.length; i += groupSize) {
    const group = candles.slice(i, i + groupSize);
    merged.push({
      ts: group[0].ts,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.some((c) => c.volume != null)
        ? group.reduce((sum, c) => sum + (c.volume ?? 0), 0)
        : undefined,
    });
  }
  return merged;
}

export async function fetchLatestPrice(setSymbol: string): Promise<number> {
  const candles = await fetchChart(toYahooSymbol(setSymbol), "1d", "5d");
  const last = candles[candles.length - 1];
  if (!last) throw new Error(`No recent price for ${setSymbol}`);
  return last.close;
}

export async function fetchTimeSeries(setSymbol: string, timeframe: Timeframe): Promise<Candle[]> {
  const yahooSymbol = toYahooSymbol(setSymbol);

  if (timeframe === "H4") {
    const hourly = await fetchChart(yahooSymbol, H1_SOURCE_FOR_H4.interval, H1_SOURCE_FOR_H4.range);
    return mergeCandles(hourly, 4);
  }

  const { interval, range } = YAHOO_PARAMS[timeframe];
  return fetchChart(yahooSymbol, interval, range);
}
