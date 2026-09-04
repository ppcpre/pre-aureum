import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env } from "../types";
import { createSession, destroySession, isValidSession, requireAdmin, SESSION_COOKIE } from "../lib/auth";

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

// GET /api/admin/ping — sample protected route; future Zone Finder / Watchlist /
// Auto Trade admin endpoints should use the same `requireAdmin` middleware.
adminRoute.get("/ping", requireAdmin, (c) => c.json({ ok: true, admin: true }));
