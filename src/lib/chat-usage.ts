// Workers AI is priced in Neurons (free allocation: 10,000/day, shared across
// every model on the account), not a simple $/token rate we can compute
// client-side — so this logs real token counts but does NOT fabricate a USD
// estimate. Check exact Neuron usage in the Cloudflare dashboard.

export interface UsageDelta {
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export async function logChatUsage(db: D1Database, usage: UsageDelta): Promise<void> {
  await db
    .prepare(`INSERT INTO chat_usage (ts, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?)`)
    .bind(Math.floor(Date.now() / 1000), usage.model, usage.promptTokens, usage.completionTokens)
    .run();
}

export interface UsageSummary {
  messageCount: number;
  promptTokens: number;
  completionTokens: number;
}

function summarize(row: Record<string, number> | undefined): UsageSummary {
  return {
    messageCount: row?.message_count ?? 0,
    promptTokens: row?.input_tokens ?? 0,
    completionTokens: row?.output_tokens ?? 0,
  };
}

const AGGREGATE_SELECT = `
  SELECT
    COUNT(*) as message_count,
    COALESCE(SUM(input_tokens), 0) as input_tokens,
    COALESCE(SUM(output_tokens), 0) as output_tokens
  FROM chat_usage`;

export async function getUsageSummary(db: D1Database): Promise<{ today: UsageSummary; allTime: UsageSummary }> {
  const startOfTodayUtc = Math.floor(Date.now() / 1000) - (Math.floor(Date.now() / 1000) % 86400);

  const [todayRow, allTimeRow] = await Promise.all([
    db.prepare(`${AGGREGATE_SELECT} WHERE ts >= ?`).bind(startOfTodayUtc).first<Record<string, number>>(),
    db.prepare(AGGREGATE_SELECT).first<Record<string, number>>(),
  ]);

  return { today: summarize(todayRow ?? undefined), allTime: summarize(allTimeRow ?? undefined) };
}
