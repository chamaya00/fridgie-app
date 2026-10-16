// The pages this Worker serves, as server-rendered HTML with no browser
// JavaScript (design spec sections 7 and 8). Component names are the spec's.

import type { Child } from "hono/jsx";
import { raw } from "hono/html";
import type { EventRow, ItemView } from "../service/inventory";
import type { Place, State } from "../service/terms";
import { historyVerb, PLACES, TERMS } from "../service/terms";
import { shortDate } from "../service/time";
import { formatQuantity, summarise } from "../service/words";
import { STYLES } from "./styles";

// ---- helpers ----------------------------------------------------------------

/** "1 carton", "4 cartons": a unit ending in "s" drops it for exactly 1. */
export function unitFor(n: number, unit: string | null): string {
  if (unit === null) return "";
  return n === 1 && /[^s]s$/i.test(unit) ? unit.slice(0, -1) : unit;
}

/** "4 cartons", "2 kg", "3". */
export function amount(n: number, unit: string | null): string {
  const u = unitFor(n, unit);
  return u ? `${formatQuantity(n)} ${u}` : formatQuantity(n);
}

export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function otherPlace(place: Place): Place {
  return place === "fridge" ? "pantry" : "fridge";
}

export interface Flash {
  text: string;
  link?: { href: string; label: string };
  itemId?: string;
}

// ---- layout -----------------------------------------------------------------

export function renderPage(title: string, body: Child): string {
  const page = (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>{title}</title>
        <style>{raw(STYLES)}</style>
      </head>
      <body>{body}</body>
    </html>
  );
  return `<!doctype html>${String(page)}`;
}

function TopBar() {
  return (
    <header class="bar">
      <a class="mark" href="/">
        {TERMS.appName}
      </a>
      <nav>
        <a class="link" href="/assistants">
          {TERMS.assistants}
        </a>
        <a class="btn primary" href="/items/new">
          {TERMS.addItemButton}
        </a>
      </nav>
    </header>
  );
}

function Back() {
  return (
    <a class="back" href="/">
      {TERMS.backToInventory}
    </a>
  );
}

function FlashBanner({ flash }: { flash: Flash }) {
  return (
    <div class="flash" role="status">
      {flash.text}
      {flash.link ? <a href={flash.link.href}>{flash.link.label}</a> : null}
    </div>
  );
}

export function ErrorPanel({ detail }: { detail?: string }) {
  return (
    <div class="alert" role="alert">
      <b>{TERMS.saveFailedTitle}</b>
      {detail ?? TERMS.saveFailedBody}
    </div>
  );
}

function ClientRef({ value }: { value: string }) {
  return <input type="hidden" name="client_ref" value={value} />;
}

function Hint({ text, bad }: { text: string; bad?: boolean }) {
  return <div class={bad ? "hint bad" : "hint"}>{text}</div>;
}

// ---- sign-in ----------------------------------------------------------------

export function SignedOutPage({ next, message }: { next?: string; message?: string }) {
  const href = next ? `/auth/github?next=${encodeURIComponent(next)}` : "/auth/github";
  return (
    <main class="hero">
      <div class="mark">{TERMS.appName}</div>
      <h1>{TERMS.signedOutHeadline}</h1>
      <p>{TERMS.signedOutLede}</p>
      {message ? <div class="alert" role="alert">{message}</div> : null}
      <a class="btn big gh" href={href}>
        {TERMS.signInWithGithub}
      </a>
      <p class="fine">{TERMS.signedOutFine}</p>
    </main>
  );
}

export function NotInvitedPage({ login }: { login: string }) {
  return (
    <main class="hero">
      <div class="mark">{TERMS.appName}</div>
      <h1>{TERMS.notInvitedHeadline}</h1>
      <p>
        GitHub signed you in as <b>@{login}</b>, but this Fridgie only lets in accounts its owner has invited.{" "}
        {TERMS.notInvitedNothingSaved}
      </p>
      <a class="btn big" href="/auth/github?prompt=select_account">
        {TERMS.tryAnotherAccount}
      </a>
      <p class="fine">{TERMS.notInvitedFine}</p>
    </main>
  );
}

// ---- inventory --------------------------------------------------------------

function Summary({ items }: { items: readonly ItemView[] }) {
  const parts = summarise(items);
  if (items.length === 0) {
    return (
      <p class="summary">
        {parts.text}
        <small>{TERMS.emptyLede}</small>
      </p>
    );
  }
  if (parts.low === null && parts.out === null) return <p class="summary">{parts.text}</p>;
  return (
    <p class="summary">
      {parts.low ? <span class="w-low">{parts.low}</span> : null}
      {parts.low && parts.out ? " " : null}
      {parts.out ? <span class="w-out">{parts.out}</span> : null}
    </p>
  );
}

function StateMarker({ state }: { state: State }) {
  if (state === "ok") return <i aria-hidden="true"></i>;
  return <i class={`mk mk-${state}`} aria-hidden="true"></i>;
}

function ReasonLine({ item }: { item: ItemView }) {
  if (item.state === "ok") return null;
  const detail = item.state === "untracked" ? TERMS.noHistoryYet : item.reasonText;
  return (
    <span class="why">
      <b class={`t-${item.state}`}>{TERMS.stateWord[item.state]}</b>
      {detail ? ` · ${detail}` : ""}
    </span>
  );
}

function Quantity({ item }: { item: ItemView }) {
  if (item.quantity === null) {
    return (
      <div class="qty stale">
        <span class="n">–</span>
        <span class="u">{TERMS.notCounted}</span>
      </div>
    );
  }
  const stale = item.state === "low" && item.reason === "cycle";
  const cls = stale ? "qty stale" : item.state === "out" ? "qty zero" : "qty";
  const caption = stale ? TERMS.onRecord : unitFor(item.quantity, item.unit);
  return (
    <div class={cls}>
      <span class="n">{formatQuantity(item.quantity)}</span>
      {caption ? <span class="u">{caption}</span> : null}
    </div>
  );
}

function RowActions({ item, refFor }: { item: ItemView; refFor: () => string }) {
  const name = item.name.toLowerCase();
  const bought = (
    <a class="btn" href={`/items/${item.id}/bought`}>
      {TERMS.bought}
      <span class="vh"> {name}</span>
    </a>
  );
  if (item.state === "out") return <div class="acts">{bought}</div>;
  if (item.state === "untracked") {
    return (
      <div class="acts">
        {bought}
        <a class="btn" href={`/items/${item.id}?focus=quantity#quantity`}>
          {TERMS.setQuantity}
          <span class="vh"> of {name}</span>
        </a>
      </div>
    );
  }
  return (
    <div class="acts">
      {bought}
      <form method="post" action={`/items/${item.id}/used`}>
        <ClientRef value={refFor()} />
        <button class="btn" type="submit">
          {TERMS.used}
          <span class="vh"> {name}</span>
        </button>
      </form>
      <form method="post" action={`/items/${item.id}/out`}>
        <ClientRef value={refFor()} />
        <button class="btn" type="submit">
          {TERMS.out}
          <span class="vh">: {name}</span>
        </button>
      </form>
    </div>
  );
}

function ItemRow({ item, fresh, refFor }: { item: ItemView; fresh: boolean; refFor: () => string }) {
  return (
    <div class={fresh ? "row fresh" : "row"} id={`item-${item.id}`} data-state={item.state}>
      <StateMarker state={item.state} />
      <div>
        <a class="name" href={`/items/${item.id}`}>
          {item.name}
        </a>
        <ReasonLine item={item} />
      </div>
      <Quantity item={item} />
      <RowActions item={item} refFor={refFor} />
    </div>
  );
}

function PlaceGroup({ place, items, freshId, refFor }: { place: Place; items: readonly ItemView[]; freshId?: string; refFor: () => string }) {
  const count = `${items.length} ${items.length === 1 ? "item" : "items"}`;
  return (
    <section class="group" id={place}>
      <h2>
        {TERMS.placeName[place]} <span>{count}</span>
      </h2>
      {items.length === 0 ? (
        place === "fridge" ? (
          <div class="empty-list">
            <strong>{TERMS.emptyFridgeTitle}</strong>
            {TERMS.emptyFridgeBody}
          </div>
        ) : (
          <div class="empty-list">
            <strong>{TERMS.emptyPantryTitle}</strong>
            {TERMS.emptyPantryBody}
          </div>
        )
      ) : (
        <div class="list">
          {items.map((item) => (
            <ItemRow item={item} fresh={item.id === freshId} refFor={refFor} />
          ))}
        </div>
      )}
    </section>
  );
}

export function InventoryPage({ items, flash, error, refFor }: { items: readonly ItemView[]; flash?: Flash; error?: string; refFor: () => string }) {
  return (
    <>
      <TopBar />
      <main class="wrap">
        {error ? <ErrorPanel detail={error} /> : null}
        {flash ? <FlashBanner flash={flash} /> : null}
        <Summary items={items} />
        <div class="groups">
          {PLACES.map((place) => (
            <PlaceGroup place={place} items={items.filter((i) => i.place === place)} freshId={flash?.itemId} refFor={refFor} />
          ))}
        </div>
        {items.length === 0 ? (
          <p style="margin-top:22px">
            <a class="btn big primary" href="/items/new">
              {TERMS.addItemButton}
            </a>
          </p>
        ) : null}
      </main>
    </>
  );
}

// ---- forms ------------------------------------------------------------------

export interface FieldErrors {
  [field: string]: string | undefined;
}

export interface AddItemValues {
  name: string;
  place: Place;
  quantity: string;
  unit: string;
  price: string;
  clientRef: string;
}

function PlaceChoice({ value }: { value: Place }) {
  return (
    <div class="field">
      <span class="lbl" id="place-label">
        {TERMS.whereItLives}
      </span>
      <div class="segs" role="radiogroup" aria-labelledby="place-label">
        {PLACES.map((place) => (
          <label>
            <input type="radio" name="place" value={place} checked={place === value} />
            {TERMS.placeName[place]}
          </label>
        ))}
      </div>
    </div>
  );
}

export function ClashNotice({ existing }: { existing: ItemView }) {
  return (
    <div class="alert" role="alert">
      You already have <a href={`/items/${existing.id}`}>{existing.name}</a> in the {existing.place}.
    </div>
  );
}

export function AddItemPage({ values, errors, failed, clash }: { values: AddItemValues; errors?: FieldErrors; failed?: boolean; clash?: ItemView }) {
  const label = values.name.trim() ? `Add ${values.name.trim().toLowerCase()}` : TERMS.addItemTitle;
  return (
    <main class="narrow-wrap">
      <Back />
      <h1 class="page">{TERMS.addItemTitle}</h1>
      {failed ? <ErrorPanel /> : null}
      {clash ? <ClashNotice existing={clash} /> : null}
      <p class="lede">{TERMS.addItemLede}</p>
      <form method="post" action="/items">
        <ClientRef value={values.clientRef} />
        <div class="field">
          <label for="a-name">{TERMS.name}</label>
          <input class={errors?.name || clash ? "in bad" : "in"} id="a-name" name="name" value={values.name} maxlength={60} required autofocus autocomplete="off" />
          {errors?.name ? <Hint text={errors.name} bad /> : null}
        </div>
        <PlaceChoice value={values.place} />
        <div class="two">
          <div class="field">
            <label for="a-q">
              {TERMS.quantity} <span class="opt">{TERMS.optional}</span>
            </label>
            <input class={errors?.quantity ? "in bad" : "in"} id="a-q" name="quantity" inputmode="decimal" value={values.quantity} autocomplete="off" />
            {errors?.quantity ? <Hint text={errors.quantity} bad /> : null}
          </div>
          <div class="field">
            <label for="a-u">
              {TERMS.unit} <span class="opt">{TERMS.optional}</span>
            </label>
            <input class="in" id="a-u" name="unit" value={values.unit} maxlength={30} autocomplete="off" />
          </div>
        </div>
        <div class="field">
          <label for="a-p">
            {TERMS.pricePaid} <span class="opt">{TERMS.optional}</span>
          </label>
          <div class="money">
            <span>$</span>
            <input class={errors?.price ? "in bad" : "in"} id="a-p" name="price" inputmode="decimal" value={values.price} autocomplete="off" />
          </div>
          <Hint text={errors?.price ?? TERMS.priceHint} bad={Boolean(errors?.price)} />
        </div>
        <div class="formacts">
          <button class="btn big primary" type="submit">
            {failed ? TERMS.tryAgain : label}
          </button>
          <a class="btn quiet" href="/">
            {TERMS.cancel}
          </a>
        </div>
      </form>
    </main>
  );
}

export interface BoughtValues {
  quantity: string;
  price: string;
  when: string;
  clientRef: string;
}

export function BoughtPage({ item, values, errors, failed }: { item: ItemView; values: BoughtValues; errors?: FieldErrors; failed?: boolean }) {
  const last = item.lastPurchase;
  return (
    <main class="narrow-wrap">
      <Back />
      <h1 class="page">Bought {item.name.toLowerCase()}</h1>
      {failed ? <ErrorPanel /> : null}
      <p class="lede">
        {last ? `Filled in from your last purchase, on ${shortDate(last.occurredAt)}. Change anything that's different.` : TERMS.firstTimeBuying}
      </p>
      <form method="post" action={`/items/${item.id}/bought`}>
        <ClientRef value={values.clientRef} />
        <div class="two">
          <div class="field">
            <label for="b-q">{TERMS.quantity}</label>
            <input class={errors?.quantity ? "in bad" : "in"} id="b-q" name="quantity" inputmode="decimal" value={values.quantity} autocomplete="off" />
            {errors?.quantity ? <Hint text={errors.quantity} bad /> : null}
          </div>
          <div class="field">
            <label for="b-p">
              {TERMS.pricePaid} <span class="opt">{TERMS.optional}</span>
            </label>
            <div class="money">
              <span>$</span>
              <input class={errors?.price ? "in bad" : "in"} id="b-p" name="price" inputmode="decimal" value={values.price} autocomplete="off" />
            </div>
            {errors?.price ? <Hint text={errors.price} bad /> : null}
          </div>
        </div>
        <div class="field">
          <label for="b-d">{TERMS.when}</label>
          <input class={errors?.when ? "in bad" : "in"} id="b-d" name="when" type="date" value={values.when} />
          <Hint text={errors?.when ?? TERMS.whenHint} bad={Boolean(errors?.when)} />
        </div>
        <div class="formacts">
          <button class="btn big primary" type="submit">
            {failed ? TERMS.tryAgain : TERMS.savePurchase}
          </button>
          <a class="btn quiet" href="/">
            {TERMS.cancel}
          </a>
        </div>
      </form>
      <p class="fine">{TERMS.boughtFootnote}</p>
    </main>
  );
}

// ---- the item page ----------------------------------------------------------

export interface ItemPageForms {
  /** Which card a failed save or a field error belongs to. */
  failedCard?: "quantity" | "low_at" | "discard";
  errors?: FieldErrors;
  quantity: string;
  lowAt: string;
  discard: string;
  quantityRef: string;
  lowAtRef: string;
  discardRef: string;
  focusQuantity?: boolean;
}

function lowAtHint(item: ItemView): string {
  const q = item.lastPurchase?.quantity;
  if (q === undefined) return "Leave it blank and Fridgie warns at a quarter of your last purchase.";
  const l = Math.floor(q / 4);
  const at = l === 0 ? "only when it runs out" : `when it's down to ${amount(l, item.unit)}`;
  return `Leave it blank and Fridgie warns at a quarter of your last purchase. For ${amount(q, item.unit)}, that is ${at}.`;
}

function recountText(item: ItemView, history: readonly EventRow[]): string {
  if (item.state === "low" && item.reason === "cycle" && item.quantity !== null) {
    const noUses = !history.some((e) => e.type === "use");
    return noUses
      ? `Fridgie has ${amount(item.quantity, item.unit)} on record, but you haven't logged using any. Count what's there and set it.`
      : `Fridgie has ${amount(item.quantity, item.unit)} on record. Count what's there and set it.`;
  }
  return "Count what's there and set it.";
}

function HistoryLine({ event }: { event: EventRow }) {
  const verb = historyVerb(event.type, event.reason);
  return (
    <li>
      <span class="d">{shortDate(new Date(event.occurred_at))}</span>
      {verb} {formatQuantity(event.quantity)}
      {event.price_cents !== null ? <span class="p">${dollars(event.price_cents)}</span> : null}
    </li>
  );
}

export function ItemPage({ item, history, forms, flash }: { item: ItemView; history: readonly EventRow[]; forms: ItemPageForms; flash?: Flash }) {
  const n = Number(forms.quantity);
  const setLabel = Number.isFinite(n) && forms.quantity.trim() !== "" ? `Set to ${amount(n, item.unit)}` : "Set quantity";
  const age = item.classification.ageDays;
  const lastBought = age === null ? "" : ` Last bought ${Math.floor(age)} ${Math.floor(age) === 1 ? "day" : "days"} ago.`;
  const stateText =
    item.state === "untracked"
      ? `${TERMS.noHistoryYet}.`
      : item.state === "ok"
        ? `${item.quantity === null ? "" : amount(item.quantity, item.unit)} on hand.${lastBought}`
        : `${item.reasonText ? ` · ${item.reasonText}.` : ""}${lastBought}`;
  const failed = forms.failedCard;
  return (
    <main class="narrow-wrap">
      <Back />
      {flash ? <FlashBanner flash={flash} /> : null}
      <h1 class="page">{item.name}</h1>
      <div class="state-line">
        <StateMarker state={item.state} />
        <span>
          {item.state === "ok" ? null : <b class={`t-${item.state}`}>{TERMS.stateWord[item.state]}</b>}
          {item.state === "untracked" ? ` · ${stateText}` : stateText}
        </span>
      </div>
      {failed ? <ErrorPanel /> : null}

      <section class="card" id="quantity">
        <h2>{TERMS.howManyTitle}</h2>
        <p>{recountText(item, history)}</p>
        <form method="post" action={`/items/${item.id}/quantity`}>
          <ClientRef value={forms.quantityRef} />
          <div class="stepper">
            <button class="btn" type="submit" name="delta" value="-1" aria-label="One fewer">
              −
            </button>
            <input
              class={forms.errors?.quantity ? "in bad" : "in"}
              name="quantity"
              value={forms.quantity}
              inputmode="decimal"
              aria-label={TERMS.quantity}
              autocomplete="off"
              autofocus={forms.focusQuantity}
            />
            <button class="btn" type="submit" name="delta" value="1" aria-label="One more">
              +
            </button>
          </div>
          {forms.errors?.quantity ? <Hint text={forms.errors.quantity} bad /> : null}
          <div class="formacts" style="margin-top:14px">
            <button class="btn primary" type="submit" name="set" value="1">
              {failed === "quantity" ? TERMS.tryAgain : setLabel}
            </button>
          </div>
        </form>
      </section>

      <section class="card">
        <h2>{TERMS.warnMeTitle}</h2>
        <p>{lowAtHint(item)}</p>
        <form method="post" action={`/items/${item.id}/low-at`}>
          <ClientRef value={forms.lowAtRef} />
          <div class="two">
            <input
              class={forms.errors?.lowAt ? "in bad" : "in"}
              name="low_at"
              value={forms.lowAt}
              placeholder={String(item.lastPurchase ? Math.floor(item.lastPurchase.quantity / 4) : 0)}
              inputmode="decimal"
              aria-label="Low at"
              autocomplete="off"
            />
            <button class="btn" type="submit">
              {failed === "low_at" ? TERMS.tryAgain : TERMS.save}
            </button>
          </div>
          {forms.errors?.lowAt ? <Hint text={forms.errors.lowAt} bad /> : null}
        </form>
      </section>

      <section class="card">
        <h2>{TERMS.threwAwayTitle}</h2>
        <p>{TERMS.threwAwayBody}</p>
        <form method="post" action={`/items/${item.id}/discard`}>
          <ClientRef value={forms.discardRef} />
          <div class="two">
            <input
              class={forms.errors?.discard ? "in bad" : "in"}
              name="quantity"
              value={forms.discard}
              inputmode="decimal"
              aria-label="Amount thrown away"
              autocomplete="off"
            />
            <button class="btn" type="submit">
              {failed === "discard" ? TERMS.tryAgain : TERMS.record}
            </button>
          </div>
          {forms.errors?.discard ? <Hint text={forms.errors.discard} bad /> : null}
        </form>
      </section>

      <section class="card">
        <h2>{TERMS.historyTitle}</h2>
        {history.length === 0 ? (
          <p>{TERMS.noHistory}</p>
        ) : (
          <ul class="hist">
            {history.map((event) => (
              <HistoryLine event={event} />
            ))}
          </ul>
        )}
      </section>

      <div class="footer-links">
        <a class="btn quiet" href={`/items/${item.id}/edit`}>
          Rename or move to {otherPlace(item.place)}
        </a>
        <a class="btn danger" href={`/items/${item.id}/remove`}>
          Remove {item.name.toLowerCase()}
        </a>
      </div>
    </main>
  );
}

export interface EditValues {
  name: string;
  place: Place;
  unit: string;
  clientRef: string;
}

export function EditItemPage({ item, values, errors, failed, clash }: { item: ItemView; values: EditValues; errors?: FieldErrors; failed?: boolean; clash?: ItemView }) {
  return (
    <main class="narrow-wrap">
      <a class="back" href={`/items/${item.id}`}>
        ‹ {item.name}
      </a>
      <h1 class="page">{TERMS.renameOrMoveTitle}</h1>
      {failed ? <ErrorPanel /> : null}
      {clash ? <ClashNotice existing={clash} /> : null}
      <p class="lede">Changes the name, the place or the unit. What you bought and used stays as it is.</p>
      <form method="post" action={`/items/${item.id}/edit`}>
        <ClientRef value={values.clientRef} />
        <div class="field">
          <label for="e-name">{TERMS.name}</label>
          <input class={errors?.name || clash ? "in bad" : "in"} id="e-name" name="name" value={values.name} maxlength={60} required autocomplete="off" />
          {errors?.name ? <Hint text={errors.name} bad /> : null}
        </div>
        <PlaceChoice value={values.place} />
        <div class="field">
          <label for="e-u">
            {TERMS.unit} <span class="opt">{TERMS.optional}</span>
          </label>
          <input class="in" id="e-u" name="unit" value={values.unit} maxlength={30} autocomplete="off" />
        </div>
        <div class="formacts">
          <button class="btn big primary" type="submit">
            {failed ? TERMS.tryAgain : TERMS.saveChanges}
          </button>
          <a class="btn quiet" href={`/items/${item.id}`}>
            {TERMS.cancel}
          </a>
        </div>
      </form>
    </main>
  );
}

export function RemovePage({ item, clientRef, failed }: { item: ItemView; clientRef: string; failed?: boolean }) {
  const lower = item.name.toLowerCase();
  return (
    <main class="narrow-wrap" style="padding-top:12vh">
      <h1 class="page">Remove {lower}?</h1>
      {failed ? <ErrorPanel /> : null}
      <p class="lede" style="font-size:16px">
        {capitalise(item.name)} leaves your {item.place} list and stops showing as low. Fridgie keeps what you bought and used, for your spending.
      </p>
      <p class="lede" style="font-size:16px">
        Add "{capitalise(item.name)}" again later and it starts with no history.
      </p>
      <form method="post" action={`/items/${item.id}/remove`}>
        <ClientRef value={clientRef} />
        <div class="formacts">
          <button class="btn big danger-fill" type="submit">
            {failed ? TERMS.tryAgain : `Remove ${lower}`}
          </button>
          <a class="btn big" href={`/items/${item.id}`}>
            {TERMS.keepIt}
          </a>
        </div>
      </form>
    </main>
  );
}

// ---- consent and connected assistants ----------------------------------------

/** The TopBar's Assistants-pages state (spec section 8): Inventory and Sign out. */
function AssistantsTopBar() {
  return (
    <header class="bar">
      <a class="mark" href="/">
        {TERMS.appName}
      </a>
      <nav>
        <a class="link" href="/">
          {TERMS.inventory}
        </a>
        <a class="link" href="/auth/sign-out">
          {TERMS.signOut}
        </a>
      </nav>
    </header>
  );
}

export interface ConsentView {
  clientName: string;
  redirectHost: string;
  redirectIsLoopback: boolean;
  canRead: boolean;
  canWrite: boolean;
  login: string;
  handle: string;
}

/** ConsentCard (spec section 7, Consent). The host is in its own chip: the one thing an attacker cannot choose freely. */
export function ConsentPage({ consent }: { consent: ConsentView }) {
  return (
    <main class="narrow-wrap" style="padding-top:8vh">
      <div class="eyebrow">{TERMS.appName}</div>
      <h1 class="page">Connect {consent.clientName} to your Fridgie?</h1>
      <p class="lede" style="font-size:16px">
        After you allow it, you'll go back to <span class="host">{consent.redirectHost}</span>. Only allow this if you just asked {consent.clientName} to
        connect.
      </p>
      {consent.redirectIsLoopback ? (
        <div class="alert" role="alert">
          {TERMS.loopbackWarning}
        </div>
      ) : null}
      <div class="card">
        <h3>{consent.clientName} will be able to</h3>
        <ul class="perm">
          {consent.canRead ? (
            <li>
              <i class="dot" />
              <span>{TERMS.canRead}</span>
            </li>
          ) : null}
          {consent.canWrite ? (
            <li>
              <i class="dot" />
              <span>{TERMS.canWrite}</span>
            </li>
          ) : null}
        </ul>
      </div>
      <p class="fine" style="margin:0 0 6px">
        Signed in as <b>@{consent.login}</b>. You can disconnect it any time from Assistants.
      </p>
      <form method="post" action="/authorize">
        <input type="hidden" name="handle" value={consent.handle} />
        <div class="formacts">
          <button class="btn big primary" type="submit" name="decision" value="allow">
            {TERMS.allow}
          </button>
          <button class="btn big" type="submit" name="decision" value="deny">
            {TERMS.deny}
          </button>
        </div>
      </form>
    </main>
  );
}

export function OAuthErrorPage({ message }: { message: string }) {
  return (
    <main class="narrow-wrap" style="padding-top:8vh">
      <div class="eyebrow">{TERMS.appName}</div>
      <h1 class="page">That didn't connect.</h1>
      <p class="lede">{message}</p>
    </main>
  );
}

export interface AssistantView {
  grantId: string;
  name: string;
  host: string;
  connected: Date;
}

/** "Oct 16, 2026". */
function longDate(at: Date): string {
  return `${shortDate(at)}, ${at.getUTCFullYear()}`;
}

/** Connected assistants (spec section 7): one AssistantCard per grant, or the three steps to connect one. */
export function AssistantsPage({ assistants, mcpUrl, flash }: { assistants: readonly AssistantView[]; mcpUrl: string; flash?: Flash }) {
  return (
    <>
      <AssistantsTopBar />
      <main class="narrow-wrap">
        {flash ? <FlashBanner flash={flash} /> : null}
        <h1 class="page">{TERMS.assistantsTitle}</h1>
        {assistants.length === 0 ? (
          <>
            <p class="lede">{TERMS.assistantsLede}</p>
            <div class="empty-box">
              <h3>{TERMS.noAssistantsTitle}</h3>
              <p>{TERMS.noAssistantsLede}</p>
              <ol>
                <li>{TERMS.connectStep1}</li>
                <li>
                  Paste <span class="host">{mcpUrl}</span>
                </li>
                <li>{TERMS.connectStep3}</li>
              </ol>
            </div>
          </>
        ) : (
          <>
            <p class="lede">
              {TERMS.assistantsLede} {TERMS.assistantsLedeDisconnect}
            </p>
            {assistants.map((a) => (
              <form class="card asst" method="post" action={`/assistants/${encodeURIComponent(a.grantId)}/disconnect`}>
                <span class="nm">{a.name}</span>
                <span class="meta">
                  Returns to {a.host} · connected {longDate(a.connected)}
                </span>
                <button class="btn danger" type="submit">
                  {TERMS.disconnect}
                </button>
              </form>
            ))}
            <p class="fine">{TERMS.assistantsFootnote}</p>
          </>
        )}
      </main>
    </>
  );
}

export function NotFoundPage() {
  return (
    <main class="narrow-wrap">
      <Back />
      <h1 class="page">Not here.</h1>
      <p class="lede">There's nothing at this address. It may have been removed.</p>
    </main>
  );
}

