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

/**
 * An address as the `pg` driver should be handed it.
 *
 * The driver reads `sslmode=require` as full verification of the server's
 * certificate, and has said its next major version will read it as something
 * weaker; until then it prints a long warning on every start. This asks for
 * what the driver already does, by name: no change today, and no quiet
 * loosening when the driver is upgraded. The address in the environment is
 * left as it was written.
 */
export function pgAddress(url) {
  if (!url || /[?&]uselibpqcompat=true/.test(url)) return url;
  return url.replace(/([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/, "$1verify-full");
}
