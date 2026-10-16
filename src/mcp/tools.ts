// The assistant's ten tools (design spec section 10, which is the contract):
// names, inputs, descriptions and hints as the spec writes them. Every tool
// calls src/service/ with the token's user id, exactly as the web routes call
// it with the session's, so the two clients share one write path (ADR 0001).

import * as z from "zod";
import type { ItemView } from "../service/inventory";
import {
  addItem,
  getItem,
  getItemIncludingRemoved,
  listItems,
  recordPurchase,
  recordUse,
  removeItem,
  ServiceError,
  setLowAt,
  setQuantity,
  updateItem,
} from "../service/inventory";
import { matchName } from "../service/names";
import type { Place, Source } from "../service/terms";
import { PLACES, USE_REASONS } from "../service/terms";
import { parseOccurredAt } from "../service/time";
import { summarise } from "../service/words";

export const SCOPE_READ = "mcp:read";
export const SCOPE_WRITE = "mcp:write";

const SOURCE: Source = "mcp";
/** Spec section 10, "Shared types": a price given without a currency is in US dollars. */
export const DEFAULT_CURRENCY = "USD";

// ---- shared types (spec section 10) -----------------------------------------

export interface Item {
  item_id: string;
  name: string;
  place: Place;
  quantity: number | null;
  unit: string | null;
  state: ItemView["state"];
  reason: ItemView["reason"];
  reason_text: string | null;
  low_at: number | null;
  last_purchase: { quantity: number; price: number | null; currency: string | null; occurred_at: string } | null;
}

export function toItem(view: ItemView): Item {
  const p = view.lastPurchase;
  return {
    item_id: view.id,
    name: view.name,
    place: view.place,
    quantity: view.quantity,
    unit: view.unit,
    state: view.state,
    reason: view.reason,
    reason_text: view.reasonText,
    low_at: view.lowAt,
    last_purchase: p
      ? { quantity: p.quantity, price: p.priceCents === null ? null : p.priceCents / 100, currency: p.currency, occurred_at: p.occurredAt.toISOString() }
      : null,
  };
}

const place = z.enum(PLACES);
const clientRef = z.string().min(8).max(64);
const itemRef = z.union([z.object({ item_id: z.string() }).strict(), z.object({ name: z.string() }).strict()]);
export type ItemRef = z.infer<typeof itemRef>;

// ---- name resolution (spec section 10, "Name matching") ---------------------

export type Resolved<T> =
  | { status: "found"; item: T }
  | { status: "no_match"; name: string; close: T[] }
  | { status: "ambiguous"; name: string; candidates: T[] }
  | { status: "unknown_id"; item_id: string };

/**
 * Resolve an ItemRef against the items not removed. A name acts only on
 * exactly one exact match; close matches come back and never act on their
 * own. An item_id that is not among them (removed, or another user's) is
 * unknown, whoever it belongs to.
 */
export function resolveRef<T extends { id: string; name: string }>(ref: ItemRef, items: readonly T[]): Resolved<T> {
  if ("item_id" in ref) {
    const item = items.find((i) => i.id === ref.item_id);
    return item ? { status: "found", item } : { status: "unknown_id", item_id: ref.item_id };
  }
  const match = matchName(ref.name, items);
  if (match.status === "found") return match;
  if (match.status === "ambiguous") return { status: "ambiguous", name: ref.name, candidates: match.candidates };
  return { status: "no_match", name: ref.name, close: match.close };
}

/** The spec's shape for a reference that did not land on one item. Nothing was written for it. */
function unresolved(r: Exclude<Resolved<ItemView>, { status: "found" }>): Record<string, unknown> {
  if (r.status === "ambiguous") return { status: "ambiguous", name: r.name, candidates: r.candidates.map(toItem) };
  if (r.status === "no_match") return { status: "no_match", name: r.name, close: r.close.map(toItem) };
  return { status: "no_match", item_id: r.item_id, close: [] };
}

// ---- results ----------------------------------------------------------------

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** Structured content, plus the same JSON as text for clients that read only text (MCP "Structured content"). */
function ok(structured: Record<string, unknown>): ToolResult {
  return { structuredContent: structured, content: [{ type: "text", text: JSON.stringify(structured) }] };
}

function refused(message: string): ToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

class Refusal extends Error {}

function when(raw: string | undefined, now: Date): Date {
  if (raw === undefined) return now;
  const parsed = parseOccurredAt(raw, now);
  if (parsed.ok) return parsed.at;
  throw new Refusal(
    parsed.error === "future"
      ? `occurred_at ${raw} is more than 1 day in the future.`
      : `occurred_at ${raw} is not an ISO 8601 date or timestamp.`,
  );
}

/** Spec section 10, "Prices": decimals in major units to cents; USD by default; a currency without a price is ignored. */
export function price(amount: number | undefined, currency: string | undefined): { priceCents: number | null; currency: string | null } {
  if (amount === undefined) return { priceCents: null, currency: null };
  const code = (currency ?? DEFAULT_CURRENCY).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Refusal(`currency ${currency ?? ""} is not an ISO 4217 code such as USD.`);
  return { priceCents: Math.round(amount * 100), currency: code };
}

// ---- the tools --------------------------------------------------------------

export interface ToolContext {
  db: D1Database;
  userId: string;
  now: Date;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodObject;
  readOnly: boolean;
  destructive: boolean;
  scope: typeof SCOPE_READ | typeof SCOPE_WRITE;
  run: (ctx: ToolContext, args: never) => Promise<ToolResult>;
}

function tool<S extends z.ZodObject>(definition: {
  name: string;
  description: string;
  inputSchema: S;
  readOnly: boolean;
  destructive?: boolean;
  run: (ctx: ToolContext, args: z.infer<S>) => Promise<ToolResult>;
}): ToolDefinition {
  const { readOnly, destructive = false, run } = definition;
  return {
    ...definition,
    readOnly,
    destructive,
    scope: readOnly ? SCOPE_READ : SCOPE_WRITE,
    run: async (ctx, args) => {
      try {
        return await run(ctx, args);
      } catch (error) {
        if (error instanceof Refusal || error instanceof ServiceError) return refused(error.message);
        throw error;
      }
    },
  };
}

/** After a write that resolved one item: that item as it now is, with the status. */
async function written(ctx: ToolContext, itemId: string, status: string): Promise<ToolResult> {
  const item = await getItem(ctx.db, ctx.userId, itemId, ctx.now);
  return ok(item ? { status, item: toItem(item) } : { status });
}

/** Resolve one ItemRef, then write for it, or return the unresolved shape. */
async function writeFor(ctx: ToolContext, ref: ItemRef, write: (itemId: string) => Promise<string>): Promise<ToolResult> {
  const items = await listItems(ctx.db, ctx.userId, ctx.now);
  const resolved = resolveRef(ref, items);
  if (resolved.status !== "found") return ok(unresolved(resolved));
  return written(ctx, resolved.item.id, await write(resolved.item.id));
}

export const TOOLS: readonly ToolDefinition[] = [
  tool({
    name: "list_inventory",
    description:
      "Everything in the owner's fridge and pantry, with each item's quantity and state (untracked, ok, low, out). Use for 'what's in the fridge?', 'do we have rice?', 'how many eggs are left?'. For only what needs buying, use list_low_and_out.",
    inputSchema: z.object({ place: place.optional() }),
    readOnly: true,
    run: async (ctx, args) => {
      const items = await listItems(ctx.db, ctx.userId, ctx.now);
      return ok({ items: items.filter((i) => args.place === undefined || i.place === args.place).map(toItem) });
    },
  }),
  tool({
    name: "list_low_and_out",
    description:
      "What's running low or out, with why: each low item has reason 'count' (down to its warn level) or 'cycle' (due, by how often it's usually bought). Use for 'what's running low?', 'what do I need to buy?', 'what are we out of?'. Return the summary sentence to the owner as written.",
    inputSchema: z.object({ place: place.optional() }),
    readOnly: true,
    run: async (ctx, args) => {
      // listItems is already in inventory order, which is the order the web Summary reads.
      const items = (await listItems(ctx.db, ctx.userId, ctx.now)).filter((i) => args.place === undefined || i.place === args.place);
      return ok({
        summary: summarise(items).text,
        low: items.filter((i) => i.state === "low").map(toItem),
        out: items.filter((i) => i.state === "out").map(toItem),
      });
    },
  }),
  tool({
    name: "find_items",
    description:
      "Look up several items by name in one call, before recording a receipt or a list of purchases. Returns, per name: found (one exact match), ambiguous (several), or no_match (with close matches). Use the item_id from here in record_purchases. Does not change anything.",
    inputSchema: z.object({ names: z.array(z.string()).min(1).max(50) }),
    readOnly: true,
    run: async (ctx, args) => {
      const items = await listItems(ctx.db, ctx.userId, ctx.now);
      const results = args.names.map((name) => {
        const r = resolveRef({ name }, items);
        return r.status === "found" ? { name, status: "found", item: toItem(r.item) } : unresolved(r);
      });
      return ok({ results });
    },
  }),
  tool({
    name: "add_item",
    description:
      "Add a new item to the fridge or pantry. If a quantity is given, it is also recorded as bought (with the price, if any). Use only for something the owner doesn't track yet: for an existing item, use record_purchases. If the owner didn't say fridge or pantry, ask.",
    inputSchema: z.object({
      name: z.string(),
      place,
      quantity: z.number().positive().optional(),
      unit: z.string().optional(),
      price: z.number().nonnegative().optional(),
      currency: z.string().optional(),
      occurred_at: z.string().optional(),
      low_at: z.number().nonnegative().optional(),
      client_ref: clientRef,
    }),
    readOnly: false,
    run: async (ctx, args) => {
      const occurredAt = when(args.occurred_at, ctx.now);
      const result = await addItem(
        ctx.db,
        ctx.userId,
        {
          name: args.name,
          place: args.place,
          unit: args.unit ?? null,
          lowAt: args.low_at ?? null,
          purchase: args.quantity === undefined ? null : { quantity: args.quantity, ...price(args.price, args.currency), occurredAt },
          clientRef: args.client_ref,
          source: SOURCE,
        },
        ctx.now,
      );
      return ok({ status: result.status, item: toItem(result.item) });
    },
  }),
  tool({
    name: "record_purchases",
    description:
      "Record that the owner bought one or more existing items, in one call: 'I bought milk, a dozen eggs for $4.29 and two yogurts', or every line of a receipt. Each line has an item (item_id from find_items, or an exact name), a quantity, and optionally the price paid for that line (the total, not the unit price), the currency (default USD) and occurred_at (use the receipt's date). A price belongs only to the line it was said with. If the owner gave no quantity, use the item's last_purchase quantity from find_items, or 1. Lines that match no item or several items are not recorded and come back with no_match or ambiguous: ask the owner about those, then add them with add_item or record them again with an item_id. Not for new items: use add_item.",
    inputSchema: z.object({
      lines: z
        .array(
          z.object({
            item: itemRef,
            quantity: z.number().positive(),
            price: z.number().nonnegative().optional(),
            currency: z.string().optional(),
            occurred_at: z.string().optional(),
          }),
        )
        .min(1)
        .max(50),
      client_ref: clientRef,
    }),
    readOnly: false,
    run: async (ctx, args) => {
      // Every line's date and price is checked before any line is written.
      const prepared = args.lines.map((line) => ({ line, occurredAt: when(line.occurred_at, ctx.now), ...price(line.price, line.currency) }));
      const items = await listItems(ctx.db, ctx.userId, ctx.now);
      const outcomes: { line: number; status: string; itemId?: string; rest?: Record<string, unknown> }[] = [];
      for (const [index, p] of prepared.entries()) {
        const resolved = resolveRef(p.line.item, items);
        if (resolved.status !== "found") {
          outcomes.push({ line: index, status: "", rest: unresolved(resolved) });
          continue;
        }
        const status = await recordPurchase(ctx.db, ctx.userId, resolved.item.id, {
          quantity: p.line.quantity,
          priceCents: p.priceCents,
          currency: p.currency,
          occurredAt: p.occurredAt,
          clientRef: `${args.client_ref}#${index}`,
          source: SOURCE,
        });
        outcomes.push({ line: index, status, itemId: resolved.item.id });
      }
      const after = new Map((await listItems(ctx.db, ctx.userId, ctx.now)).map((i) => [i.id, i]));
      const results = outcomes.map((o) => {
        if (o.rest) return { line: o.line, ...o.rest };
        const item = o.itemId === undefined ? undefined : after.get(o.itemId);
        return item ? { line: o.line, status: o.status, item: toItem(item) } : { line: o.line, status: o.status };
      });
      return ok({ results });
    },
  }),
  tool({
    name: "record_use",
    description:
      "Record that the owner used some of an item: 'I used two eggs', 'had a yogurt'. Default quantity is 1. Set reason to 'discarded' when it was thrown away rather than eaten ('the milk went off'). Not for 'used the last of', 'finished' or 'ran out of': that's mark_out.",
    inputSchema: z.object({
      item: itemRef,
      quantity: z.number().positive().optional(),
      reason: z.enum(USE_REASONS).optional(),
      occurred_at: z.string().optional(),
      client_ref: clientRef,
    }),
    readOnly: false,
    run: async (ctx, args) => {
      const occurredAt = when(args.occurred_at, ctx.now);
      return writeFor(ctx, args.item, (itemId) =>
        recordUse(ctx.db, ctx.userId, itemId, { quantity: args.quantity ?? 1, reason: args.reason ?? "used", occurredAt, clientRef: args.client_ref, source: SOURCE }),
      );
    },
  }),
  tool({
    name: "mark_out",
    description:
      "Record that an item is all gone: 'I used the last of the milk', 'we're out of coffee', 'finished the eggs'. Sets the quantity to 0, whatever it was before, so the item shows as out. Not for using some of it: that's record_use.",
    inputSchema: z.object({ item: itemRef, occurred_at: z.string().optional(), client_ref: clientRef }),
    readOnly: false,
    run: async (ctx, args) => {
      const occurredAt = when(args.occurred_at, ctx.now);
      // Out is a count of 0 (ADR 0006), never a use: a stale count of 4 still ends at 0.
      return writeFor(ctx, args.item, (itemId) => setQuantity(ctx.db, ctx.userId, itemId, { quantity: 0, occurredAt, clientRef: args.client_ref, source: SOURCE }));
    },
  }),
  tool({
    name: "set_quantity",
    description:
      "Set how many of an item there are now, after the owner has counted: 'there are actually 3 yogurts', 'we have 2 bags of rice'. For 0, prefer mark_out.",
    inputSchema: z.object({ item: itemRef, quantity: z.number().nonnegative(), client_ref: clientRef }),
    readOnly: false,
    run: async (ctx, args) =>
      writeFor(ctx, args.item, (itemId) =>
        setQuantity(ctx.db, ctx.userId, itemId, { quantity: args.quantity, occurredAt: ctx.now, clientRef: args.client_ref, source: SOURCE }),
      ),
  }),
  tool({
    name: "update_item",
    description:
      "Rename an item, move it between fridge and pantry, change its unit, or set the number at which it should warn as low (low_at; null goes back to the default). Writes no purchase or use.",
    inputSchema: z.object({
      item_id: z.string(),
      name: z.string().optional(),
      place: place.optional(),
      unit: z.string().nullable().optional(),
      low_at: z.number().nonnegative().nullable().optional(),
      client_ref: clientRef,
    }),
    readOnly: false,
    run: async (ctx, args) => {
      const current = await getItem(ctx.db, ctx.userId, args.item_id, ctx.now);
      if (!current) return refused(`No such item: ${args.item_id}.`);
      const changes: { name?: string; place?: Place; unit?: string | null } = {};
      if (args.name !== undefined) changes.name = args.name;
      if (args.place !== undefined) changes.place = args.place;
      if (args.unit !== undefined) changes.unit = args.unit;
      const result = await updateItem(ctx.db, ctx.userId, args.item_id, changes, ctx.now);
      if (result.status === "exists") return ok({ status: "exists", item: toItem(result.item) });
      if (args.low_at !== undefined) await setLowAt(ctx.db, ctx.userId, args.item_id, args.low_at, ctx.now);
      return written(ctx, args.item_id, "updated");
    },
  }),
  tool({
    name: "remove_item",
    description:
      "Stop tracking an item: it leaves the fridge or pantry list. What was bought and used stays in the history. Needs the item_id, so confirm which item with the owner first. Not for 'we're out of it': that's mark_out.",
    inputSchema: z.object({ item_id: z.string(), client_ref: clientRef }),
    readOnly: false,
    destructive: true,
    run: async (ctx, args) => {
      const item = await getItemIncludingRemoved(ctx.db, ctx.userId, args.item_id, ctx.now);
      if (!item) return refused(`No such item: ${args.item_id}.`);
      await removeItem(ctx.db, ctx.userId, args.item_id, ctx.now);
      return ok({ status: "removed", item: toItem(item) });
    },
  }),
];

export const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set(TOOLS.filter((t) => !t.readOnly).map((t) => t.name));
