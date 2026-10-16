// /authorize: the authorization endpoint ADR 0002 (c) leaves to the
// application. It signs the owner in with the same GitHub sign-in as the web
// app (keeping the whole OAuth request in `next`), shows Consent, and hands
// back to the assistant with a code on Allow or access_denied on Deny.

import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { AuthorizationError, CimdFetchError } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { SCOPE_READ, SCOPE_WRITE } from "../mcp/tools";
import { oauthApi, SCOPES_SUPPORTED } from "../oauth";
import type { AppContext, AppEnv } from "./session";
import { currentUser } from "./session";
import { ConsentPage, OAuthErrorPage, renderPage } from "./views";
import { TERMS } from "../service/terms";

/**
 * The scopes a grant gets: what the client asked for, of what Fridgie offers.
 * A client that asked for neither mcp scope is asking to connect, so it gets
 * both, which is what Consent shows.
 */
export function grantedScopes(requested: readonly string[]): string[] {
  const granted = requested.filter((s) => SCOPES_SUPPORTED.includes(s));
  if (!granted.includes(SCOPE_READ) && !granted.includes(SCOPE_WRITE)) granted.push(SCOPE_READ, SCOPE_WRITE);
  return [...new Set(granted)];
}

function api(c: AppContext): OAuthHelpers {
  return oauthApi(c.env, new URL(c.req.url).origin);
}

/** Errors the library says to redirect back with, or to show here (its docs/consent-page.md). */
function failed(c: AppContext, error: unknown) {
  if (error instanceof AuthorizationError && error.redirectTo) return c.redirect(error.redirectTo, 302);
  if (error instanceof AuthorizationError) return c.html(renderPage("Fridgie", OAuthErrorPage({ message: error.description })), 400);
  if (error instanceof CimdFetchError) return c.html(renderPage("Fridgie", OAuthErrorPage({ message: "This assistant could not be verified." })), 400);
  throw error;
}

export const authorize = new Hono<AppEnv>();

authorize.get("/", async (c) => {
  const oauth = api(c);
  let request: AuthRequest;
  try {
    request = await oauth.parseAuthRequest(c.req.raw);
  } catch (error) {
    return failed(c, error);
  }

  const found = await currentUser(c);
  if (!found) {
    // The whole request rides through sign-in: path and query, unchanged.
    const url = new URL(c.req.url);
    return c.redirect(`/auth/github?next=${encodeURIComponent(url.pathname + url.search)}`, 302);
  }

  let details;
  try {
    details = await oauth.describeConsent(request);
  } catch (error) {
    return failed(c, error);
  }
  const consent = await oauth.beginConsent(request);
  for (const cookie of consent.headers.getSetCookie()) c.header("Set-Cookie", cookie, { append: true });
  c.header("Cache-Control", "no-store");
  // Allow posts here and the answer redirects to the client: Chromium holds
  // that redirect to form-action too, so this page's policy names its origin.
  c.set("formActionOrigins", [new URL(details.redirectUri).origin]);

  const scopes = grantedScopes(request.scope);
  return c.html(
    renderPage(
      `Connect ${details.clientName}`,
      ConsentPage({
        consent: {
          clientName: details.clientName,
          redirectHost: details.redirectHost,
          redirectIsLoopback: details.redirectIsLoopback,
          canRead: scopes.includes(SCOPE_READ),
          canWrite: scopes.includes(SCOPE_WRITE),
          login: found.user.github_login,
          handle: consent.handle,
        },
      }),
    ),
  );
});

authorize.post("/", async (c) => {
  const found = await currentUser(c);
  if (!found) return c.text("Sign in first.", 401);
  const form = await c.req.formData();
  const handle = String(form.get("handle") ?? "");
  const oauth = api(c);
  try {
    if (form.get("decision") !== "allow") {
      const denied = await oauth.denyConsent(c.req.raw, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }
    const approved = await oauth.approveConsent(c.req.raw, handle);
    const scope = grantedScopes(approved.request.scope);
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request,
      userId: found.user.id,
      metadata: {},
      scope,
      props: { userId: found.user.id },
    });
    approved.headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers: approved.headers });
  } catch (error) {
    if (error instanceof AuthorizationError) return c.html(renderPage("Fridgie", OAuthErrorPage({ message: TERMS.consentExpired })), 400);
    throw error;
  }
});
