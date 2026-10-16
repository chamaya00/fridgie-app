# ADR 0006: Low and out: a count-or-purchase-cycle rule over append-only item events

Date: 2026-10-16
Status: proposed

Research: [docs/research/5-item-entry-and-low-rule.md](../research/5-item-entry-and-low-rule.md), section 2.

## Context

The owner left the definition of "low" to research, with one hard condition: **running low must not depend on the owner keeping perfect counts** (#1, #3). The history must also be kept. Usage and purchase events are stored, purchases can carry a price, and a later spending objective reads them.

Counts drift in a known direction. Purchases get recorded, because every entry method in ADR 0005 produces one. Uses get skipped. A rule that reads only the count (Grocy's `min_stock_amount`) goes quiet exactly when the owner stops logging. A rule that reads only the purchase cycle cannot see a new item or an explicit "we're out".

Storage is D1 on Workers Free (ADRs 0003, 0004). That allows 5,000,000 rows read (rows scanned, not returned) and 100,000 rows written a day, and fails until 00:00 UTC past either. The table definitions are the engineer's schema ADR in #7. This ADR fixes the events and the fields they carry, and the rule that reads them.

## Decision

Low and out are **computed when read, from stored events**. No status is stored. An item is **out**, **low** or **ok**. When low, it also carries the reason: `count` or `cycle`.

### Inputs, for one item at time `now`

| Name | What it is | Rows read |
| - | - | - |
| `q` | `on_hand_after` of the item's **latest event in record order** (highest `id`) | 1 |
| `P` | the item's **4 most recent purchase events** by `occurred_at`, newest first | up to 4 |
| `low_at` | the item's own low threshold, if the owner set one (a field on the item, nullable) | on the item row |

**At most 5 event rows per item**, given indexes on (`user_id`, `item_id`, `id`) and (`user_id`, `item_id`, `type`, `occurred_at`). **[inference]** from D1's statement that an index bounds rows scanned. The build confirms it with `meta.rows_read`.

### Derived values

- `L` (low threshold): `low_at` if set. Otherwise `floor(Q / 4)`, where `Q` is the quantity of the newest purchase in `P`. With no purchase, `L = 0`.
- Gaps: the time between consecutive purchases in `P`, in days (elapsed time ÷ 86,400 s, not calendar days). **Gaps shorter than 1 day are discarded**, so two purchases on one shop do not collapse the cycle to zero.
- `C` (purchase cycle): the **median** of the remaining gaps. With an even count it is the mean of the middle two. `C` is undefined when no gap remains, which means fewer than two purchases at least a day apart.
- `a` (age): days from the newest purchase's `occurred_at` to `now`.
- `LOW_FRACTION = 0.8`.

### The rule, checked in order

1. **Out** if `q ≤ 0`.
2. **Low (count)** if `q ≤ L`.
3. **Low (cycle)** if `C` is defined and `a ≥ LOW_FRACTION × C`.
4. Otherwise **ok**.

The cycle signal never makes an item **out**. Out is always something the owner said (an `Out` tap, a count) or that logged uses added up to. Overdue means "you usually have bought this by now", and that is low.

### No history yet

- **An item with no events** is **ok**, and the app shows it as untracked.
- **An item with one purchase** has no `C`. It is classified by count alone until a second purchase, at least a day later, gives it a cycle.

### Worked examples

`dN` means N days after the item's first event, at the same time of day. Each event is shown as `type quantity → on_hand_after`.

**1. Steady rate: eggs.** `d0 purchase 12 → 12`, `d4 use 6 → 6`, `d10 use 6 → 0`, `d14 purchase 12 → 12`, `d18 use 6 → 6`, `d24 use 6 → 0`, `d28 purchase 12 → 12`, `d31 use 4 → 8`, `d35 use 4 → 4`.
P = d28, d14, d0, with gaps 14 and 14, so C = 14 and 0.8C = 11.2. L = floor(12/4) = 3.

| now | Events since | q | a | Result |
| - | - | - | - | - |
| d36 | none | 4 | 8 | **ok** (4 > 3, 8 < 11.2) |
| d40 | none | 4 | 12 | **low (cycle)** (12 ≥ 11.2) |
| d41 | `use 1 → 3` | 3 | 13 | **low (count)** (3 ≤ 3) |
| d42 | `use 3 → 0` | 0 | 14 | **out** |

**2. Count never corrected after it ran out: milk, 1 carton each time.** `d0 purchase 1 → 1`, `d7 purchase 1 → 2`, `d14 purchase 1 → 3`, `d21 purchase 1 → 4`. No uses are ever logged. The last carton was finished around d27.
P = d21, d14, d7, d0, with gaps 7, 7 and 7, so C = 7 and 0.8C = 5.6. L = floor(1/4) = 0. q stays 4, which is wrong.

| now | q | a | Result |
| - | - | - | - |
| d26 | 4 | 5 | **ok** (5 < 5.6) |
| d27 | 4 | 6 | **low (cycle)** (6 ≥ 5.6) |
| d30 | 4 | 9 | **low (cycle)** |

A count-only rule would show "4 cartons, ok" forever. This is the case the owner's condition is about.

**3. Newly added item: yogurt.** `d0 purchase 6 → 6`. One purchase, so C is undefined. L = floor(6/4) = 1.

| now | Events since | q | Result |
| - | - | - | - |
| d0 | none | 6 | **ok** (count only, no cycle yet) |
| d2 | `use 5 → 1` | 1 | **low (count)** (1 ≤ 1) |
| d3 | `use 1 → 0` | 0 | **out** |

An item with no events at all is **ok**, shown as untracked.

**4. Owner taps Out early, then rebuys: butter.** `d0 purchase 1 → 1`, `d20 purchase 1 → 2`, `d40 purchase 1 → 3`. Uses are not logged. Then `d45 count 0 → 0` (the **Out** button), then `d46 purchase 1 → 1`.

| now | q | P (newest first) and gaps | C | a | Result |
| - | - | - | - | - | - |
| d45, before Out | 3 | d40, d20, d0: 20, 20 | 20 | 5 | **ok** (5 < 16) |
| d45, after Out | 0 | same | 20 | 5 | **out** (count wins over cycle) |
| d46, after purchase | 1 | d46, d40, d20, d0: 6, 20, 20 | 20 (median) | 0 | **ok** |

The median keeps the one short gap from halving the cycle.

**5. Known false alarm: a bulk buy, cheese.** `d0 purchase 1 → 1`, `d10 purchase 1 → 2`, `d20 purchase 1 → 3`, `d30 purchase 3 → 6`, `d35 use 1 → 5`. P = d30, d20, d10, d0, with gaps 10, 10 and 10, so C = 10 and 0.8C = 8. L = floor(3/4) = 0.
At **d38**: q = 5, a = 8, so the result is **low (cycle)**, even though three were bought. The rule ignores purchase quantity in the cycle, and this example exists so the build's tests pin that behaviour rather than discover it.

## Events

Every event is one row, and the rows are **append-only**. No event is updated or deleted by the app. Every event carries these fields:

| Field | Type | Meaning |
| - | - | - |
| `id` | integer, increasing | Record order. Defines "latest" for `on_hand_after`. |
| `user_id` | references `users.id` | Owner (ADR 0002). Every query filters on it. |
| `item_id` | references the item | The tracked item. |
| `type` | `purchase` \| `use` \| `count` | See below. |
| `quantity` | number ≥ 0, in the item's unit | `purchase` and `use`: the amount, > 0. `count`: the amount the owner says is on hand, ≥ 0. |
| `on_hand_after` | number ≥ 0 | Running estimate after this event. `purchase`: previous + quantity. `use`: max(0, previous − quantity). `count`: quantity. "Previous" is `on_hand_after` of the item's latest event, or 0 if none. |
| `occurred_at` | UTC timestamp | When it happened. The owner or assistant may backdate it, for example to a receipt's date. The cycle uses it. |
| `recorded_at` | UTC timestamp | When Fridgie wrote it. |
| `source` | `web` \| `mcp` | Which client wrote it. Later entry methods add values. |
| `client_ref` | text, nullable, **unique per `user_id`** | Idempotency key from the form or tool call, so a retry writes nothing new. |

Extra fields by type:

- **`purchase`**: `price_cents` (integer, nullable: the total paid for this line, not the unit price) and `currency` (ISO 4217 code, nullable, required when `price_cents` is set). **A purchase carries a quantity and a price.** The unit price is derived (`price_cents / quantity`), never stored.
- **`use`**: `reason`, either `used` or `discarded` (default `used`). Discarded food is spending with no consumption, and the later insights objective will want to tell the two apart.
- **`count`**: no extra fields.

**Directly editing a quantity is recorded as an event.** When the owner sets an item's quantity, a `count` event is written, and the **Out** button writes `count 0`. Correcting a count therefore never deletes or rewrites history: the earlier purchases and uses stay, and the count sets a new baseline for `on_hand_after`. A mistaken purchase is corrected the same way. Undoing one outright (a void event) is out of scope for the first build.

Item creation is not an event. The item row is created, and its first `purchase` or `count`, if any, is an event.

**Write cost.** **[inference]** One event writes one table row plus one row per index that includes its columns (three: the two above and `client_ref`), so about 4 rows written. 100,000 a day is about 25,000 events.

**Read cost.** **[inference]** Classifying a 200-item list reads at most 1,000 event rows, so 5,000,000 a day is about 5,000 list views.

### Storage answers (instrumentation skill)

- Events are written server-side to D1, the only store.
- SQLite indexes answer the per-item queries above.
- Rows never change after they are written.
- `client_ref` makes a repeat harmless.
- `occurred_at` (when it happened) is separate from record order (`id`, `recorded_at`).
- New fields are nullable, and absent means not recorded.
- Events are kept forever. D1 Free allows 500 MB per database, which is far beyond one household's events.

## Consequences

- **Easy:** "low" keeps working for an owner who only ever records purchases (example 2). Every number on the screen can be recomputed by hand from at most five rows. The full purchase history with prices is there for the spending objective.
- **Easy to tune:** `LOW_FRACTION`, the window of 4 purchases, and the `Q / 4` default threshold are named constants. Changing one changes no stored data.
- **Hard:** bulk buys raise false "low" alarms (example 5) until quantity is factored into the cycle. An item bought once and never counted again stays "ok" until it is next bought or marked out. An item with drifting counts and only one purchase has no safety net.
- **The build turns each worked example into a test**, including example 5's false alarm, so the known weakness is pinned rather than rediscovered.
- **Rules out:** storing a status column, editing or deleting events in place, and a forecast that relies on logged uses.
- **What this decision rests on, by evidence type:**
  - **[read]**: Grocy's count-against-minimum rule (Grocy source). D1's rows-scanned billing and index guidance.
  - **[excerpt]**: the purchase-cycle prior art (a US patent's median purchase gaps, a vendor's 85% reorder window and its dropping of same-day repeats, and the academic finding that purchase timing and quantity are correlated). The rule's *shape* is checked against these, but the pages were not opened.
  - **[inference]**: that uses are what drift and purchases are what get recorded. That an index bounds the rows read to about 5 per item, which the build should check with `meta.rows_read`. The write-cost estimate.
  - **[assumption]**: the 0.8 fraction and the window of 4 are judgement, not fitted to data. Nobody has measured how early "low" should fire for this owner.

## Alternatives rejected

- **Count against a threshold only (Grocy's model):** goes quiet when uses are not logged, which breaks the owner's one hard condition.
- **Purchase cycle only:** blind to new items and to an explicit "out".
- **Consumption-rate forecast from logged uses:** depends on the events that drift.
- **Survival or hazard model, or ML:** no data to fit for one household, and a reviewer cannot recompute it, which the issue requires.
- **Reading all of an item's events on every classification:** cost grows without bound with history. `on_hand_after` on each event makes the count one row instead.
- **Cycle scaled by purchase quantity now:** fixes example 5, but adds a second median and a division to every test, for a case not yet seen in this owner's data. It is the first change to make if false alarms show up. The events already carry quantity, so it needs no migration.
