import type { Env } from "../types";
import { NEWS_SOURCES } from "./news-sources";
import { fetchFeed } from "./rss";
import { getPendingSentimentNews, updateNewsSentiment, upsertNews } from "./news-db";
import { analyzeNewsSentiment } from "./sentiment";

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

/**
 * Classify any news rows still missing sentiment/impact via Workers AI.
 * Capped at 10/run (see getPendingSentimentNews) — a backlog just clears
 * over a few cron ticks instead of spiking AI usage in one run.
 */
export async function analyzePendingSentiment(env: Env): Promise<void> {
  const pending = await getPendingSentimentNews(env.DB);

  for (const row of pending) {
    try {
      const { sentiment, impact } = await analyzeNewsSentiment(env, row.title, row.summary);
      await updateNewsSentiment(env.DB, row.id, sentiment, impact);
    } catch (err) {
      console.error(`[news-poll] sentiment analysis failed for news id ${row.id}:`, err);
    }
  }
}
