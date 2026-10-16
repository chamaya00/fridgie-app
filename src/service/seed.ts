// The design spec's populated inventory (#7, "Seed data"), for photographing
// the built pages with scripts/app-render. Only /dev/session calls this, and
// that route exists only in local dev.

import { normaliseName } from "./names";
import { recordPurchase, recordUse, setQuantity } from "./inventory";
import type { Place } from "./terms";

const DAY_MS = 86_400_000;

/** Fixed ids, so app-render can name a seeded item's page: /items/itm_seed_milk. */
export const SEED_IDS = {
  milk: "itm_seed_milk",
  eggs: "itm_seed_eggs",
  yogurt: "itm_seed_yogurt",
  coffee: "itm_seed_coffee",
  oliveOil: "itm_seed_olive_oil",
  rice: "itm_seed_rice",
} as const;

const ITEMS: { id: string; name: string; place: Place; unit: string | null }[] = [
  { id: SEED_IDS.milk, name: "Milk", place: "fridge", unit: "cartons" },
  { id: SEED_IDS.eggs, name: "Eggs", place: "fridge", unit: "eggs" },
  { id: SEED_IDS.yogurt, name: "Greek yogurt", place: "fridge", unit: "tubs" },
  { id: SEED_IDS.coffee, name: "Coffee beans", place: "pantry", unit: "bags" },
  { id: SEED_IDS.oliveOil, name: "Olive oil", place: "pantry", unit: null },
  { id: SEED_IDS.rice, name: "Rice", place: "pantry", unit: "kg" },
];

/** Write the seed for a user who has no items yet. Returns false when there was something already. */
export async function seedInventory(db: D1Database, userId: string, now = new Date()): Promise<boolean> {
  const existing = await db.prepare("SELECT COUNT(*) AS n FROM items WHERE user_id = ?1").bind(userId).first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) return false;

  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const web = { source: "web" as const, clientRef: null };
  const usd = (cents: number) => ({ priceCents: cents, currency: "USD" });

  await db.batch(
    ITEMS.map((item) =>
      db
        .prepare("INSERT INTO items (id, user_id, name, name_key, place, unit, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
        .bind(item.id, userId, item.name, normaliseName(item.name), item.place, item.unit, ago(30).toISOString()),
    ),
  );

  // Milk: one carton every 7 days, uses never logged (ADR 0006 example 2), 6 days since the last.
  for (const [days, cents] of [[27, 329], [20, 329], [13, 349], [6, 349]] as const) {
    await recordPurchase(db, userId, SEED_IDS.milk, { ...web, quantity: 1, ...usd(cents), occurredAt: ago(days) });
  }
  // Eggs: 2 left of a 12 purchase.
  await recordPurchase(db, userId, SEED_IDS.eggs, { ...web, quantity: 12, ...usd(429), occurredAt: ago(14) });
  await recordUse(db, userId, SEED_IDS.eggs, { ...web, quantity: 10, reason: "used", occurredAt: ago(2) });
  // Greek yogurt: 5 tubs, ok.
  await recordPurchase(db, userId, SEED_IDS.yogurt, { ...web, quantity: 6, ...usd(599), occurredAt: ago(3) });
  await recordUse(db, userId, SEED_IDS.yogurt, { ...web, quantity: 1, reason: "used", occurredAt: ago(1) });
  // Coffee beans: out, 0 bags.
  await recordPurchase(db, userId, SEED_IDS.coffee, { ...web, quantity: 1, ...usd(1299), occurredAt: ago(21) });
  await setQuantity(db, userId, SEED_IDS.coffee, { ...web, quantity: 0, occurredAt: ago(1) });
  // Olive oil: untracked, no events.
  // Rice: 2 kg, ok.
  await recordPurchase(db, userId, SEED_IDS.rice, { ...web, quantity: 2, ...usd(450), occurredAt: ago(5) });
  return true;
}
