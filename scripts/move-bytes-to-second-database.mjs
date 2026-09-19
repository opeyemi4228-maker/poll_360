/**
 * Move the heavy bytes already filed into the second database.
 *
 *   npm run bytes:move                 counts, moves nothing
 *   npm run bytes:move -- --commit     moves them
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT MOVES, AND WHAT DELIBERATELY DOES NOT
 *
 *  Two things, and only two: the bytes of photographs, and the bodies of
 *  deliveries Data Bank has already acknowledged. They are the only rows in
 *  this product with no ceiling on them — one per photograph, for ever — and
 *  between them they were twenty-two of the working database's forty-eight
 *  megabytes, in thirty-eight rows.
 *
 *  Nothing else is touched. Every table stays where it is, every row keeps
 *  its id and its keys, and a photograph's row stays beside the incident it
 *  belongs to with its hash, its size and its dimensions intact. What moves
 *  is the column nobody queries and everybody pays for.
 *
 *  A delivery still owed to Data Bank is left alone, whole, in the working
 *  database. See the note over `archive` in lib/databank.js for why that line
 *  is drawn at delivery and not anywhere else.
 *
 *  ── IT READS BACK BEFORE IT LETS GO ──────────────────────────────────────
 *  Each row is written to the second database, read back out of it, and
 *  compared — hash for a photograph, length and first bytes for a body —
 *  before a single byte is cleared from the working database. A row that
 *  does not survive that check is left exactly as it was and reported. The
 *  whole point of this pipeline is evidence; a migration that loses some of
 *  it quietly would be worse than a full database.
 *
 *  ── RUN IT ONCE BEFORE DEPLOYING, WITHOUT --commit ───────────────────────
 *  It adds the three columns that record where a row's bytes are, and then,
 *  without --commit, stops. Production does not add columns on boot — see
 *  AUTO_MIGRATE in lib/db.js — so code deployed ahead of them is code whose
 *  photograph queries name columns that are not there.
 *
 *  ── AND IT IS SAFE TO RUN TWICE ──────────────────────────────────────────
 *  A row already moved is skipped by the column that says so. Stopped
 *  halfway, killed, run again on a bad connection — it picks up what is left.
 * ══════════════════════════════════════════════════════════════════════════
 */
import { createHash } from "node:crypto";

import { neon } from "@neondatabase/serverless";

import { databaseUrl } from "../lib/database-url.js";

const commit = process.argv.includes("--commit");

const workingUrl = databaseUrl();
const secondUrl = process.env.SECOND_DATABASE_URL?.trim();

if (!workingUrl) {
  console.error("No working database. Set DATABASE_URL (or DATABANK_DATABASE_URL) in .env.local.");
  process.exit(1);
}
if (!secondUrl) {
  console.error(
    "No second database. Set SECOND_DATABASE_URL in .env.local — see lib/second-database.js."
  );
  process.exit(1);
}

const host = (url) => new URL(url).host;
if (host(workingUrl) === host(secondUrl)) {
  console.error("The working database and the second one are the same. Nothing would be gained.");
  process.exit(1);
}

const working = neon(workingUrl);
const second = neon(secondUrl);

const megabytes = (n) => `${(Number(n ?? 0) / 1024 / 1024).toFixed(2)} MB`;

/* Postgres over HTTP returns a bytea as the hex string it prints. */
const asBuffer = (value) => {
  if (value == null) return Buffer.alloc(0);
  if (typeof value === "string") {
    return value.startsWith("\\x") ? Buffer.from(value.slice(2), "hex") : Buffer.from(value, "binary");
  }
  return Buffer.from(value);
};

console.log(`working  ${host(workingUrl)}`);
console.log(`second   ${host(secondUrl)}`);
console.log(commit ? "\nMoving.\n" : "\nCounting only. Add --commit to move.\n");

/* ── THE COLUMNS THAT SAY WHERE A ROW'S BYTES ARE ─────────────────────────
   Added by lib/db.js's migration list on boot, and added here too, because
   this script is the thing somebody runs *before* the new code is deployed
   as often as after it. Both statements are safe to run against a database
   that already has them. */
await working`ALTER TABLE media ADD COLUMN IF NOT EXISTS bytes_elsewhere BOOLEAN NOT NULL DEFAULT false`;
await working`ALTER TABLE dumpsite_outbox ADD COLUMN IF NOT EXISTS body_elsewhere BOOLEAN NOT NULL DEFAULT false`;

/* And how big each photograph is, recorded before a single byte is cleared.
   The health screen adds this up to say how much evidence the deployment
   holds; measured from the column instead, that figure would read zero the
   moment this script finished, with every photograph still there. */
await working`ALTER TABLE media ADD COLUMN IF NOT EXISTS size INTEGER`;
await working`UPDATE media SET size = OCTET_LENGTH(bytes) WHERE size IS NULL AND OCTET_LENGTH(bytes) > 0`;

await second`
  CREATE TABLE IF NOT EXISTS media_bytes (
    id         TEXT PRIMARY KEY,
    mime       TEXT NOT NULL,
    bytes      BYTEA NOT NULL,
    hash       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
await second`
  CREATE TABLE IF NOT EXISTS outbox_bodies (
    id           BIGINT PRIMARY KEY,
    kind         TEXT,
    external_id  TEXT,
    body         TEXT NOT NULL,
    delivered_at TIMESTAMPTZ,
    moved_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

/* ------------------------------------------------------------ photographs */

const photographs = await working`
  SELECT id, octet_length(bytes) AS size
    FROM media
   WHERE bytes_elsewhere = false AND octet_length(bytes) > 0
   ORDER BY created_at ASC`;

const photographBytes = photographs.reduce((sum, row) => sum + Number(row.size), 0);
console.log(`photographs        ${String(photographs.length).padStart(5)} rows  ${megabytes(photographBytes)}`);

/* ------------------------------------------------------------- deliveries */

const deliveries = await working`
  SELECT id, length(body) AS size
    FROM dumpsite_outbox
   WHERE delivered_at IS NOT NULL AND body_elsewhere = false AND length(body) > 0
   ORDER BY created_at ASC`;

const deliveryBytes = deliveries.reduce((sum, row) => sum + Number(row.size), 0);
console.log(`delivered bodies   ${String(deliveries.length).padStart(5)} rows  ${megabytes(deliveryBytes)}`);

const owed = await working`
  SELECT COUNT(*)::int AS n FROM dumpsite_outbox WHERE delivered_at IS NULL`;
if (owed[0].n) console.log(`still owed         ${String(owed[0].n).padStart(5)} rows  left where they are, on purpose`);

console.log(`\ntotal to move                    ${megabytes(photographBytes + deliveryBytes)}`);

if (!commit) {
  console.log("\nNothing was moved. Run again with --commit.");
  process.exit(0);
}

let moved = 0;
let refused = 0;

/* One row at a time. A body carrying a photograph of Form EC8A is megabytes,
   and batching them means one failure loses the whole batch's progress. */
for (const { id } of photographs) {
  try {
    const [row] = await working`SELECT mime, bytes, hash FROM media WHERE id = ${id}`;
    const bytes = asBuffer(row.bytes);
    if (!bytes.length) continue;

    await second`
      INSERT INTO media_bytes (id, mime, bytes, hash)
      VALUES (${id}, ${row.mime}, ${bytes}, ${row.hash})
      ON CONFLICT (id) DO UPDATE SET bytes = EXCLUDED.bytes, hash = EXCLUDED.hash`;

    /* Read back from the second database and hash what came out. Not the hash
       the row claims — the bytes that actually arrived. */
    const [back] = await second`SELECT bytes FROM media_bytes WHERE id = ${id}`;
    const landed = asBuffer(back?.bytes);
    const same =
      landed.length === bytes.length &&
      createHash("sha256").update(landed).digest("hex") === createHash("sha256").update(bytes).digest("hex");

    if (!same) {
      console.log(`  refused  photograph ${id} — what came back is not what went in, left alone`);
      refused += 1;
      continue;
    }

    await working`UPDATE media SET bytes = ''::bytea, bytes_elsewhere = true WHERE id = ${id}`;
    moved += 1;
  } catch (error) {
    console.log(`  failed   photograph ${id} — ${error.message}`);
    refused += 1;
  }
}

for (const { id } of deliveries) {
  try {
    const [row] = await working`
      SELECT kind, external_id, body, delivered_at FROM dumpsite_outbox WHERE id = ${id}`;
    const body = typeof row.body === "string" ? row.body : JSON.stringify(row.body);
    if (!body.length) continue;

    await second`
      INSERT INTO outbox_bodies (id, kind, external_id, body, delivered_at)
      VALUES (${id}, ${row.kind}, ${row.external_id}, ${body}, ${row.delivered_at})
      ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body`;

    const [back] = await second`SELECT body FROM outbox_bodies WHERE id = ${id}`;
    const same =
      typeof back?.body === "string" &&
      back.body.length === body.length &&
      createHash("sha256").update(back.body).digest("hex") === createHash("sha256").update(body).digest("hex");

    if (!same) {
      console.log(`  refused  delivery ${id} — what came back is not what went in, left alone`);
      refused += 1;
      continue;
    }

    await working`UPDATE dumpsite_outbox SET body = '', body_elsewhere = true WHERE id = ${id}`;
    moved += 1;
  } catch (error) {
    console.log(`  failed   delivery ${id} — ${error.message}`);
    refused += 1;
  }
}

console.log(`\nmoved ${moved} rows${refused ? `, left ${refused} where they were` : ""}.`);

/* ── AND THE ROOM IT ACTUALLY FREED ────────────────────────────────────────
   Postgres does not hand space back when a row is emptied: the old version of
   the row is dead, not gone, and the table stays the size it was until a
   VACUUM reclaims it. So the size is reported after asking for one, and the
   number printed is the true one rather than the encouraging one. */
if (moved) {
  console.log("\nReclaiming the emptied space (this is the part that takes a moment)…");
  try {
    await working`VACUUM FULL media`;
    await working`VACUUM FULL dumpsite_outbox`;
  } catch (error) {
    console.log(`  VACUUM FULL was refused (${error.message}). Plain VACUUM instead.`);
    try {
      await working`VACUUM media`;
      await working`VACUUM dumpsite_outbox`;
    } catch {
      console.log("  Neither ran. The rows are moved; the space returns on the next autovacuum.");
    }
  }
}

const [after] = await working`
  SELECT pg_size_pretty(pg_database_size(current_database())) AS size`;
const [there] = await second`
  SELECT pg_size_pretty(pg_database_size(current_database())) AS size`;

console.log(`\nworking  ${host(workingUrl)}  ${after.size}`);
console.log(`second   ${host(secondUrl)}  ${there.size}`);
