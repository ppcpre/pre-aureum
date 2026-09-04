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
