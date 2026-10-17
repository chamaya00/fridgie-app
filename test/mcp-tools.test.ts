// #8 criterion 3: the tools, through the one service. Every case starts from
// the seed in src/service/seed.ts (the same inventory the web pages are
// photographed with) and reads its result back through the web app's own page,
// not through a second data path.
//
// The seed belongs to the one local dev user and is written once per test
// file, so these cases run in order and each says what it leaves behind.

import { env } from "cloudflare:test";
import type { Client as McpClient } from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ItemView } from "../src/service/inventory";
import { SEED_IDS } from "../src/service/seed";
import { resolveRef } from "../src/mcp/tools";
import { Client, decode, eventsOf, itemRowsOf } from "./helpers";
import { connectAssistant, mcpClient } from "./oauth";

const LOCAL = "http://localhost:8787";

let browser: Client;
let userId: string;
let mcp: McpClient;

interface ToolItem {
  item_id: string;
  name: string;
  state: string;
  reason: string | null;
  reason_text: string | null;
}

async function callTool<T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await mcp.callTool({ name, arguments: args });
  expect(result.isError, `${name}: ${JSON.stringify(result.content)}`).toBeFalsy();
  return result.structuredContent as T;
}

/** The web inventory page as the signed-in owner sees it. */
async function webPage(): Promise<string> {
  return browser.html("/");
}

/** One item's row on the web page. */
function rowOf(html: string, id: string): string {
  const start = html.indexOf(`id="item-${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  const next = html.indexOf('<div class="row', start + 10);
  return html.slice(start, next > 0 ? next : undefined);
}

function webStates(html: string): Map<string, string> {
  return new Map([...html.matchAll(/id="item-([a-z0-9_]+)" data-state="([a-z]+)"/g)].map((m) => [m[1] as string, m[2] as string]));
}

/** The Summary sentence as the page reads it, tags taken off. */
function webSummary(html: string): string {
  const p = html.match(/<p class="summary">(.*?)<\/p>/)?.[1] ?? "";
  return decode(p.replace(/<[^>]+>/g, ""));
}

beforeAll(async () => {
  browser = new Client({ ...env, DEV_SESSION_SEEDING: "1" }, LOCAL);
  expect((await browser.get("/dev/session?next=/")).status).toBe(303);
  const user = await env.DB.prepare("SELECT id FROM users WHERE github_id = 0").first<{ id: string }>();
  userId = user?.id ?? "";
  const { access_token } = await connectAssistant(browser, "mcp:read mcp:write offline_access", LOCAL);
  mcp = await mcpClient(access_token, "2025-11-25", LOCAL);
});

afterAll(async () => {
  await mcp.close();
});

describe("the tools, through the one service (#8 criterion 3)", () => {
  // First, on the untouched seed.
  it('"What\'s running low?": list_low_and_out says what the web page says', async () => {
    const result = await callTool<{ summary: string; low: ToolItem[]; out: ToolItem[] }>("list_low_and_out", {});
    const html = await webPage();

    expect(result.summary).toBe("Eggs and milk are low. Coffee beans are out.");
    expect(result.summary).toBe(webSummary(html));

    const web = webStates(html);
    const webLowOut = [...web].filter(([, state]) => state === "low" || state === "out").map(([id, state]) => `${id}:${state}`);
    expect([...result.low, ...result.out].map((i) => `${i.item_id}:${i.state}`).sort()).toEqual(webLowOut.sort());
    for (const item of result.low) {
      expect(item.reason).not.toBeNull();
      expect(rowOf(html, item.item_id)).toContain(`Low</b> · ${item.reason_text ?? ""}`);
    }
    expect(result.low.find((i) => i.item_id === SEED_IDS.milk)).toMatchObject({ reason: "cycle", reason_text: "due, usually every 7 days" });
    expect(result.low.find((i) => i.item_id === SEED_IDS.eggs)).toMatchObject({ reason: "count", reason_text: "down to 2, you buy 12" });
  });

  it("find_items returns one result per name, in order", async () => {
    const { results } = await callTool<{ results: { name: string; status: string; item?: ToolItem; close?: ToolItem[] }[] }>("find_items", {
      names: ["eggs", "oat milk", "Coffee Beans", "kale", "milk"],
    });
    expect(results.map((r) => `${r.name}:${r.status}`)).toEqual(["eggs:found", "oat milk:no_match", "Coffee Beans:found", "kale:no_match", "milk:found"]);
    expect(results[0]?.item?.item_id).toBe(SEED_IDS.eggs);
    expect(results[1]?.close?.map((i) => i.item_id)).toEqual([SEED_IDS.milk]);
    expect(results[3]?.close).toEqual([]);
  });

  it("a record_use or a record_purchases line with no exact match writes nothing and returns no_match with close", async () => {
    const before = (await eventsOf(userId)).length;
    const use = await callTool<{ status: string; name: string; close: ToolItem[] }>("record_use", { item: { name: "oat milk" }, client_ref: "use-oat-milk-1" });
    expect(use.status).toBe("no_match");
    expect(use.name).toBe("oat milk");
    expect(use.close.map((i) => i.name)).toEqual(["Milk"]);

    const buy = await callTool<{ results: { line: number; status: string; close?: ToolItem[] }[] }>("record_purchases", {
      lines: [{ item: { name: "oat milk" }, quantity: 1 }],
      client_ref: "buy-oat-milk-1",
    });
    expect(buy.results).toHaveLength(1);
    expect(buy.results[0]).toMatchObject({ line: 0, status: "no_match" });
    expect(buy.results[0]?.close?.map((i) => i.name)).toEqual(["Milk"]);
    expect((await eventsOf(userId)).length).toBe(before);
  });

  it("add_item with a name in the other place returns exists and writes nothing", async () => {
    const items = await itemRowsOf(userId);
    const events = await eventsOf(userId);
    const result = await callTool<{ status: string; item: ToolItem & { place: string } }>("add_item", {
      name: "milks",
      place: "pantry",
      quantity: 2,
      price: 3.5,
      client_ref: "add-milks-pantry",
    });
    expect(result.status).toBe("exists");
    expect(result.item).toMatchObject({ item_id: SEED_IDS.milk, name: "Milk", place: "fridge" });
    expect(await itemRowsOf(userId)).toEqual(items);
    expect(await eventsOf(userId)).toEqual(events);
  });

  it("a receipt: record_purchases writes one purchase per line with keys R#0..R#2, and a repeat writes nothing", async () => {
    const before = await eventsOf(userId);
    const now = new Date();
    const backdated = new Date(now.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
    const args = {
      client_ref: "receipt-R-0001",
      lines: [
        { item: { name: "eggs" }, quantity: 12, price: 4.29 },
        { item: { item_id: SEED_IDS.rice }, quantity: 1, occurred_at: backdated },
        { item: { name: "Greek yogurt" }, quantity: 2 },
      ],
    };
    const first = await callTool<{ results: { line: number; status: string; item?: ToolItem }[] }>("record_purchases", args);
    expect(first.results.map((r) => `${r.line}:${r.status}:${r.item?.item_id ?? ""}`)).toEqual([
      `0:recorded:${SEED_IDS.eggs}`,
      `1:recorded:${SEED_IDS.rice}`,
      `2:recorded:${SEED_IDS.yogurt}`,
    ]);

    const written = (await eventsOf(userId)).slice(before.length);
    expect(written).toHaveLength(3);
    expect(written.map((e) => [e.type, e.client_ref, e.item_id, e.source])).toEqual([
      ["purchase", "receipt-R-0001#0", SEED_IDS.eggs, "mcp"],
      ["purchase", "receipt-R-0001#1", SEED_IDS.rice, "mcp"],
      ["purchase", "receipt-R-0001#2", SEED_IDS.yogurt, "mcp"],
    ]);
    expect(written[0]).toMatchObject({ quantity: 12, price_cents: 429, currency: "USD" });
    expect(written[1]).toMatchObject({ quantity: 1, price_cents: null, currency: null, occurred_at: `${backdated}T12:00:00.000Z` });
    expect(written[2]).toMatchObject({ quantity: 2, price_cents: null, currency: null });

    const again = await callTool<{ results: { line: number; status: string }[] }>("record_purchases", args);
    expect(again.results.map((r) => r.status)).toEqual(["already_recorded", "already_recorded", "already_recorded"]);
    expect((await eventsOf(userId)).length).toBe(before.length + 3);

    // Read back through the web app: eggs are 2 + 12 = 14 now, and no longer low.
    expect(rowOf(await webPage(), SEED_IDS.eggs)).toContain('<span class="n">14</span>');
  });

  // Last, because it changes milk for good.
  it('"I used the last of the milk": mark_out stores one count 0 from mcp, and the web shows milk out', async () => {
    const before = await eventsOf(userId);
    const milkBefore = before.filter((e) => e.item_id === SEED_IDS.milk).at(-1);
    expect(milkBefore?.on_hand_after).toBe(4);
    expect(webStates(await webPage()).get(SEED_IDS.milk)).toBe("low");

    const result = await callTool<{ status: string; item: ToolItem }>("mark_out", { item: { name: "milk" }, client_ref: "out-milk-0001" });
    expect(result.status).toBe("recorded");
    expect(result.item).toMatchObject({ item_id: SEED_IDS.milk, state: "out" });

    const written = (await eventsOf(userId)).slice(before.length);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ item_id: SEED_IDS.milk, type: "count", quantity: 0, on_hand_after: 0, source: "mcp", client_ref: "out-milk-0001" });

    const html = await webPage();
    expect(webStates(html).get(SEED_IDS.milk)).toBe("out");
    expect(rowOf(html, SEED_IDS.milk)).toContain('class="mk mk-out"');
    // Inventory order: the fridge (milk) before the pantry (coffee beans).
    expect(webSummary(html)).toContain("Milk and coffee beans are out.");
  });
});

describe("name resolution with two items of one name (#8 criterion 3)", () => {
  // ADR 0007's items_user_name_live keeps two live items from sharing a name,
  // so stored data cannot reach this; the shape is the spec's contract anyway.
  it("returns ambiguous with both candidates and acts on neither", () => {
    const fridge = { id: "itm_butter_fridge", name: "Butter", place: "fridge" } as unknown as ItemView;
    const pantry = { id: "itm_butter_pantry", name: "butter", place: "pantry" } as unknown as ItemView;
    const other = { id: "itm_peanut_butter", name: "Peanut butter", place: "pantry" } as unknown as ItemView;
    expect(resolveRef({ name: "butter" }, [fridge, other, pantry])).toEqual({ status: "ambiguous", name: "butter", candidates: [fridge, pantry] });
    expect(resolveRef({ name: "Butter" }, [fridge, other])).toEqual({ status: "found", item: fridge });
    expect(resolveRef({ item_id: "itm_butter_pantry" }, [fridge, other, pantry])).toEqual({ status: "found", item: pantry });
  });
});
