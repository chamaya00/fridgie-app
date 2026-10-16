# ADR 0007: The first schema: users, sessions, items and append-only events on D1

Date: 2026-10-16
Status: proposed

Issue: #7. The migration is [`migrations/0001_initial.sql`](../../migrations/0001_initial.sql); read the two side by side.

## Context

ADR 0003 puts the data in D1 (SQLite) with plain SQL migrations, and requires every table holding user data to carry a `user_id` that references `users.id`. ADR 0002 fixes the `users` table: a UUID `id`, and GitHub's numeric `github_id`, unique, never the login. ADR 0006 fixes the event fields, says events are never updated or deleted, makes `client_ref` unique per user, and names two indexes that should keep classifying an item to 5 event rows. The design spec (#6) adds removing an item while keeping its history, a per-item `low_at`, and one name per item across fridge and pantry together (#3 D6). D1 on the free plan bills rows read, including index rows scanned (ADR 0004).

## Decision

Four tables.

| Table | Holds | Key columns |
| - | - | - |
| `users` | One allowed GitHub account | `id` TEXT (UUID) primary key; `github_id` INTEGER NOT NULL UNIQUE; `github_login` for display only |
| `sessions` | Web sign-in sessions | `id` = SHA-256 of the cookie's random token (the token itself is never stored); `user_id` → `users.id`; `expires_at` |
| `items` | One thing the owner tracks | `id` TEXT (`itm_` + 24 hex); `user_id` → `users.id`; `name`; `name_key` (the name-matching rule's normalised name); `place` (`fridge` \| `pantry`); `unit`; `low_at`; `created_client_ref`; `removed_at` |
| `events` | ADR 0006's events, exactly its fields | `id` INTEGER autoincrement (record order); `user_id` → `users.id`; `item_id` → `items.id`; `type`; `quantity`; `on_hand_after`; `occurred_at`; `recorded_at`; `source`; `client_ref`; `price_cents`; `currency`; `reason` |

**Every table holding user data has `user_id` referencing `users.id`**: `sessions`, `items` and `events`. Every query in `src/service/` filters on it, including every write, so an item id from another user matches nothing.

**Indexes.**

- `events_item_record (user_id, item_id, id)`: ADR 0006's index for an item's latest event.
- `events_item_type_when (user_id, item_id, type, occurred_at)`: ADR 0006's index for an item's newest purchases.
- `events_user_client_ref UNIQUE (user_id, client_ref)`: idempotency. SQLite treats NULLs as distinct, so events with no `client_ref` never clash.
- `items_user_name_live UNIQUE (user_id, name_key) WHERE removed_at IS NULL`: one live item per name, in either place. A removed item's name is free again.
- `items_user_client_ref UNIQUE (user_id, created_client_ref)`: a retried Add item returns the item it already made instead of adding a second.
- `items_user_live (user_id, removed_at)` and `sessions_user (user_id)`.

**Append-only, enforced twice.** The service never issues `UPDATE` or `DELETE` on `events`. Two triggers (`events_no_update`, `events_no_delete`) make the database abort either one, so a later bug or a hand-typed query cannot rewrite history either.

**Writing an event is one statement.** `INSERT ... SELECT` computes `on_hand_after` from the latest event in the same statement (`purchase` adds, `use` subtracts and stops at 0, `count` sets). It inserts only when the item is the user's and not removed, and does nothing on a repeated `client_ref` (`ON CONFLICT DO NOTHING`). Two writes cannot read the same previous value.

**Removing an item** sets `removed_at`. The row and its events stay, so spending still counts them. Every list and lookup filters `removed_at IS NULL`.

**Check constraints** hold what ADR 0006 says about a row: `type`, `source` and `reason` from their fixed sets; `quantity` ≥ 0 and > 0 except for `count`; `on_hand_after` ≥ 0; a price only on a purchase, and a `currency` whenever `price_cents` is set; `reason` set exactly on `use`.

**Times** are ISO 8601 UTC text (`2026-10-16T12:00:00.000Z`). That format sorts as text in time order, so the `occurred_at` index orders purchases correctly.

**Measured, not inferred.** ADR 0006 marked the 5-row bound [inference]. With local D1 (Miniflare), `meta.rows_read` for classifying one item with 50 events is **5**. For 12 items with 10 to 21 events each it is **60** event rows (5N) and 12 to 13 item rows. `EXPLAIN QUERY PLAN` shows `SEARCH events USING INDEX events_item_record (user_id=? AND item_id=?)` and `SEARCH events USING INDEX events_item_type_when (user_id=? AND item_id=? AND type=?)`. `test/rows-read.test.ts` holds both. The deployed figure is read after the first deploy.

## Consequences

- **Easy:** every number on the inventory comes from at most 5 event rows per item, plus the item rows, in one D1 round trip (a batch of two statements per item). Household sharing later adds a `households` table and moves `items` under it; `user_id` stays.
- **Easy:** a retry of any form is harmless. A failed save re-renders with the same `client_ref`, so a retry after a write that did land writes nothing new.
- **Hard:** a mistaken event cannot be corrected in place, by design. The correction is a `count` event (Set quantity). A void event, if it is ever wanted, is a new event type and a new ADR.
- **Hard:** the triggers also block a future admin "delete my data" job. That job would drop the triggers in its own migration, which makes it a visible, reviewed decision.
- **Rules out:** a stored status column, editing events, and a user key other than `users.id` anywhere.
- **Write cost:** one event writes the row plus three index entries (ADR 0006 estimated about 4 rows written). The triggers add none.

## Alternatives rejected

- **`deleted` flag or hard delete for removed items.** A hard delete would orphan or delete events, which ADR 0006 forbids. `removed_at` also records when.
- **Name uniqueness per place** (`(user_id, place, name_key)`). It would allow "Butter" in both places, which #3 D6 rejected so that "the last of the butter" is never ambiguous.
- **Integer epoch timestamps.** Equally sortable, but unreadable in the D1 console, where the owner would check a backdated receipt.
- **Session tokens stored as-is.** A leaked database copy would then hold live cookies. Hashing costs one SHA-256 per request.
- **Computing `on_hand_after` in TypeScript, then inserting.** It needs a read and a write, and two concurrent writes could both build on the same previous value.
- **An ORM or query builder.** ADR 0003 chose plain SQL; nothing here needs more.
