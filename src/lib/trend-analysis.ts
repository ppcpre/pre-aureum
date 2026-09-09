import type { Candle } from "../types";
import { calculateRSISeries, findSwingPoints, type SwingPoint } from "./sr-engine";

export interface TrendLine {
  // Two endpoints spanning the full candle range (start ts, end ts) — enough
  // for the frontend to draw one straight diagonal line across the chart.
  start: { ts: number; price: number };
  end: { ts: number; price: number };
}

export interface RSICrossing {
  ts: number;
  direction: "up" | "down"; // crossed above/below 50
  rsi: number;
}

export interface Divergence {
  type: "bullish" | "bearish";
  // The two most recent price swings (both highs for bearish, both lows for bullish)
  // that disagree with what RSI did at those same two points in time.
  priceSwing1: { ts: number; price: number };
  priceSwing2: { ts: number; price: number };
  rsiAtSwing1: number;
  rsiAtSwing2: number;
}

export interface TrendAnalysis {
  rsi: { ts: number; value: number }[]; // one entry per candle that has enough history
  priceTrendlines: { resistance: TrendLine | null; support: TrendLine | null };
  rsiTrendlines: { resistance: TrendLine | null; support: TrendLine | null };
  rsiCrossings: RSICrossing[];
  divergences: Divergence[];
}

interface Point {
  x: number;
  y: number;
}

/**
 * Fits a straight "envelope" line through a set of points: ordinary
 * least-squares regression for the slope/direction, then shifted so the
 * line touches the most extreme point and every other point sits on the
 * correct side of it (all-below for a resistance/upper line, all-above for
 * a support/lower line) — a simple, always-valid way to draw a trend
 * channel boundary, rather than trying to pick "the two best-fitting
 * touches" by brute force. Needs at least 2 points; x is normalized
 * (offset from the first point) to keep the regression numerically stable
 * against raw Unix-timestamp magnitudes.
 */
function fitEnvelopeLine(points: Point[], side: "upper" | "lower"): { m: number; b: number; x0: number } | null {
  if (points.length < 2) return null;

  const x0 = points[0].x;
  const xs = points.map((p) => p.x - x0);
  const ys = points.map((p) => p.y);
  const n = xs.length;

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, xi, i) => a + xi * ys[i], 0);
  const sumXX = xs.reduce((a, xi) => a + xi * xi, 0);

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null; // all points at the same x — can't fit a slope

  const m = (n * sumXY - sumX * sumY) / denom;
  let b = (sumY - m * sumX) / n;

  // Shift the fitted line up/down until it envelopes every point.
  const residuals = xs.map((xi, i) => ys[i] - (m * xi + b));
  b += side === "upper" ? Math.max(...residuals) : Math.min(...residuals);

  return { m, b, x0 };
}

function lineAt(line: { m: number; b: number; x0: number }, ts: number): number {
  return line.m * (ts - line.x0) + line.b;
}

/** Extends a fitted envelope line across a [startTs, lastTs] range as two drawable endpoints. */
function toTrendLine(line: { m: number; b: number; x0: number } | null, startTs: number, lastTs: number): TrendLine | null {
  if (!line) return null;
  return {
    start: { ts: startTs, price: lineAt(line, startTs) },
    end: { ts: lastTs, price: lineAt(line, lastTs) },
  };
}

/**
 * Fits + draws one trend channel boundary from only the most RECENT anchor
 * points (default last 6), not the entire history — a line regressed across
 * years of a strongly trending instrument like gold extrapolates wildly
 * (checked directly against production data: spanning the full range put
 * the resistance line thousands of dollars above any real price). Traders
 * draw trendlines the same way: connect a handful of recent, relevant
 * touches, not every swing since inception. The line is drawn starting at
 * its earliest anchor (where the trend structurally begins) through to the
 * current candle, rather than extrapolated backward over untouched history.
 */
function buildTrendLine(points: Point[], side: "upper" | "lower", lastTs: number, maxAnchors = 6): TrendLine | null {
  const recent = [...points].sort((a, b) => a.x - b.x).slice(-maxAnchors);
  if (recent.length < 2) return null;
  const line = fitEnvelopeLine(recent, side);
  return toTrendLine(line, recent[0].x, lastTs);
}

/** Same fractal local-extrema idea as findSwingPoints() in sr-engine.ts, applied to a plain value series (here, RSI) instead of OHLC candles. */
function findScalarSwingPoints(series: { ts: number; value: number }[], lookback = 2): SwingPoint[] {
  const points: SwingPoint[] = [];
  for (let i = lookback; i < series.length - lookback; i++) {
    const window = series.slice(i - lookback, i + lookback + 1);
    const current = series[i];

    const isHigh = window.every((p) => p.value <= current.value) && window.some((p) => p !== current && p.value < current.value);
    if (isHigh) points.push({ ts: current.ts, price: current.value, type: "high" });

    const isLow = window.every((p) => p.value >= current.value) && window.some((p) => p !== current && p.value > current.value);
    if (isLow) points.push({ ts: current.ts, price: current.value, type: "low" });
  }
  return points;
}

/**
 * Classic RSI divergence: compares the last two swing highs (bearish) or
 * swing lows (bullish) in PRICE against RSI's value at those exact same
 * candle timestamps — not RSI's own local extrema — since that's the
 * standard definition ("price makes a higher high while momentum doesn't
 * confirm it"). Only looks at the most recent pair per side, matching what
 * the reference chart highlights (one divergence event at a time, not every
 * swing in history).
 */
function findDivergences(priceSwings: SwingPoint[], rsiByTs: Map<number, number>): Divergence[] {
  const divergences: Divergence[] = [];

  const highs = priceSwings.filter((p) => p.type === "high").sort((a, b) => a.ts - b.ts);
  const lows = priceSwings.filter((p) => p.type === "low").sort((a, b) => a.ts - b.ts);

  if (highs.length >= 2) {
    const [h1, h2] = highs.slice(-2);
    const r1 = rsiByTs.get(h1.ts);
    const r2 = rsiByTs.get(h2.ts);
    if (r1 !== undefined && r2 !== undefined && h2.price > h1.price && r2 < r1) {
      divergences.push({ type: "bearish", priceSwing1: { ts: h1.ts, price: h1.price }, priceSwing2: { ts: h2.ts, price: h2.price }, rsiAtSwing1: r1, rsiAtSwing2: r2 });
    }
  }

  if (lows.length >= 2) {
    const [l1, l2] = lows.slice(-2);
    const r1 = rsiByTs.get(l1.ts);
    const r2 = rsiByTs.get(l2.ts);
    if (r1 !== undefined && r2 !== undefined && l2.price < l1.price && r2 > r1) {
      divergences.push({ type: "bullish", priceSwing1: { ts: l1.ts, price: l1.price }, priceSwing2: { ts: l2.ts, price: l2.price }, rsiAtSwing1: r1, rsiAtSwing2: r2 });
    }
  }

  return divergences;
}

function findRSICrossings(rsiSeries: { ts: number; value: number }[]): RSICrossing[] {
  const crossings: RSICrossing[] = [];
  for (let i = 1; i < rsiSeries.length; i++) {
    const prev = rsiSeries[i - 1].value;
    const cur = rsiSeries[i].value;
    if (prev < 50 && cur >= 50) crossings.push({ ts: rsiSeries[i].ts, direction: "up", rsi: cur });
    else if (prev > 50 && cur <= 50) crossings.push({ ts: rsiSeries[i].ts, direction: "down", rsi: cur });
  }
  return crossings;
}

/**
 * Composes the primitives above into everything the trend-analysis page
 * needs: an RSI series, a price trend channel (support+resistance lines),
 * an RSI trend channel (same idea applied to RSI's own swings), RSI=50
 * crossing points, and any live divergence between price and RSI.
 */
export function computeTrendAnalysis(candles: Candle[]): TrendAnalysis {
  if (candles.length < 2) {
    return { rsi: [], priceTrendlines: { resistance: null, support: null }, rsiTrendlines: { resistance: null, support: null }, rsiCrossings: [], divergences: [] };
  }

  const lastTs = candles[candles.length - 1].ts;

  const rsiSeriesRaw = calculateRSISeries(candles, 14);
  const rsi = candles.map((c, i) => ({ ts: c.ts, value: rsiSeriesRaw[i] })).filter((p): p is { ts: number; value: number } => p.value !== undefined);
  const rsiByTs = new Map(rsi.map((p) => [p.ts, p.value]));

  const priceSwings = findSwingPoints(candles);
  const priceHighs = priceSwings.filter((p) => p.type === "high").map((p) => ({ x: p.ts, y: p.price }));
  const priceLows = priceSwings.filter((p) => p.type === "low").map((p) => ({ x: p.ts, y: p.price }));

  const rsiSwings = findScalarSwingPoints(rsi.map((p) => ({ ts: p.ts, value: p.value })));
  const rsiHighs = rsiSwings.filter((p) => p.type === "high").map((p) => ({ x: p.ts, y: p.price }));
  const rsiLows = rsiSwings.filter((p) => p.type === "low").map((p) => ({ x: p.ts, y: p.price }));

  return {
    rsi,
    priceTrendlines: {
      resistance: buildTrendLine(priceHighs, "upper", lastTs),
      support: buildTrendLine(priceLows, "lower", lastTs),
    },
    rsiTrendlines: {
      resistance: buildTrendLine(rsiHighs, "upper", lastTs),
      support: buildTrendLine(rsiLows, "lower", lastTs),
    },
    rsiCrossings: findRSICrossings(rsi),
    divergences: findDivergences(priceSwings, rsiByTs),
  };
}
