import type { Env } from "../types";

export interface SentimentResult {
  sentiment: "positive" | "negative" | "neutral";
  impact: "high" | "medium" | "low";
}

// Small instruct model — this is a cheap structured-classification task,
// not creative writing, so we don't need a bigger model here.
const MODEL = "@cf/meta/llama-3.2-3b-instruct";

const SYSTEM_PROMPT = `You are a financial news classifier for a gold/forex trading dashboard.
Given a news headline and summary, classify it. Respond with ONLY a raw JSON object,
no markdown fences, no explanation, exactly this shape:
{"sentiment":"positive"|"negative"|"neutral","impact":"high"|"medium"|"low"}

"sentiment": the likely direction for GOLD price specifically (not the stock market in
general) if this news plays out as expected — "positive" if it tends to push gold UP
(e.g. dovish Fed, safe-haven demand, dollar weakness), "negative" if it tends to push
gold DOWN (e.g. hawkish Fed, strong dollar, risk-on sentiment), "neutral" if unclear or
not gold-relevant.
"impact": how market-moving this kind of news typically is — "high" for major central
bank decisions/inflation data/geopolitical shocks, "medium" for routine economic data,
"low" for minor or company-specific news.`;

/** Ask Workers AI to classify one news item. Never throws — falls back to a safe default. */
export async function analyzeNewsSentiment(
  env: Env,
  title: string,
  summary: string | null
): Promise<SentimentResult> {
  try {
    const response = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Headline: ${title}\nSummary: ${summary ?? "(no summary)"}` },
      ],
    });

    return parseResult(response);
  } catch (err) {
    console.error("[sentiment] Workers AI call failed:", err);
    return { sentiment: "neutral", impact: "low" };
  }
}

const VALID_SENTIMENT = new Set(["positive", "negative", "neutral"]);
const VALID_IMPACT = new Set(["high", "medium", "low"]);

/**
 * The `response` field on Workers AI instruct models is USUALLY a string,
 * but was observed (2026-09-04, @cf/meta/llama-3.2-3b-instruct) coming back
 * as an already-parsed object when the model's raw output looked like JSON.
 * Handle both shapes rather than trusting the type declarations blindly.
 */
function parseResult(response: unknown): SentimentResult {
  const raw = response && typeof response === "object" ? (response as { response?: unknown }).response : response;

  let parsed: Partial<SentimentResult> | undefined;
  if (raw && typeof raw === "object") {
    parsed = raw as Partial<SentimentResult>;
  } else if (typeof raw === "string") {
    try {
      const match = raw.match(/\{[\s\S]*?\}/); // model sometimes adds stray text around the JSON
      parsed = JSON.parse(match ? match[0] : raw) as Partial<SentimentResult>;
    } catch {
      parsed = undefined;
    }
  }

  return {
    sentiment: VALID_SENTIMENT.has(parsed?.sentiment ?? "") ? (parsed!.sentiment as SentimentResult["sentiment"]) : "neutral",
    impact: VALID_IMPACT.has(parsed?.impact ?? "") ? (parsed!.impact as SentimentResult["impact"]) : "low",
  };
}
