// Helpers for the assistant side: register a client by DCR, run Consent for a
// signed-in owner, exchange the code with PKCE, and talk to /mcp with the MCP
// SDK's own client (ADR 0002 (c), ADR 0001).

import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { Client as McpClient, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect } from "vitest";
import app from "../src/index";
import { Client, ORIGIN } from "./helpers";

export const CLAUDE_REDIRECT = "https://claude.ai/api/mcp/auth_callback";
export const RESOURCE = `${ORIGIN}/mcp`;

/** Send one request through the Worker, as an assistant's server would: no cookies, no Origin. */
export async function call(input: string | URL | Request, init: RequestInit = {}, testEnv: Cloudflare.Env = env): Promise<Response> {
  const request = new Request(input instanceof Request ? input : new URL(String(input), ORIGIN), { ...init, redirect: "manual" });
  const ctx = createExecutionContext();
  const response = await app.fetch(request, testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

/** RFC 7591 registration of a public client, the way Claude's "Register automatically" does it. */
export async function registerClient(name = "Claude", redirectUri = CLAUDE_REDIRECT, origin = ORIGIN): Promise<string> {
  const response = await call(`${origin}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { client_id: string };
  return body.client_id;
}

export interface AuthorizeRequest {
  clientId: string;
  challenge: string;
  scope?: string;
  state?: string;
  redirectUri?: string;
  resource?: string;
}

export function authorizePath(r: AuthorizeRequest): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: r.clientId,
    redirect_uri: r.redirectUri ?? CLAUDE_REDIRECT,
    code_challenge: r.challenge,
    code_challenge_method: "S256",
    state: r.state ?? "state-123",
    scope: r.scope ?? "mcp:read mcp:write offline_access",
    resource: r.resource ?? RESOURCE,
  });
  return `/authorize?${q.toString()}`;
}

/** Pull the consent handle out of the rendered Consent page. */
export function handleIn(html: string): string {
  const handle = html.match(/name="handle" value="([^"]+)"/)?.[1];
  if (!handle) throw new Error("No consent handle on the page.");
  return handle;
}

/** Open Consent as a signed-in owner and press Allow (or Deny). Returns the redirect back to the client. */
export async function consent(browser: Client, r: AuthorizeRequest, decision: "allow" | "deny" = "allow"): Promise<URL> {
  const page = await browser.get(authorizePath(r));
  expect(page.status).toBe(200);
  const handle = handleIn(await page.text());
  const answer = await browser.post("/authorize", { handle, decision });
  expect(answer.status).toBe(302);
  return new URL(answer.headers.get("Location") ?? "");
}

export interface Tokens {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  expires_in: number;
}

export async function tokenRequest(fields: Record<string, string>, origin = ORIGIN): Promise<Response> {
  return call(`${origin}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
}

export async function exchangeCode(code: string, verifier: string, clientId: string, origin = ORIGIN): Promise<Response> {
  return tokenRequest(
    { grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientId, redirect_uri: CLAUDE_REDIRECT, resource: `${origin}/mcp` },
    origin,
  );
}

/** The whole flow for a signed-in owner: register, consent, exchange. */
export async function connectAssistant(browser: Client, scope = "mcp:read mcp:write offline_access", origin = ORIGIN): Promise<Tokens & { clientId: string }> {
  const clientId = await registerClient("Claude", CLAUDE_REDIRECT, origin);
  const { verifier, challenge } = await pkce();
  const back = await consent(browser, { clientId, challenge, scope, resource: `${origin}/mcp` });
  const code = back.searchParams.get("code");
  expect(code).toBeTruthy();
  const response = await exchangeCode(code ?? "", verifier, clientId, origin);
  expect(response.status).toBe(200);
  return { ...((await response.json()) as Tokens), clientId };
}

/** An MCP SDK client connected to /mcp with this token, offering exactly this protocol version. */
export async function mcpClient(token: string, protocolVersion = "2025-11-25", origin = ORIGIN): Promise<McpClient> {
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: (url, init) => call(String(url), init),
  });
  const client = new McpClient({ name: "fridgie-test", version: "1.0.0" }, { supportedProtocolVersions: [protocolVersion] });
  await client.connect(transport);
  return client;
}

/** A raw JSON-RPC tools/call over HTTP, for asserting status codes the SDK client turns into exceptions. */
export async function rawToolCall(token: string | null, name: string, args: Record<string, unknown>, path = "/mcp"): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return call(path, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
}
