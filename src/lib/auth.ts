import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "../types";

export const SESSION_COOKIE = "aureum_admin_session";
const SESSION_PREFIX = "admin_session:";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export async function createSession(env: Env): Promise<string> {
  const token = crypto.randomUUID();
  await env.CACHE.put(SESSION_PREFIX + token, "1", { expirationTtl: SESSION_TTL_SECONDS });
  return token;
}

export async function isValidSession(env: Env, token: string | undefined): Promise<boolean> {
  if (!token) return false;
  return (await env.CACHE.get(SESSION_PREFIX + token)) !== null;
}

export async function destroySession(env: Env, token: string): Promise<void> {
  await env.CACHE.delete(SESSION_PREFIX + token);
}

/** Hono middleware — reject with 401 unless a valid admin session cookie is present. */
export const requireAdmin: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!(await isValidSession(c.env, token))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
};
