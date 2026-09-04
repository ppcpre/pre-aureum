import type { Env } from "../types";
import { getJSON, putJSON } from "./kv-cache";
import { fetchLatestPrice } from "./twelvedata";
import { getCandles, getPreviousDayCandle } from "./candles-db";
import { buildSRLevels, pickNearestLevels } from "./sr-engine";
import { buildScreener, type ScreenerRow } from "./screener";
import { STOCK_WATCHLIST } from "./stock-symbols";

// Same model as the admin chat — chosen for Thai-language quality (see chat.ts).
const MODEL = "@cf/qwen/qwen3.8-27b";
const GOLD_SYMBOL = "XAU/USD";

const CACHE_KEY = "dashboard:summary:v1";
// "On Dashboard open" doesn't mean "on every single request" — this keeps the
// card fresh within a normal viewing session without calling Workers AI (and
// spending Neurons) on every visitor. Regenerates lazily on the first request
// after the cache expires, not on a cron — no new cron trigger needed.
const CACHE_TTL_SECONDS = 30 * 60;

// The Dashboard's "รีเฟรช" button can force a regen — but this route has no
// auth (same as the rest of the public Dashboard), so a short cooldown caps
// how often ANY visitor can trigger a real Workers AI call, independent of
// the read-cache TTL above.
const REFRESH_COOLDOWN_KEY = "dashboard:summary:cooldown";
const REFRESH_COOLDOWN_SECONDS = 60;

export interface DashboardSummary {
  generatedAt: number;
  gold: { available: true; sentiment: "bull" | "bear" | "neutral"; narrative: string } | { available: false; reason: string };
  stocks: { symbol: string; name: string; note: string; tag: "resistance" | "support" | "gainer" | "loser" }[];
  stats: {
    goldChangePct: number | null; // null = gold data not available yet
    stockSignalCount: number; // ALL flagged stocks, not just the top N shown in `stocks`
    stockWatchlistSize: number;
    newsCount24h: number;
  };
}

export async function getDashboardSummary(env: Env, forceRefresh = false): Promise<DashboardSummary> {
  if (forceRefresh) {
    const cooldownActive = await env.CACHE.get(REFRESH_COOLDOWN_KEY);
    if (!cooldownActive) {
      await env.CACHE.put(REFRESH_COOLDOWN_KEY, "1", { expirationTtl: REFRESH_COOLDOWN_SECONDS });
      const summary = await generateDashboardSummary(env);
      await putJSON(env.CACHE, CACHE_KEY, summary, CACHE_TTL_SECONDS);
      return summary;
    }
    // Cooldown still active (another visitor just refreshed) — fall through and serve/build the normal cache below.
  }

  const cached = await getJSON<DashboardSummary>(env.CACHE, CACHE_KEY);
  if (cached) return cached;

  const summary = await generateDashboardSummary(env);
  await putJSON(env.CACHE, CACHE_KEY, summary, CACHE_TTL_SECONDS);
  return summary;
}

interface GoldContext {
  price: number;
  changePct: number | null; // vs the last completed daily candle — null if there's no prior candle yet
  levels: { price: number; type: string; methods: string[] }[];
  news: { title: string; sentiment: string | null; impact: string | null }[];
}

async function buildGoldContext(env: Env): Promise<GoldContext | null> {
  try {
    const price = await fetchLatestPrice(env, GOLD_SYMBOL); // throws if TWELVEDATA_API_KEY isn't set yet
    const candles = await getCandles(env.DB, GOLD_SYMBOL, "H4", 150);
    const previousDayCandle = await getPreviousDayCandle(env, GOLD_SYMBOL);
    const levels = candles.length > 0 ? pickNearestLevels(buildSRLevels(candles, previousDayCandle, price), price) : [];
    const changePct = previousDayCandle ? ((price - previousDayCandle.close) / previousDayCandle.close) * 100 : null;

    const { results: newsRows } = await env.DB.prepare(
      `SELECT title, sentiment, impact FROM news WHERE asset_tag = 'gold' ORDER BY published_at DESC LIMIT 5`
    ).all<{ title: string; sentiment: string | null; impact: string | null }>();

    return { price, changePct, levels, news: newsRows ?? [] };
  } catch {
    return null; // Twelve Data not configured yet, or upstream failed — gold section shows "pending", not a fabricated number.
  }
}

async function countRecentGoldNews(env: Env, sinceSeconds: number): Promise<number> {
  const cutoff = Math.floor(Date.now() / 1000) - sinceSeconds;
  const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM news WHERE asset_tag = 'gold' AND published_at >= ?`)
    .bind(cutoff)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

interface ModelOutput {
  goldNarrative?: string;
  goldSentiment?: "bull" | "bear" | "neutral";
  stockNotes?: { symbol: string; note: string }[];
}

/** Single Workers AI call turns the real numbers above into short Thai prose. Never asked to invent facts. */
async function callModelForSummary(env: Env, gold: GoldContext | null, stocks: ScreenerRow[]): Promise<ModelOutput | null> {
  if (!gold && stocks.length === 0) return null;

  const dataParts: string[] = [];
  if (gold) {
    dataParts.push(
      `ข้อมูลทองจริงจากระบบ (JSON): ${JSON.stringify({
        price: gold.price,
        nearestLevels: gold.levels.map((l) => ({ price: l.price, type: l.type })),
        recentNews: gold.news,
      })}`
    );
  }
  if (stocks.length > 0) {
    dataParts.push(
      `หุ้นไทยที่มีสัญญาณจริงจากระบบ (JSON): ${JSON.stringify(
        stocks.map((s) => ({ symbol: s.symbol, name: s.name, price: s.price, changePct: s.changePct, signal: s.signal }))
      )}`
    );
  }

  const schemaFields = [
    gold
      ? `"goldNarrative": "2-3 ประโยคภาษาไทย สรุปราคาทองและข่าวจากข้อมูลที่ให้เท่านั้น", "goldSentiment": "bull" | "bear" | "neutral"`
      : null,
    stocks.length > 0 ? `"stockNotes": [{"symbol": "...", "note": "วลีสั้นๆ ภาษาไทย อธิบายสัญญาณของหุ้นตัวนี้จากข้อมูลที่ให้เท่านั้น"}]` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const systemPrompt = `You write short Thai-language market summaries for a trading dashboard. Use ONLY the real data given in the user message — never invent prices, news, or facts not present in it.

Write like a trader briefing a colleague, in natural conversational Thai — NOT a data readout. Never restate raw field names (e.g. don't write "สัญญาณ gainer" or "สัญญาณ loser") — describe what happened instead (e.g. "ราคาพุ่งขึ้นแรง", "ร่วงลงต่อเนื่อง", "ทะลุแนวต้านเดิม"). Keep each stock note under ~12 Thai words.

Respond with STRICT JSON only (no markdown code fences, no commentary before or after), matching exactly this shape: {${schemaFields}}`;

  try {
    const result = (await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: dataParts.join("\n\n") },
      ],
    } as any)) as any;

    const text: string = result?.choices?.[0]?.message?.content ?? (typeof result?.response === "string" ? result.response : "");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as ModelOutput;
  } catch (err) {
    console.error("[dashboard-summary] model call failed:", err);
    return null;
  }
}

function signalTag(signal: ScreenerRow["signal"]): "resistance" | "support" | "gainer" | "loser" {
  if (signal === "breakout_resistance") return "resistance";
  if (signal === "near_support") return "support";
  if (signal === "loser") return "loser";
  return "gainer";
}

/** Grounded fallback if the model call fails or returns unparsable JSON — real numbers, never blank or invented. */
function fallbackStockNote(row: ScreenerRow): string {
  if (row.signal === "breakout_resistance") return `ทำราคาสูงสุดใหม่ในรอบ 10 วัน ที่ ${row.price.toFixed(2)} บาท`;
  if (row.signal === "near_support" && row.nearestSupport !== undefined) return `ราคาใกล้แนวรับ ${row.nearestSupport.toFixed(2)} บาท`;
  const sign = row.changePct >= 0 ? "+" : "";
  return `เปลี่ยนแปลง ${sign}${row.changePct.toFixed(2)}% ในช่วงที่ผ่านมา`;
}

async function generateDashboardSummary(env: Env): Promise<DashboardSummary> {
  const gold = await buildGoldContext(env);

  const screenerRows = await buildScreener(env);
  const allFlagged = screenerRows.filter((r) => r.signal !== "normal");
  const flaggedStocks = [...allFlagged].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 5);

  const newsCount24h = await countRecentGoldNews(env, 24 * 60 * 60);

  const generatedAt = Math.floor(Date.now() / 1000);
  const stats: DashboardSummary["stats"] = {
    goldChangePct: gold?.changePct ?? null,
    stockSignalCount: allFlagged.length,
    stockWatchlistSize: STOCK_WATCHLIST.length,
    newsCount24h,
  };

  if (!gold && flaggedStocks.length === 0) {
    return {
      generatedAt,
      gold: { available: false, reason: "รอเชื่อมต่อข้อมูลราคา (Twelve Data API key)" },
      stocks: [],
      stats,
    };
  }

  const modelOutput = await callModelForSummary(env, gold, flaggedStocks);

  const goldSection: DashboardSummary["gold"] =
    gold && modelOutput?.goldNarrative
      ? { available: true, sentiment: modelOutput.goldSentiment ?? "neutral", narrative: modelOutput.goldNarrative }
      : {
          available: false,
          reason: gold ? "AI สรุปไม่สำเร็จ ลองรีเฟรชอีกครั้ง" : "รอเชื่อมต่อข้อมูลราคา (Twelve Data API key)",
        };

  const stocks = flaggedStocks.map((row) => ({
    symbol: row.symbol,
    name: row.name,
    note: modelOutput?.stockNotes?.find((n) => n.symbol === row.symbol)?.note ?? fallbackStockNote(row),
    tag: signalTag(row.signal),
  }));

  return { generatedAt, gold: goldSection, stocks, stats };
}
