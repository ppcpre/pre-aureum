import { Hono } from "hono";
import type { Env } from "../types";
import { computeGoldSignals } from "../lib/gold-signal";

export const signalRoute = new Hono<{ Bindings: Env }>();

// GET /api/signal/gold — buy/sell/hold per timeframe (public, same data class as /api/sr/gold).
signalRoute.get("/gold", async (c) => {
  try {
    const timeframes = await computeGoldSignals(c.env);
    return c.json({ timeframes });
  } catch (err) {
    return c.json({ error: "upstream_fetch_failed", message: (err as Error).message }, 502);
  }
});
