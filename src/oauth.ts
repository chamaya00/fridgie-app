// Fridgie as the OAuth 2.1 authorization server and the protected resource for
// /mcp (ADR 0002 "Agent authentication"), on @cloudflare/workers-oauth-provider.
//
// The library fixes its issuer and resource when it is constructed, and the
// host is only known per request (fridgie.<subdomain>.workers.dev deployed,
// localhost under wrangler dev, an example host in tests). So both roles are
// built once per origin and kept for the life of the isolate. Grants live in
// OAUTH_KV whatever the origin.

import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { OAuthAuthorizationServer, OAuthResourceServer } from "@cloudflare/workers-oauth-provider";
import type { Env } from "./env";
import { serveMcp } from "./mcp/server";
import type { AuthProps } from "./mcp/server";
import { SCOPE_READ, SCOPE_WRITE } from "./mcp/tools";

export const SCOPES_SUPPORTED = [SCOPE_READ, SCOPE_WRITE, "offline_access"];

export const AUTHORIZE_PATH = "/authorize";
export const TOKEN_PATH = "/token";
export const REGISTER_PATH = "/register";
export const MCP_PATH = "/mcp";

const DAY_SECONDS = 86_400;

export interface OAuthRoles {
  issuer: string;
  resource: string;
  authorizationServer: OAuthAuthorizationServer<Env>;
  resourceServer: OAuthResourceServer<Env, AuthProps>;
}

const roles = new Map<string, OAuthRoles>();

export function oauthFor(origin: string): OAuthRoles {
  const known = roles.get(origin);
  if (known) return known;
  const issuer = origin;
  const resource = `${origin}${MCP_PATH}`;
  const authorizationServer = new OAuthAuthorizationServer<Env>({
    issuer,
    resources: [resource],
    authorizeEndpoint: AUTHORIZE_PATH,
    tokenEndpoint: TOKEN_PATH,
    clientRegistrationEndpoint: REGISTER_PATH,
    scopesSupported: SCOPES_SUPPORTED,
    clientIdMetadataDocumentEnabled: true,
    accessTokenTTL: 3600,
    refreshTokenTTL: 30 * DAY_SECONDS,
    // ADR 0002 (c) 7: 30 days, renewed on rotation.
    refreshTokenIdleTTL: 30 * DAY_SECONDS,
  });
  const resourceServer = new OAuthResourceServer<Env, AuthProps>({
    resourceMetadata: { resource, authorization_servers: [issuer] },
    // What an assistant asks for first. The owner connects one to read and to
    // record, so both are the baseline; a token with less gets a 403 to step up.
    requiredScopes: [SCOPE_READ, SCOPE_WRITE],
    validateToken: (env) => (res, token) => authorizationServer.validateToken(res, token, env),
    handler: { fetch: serveMcp },
  });
  const made = { issuer, resource, authorizationServer, resourceServer };
  roles.set(origin, made);
  return made;
}

export function oauthApi(env: Env, origin: string): OAuthHelpers {
  return oauthFor(origin).authorizationServer.getOAuthApi(env);
}
