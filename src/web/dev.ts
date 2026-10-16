// /dev/session: signs in a local seed user and loads the spec's populated
// inventory, so scripts/app-render can photograph signed-in pages.
//
// This is a sign-in bypass, so it answers only when both hold:
//   - DEV_SESSION_SEEDING is "1", which only `wrangler dev --var` passes
//     (never wrangler.jsonc, never a secret), and
//   - the request is to localhost or 127.0.0.1.
// Anywhere else it is a 404 that reads and writes nothing.

import { Hono } from "hono";
import { seedInventory } from "../service/seed";
import { createSession, upsertUser } from "../service/users";
import { safeNext } from "./auth";
import type { AppEnv } from "./session";
import { setSessionCookie } from "./session";

export const DEV_GITHUB_ID = 0;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function devSessionAllowed(env: { DEV_SESSION_SEEDING?: string }, url: string): boolean {
  return env.DEV_SESSION_SEEDING === "1" && LOCAL_HOSTS.has(new URL(url).hostname);
}

export const dev = new Hono<AppEnv>();

dev.get("/session", async (c) => {
  if (!devSessionAllowed(c.env, c.req.url)) return c.notFound();
  const user = await upsertUser(c.env.DB, DEV_GITHUB_ID, "local-dev");
  await seedInventory(c.env.DB, user.id);
  await setSessionCookie(c, await createSession(c.env.DB, user.id));
  return c.redirect(safeNext(c.req.query("next")), 303);
});
