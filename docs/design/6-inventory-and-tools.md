# Design 6: the browser inventory and the assistant's tools

Issue: #6 (parent #1). Inputs, read as merged and not re-decided: [ADR 0001](../decisions/0001-agent-protocol-mcp.md) (MCP, tools only), [ADR 0002](../decisions/0002-identity-github-sign-in-and-oauth-for-agents.md) (GitHub sign-in, consent, Connected assistants, `mcp:read` / `mcp:write`), [ADR 0003](../decisions/0003-stack-typescript-on-workers.md) (server-rendered Hono), [ADR 0005](../decisions/0005-item-entry-methods.md) (entry methods), [ADR 0006](../decisions/0006-low-and-out-rule-and-events.md) (states and events).

Mock: [6-inventory-and-tools.html](6-inventory-and-tools.html). Pictures: [6-shots/](6-shots/), one pair (narrow 375 px, wide 1280 px) per state. The mock is a drawing. Nothing imports it and it is not the implementation.

## Contents

1. What is there now
2. The issue, separated
3. References
4. Direction
5. Named terms
6. Composition
7. States (one heading per state)
8. Components
9. Tokens, contrast, motion, focus
10. The assistant's tools
11. Critique of the rendered mock
12. Decisions for the owner
13. How the pictures were made

## 1. What is there now

Nothing. `./scripts/app-render / <dir>` refuses, because nothing is built yet. Its output, verbatim:

```
app-render: SERVE_DIR is empty, so there is nothing to serve.
  Open scripts/app-render and set BUILD_CMD and SERVE_DIR to what
  builds this repository and where it builds to. Both are this
  project's to decide; the interface above is not.
  Until then, no role can see this repository rendered, and a run
  told to compare a page against a mock should say so rather than
  describing a page nobody has opened.
```

So this document specifies a first build, not a refresh. There is no "before" picture.

## 2. The issue, separated

**The outcome (fixed).** On a phone, the owner sees what is in the fridge and the pantry and what is low or out, without working it out from the numbers. They can record a purchase, a use, an "it's gone", and a corrected count in a tap or two. An assistant can do the same with the same words.

**The constraints (checked against the merged ADRs).**

- Sign in with GitHub only. Anyone not on the allow-list sees "not invited" (0002).
- A consent page and a Connected assistants page with Disconnect (0002).
- Bought, Used and Out on every row. Bought is prefilled from the last purchase. Used is one unit. Out sets the count to 0. Add item takes a name, quantity, optional unit and optional price (0005).
- Four display states: untracked, ok, low (with reason `count` or `cycle`), out. They are computed when read, never stored (0006).
- Events are append-only. There is no undo for a purchase (0006).
- Tools only. Every tool declares `readOnlyHint` and `destructiveHint`. Reads need `mcp:read` and writes need `mcp:write` (0001, 0002).
- Server-rendered HTML with as little browser JavaScript as the design needs (0003).
- No new outbound host without asking (#3, ADR 0005). So no web fonts and no icon CDN. The mock uses the system font stack and CSS shapes.

**The guesses, and what I did with them.**

- *"Fridge and pantry are two groups."* I kept this. It is how a person stands in a kitchen. The guess I added on top: the page answers "what's running low?" **before** either group, in a sentence (section 6).
- *"Every item shows its quantity."* I kept it, but a quantity is not always believable. A low (cycle) item has a count that is probably wrong (ADR 0006 example 2). So the number is drawn **muted, captioned "on record"**, and the marker carries the state. An untracked item has no quantity yet, so it shows "–" captioned "not counted", not a 0 that would read as out.
- *"Used records one unit."* Kept, as one tap with no form. The correction path is Change quantity, not an amount picker on every row.
- *"Out sets the count to 0."* Kept. I also used it for the assistant phrase "I used the last of the milk" (section 10), so Out means the same thing everywhere.
- *Removing an item with "confirmation or undo".* I chose a **confirmation page**. An undo would need a restore endpoint and a timed banner for one rare action. ADR 0006 keeps the events, so the page says plainly that history stays.

## 3. References

I looked at current work before fixing the direction. What I took and what I refused:

- **Grocy's stock overview** ([release notes mentioning its red, yellow and grey stock-overview highlights](https://newreleases.io/project/github/linuxserver/docker-grocy/release/v3.3.0-ls151)). It is the closest prior art for a home stock list, and ADR 0006 already cites its rule. *Taking:* state is shown inline on each row of the main list, not hidden behind a filter. *Refusing:* whole-row colour tinting as the only signal. Red, yellow and grey rows carry meaning by colour alone, and that fails the accessibility floor. Fridgie's markers are a shape, a word and a colour, so any one of them is enough.
- **Bring!** ([its own post on the tile and list views](https://getbring.com/blog-posts/out-now-your-whole-new-shopping-experience-with-bring)). It is the best-known grocery app with a tile grid, and it later added a list view because quantities did not fit on tiles. *Taking:* a direction worth drawing seriously, so direction B below is a tile shelf. *Refusing:* tiles as the primary view. Bring!'s own move to a list is the evidence: Fridgie's row needs a quantity, a reason and three actions, and a tile has room for one of them.
- **Harvey balls and SAP Fiori's circular-fill status indicator** ([Fiori status indicator](https://www.sap.com/design-system/fiori-design-web/v1-139/ui-elements/status-indicator/usage)). *Taking:* a circle's fill level as the low marker, so "low" looks like a level running down. *Refusing:* Fiori's rule that the small size drops the partial fill and keeps only colour. At 14 px, Fridgie keeps the shape and the word, because the shape is what separates low from out.
- **Tool-description guidance** (OpenAI's [plugin tool planning](https://developers.openai.com/plugins/plan/tools): describe the user's intent, say when to use the tool and how it differs from similar ones). *Taking:* every description in section 10 opens with the owner's own words and names its nearest neighbour ("not for..., use..."). That is what makes each test phrase land on exactly one tool.

## 4. Direction

**Calm, plain-spoken, ledger-like.** It is a list you can read at the fridge door, and it answers in a sentence before it shows a single number.

**It must not look like** a warehouse stock dashboard: no traffic-light rows, no badges on every row, no charts. It must not look like a shopping app either: no product photos and no tiles.

Two directions were drawn far enough to compare. Both use the same data, and they differ in structure:

| | **A: Ledger (recommended)** | **B: Shelf** |
| - | - | - |
| What dominates | A sentence: "Milk and eggs are low. Coffee beans are out." | Big numbers, one per tile |
| Shape of the page | Two grouped lists. Every row carries its own Bought, Used, Out | A grid of tiles. Actions sit one tap down, on the item |
| Repeat purchase | 2 taps (Bought, Save), as ADR 0005 requires | 3 taps (tile, Bought, Save), which breaks ADR 0005 |
| Low (cycle) item | The marker says low, and the number is muted as "on record" | The tile border says low, but a big "4" fights it |
| Picture | `6-04-inventory-*.png` | `6-15-direction-b-*.png` |

**Recommendation: A.** B looks more like an app at a glance, but it breaks the two-tap repeat purchase, and its biggest element is the number this design has to play down. B is in the mock only so the choice is visible. Nothing else in this document specifies it.

## 5. Named terms

This is the one list. The UI labels, the tool names and the tool fields all use these words, spelt this way. The build should keep these strings in one module that both clients import.

| Term | Means | In the UI | In the tools |
| - | - | - | - |
| **item** | One thing the owner tracks | an item row, "Add item", "Remove milk" | `item_id`, `add_item`, `remove_item`, `update_item`, `find_items` |
| **inventory** | All of the owner's items | the main page, "‹ Inventory" | `list_inventory` |
| **place** | Where an item lives: `fridge` or `pantry` | groups "Fridge" and "Pantry", "Where it lives" | `place: "fridge" \| "pantry"` |
| **quantity** | How many are on hand, as Fridgie last knew | the number on the row, "Set quantity" | `quantity`, `set_quantity` |
| **unit** | What a quantity counts (cartons, kg). Optional | the caption under the number, "Unit" | `unit` |
| **purchase** | A `purchase` event. The verb is "bought" | the "Bought" button, "Save purchase", "Bought 1" in history | `record_purchases`, `last_purchase` |
| **price** | The total paid for one purchase line, not a unit price | "Price paid" | `price` (decimal, major units) and `currency` |
| **use** | A `use` event with reason `used`. The verb is "used" | the "Used" button, "Used 1 Greek yogurt" | `record_use`, `reason: "used"` |
| **discarded** | A `use` with reason `discarded` | "Threw some away" | `record_use` with `reason: "discarded"` |
| **out** | State: quantity is 0. Also the action that makes it so (writes `count 0`) | the "Out" button, the "Out" marker | `mark_out`, `state: "out"` |
| **low** | State, with a **reason**: `count` (at or below its low-at) or `cycle` (due, by the usual buying interval) | the "Low" marker and its reason text | `state: "low"`, `reason: "count" \| "cycle"`, `reason_text` |
| **ok** | State: none of the others. It has no marker | no marker | `state: "ok"` |
| **untracked** | State: no events yet (ADR 0006 computes ok, and Fridgie shows it as untracked) | the "Untracked" marker, "no history yet" | `state: "untracked"` |
| **low-at** | The item's own low threshold (`low_at`). Optional | "Warn me when it's down to" | `low_at` |
| **when** | When a purchase or use happened (`occurred_at`). Defaults to now | "When" | `occurred_at` |
| **assistant** | An OAuth client the owner has allowed (ADR 0002) | "Connected assistants", "Disconnect" | (not a tool noun) |

The word **"untracked"** is ADR 0006's word. The issue offered to rename it, and I kept it so the ADR, the UI and the tools share one word. The words **"stock"**, **"product"**, **"grocery"** and **"restock"** appear nowhere, in either client.

## 6. Composition

**What the eye lands on first** is the summary sentence. It is the largest text on the page, 25 px narrow and 52 px wide, bold, with tight tracking (−0.025 to −0.035 em). Its low clause is in the low colour and its out clause in the out colour. It is a sentence, not a count badge, because it is the answer to the question the owner asks the assistant ("what's running low?"), in the same words (section 10, `list_low_and_out`).

Sentence rules, for the build:
- Low items are listed before out items, each clause in inventory order. "X is low." / "X and Y are low." / "X, Y and Z are low." Past three names: "X, Y and 2 more are low."
- When nothing is low or out: "Nothing's low." in ink, not in a colour.
- When the inventory is empty: "Nothing here yet." (see Empty inventory).

**What the page does with its space.**
- *Narrow (375 px, primary).* One column: top bar, sentence, then the Fridge group, then the Pantry group. Within each group, rows are ordered **out, low, untracked, ok**. Inside each of those, the order is alphabetical. What needs something from the owner (buying, or a first count) sits at the top of each group, and everything that is fine sits below it.
- *Wide (≥ 760 px).* The sentence spans the width, and below it the two groups sit side by side as columns. The container is at most 1040 px and centred. Forms stay one 520 px column at every width.

**What survives at 375 px.** The narrow picture `6-04-inventory-narrow.png` shows both group labels and one item of each of the five kinds, with no horizontal scroll. Reason text may wrap to a second line. A name longer than the row wraps and never truncates, because a truncated name on a list of food is a guess.

**Depth language: fills only.** The ground is a warm near-white, groups sit on a lighter surface with 18 px corners, and rows are separated by a 2 px gap of the ground colour. There are no hairline borders and no shadows. Inputs use a 2 px inset ring in the chip colour, which is the one outline in the system, and it exists so a field reads as a field.

**One deliberate oddity: the page opens with a sentence, not a number.** A reasonable designer would put "3 to buy" in a big badge. I didn't, because a number makes the owner do the work the issue says they must not do, and because the sentence is word for word what the assistant says. The web app and Claude then answer in one voice.

## 7. States

Every state below is drawn in the mock and rendered as `6-shots/6-NN-<state>-narrow.png` and `-wide.png`.

The page structure throughout: a top bar holds "Fridgie" (the wordmark, which links to the inventory), "Assistants" and "+ Add item". Forms and the item page replace the bar with a "‹ Inventory" back link.

**Happy path (the inventory, from sign-in to a repeat purchase):**

1. The owner opens Fridgie in Safari and sees **Signed out**, with one action: **Sign in with GitHub**.
2. GitHub returns them. If they are on the allow-list, they see the **Populated inventory**: the sentence, then Fridge, then Pantry. If not, they see **Not invited**.
3. The sentence says what is low and out. The owner taps **Bought** on Eggs.
4. **Bought** opens prefilled with the last purchase: 12, $4.29, today. They tap **Save purchase**.
5. They are back on the inventory, scrolled to Eggs, with a banner ("Bought 12 eggs.") and the row tinted. Eggs is now ok, and the sentence no longer names it.

Tapping **Used** or **Out** on a row is the same round trip with no form in between (see **Used** and **Out**). Tapping an item's **name** opens its item page (see **Change quantity**).

### Signed out

- **Shows:** the wordmark, a 46 / 64 px headline ("What's left in the fridge."), one line of what Fridgie does, a dark **Sign in with GitHub** button, and "Only invited GitHub accounts can sign in."
- **Does:** the button starts the GitHub OAuth flow (ADR 0002 (a)). There is no other sign-in and no "create account".
- **Never:** offers a username/password, or shows anything from any inventory.
- Picture: `6-01-signed-out-*.png`.

### Not invited

- **Shows:** "You're not invited.", the GitHub login GitHub returned (`@login`), the sentence "Nothing was saved about you.", and a **Try another GitHub account** button that starts the flow again.
- **Never:** creates a `users` row (ADR 0002), says who the owner is, or hints at what is inside.
- Picture: `6-02-not-invited-*.png`.

### Empty inventory

- **Shows:** the sentence "Nothing here yet.", with a muted line under it ("Add what's in your fridge and pantry, and Fridgie starts telling you what's low."). Both group labels show "0 items", and each has an empty panel. The Fridge panel suggests starting with weekly items, and the Pantry panel gives an example assistant phrase. Below the groups is a large **+ Add item**.
- **Why both groups render empty:** so the first-time owner learns the page's two-part shape before it has anything in it.
- Picture: `6-03-empty-*.png`.

### Populated inventory

- **Shows:** the sentence, then the groups. Every row has a marker, a name, a reason line (when not ok), the quantity and its unit caption, and the actions.
- **What each state looks like** (shape, word and colour; any one is enough to tell them apart):

| State | Marker (14 px) | Reason line | Quantity | Actions |
| - | - | - | - | - |
| **out** | solid disc, out colour | **Out** | "0" in the out colour, with the unit | **Bought** only. Used and Out make no sense at 0 |
| **low**, reason `count` | ring with its lower 45% filled, low colour | **Low** · down to 2, you buy 12 | normal ink | Bought, Used, Out |
| **low**, reason `cycle` | the same ring | **Low** · due, usually every 7 days | **muted, weight 500, captioned "on record"** in place of the unit | Bought, Used, Out |
| **ok** | none (the space is kept so names align) | none | normal ink | Bought, Used, Out |
| **untracked** | dashed ring, untracked grey | **Untracked** · no history yet | "–" captioned "not counted" | **Bought**, **Set quantity** |

- **The hard case: low (cycle) with a high count.** Milk shows 4 and is low. Three things keep the 4 from making the marker look wrong. The number drops to muted at a lighter weight. Its caption changes from the unit to "on record". The reason line says why ("due, usually every 7 days"). The owner reads "Fridgie thinks it's due, and the 4 is just what was written down", and the item page invites a recount (see **Change quantity**).
- **Reason text, exact templates** (also returned by the tools as `reason_text`):
  - `count`: "down to {q}, you buy {Q}" when `low_at` is unset, and "down to {q}, you warn at {low_at}" when it is set.
  - `cycle`: "due, usually every {round(C)} days".
  - The item page adds "Last bought {a} days ago."
- **Low and out share a hue family on purpose, and that is safe here.** The low and out colours are close to each other: `./scripts/contrast "#94560A" "#B42318"` gives 1.13 in light, and 1.06 in dark. Colour is therefore **not** what separates them. The shape (ring versus solid disc) and the word ("Low" versus "Out") do. That is the point of having three channels.
- Pictures: `6-04-inventory-*.png` (light) and `6-16-inventory-dark-*.png` (dark).

### Add item

- **Fields, in order:**
  - **Name** (required, 1–60 characters).
  - **Where it lives**: a Fridge/Pantry segmented control. It defaults to Fridge, or to the group whose empty-state link was tapped.
  - **Quantity** and **Unit**, side by side, both optional.
  - **Price paid**, optional, with a "$" prefix and the hint "What you paid for all of them, in US dollars."
- **Button:** "Add {name}" (falls back to "Add item" while the name is empty), plus Cancel.
- **Writes:** the item row. If a quantity is given, it also writes a `purchase` for today with the price. With no quantity, it writes no event and the item starts **untracked** (ADR 0006).
- **Name clash:** a name that matches an existing item (by the rule in section 10) re-renders the form with "You already have Milk in the fridge." and a link to it. No duplicate is created.
- **Currency:** every price in the web app is **USD**. There is no currency picker in the first build. `currency` is stored as `"USD"` whenever a price is set.
- Picture: `6-05-add-item-*.png` (shows the focus ring on Name).

### Bought

- **Opens from:** the row's **Bought** button, as a full page `/items/{id}/bought`.
- **Prefill:** quantity and price from the item's latest purchase (ADR 0005). The lede says "Filled in from your last purchase, on {date}." With no earlier purchase, the quantity is 1, the price is empty, and the lede says "First time buying this here."
- **When** defaults to today. It is a date input, so the owner can backdate to a receipt (`occurred_at`), with the hint "Change it to the receipt's date if you're catching up."
- **Save purchase** writes one `purchase` and redirects to `/#item-{id}` with the banner "Bought {quantity} {name}."
- **Footnote:** "Purchases can't be edited once saved. If a count is wrong afterwards, set the quantity on the item's page." This is the first-build answer to a mistaken purchase (ADR 0006). **No undo is drawn for a purchase, anywhere.**
- Picture: `6-06-bought-*.png`.

### Used

- **One tap, no form.** The row's **Used** button posts `use 1` with reason `used` and redirects to `/#item-{id}`.
- **After:** a banner at the top ("Used 1 Greek yogurt. 5 tubs left.") with a **Change** link to the item page. The row is tinted with the flash colour.
- **No undo:** a use is an event, the same as a purchase. The banner's correction path is **Change**, which is Set quantity.
- If the use takes the quantity to 0, the row becomes **out** and the banner says "Used the last Greek yogurt."
- Picture: `6-07-used-*.png` (also shows the focus ring on the tapped Used button).

### Out

- **One tap, no confirmation.** The row's **Out** button posts a `count 0` and redirects to `/#item-{id}`.
- **After:** the banner "{Name} marked out." with a **Set quantity** link. The row is now **out**, and the sentence moves the item to its out clause.
- **Why no confirmation:** Out loses nothing. History stays, and Set quantity reverses it with another `count`.
- Picture: `6-08-out-*.png` (milk, which showed 4 on record, is now out at 0).

### Change quantity

This is the **item page**, `/items/{id}`. Changing a quantity lives here, together with the item's less frequent actions. Cards, top to bottom:

1. **How many are there?** A stepper (− / number / +, 56 px targets) and a button that names the result ("Set to 1 carton"). It writes `count {n}`. For a low (cycle) item, the card's text says why a recount helps: "Fridgie has 4 cartons on record, but you haven't logged using any."
2. **Warn me when it's down to** (`low_at`). It is optional, and blank means ADR 0006's default. The hint explains the default in this item's numbers. **The first build exposes `low_at` here and in the tools.** Clearing the field sets it back to null.
3. **Threw some away.** An amount and **Record**. It writes a `use` with reason `discarded`. **This is where the web app offers `discarded`.** The row's Used button never does.
4. **History.** The item's last four purchases and uses, newest first, read-only (date, "Bought 1" / "Used 2" / "Threw away 1" / "Counted 3", and the price). It shows the owner the inputs the state was computed from.
5. Footer links: **Rename or move to pantry** (a small form for name, place and unit, which writes no event) and **Remove {name}**.

- **Untracked items:** the row's **Set quantity** goes straight here, with card 1 focused.
- Picture: `6-09-change-quantity-*.png`.

### Remove item

- **Confirmation page**, `/items/{id}/remove`: "Remove milk?", then "Milk leaves your fridge list and stops showing as low. Fridgie keeps what you bought and used, for your spending.", then "Add "Milk" again later and it starts with no history."
- **Buttons:** **Remove milk** (filled, out colour) and **Keep it**.
- **Writes:** the item is marked removed, and events are kept (ADR 0006: no event is deleted). How "removed" is stored, for example a nullable `removed_at` on the item, is the engineer's schema ADR (#7). The behaviour it must give: the item leaves every list and every tool result, its events still count for spending, and a new item with the same name is a new item.
- **After:** the inventory, with the banner "Removed milk."
- **Why a confirmation and not an undo:** see section 2.
- Picture: `6-10-remove-*.png`.

### Save failed

- **When:** any form post (Add item, Bought, Set quantity, low-at, Threw some away, Remove) that the server could not complete, such as a D1 error or the daily row limit (ADR 0004/0006).
- **Shows:** the same form, re-rendered with every value kept, and an error panel at the top with `role="alert"`: **"That didn't save."** "Nothing was recorded. Your entries are still here, so try again. If the first try did get through, trying again won't count it twice." The primary button becomes **Try again**.
- **Idempotency:** the re-rendered form carries the **same `client_ref`** as the failed post, so a retry after a post that did land writes nothing new (ADR 0006).
- **One-tap actions (Used, Out) that fail:** the inventory renders with that error panel above the sentence: "That didn't save. Nothing was recorded for {name}. Try again." The row is unchanged.
- **Field errors are a separate, quieter state, and the mock does not draw them:** the field's ring turns the out colour, a hint under it says what to type, and there is no panel.
- Picture: `6-11-save-failed-*.png`.

### Consent

- **When:** an assistant starts OAuth and the owner is signed in, or has just signed in (ADR 0002 (c) 1).
- **Shows:**
  - "Connect {client name} to your Fridgie?"
  - The **redirect host** in monospace ("you'll go back to `claude.ai`"), plus the line "Only allow this if you just asked {client} to connect."
  - A card of what it will be able to do, in two plain lines that map to `mcp:read` and `mcp:write`.
  - "Signed in as @login".
  - **Allow** (accent) and **Deny**.
- **Never trust the client name alone.** It comes from dynamic client registration, so anyone can call themselves "Claude". The host is drawn in a distinct monospace chip, because it is the one thing on the page an attacker cannot choose freely.
- **Deny** redirects back with `access_denied` per OAuth.
- Picture: `6-12-consent-*.png`.

### Connected assistants (one listed)

- `/assistants`, from the top bar's "Assistants" link.
- **Shows:** one card per grant with the client name, "Returns to {host} · connected {date}", and a **Disconnect** button (outlined in the out colour).
- **Footnote:** "Removing Fridgie inside Claude doesn't disconnect it here. This page is the one that does." (ADR 0002 (b)).
- **Disconnect:** one tap, no confirmation (reconnecting is just consent again). It calls `revokeGrant` and returns with the banner "{Name} is disconnected."
- Picture: `6-13-assistants-*.png`.

### Connected assistants (none)

- **Shows:** "No assistants connected", and three numbered steps for connecting Claude: Settings › Connectors › Add custom connector, paste `https://<host>/mcp` (the real host, rendered by the server), and "Claude sends you back here to allow it". The URL wraps anywhere rather than overflowing.
- The picture shows it straight after a disconnect, with the banner.
- Picture: `6-14-assistants-none-*.png`.

### Direction B: shelf (comparison only)

- This is not a state of the product. It is drawn so section 4's choice can be seen.
- Picture: `6-15-direction-b-*.png`.

## 8. Components

Each is specified once. The build names them as written.

- **TopBar.** *Purpose:* the way back to the inventory and the way to Add item. *Inputs:* the current page. *States:* inventory pages show "Assistants" and "+ Add item", and Assistants pages show "Inventory" and "Sign out". *Never:* holds more than two items beside the wordmark at 375 px.
- **Summary.** *Purpose:* answers "what's low?" in a sentence. *Inputs:* low and out items in inventory order. *States:* low and out, only low, only out, nothing low ("Nothing's low."), and empty ("Nothing here yet."). *Never:* shows a count of items instead of their names, or uses colour as the only cue: the words say "low" and "out".
- **PlaceGroup.** *Purpose:* one place's items. *Inputs:* `place` and its items. *States:* populated and empty. *Never:* hides when empty.
- **ItemRow.** *Purpose:* one item's state and its everyday actions. *Inputs:* the item's name, quantity, unit, state, reason and reason text. *States:* the five in the table under Populated inventory, plus "just changed" (flash tint). *Never:* truncates the name, shows a 0 for an untracked item, draws an undo, or puts Used/Out on an out item.
- **StateMarker.** *Purpose:* the shape half of a state. *Inputs:* `state`. *States:* out (solid disc), low (ring with a lower fill), untracked (dashed ring), ok (empty space). *Never:* appears without the state word next to it, or changes shape between low reasons.
- **Quantity.** *Purpose:* the number and what it counts. *Inputs:* quantity, unit, state, reason. *States:* normal, zero (out colour), stale (low `cycle`: muted, "on record"), and none (untracked: "–", "not counted"). *Never:* rounds a fractional quantity away (it shows up to 2 decimals and drops trailing zeros).
- **RowActions.** *Purpose:* Bought, Used, Out (or Bought and Set quantity). *Inputs:* item id, state, and a fresh `client_ref` per button form. *Never:* needs JavaScript. Each button is its own `<form method="post">`.
- **Flash.** *Purpose:* confirms the last action and offers the correction path. *Inputs:* a message and one link. *Never:* offers "Undo" for a purchase or a use.
- **ErrorPanel.** *Purpose:* a save that failed. *Never:* clears the form, or says something saved when it is unsure (it says "trying again won't count it twice" instead).
- **ItemPage cards:** QuantityStepper, LowAtField, DiscardForm, History, as described in Change quantity.
- **ConsentCard** and **AssistantCard**, as described in their states.

**JavaScript the build needs: none.** Every interaction is a link or a form post with a redirect (POST, then 303, then GET). Two details make that feel instant:
- Every redirect after a row action targets `#item-{id}`, so the page comes back scrolled to the row.
- The stepper's − and + are `<button name="delta" value="-1">` posts, so it works without script. An optional enhancement that changes the number in place before posting may be added later, and nothing here depends on it.

## 9. Tokens, contrast, motion, focus

**Type.** The system stack only (`-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, ...`). A web font would be a new outbound host.

| Use | Narrow | Wide |
| - | - | - |
| Summary sentence | 25 px / 1.15 / 700 / −0.025 em | 52 px / 1.15 / 700 / −0.035 em |
| Sign-in headline | 46 px / 780 / −0.04 em | 64 px |
| Page title (forms, item page) | 32 px / 750 / −0.03 em | 40 px |
| Item name | 17 px / 600 | 17 px / 600 |
| Quantity number | 24 px / 650, tabular numerals | same |
| Body, inputs | 16–17 px | same |
| Reason, captions, hints | 12–13.5 px | same |
| Group label | 13 px / 700, uppercase, +0.09 em | same |

**Spacing.** 16 px side gutter narrow and 32 px wide. Rows have 11 px vertical padding and 8 px between the name block and the actions. Groups are 18 px apart narrow and 28 px wide.

**Targets.** Row action buttons are 36 px high and at least 64 px wide, with 8 px gaps. That clears WCAG 2.5.8's 24 px minimum with spacing to spare. The 36 px height is the one place the design trades target size for fitting a whole inventory on a phone screen. Every other control is 40 px or more, and the primary form buttons and the stepper are 52–56 px.

**Colour tokens.**

| Token | Light | Dark | Used for |
| - | - | - | - |
| `ground` | `#F5F2EA` | `#15140F` | page background |
| `surface` | `#FCFAF5` | `#1F1D17` | groups, cards, inputs |
| `chip` | `#EAE5D8` | `#2C2921` | secondary buttons, segmented control |
| `ink` | `#1E1C17` | `#EFEBE1` | text |
| `muted` | `#5F5A4E` | `#A9A394` | reasons, captions, stale quantity |
| `accent` | `#1E5B47` | `#86CDB3` | Add item, primary buttons, focus ring |
| `on-accent` | `#FFFFFF` | `#10241D` | text on accent |
| `low` | `#94560A` | `#E6A54E` | low marker, word, summary clause |
| `out` | `#B42318` | `#FF8C7F` | out marker, word, 0, summary clause, Remove, Disconnect |
| `untracked` | `#6B665A` | `#9C9686` | untracked marker and word |
| `flash` | `#E3EEE8` | `#1E3229` | banner and just-changed row |
| `error-bg` / `error-ink` | `#FBE9E6` / `#8A1C12` | `#3A1A16` / `#FFB4A9` | ErrorPanel |
| `gh` / `on-gh` | `#1E1C17` / `#FFFFFF` | `#EFEBE1` / `#15140F` | Sign in with GitHub |

**The accent is counted.** The populated inventory uses it once (+ Add item). Forms use it once (the primary button) plus the focus ring. Consent uses it once (Allow). If a build adds a second accent element to a page, one of them is decoration.

**Contrast.** Every ratio below was printed by `./scripts/contrast <fg> <bg>`, and the value column is its output, unedited. Required: 4.5 for body text, 3 for large text and for markers and the focus ring.

Light:

| Pair | fg | bg | `./scripts/contrast` | Needs |
| - | - | - | - | - |
| Body text on ground | `#1E1C17` | `#F5F2EA` | 15.22 | 4.5 |
| Body text on surface (rows, cards, inputs) | `#1E1C17` | `#FCFAF5` | 16.32 | 4.5 |
| Button text on chip (Bought, Used, Out) | `#1E1C17` | `#EAE5D8` | 13.53 | 4.5 |
| Muted text on ground | `#5F5A4E` | `#F5F2EA` | 6.14 | 4.5 |
| Muted text on surface (reasons, units, hints) | `#5F5A4E` | `#FCFAF5` | 6.58 | 4.5 |
| Muted text on chip (unselected Fridge/Pantry) | `#5F5A4E` | `#EAE5D8` | 5.46 | 4.5 |
| Muted text on flash tint (unit on a just-changed row) | `#5F5A4E` | `#E3EEE8` | 5.77 | 4.5 |
| Text on accent (Add item, Save, Allow) | `#FFFFFF` | `#1E5B47` | 7.95 | 4.5 |
| Focus ring (accent) on ground | `#1E5B47` | `#F5F2EA` | 7.10 | 3 |
| Focus ring (accent) on surface | `#1E5B47` | `#FCFAF5` | 7.62 | 3 |
| Low marker and word on surface | `#94560A` | `#FCFAF5` | 5.60 | 3 (marker), 4.5 (word) |
| Low summary sentence on ground (large) | `#94560A` | `#F5F2EA` | 5.22 | 3 |
| Out marker, word and 0 on surface | `#B42318` | `#FCFAF5` | 6.30 | 3 (marker), 4.5 (word) |
| Out summary sentence on ground (large) | `#B42318` | `#F5F2EA` | 5.88 | 3 |
| Out marker on the just-changed row tint | `#B42318` | `#E3EEE8` | 5.53 | 3 |
| Untracked marker and word on surface | `#6B665A` | `#FCFAF5` | 5.48 | 3 (marker), 4.5 (word) |
| Body text on flash banner / row tint | `#1E1C17` | `#E3EEE8` | 14.32 | 4.5 |
| Error text on error panel | `#8A1C12` | `#FBE9E6` | 7.94 | 4.5 |
| Text on GitHub button | `#FFFFFF` | `#1E1C17` | 17.02 | 4.5 |
| Text on Remove button (surface on out) | `#FCFAF5` | `#B42318` | 6.30 | 4.5 |

Dark:

| Pair | fg | bg | `./scripts/contrast` | Needs |
| - | - | - | - | - |
| Body text on ground | `#EFEBE1` | `#15140F` | 15.49 | 4.5 |
| Body text on surface (rows, cards, inputs) | `#EFEBE1` | `#1F1D17` | 14.15 | 4.5 |
| Button text on chip (Bought, Used, Out) | `#EFEBE1` | `#2C2921` | 12.20 | 4.5 |
| Muted text on ground | `#A9A394` | `#15140F` | 7.34 | 4.5 |
| Muted text on surface (reasons, units, hints) | `#A9A394` | `#1F1D17` | 6.70 | 4.5 |
| Muted text on chip (unselected Fridge/Pantry) | `#A9A394` | `#2C2921` | 5.78 | 4.5 |
| Muted text on flash tint (unit on a just-changed row) | `#A9A394` | `#1E3229` | 5.41 | 4.5 |
| Text on accent (Add item, Save, Allow) | `#10241D` | `#86CDB3` | 8.82 | 4.5 |
| Focus ring (accent) on ground | `#86CDB3` | `#15140F` | 10.01 | 3 |
| Focus ring (accent) on surface | `#86CDB3` | `#1F1D17` | 9.14 | 3 |
| Low marker and word on surface | `#E6A54E` | `#1F1D17` | 7.91 | 3 (marker), 4.5 (word) |
| Low summary sentence on ground (large) | `#E6A54E` | `#15140F` | 8.65 | 3 |
| Out marker, word and 0 on surface | `#FF8C7F` | `#1F1D17` | 7.47 | 3 (marker), 4.5 (word) |
| Out summary sentence on ground (large) | `#FF8C7F` | `#15140F` | 8.17 | 3 |
| Out marker on the just-changed row tint | `#FF8C7F` | `#1E3229` | 6.03 | 3 |
| Untracked marker and word on surface | `#9C9686` | `#1F1D17` | 5.71 | 3 (marker), 4.5 (word) |
| Body text on flash banner / row tint | `#EFEBE1` | `#1E3229` | 11.43 | 4.5 |
| Error text on error panel | `#FFB4A9` | `#3A1A16` | 9.22 | 4.5 |
| Text on GitHub button | `#15140F` | `#EFEBE1` | 15.49 | 4.5 |
| Text on Remove button (surface on out) | `#1F1D17` | `#FF8C7F` | 7.47 | 4.5 |

Low against out, as noted under Populated inventory: `./scripts/contrast "#94560A" "#B42318"` gives 1.13 and `./scripts/contrast "#E6A54E" "#FF8C7F"` gives 1.06. These two colours are deliberately **not** relied on to tell the states apart.

**Theme.** Follow `prefers-color-scheme`. There is no in-app toggle in the first build. Both themes are specified above and contrast-checked. The dark picture is `6-16-inventory-dark-*.png`.

**Motion.** Two movements, both confirming that something was saved:
- The **Flash** banner enters with `translateY(-6px)` and opacity 0 → 1, over 180 ms, `cubic-bezier(.2,.7,.3,1)`.
- The **just-changed row** tint fades to the surface over 1200 ms `ease-out`, after a 400 ms hold.
- Under `prefers-reduced-motion: reduce` neither animates: the banner appears in place, and the row keeps its tint until the next page load.

The mock draws the still frame just after a save, not the motion.

**Focus.** Everything focusable gets a 2 px `accent` outline with a 2 px offset, through `:focus-visible`. The segmented control shows it on the whole group via `:focus-within`. It is drawn in the mock on Add item's Name field, on the tapped Used button, and on the stepper.

**Screen readers.**
- Each marker is `aria-hidden`, because the state word beside it is the accessible text.
- The quantity reads as "4 on record", "2 eggs" or "not counted".
- The Flash has `role="status"` and the ErrorPanel `role="alert"`.
- Every row button's accessible name includes the item: "Bought eggs", "Used eggs", "Out: eggs", via visually hidden text.

## 10. The assistant's tools

**Shape.** Ten tools: three read, seven write. Names are `verb_noun` in snake_case and use only the section 5 terms. Every tool returns structured content (JSON) plus a short text rendering for the model.

### Shared types

```
Item = {
  item_id: string,              // opaque, e.g. "itm_7f3a..."
  name: string,
  place: "fridge" | "pantry",
  quantity: number | null,      // null when untracked
  unit: string | null,
  state: "untracked" | "ok" | "low" | "out",
  reason: "count" | "cycle" | null,   // set only when state is "low"
  reason_text: string | null,         // the exact text the web row shows, e.g. "due, usually every 7 days"
  low_at: number | null,
  last_purchase: { quantity: number, price: number | null, currency: string | null, occurred_at: string } | null
}

ItemRef = { item_id: string } | { name: string }   // exactly one of the two
```

- **Prices** go in and out as decimals in major units (`4.29`). Fridgie stores `price_cents` (ADR 0006) by rounding to the nearest cent. `currency` is an ISO 4217 code and **defaults to `"USD"`** when a price is given without one. A currency without a price is ignored.
- **Times** (`occurred_at`) are ISO 8601. A date with no time means noon UTC on that date. It must not be in the future by more than 1 day. When omitted, it means now.

### Name matching (one rule for every tool and the web form)

1. **Normalise:** lowercase, trim, collapse internal spaces, and drop one trailing "s" from the last word ("eggs" becomes "egg").
2. **Exact match:** the normalised name equals a normalised item name.
3. **Close match:** one normalised name contains the other as whole words ("milk" and "oat milk").
4. **When a write tool is given a `name`:** it acts only when there is **exactly one exact match** among items not removed. Otherwise it writes nothing for that item and returns:
   - `{ status: "no_match", name, close: Item[] }` when nothing matches exactly. `close` may be empty.
   - `{ status: "ambiguous", name, candidates: Item[] }` when two or more items match exactly. This cannot happen inside one place, because Add item refuses clashes, but it can happen across fridge and pantry ("Butter" in both).
5. **Close matches never act on their own.** They come back to the model so it can ask the owner or use `item_id`.

### Idempotency (`client_ref`)

Every write tool that writes an **event** takes a **required** `client_ref: string` (8–64 characters).
- The description tells the model to make a fresh random value for each new request, and to send the **same** value only when retrying the same request.
- `record_purchases` turns it into one key per line: `{client_ref}#{line index}`.
- A repeat of a known key writes nothing and returns the original result with `status: "already_recorded"`.
- Keys are unique per user (ADR 0006), and the web forms supply theirs as a hidden field generated when the form is rendered.

`add_item`, `update_item` and `remove_item` also take `client_ref`:
- `add_item`, so a retried add with a quantity cannot buy twice.
- The other two for uniformity. A repeat of either is a no-op anyway.

### The tool table

| Tool | Inputs | Returns | `readOnlyHint` | `destructiveHint` | Scope |
| - | - | - | - | - | - |
| `list_inventory` | `place?: "fridge" \| "pantry"` | `{ items: Item[] }`, grouped and ordered as on the web page | `true` | `false` | `mcp:read` |
| `list_low_and_out` | `place?: "fridge" \| "pantry"` | `{ summary: string, low: Item[], out: Item[] }`. `summary` is the web page's sentence | `true` | `false` | `mcp:read` |
| `find_items` | `names: string[]` (1–50) | `{ results: [{ name, status: "found" \| "no_match" \| "ambiguous", item?: Item, candidates?: Item[], close?: Item[] }] }`, one result per input name, in order | `true` | `false` | `mcp:read` |
| `add_item` | `name: string`, `place: "fridge" \| "pantry"`, `quantity?: number > 0`, `unit?: string`, `price?: number ≥ 0`, `currency?: string`, `occurred_at?: string`, `low_at?: number ≥ 0`, `client_ref: string` | `{ status: "added", item: Item }`, or `{ status: "exists", item: Item }` when the name exactly matches an item in either place (nothing written) | `false` | `false` | `mcp:write` |
| `record_purchases` | `lines: [{ item: ItemRef, quantity: number > 0, price?: number ≥ 0, currency?: string, occurred_at?: string }]` (1–50), `client_ref: string` | `{ results: [{ line: number, status: "recorded" \| "already_recorded" \| "no_match" \| "ambiguous", item?: Item, close?: Item[], candidates?: Item[] }] }` | `false` | `false` | `mcp:write` |
| `record_use` | `item: ItemRef`, `quantity?: number > 0` (default 1), `reason?: "used" \| "discarded"` (default `"used"`), `occurred_at?: string`, `client_ref: string` | `{ status: "recorded" \| "already_recorded" \| "no_match" \| "ambiguous", item?: Item, ... }` | `false` | `false` | `mcp:write` |
| `mark_out` | `item: ItemRef`, `occurred_at?: string`, `client_ref: string` | the same shape as `record_use` | `false` | `false` | `mcp:write` |
| `set_quantity` | `item: ItemRef`, `quantity: number ≥ 0`, `client_ref: string` | the same shape as `record_use` | `false` | `false` | `mcp:write` |
| `update_item` | `item_id: string`, `name?: string`, `place?: "fridge" \| "pantry"`, `unit?: string \| null`, `low_at?: number \| null`, `client_ref: string` | `{ status: "updated", item: Item }` or `{ status: "exists", item }` on a rename clash | `false` | `false` | `mcp:write` |
| `remove_item` | `item_id: string`, `client_ref: string` | `{ status: "removed", item: Item }` (already removed: the same, with no change) | `false` | **`true`** | `mcp:write` |

Notes on the hints:
- Every write declares `idempotentHint: true`, because `client_ref` makes a repeat harmless. Every tool declares `openWorldHint: false`.
- `mark_out` and `set_quantity` are **not** destructive. They append a `count` event, keep all history, and are reversed by another `set_quantity`. Marking them destructive would make Claude ask for confirmation on "I used the last of the milk", which is the most common sentence the owner will say.
- `remove_item` is destructive from the owner's side, because the item leaves every list, so Claude confirms it. It takes **only `item_id`**, never a name, so a removal can never land on a guessed match.

### Descriptions (the text the model reads)

Each opens with what the owner says, and names its nearest neighbour.

- **`list_inventory`**: "Everything in the owner's fridge and pantry, with each item's quantity and state (untracked, ok, low, out). Use for 'what's in the fridge?', 'do we have rice?', 'how many eggs are left?'. For only what needs buying, use list_low_and_out."
- **`list_low_and_out`**: "What's running low or out, with why: each low item has reason 'count' (down to its warn level) or 'cycle' (due, by how often it's usually bought). Use for 'what's running low?', 'what do I need to buy?', 'what are we out of?'. Return the summary sentence to the owner as written."
- **`find_items`**: "Look up several items by name in one call, before recording a receipt or a list of purchases. Returns, per name: found (one exact match), ambiguous (several), or no_match (with close matches). Use the item_id from here in record_purchases. Does not change anything."
- **`add_item`**: "Add a new item to the fridge or pantry. If a quantity is given, it is also recorded as bought (with the price, if any). Use only for something the owner doesn't track yet: for an existing item, use record_purchases. If the owner didn't say fridge or pantry, ask."
- **`record_purchases`**: "Record that the owner bought one or more existing items, in one call: 'I bought milk, a dozen eggs for $4.29 and two yogurts', or every line of a receipt. Each line has an item (item_id from find_items, or an exact name), a quantity, and optionally the price paid for that line (the total, not the unit price), the currency (default USD) and occurred_at (use the receipt's date). A price belongs only to the line it was said with. If the owner gave no quantity, use the item's last_purchase quantity from find_items, or 1. Lines that match no item or several items are not recorded and come back with no_match or ambiguous: ask the owner about those, then add them with add_item or record them again with an item_id. Not for new items: use add_item."
- **`record_use`**: "Record that the owner used some of an item: 'I used two eggs', 'had a yogurt'. Default quantity is 1. Set reason to 'discarded' when it was thrown away rather than eaten ('the milk went off'). Not for 'used the last of', 'finished' or 'ran out of': that's mark_out."
- **`mark_out`**: "Record that an item is all gone: 'I used the last of the milk', 'we're out of coffee', 'finished the eggs'. Sets the quantity to 0, whatever it was before, so the item shows as out. Not for using some of it: that's record_use."
- **`set_quantity`**: "Set how many of an item there are now, after the owner has counted: 'there are actually 3 yogurts', 'we have 2 bags of rice'. For 0, prefer mark_out."
- **`update_item`**: "Rename an item, move it between fridge and pantry, change its unit, or set the number at which it should warn as low (low_at; null goes back to the default). Writes no purchase or use."
- **`remove_item`**: "Stop tracking an item: it leaves the fridge or pantry list. What was bought and used stays in the history. Needs the item_id, so confirm which item with the owner first. Not for 'we're out of it': that's mark_out."

### The three phrases, walked through

| Phrase | Lands on | Why not its neighbour | What is written |
| - | - | - | - |
| "what's running low?" | `list_low_and_out` | `list_inventory` sends low-only questions to `list_low_and_out` by name | Nothing. It returns `summary` ("Milk and eggs are low. Coffee beans are out."), the same sentence as the web page |
| "I used the last of the milk" | `mark_out` | `record_use`'s description excludes "used the last of" by name | One **`count` event with quantity 0** for milk. Afterwards milk's `on_hand_after` is 0, so ADR 0006 rule 1 makes it **out**, **even though its stored count was 4** before (ADR 0006 example 2). A use of 1 would have left 3, and milk would wrongly stay low (cycle) |
| "I bought milk, a dozen eggs for $4.29 and two yogurts" | `record_purchases` (one call, after one `find_items(["milk", "eggs", "yogurt"])`) | `add_item` is for items not yet tracked. `record_use` and `mark_out` are uses | Three `purchase` events: milk × its last_purchase quantity (1) with no price; eggs × 12 at 4.29 USD; yogurt × 2 with no price. Keys `{client_ref}#0..#2` |

**Receipt lines that match no item** come back as `no_match` with any `close` items. Nothing is written for them. The model asks, for example "I couldn't match 'GV HNY CRSP 12OZ'. Is that a new item, or one of these?", and then calls `add_item` (with the quantity and price, which records the purchase) or `record_purchases` again with the right `item_id` and a new `client_ref`. **Ambiguous lines** behave the same way, with `candidates`.

### What "consistent with the UI" means here, checkably

- Every tool name and field in the table uses a term from section 5.
- `state`, `reason` and `reason_text` carry the same values and strings that the web row shows.
- `list_low_and_out.summary` is the same string as the web Summary.

## 11. Critique of the rendered mock

The pictures in `6-shots/` were opened and read, narrow first. What I found and changed:

1. **The first narrow render was not 375 px wide.** The full Chromium in `/opt/pw-browsers` lays out headless pages at a minimum of 500 px and then crops to 375. The first narrow picture showed rows running off the right edge, with the quantities and "+ Add item" cut away. A test page printing `innerWidth` confirmed it: `500 x 725` from `chromium`, against `375 x 812` from Chromium's `headless_shell`. All committed pictures are made with `headless_shell` (section 13). This is a fault in how this image renders mocks, not in the mock. It is reported in the pull request as a separate issue, because changing the script is outside #6.
2. **Reason lines wrapped and pushed the last row off the narrow picture.** I shortened "due - you buy it about every 7 days" to "due, usually every 7 days", and "not bought or counted yet" to "no history yet".
3. **The Out state's banner was invisible.** The entry animation was caught at opacity 0. I removed the motion from the mock, and section 9 specifies it instead. The banner copy "Milk is out. Wasn't it?" read as a question to the owner, so it became "Milk marked out."
4. **The failed save mixed two failures** (a storage error and a bad price) under one message. It now shows only the storage failure, and field errors are specified separately as a quieter state.
5. **On Signed out, the button touched its caption**, because a more specific rule overrode the margin. Fixed.
6. **On Connected assistants (none), the connector URL overflowed the card.** It now wraps anywhere.
7. **Where the eye lands:** on the summary sentence, in both widths. That is intended. **Covering the accent:** the inventory still reads, because the accent is only "+ Add item". **Blurring:** the two-part shape (sentence, then two blocks) survives.
8. **What I would remove:** the "N items" count beside each group label. It stayed because on the empty inventory, "0 items" is what says the group is empty before the panel is read.

## 12. Decisions for the owner

One question was raised on #6 with the `agent-factory:needs-input` marker: **direction A (Ledger) or B (Shelf)?** I recommend A and wrote everything under it. If the answer is B, sections 6–8 change, Bought becomes three taps, and that conflicts with ADR 0005.

Decisions I made inside this issue's remit, listed so they can be overruled:
- "I used the last of" writes `count 0` (Out), not a `use` of the whole count.
- Removing an item is a confirmation page, and history is kept.
- The web app's currency is USD only.
- `low_at` is exposed on the item page and in `add_item` / `update_item`.
- `discarded` is offered on the item page ("Threw some away") and in `record_use`.
- There is no in-app theme toggle.

## 13. How the pictures were made

`./scripts/design-render docs/design/6-inventory-and-tools.html docs/design/6-shots` writes `6-inventory-and-tools-{wide,narrow}.png`, which is the populated inventory (the mock's default state).

For one picture per state, the same script was run on copies of the mock that differ only in `<html data-state="...">` (and `data-theme="dark"` for picture 16). The browser on `PATH` was Chromium's `headless_shell`, for the reason in section 11:

```sh
mkdir -p "$HOME/bin" && ln -sf /opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell "$HOME/bin/chromium"
export PATH="$HOME/bin:$PATH"
mock=docs/design/6-inventory-and-tools.html; out=$(pwd)/docs/design/6-shots; tmp=/tmp/6-states; mkdir -p "$tmp"
./scripts/design-render "$mock" "$out"
n=1
for s in signed-out not-invited empty inventory add-item bought used out change-quantity remove save-failed consent assistants assistants-none direction-b; do
  f="$tmp/6-$(printf %02d $n)-$s.html"
  sed "s/data-state=\"inventory\" data-theme=\"light\"/data-state=\"$s\" data-theme=\"light\"/" "$mock" > "$f"
  ./scripts/design-render "$f" "$out"; n=$((n+1))
done
sed 's/data-theme="light"/data-theme="dark"/' "$mock" > "$tmp/6-16-inventory-dark.html"
./scripts/design-render "$tmp/6-16-inventory-dark.html" "$out"
```

Two traps, both hit in this run:
- The out-dir must be **absolute**. With a relative one, the browser writes nowhere and the script exits non-zero.
- `TMPDIR` must stay short. Under a long `TMPDIR`, Chromium cannot create its sockets and also writes nothing.
