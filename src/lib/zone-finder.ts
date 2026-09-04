import type { Env } from "../types";
import { fetchLatestPrice, fetchTimeSeries } from "./twelvedata";
import { buildSRLevels, calculateEMA } from "./sr-engine";

const GOLD_SYMBOL = "XAU/USD";

export interface ChecklistItem {
  label: string;
  status: "pass" | "fail" | "pending";
  detail: string;
}

export interface ZoneFinderResult {
  symbol: string;
  currentPrice: number;
  biasScore: number; // 0-100
  bias: "bullish" | "bearish" | "neutral";
  checklist: ChecklistItem[];
  entryZone?: { from: number; to: number };
  stopZone?: number;
  targetZone?: number;
}

/**
 * Admin-only decision-support view for gold: a transparent checklist (not a
 * buy/sell command) built from the S/R engine + EMA trend. Momentum/volume
 * and news-proximity checks are flagged "pending" until those pieces exist.
 */
export async function computeGoldZoneFinder(env: Env): Promise<ZoneFinderResult> {
  const currentPrice = await fetchLatestPrice(env, GOLD_SYMBOL);
  const h4 = await fetchTimeSeries(env, GOLD_SYMBOL, "H4", 150);
  const d1 = await fetchTimeSeries(env, GOLD_SYMBOL, "D1", 10);
  const previousDayCandle = d1[d1.length - 2] ?? d1[d1.length - 1];

  const levels = buildSRLevels(h4, previousDayCandle, currentPrice);
  const nearestSupport = levels
    .filter((l) => l.type === "support")
    .sort((a, b) => b.price - a.price)[0];
  const nearestResistance = levels
    .filter((l) => l.type === "resistance")
    .sort((a, b) => a.price - b.price)[0];

  const ema50 = calculateEMA(h4, 50);
  const ema200 = calculateEMA(h4, 200);
  const trendUp = ema50 !== undefined && ema200 !== undefined ? ema50 > ema200 : undefined;

  const checklist: ChecklistItem[] = [];
  let score = 0;
  const perItem = 100 / 3;

  if (nearestSupport) {
    const holdsSupport = currentPrice >= nearestSupport.price;
    const distPct = ((currentPrice - nearestSupport.price) / currentPrice) * 100;
    checklist.push({
      label: `ราคา${holdsSupport ? "ยืนเหนือ" : "หลุด"}แนวรับ ${nearestSupport.price.toFixed(2)}`,
      status: holdsSupport ? "pass" : "fail",
      detail: `ห่างจากราคาปัจจุบัน ${distPct.toFixed(2)}% (methods: ${nearestSupport.methods.join(", ")})`,
    });
    if (holdsSupport) score += perItem;
  } else {
    checklist.push({ label: "แนวรับใกล้เคียง", status: "pending", detail: "ข้อมูลย้อนหลังยังไม่พอคำนวณ" });
  }

  if (trendUp !== undefined) {
    checklist.push({
      label: trendUp ? "EMA50 อยู่เหนือ EMA200 (แนวโน้มขึ้น)" : "EMA50 อยู่ใต้ EMA200 (แนวโน้มลง)",
      status: trendUp ? "pass" : "fail",
      detail: `EMA50=${ema50!.toFixed(2)}, EMA200=${ema200!.toFixed(2)}`,
    });
    if (trendUp) score += perItem;
  } else {
    checklist.push({ label: "แนวโน้ม EMA50/EMA200", status: "pending", detail: "ข้อมูลย้อนหลังยังไม่พอคำนวณ (ต้องการ 200+ แท่ง)" });
  }

  if (nearestResistance) {
    const distPct = ((nearestResistance.price - currentPrice) / currentPrice) * 100;
    const hasRoom = distPct > 0.3;
    checklist.push({
      label: hasRoom ? "ยังมีระยะห่างจากแนวต้านพอสมควร" : "ราคาใกล้แนวต้านมากแล้ว",
      status: hasRoom ? "pass" : "fail",
      detail: `แนวต้านถัดไป ${nearestResistance.price.toFixed(2)} (ห่าง ${distPct.toFixed(2)}%)`,
    });
    if (hasRoom) score += perItem;
  } else {
    checklist.push({ label: "แนวต้านใกล้เคียง", status: "pending", detail: "ข้อมูลย้อนหลังยังไม่พอคำนวณ" });
  }

  checklist.push({
    label: "โมเมนตัม (RSI) และปริมาณเทรด",
    status: "pending",
    detail: "ยังไม่ได้เชื่อม RSI/volume indicator — ตัวคะแนนด้านบนยังไม่รวมส่วนนี้",
  });
  checklist.push({
    label: "ข่าวสำคัญที่กำลังจะมาถึง",
    status: "pending",
    detail: "รอ M4 ต่อยอด: economic calendar + News Shock Detector",
  });

  const roundedScore = Math.round(score);
  const bias = roundedScore >= 67 ? "bullish" : roundedScore <= 33 ? "bearish" : "neutral";

  return {
    symbol: GOLD_SYMBOL,
    currentPrice,
    biasScore: roundedScore,
    bias,
    checklist,
    entryZone: nearestSupport
      ? { from: nearestSupport.price, to: Math.round(nearestSupport.price * 1.0015 * 100) / 100 }
      : undefined,
    stopZone: nearestSupport ? Math.round(nearestSupport.price * 0.997 * 100) / 100 : undefined,
    targetZone: nearestResistance?.price,
  };
}
