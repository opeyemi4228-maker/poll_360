-- Form EC8A, captured in full.
--
-- The results table held four of the eight numbered boxes at the head of an
-- INEC polling unit result sheet: the register, the accredited count, the
-- rejected ballots and the party rows. The other four, and everything on the
-- sheet that is not a figure, were read off the paper and thrown away.
--
-- That is not a completeness complaint. Boxes #3, #4, #5 and #8 are what make
-- the sheet checkable: issued minus unused must equal used, and spoiled plus
-- rejected plus valid must equal used too. Without them a transcription error
-- by the presiding officer is invisible to everybody downstream, which is the
-- one thing this product exists to prevent.
--
-- Every column is nullable. Existing rows have none of these and must stay
-- readable, and a photograph may genuinely not show a box. Null means "not
-- captured" throughout and is never read as zero.

ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "form_serial"    TEXT;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "ballots_issued" INTEGER;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "unused_ballots" INTEGER;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "spoiled"        INTEGER;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "stated_valid"   INTEGER;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "used_ballots"   INTEGER;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "contested"      BOOLEAN;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "sheet_date"     TEXT;
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "agents"         TEXT;

-- The serial number is pre-printed and unique to one sheet, so it is the only
-- field on the paper that can tell two booths' returns from one sheet
-- photographed twice. Indexed rather than made unique: a duplicate is a
-- finding to show a desk, not a write to refuse — the same serial arriving
-- twice is exactly the fraud signal worth keeping, and a constraint would
-- discard the evidence instead of recording it.
CREATE INDEX IF NOT EXISTS "results_election_serial_idx"
  ON "results" ("election_id", "form_serial");
