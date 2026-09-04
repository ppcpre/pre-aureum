import type { Env } from "../types";
import { NEWS_SOURCES } from "./news-sources";
import { fetchFeed } from "./rss";
import { upsertNews } from "./news-db";

/** Poll every configured RSS source and upsert new items into D1 (dedup by URL). */
export async function pollNews(env: Env): Promise<void> {
  for (const source of NEWS_SOURCES) {
    try {
      const items = await fetchFeed(source.url);
      await upsertNews(env.DB, source.id, source.assetTag, items.slice(0, 20));
    } catch (err) {
      console.error(`[news-poll] failed for source "${source.id}":`, err);
    }
  }
}
