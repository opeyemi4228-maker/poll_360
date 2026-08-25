-- A reading now has to say which reader produced it, which way the
-- photograph arrived, and which contest it was read for. Every column is
-- nullable or defaulted: the table already holds rows that cannot answer.
ALTER TABLE "sheet_reads" ADD COLUMN IF NOT EXISTS "reader" TEXT;
ALTER TABLE "sheet_reads" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE "sheet_reads" ADD COLUMN IF NOT EXISTS "race" TEXT;
ALTER TABLE "sheet_reads" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'WHATSAPP';

CREATE INDEX IF NOT EXISTS "sheet_reads_unit" ON "sheet_reads"("unit_code");
