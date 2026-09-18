#!/usr/bin/env node
/**
 * Build the performance indexes without stopping anybody filing.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A CREATE INDEX AT BOOT IS A DEPLOY THAT LOCKS THE TABLE
 *
 *  lib/db.js brings the schema up to date as the application starts, which is
 *  right for a fresh database and for adding a column. It is wrong for
 *  building an index on a table that already holds a general election's
 *  returns: a plain CREATE INDEX takes a lock that blocks every write to that
 *  table until it finishes. On a few thousand rows that is instant. On nine
 *  hundred thousand it is minutes of agents unable to file, at boot, which is
 *  the worst possible moment for it.
 *
 *  Postgres can build an index without that lock. It costs two passes over
 *  the table and a little more disk, and writes carry on the whole time.
 *  The one thing it cannot do is run inside a transaction, which is why it
 *  is here and not in the migration list.
 *
 *  ── RUN THIS BEFORE THE DEPLOY, NOT AFTER ───────────────────────────────
 *  Then the statements in lib/db.js find the indexes already there and do
 *  nothing, and the deploy is as quick as any other.
 *
 *      npm run db:indexes            -- against DATABASE_URL / DATABANK_DATABASE_URL
 *      npm run db:indexes -- --check -- say what is missing and build nothing
 *
 *  Safe to run twice, and safe to run while the product is serving.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { sql } from "../lib/sql.js";

/**
 * Exactly the indexes lib/db.js declares, in the concurrent form.
 *
 * ── THE TWO LISTS HAVE TO SAY THE SAME THING ───────────────────────────────
 * An index built here under a name lib/db.js does not use is an index the
 * migration then builds a second copy of, with the lock, at boot — which is
 * the entire failure this script exists to avoid. The names below are the
 * names there, and `--check` compares what exists against this list so a
 * drift is visible rather than discovered during a deploy.
 */
const INDEXES = [
  {
    name: "results_by_lga",
    what: "narrowing the board to a state, a district or a local government",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS results_by_lga
            ON results(election_id, race, substr(unit_code, 1, 5))`,
  },
  {
    name: "results_counted_by_lga",
    what: "the same narrowing over counted returns only, which is every tally",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS results_counted_by_lga
            ON results(election_id, race, substr(unit_code, 1, 5))
            WHERE status IN ('SUBMITTED','VERIFIED')`,
  },
  {
    name: "declared_by_lga",
    what: "narrowing declared figures the same way",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS declared_by_lga
            ON declared(election_id, race, substr(place_key, 1, 5))`,
  },
  {
    name: "results_recent",
    what: "what has just landed, on every room, every twenty seconds",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS results_recent
            ON results(election_id, race, submitted_at DESC)`,
  },
  {
    name: "results_by_uploader",
    what: "an upload desk's own work, newest first",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS results_by_uploader
            ON results(election_id, submitted_by, submitted_at DESC)`,
  },
  {
    name: "results_by_coordinator",
    what: "an agent's own returns, asked on every load of their screen",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS results_by_coordinator
            ON results(election_id, coordinator_id, submitted_at DESC)`,
  },
  {
    name: "incidents_recent",
    what: "the incident feed",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS incidents_recent
            ON incidents(election_id, created_at DESC)`,
  },
  {
    name: "audit_by_actor",
    what: "the audit trail, read newest-first by one actor",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_by_actor
            ON audit(actor_id, created_at DESC)`,
  },
  {
    name: "sessions_expiry",
    what: "sweeping expired sessions without reading the table",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS sessions_expiry ON sessions(expires_at)`,
  },
  {
    name: "coordinator_sessions_expiry",
    what: "the same, for the agents' sessions",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS coordinator_sessions_expiry
            ON coordinator_sessions(expires_at)`,
  },
  {
    name: "rate_counters_window",
    what: "sweeping spent rate-limit windows",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS rate_counters_window
            ON rate_counters(window_start)`,
  },
  {
    name: "dumpsite_outbox_due",
    what: "what the hub is still owed, and when to try it again",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS dumpsite_outbox_due
            ON dumpsite_outbox(next_try_at) WHERE delivered_at IS NULL`,
  },
];

const checkOnly = process.argv.includes("--check");

/** Which of them the database already has, and whether each is usable. */
async function present() {
  const rows = await sql`
    SELECT c.relname AS name, i.indisvalid AS valid
      FROM pg_class c
      JOIN pg_index i ON i.indexrelid = c.oid
     WHERE c.relname = ANY(${INDEXES.map((index) => index.name)})
  `;
  return new Map(rows.map((row) => [row.name, row.valid]));
}

async function main() {
  const have = await present();

  console.log(`\n  ${INDEXES.length} indexes. ${have.size} already present.\n`);

  for (const index of INDEXES) {
    const valid = have.get(index.name);

    if (valid === true) {
      console.log(`  ✓ ${index.name.padEnd(30)} already there`);
      continue;
    }

    /* ── AN INVALID INDEX IS WORSE THAN A MISSING ONE ──────────────────────
       A concurrent build that fails partway leaves the index behind, marked
       unusable. The planner ignores it, so the queries stay slow; the writes
       still maintain it, so every insert pays for it. Nothing reports this
       anywhere, and `IF NOT EXISTS` will not rebuild it because it does
       exist. It has to be dropped first. */
    if (valid === false) {
      console.log(`  ! ${index.name.padEnd(30)} present but unusable — dropping it first`);
      if (!checkOnly) await sql.query(`DROP INDEX CONCURRENTLY IF EXISTS ${index.name}`);
    }

    if (checkOnly) {
      console.log(`  · ${index.name.padEnd(30)} missing — ${index.what}`);
      continue;
    }

    const started = Date.now();
    process.stdout.write(`  … ${index.name.padEnd(30)} building`);
    try {
      await sql.query(index.sql);
      console.log(`\r  ✓ ${index.name.padEnd(30)} built in ${Math.round((Date.now() - started) / 1000)}s   `);
    } catch (error) {
      /* Reported and carried on. One index that cannot be built — a table
         this deployment does not have, a permission it lacks — must not stop
         the other eleven, and the product works without any of them. They
         are speed, not correctness. */
      console.log(`\r  ✗ ${index.name.padEnd(30)} ${error.message}`);
    }
  }

  console.log(
    checkOnly
      ? "\n  Nothing was built. Run without --check to build what is missing.\n"
      : "\n  Done. The statements in lib/db.js will now find these and do nothing.\n"
  );
}

await main();
