// Sonnet 5 pricing at time of writing — $ per 1M tokens. Update if pricing changes.
const PRICE_PER_MTOK = {
  input: 2.0,
  output: 10.0,
  cacheWrite: 2.5, // ~1.25x input
  cacheRead: 0.2, // ~0.1x input
};

export interface UsageDelta {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export async function logChatUsage(db: D1Database, usage: UsageDelta): Promise<void> {
  await db
    .prepare(
      `INSERT INTO chat_usage (ts, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      Math.floor(Date.now() / 1000),
      usage.model,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheCreationInputTokens,
      usage.cacheReadInputTokens
    )
    .run();
}

export interface UsageSummary {
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  estimatedCostUsd: number;
}

function summarize(row: Record<string, number> | undefined): UsageSummary {
  const inputTokens = row?.input_tokens ?? 0;
  const outputTokens = row?.output_tokens ?? 0;
  const cacheCreationInputTokens = row?.cache_creation_input_tokens ?? 0;
  const cacheReadInputTokens = row?.cache_read_input_tokens ?? 0;

  const estimatedCostUsd =
    (inputTokens / 1_000_000) * PRICE_PER_MTOK.input +
    (outputTokens / 1_000_000) * PRICE_PER_MTOK.output +
    (cacheCreationInputTokens / 1_000_000) * PRICE_PER_MTOK.cacheWrite +
    (cacheReadInputTokens / 1_000_000) * PRICE_PER_MTOK.cacheRead;

  return {
    messageCount: row?.message_count ?? 0,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
  };
}

const AGGREGATE_SELECT = `
  SELECT
    COUNT(*) as message_count,
    COALESCE(SUM(input_tokens), 0) as input_tokens,
    COALESCE(SUM(output_tokens), 0) as output_tokens,
    COALESCE(SUM(cache_creation_input_tokens), 0) as cache_creation_input_tokens,
    COALESCE(SUM(cache_read_input_tokens), 0) as cache_read_input_tokens
  FROM chat_usage`;

export async function getUsageSummary(db: D1Database): Promise<{ today: UsageSummary; allTime: UsageSummary }> {
  const startOfTodayUtc = Math.floor(Date.now() / 1000) - (Math.floor(Date.now() / 1000) % 86400);

  const [todayRow, allTimeRow] = await Promise.all([
    db.prepare(`${AGGREGATE_SELECT} WHERE ts >= ?`).bind(startOfTodayUtc).first<Record<string, number>>(),
    db.prepare(AGGREGATE_SELECT).first<Record<string, number>>(),
  ]);

  return { today: summarize(todayRow ?? undefined), allTime: summarize(allTimeRow ?? undefined) };
}

export interface RecentUsageRow {
  ts: number;
  input_tokens: number;
  output_tokens: number;
}

export async function getRecentUsage(db: D1Database, limit = 20): Promise<RecentUsageRow[]> {
  const { results } = await db
    .prepare(`SELECT ts, input_tokens, output_tokens FROM chat_usage ORDER BY ts DESC LIMIT ?`)
    .bind(limit)
    .all<RecentUsageRow>();
  return results ?? [];
}
