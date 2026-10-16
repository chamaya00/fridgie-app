// Each web action and the events it stores (#7 criterion 2). Every test starts
// from a signed-in owner with an empty inventory, acts through the web routes,
// and checks both what a fresh load shows and the stored event rows.

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { EventRow } from "../src/service/inventory";
import { listItems, recordPurchase, ServiceError } from "../src/service/inventory";
import { isoDate } from "../src/service/time";
import { type Client, decode, eventsOf, inputValue, itemRowsOf, signedIn, textOf } from "./helpers";

function itemIdFrom(response: Response): string {
  const location = response.headers.get("Location") ?? "";
  const match = location.match(/#item-(itm_[a-z0-9_]+)$/);
  if (!match?.[1]) throw new Error(`no item id in ${location}`);
  return match[1];
}

async function quantities(userId: string): Promise<Record<string, [string, number | null, string]>> {
  const items = await listItems(env.DB, userId, new Date());
  return Object.fromEntries(items.map((i) => [i.name, [i.place, i.quantity, i.state]]));
}

/** Every event row that existed before is unchanged, and the new rows follow them. */
function expectAppendOnly(before: EventRow[], after: EventRow[]) {
  expect(after.slice(0, before.length)).toEqual(before);
}

async function addMilk(client: Client): Promise<string> {
  const response = await client.post("/items", { name: "Milk", place: "fridge", quantity: "2", unit: "cartons", price: "4.29", client_ref: crypto.randomUUID() });
  expect(response.status).toBe(303);
  return itemIdFrom(response);
}

describe("Add item", () => {
  it("to the fridge with a quantity and a price of 4.29 writes one purchase of 429 USD", async () => {
    const { user, client } = await signedIn();
    const response = await client.post("/items", { name: "Milk", place: "fridge", quantity: "2", unit: "cartons", price: "4.29", client_ref: "add-milk-0001" });
    expect(response.status).toBe(303);
    const id = itemIdFrom(response);
    const events = await eventsOf(user.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      item_id: id,
      type: "purchase",
      quantity: 2,
      on_hand_after: 2,
      price_cents: 429,
      currency: "USD",
      source: "web",
      client_ref: "add-milk-0001",
      reason: null,
    });
    expect(await quantities(user.id)).toEqual({ Milk: ["fridge", 2, "ok"] });
    const html = await client.html("/");
    expect(html).toContain("Added Milk. Bought 2 cartons.");
  });

  it("to the pantry with no quantity writes no event, and the row shows Untracked", async () => {
    const { user, client } = await signedIn();
    const response = await client.post("/items", { name: "Olive oil", place: "pantry", quantity: "", unit: "", price: "", client_ref: "add-oil-0001" });
    const id = itemIdFrom(response);
    expect(await eventsOf(user.id)).toEqual([]);
    expect(await quantities(user.id)).toEqual({ "Olive oil": ["pantry", null, "untracked"] });
    const html = await client.html("/");
    const row = html.slice(html.indexOf(`id="item-${id}"`));
    expect(row).toMatch(/^[^]*?Untracked<\/b> · no history yet/);
    expect(row).toMatch(/^[^]*?not counted/);
  });

  it("with a name matching an existing item, in either place, writes nothing and links to it", async () => {
    const { user, client } = await signedIn();
    const milkId = await addMilk(client);
    const before = await eventsOf(user.id);
    for (const [name, place] of [["milk", "fridge"], ["  MILK ", "pantry"], ["Milks", "pantry"]]) {
      const response = await client.post("/items", { name: name as string, place: place as string, quantity: "1", unit: "", price: "", client_ref: crypto.randomUUID() });
      const html = await textOf(response);
      expect(response.status, name).toBe(400);
      expect(html, name).toContain(`You already have <a href="/items/${milkId}">Milk</a> in the fridge.`);
      expect(inputValue(html, "name"), name).toBe(name);
    }
    expect(await eventsOf(user.id)).toEqual(before);
    expect(await itemRowsOf(user.id)).toHaveLength(1);
  });
});

describe("Bought", () => {
  it("is prefilled from the last purchase", async () => {
    const { client } = await signedIn();
    const id = await addMilk(client);
    const html = await client.html(`/items/${id}/bought`);
    expect(inputValue(html, "quantity")).toBe("2");
    expect(inputValue(html, "price")).toBe("4.29");
    expect(inputValue(html, "when")).toBe(isoDate(new Date()));
    const today = new Date();
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][today.getUTCMonth()];
    expect(html).toContain(`Filled in from your last purchase, on ${month} ${today.getUTCDate()}.`);
  });

  it("on an item never bought: quantity 1, empty price, first time", async () => {
    const { client } = await signedIn();
    const id = itemIdFrom(await client.post("/items", { name: "Olive oil", place: "pantry", quantity: "", unit: "", price: "", client_ref: crypto.randomUUID() }));
    const html = await client.html(`/items/${id}/bought`);
    expect(inputValue(html, "quantity")).toBe("1");
    expect(inputValue(html, "price")).toBe("");
    expect(html).toContain("First time buying this here.");
  });

  it("a backdated date is noon UTC that day; more than a day ahead is refused", async () => {
    const { user, client } = await signedIn();
    const id = await addMilk(client);
    const saved = await client.post(`/items/${id}/bought`, { quantity: "1", price: "3.49", when: "2026-10-01", client_ref: "bought-backdated-1" });
    expect(saved.status).toBe(303);
    expect(saved.headers.get("Location")).toBe(`/#item-${id}`);
    const events = await eventsOf(user.id);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ type: "purchase", quantity: 1, on_hand_after: 3, occurred_at: "2026-10-01T12:00:00.000Z", price_cents: 349, currency: "USD", source: "web" });
    expect(await client.html("/")).toContain("Bought 1 Milk.");

    const ahead = isoDate(new Date(Date.now() + 2 * 86_400_000));
    const refused = await client.post(`/items/${id}/bought`, { quantity: "1", price: "", when: ahead, client_ref: "bought-future-1" });
    expect(refused.status).toBe(400);
    expect(await textOf(refused)).toContain("That's more than a day ahead.");
    expect(await eventsOf(user.id)).toHaveLength(2);

    const tomorrow = isoDate(new Date(Date.now() + 86_400_000 - 13 * 3_600_000));
    const allowed = await client.post(`/items/${id}/bought`, { quantity: "1", price: "", when: tomorrow, client_ref: "bought-tomorrow-1" });
    expect(allowed.status).toBe(303);
    expect((await eventsOf(user.id))[2]).toMatchObject({ price_cents: null, currency: null });
  });
});

describe("Used and Out", () => {
  it("Used writes use 1 reason used, with the banner, and stops at 0", async () => {
    const { user, client } = await signedIn();
    const id = await addMilk(client);
    const before = await eventsOf(user.id);
    const used = await client.post(`/items/${id}/used`, { client_ref: "used-milk-0001" });
    expect(used.status).toBe(303);
    expect(used.headers.get("Location")).toBe(`/#item-${id}`);
    const after = await eventsOf(user.id);
    expectAppendOnly(before, after);
    expect(after.slice(before.length)).toEqual([expect.objectContaining({ type: "use", quantity: 1, reason: "used", on_hand_after: 1, source: "web", client_ref: "used-milk-0001" })]);
    const home = await client.html("/");
    expect(home).toContain("Used 1 Milk. 1 carton left.");
    expect(home).toContain(`<a href="/items/${id}?focus=quantity#quantity">Change</a>`);
    expect(home).toContain(`class="row fresh" id="item-${id}"`);

    await client.post(`/items/${id}/used`, { client_ref: "used-milk-0002" });
    expect(await client.html("/")).toContain("Used the last Milk.");
    expect((await eventsOf(user.id)).at(-1)).toMatchObject({ type: "use", on_hand_after: 0 });
    expect(await quantities(user.id)).toEqual({ Milk: ["fridge", 0, "out"] });
  });

  it("a use stops at 0 even from a stale count (ADR 0006)", async () => {
    const { user, client } = await signedIn();
    const id = await addMilk(client);
    await client.post(`/items/${id}/discard`, { quantity: "5", client_ref: "discard-too-many" });
    expect((await eventsOf(user.id)).at(-1)).toMatchObject({ type: "use", quantity: 5, on_hand_after: 0, reason: "discarded" });
  });

  it("Out writes count 0, with the banner", async () => {
    const { user, client } = await signedIn();
    const id = await addMilk(client);
    const before = await eventsOf(user.id);
    await client.post(`/items/${id}/out`, { client_ref: "out-milk-00001" });
    const after = await eventsOf(user.id);
    expectAppendOnly(before, after);
    expect(after.slice(before.length)).toEqual([expect.objectContaining({ type: "count", quantity: 0, on_hand_after: 0, reason: null, source: "web" })]);
    const home = await client.html("/");
    expect(home).toContain("Milk marked out.");
    expect(home).toContain('<span class="w-out">Milk is out.</span>');
    expect(await quantities(user.id)).toEqual({ Milk: ["fridge", 0, "out"] });
  });
});

describe("the item page", () => {
  it("Set to {n} writes count n; the stepper writes nothing", async () => {
    const { user, client } = await signedIn();
    const id = await addMilk(client);
    const before = await eventsOf(user.id);
    const step = await client.post(`/items/${id}/quantity`, { quantity: "2", delta: "1", client_ref: "step-0000001" });
    expect(step.status).toBe(303);
    expect(step.headers.get("Location")).toBe(`/items/${id}?n=3#quantity`);
    const stepped = await client.html(`/items/${id}?n=3`);
    expect(inputValue(stepped, "quantity")).toBe("3");
    expect(stepped).toContain("Set to 3 cartons");
    expect(await eventsOf(user.id)).toEqual(before);

    await client.post(`/items/${id}/quantity`, { quantity: "3", set: "1", client_ref: "set-three-0001" });
    const after = await eventsOf(user.id);
    expectAppendOnly(before, after);
    expect(after.slice(before.length)).toEqual([expect.objectContaining({ type: "count", quantity: 3, on_hand_after: 3, source: "web" })]);
    expect(await quantities(user.id)).toEqual({ Milk: ["fridge", 3, "ok"] });
  });

  it("Threw some away writes a use with reason discarded", async () => {
    const { user, client } = await signedIn();
    const id = await addMilk(client);
    const before = await eventsOf(user.id);
    await client.post(`/items/${id}/discard`, { quantity: "1", client_ref: "discard-0000001" });
    const after = await eventsOf(user.id);
    expectAppendOnly(before, after);
    expect(after.slice(before.length)).toEqual([expect.objectContaining({ type: "use", quantity: 1, reason: "discarded", on_hand_after: 1, source: "web" })]);
    expect(await client.html("/")).toContain("Threw away 1 Milk. 1 carton left.");
    const page = await client.html(`/items/${id}`);
    expect(page).toContain("Threw away 1");
  });

  it("Warn me when it's down to: set, then cleared, writes no event", async () => {
    const { user, client } = await signedIn();
    const id = await addMilk(client);
    const before = await eventsOf(user.id);
    await client.post(`/items/${id}/low-at`, { low_at: "2", client_ref: "lowat-000001" });
    let row = (await itemRowsOf(user.id))[0];
    expect(row?.low_at).toBe(2);
    expect(await quantities(user.id)).toEqual({ Milk: ["fridge", 2, "low"] });
    const items = await listItems(env.DB, user.id, new Date());
    expect(items[0]?.reasonText).toBe("down to 2, you warn at 2");
    await client.post(`/items/${id}/low-at`, { low_at: "", client_ref: "lowat-000002" });
    row = (await itemRowsOf(user.id))[0];
    expect(row?.low_at).toBeNull();
    expect(await eventsOf(user.id)).toEqual(before);
  });

  it("Rename or move writes no event", async () => {
    const { user, client } = await signedIn();
    const id = await addMilk(client);
    const before = await eventsOf(user.id);
    const response = await client.post(`/items/${id}/edit`, { name: "Oat milk", place: "pantry", unit: "litres", client_ref: "edit-0000001" });
    expect(response.status).toBe(303);
    expect(await eventsOf(user.id)).toEqual(before);
    expect(await quantities(user.id)).toEqual({ "Oat milk": ["pantry", 2, "ok"] });
    expect((await itemRowsOf(user.id))[0]).toMatchObject({ name: "Oat milk", place: "pantry", unit: "litres" });
  });

  it("Rename to another item's name is refused", async () => {
    const { user, client } = await signedIn();
    const id = await addMilk(client);
    await client.post("/items", { name: "Eggs", place: "fridge", quantity: "", unit: "", price: "", client_ref: crypto.randomUUID() });
    const response = await client.post(`/items/${id}/edit`, { name: "egg", place: "fridge", unit: "", client_ref: "edit-clash-01" });
    expect(response.status).toBe(400);
    expect(await textOf(response)).toContain("in the fridge.");
    expect(Object.keys(await quantities(user.id)).sort()).toEqual(["Eggs", "Milk"]);
  });
});

describe("Remove", () => {
  it("goes through a confirmation, leaves the inventory, keeps every event, and a re-add starts fresh", async () => {
    const { user, client } = await signedIn();
    const id = await addMilk(client);
    await client.post(`/items/${id}/used`, { client_ref: "used-before-remove" });
    const before = await eventsOf(user.id);

    const confirm = await client.html(`/items/${id}/remove`);
    expect(confirm).toContain("Remove milk?");
    expect(confirm).toContain("Milk leaves your fridge list and stops showing as low. Fridgie keeps what you bought and used, for your spending.");
    expect(confirm).toContain('Add "Milk" again later and it starts with no history.');
    expect(confirm).toContain("Keep it");

    const removed = await client.post(`/items/${id}/remove`, { client_ref: inputValue(confirm, "client_ref") ?? "" });
    expect(removed.status).toBe(303);
    const home = await client.html("/");
    expect(home).toContain("Removed Milk.");
    expect(home).not.toContain(`id="item-${id}"`);
    expect(await quantities(user.id)).toEqual({});
    expect((await client.get(`/items/${id}`)).status).toBe(404);
    expect(await eventsOf(user.id)).toEqual(before);

    const again = itemIdFrom(await client.post("/items", { name: "Milk", place: "fridge", quantity: "", unit: "", price: "", client_ref: crypto.randomUUID() }));
    expect(again).not.toBe(id);
    expect(await quantities(user.id)).toEqual({ Milk: ["fridge", null, "untracked"] });
    expect((await eventsOf(user.id)).filter((e) => e.item_id === again)).toEqual([]);
    expect(await client.html(`/items/${again}`)).toContain("Nothing recorded yet.");
  });
});

describe("append-only and refusals", () => {
  it("every event row that existed before an action is unchanged after it, across every action", async () => {
    const { user, client } = await signedIn();
    const id = await addMilk(client);
    const actions: [string, Record<string, string>][] = [
      [`/items/${id}/bought`, { quantity: "1", price: "3.49", when: "" }],
      [`/items/${id}/used`, {}],
      [`/items/${id}/out`, {}],
      [`/items/${id}/quantity`, { quantity: "4", set: "1" }],
      [`/items/${id}/discard`, { quantity: "1" }],
      [`/items/${id}/low-at`, { low_at: "1" }],
      [`/items/${id}/edit`, { name: "Milk", place: "pantry", unit: "cartons" }],
      [`/items/${id}/remove`, {}],
    ];
    for (const [path, fields] of actions) {
      const before = await eventsOf(user.id);
      await client.post(path, { ...fields, client_ref: crypto.randomUUID() });
      expectAppendOnly(before, await eventsOf(user.id));
    }
    expect((await eventsOf(user.id)).map((e) => e.type)).toEqual(["purchase", "purchase", "use", "count", "count", "use"]);
  });

  it("the database refuses to update or delete an event", async () => {
    const { user, client } = await signedIn();
    await addMilk(client);
    await expect(env.DB.prepare("UPDATE events SET quantity = 99 WHERE user_id = ?1").bind(user.id).run()).rejects.toThrow(/append-only/);
    await expect(env.DB.prepare("DELETE FROM events WHERE user_id = ?1").bind(user.id).run()).rejects.toThrow(/append-only/);
    expect((await eventsOf(user.id))[0]?.quantity).toBe(2);
  });

  it("posting the same form twice with the same client_ref writes one event", async () => {
    const { user, client } = await signedIn();
    const id = await addMilk(client);
    for (const [path, fields] of [
      [`/items/${id}/used`, {}],
      [`/items/${id}/out`, {}],
      [`/items/${id}/bought`, { quantity: "1", price: "", when: "" }],
      [`/items/${id}/quantity`, { quantity: "5", set: "1" }],
      [`/items/${id}/discard`, { quantity: "1" }],
    ] as [string, Record<string, string>][]) {
      const before = await eventsOf(user.id);
      const ref = crypto.randomUUID();
      await client.post(path, { ...fields, client_ref: ref });
      await client.post(path, { ...fields, client_ref: ref });
      expect((await eventsOf(user.id)).length, path).toBe(before.length + 1);
    }
    // Add item with a quantity, twice with one client_ref: one item, one purchase.
    const ref = "add-twice-0001";
    await client.post("/items", { name: "Bread", place: "pantry", quantity: "1", unit: "", price: "", client_ref: ref });
    const second = await client.post("/items", { name: "Bread", place: "pantry", quantity: "1", unit: "", price: "", client_ref: ref });
    expect(second.status).toBe(303);
    expect((await itemRowsOf(user.id)).filter((r) => r.name === "Bread")).toHaveLength(1);
    expect((await eventsOf(user.id)).filter((e) => e.client_ref === ref)).toHaveLength(1);
  });

  it("the service refuses price_cents with no currency", async () => {
    const { user, client } = await signedIn();
    const id = await addMilk(client);
    const attempt = recordPurchase(env.DB, user.id, id, { quantity: 1, priceCents: 429, currency: null, occurredAt: new Date(), clientRef: null, source: "mcp" });
    await expect(attempt).rejects.toBeInstanceOf(ServiceError);
    await expect(attempt).rejects.toThrow(/currency/);
    expect(await eventsOf(user.id)).toHaveLength(1);
  });

  it("current quantities after a fresh load, in the right places", async () => {
    const { user, client } = await signedIn();
    const milk = await addMilk(client);
    const rice = itemIdFrom(await client.post("/items", { name: "Rice", place: "pantry", quantity: "2", unit: "kg", price: "", client_ref: crypto.randomUUID() }));
    await client.post(`/items/${milk}/used`, { client_ref: crypto.randomUUID() });
    await client.post(`/items/${rice}/bought`, { quantity: "1", price: "", when: "", client_ref: crypto.randomUUID() });
    expect(await quantities(user.id)).toEqual({ Milk: ["fridge", 1, "ok"], Rice: ["pantry", 3, "ok"] });
    const html = decode(await client.html("/"));
    const fridge = html.slice(html.indexOf('id="fridge"'), html.indexOf('id="pantry"'));
    const pantry = html.slice(html.indexOf('id="pantry"'));
    expect(fridge).toContain("Milk");
    expect(fridge).not.toContain("Rice");
    expect(pantry).toContain('<span class="n">3</span><span class="u">kg</span>');
  });
});
