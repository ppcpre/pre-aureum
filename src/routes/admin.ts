import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env } from "../types";
import { createSession, destroySession, isValidSession, requireAdmin, SESSION_COOKIE } from "../lib/auth";
import { computeGoldZoneFinder } from "../lib/zone-finder";

export const adminRoute = new Hono<{ Bindings: Env }>();

// POST /api/admin/login  { "password": "..." }
adminRoute.post("/login", async (c) => {
  const body = await c.req.json<{ password?: string }>().catch(() => ({ password: undefined }));

  if (!body.password || body.password !== c.env.ADMIN_PASSWORD) {
    return c.json({ ok: false, error: "invalid_password" }, 401);
  }

  const token = await createSession(c.env);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  return c.json({ ok: true });
});

// POST /api/admin/logout
adminRoute.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await destroySession(c.env, token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// GET /api/admin/me — check whether the current cookie is a valid admin session.
adminRoute.get("/me", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  return c.json({ authenticated: await isValidSession(c.env, token) });
});

// GET /api/admin/ping — sample protected route; every admin endpoint below
// uses the same `requireAdmin` middleware.
adminRoute.get("/ping", requireAdmin, (c) => c.json({ ok: true, admin: true }));

// GET /api/admin/zone-finder/gold — confluence checklist + suggested zones (ทอง).
// Admin-only by design (see chat history): not a buy/sell signal, a
// transparent checklist of what the S/R + trend engine currently sees.
adminRoute.get("/zone-finder/gold", requireAdmin, async (c) => {
  try {
    const result = await computeGoldZoneFinder(c.env);
    return c.json(result);
  } catch (err) {
    return c.json({ error: "zone_finder_failed", message: (err as Error).message }, 502);
  }
});

// GET /api/admin/watchlist — หุ้นไทย watchlist. Placeholder until M6 (public/admin
// Thai-stock data source) is decided — do not treat this as real market data.
adminRoute.get("/watchlist", requireAdmin, (c) =>
  c.json({
    items: [],
    note: "รอ data source หุ้นไทย (M6) — ยังไม่มีข้อมูลจริงให้แสดง",
  })
);

// GET /api/admin/auto-trade/status — Phase 1.5 stub. Not implemented: needs a
// broker account (OANDA demo recommended — see chat history) wired up first.
adminRoute.get("/auto-trade/status", requireAdmin, (c) =>
  c.json({
    implemented: false,
    note: "Auto Trade (Phase 1.5) ยังไม่เชื่อม broker — ดู README/แผนที่คุยไว้ก่อนเริ่ม",
  })
);
