import { Hono } from "hono";
import type { Env } from "../types";
import { getDashboardSummary } from "../lib/dashboard-summary";

export const dashboardSummaryRoute = new Hono<{ Bindings: Env }>();

// GET /api/dashboard-summary — AI-generated gold + Thai-stock digest for the
// Dashboard's summary card. Cached ~30 min in KV (see dashboard-summary.ts) so
// opening the page doesn't call Workers AI on every single visit.
// ?refresh=1 forces a regen (subject to a short shared cooldown — see lib).
dashboardSummaryRoute.get("/", async (c) => {
  const forceRefresh = c.req.query("refresh") === "1";
  const summary = await getDashboardSummary(c.env, forceRefresh);
  return c.json(summary);
});
