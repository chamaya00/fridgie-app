// /dev/session: signs in a local seed user and loads the spec's populated
// inventory, so scripts/app-render can photograph signed-in pages. Two more
// routes give it the assistant pages (#8):
//   - /dev/consent registers a seed "Claude" client and opens Consent for it;
//   - /dev/assistant also completes a grant for it, then opens /assistants.
//
// /dev/session is a sign-in bypass, so all three answer only when both hold:
//   - DEV_SESSION_SEEDING is "1", which only `wrangler dev --var` passes
//     (never wrangler.jsonc, never a secret), and
//   - the request is to localhost or 127.0.0.1.
// Anywhere else it is a 404 that reads and writes nothing.

import { Hono } from "hono";
import { oauthApi } from "../oauth";
import { seedInventory } from "../service/seed";
import { createSession, upsertUser } from "../service/users";
import { safeNext } from "./auth";
import type { AppContext, AppEnv } from "./session";
import { currentUser, setSessionCookie } from "./session";

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

const SEED_CLIENT = { clientName: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"], tokenEndpointAuthMethod: "none" };

/** An authorization request from a freshly registered seed client, as Claude would send it. */
async function seedRequestPath(c: AppContext): Promise<string> {
  const origin = new URL(c.req.url).origin;
  const client = await oauthApi(c.env, origin).createClient(SEED_CLIENT);
  const query = new URLSearchParams({
    response_type: "code",
    client_id: client.clientId,
    redirect_uri: SEED_CLIENT.redirectUris[0] as string,
    // Any valid S256 challenge: nothing will exchange this request's code.
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    state: "app-render",
    scope: "mcp:read mcp:write offline_access",
    resource: `${origin}/mcp`,
  });
  return `/authorize?${query.toString()}`;
}

dev.get("/consent", async (c) => {
  if (!devSessionAllowed(c.env, c.req.url)) return c.notFound();
  return c.redirect(await seedRequestPath(c), 303);
});

dev.get("/assistant", async (c) => {
  if (!devSessionAllowed(c.env, c.req.url)) return c.notFound();
  const found = await currentUser(c);
  if (!found) return c.text("Sign in first: /dev/session?next=/dev/assistant", 401);
  const oauth = oauthApi(c.env, new URL(c.req.url).origin);
  // app-render opens a route more than once; the picture is of one grant.
  if ((await oauth.listUserGrants(found.user.id)).items.length > 0) return c.redirect("/assistants", 303);
  const request = await oauth.parseAuthRequest(new Request(new URL(await seedRequestPath(c), c.req.url)));
  await oauth.completeAuthorization({ request, userId: found.user.id, metadata: {}, scope: request.scope, props: { userId: found.user.id } });
  return c.redirect("/assistants", 303);
});
