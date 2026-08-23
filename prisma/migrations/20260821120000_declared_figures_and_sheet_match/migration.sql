-- Declared figures, and whether a return's photograph agreed with it.
--
-- ── TWO INDEPENDENT SOURCES, KEPT INDEPENDENT ─────────────────────────────
-- `results.inec_total` has been on the results table since the beginning and
-- holds a single integer. It is left exactly as it is: the seeder writes it,
-- and dropping a column is how a migration loses data somebody was still
-- reading. But one integer cannot say which party's figure moved, and it
-- cannot hold a ward figure at all — while collation announces wards hours
-- before any unit sheet is published, and a ward is where a count is actually
-- altered.
--
-- So declared figures get their own table. Nothing in it is ever written into
-- a result and no result is ever written into it: a second, independently
-- sourced figure for the same booths is the entire point of a parallel count,
-- and a schema that let either side correct the other would destroy that
-- quietly, with a comparison that always agrees as the only symptom.

CREATE TABLE IF NOT EXISTS "declared" (
    "id"           TEXT NOT NULL,
    "election_id"  TEXT NOT NULL,
    "level"        TEXT NOT NULL,
    "place_key"    TEXT NOT NULL,
    "state_code"   TEXT,
    -- How many polling units this place contains, where the collation sheet
    -- said so. NULL means nobody told us, and the comparison then stays
    -- partial rather than assuming complete coverage. It cannot be derived
    -- from polling_units, which records what has reported rather than what
    -- exists; counting that would mark a ward complete the moment it is
    -- covered at all, and flag its unreported booths as a divergence.
    "units"        INTEGER,
    "registered"   INTEGER,
    "accredited"   INTEGER,
    "rejected"     INTEGER,
    "votes"        TEXT NOT NULL,
    "stated_total" INTEGER,
    "total"        INTEGER NOT NULL,
    "source"       TEXT NOT NULL DEFAULT 'UPLOAD',
    "note"         TEXT,
    "entered_by"   TEXT,
    "created_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "declared_pkey" PRIMARY KEY ("id")
);

-- A place is declared once. Collation correcting itself replaces the row
-- rather than adding one: two rows for one ward is a total counted twice, and
-- nobody spots that in an aggregate.
CREATE UNIQUE INDEX IF NOT EXISTS "declared_one_per_place"
    ON "declared"("election_id", "level", "place_key");

CREATE INDEX IF NOT EXISTS "declared_by_state"
    ON "declared"("election_id", "state_code");

ALTER TABLE "declared"
    ADD CONSTRAINT "declared_election_id_fkey"
    FOREIGN KEY ("election_id") REFERENCES "elections"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── DID THE PICTURE AGREE WITH THE FIGURES? ───────────────────────────────
-- Until now the two halves of a filing never met: the sheet reader checked a
-- photograph against itself, and the return recorded whatever was typed, with
-- nothing anywhere asking whether they were the same figures.
--
-- NULL means no sheet was compared. That is not the same as a sheet that was
-- compared and agreed, and the two must never be stored so they look alike.
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "sheet_match" TEXT;

-- Stated separately as well as inside the CREATE TABLE above, so a database
-- that already has the table from an earlier run of this migration still gets
-- the column. CREATE TABLE IF NOT EXISTS does nothing to a table that exists;
-- a column is added with ALTER, or it is not added.
ALTER TABLE "declared" ADD COLUMN IF NOT EXISTS "units" INTEGER;
