import type { Candle, SRLevel } from "../types";

interface PivotLevels {
  pivot: number;
  r1: number;
  r2: number;
  s1: number;
  s2: number;
}

/** Classic pivot points, computed from one completed candle (typically the prior day). */
export function calculatePivotPoints(candle: Candle): PivotLevels {
  const { high, low, close } = candle;
  const pivot = (high + low + close) / 3;
  return {
    pivot,
    r1: 2 * pivot - low,
    s1: 2 * pivot - high,
    r2: pivot + (high - low),
    s2: pivot - (high - low),
  };
}

interface SwingPoint {
  ts: number;
  price: number;
  type: "high" | "low";
}

/**
 * Fractal swing high/low detection: a candle is a swing high if its high is the
 * strictly greatest among `lookback` candles on both sides (swing low: mirrored).
 */
export function findSwingPoints(candles: Candle[], lookback = 2): SwingPoint[] {
  const points: SwingPoint[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const window = candles.slice(i - lookback, i + lookback + 1);
    const current = candles[i];

    const isSwingHigh = window.every((c) => c.high <= current.high) &&
      window.some((c) => c !== current && c.high < current.high);
    if (isSwingHigh) points.push({ ts: current.ts, price: current.high, type: "high" });

    const isSwingLow = window.every((c) => c.low >= current.low) &&
      window.some((c) => c !== current && c.low > current.low);
    if (isSwingLow) points.push({ ts: current.ts, price: current.low, type: "low" });
  }

  return points;
}

/**
 * Combine pivot points + swing points into a deduplicated, scored list of S/R levels.
 * `tolerancePct` controls how close two raw levels must be (as a % of price) to be
 * treated as the same confluence zone.
 */
export function buildSRLevels(
  candles: Candle[],
  previousDayCandle: Candle | undefined,
  currentPrice: number,
  tolerancePct = 0.15
): SRLevel[] {
  const raw: { price: number; method: string }[] = [];

  if (previousDayCandle) {
    const p = calculatePivotPoints(previousDayCandle);
    raw.push(
      { price: p.r1, method: "pivot" },
      { price: p.r2, method: "pivot" },
      { price: p.s1, method: "pivot" },
      { price: p.s2, method: "pivot" }
    );
  }

  for (const sp of findSwingPoints(candles)) {
    raw.push({ price: sp.price, method: "swing" });
  }

  // Cluster raw levels that sit within tolerancePct of each other.
  const clusters: { prices: number[]; methods: Set<string> }[] = [];
  for (const level of raw.sort((a, b) => a.price - b.price)) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(level.price - avg(last.prices)) / level.price * 100 <= tolerancePct) {
      last.prices.push(level.price);
      last.methods.add(level.method);
    } else {
      clusters.push({ prices: [level.price], methods: new Set([level.method]) });
    }
  }

  return clusters.map((c) => {
    const price = avg(c.prices);
    const touches = c.prices.length;
    const methodCount = c.methods.size;
    // Strength: confluence across methods matters most, repeated touches add a bit more.
    const strength = Math.max(1, Math.min(5, methodCount * 2 + Math.min(touches - 1, 2) - 1));

    return {
      price: Math.round(price * 100) / 100,
      type: price >= currentPrice ? "resistance" : "support",
      strength,
      methods: Array.from(c.methods),
    } satisfies SRLevel;
  });
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
