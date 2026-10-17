// #8 criterion 4: the authorization flow ADR 0002 (c) specifies, end to end on
// a local instance, and its two pages.

import { afterEach, describe, expect, it, vi } from "vitest";
import { GITHUB_TOKEN_URL, GITHUB_USER_URL } from "../src/web/auth";
import { Client, decode, ORIGIN, signedIn, textOf } from "./helpers";
import {
  authorizePath,
  call,
  CLAUDE_REDIRECT,
  connectAssistant,
  consent,
  exchangeCode,
  handleIn,
  pkce,
  rawToolCall,
  registerClient,
  RESOURCE,
  tokenRequest,
  type Tokens,
} from "./oauth";

afterEach(() => {
  vi.restoreAllMocks();
});

/** What src/index.ts sent on every page before #8, and still sends on every page but Consent. */
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self' https://github.com; frame-ancestors 'none'; base-uri 'none'";

/** Stand in for GitHub's code exchange and GET /user. */
function fakeGithub(profile: { id: number; login: string }) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === GITHUB_TOKEN_URL) return Response.json({ access_token: "gho_test", token_type: "bearer", scope: "" });
    if (url === GITHUB_USER_URL) return Response.json(profile);
    return new Response("unexpected", { status: 500 });
  });
}

/** Follow /auth/github?next=… through GitHub's redirect back to the callback. */
async function signInThrough(browser: Client, signInPath: string): Promise<Response> {
  const start = await browser.get(signInPath);
  expect(start.status).toBe(302);
  const github = new URL(start.headers.get("Location") ?? "");
  expect(github.origin).toBe("https://github.com");
  return browser.get(`/auth/github/callback?code=abc&state=${github.searchParams.get("state") ?? ""}`);
}

function formAction(csp: string | null): string[] {
  return (csp ?? "").split(";").map((d) => d.trim()).find((d) => d.startsWith("form-action"))?.split(/\s+/).slice(1) ?? [];
}

describe("discovery (#8 criterion 4)", () => {
  it("publishes protected resource metadata naming /mcp and Fridgie's issuer alone", async () => {
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      const response = await call(path);
      expect(response.status, path).toBe(200);
      const body = (await response.json()) as { resource: string; authorization_servers: string[] };
      expect(body.resource, path).toBe(`${ORIGIN}/mcp`);
      expect(body.authorization_servers, path).toEqual([ORIGIN]);
    }
  });

  it("publishes authorization server metadata with S256, the three scopes, auth method none and CIMD", async () => {
    const response = await call("/.well-known/oauth-authorization-server");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.issuer).toBe(ORIGIN);
    expect(body.authorization_endpoint).toBe(`${ORIGIN}/authorize`);
    expect(body.token_endpoint).toBe(`${ORIGIN}/token`);
    expect(body.registration_endpoint).toBe(`${ORIGIN}/register`);
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
    expect(body.scopes_supported).toEqual(expect.arrayContaining(["mcp:read", "mcp:write", "offline_access"]));
    expect(body.token_endpoint_auth_methods_supported).toContain("none");
    expect(body.client_id_metadata_document_supported).toBe(true);
  });
});

describe("authorize: sign-in, Consent, Allow and Deny (#8 criterion 4)", () => {
  it("takes a signed-out browser through GitHub sign-in and back to /authorize with every parameter unchanged", async () => {
    const clientId = await registerClient("Claude");
    const { challenge } = await pkce();
    const path = authorizePath({ clientId, challenge, state: "st/ate+with=odd&chars" });
    const browser = new Client();

    const first = await browser.get(path);
    expect(first.status).toBe(302);
    const signIn = first.headers.get("Location") ?? "";
    expect(signIn.startsWith("/auth/github?next=")).toBe(true);

    fakeGithub({ id: 1001, login: "owner" });
    const callback = await signInThrough(browser, signIn);
    expect(callback.status).toBe(303);
    const back = callback.headers.get("Location") ?? "";
    expect(back).toBe(path);
    const original = new URL(path, ORIGIN).searchParams;
    const returned = new URL(back, ORIGIN).searchParams;
    expect([...returned].sort()).toEqual([...original].sort());
    expect(returned.get("state")).toBe("st/ate+with=odd&chars");

    const page = await browser.get(back);
    expect(page.status).toBe(200);
    const html = decode(await page.text());
    expect(html).toContain("Connect Claude to your Fridgie?");
    expect(html).toContain('you\'ll go back to <span class="host">claude.ai</span>');
    expect(html).toContain("Only allow this if you just asked Claude to connect.");
    expect(html).toContain("See your fridge and pantry, and what's low or out");
    expect(html).toContain("Record what you buy and use, change quantities, add and remove items");
    expect(html).toContain("Signed in as <b>@owner</b>");
    expect(html).toMatch(/<button[^>]*value="allow"[^>]*>Allow<\/button>/);
    expect(html).toMatch(/<button[^>]*value="deny"[^>]*>Deny<\/button>/);
    expect(html.toLowerCase()).not.toContain("<script");
  });

  it("refuses a GitHub ID not on the allow-list, and shows it no Consent", async () => {
    const clientId = await registerClient("Claude");
    const { challenge } = await pkce();
    const path = authorizePath({ clientId, challenge });
    const browser = new Client();
    const first = await browser.get(path);
    fakeGithub({ id: 999_999, login: "stranger" });
    const callback = await signInThrough(browser, first.headers.get("Location") ?? "");
    expect(callback.status).toBe(403);
    const html = await textOf(callback);
    expect(html).toContain("You're not invited.");
    expect(html).not.toContain('name="handle"');
    const again = await browser.get(path);
    expect(again.status).toBe(302);
    expect(again.headers.get("Location")).toMatch(/^\/auth\/github\?next=/);
  });

  it("returns access_denied, with the state, on Deny", async () => {
    const { client: browser } = await signedIn();
    const clientId = await registerClient("Claude");
    const { challenge } = await pkce();
    const back = await consent(browser, { clientId, challenge, state: "deny-state" }, "deny");
    expect(back.origin + back.pathname).toBe(CLAUDE_REDIRECT);
    expect(back.searchParams.get("error")).toBe("access_denied");
    expect(back.searchParams.get("state")).toBe("deny-state");
    expect(back.searchParams.get("code")).toBeNull();
  });

  it("lets Consent's form hand back to the client's origin, and changes no other page's policy", async () => {
    const { client: browser } = await signedIn();
    const clientId = await registerClient("Claude", CLAUDE_REDIRECT);
    const { challenge } = await pkce();
    const page = await browser.get(authorizePath({ clientId, challenge }));
    expect(page.status).toBe(200);
    expect(formAction(page.headers.get("Content-Security-Policy"))).toEqual(["'self'", "https://github.com", "https://claude.ai"]);
    expect(page.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");

    const inventory = await browser.get("/");
    expect(inventory.status).toBe(200);
    expect(inventory.headers.get("Content-Security-Policy")).toBe(PAGE_CSP);
  });

  it("will not show Consent for a redirect URI the client did not register", async () => {
    const { client: browser } = await signedIn();
    const clientId = await registerClient("Claude", CLAUDE_REDIRECT);
    const { challenge } = await pkce();
    const page = await browser.get(authorizePath({ clientId, challenge, redirectUri: "https://evil.example/cb" }));
    expect(page.status).toBe(400);
    expect(page.headers.get("Location")).toBeNull();
    expect(await page.text()).not.toContain('name="handle"');
  });

  it("will not take a consent form from a browser that did not open it", async () => {
    const { client: browser } = await signedIn();
    const { client: other } = await signedIn();
    const clientId = await registerClient("Claude");
    const { challenge } = await pkce();
    const handle = handleIn(await (await browser.get(authorizePath({ clientId, challenge }))).text());
    const forged = await other.post("/authorize", { handle, decision: "allow" });
    expect(forged.status).toBe(400);
    expect(forged.headers.get("Location")).toBeNull();
  });
});

describe("tokens: PKCE, refresh rotation, and a tool call (#8 criterion 4)", () => {
  it("exchanges the code only with the matching verifier", async () => {
    const { client: browser } = await signedIn();
    const clientId = await registerClient("Claude");
    const right = await pkce();
    const wrong = await pkce();

    const refused = await consent(browser, { clientId, challenge: right.challenge });
    const bad = await exchangeCode(refused.searchParams.get("code") ?? "", wrong.verifier, clientId);
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe("invalid_grant");

    const allowed = await consent(browser, { clientId, challenge: right.challenge });
    expect(allowed.searchParams.get("iss")).toBe(ORIGIN);
    const good = await exchangeCode(allowed.searchParams.get("code") ?? "", right.verifier, clientId);
    expect(good.status).toBe(200);
    const tokens = (await good.json()) as Tokens & { resource?: string };
    expect(tokens.token_type.toLowerCase()).toBe("bearer");
    expect(tokens.expires_in).toBe(3600);
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.scope?.split(" ").sort()).toEqual(["mcp:read", "mcp:write", "offline_access"]);
  });

  it("rotates the refresh token, and a tool call with the issued token succeeds", async () => {
    const { client: browser } = await signedIn();
    const first = await connectAssistant(browser);
    const refreshed = await tokenRequest({ grant_type: "refresh_token", refresh_token: first.refresh_token ?? "", client_id: first.clientId, resource: RESOURCE });
    expect(refreshed.status).toBe(200);
    const second = (await refreshed.json()) as Tokens;
    expect(second.refresh_token).toBeTruthy();
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(second.access_token).not.toBe(first.access_token);

    // Using the new refresh token retires the old one.
    expect((await tokenRequest({ grant_type: "refresh_token", refresh_token: second.refresh_token ?? "", client_id: first.clientId })).status).toBe(200);
    const stale = await tokenRequest({ grant_type: "refresh_token", refresh_token: first.refresh_token ?? "", client_id: first.clientId });
    expect(stale.status).toBe(400);
    expect(((await stale.json()) as { error: string }).error).toBe("invalid_grant");

    const tool = await rawToolCall(second.access_token, "list_inventory", {});
    expect(tool.status).toBe(200);
    expect(await tool.text()).toContain('\\"items\\"');
  });
});

describe("Connected assistants (#8 criterion 4)", () => {
  it("answers the TopBar's Assistants link with 200, showing the empty state with the real /mcp URL", async () => {
    const { client: browser } = await signedIn();
    expect(await browser.html("/")).toContain('href="/assistants"');
    const response = await browser.get("/assistants");
    expect(response.status).toBe(200);
    const html = await textOf(response);
    expect(html).toContain("No assistants connected");
    expect(html).toContain(`Paste <span class="host">${ORIGIN}/mcp</span>`);
    expect(html).toContain('href="/auth/sign-out"');
    expect(html).toMatch(/<a class="link" href="\/">Inventory<\/a>/);
    expect(html.toLowerCase()).not.toContain("<script");
    expect(response.headers.get("Content-Security-Policy")).toBe(PAGE_CSP);
  });

  it("lists a grant with its host and date, and Disconnect removes it with the banner", async () => {
    const { client: browser } = await signedIn();
    await connectAssistant(browser);
    const html = await browser.html("/assistants");
    const today = new Date();
    const month = today.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    expect(html).toContain('<span class="nm">Claude</span>');
    expect(html).toContain(`Returns to claude.ai · connected ${month} ${today.getUTCDate()}, ${today.getUTCFullYear()}`);
    expect(html).toContain("Removing Fridgie inside Claude doesn't disconnect it here. This page is the one that does.");

    const action = html.match(/action="(\/assistants\/[^"]+\/disconnect)"/)?.[1] ?? "";
    const disconnect = await browser.post(action, {});
    expect(disconnect.status).toBe(303);
    expect(disconnect.headers.get("Location")).toBe("/assistants");
    const after = await browser.html("/assistants");
    expect(after).toContain("Claude is disconnected.");
    expect(after).toContain("No assistants connected");
  });

  it("does not let one owner disconnect another's grant", async () => {
    const a = await signedIn();
    const b = await signedIn();
    const tokens = await connectAssistant(a.client);
    const action = (await a.client.html("/assistants")).match(/action="(\/assistants\/[^"]+\/disconnect)"/)?.[1] ?? "";
    expect((await b.client.post(action, {})).status).toBe(303);
    expect((await rawToolCall(tokens.access_token, "list_inventory", {})).status).toBe(200);
  });

  it("signed out, gets the Signed out page, and signing in returns to /assistants", async () => {
    const browser = new Client();
    const response = await browser.get("/assistants");
    const html = await textOf(response);
    expect(html).toContain("Sign in with GitHub");
    expect(html).not.toContain("Connected assistants");
    const signIn = html.match(/href="(\/auth\/github\?next=[^"]+)"/)?.[1] ?? "";
    expect(decodeURIComponent(signIn)).toBe("/auth/github?next=/assistants");
    fakeGithub({ id: 1002, login: "owner2" });
    const callback = await signInThrough(browser, signIn);
    expect(callback.status).toBe(303);
    expect(callback.headers.get("Location")).toBe("/assistants");
    expect((await browser.get("/assistants")).status).toBe(200);
  });
});

describe("the assistant side has no browser session to lean on", () => {
  it("accepts token requests from another origin's browser client", async () => {
    const response = await call("/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://inspector.example" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: "nope", client_id: "nope" }),
    });
    // Answered by the OAuth server (an unknown client is invalid_client), not refused as a cross-site form post (403).
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: string }).error).toBe("invalid_client");
  });
});
