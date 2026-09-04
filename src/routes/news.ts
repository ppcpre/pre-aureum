import { Hono } from "hono";
import type { Env } from "../types";

export const newsRoute = new Hono<{ Bindings: Env }>();

interface NewsRow {
  id: number;
  source: string;
  title: string;
  summary: string | null;
  url: string;
  published_at: number;
  asset_tag: string | null;
  sentiment: string | null;
  impact: string | null;
}

// GET /api/news?asset=gold&limit=20
newsRoute.get("/", async (c) => {
  const asset = c.req.query("asset");
  const limit = Math.min(Number(c.req.query("limit") ?? 20) || 20, 100);

  const stmt = asset
    ? c.env.DB.prepare(
        `SELECT id, source, title, summary, url, published_at, asset_tag, sentiment, impact
         FROM news WHERE asset_tag = ? ORDER BY published_at DESC LIMIT ?`
      ).bind(asset, limit)
    : c.env.DB.prepare(
        `SELECT id, source, title, summary, url, published_at, asset_tag, sentiment, impact
         FROM news ORDER BY published_at DESC LIMIT ?`
      ).bind(limit);

  const { results } = await stmt.all<NewsRow>();
  return c.json({ items: results ?? [] });
});
