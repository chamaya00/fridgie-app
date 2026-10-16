// The inventory's routes. Every one calls src/service/ with the session's user
// id, and every change is a form post answered POST, 303, GET (design spec
// section 8). Row actions come back to /#item-{id}.

import { Hono } from "hono";
import type { ItemView } from "../service/inventory";
import {
  addItem,
  getItem,
  itemHistory,
  listItems,
  recordPurchase,
  recordUse,
  removeItem,
  ServiceError,
  setLowAt,
  setQuantity,
  updateItem,
} from "../service/inventory";
import type { Place } from "../service/terms";
import { PLACES, WEB_CURRENCY } from "../service/terms";
import { isoDate, parseOccurredAt } from "../service/time";
import { formatQuantity } from "../service/words";
import type { AppContext, AppEnv } from "./session";
import { requireUser, setFlash, takeFlash } from "./session";
import type { AddItemValues, BoughtValues, EditValues, FieldErrors, ItemPageForms } from "./views";
import {
  AddItemPage,
  amount,
  BoughtPage,
  capitalise,
  dollars,
  EditItemPage,
  InventoryPage,
  ItemPage,
  NotFoundPage,
  RemovePage,
  renderPage,
} from "./views";

export const inventory = new Hono<AppEnv>();
inventory.use("*", requireUser);

// ---- parsing ----------------------------------------------------------------

export function newClientRef(): string {
  return crypto.randomUUID();
}

/** A client_ref from a form: 8 to 64 safe characters, or a fresh one if it is missing or malformed. */
function formClientRef(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9_#:.-]{8,64}$/.test(value) ? value : newClientRef();
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A quantity typed into a form: "", or a finite number. */
export function parseAmount(raw: string): number | null | "bad" {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  if (!/^\d*\.?\d+$|^\d+\.$/.test(trimmed)) return "bad";
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : "bad";
}

/** Dollars typed into the price field, to cents rounded to the nearest cent. */
export function parseDollars(raw: string): number | null | "bad" {
  const trimmed = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (trimmed === "") return null;
  if (!/^\d*\.?\d+$|^\d+\.$/.test(trimmed)) return "bad";
  return Math.round(Number(trimmed) * 100);
}

function parsePlace(raw: string): Place {
  return (PLACES as readonly string[]).includes(raw) ? (raw as Place) : "fridge";
}

function isSaveFailure(error: unknown): boolean {
  return !(error instanceof ServiceError);
}

const QUANTITY_HINT = "Type a number, like 2 or 0.5.";
const PRICE_HINT = "Type an amount in dollars, like 4.29.";

function page(c: AppContext, title: string, body: Parameters<typeof renderPage>[1], status: 200 | 400 | 404 | 503 = 200) {
  return c.html(renderPage(title, body), status);
}

async function loadItem(c: AppContext): Promise<ItemView | null> {
  return getItem(c.env.DB, c.get("user").id, c.req.param("id") ?? "", new Date());
}

function notFound(c: AppContext) {
  return page(c, "Not here", NotFoundPage(), 404);
}

function backToRow(c: AppContext, itemId: string) {
  return c.redirect(`/#item-${itemId}`, 303);
}

// ---- the inventory ----------------------------------------------------------

inventory.get("/", async (c) => {
  const items = await listItems(c.env.DB, c.get("user").id, new Date());
  const flash = await takeFlash(c);
  return page(c, "Fridgie", InventoryPage({ items, flash, refFor: newClientRef }));
});

/** A one-tap action that failed: the inventory, unchanged, with the panel above the Summary. */
async function rowActionFailed(c: AppContext, item: ItemView) {
  const items = await listItems(c.env.DB, c.get("user").id, new Date());
  const error = `Nothing was recorded for ${item.name}. Try again.`;
  return page(c, "Fridgie", InventoryPage({ items, error, refFor: newClientRef }), 503);
}

inventory.post("/items/:id/used", async (c) => {
  const item = await loadItem(c);
  if (!item) return notFound(c);
  const form = await c.req.parseBody();
  try {
    await recordUse(c.env.DB, c.get("user").id, item.id, {
      quantity: 1,
      reason: "used",
      occurredAt: new Date(),
      clientRef: formClientRef(form.client_ref),
      source: "web",
    });
  } catch (error) {
    if (isSaveFailure(error)) return rowActionFailed(c, item);
    throw error;
  }
  const after = await loadItem(c);
  const left = after?.quantity ?? 0;
  await setFlash(c, {
    text: left <= 0 ? `Used the last ${item.name}.` : `Used 1 ${item.name}. ${amount(left, item.unit)} left.`,
    link: { href: `/items/${item.id}?focus=quantity#quantity`, label: "Change" },
    itemId: item.id,
  });
  return backToRow(c, item.id);
});

inventory.post("/items/:id/out", async (c) => {
  const item = await loadItem(c);
  if (!item) return notFound(c);
  const form = await c.req.parseBody();
  try {
    await setQuantity(c.env.DB, c.get("user").id, item.id, {
      quantity: 0,
      occurredAt: new Date(),
      clientRef: formClientRef(form.client_ref),
      source: "web",
    });
  } catch (error) {
    if (isSaveFailure(error)) return rowActionFailed(c, item);
    throw error;
  }
  await setFlash(c, {
    text: `${capitalise(item.name)} marked out.`,
    link: { href: `/items/${item.id}?focus=quantity#quantity`, label: "Set quantity" },
    itemId: item.id,
  });
  return backToRow(c, item.id);
});

// ---- add item ---------------------------------------------------------------

inventory.get("/items/new", (c) => {
  const values: AddItemValues = { name: "", place: parsePlace(c.req.query("place") ?? ""), quantity: "", unit: "", price: "", clientRef: newClientRef() };
  return page(c, "Add item", AddItemPage({ values }));
});

inventory.post("/items", async (c) => {
  const form = await c.req.parseBody();
  const values: AddItemValues = {
    name: text(form.name),
    place: parsePlace(text(form.place)),
    quantity: text(form.quantity),
    unit: text(form.unit),
    price: text(form.price),
    clientRef: formClientRef(form.client_ref),
  };
  const errors: FieldErrors = {};
  const name = values.name.trim();
  if (name.length < 1 || name.length > 60) errors.name = "Give it a name, up to 60 characters.";
  const quantity = parseAmount(values.quantity);
  if (quantity === "bad" || quantity === 0) errors.quantity = QUANTITY_HINT;
  const price = parseDollars(values.price);
  if (price === "bad") errors.price = PRICE_HINT;
  if (Object.keys(errors).length > 0 || quantity === "bad" || price === "bad") {
    return page(c, "Add item", AddItemPage({ values, errors }), 400);
  }

  const unit = values.unit.trim() || null;
  let result;
  try {
    result = await addItem(c.env.DB, c.get("user").id, {
      name,
      place: values.place,
      unit,
      lowAt: null,
      purchase: quantity === null ? null : { quantity, priceCents: price, currency: price === null ? null : WEB_CURRENCY, occurredAt: new Date() },
      clientRef: values.clientRef,
      source: "web",
    });
  } catch (error) {
    if (isSaveFailure(error)) return page(c, "Add item", AddItemPage({ values, failed: true }), 503);
    throw error;
  }
  if (result.status === "exists") return page(c, "Add item", AddItemPage({ values, clash: result.item }), 400);
  const added = result.item;
  await setFlash(c, {
    text: quantity === null ? `Added ${added.name}.` : `Added ${added.name}. Bought ${amount(quantity, added.unit)}.`,
    itemId: added.id,
  });
  return backToRow(c, added.id);
});

// ---- bought -----------------------------------------------------------------

function boughtDefaults(item: ItemView): BoughtValues {
  const last = item.lastPurchase;
  return {
    quantity: last ? formatQuantity(last.quantity) : "1",
    price: last?.priceCents != null ? dollars(last.priceCents) : "",
    when: isoDate(new Date()),
    clientRef: newClientRef(),
  };
}

inventory.get("/items/:id/bought", async (c) => {
  const item = await loadItem(c);
  if (!item) return notFound(c);
  return page(c, `Bought ${item.name}`, BoughtPage({ item, values: boughtDefaults(item) }));
});

inventory.post("/items/:id/bought", async (c) => {
  const item = await loadItem(c);
  if (!item) return notFound(c);
  const form = await c.req.parseBody();
  const values: BoughtValues = {
    quantity: text(form.quantity),
    price: text(form.price),
    when: text(form.when),
    clientRef: formClientRef(form.client_ref),
  };
  const now = new Date();
  const errors: FieldErrors = {};
  const quantity = parseAmount(values.quantity);
  if (quantity === null || quantity === "bad" || quantity <= 0) errors.quantity = QUANTITY_HINT;
  const price = parseDollars(values.price);
  if (price === "bad") errors.price = PRICE_HINT;
  const when = values.when.trim() === "" ? ({ ok: true, at: now } as const) : parseOccurredAt(values.when, now);
  if (!when.ok) errors.when = when.error === "future" ? "That's more than a day ahead. Pick today or an earlier date." : "Pick a date.";
  if (Object.keys(errors).length > 0 || quantity === null || quantity === "bad" || price === "bad" || !when.ok) {
    return page(c, `Bought ${item.name}`, BoughtPage({ item, values, errors }), 400);
  }

  try {
    await recordPurchase(c.env.DB, c.get("user").id, item.id, {
      quantity,
      priceCents: price,
      currency: price === null ? null : WEB_CURRENCY,
      occurredAt: when.at,
      clientRef: values.clientRef,
      source: "web",
    });
  } catch (error) {
    if (isSaveFailure(error)) return page(c, `Bought ${item.name}`, BoughtPage({ item, values, failed: true }), 503);
    throw error;
  }
  await setFlash(c, { text: `Bought ${formatQuantity(quantity)} ${item.name}.`, itemId: item.id });
  return backToRow(c, item.id);
});

// ---- the item page ----------------------------------------------------------

function itemForms(item: ItemView, overrides: Partial<ItemPageForms> = {}): ItemPageForms {
  return {
    quantity: item.quantity === null ? "1" : formatQuantity(item.quantity),
    lowAt: item.lowAt === null ? "" : formatQuantity(item.lowAt),
    discard: "1",
    quantityRef: newClientRef(),
    lowAtRef: newClientRef(),
    discardRef: newClientRef(),
    ...overrides,
  };
}

async function renderItemPage(c: AppContext, item: ItemView, forms: ItemPageForms, status: 200 | 400 | 503 = 200, flash?: Parameters<typeof ItemPage>[0]["flash"]) {
  const history = await itemHistory(c.env.DB, c.get("user").id, item.id);
  return page(c, item.name, ItemPage({ item, history, forms, flash }), status);
}

inventory.get("/items/:id", async (c) => {
  const item = await loadItem(c);
  if (!item) return notFound(c);
  const n = c.req.query("n");
  const flash = await takeFlash(c);
  const forms = itemForms(item, {
    focusQuantity: c.req.query("focus") === "quantity" || n !== undefined,
    ...(n !== undefined && parseAmount(n) !== "bad" && parseAmount(n) !== null ? { quantity: n } : {}),
  });
  return renderItemPage(c, item, forms, 200, flash);
});

inventory.post("/items/:id/quantity", async (c) => {
  const item = await loadItem(c);
  if (!item) return notFound(c);
  const form = await c.req.parseBody();
  const raw = text(form.quantity);
  const clientRef = formClientRef(form.client_ref);
  const parsed = parseAmount(raw);

  // − and + only change the number on the page; nothing is written until Set.
  const delta = text(form.delta);
  if (delta === "1" || delta === "-1") {
    const base = typeof parsed === "number" ? parsed : (item.quantity ?? 0);
    const next = Math.max(0, base + Number(delta));
    return c.redirect(`/items/${item.id}?n=${encodeURIComponent(formatQuantity(next))}#quantity`, 303);
  }

  if (parsed === null || parsed === "bad" || parsed < 0) {
    return renderItemPage(c, item, itemForms(item, { quantity: raw, quantityRef: clientRef, errors: { quantity: QUANTITY_HINT }, focusQuantity: true }), 400);
  }
  try {
    await setQuantity(c.env.DB, c.get("user").id, item.id, { quantity: parsed, occurredAt: new Date(), clientRef, source: "web" });
  } catch (error) {
    if (isSaveFailure(error)) return renderItemPage(c, item, itemForms(item, { quantity: raw, quantityRef: clientRef, failedCard: "quantity" }), 503);
    throw error;
  }
  await setFlash(c, {
    text: parsed === 0 ? `${capitalise(item.name)} marked out.` : `${capitalise(item.name)} set to ${amount(parsed, item.unit)}.`,
    link: { href: `/items/${item.id}?focus=quantity#quantity`, label: "Change" },
    itemId: item.id,
  });
  return backToRow(c, item.id);
});

inventory.post("/items/:id/low-at", async (c) => {
  const item = await loadItem(c);
  if (!item) return notFound(c);
  const form = await c.req.parseBody();
  const raw = text(form.low_at);
  const clientRef = formClientRef(form.client_ref);
  const parsed = parseAmount(raw);
  if (parsed === "bad" || (parsed !== null && parsed < 0)) {
    return renderItemPage(c, item, itemForms(item, { lowAt: raw, lowAtRef: clientRef, errors: { lowAt: QUANTITY_HINT } }), 400);
  }
  try {
    await setLowAt(c.env.DB, c.get("user").id, item.id, parsed);
  } catch (error) {
    if (isSaveFailure(error)) return renderItemPage(c, item, itemForms(item, { lowAt: raw, lowAtRef: clientRef, failedCard: "low_at" }), 503);
    throw error;
  }
  await setFlash(c, {
    text: parsed === null ? "Back to the default warning." : `Fridgie warns when it's down to ${amount(parsed, item.unit)}.`,
  });
  return c.redirect(`/items/${item.id}`, 303);
});

inventory.post("/items/:id/discard", async (c) => {
  const item = await loadItem(c);
  if (!item) return notFound(c);
  const form = await c.req.parseBody();
  const raw = text(form.quantity);
  const clientRef = formClientRef(form.client_ref);
  const parsed = parseAmount(raw);
  if (parsed === null || parsed === "bad" || parsed <= 0) {
    return renderItemPage(c, item, itemForms(item, { discard: raw, discardRef: clientRef, errors: { discard: QUANTITY_HINT } }), 400);
  }
  try {
    await recordUse(c.env.DB, c.get("user").id, item.id, { quantity: parsed, reason: "discarded", occurredAt: new Date(), clientRef, source: "web" });
  } catch (error) {
    if (isSaveFailure(error)) return renderItemPage(c, item, itemForms(item, { discard: raw, discardRef: clientRef, failedCard: "discard" }), 503);
    throw error;
  }
  const after = await loadItem(c);
  const left = after?.quantity ?? 0;
  await setFlash(c, {
    text: `Threw away ${formatQuantity(parsed)} ${item.name}. ${left <= 0 ? "None left." : `${amount(left, item.unit)} left.`}`,
    link: { href: `/items/${item.id}?focus=quantity#quantity`, label: "Change" },
    itemId: item.id,
  });
  return backToRow(c, item.id);
});

// ---- rename or move ---------------------------------------------------------

inventory.get("/items/:id/edit", async (c) => {
  const item = await loadItem(c);
  if (!item) return notFound(c);
  const values: EditValues = { name: item.name, place: item.place, unit: item.unit ?? "", clientRef: newClientRef() };
  return page(c, `Rename or move ${item.name}`, EditItemPage({ item, values }));
});

inventory.post("/items/:id/edit", async (c) => {
  const item = await loadItem(c);
  if (!item) return notFound(c);
  const form = await c.req.parseBody();
  const values: EditValues = { name: text(form.name), place: parsePlace(text(form.place)), unit: text(form.unit), clientRef: formClientRef(form.client_ref) };
  const name = values.name.trim();
  if (name.length < 1 || name.length > 60) {
    return page(c, `Rename or move ${item.name}`, EditItemPage({ item, values, errors: { name: "Give it a name, up to 60 characters." } }), 400);
  }
  let result;
  try {
    result = await updateItem(c.env.DB, c.get("user").id, item.id, { name, place: values.place, unit: values.unit.trim() || null });
  } catch (error) {
    if (isSaveFailure(error)) return page(c, `Rename or move ${item.name}`, EditItemPage({ item, values, failed: true }), 503);
    throw error;
  }
  if (result.status === "exists") return page(c, `Rename or move ${item.name}`, EditItemPage({ item, values, clash: result.item }), 400);
  await setFlash(c, { text: `Saved ${result.item.name}.`, itemId: item.id });
  return backToRow(c, item.id);
});

// ---- remove -----------------------------------------------------------------

inventory.get("/items/:id/remove", async (c) => {
  const item = await loadItem(c);
  if (!item) return notFound(c);
  return page(c, `Remove ${item.name}`, RemovePage({ item, clientRef: newClientRef() }));
});

inventory.post("/items/:id/remove", async (c) => {
  const item = await loadItem(c);
  if (!item) return notFound(c);
  const form = await c.req.parseBody();
  try {
    await removeItem(c.env.DB, c.get("user").id, item.id);
  } catch (error) {
    if (isSaveFailure(error)) return page(c, `Remove ${item.name}`, RemovePage({ item, clientRef: formClientRef(form.client_ref), failed: true }), 503);
    throw error;
  }
  await setFlash(c, { text: `Removed ${item.name}.` });
  return c.redirect("/", 303);
});
