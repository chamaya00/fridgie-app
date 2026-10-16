// Who may see and change what (#7 criterion 1).

import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addItem, getItem, listItems, recordUse, removeItem, ServiceError } from "../src/service/inventory";
import { DEV_GITHUB_ID } from "../src/web/dev";
import { GITHUB_TOKEN_URL, GITHUB_USER_URL } from "../src/web/auth";
import { SESSION_COOKIE } from "../src/web/session";
import { Client, eventsOf, inputValue, itemRowsOf, signedIn, textOf } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  return (await env.DB.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

/** Stand in for GitHub: the code exchange, then GET /user returning this profile. */
function fakeGithub(profile: { id: number; login: string }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, init });
    if (url === GITHUB_TOKEN_URL) return Response.json({ access_token: "gho_test", token_type: "bearer", scope: "" });
    if (url === GITHUB_USER_URL) return Response.json(profile);
    return new Response("unexpected", { status: 500 });
  });
  return calls;
}

/** Run the sign-in round trip: /auth/github, then GitHub's redirect back to the callback. */
async function completeSignIn(client: Client): Promise<Response> {
  const start = await client.get("/auth/github");
  expect(start.status).toBe(302);
  const authorize = new URL(start.headers.get("Location") ?? "");
  expect(authorize.origin + authorize.pathname).toBe("https://github.com/login/oauth/authorize");
  expect(authorize.searchParams.has("scope")).toBe(false);
  return client.get(`/auth/github/callback?code=abc&state=${authorize.searchParams.get("state") ?? ""}`);
}

describe("signed out", () => {
  it("gets the Signed out page, with no inventory data, for every inventory page", async () => {
    const { user } = await signedIn();
    const { item } = await addItem(env.DB, user.id, { name: "Secret cheese", place: "fridge", unit: null, lowAt: null, purchase: null, clientRef: null, source: "web" });
    const anon = new Client();
    for (const path of ["/", "/items/new", `/items/${item.id}`, `/items/${item.id}/bought`, `/items/${item.id}/edit`, `/items/${item.id}/remove`]) {
      const response = await anon.get(path);
      const html = await textOf(response);
      expect([200, 401], path).toContain(response.status);
      expect(html, path).toContain("Sign in with GitHub");
      expect(html, path).not.toContain("Secret cheese");
      expect(html, path).not.toContain('class="row');
    }
  });

  it("gets a 401 from every data endpoint, and nothing is written", async () => {
    const { user } = await signedIn();
    const { item } = await addItem(env.DB, user.id, { name: "Bread", place: "pantry", unit: null, lowAt: null, purchase: null, clientRef: null, source: "web" });
    const anon = new Client();
    for (const path of ["/items", `/items/${item.id}/used`, `/items/${item.id}/out`, `/items/${item.id}/bought`, `/items/${item.id}/quantity`, `/items/${item.id}/low-at`, `/items/${item.id}/discard`, `/items/${item.id}/edit`, `/items/${item.id}/remove`]) {
      const response = await anon.post(path, { name: "x", quantity: "1", client_ref: "abcdefgh12" });
      expect(response.status, path).toBe(401);
    }
    expect(await eventsOf(user.id)).toEqual([]);
    expect(await itemRowsOf(user.id)).toHaveLength(1);
  });

  it("a tampered session cookie is not a session", async () => {
    const { client } = await signedIn();
    const value = client.cookies.get(SESSION_COOKIE) ?? "";
    client.cookies.set(SESSION_COOKIE, value.replace(/^./, (ch) => (ch === "a" ? "b" : "a")));
    expect(await client.html("/")).toContain("Sign in with GitHub");
  });
});

describe("GitHub sign-in", () => {
  it("not invited: shows the account, saves nothing, and offers another account", async () => {
    const usersBefore = await count("SELECT COUNT(*) AS n FROM users");
    const sessionsBefore = await count("SELECT COUNT(*) AS n FROM sessions");
    fakeGithub({ id: 4242, login: "jo-somebody" });
    const client = new Client();
    const response = await completeSignIn(client);
    const html = await textOf(response);
    expect(response.status).toBe(403);
    expect(html).toContain("You're not invited.");
    expect(html).toContain("@jo-somebody");
    expect(html).toContain("Nothing was saved about you.");
    expect(html).toContain("Try another GitHub account");
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE github_id = 4242")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM users")).toBe(usersBefore);
    expect(await count("SELECT COUNT(*) AS n FROM sessions")).toBe(sessionsBefore);
    expect(client.cookies.has(SESSION_COOKIE)).toBe(false);
  });

  it("allowed: creates the user by numeric id, starts a session, and asks GitHub for no scopes", async () => {
    const calls = fakeGithub({ id: 1001, login: "owner" });
    const client = new Client();
    const response = await completeSignIn(client);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/");
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE github_id = 1001")).toBe(1);
    expect(client.cookies.has(SESSION_COOKIE)).toBe(true);
    expect(await client.html("/")).toContain("+ Add item");
    expect(calls.map((c) => c.url)).toEqual([GITHUB_TOKEN_URL, GITHUB_USER_URL]);
  });

  it("refuses a callback whose state does not match", async () => {
    fakeGithub({ id: 1001, login: "owner" });
    const client = new Client();
    await client.get("/auth/github");
    const response = await client.get("/auth/github/callback?code=abc&state=forged");
    expect(response.status).toBe(400);
    expect(client.cookies.has(SESSION_COOKIE)).toBe(false);
  });

  it("signing out ends the session", async () => {
    const { client } = await signedIn();
    expect(await client.html("/")).toContain("+ Add item");
    const token = client.cookies.get(SESSION_COOKIE);
    await client.post("/auth/sign-out", {});
    expect(client.cookies.has(SESSION_COOKIE)).toBe(false);
    if (token) client.cookies.set(SESSION_COOKIE, token);
    expect(await client.html("/")).toContain("Sign in with GitHub");
  });
});

describe("users A and B", () => {
  it("A can list, read, change or remove none of B's items, even by B's item id", async () => {
    const a = await signedIn();
    const b = await signedIn();
    await a.client.post("/items", { name: "Apples", place: "fridge", quantity: "3", unit: "", price: "", client_ref: "a-apples-1" });
    await b.client.post("/items", { name: "Bananas", place: "pantry", quantity: "6", unit: "", price: "2.00", client_ref: "b-bananas-1" });
    const [bItem] = await listItems(env.DB, b.user.id, new Date());
    expect(bItem?.name).toBe("Bananas");
    const bId = bItem!.id;
    const bEventsBefore = await eventsOf(b.user.id);
    const bItemsBefore = await itemRowsOf(b.user.id);

    // List
    const home = await a.client.html("/");
    expect(home).toContain("Apples");
    expect(home).not.toContain("Bananas");
    expect((await listItems(env.DB, a.user.id, new Date())).map((i) => i.name)).toEqual(["Apples"]);

    // Read
    for (const path of [`/items/${bId}`, `/items/${bId}/bought`, `/items/${bId}/edit`, `/items/${bId}/remove`]) {
      const response = await a.client.get(path);
      expect(response.status, path).toBe(404);
      expect(await response.text(), path).not.toContain("Bananas");
    }
    expect(await getItem(env.DB, a.user.id, bId, new Date())).toBeNull();

    // Change and remove
    const posts: [string, Record<string, string>][] = [
      [`/items/${bId}/used`, {}],
      [`/items/${bId}/out`, {}],
      [`/items/${bId}/bought`, { quantity: "1", price: "", when: "" }],
      [`/items/${bId}/quantity`, { quantity: "9", set: "1" }],
      [`/items/${bId}/low-at`, { low_at: "4" }],
      [`/items/${bId}/discard`, { quantity: "1" }],
      [`/items/${bId}/edit`, { name: "Mine now", place: "fridge", unit: "" }],
      [`/items/${bId}/remove`, {}],
    ];
    for (const [path, fields] of posts) {
      const response = await a.client.post(path, { ...fields, client_ref: `a-attack-${path.split("/").at(-1)}` });
      expect(response.status, path).toBe(404);
    }
    await expect(recordUse(env.DB, a.user.id, bId, { quantity: 1, reason: "used", occurredAt: new Date(), clientRef: null, source: "web" })).rejects.toBeInstanceOf(ServiceError);
    await expect(removeItem(env.DB, a.user.id, bId)).rejects.toBeInstanceOf(ServiceError);

    expect(await eventsOf(b.user.id)).toEqual(bEventsBefore);
    expect(await itemRowsOf(b.user.id)).toEqual(bItemsBefore);
    expect(await eventsOf(a.user.id)).toHaveLength(1);
  });

  it("A reusing B's client_ref still writes A's own event", async () => {
    const a = await signedIn();
    const b = await signedIn();
    await a.client.post("/items", { name: "Kale", place: "fridge", quantity: "1", unit: "", price: "", client_ref: "shared-ref-123" });
    await b.client.post("/items", { name: "Kale", place: "fridge", quantity: "1", unit: "", price: "", client_ref: "shared-ref-123" });
    expect(await eventsOf(a.user.id)).toHaveLength(1);
    expect(await eventsOf(b.user.id)).toHaveLength(1);
  });
});

describe("the session-seeding mechanism", () => {
  it("is refused by the Worker as configured for deploy, and creates no session", async () => {
    // env is wrangler.jsonc plus the test secrets: the deploy configuration.
    expect(env.DEV_SESSION_SEEDING).toBeUndefined();
    const usersBefore = await count("SELECT COUNT(*) AS n FROM users");
    const sessionsBefore = await count("SELECT COUNT(*) AS n FROM sessions");
    for (const origin of ["https://fridgie.example.workers.dev", "http://localhost:8787", "http://127.0.0.1:8787"]) {
      const client = new Client(env, origin);
      const response = await client.get("/dev/session?next=/");
      expect(response.status, origin).toBe(404);
      expect(client.cookies.has(SESSION_COOKIE), origin).toBe(false);
    }
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE github_id = ?1", DEV_GITHUB_ID)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM users")).toBe(usersBefore);
    expect(await count("SELECT COUNT(*) AS n FROM sessions")).toBe(sessionsBefore);
  });

  it("is refused on a deployed host even if the flag were set", async () => {
    const client = new Client({ ...env, DEV_SESSION_SEEDING: "1" }, "https://fridgie.example.workers.dev");
    const response = await client.get("/dev/session?next=/");
    expect(response.status).toBe(404);
    expect(client.cookies.has(SESSION_COOKIE)).toBe(false);
  });

  it("works only with the flag on localhost (the control that shows the refusals mean something)", async () => {
    const client = new Client({ ...env, DEV_SESSION_SEEDING: "1" }, "http://localhost:8787");
    const response = await client.get("/dev/session?next=/items/itm_seed_milk");
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/items/itm_seed_milk");
    expect(client.cookies.has(SESSION_COOKIE)).toBe(true);
    const html = await client.html("/items/itm_seed_milk");
    expect(html).toContain("Milk");
    expect(inputValue(html, "client_ref")).toBeDefined();
  });
});
