// /assistants: Connected assistants (spec section 7, ADR 0002 (b)). One card
// per grant; Disconnect revokes the grant with its tokens, in one tap.

import type { GrantSummary, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { MCP_PATH, oauthApi } from "../oauth";
import type { AppContext, AppEnv } from "./session";
import { requireUser, setFlash, takeFlash } from "./session";
import type { AssistantView } from "./views";
import { AssistantsPage, renderPage } from "./views";

function api(c: AppContext): OAuthHelpers {
  return oauthApi(c.env, new URL(c.req.url).origin);
}

/** A grant as its card shows it. The name is the client's own; the host is where its tokens went. */
async function describe(oauth: OAuthHelpers, grant: GrantSummary): Promise<AssistantView> {
  const client = await oauth.lookupClient(grant.clientId).catch(() => null);
  const redirect = grant.redirectUri ?? client?.redirectUris[0];
  let host: string;
  try {
    host = redirect ? new URL(redirect).hostname : "";
  } catch {
    host = "";
  }
  return {
    grantId: grant.id,
    name: client?.clientName?.trim() || grant.clientId,
    host,
    connected: new Date(grant.createdAt * 1000),
  };
}

async function grantsOf(oauth: OAuthHelpers, userId: string): Promise<GrantSummary[]> {
  const grants: GrantSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await oauth.listUserGrants(userId, cursor === undefined ? {} : { cursor });
    grants.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  return grants.sort((a, b) => b.createdAt - a.createdAt);
}

export const assistants = new Hono<AppEnv>();
assistants.use("*", requireUser);

assistants.get("/", async (c) => {
  const oauth = api(c);
  const views = await Promise.all((await grantsOf(oauth, c.var.user.id)).map((g) => describe(oauth, g)));
  const flash = await takeFlash(c);
  const mcpUrl = `${new URL(c.req.url).origin}${MCP_PATH}`;
  return c.html(renderPage("Connected assistants", AssistantsPage({ assistants: views, mcpUrl, ...(flash ? { flash } : {}) })));
});

assistants.post("/:grantId/disconnect", async (c) => {
  const oauth = api(c);
  const grantId = c.req.param("grantId");
  const grant = (await grantsOf(oauth, c.var.user.id)).find((g) => g.id === grantId);
  if (grant) {
    const { name } = await describe(oauth, grant);
    await oauth.revokeGrant(grant.id, c.var.user.id);
    await setFlash(c, { text: `${name} is disconnected.` });
  }
  return c.redirect("/assistants", 303);
});
