-- The declared table is keyed per contest, and this is the index that was not.
--
-- 20260821120000 created "declared_one_per_place" on (election_id, level,
-- place_key), from a time when a project held one count. A project holds
-- several: a ward announces a presidential figure and a governorship figure on
-- the same evening, and they are two announcements about two separate counts
-- that must never be summed. Under the old index the second one is refused —
-- "duplicate key value violates unique constraint" — so a room can hold the
-- declared figures for exactly one of the day's contests and no more.
--
-- lib/db.js already creates the replacement, "declared_one_per_place_race", and
-- already carries a DROP for this one. Its runner is hash-gated, so that DROP
-- ran once and was recorded; this migration then put the index back on any
-- database where Prisma was applied afterwards, and the drop never ran again.
-- Two migration systems, one table, and the later one wins.
--
-- So the drop lives here as well, after the CREATE that is the cause. Both
-- systems now end in the same state whichever order they are run in.
DROP INDEX IF EXISTS "declared_one_per_place";

-- Belt and braces: if the same shape was ever created as a table constraint
-- rather than as a bare index, DROP INDEX does not touch it.
ALTER TABLE "declared" DROP CONSTRAINT IF EXISTS "declared_one_per_place";
