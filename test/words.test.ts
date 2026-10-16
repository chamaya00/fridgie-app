// The words for a state: reason_text templates, the Summary's sentence rules,
// and the name-matching rule (#7 criterion 3, spec sections 6, 7 and 10).

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { listItems } from "../src/service/inventory";
import { isCloseMatch, isExactMatch, matchName, normaliseName } from "../src/service/names";
import { SEED_IDS, seedInventory } from "../src/service/seed";
import { upsertUser } from "../src/service/users";
import { reasonText, summarise, type SummaryItem } from "../src/service/words";

describe("reason text, exact templates", () => {
  it("count, with no low_at: down to {q}, you buy {Q}", () => {
    expect(reasonText({ reason: "count", q: 2, lastQuantity: 12, lowAt: null, cycleDays: null })).toBe("down to 2, you buy 12");
  });

  it("count, with low_at set: down to {q}, you warn at {low_at}", () => {
    expect(reasonText({ reason: "count", q: 2, lastQuantity: 12, lowAt: 3, cycleDays: null })).toBe("down to 2, you warn at 3");
  });

  it("cycle: due, usually every {round(C)} days", () => {
    expect(reasonText({ reason: "cycle", q: 4, lastQuantity: 1, lowAt: null, cycleDays: 7 })).toBe("due, usually every 7 days");
    expect(reasonText({ reason: "cycle", q: 4, lastQuantity: 1, lowAt: null, cycleDays: 10.6 })).toBe("due, usually every 11 days");
  });

  it("no reason, no text", () => {
    expect(reasonText({ reason: null, q: 4, lastQuantity: 1, lowAt: null, cycleDays: 7 })).toBeNull();
  });

  it("the seed data's reason texts and Summary are the spec's words", async () => {
    const user = await upsertUser(env.DB, 700_001, "seed");
    // The seed's fixed ids belong to one user per database; this file is its only caller.
    await seedInventory(env.DB, user.id);
    const items = await listItems(env.DB, user.id, new Date());
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get(SEED_IDS.milk)).toMatchObject({ state: "low", reason: "cycle", quantity: 4, reasonText: "due, usually every 7 days" });
    expect(byId.get(SEED_IDS.eggs)).toMatchObject({ state: "low", reason: "count", quantity: 2, reasonText: "down to 2, you buy 12" });
    expect(byId.get(SEED_IDS.yogurt)).toMatchObject({ state: "ok", quantity: 5, reasonText: null });
    expect(byId.get(SEED_IDS.coffee)).toMatchObject({ state: "out", quantity: 0, reasonText: null });
    expect(byId.get(SEED_IDS.oliveOil)).toMatchObject({ state: "untracked", quantity: null, reasonText: null });
    expect(byId.get(SEED_IDS.rice)).toMatchObject({ state: "ok", quantity: 2, reasonText: null });
    // Rows alphabetical within each state (#3 D6): Eggs before Milk.
    expect(items.map((i) => i.name)).toEqual(["Eggs", "Milk", "Greek yogurt", "Coffee beans", "Olive oil", "Rice"]);
    expect(summarise(items).text).toBe("Eggs and milk are low. Coffee beans are out.");
  });
});

describe("Summary sentence rules", () => {
  const low = (name: string): SummaryItem => ({ name, state: "low" });
  const out = (name: string): SummaryItem => ({ name, state: "out" });
  const ok = (name: string): SummaryItem => ({ name, state: "ok" });

  it("Nothing here yet. when the inventory is empty", () => {
    expect(summarise([]).text).toBe("Nothing here yet.");
  });

  it("Nothing's low. when nothing is low or out", () => {
    const s = summarise([ok("Rice"), { name: "Olive oil", state: "untracked" }]);
    expect(s).toEqual({ text: "Nothing's low.", low: null, out: null });
  });

  it("one, two and three names", () => {
    expect(summarise([low("Rice")]).text).toBe("Rice is low.");
    expect(summarise([low("Eggs")]).text).toBe("Eggs are low.");
    expect(summarise([low("Milk"), low("Eggs")]).text).toBe("Milk and eggs are low.");
    expect(summarise([low("Milk"), low("Eggs"), low("Butter")]).text).toBe("Milk, eggs and butter are low.");
  });

  it("past three names: X, Y and 2 more are low.", () => {
    expect(summarise([low("Milk"), low("Eggs"), low("Butter"), low("Rice")]).text).toBe("Milk, eggs and 2 more are low.");
    expect(summarise([out("A"), out("B"), out("C"), out("D"), out("E")]).text).toBe("A, b and 3 more are out.");
  });

  it("low before out, each clause in inventory order, ok items left out", () => {
    const s = summarise([out("Milk"), low("Eggs"), ok("Greek yogurt"), out("Coffee beans")]);
    expect(s.text).toBe("Eggs are low. Milk and coffee beans are out.");
    expect(s.low).toBe("Eggs are low.");
    expect(s.out).toBe("Milk and coffee beans are out.");
  });
});

describe("name matching", () => {
  it("normalises: lowercase, trim, collapse spaces, drop one trailing s", () => {
    expect(normaliseName("  Eggs ")).toBe("egg");
    expect(normaliseName("Coffee   Beans")).toBe("coffee bean");
    expect(normaliseName("Rice")).toBe("rice");
  });

  it("exact and close matches", () => {
    expect(isExactMatch("eggs", "Egg")).toBe(true);
    expect(isCloseMatch("milk", "Oat milk")).toBe(true);
    expect(isCloseMatch("milk", "Milk")).toBe(false);
    expect(isCloseMatch("oat", "goat cheese")).toBe(false);
  });

  it("acts only on exactly one exact match; close matches come back", () => {
    const items = [{ name: "Milk" }, { name: "Oat milk" }];
    expect(matchName("milk", items)).toEqual({ status: "found", item: { name: "Milk" } });
    expect(matchName("oat", items)).toEqual({ status: "no_match", close: [{ name: "Oat milk" }] });
    expect(matchName("butter", [{ name: "Butter" }, { name: "butter" }])).toMatchObject({ status: "ambiguous" });
  });
});
