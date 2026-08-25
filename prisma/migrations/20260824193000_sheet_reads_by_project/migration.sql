-- A reading has to say which project it belongs to.
--
-- The column existed in the Prisma model with a default of the 2023 project
-- and the raw-SQL writer never set it, so every reading taken since projects
-- existed was filed against 2023 no matter which election was running. The
-- symptom was a rehearsal reading a sheet and seeing nothing on its own
-- dashboard, which looks exactly like a reader that does not work.
--
-- Existing rows keep 2023, which is where they have been all along and the
-- only honest thing to say about them. The default is then dropped so nothing
-- can land in the wrong project again: the writer in lib/db.js refuses
-- without an election id, and this makes the database refuse too.

ALTER TABLE "sheet_reads" ADD COLUMN IF NOT EXISTS "election_id" TEXT;
UPDATE "sheet_reads" SET "election_id" = 'elec_2023_presidential' WHERE "election_id" IS NULL;
ALTER TABLE "sheet_reads" ALTER COLUMN "election_id" SET NOT NULL;
ALTER TABLE "sheet_reads" ALTER COLUMN "election_id" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "sheet_reads_election_id_created_at_idx"
  ON "sheet_reads"("election_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "sheet_reads_election_id_unit_code_idx"
  ON "sheet_reads"("election_id", "unit_code");
