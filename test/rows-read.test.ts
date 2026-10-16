// ADR 0006 marks [inference] that its two indexes bound classifying an item
// to at most 5 event rows read. These measure it with D1's meta.rows_read
// (#7 criterion 3).

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ReadStats } from "../src/service/inventory";
import { addItem, getItem, listItems, recordPurchase, recordUse } from "../src/service/inventory";
import { upsertUser } from "../src/service/users";

const DAY = 86_400_000;
const START = Date.parse("2025-01-01T12:00:00.000Z");
let githubId = 800_000;

async function itemWithEvents(userId: string, name: string, events: number): Promise<string> {
  const { item } = await addItem(env.DB, userId, { name, place: "fridge", unit: null, lowAt: null, purchase: null, clientRef: null, source: "web" });
  for (let i = 0; i < events; i++) {
    const base = { occurredAt: new Date(START + i * DAY), clientRef: null, source: "web" as const };
    if (i % 2 === 0) await recordPurchase(env.DB, userId, item.id, { ...base, quantity: 2, priceCents: null, currency: null });
    else await recordUse(env.DB, userId, item.id, { ...base, quantity: 1, reason: "used" });
  }
  return item.id;
}

describe("rows read", () => {
  it("classifying an item with 50 events reads at most 5 event rows", async () => {
    const user = await upsertUser(env.DB, githubId++, "rows");
    const id = await itemWithEvents(user.id, "busy item", 50);
    // Another user's history, so a missing user_id filter would show up as extra rows.
    const other = await upsertUser(env.DB, githubId++, "noise");
    await itemWithEvents(other.id, "busy item", 20);

    const stats: ReadStats = { itemRowsRead: 0, eventRowsRead: 0 };
    const view = await getItem(env.DB, user.id, id, new Date(START + 60 * DAY), stats);
    expect(view?.state).toBeDefined();
    console.log(`rows_read for one item with 50 events: ${stats.eventRowsRead} event rows`);
    expect(stats.eventRowsRead).toBeGreaterThan(0);
    expect(stats.eventRowsRead).toBeLessThanOrEqual(5);
  });

  it("listing N items with states reads at most 5N event rows plus the item rows", async () => {
    const user = await upsertUser(env.DB, githubId++, "rows");
    const n = 12;
    for (let i = 0; i < n; i++) await itemWithEvents(user.id, `item ${i}`, 10 + i);
    const other = await upsertUser(env.DB, githubId++, "noise");
    for (let i = 0; i < 5; i++) await itemWithEvents(other.id, `other ${i}`, 10);

    const stats: ReadStats = { itemRowsRead: 0, eventRowsRead: 0 };
    const items = await listItems(env.DB, user.id, new Date(START + 60 * DAY), stats);
    expect(items).toHaveLength(n);
    console.log(`rows_read for ${n} items: ${stats.eventRowsRead} event rows, ${stats.itemRowsRead} item rows`);
    expect(stats.eventRowsRead).toBeLessThanOrEqual(5 * n);
    // The item query reads its N rows plus the one index step that finds the
    // end of the user's range.
    expect(stats.itemRowsRead).toBeLessThanOrEqual(n + 1);
  });

  it("EXPLAIN QUERY PLAN shows both ADR 0006 indexes in use", async () => {
    const plan = async (sql: string) =>
      (await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind("u", "i").all<{ detail: string }>()).results.map((r) => r.detail).join("\n");
    const latest = await plan("SELECT on_hand_after FROM events WHERE user_id = ?1 AND item_id = ?2 ORDER BY id DESC LIMIT 1");
    const recent = await plan(
      "SELECT quantity, occurred_at, price_cents, currency FROM events WHERE user_id = ?1 AND item_id = ?2 AND type = 'purchase' ORDER BY occurred_at DESC LIMIT 4",
    );
    console.log(`latest event: ${latest}\nrecent purchases: ${recent}`);
    expect(latest).toContain("USING INDEX events_item_record");
    expect(recent).toContain("USING INDEX events_item_type_when");
    expect(`${latest}\n${recent}`).not.toMatch(/TEMP B-TREE|SCAN events(?! USING)/);
  });
});
