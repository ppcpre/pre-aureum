import { Hono } from "hono";
import type { Env } from "../types";
import { buildScreener } from "../lib/screener";

export const screenerRoute = new Hono<{ Bindings: Env }>();

// GET /api/screener/stock — watchlist rows with 24h change + S/R-derived signal.
screenerRoute.get("/stock", async (c) => {
  const rows = await buildScreener(c.env);
  return c.json({ items: rows });
});
