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

/** Exponential moving average of closes; undefined if there aren't enough candles. */
export function calculateEMA(candles: Candle[], period: number): number | undefined {
  if (candles.length < period) return undefined;

  const k = 2 / (period + 1);
  let ema = avg(candles.slice(0, period).map((c) => c.close)); // seed with SMA

  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
}

interface VolumeProfile {
  poc: number; // Point of Control — price bin with the most volume
  vah: number; // Value Area High
  val: number; // Value Area Low
}

/**
 * Classic volume profile: bucket the traded range into `bins`, distribute each
 * candle's volume across the bins its [low, high] range overlaps, find the
 * Point of Control, then expand outward from it until ~70% of total volume
 * (the Value Area) is covered. Returns undefined if candles carry no volume —
 * spot/CFD gold feeds commonly don't report real traded volume.
 */
export function buildVolumeProfile(candles: Candle[], bins = 24): VolumeProfile | undefined {
  const withVolume = candles.filter((c) => (c.volume ?? 0) > 0);
  if (withVolume.length === 0) return undefined;

  const rangeLow = Math.min(...withVolume.map((c) => c.low));
  const rangeHigh = Math.max(...withVolume.map((c) => c.high));
  if (rangeHigh <= rangeLow) return undefined;

  const binSize = (rangeHigh - rangeLow) / bins;
  const binVolume = new Array<number>(bins).fill(0);

  for (const c of withVolume) {
    const firstBin = Math.max(0, Math.floor((c.low - rangeLow) / binSize));
    const lastBin = Math.min(bins - 1, Math.floor((c.high - rangeLow) / binSize));
    const spanBins = lastBin - firstBin + 1;
    const volumePerBin = (c.volume ?? 0) / spanBins;
    for (let b = firstBin; b <= lastBin; b++) binVolume[b] += volumePerBin;
  }

  const totalVolume = binVolume.reduce((a, b) => a + b, 0);
  let pocBin = 0;
  for (let b = 1; b < bins; b++) if (binVolume[b] > binVolume[pocBin]) pocBin = b;

  // Expand outward from the POC bin, always taking whichever neighbor has more
  // volume, until the covered bins hold ~70% of total volume.
  let lo = pocBin;
  let hi = pocBin;
  let covered = binVolume[pocBin];
  while (covered / totalVolume < 0.7 && (lo > 0 || hi < bins - 1)) {
    const leftVol = lo > 0 ? binVolume[lo - 1] : -1;
    const rightVol = hi < bins - 1 ? binVolume[hi + 1] : -1;
    if (rightVol >= leftVol) {
      hi++;
      covered += binVolume[hi];
    } else {
      lo--;
      covered += binVolume[lo];
    }
  }

  const binPrice = (b: number) => rangeLow + b * binSize;
  return {
    poc: binPrice(pocBin) + binSize / 2,
    vah: binPrice(hi + 1),
    val: binPrice(lo),
  };
}

/**
 * Combine pivot points + swing points + dynamic MAs + volume profile into a
 * deduplicated, scored list of S/R levels. `tolerancePct` controls how close
 * two raw levels must be (as a % of price) to be treated as the same
 * confluence zone.
 */
export function buildSRLevels(
  candles: Candle[],
  previousDayCandle: Candle | undefined,
  currentPrice: number,
  tolerancePct = 0.3
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

  const ema50 = calculateEMA(candles, 50);
  if (ema50) raw.push({ price: ema50, method: "ema50" });

  const ema200 = calculateEMA(candles, 200);
  if (ema200) raw.push({ price: ema200, method: "ema200" });

  const volumeProfile = buildVolumeProfile(candles);
  if (volumeProfile) {
    raw.push(
      { price: volumeProfile.poc, method: "volume_poc" },
      { price: volumeProfile.vah, method: "volume_vah" },
      { price: volumeProfile.val, method: "volume_val" }
    );
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

/**
 * `buildSRLevels` can return many clustered levels on volatile/long history
 * (common on lower-priced, choppier instruments — Thai stocks vs. gold).
 * This trims to the `perSide` nearest support and resistance levels to
 * current price, sorted strongest-and-closest first — matching what the
 * "แนวสำคัญใกล้ราคา" panel is meant to show.
 */
export function pickNearestLevels(levels: SRLevel[], currentPrice: number, perSide = 4): SRLevel[] {
  const byDistance = (a: SRLevel, b: SRLevel) =>
    Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice);

  const supports = levels.filter((l) => l.type === "support").sort(byDistance).slice(0, perSide);
  const resistances = levels.filter((l) => l.type === "resistance").sort(byDistance).slice(0, perSide);
  return [...resistances, ...supports];
}
