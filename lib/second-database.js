import { neon } from "@neondatabase/serverless";

/**
 * The second database — room beside the working one, for the heavy bytes.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ADDED BESIDE THE WORKING DATABASE, NOT IN PLACE OF IT
 *
 *  Poll360 reads and saves in one database (see lib/database-url.js). Two
 *  things in it grow without any ceiling: photographs, and the bodies of
 *  deliveries already made to Data Bank. Everything else — every account,
 *  every polling unit, every figure of every return — is small and stays
 *  small. Measured on the working database, those two were twenty-two of its
 *  forty-eight megabytes, in thirty-eight rows.
 *
 *  So they move here, and nothing else does. The working database keeps every
 *  table, every row and every key it had; a photograph's row stays exactly
 *  where it was, with its id, its hash, its size and the incident or the
 *  agent it belongs to. Only the bytes themselves are held over here, and the
 *  row says so.
 *
 *  ── WHAT HAPPENS WHEN THIS IS NOT SET ────────────────────────────────────
 *  Nothing. Bytes are written where they always were, and every photograph
 *  already filed still serves. This is space, not a dependency.
 *
 *  ── AND WHEN IT IS SET BUT CANNOT BE REACHED ─────────────────────────────
 *  A photograph being filed is kept in the working database instead, and the
 *  row records that that is where it is. A night when this database is down
 *  must not be a night when a polling unit cannot file its evidence.
 *
 *  The one thing that cannot be recovered from is a photograph whose bytes
 *  were moved here and whose home is then taken away. That case is loud —
 *  it throws, naming the setting — rather than serving a broken picture.
 * ══════════════════════════════════════════════════════════════════════════
 */

if (typeof window !== "undefined") {
  throw new Error(
    "lib/second-database.js talks to a database and is server only. Importing it into a " +
      "client component would ship a connection string to the browser."
  );
}

/** The address, or null when this deployment has not been given one. */
export function secondDatabaseUrl() {
  const url = process.env.SECOND_DATABASE_URL?.trim();
  if (!url || url.startsWith("file:")) return null;
  return url;
}

/** Whether there is a second database at all. Safe to call anywhere. */
export const hasSecondDatabase = () => Boolean(secondDatabaseUrl());

/* One client per address per process. Neon over HTTP holds no socket, so this
   is about not rebuilding the driver on every photograph rather than about
   connection limits — the same reasoning as lib/sql.js, which explains at
   length why this is HTTP and not a pool. */
let held = null;
let heldFor = null;

function client() {
  const address = secondDatabaseUrl();
  if (!address) return null;
  if (heldFor !== address) {
    held = neon(address);
    heldFor = address;
  }
  return held;
}

/**
 * Retried on the way there, not on the way back.
 *
 * Same rule as lib/sql.js and for the same reason: a connection that never
 * reached the database is worth trying again, and a statement Postgres itself
 * refused will be refused identically every time. Kept short here — the
 * caller of every one of these has a working fallback, so spending four
 * seconds proving this database is down costs more than it saves.
 */
async function attempt(issue) {
  for (let n = 1; ; n += 1) {
    try {
      return await issue();
    } catch (error) {
      const fromPostgres = error?.code && /^[0-9A-Z]{5}$/.test(String(error.code));
      if (fromPostgres || n >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * n));
    }
  }
}

/**
 * The two tables, made once per process.
 *
 * They are created here rather than in lib/db.js's migration list because
 * that list runs against the working database and this is a different one,
 * with its own life: it can be added to a deployment that has been running
 * for months, and it has to build its own tables when it is.
 *
 * Both are deliberately dumb. No foreign keys, no indexes beyond the primary
 * key, nothing that has to agree with a schema in another database — every
 * row here is fetched by the id the working database already holds, and a
 * constraint that spans two databases is a constraint neither can enforce.
 */
let prepared = null;

async function ready() {
  const sql = client();
  if (!sql) return null;

  if (!prepared) {
    prepared = (async () => {
      await attempt(
        () => sql`
          CREATE TABLE IF NOT EXISTS media_bytes (
            id         TEXT PRIMARY KEY,
            mime       TEXT NOT NULL,
            bytes      BYTEA NOT NULL,
            hash       TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )`
      );
      await attempt(
        () => sql`
          CREATE TABLE IF NOT EXISTS outbox_bodies (
            id           BIGINT PRIMARY KEY,
            kind         TEXT,
            external_id  TEXT,
            body         TEXT NOT NULL,
            delivered_at TIMESTAMPTZ,
            moved_at     TIMESTAMPTZ NOT NULL DEFAULT now()
          )`
      );
    })().catch((error) => {
      /* A failure here is not permanent — the database may simply have been
         asleep — so the next caller starts again rather than inheriting it. */
      prepared = null;
      throw error;
    });
  }

  await prepared;
  return sql;
}

/* Postgres over HTTP hands a bytea back as the hex string it prints,
   "\x89504e47…", and a Response built from that serves those literal
   characters under an image content type: a broken picture, and nothing in
   the logs, because as far as the stack is concerned it worked. The same
   conversion lib/db.js does, kept here so no caller has to know which side of
   the line the bytes came from. */
function asBytes(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    return value.startsWith("\\x") ? Buffer.from(value.slice(2), "hex") : Buffer.from(value, "binary");
  }
  return Buffer.from(value);
}

/**
 * Keep one photograph's bytes here.
 *
 * Returns true if they are now here and the working database should hold an
 * empty column, false if they are not and it should hold them as it always
 * has. Never throws: every caller is in the middle of filing something.
 */
export async function keepMediaBytes({ id, mime, bytes, hash }) {
  try {
    const sql = await ready();
    if (!sql) return false;

    /* Re-filing the same id overwrites rather than failing. The id is made
       fresh per photograph, so this only ever fires on a retry of a write
       that had already landed here before it failed over there. */
    await attempt(
      () => sql`
        INSERT INTO media_bytes (id, mime, bytes, hash)
        VALUES (${id}, ${mime}, ${bytes}, ${hash})
        ON CONFLICT (id) DO UPDATE SET bytes = EXCLUDED.bytes, hash = EXCLUDED.hash`
    );
    return true;
  } catch {
    return false;
  }
}

/** One photograph's bytes. Null when this database does not have them. */
export async function mediaBytes(id) {
  const sql = await ready();
  if (!sql) return null;

  const rows = await attempt(() => sql`SELECT mime, bytes, hash FROM media_bytes WHERE id = ${id}`);
  const row = rows?.[0];
  return row ? { mime: row.mime, bytes: asBytes(row.bytes), hash: row.hash } : null;
}

/**
 * Keep the body of a delivery that has already been made.
 *
 * ── ONLY AFTER IT HAS LANDED ───────────────────────────────────────────────
 * A body still owed to Data Bank stays in the working database, beside the
 * row that says it is owed, where the drain reads it in the same statement
 * that claims it. Splitting a delivery that has not been made across two
 * databases would put a network hop inside the one path in this product that
 * exists because the network cannot be trusted.
 *
 * Once it has landed the body is a record, not a queue item. Nothing reads it
 * again except somebody asking, months later, what exactly was sent. That can
 * afford to live one address away.
 */
export async function keepOutboxBody({ id, kind, externalId, body, deliveredAt = null }) {
  try {
    const sql = await ready();
    if (!sql) return false;

    await attempt(
      () => sql`
        INSERT INTO outbox_bodies (id, kind, external_id, body, delivered_at)
        VALUES (${id}, ${kind ?? null}, ${externalId ?? null}, ${body}, ${deliveredAt})
        ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body`
    );
    return true;
  } catch {
    return false;
  }
}

/** The body of a delivery already made. Null when it is not here. */
export async function outboxBody(id) {
  const sql = await ready();
  if (!sql) return null;

  const rows = await attempt(() => sql`SELECT body FROM outbox_bodies WHERE id = ${id}`);
  return rows?.[0]?.body ?? null;
}

/**
 * How much is held here, for the health screen.
 *
 * Never throws and never reports a confident zero: a database it could not
 * reach returns null, which the screen says out loud rather than drawing as
 * an empty store.
 */
export async function secondDatabaseReport() {
  const sql = client();
  if (!sql) return { configured: false };

  try {
    const rows = await attempt(
      () => sql`
        SELECT (SELECT COUNT(*)::int FROM media_bytes)                          AS photographs,
               (SELECT COALESCE(SUM(OCTET_LENGTH(bytes)), 0)::bigint FROM media_bytes)
                                                                                AS photograph_bytes,
               (SELECT COUNT(*)::int FROM outbox_bodies)                        AS deliveries,
               (SELECT COALESCE(SUM(OCTET_LENGTH(body)), 0)::bigint FROM outbox_bodies)
                                                                                AS delivery_bytes`
    );
    const row = rows?.[0] ?? {};
    return {
      configured: true,
      reachable: true,
      host: new URL(secondDatabaseUrl()).host,
      photographs: Number(row.photographs ?? 0),
      photographBytes: Number(row.photograph_bytes ?? 0),
      deliveries: Number(row.deliveries ?? 0),
      deliveryBytes: Number(row.delivery_bytes ?? 0),
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      host: new URL(secondDatabaseUrl()).host,
      why: error?.message ?? "The second database did not answer.",
    };
  }
}
