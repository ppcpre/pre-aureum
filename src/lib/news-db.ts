import type { FeedItem } from "./rss";

export async function upsertNews(
  db: D1Database,
  source: string,
  assetTag: string,
  items: FeedItem[]
): Promise<void> {
  if (items.length === 0) return;

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO news (source, title, summary, url, published_at, asset_tag)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const batch = items.map((it) =>
    stmt.bind(source, it.title, it.description ?? null, it.link, parsePubDate(it.pubDate), assetTag)
  );
  await db.batch(batch);
}

function parsePubDate(pubDate: string): number {
  const parsed = Date.parse(pubDate);
  return Number.isNaN(parsed) ? Math.floor(Date.now() / 1000) : Math.floor(parsed / 1000);
}

export interface PendingSentimentRow {
  id: number;
  title: string;
  summary: string | null;
}

/** News rows not yet classified — capped per call so one cron tick can't blow the AI budget. */
export async function getPendingSentimentNews(db: D1Database, limit = 10): Promise<PendingSentimentRow[]> {
  const { results } = await db
    .prepare(`SELECT id, title, summary FROM news WHERE sentiment IS NULL ORDER BY published_at DESC LIMIT ?`)
    .bind(limit)
    .all<PendingSentimentRow>();
  return results ?? [];
}

export async function updateNewsSentiment(
  db: D1Database,
  id: number,
  sentiment: string,
  impact: string
): Promise<void> {
  await db.prepare(`UPDATE news SET sentiment = ?, impact = ? WHERE id = ?`).bind(sentiment, impact, id).run();
}
