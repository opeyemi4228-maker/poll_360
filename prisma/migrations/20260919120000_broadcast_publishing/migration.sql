-- The broadcast desk publishes to the platforms itself.
--
-- Three additions, each written to be safe on any database this product runs
-- against: one where lib/db.js has already created them on a laptop, and a
-- production one where nothing has, because production does not alter its own
-- schema at boot (see AUTO_MIGRATE in lib/db.js).
--
--   broadcast_dispatches   what each platform answered for each post
--   contestants            the candidates' names and portraits on the cards
--   sending_until          a two-minute hold so a post cannot be sent twice

CREATE TABLE IF NOT EXISTS "broadcast_dispatches" (
  "id"          TEXT PRIMARY KEY,
  "item_id"     TEXT NOT NULL REFERENCES "broadcast_items"("id") ON DELETE CASCADE,
  "election_id" TEXT NOT NULL REFERENCES "elections"("id") ON DELETE CASCADE,
  "platform"    TEXT NOT NULL,
  "status"      TEXT NOT NULL,
  "remote_id"   TEXT,
  "remote_url"  TEXT,
  "error"       TEXT,
  "note"        TEXT,
  "by_id"       TEXT REFERENCES "users"("id"),
  "by_name"     TEXT,
  "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "broadcast_dispatches_item"
  ON "broadcast_dispatches" ("election_id", "item_id", "created_at");

CREATE TABLE IF NOT EXISTS "contestants" (
  "id"           TEXT PRIMARY KEY,
  "election_id"  TEXT NOT NULL REFERENCES "elections"("id") ON DELETE CASCADE,
  "race"         TEXT NOT NULL,
  "party"        TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "running_mate" TEXT,
  "photo"        TEXT,
  "updated_by"   TEXT REFERENCES "users"("id"),
  "updated_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "contestants_election_id_race_party_key"
  ON "contestants" ("election_id", "race", "party");

ALTER TABLE "broadcast_items" ADD COLUMN IF NOT EXISTS "sending_until" TIMESTAMPTZ(3);
