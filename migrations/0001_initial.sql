-- Fridgie's first schema. ADR 0007 explains every table; ADR 0006 fixes the
-- event fields and the two event indexes.

-- One row per allowed GitHub account that has signed in (ADR 0002).
-- id is the only user key any other table references.
CREATE TABLE users (
  id TEXT PRIMARY KEY,                       -- UUID
  github_id INTEGER NOT NULL UNIQUE,         -- GitHub's numeric user ID, never the login
  github_login TEXT NOT NULL,                -- for display only
  created_at TEXT NOT NULL
);

-- Web sign-in sessions. id is the SHA-256 of the cookie's random token, so a
-- copy of this table does not hold a usable cookie.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- One row per item. A removed item keeps its row and its events; removed_at
-- takes it out of every list.
CREATE TABLE items (
  id TEXT PRIMARY KEY,                       -- opaque, "itm_" + hex
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  name_key TEXT NOT NULL,                    -- the name normalised by the name-matching rule
  place TEXT NOT NULL CHECK (place IN ('fridge', 'pantry')),
  unit TEXT,
  low_at REAL CHECK (low_at IS NULL OR low_at >= 0),
  created_at TEXT NOT NULL,
  created_client_ref TEXT,                   -- the add's idempotency key
  removed_at TEXT
);
CREATE INDEX items_user_live ON items (user_id, removed_at);
-- One name per item across fridge and pantry together (#3 D6), among items not removed.
CREATE UNIQUE INDEX items_user_name_live ON items (user_id, name_key) WHERE removed_at IS NULL;
CREATE UNIQUE INDEX items_user_client_ref ON items (user_id, created_client_ref);

-- Append-only item events (ADR 0006 "Events").
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,      -- record order
  user_id TEXT NOT NULL REFERENCES users(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  type TEXT NOT NULL CHECK (type IN ('purchase', 'use', 'count')),
  quantity REAL NOT NULL CHECK (quantity >= 0),
  on_hand_after REAL NOT NULL CHECK (on_hand_after >= 0),
  occurred_at TEXT NOT NULL,                 -- ISO 8601 UTC
  recorded_at TEXT NOT NULL,                 -- ISO 8601 UTC
  source TEXT NOT NULL CHECK (source IN ('web', 'mcp')),
  client_ref TEXT,
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  currency TEXT,
  reason TEXT,
  CHECK (type = 'purchase' OR (price_cents IS NULL AND currency IS NULL)),
  CHECK (price_cents IS NULL OR currency IS NOT NULL),
  CHECK ((type = 'use') = (reason IS NOT NULL)),
  CHECK (reason IS NULL OR reason IN ('used', 'discarded')),
  CHECK (type = 'count' OR quantity > 0)
);
-- ADR 0006's two indexes: the latest event, and the newest purchases.
CREATE INDEX events_item_record ON events (user_id, item_id, id);
CREATE INDEX events_item_type_when ON events (user_id, item_id, type, occurred_at);
-- client_ref is unique per user. SQLite treats NULLs as distinct, so events
-- without one never clash.
CREATE UNIQUE INDEX events_user_client_ref ON events (user_id, client_ref);

-- The app never changes an event once written. These make the database refuse it too.
CREATE TRIGGER events_no_update BEFORE UPDATE ON events
BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
CREATE TRIGGER events_no_delete BEFORE DELETE ON events
BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
