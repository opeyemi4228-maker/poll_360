/**
 * Data Bank's database, for the IReV account, and only that one.
 *
 * ── WHY THIS IS NOT lib/database-url.js ────────────────────────────────────
 * That falls back to the original database when Data Bank's address is not
 * set. The original is full and is to be left exactly as it is — and it still
 * carries an old `dumpsite` schema, so an account opened there by mistake
 * would look, to the code that opened it, as though it had worked. The
 * "INEC Result Datas" account belongs in Data Bank, so with no Data Bank
 * address there is nothing to save into and this says so.
 *
 * ── AND WHY IT IS A POOL OF `pg` ───────────────────────────────────────────
 * Gathering sends whole columns as arrays and relies on what the database
 * hands back from an upsert. The rest of the product speaks to Postgres over
 * HTTP, which was measured as the right choice for one small query at a time;
 * this is hundreds of statements in a row from one caller, which is what a
 * held connection is for.
 */

import pg from "pg";

export function bankAddress() {
  return process.env.DATABANK_DATABASE_URL?.trim() || null;
}

const kept = globalThis;

/** `db(text, params) → rows`, or null where there is no Data Bank to reach. */
export function bank() {
  const address = bankAddress();
  if (!address) return null;

  if (kept.poll360IrevAddress !== address || !kept.poll360IrevPool) {
    kept.poll360IrevPool = new pg.Pool({ connectionString: address, max: 4, idleTimeoutMillis: 20000 });
    kept.poll360IrevPool.on("error", () => {});
    kept.poll360IrevAddress = address;
  }

  const pool = kept.poll360IrevPool;
  return async (text, params) => (await pool.query(text, params)).rows;
}

export async function closeBank() {
  await kept.poll360IrevPool?.end();
  kept.poll360IrevPool = null;
}
