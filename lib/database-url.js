/**
 * Which database Poll360 reads and saves in.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  DATA BANK'S DATABASE, ADDED BESIDE THE ORIGINAL — NOT IN PLACE OF IT
 *
 *  The original database (DATABASE_URL) reached its plan's storage ceiling,
 *  and a database that cannot grow cannot take a sign-in or a filed return.
 *  Nothing in it was removed. Instead every Poll360 table was copied, row for
 *  row, into Data Bank's own database, which has room, and when
 *  DATABANK_DATABASE_URL is set that is where Poll360 now reads and saves.
 *
 *  DATABASE_URL is left exactly as it was, and the original database with
 *  it. Unset DATABANK_DATABASE_URL and Poll360 goes back to the original.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Poll360's tables sit in Data Bank's `public` schema, which Data Bank itself
 * does not use — its own tables are in `dumpsite` and `intake` — so the two
 * products share a database without sharing a table.
 */
export function databaseUrl() {
  const databank = process.env.DATABANK_DATABASE_URL?.trim();
  return databank || process.env.DATABASE_URL;
}
