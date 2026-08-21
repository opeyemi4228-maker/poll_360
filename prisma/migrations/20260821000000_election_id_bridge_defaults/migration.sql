-- Bridge defaults for election_id.
--
-- The raw-SQL writers in lib/db.js predate the Election model and do not set
-- this column. Without a default, every insert into these four tables failed
-- the not-null constraint — which is what a WhatsApp agent registering a new
-- polling unit ran into. `results` and `incidents` already carried a default;
-- these four did not.
--
-- Applied out of band first, then recorded here so a fresh database gets the
-- same shape. Drop these defaults once every writer names its election, so a
-- row can never quietly land in the wrong project.

ALTER TABLE "polling_units" ALTER COLUMN "election_id" SET DEFAULT 'elec_2023_presidential';
ALTER TABLE "sheet_reads"   ALTER COLUMN "election_id" SET DEFAULT 'elec_2023_presidential';
ALTER TABLE "wa_positions"  ALTER COLUMN "election_id" SET DEFAULT 'elec_2023_presidential';
ALTER TABLE "ledger"        ALTER COLUMN "election_id" SET DEFAULT 'elec_2023_presidential';
