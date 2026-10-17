// The service layer's items and events: the only code that reads or writes
// them (ADR 0003). Every query is scoped by user_id, so one user's id can never
// reach another user's rows, whatever item id it is handed.

import { classify, PURCHASE_WINDOW, type Classification } from "./rule";
import { normaliseName } from "./names";
import type { EventType, LowReason, Place, Source, State, UseReason } from "./terms";
import { PLACES } from "./terms";
import { reasonText } from "./words";

export class ServiceError extends Error {
  constructor(
    readonly code: "invalid" | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface LastPurchase {
  quantity: number;
  priceCents: number | null;
  currency: string | null;
  occurredAt: Date;
}

export interface ItemView {
  id: string;
  name: string;
  place: Place;
  unit: string | null;
  lowAt: number | null;
  /** The quantity on hand, or null when untracked. */
  quantity: number | null;
  state: State;
  reason: LowReason | null;
  reasonText: string | null;
  lastPurchase: LastPurchase | null;
  classification: Classification;
}

export interface EventRow {
  id: number;
  user_id: string;
  item_id: string;
  type: EventType;
  quantity: number;
  on_hand_after: number;
  occurred_at: string;
  recorded_at: string;
  source: Source;
  client_ref: string | null;
  price_cents: number | null;
  currency: string | null;
  reason: UseReason | null;
}

interface ItemRow {
  id: string;
  name: string;
  place: Place;
  unit: string | null;
  low_at: number | null;
  removed_at: string | null;
}

/** Rows D1 reports reading, for checking ADR 0006's bound. */
export interface ReadStats {
  itemRowsRead: number;
  eventRowsRead: number;
}

export type WriteStatus = "recorded" | "already_recorded";

const STATE_ORDER: Record<State, number> = { out: 0, low: 1, untracked: 2, ok: 3 };

export function newItemId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `itm_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Row order within a place: out, low, untracked, ok, and alphabetical inside each (#3 D6). */
export function compareRows(a: ItemView, b: ItemView): number {
  return (
    STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
    a.id.localeCompare(b.id)
  );
}

/** Inventory order: the fridge's rows, then the pantry's. */
export function inventoryOrder(items: readonly ItemView[]): ItemView[] {
  return PLACES.flatMap((place) => items.filter((i) => i.place === place).sort(compareRows));
}

// ---- reads ----------------------------------------------------------------

const LATEST_EVENT_SQL =
  "SELECT on_hand_after FROM events WHERE user_id = ?1 AND item_id = ?2 ORDER BY id DESC LIMIT 1";
const RECENT_PURCHASES_SQL =
  "SELECT quantity, occurred_at, price_cents, currency FROM events " +
  "WHERE user_id = ?1 AND item_id = ?2 AND type = 'purchase' ORDER BY occurred_at DESC LIMIT " +
  String(PURCHASE_WINDOW);
const ITEM_COLUMNS = "id, name, place, unit, low_at, removed_at";

interface PurchaseRow {
  quantity: number;
  occurred_at: string;
  price_cents: number | null;
  currency: string | null;
}

/** Classify items with ADR 0006's two indexed queries each, in one round trip. */
async function viewItems(
  db: D1Database,
  userId: string,
  rows: readonly ItemRow[],
  now: Date,
  stats?: ReadStats,
): Promise<ItemView[]> {
  if (rows.length === 0) return [];
  const latest = db.prepare(LATEST_EVENT_SQL);
  const recent = db.prepare(RECENT_PURCHASES_SQL);
  const results = await db.batch<Record<string, unknown>>(
    rows.flatMap((row) => [latest.bind(userId, row.id), recent.bind(userId, row.id)]),
  );
  return rows.map((row, i) => {
    const latestResult = results[2 * i];
    const recentResult = results[2 * i + 1];
    if (stats) stats.eventRowsRead += (latestResult?.meta.rows_read ?? 0) + (recentResult?.meta.rows_read ?? 0);
    const latestRow = latestResult?.results[0] as { on_hand_after: number } | undefined;
    const purchases = (recentResult?.results ?? []) as unknown as PurchaseRow[];
    return toView(row, latestRow?.on_hand_after ?? null, purchases, now);
  });
}

function toView(row: ItemRow, latestOnHand: number | null, purchases: readonly PurchaseRow[], now: Date): ItemView {
  const classification = classify({
    latestOnHand,
    purchases: purchases.map((p) => ({ quantity: p.quantity, occurredAt: new Date(p.occurred_at) })),
    lowAt: row.low_at,
    now,
  });
  const newest = purchases[0];
  return {
    id: row.id,
    name: row.name,
    place: row.place,
    unit: row.unit,
    lowAt: row.low_at,
    quantity: classification.q,
    state: classification.state,
    reason: classification.reason,
    reasonText: reasonText({ ...classification, lowAt: row.low_at }),
    lastPurchase: newest
      ? {
          quantity: newest.quantity,
          priceCents: newest.price_cents,
          currency: newest.currency,
          occurredAt: new Date(newest.occurred_at),
        }
      : null,
    classification,
  };
}

/** Every item not removed, classified, in inventory order. */
export async function listItems(db: D1Database, userId: string, now: Date, stats?: ReadStats): Promise<ItemView[]> {
  const result = await db
    .prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE user_id = ?1 AND removed_at IS NULL`)
    .bind(userId)
    .all<ItemRow>();
  if (stats) stats.itemRowsRead += result.meta.rows_read;
  return inventoryOrder(await viewItems(db, userId, result.results, now, stats));
}

/** One item not removed, or null when it is not this user's, does not exist, or was removed. */
export async function getItem(db: D1Database, userId: string, itemId: string, now: Date, stats?: ReadStats): Promise<ItemView | null> {
  const row = await db
    .prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE id = ?1 AND user_id = ?2 AND removed_at IS NULL`)
    .bind(itemId, userId)
    .first<ItemRow>();
  if (!row) return null;
  const [view] = await viewItems(db, userId, [row], now, stats);
  return view ?? null;
}

/** One item whether or not it was removed, or null when it is not this user's or does not exist. */
export async function getItemIncludingRemoved(db: D1Database, userId: string, itemId: string, now: Date): Promise<ItemView | null> {
  const row = await db
    .prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE id = ?1 AND user_id = ?2`)
    .bind(itemId, userId)
    .first<ItemRow>();
  if (!row) return null;
  const [view] = await viewItems(db, userId, [row], now);
  return view ?? null;
}

async function requireItem(db: D1Database, userId: string, itemId: string, now: Date): Promise<ItemView> {
  const item = await getItem(db, userId, itemId, now);
  if (!item) throw new ServiceError("not_found", "No such item.");
  return item;
}

/** The item's last few events of any type, newest first in record order. */
export async function itemHistory(db: D1Database, userId: string, itemId: string, limit = 4): Promise<EventRow[]> {
  const result = await db
    .prepare("SELECT * FROM events WHERE user_id = ?1 AND item_id = ?2 ORDER BY id DESC LIMIT ?3")
    .bind(userId, itemId, limit)
    .all<EventRow>();
  return result.results;
}

// ---- writes ---------------------------------------------------------------

export interface EventInput {
  clientRef: string | null;
  source: Source;
  occurredAt: Date;
}

export interface PurchaseInput extends EventInput {
  quantity: number;
  priceCents: number | null;
  currency: string | null;
}

export interface UseInput extends EventInput {
  quantity: number;
  reason: UseReason;
}

export interface CountInput extends EventInput {
  quantity: number;
}

function checkQuantity(quantity: number, allowZero: boolean): void {
  if (!Number.isFinite(quantity) || quantity < 0 || (!allowZero && quantity === 0)) {
    throw new ServiceError("invalid", allowZero ? "Quantity must be 0 or more." : "Quantity must be more than 0.");
  }
}

function checkPrice(priceCents: number | null, currency: string | null): void {
  if (priceCents === null) return;
  if (!Number.isInteger(priceCents) || priceCents < 0) throw new ServiceError("invalid", "price_cents must be a whole number of cents, 0 or more.");
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    throw new ServiceError("invalid", "A price needs a currency (ADR 0006): price_cents was given without an ISO 4217 code.");
  }
}

// on_hand_after (ADR 0006): purchase adds, use subtracts and stops at 0, count sets.
const PREVIOUS =
  "COALESCE((SELECT e.on_hand_after FROM events e WHERE e.user_id = ?1 AND e.item_id = ?2 ORDER BY e.id DESC LIMIT 1), 0)";
const ON_HAND_AFTER: Record<EventType, string> = {
  purchase: `${PREVIOUS} + ?4`,
  use: `MAX(0, ${PREVIOUS} - ?4)`,
  count: "?4",
};

/**
 * One statement that appends one event, computing on_hand_after from the
 * latest event in the same statement so two writes cannot both read the same
 * previous value. It writes nothing when the item is not this user's live item,
 * or when client_ref was already used.
 */
function insertEvent(
  db: D1Database,
  userId: string,
  itemId: string,
  type: EventType,
  quantity: number,
  input: EventInput,
  extra: { priceCents?: number | null; currency?: string | null; reason?: UseReason | null } = {},
  recordedAt = new Date(),
): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO events (user_id, item_id, type, quantity, on_hand_after, occurred_at, recorded_at, source, client_ref, price_cents, currency, reason) " +
        `SELECT ?1, ?2, ?3, ?4, ${ON_HAND_AFTER[type]}, ?5, ?6, ?7, ?8, ?9, ?10, ?11 ` +
        "FROM items WHERE items.id = ?2 AND items.user_id = ?1 AND items.removed_at IS NULL " +
        "ON CONFLICT (user_id, client_ref) DO NOTHING",
    )
    .bind(
      userId,
      itemId,
      type,
      quantity,
      input.occurredAt.toISOString(),
      recordedAt.toISOString(),
      input.source,
      input.clientRef,
      extra.priceCents ?? null,
      extra.currency ?? null,
      extra.reason ?? null,
    );
}

async function eventByClientRef(db: D1Database, userId: string, clientRef: string): Promise<EventRow | null> {
  return db.prepare("SELECT * FROM events WHERE user_id = ?1 AND client_ref = ?2").bind(userId, clientRef).first<EventRow>();
}

async function appendEvent(db: D1Database, userId: string, itemId: string, statement: D1PreparedStatement, clientRef: string | null): Promise<WriteStatus> {
  const result = await statement.run();
  if (result.meta.changes === 1) return "recorded";
  if (clientRef !== null && (await eventByClientRef(db, userId, clientRef))) return "already_recorded";
  throw new ServiceError("not_found", `No such item: ${itemId}.`);
}

export async function recordPurchase(db: D1Database, userId: string, itemId: string, input: PurchaseInput): Promise<WriteStatus> {
  checkQuantity(input.quantity, false);
  checkPrice(input.priceCents, input.currency);
  const currency = input.priceCents === null ? null : input.currency;
  const statement = insertEvent(db, userId, itemId, "purchase", input.quantity, input, { priceCents: input.priceCents, currency });
  return appendEvent(db, userId, itemId, statement, input.clientRef);
}

export async function recordUse(db: D1Database, userId: string, itemId: string, input: UseInput): Promise<WriteStatus> {
  checkQuantity(input.quantity, false);
  const statement = insertEvent(db, userId, itemId, "use", input.quantity, input, { reason: input.reason });
  return appendEvent(db, userId, itemId, statement, input.clientRef);
}

/** Set the quantity after a count. Out is a count of 0 (ADR 0006). */
export async function setQuantity(db: D1Database, userId: string, itemId: string, input: CountInput): Promise<WriteStatus> {
  checkQuantity(input.quantity, true);
  const statement = insertEvent(db, userId, itemId, "count", input.quantity, input);
  return appendEvent(db, userId, itemId, statement, input.clientRef);
}

export interface AddItemInput {
  name: string;
  place: Place;
  unit: string | null;
  lowAt: number | null;
  /** With a quantity, the add also records a purchase. */
  purchase: Omit<PurchaseInput, "clientRef" | "source"> | null;
  clientRef: string | null;
  source: Source;
}

export type AddItemResult =
  | { status: "added"; item: ItemView }
  | { status: "already_recorded"; item: ItemView }
  | { status: "exists"; item: ItemView };

export function checkName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 1 || trimmed.length > 60) throw new ServiceError("invalid", "A name is 1 to 60 characters.");
  return trimmed;
}

/** Find a live item whose name matches exactly, in either place (#3 D6). */
export async function findByName(db: D1Database, userId: string, name: string, now: Date, exceptId?: string): Promise<ItemView | null> {
  const row = await db
    .prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE user_id = ?1 AND name_key = ?2 AND removed_at IS NULL AND id != ?3`)
    .bind(userId, normaliseName(name), exceptId ?? "")
    .first<ItemRow>();
  if (!row) return null;
  const [view] = await viewItems(db, userId, [row], now);
  return view ?? null;
}

async function itemByClientRef(db: D1Database, userId: string, clientRef: string, now: Date): Promise<ItemView | null> {
  const row = await db
    .prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE user_id = ?1 AND created_client_ref = ?2 AND removed_at IS NULL`)
    .bind(userId, clientRef)
    .first<ItemRow>();
  if (!row) return null;
  const [view] = await viewItems(db, userId, [row], now);
  return view ?? null;
}

export async function addItem(db: D1Database, userId: string, input: AddItemInput, now = new Date()): Promise<AddItemResult> {
  const name = checkName(input.name);
  if (!PLACES.includes(input.place)) throw new ServiceError("invalid", "Place is fridge or pantry.");
  if (input.lowAt !== null) checkQuantity(input.lowAt, true);
  if (input.purchase) {
    checkQuantity(input.purchase.quantity, false);
    checkPrice(input.purchase.priceCents, input.purchase.currency);
  }

  if (input.clientRef !== null) {
    const earlier = await itemByClientRef(db, userId, input.clientRef, now);
    if (earlier) return { status: "already_recorded", item: earlier };
  }
  const clash = await findByName(db, userId, name, now);
  if (clash) return { status: "exists", item: clash };

  const id = newItemId();
  const statements = [
    db
      .prepare(
        "INSERT INTO items (id, user_id, name, name_key, place, unit, low_at, created_at, created_client_ref) " +
          "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
      )
      .bind(id, userId, name, normaliseName(name), input.place, input.unit, input.lowAt, now.toISOString(), input.clientRef),
  ];
  if (input.purchase) {
    const p = input.purchase;
    statements.push(
      insertEvent(db, userId, id, "purchase", p.quantity, { ...p, clientRef: input.clientRef, source: input.source }, {
        priceCents: p.priceCents,
        currency: p.priceCents === null ? null : p.currency,
      }),
    );
  }
  try {
    await db.batch(statements);
  } catch (error) {
    // Lost a race with another add of the same name or the same client_ref.
    if (input.clientRef !== null) {
      const earlier = await itemByClientRef(db, userId, input.clientRef, now);
      if (earlier) return { status: "already_recorded", item: earlier };
    }
    const raced = await findByName(db, userId, name, now);
    if (raced) return { status: "exists", item: raced };
    throw error;
  }
  return { status: "added", item: await requireItem(db, userId, id, now) };
}

export interface UpdateItemInput {
  name?: string;
  place?: Place;
  unit?: string | null;
}

export type UpdateItemResult = { status: "updated"; item: ItemView } | { status: "exists"; item: ItemView };

/** Rename, move or change the unit. Writes no event. */
export async function updateItem(db: D1Database, userId: string, itemId: string, input: UpdateItemInput, now = new Date()): Promise<UpdateItemResult> {
  const current = await requireItem(db, userId, itemId, now);
  const name = input.name === undefined ? current.name : checkName(input.name);
  const place = input.place ?? current.place;
  if (!PLACES.includes(place)) throw new ServiceError("invalid", "Place is fridge or pantry.");
  const unit = input.unit === undefined ? current.unit : input.unit;
  const clash = await findByName(db, userId, name, now, itemId);
  if (clash) return { status: "exists", item: clash };
  await db
    .prepare("UPDATE items SET name = ?1, name_key = ?2, place = ?3, unit = ?4 WHERE id = ?5 AND user_id = ?6 AND removed_at IS NULL")
    .bind(name, normaliseName(name), place, unit, itemId, userId)
    .run();
  return { status: "updated", item: await requireItem(db, userId, itemId, now) };
}

/** Set the item's own low threshold, or clear it back to the default with null. Writes no event. */
export async function setLowAt(db: D1Database, userId: string, itemId: string, lowAt: number | null, now = new Date()): Promise<ItemView> {
  if (lowAt !== null) checkQuantity(lowAt, true);
  const result = await db
    .prepare("UPDATE items SET low_at = ?1 WHERE id = ?2 AND user_id = ?3 AND removed_at IS NULL")
    .bind(lowAt, itemId, userId)
    .run();
  if (result.meta.changes !== 1) throw new ServiceError("not_found", `No such item: ${itemId}.`);
  return requireItem(db, userId, itemId, now);
}

/** Take an item out of every list. Its events stay, untouched. */
export async function removeItem(db: D1Database, userId: string, itemId: string, now = new Date()): Promise<{ name: string; place: Place }> {
  const row = await db
    .prepare("SELECT name, place, removed_at FROM items WHERE id = ?1 AND user_id = ?2")
    .bind(itemId, userId)
    .first<{ name: string; place: Place; removed_at: string | null }>();
  if (!row) throw new ServiceError("not_found", `No such item: ${itemId}.`);
  if (row.removed_at === null) {
    await db
      .prepare("UPDATE items SET removed_at = ?1 WHERE id = ?2 AND user_id = ?3 AND removed_at IS NULL")
      .bind(now.toISOString(), itemId, userId)
      .run();
  }
  return { name: row.name, place: row.place };
}
