// The Fridgie Worker. One service, two clients (ADR 0003): the web app, and
// assistants over MCP behind Fridgie's own OAuth server (ADR 0001, ADR 0002).
// Both reach the data only through src/service/.

import { Hono } from "hono";
import type { AppContext, AppEnv } from "./web/session";
import { sameOriginPosts } from "./web/session";
import { MCP_PATH, oauthFor, REGISTER_PATH, TOKEN_PATH } from "./oauth";
import { assistants } from "./web/assistants";
import { auth } from "./web/auth";
import { authorize } from "./web/authorize";
import { dev } from "./web/dev";
import { inventory } from "./web/inventory";
import { NotFoundPage, renderPage } from "./web/views";

export const app = new Hono<AppEnv>();

/** The one Content-Security-Policy. No script runs on any page this Worker serves (design spec section 8). */
export function contentSecurityPolicy(formActionOrigins: readonly string[] = []): string {
  const formAction = ["'self'", "https://github.com", ...formActionOrigins].join(" ");
  return `default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`;
}

app.use("*", async (c, next) => {
  await next();
  // A Response the OAuth library built may have immutable headers; this copy does not.
  c.res = new Response(c.res.body, c.res);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header("X-Frame-Options", "DENY");
  c.header("Content-Security-Policy", contentSecurityPolicy(c.get("formActionOrigins")));
});

// The OAuth server's own endpoints and the protected resource. Assistants call
// these from their own servers, or from a browser on another origin, so they
// sit before the same-origin check that guards the web app's forms.
// Hono types its context's ExecutionContext more loosely than workers-types; it is the same object.
const ctxOf = (c: AppContext) => c.executionCtx as ExecutionContext;
const authorizationServer = (c: AppContext) => oauthFor(new URL(c.req.url).origin).authorizationServer.fetch(c.req.raw, c.env, ctxOf(c));
const resourceServer = (c: AppContext) => oauthFor(new URL(c.req.url).origin).resourceServer.fetch(c.req.raw, c.env, ctxOf(c));

app.all(TOKEN_PATH, authorizationServer);
app.all(REGISTER_PATH, authorizationServer);
app.all("/.well-known/oauth-authorization-server", authorizationServer);
app.all(MCP_PATH, resourceServer);
app.all(`${MCP_PATH}/*`, resourceServer);
app.all(`/.well-known/oauth-protected-resource${MCP_PATH}`, resourceServer);
// ADR 0002 (c) 2 names the bare path as well; it describes the one resource.
app.all("/.well-known/oauth-protected-resource", (c) => {
  const url = new URL(c.req.url);
  url.pathname = `/.well-known/oauth-protected-resource${MCP_PATH}`;
  return oauthFor(url.origin).resourceServer.fetch(new Request(url, c.req.raw), c.env, ctxOf(c));
});

app.use("*", sameOriginPosts);
app.route("/auth", auth);
app.route("/authorize", authorize);
app.route("/assistants", assistants);
app.route("/dev", dev);
app.route("/", inventory);
app.notFound((c) => c.html(renderPage("Not here", NotFoundPage()), 404));

export default app;
