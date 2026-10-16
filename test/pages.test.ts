// Every page this issue serves, rendered (#7 criterion 4): no script, no undo,
// none of the banned words, labels from the terms module, the Empty inventory
// copy, and Save failed.

import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listItems } from "../src/service/inventory";
import { SEED_IDS } from "../src/service/seed";
import { TERMS } from "../src/service/terms";
import { GITHUB_TOKEN_URL, GITHUB_USER_URL } from "../src/web/auth";
import { Client, decode, eventsOf, inputValue, signedIn, textOf } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A D1 whose reads work and whose every write fails, like a database over its daily limit. */
function failingWrites(db: D1Database): D1Database {
  const isWrite = (sql: string) => /^\s*(INSERT|UPDATE|DELETE)/i.test(sql);
  const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, prop) {
        if (prop === "__sql") return sql;
        if (prop === "bind") return (...args: unknown[]) => wrap(target.bind(...args), sql);
        if (isWrite(sql) && (prop === "run" || prop === "all" || prop === "first" || prop === "raw")) {
          return async () => {
            throw new Error("D1_ERROR: simulated write failure");
          };
        }
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare") return (sql: string) => wrap(target.prepare(sql), sql);
      if (prop === "batch") {
        return async (statements: D1PreparedStatement[]) => {
          if (statements.some((s) => isWrite((s as unknown as { __sql: string }).__sql))) throw new Error("D1_ERROR: simulated write failure");
          return target.batch(statements);
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

const BANNED = /\b(stock|product|grocery|restock)\b/i;

function expectCleanPage(html: string, label: string) {
  expect(html, label).toMatch(/^<!doctype html>/);
  expect(html.toLowerCase(), label).not.toContain("<script");
  expect(html, label).not.toMatch(/undo/i);
  expect(html, label).not.toMatch(BANNED);
}

async function seededClient(): Promise<Client> {
  const client = new Client({ ...env, DEV_SESSION_SEEDING: "1" }, "http://localhost:8787");
  await client.get("/dev/session?next=/");
  return client;
}

// First, before anything below changes the seeded inventory.
describe("the populated inventory", () => {
  it("leads with the Summary, orders rows out, low, untracked, ok, and tells states apart by shape and word", async () => {
    const seeded = await seededClient();
    const html = await seeded.html("/");
    const summaryAt = html.indexOf('class="summary"');
    expect(summaryAt).toBeGreaterThan(0);
    expect(summaryAt).toBeLessThan(html.indexOf('class="groups"'));
    expect(html).toContain('<p class="summary"><span class="w-low">Eggs and milk are low.</span> <span class="w-out">Coffee beans are out.</span></p>');

    const order = [...html.matchAll(/id="item-(itm_[a-z_]+)" data-state="([a-z]+)"/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(order).toEqual([
      `${SEED_IDS.eggs}:low`,
      `${SEED_IDS.milk}:low`,
      `${SEED_IDS.yogurt}:ok`,
      `${SEED_IDS.coffee}:out`,
      `${SEED_IDS.oliveOil}:untracked`,
      `${SEED_IDS.rice}:ok`,
    ]);

    const row = (id: string) => {
      const start = html.indexOf(`id="item-${id}"`);
      return html.slice(start, html.indexOf('<div class="row', start + 10) > 0 ? html.indexOf('<div class="row', start + 10) : undefined);
    };
    expect(row(SEED_IDS.milk)).toContain('<div class="qty stale"><span class="n">4</span><span class="u">on record</span></div>');
    expect(row(SEED_IDS.milk)).toContain('class="mk mk-low"');
    expect(row(SEED_IDS.milk)).toContain("Low</b> · due, usually every 7 days");
    expect(row(SEED_IDS.eggs)).toContain("Low</b> · down to 2, you buy 12");
    expect(row(SEED_IDS.oliveOil)).toContain('<span class="n">–</span><span class="u">not counted</span>');
    expect(row(SEED_IDS.oliveOil)).toContain('class="mk mk-untracked"');
    expect(row(SEED_IDS.coffee)).toContain('class="mk mk-out"');
    expect(row(SEED_IDS.coffee)).toContain('<div class="qty zero"><span class="n">0</span><span class="u">bags</span></div>');
    // Coffee beans, out, has Bought only.
    expect(row(SEED_IDS.coffee)).toContain("Bought");
    expect(row(SEED_IDS.coffee)).not.toMatch(/\/used"|\/out"|Set quantity/);
    expect(row(SEED_IDS.oliveOil)).toContain("Set quantity");
    expect(row(SEED_IDS.oliveOil)).not.toMatch(/\/used"|\/out"/);
    // Every row button's form carries its own client_ref.
    const refs = [...html.matchAll(/name="client_ref" value="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs.length).toBe(8);
  });
});

describe("every page", () => {
  it("labels come from the shared terms module", async () => {
    const seeded = await seededClient();
    const home = await seeded.html("/");
    for (const label of [TERMS.assistants, TERMS.addItemButton, TERMS.bought, TERMS.used, TERMS.out, TERMS.setQuantity, TERMS.onRecord, TERMS.notCounted, TERMS.noHistoryYet, TERMS.placeName.fridge, TERMS.placeName.pantry, TERMS.stateWord.low, TERMS.stateWord.out, TERMS.stateWord.untracked]) {
      expect(home).toContain(label);
    }
    const item = await seeded.html(`/items/${SEED_IDS.milk}`);
    for (const label of [TERMS.backToInventory, TERMS.howManyTitle, TERMS.warnMeTitle, TERMS.threwAwayTitle, TERMS.historyTitle, TERMS.record]) {
      expect(item).toContain(label);
    }
    const add = await seeded.html("/items/new");
    for (const label of [TERMS.name, TERMS.whereItLives, TERMS.quantity, TERMS.unit, TERMS.pricePaid, TERMS.priceHint, TERMS.addItemLede]) {
      expect(add).toContain(label);
    }
    const bought = await seeded.html(`/items/${SEED_IDS.eggs}/bought`);
    for (const label of [TERMS.when, TERMS.whenHint, TERMS.savePurchase, TERMS.boughtFootnote]) expect(bought).toContain(label);
    const signedOut = await new Client().html("/");
    for (const label of [TERMS.signInWithGithub, TERMS.signedOutHeadline, TERMS.signedOutFine]) expect(signedOut).toContain(label);
  });

  it("has no <script, no Undo, and none of the banned words", async () => {
    const anon = new Client();
    const pages: [string, string][] = [["signed out", await anon.html("/")]];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === GITHUB_TOKEN_URL) return Response.json({ access_token: "gho_test" });
      if (url === GITHUB_USER_URL) return Response.json({ id: 31337, login: "stranger" });
      return new Response("", { status: 500 });
    });
    const start = await anon.get("/auth/github");
    const state = new URL(start.headers.get("Location") ?? "").searchParams.get("state");
    pages.push(["not invited", decode(await (await anon.get(`/auth/github/callback?code=x&state=${state}`)).text())]);

    const { client: empty } = await signedIn();
    pages.push(["empty inventory", await empty.html("/")]);

    const seeded = await seededClient();
    pages.push(["populated inventory", await seeded.html("/")]);
    pages.push(["add item", await seeded.html("/items/new")]);
    pages.push(["404", await seeded.html("/items/itm_nope")]);
    for (const id of Object.values(SEED_IDS)) {
      for (const suffix of ["", "/bought", "/edit", "/remove"]) pages.push([`${id}${suffix}`, await seeded.html(`/items/${id}${suffix}`)]);
    }
    // After each one-tap action, with its banner.
    await seeded.post(`/items/${SEED_IDS.yogurt}/used`, { client_ref: crypto.randomUUID() });
    pages.push(["after used", await seeded.html("/")]);
    await seeded.post(`/items/${SEED_IDS.milk}/out`, { client_ref: crypto.randomUUID() });
    pages.push(["after out", await seeded.html("/")]);
    await seeded.post(`/items/${SEED_IDS.rice}/bought`, { quantity: "1", price: "", when: "", client_ref: crypto.randomUUID() });
    pages.push(["after bought", await seeded.html("/")]);

    // Save failed, in each form.
    const failing = new Client({ ...env, DEV_SESSION_SEEDING: "1", DB: failingWrites(env.DB) }, "http://localhost:8787");
    failing.cookies.set("fridgie_session", seeded.cookies.get("fridgie_session") ?? "");
    pages.push(["save failed: add", await textOf(await failing.post("/items", { name: "Kiwi", place: "fridge", quantity: "1", unit: "", price: "", client_ref: "fail-add-001" }))]);
    pages.push(["save failed: used", await textOf(await failing.post(`/items/${SEED_IDS.eggs}/used`, { client_ref: "fail-used-001" }))]);
    pages.push(["save failed: bought", await textOf(await failing.post(`/items/${SEED_IDS.eggs}/bought`, { quantity: "12", price: "4.29", when: "", client_ref: "fail-bought-1" }))]);

    for (const [label, html] of pages) expectCleanPage(html, label);
    expect(pages.length).toBeGreaterThan(25);
  });

});

describe("Empty inventory", () => {
  it("shows the spec's copy, both groups, and the big Add item", async () => {
    const { client } = await signedIn();
    const html = await client.html("/");
    expect(html).toContain("Nothing here yet.");
    expect(html).toContain("Add what's in your fridge and pantry, and Fridgie starts telling you what's low.");
    expect(html.match(/<span>0 items<\/span>/g)).toHaveLength(2);
    expect(html).toContain("Your fridge is empty here.");
    expect(html).toContain("Start with what you buy every week, like milk and eggs, so Fridgie can learn how often you buy them.");
    expect(html).toContain("Your pantry is empty here.");
    expect(html).toContain('Or tell your assistant: "I bought rice, coffee and olive oil."');
    expect(html).toContain('class="btn big primary" href="/items/new"');
  });

  it("Nothing's low. when there are items and none is low or out", async () => {
    const { client } = await signedIn();
    await client.post("/items", { name: "Rice", place: "pantry", quantity: "2", unit: "kg", price: "", client_ref: crypto.randomUUID() });
    expect(await client.html("/")).toContain('<p class="summary">Nothing\'s low.</p>');
  });
});

describe("Save failed", () => {
  const panel = "That didn't save.";

  it("a failed form re-renders with every value kept and the same client_ref", async () => {
    const { user, client } = await signedIn();
    await client.post("/items", { name: "Eggs", place: "fridge", quantity: "12", unit: "eggs", price: "4.29", client_ref: "seed-eggs-0001" });
    const [eggs] = await listItems(env.DB, user.id, new Date());
    const failing = new Client({ ...env, DB: failingWrites(env.DB) });
    for (const [k, v] of client.cookies) failing.cookies.set(k, v);
    const before = await eventsOf(user.id);

    // Bought
    const bought = await failing.post(`/items/${eggs!.id}/bought`, { quantity: "6", price: "2.50", when: "2026-10-01", client_ref: "bought-retry-001" });
    let html = await textOf(bought);
    expect(bought.status).toBe(503);
    expect(html).toContain('role="alert"');
    expect(html).toContain(panel);
    expect(html).toContain("Nothing was recorded. Your entries are still here, so try again. If the first try did get through, trying again won't count it twice.");
    expect(html).toContain(">Try again<");
    expect(inputValue(html, "quantity")).toBe("6");
    expect(inputValue(html, "price")).toBe("2.50");
    expect(inputValue(html, "when")).toBe("2026-10-01");
    expect(inputValue(html, "client_ref")).toBe("bought-retry-001");

    // Add item
    const add = await failing.post("/items", { name: "Kiwi", place: "pantry", quantity: "3", unit: "fruit", price: "1.99", client_ref: "add-retry-0001" });
    html = await textOf(add);
    expect(add.status).toBe(503);
    expect(html).toContain(panel);
    expect(inputValue(html, "name")).toBe("Kiwi");
    expect(html).toMatch(/value="pantry" checked/);
    expect(inputValue(html, "quantity")).toBe("3");
    expect(inputValue(html, "unit")).toBe("fruit");
    expect(inputValue(html, "price")).toBe("1.99");
    expect(inputValue(html, "client_ref")).toBe("add-retry-0001");

    // Set quantity, low-at and Threw some away, on the item page
    for (const [path, fields, field] of [
      [`/items/${eggs!.id}/quantity`, { quantity: "7", set: "1" }, "quantity"],
      [`/items/${eggs!.id}/low-at`, { low_at: "3" }, "low_at"],
      [`/items/${eggs!.id}/discard`, { quantity: "2" }, "quantity"],
    ] as [string, Record<string, string>, string][]) {
      const ref = `retry-${field}-${path.split("/").at(-1)}`;
      const response = await failing.post(path, { ...fields, client_ref: ref });
      html = await textOf(response);
      expect(response.status, path).toBe(503);
      expect(html, path).toContain(panel);
      expect(html, path).toContain(`value="${Object.values(fields)[0]}"`);
      expect(html, path).toContain(`value="${ref}"`);
    }

    // Remove
    const removed = await failing.post(`/items/${eggs!.id}/remove`, { client_ref: "remove-retry-01" });
    html = await textOf(removed);
    expect(removed.status).toBe(503);
    expect(html).toContain(panel);
    expect(inputValue(html, "client_ref")).toBe("remove-retry-01");

    expect(await eventsOf(user.id)).toEqual(before);
    expect((await listItems(env.DB, user.id, new Date())).map((i) => i.name)).toEqual(["Eggs"]);

    // The retry, once the database is back, records it exactly once.
    await client.post(`/items/${eggs!.id}/bought`, { quantity: "6", price: "2.50", when: "2026-10-01", client_ref: "bought-retry-001" });
    await client.post(`/items/${eggs!.id}/bought`, { quantity: "6", price: "2.50", when: "2026-10-01", client_ref: "bought-retry-001" });
    expect((await eventsOf(user.id)).filter((e) => e.client_ref === "bought-retry-001")).toHaveLength(1);
  });

  it("a failed Used or Out leaves the row unchanged, with the panel above the Summary", async () => {
    const { user, client } = await signedIn();
    await client.post("/items", { name: "Milk", place: "fridge", quantity: "3", unit: "cartons", price: "", client_ref: "seed-milk-0001" });
    const [milk] = await listItems(env.DB, user.id, new Date());
    const failing = new Client({ ...env, DB: failingWrites(env.DB) });
    for (const [k, v] of client.cookies) failing.cookies.set(k, v);
    const before = await eventsOf(user.id);
    await client.get("/"); // takes the add's flash, so the row below is not tinted
    const rowBefore = (await client.html("/")).match(new RegExp(`<div class="row" id="item-${milk!.id}"[^]*?</form></div></div>`))?.[0];
    expect(rowBefore).toBeDefined();

    for (const action of ["used", "out"]) {
      const response = await failing.post(`/items/${milk!.id}/${action}`, { client_ref: `fail-${action}-0001` });
      const html = await textOf(response);
      expect(response.status, action).toBe(503);
      expect(html, action).toContain("That didn't save.</b>Nothing was recorded for Milk. Try again.");
      expect(html.indexOf('role="alert"'), action).toBeLessThan(html.indexOf('class="summary"'));
      const row = html.match(new RegExp(`<div class="row" id="item-${milk!.id}"[^]*?</form></div></div>`))?.[0];
      // Same row, apart from the fresh client_refs its two forms are rendered with.
      const strip = (s: string | undefined) => s?.replace(/name="client_ref" value="[^"]+"/g, "");
      expect(strip(row), action).toBe(strip(rowBefore));
    }
    expect(await eventsOf(user.id)).toEqual(before);
  });
});
