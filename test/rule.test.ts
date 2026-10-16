// ADR 0006's five worked examples, every row of every table, classified by the
// service from events stored in D1 (#7 criterion 3).

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { addItem, getItem, recordPurchase, recordUse, setQuantity } from "../src/service/inventory";
import { classify, LOW_FRACTION, median, PURCHASE_WINDOW } from "../src/service/rule";
import { upsertUser } from "../src/service/users";

const BASE = Date.parse("2026-01-01T09:00:00.000Z");
const DAY = 86_400_000;
const d = (n: number) => new Date(BASE + n * DAY);

type Ev = [day: number, type: "purchase" | "use" | "count", quantity: number];

interface Row {
  now: number;
  /** How many of the example's events have happened by this row. */
  applied: number;
  state: "untracked" | "ok" | "low" | "out";
  reason?: "count" | "cycle";
  q: number;
  a?: number;
  C?: number | null;
  L?: number;
}

let githubId = 900_000;

/** Store the example's events in order and classify the item at each row's `now`. */
async function runExample(events: Ev[], rows: Row[]) {
  const user = await upsertUser(env.DB, githubId++, "example");
  const { item } = await addItem(env.DB, user.id, { name: "thing", place: "fridge", unit: null, lowAt: null, purchase: null, clientRef: null, source: "web" });
  let applied = 0;
  for (const row of rows) {
    while (applied < row.applied) {
      const [day, type, quantity] = events[applied] as Ev;
      const base = { occurredAt: d(day), clientRef: null, source: "web" as const };
      if (type === "purchase") await recordPurchase(env.DB, user.id, item.id, { ...base, quantity, priceCents: null, currency: null });
      else if (type === "use") await recordUse(env.DB, user.id, item.id, { ...base, quantity, reason: "used" });
      else await setQuantity(env.DB, user.id, item.id, { ...base, quantity });
      applied++;
    }
    const view = await getItem(env.DB, user.id, item.id, d(row.now));
    expect(view, `d${row.now}`).not.toBeNull();
    const c = view!.classification;
    const label = `d${row.now} after ${row.applied} events`;
    expect(view!.state, label).toBe(row.state);
    expect(view!.reason, label).toBe(row.reason ?? null);
    expect(view!.quantity, label).toBe(row.q);
    if (row.a !== undefined) expect(c.ageDays, label).toBeCloseTo(row.a, 9);
    if (row.C !== undefined) expect(c.cycleDays, label).toBe(row.C);
    if (row.L !== undefined) expect(c.threshold, label).toBe(row.L);
  }
}

describe("ADR 0006 worked examples", () => {
  it("example 1, steady rate: eggs", async () => {
    const events: Ev[] = [
      [0, "purchase", 12], [4, "use", 6], [10, "use", 6], [14, "purchase", 12], [18, "use", 6],
      [24, "use", 6], [28, "purchase", 12], [31, "use", 4], [35, "use", 4],
      [41, "use", 1], [42, "use", 3],
    ];
    await runExample(events, [
      { now: 36, applied: 9, state: "ok", q: 4, a: 8, C: 14, L: 3 },
      { now: 40, applied: 9, state: "low", reason: "cycle", q: 4, a: 12, C: 14, L: 3 },
      { now: 41, applied: 10, state: "low", reason: "count", q: 3, a: 13, C: 14, L: 3 },
      { now: 42, applied: 11, state: "out", q: 0, a: 14 },
    ]);
  });

  it("example 2, count never corrected after it ran out: milk", async () => {
    const events: Ev[] = [[0, "purchase", 1], [7, "purchase", 1], [14, "purchase", 1], [21, "purchase", 1]];
    await runExample(events, [
      { now: 26, applied: 4, state: "ok", q: 4, a: 5, C: 7, L: 0 },
      { now: 27, applied: 4, state: "low", reason: "cycle", q: 4, a: 6, C: 7, L: 0 },
      { now: 30, applied: 4, state: "low", reason: "cycle", q: 4, a: 9, C: 7, L: 0 },
    ]);
  });

  it("example 3, newly added item: yogurt", async () => {
    const events: Ev[] = [[0, "purchase", 6], [2, "use", 5], [3, "use", 1]];
    await runExample(events, [
      { now: 0, applied: 1, state: "ok", q: 6, C: null, L: 1 },
      { now: 2, applied: 2, state: "low", reason: "count", q: 1, C: null, L: 1 },
      { now: 3, applied: 3, state: "out", q: 0 },
    ]);
  });

  it("example 3, an item with no events at all is untracked", async () => {
    const user = await upsertUser(env.DB, githubId++, "example");
    const { item } = await addItem(env.DB, user.id, { name: "nothing yet", place: "pantry", unit: null, lowAt: null, purchase: null, clientRef: null, source: "web" });
    const view = await getItem(env.DB, user.id, item.id, d(0));
    expect(view!.state).toBe("untracked");
    expect(view!.quantity).toBeNull();
    expect(view!.reason).toBeNull();
  });

  it("example 4, owner taps Out early, then rebuys: butter (out wins over cycle)", async () => {
    const events: Ev[] = [[0, "purchase", 1], [20, "purchase", 1], [40, "purchase", 1], [45, "count", 0], [46, "purchase", 1]];
    await runExample(events, [
      { now: 45, applied: 3, state: "ok", q: 3, a: 5, C: 20 },
      { now: 45, applied: 4, state: "out", q: 0, a: 5, C: 20 },
      { now: 46, applied: 5, state: "ok", q: 1, a: 0, C: 20 },
    ]);
  });

  it("example 5, known false alarm, a bulk buy: cheese stays pinned as low (cycle)", async () => {
    const events: Ev[] = [[0, "purchase", 1], [10, "purchase", 1], [20, "purchase", 1], [30, "purchase", 3], [35, "use", 1]];
    await runExample(events, [{ now: 38, applied: 5, state: "low", reason: "cycle", q: 5, a: 8, C: 10, L: 0 }]);
  });
});

describe("the rule's named constants and edges", () => {
  it("names its constants", () => {
    expect(LOW_FRACTION).toBe(0.8);
    expect(PURCHASE_WINDOW).toBe(4);
  });

  it("takes the median of an even number of gaps as the mean of the middle two", () => {
    expect(median([6, 20, 30, 10])).toBe(15);
    expect(median([])).toBeNull();
  });

  it("discards gaps shorter than a day, so one shop does not collapse the cycle", () => {
    const c = classify({
      latestOnHand: 2,
      purchases: [
        { quantity: 1, occurredAt: new Date(BASE + 14 * DAY + 3_600_000) },
        { quantity: 1, occurredAt: d(14) },
        { quantity: 1, occurredAt: d(7) },
        { quantity: 1, occurredAt: d(0) },
      ],
      lowAt: null,
      now: d(15),
    });
    expect(c.cycleDays).toBe(7);
  });

  it("uses low_at in place of the default threshold", () => {
    const c = classify({ latestOnHand: 3, purchases: [{ quantity: 12, occurredAt: d(0) }], lowAt: 5, now: d(1) });
    expect(c.state).toBe("low");
    expect(c.reason).toBe("count");
    expect(c.threshold).toBe(5);
  });
});
