/**
 * Return a project to a clean slate: every figure, report and movement filed
 * into it, removed.
 *
 *   npm run project:clear -- --project 2027-presidential-election
 *   npm run project:clear -- --project 2027-presidential-election --commit
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS EXISTS, AND WHY IT IS NOT A DELETE STATEMENT SOMEBODY TYPES
 *
 *  Every screen in the situation room is built from rows filed into a
 *  project. While the product is being built those rows are test traffic: an
 *  agent at one booth pressing SOS to see what the room does, the same return
 *  filed twice to watch the tally move. It is indistinguishable, on screen,
 *  from the real thing — Command reports a share, Situations shows three
 *  critical incidents open, Timeline draws a morning, Booth names an agent.
 *
 *  A campaign briefed off that is being briefed off a rehearsal. So the test
 *  traffic has to come out before the night, and taking it out by hand means
 *  somebody at a prompt at midnight writing DELETE against a live database
 *  and remembering, from memory, all nine tables that hold a piece of it.
 *  They will not remember all nine, and the two they miss are the ones that
 *  leave a state coloured on the map with nothing underneath it.
 *
 *  ── IT COUNTS FIRST AND CHANGES NOTHING ────────────────────────────────
 *  Run without --commit it is a report: what is there, table by table, and
 *  which agents would leave the roster. That is the whole output. Nothing is
 *  removed until somebody has read that list and asked for it again.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT IT DELIBERATELY DOES NOT TOUCH ────────────────────────────────────
 * The audit trail. `audit` records who did what, and a clean-up that erased
 * the record of itself is the one thing an audit trail must survive. The rows
 * this removes are gone; the fact that they were removed, and by whom, is not.
 *
 * Deliveries already made to Data Bank. `dumpsite_outbox` is a delivery log,
 * and a delivered row is a record that something left this building. What it
 * does cancel is anything still queued for the cleared project, because a
 * return deleted here and delivered ten minutes later is the worst of both.
 *
 * A demonstration project, unless asked twice. The 2023 replay is built from
 * its own rows — clearing them empties the Results tab for good, which is
 * never what somebody clearing test traffic meant. --include-demo says it out
 * loud.
 */

import { db } from "../lib/db.js";

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const includeDemo = args.includes("--include-demo");
const takeTheirRows = args.includes("--with-their-rows");

function valueOf(flag) {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : null;
}

/* Repeatable: --agent <id|phone> --agent <id|phone>. Named one at a time
   rather than matched by a pattern, because a roster is people and a pattern
   that sweeps up one real agent has cost a booth its coverage. */
const agentRefs = args.reduce((found, arg, index) => {
  if (arg === "--agent" && args[index + 1]) found.push(args[index + 1]);
  return found;
}, []);

const projectRef = valueOf("--project");

if (!projectRef) {
  console.error(
    "Name the project: --project <slug or id>\n" +
      "  npm run project:clear -- --project 2027-presidential-election"
  );
  process.exit(1);
}

const project = await db
  .prepare("SELECT id, title, slug, status, is_demo FROM elections WHERE slug = ? OR id = ?")
  .get(projectRef, projectRef);

if (!project) {
  console.error(`No project with slug or id "${projectRef}".`);
  const all = await db.prepare("SELECT slug, title FROM elections ORDER BY title").all();
  console.error("\nProjects on this database:");
  for (const row of all) console.error(`  ${row.slug.padEnd(40)} ${row.title}`);
  process.exit(1);
}

if (project.is_demo && !includeDemo) {
  console.error(
    `"${project.title}" is the demonstration project. The Results tab replays it,\n` +
      "so clearing it empties that screen permanently.\n\n" +
      "If that is genuinely what you want, add --include-demo."
  );
  process.exit(1);
}

/* ── THE TABLES, IN THE ORDER THE KEYS ALLOW ────────────────────────────────
   Children before parents. `media` is not listed: it cascades from
   `incidents`, and deleting it separately would only give the report a number
   it had already counted. It is counted below and reported all the same,
   because "9 photographs went with those incidents" is a thing somebody
   should be told before they agree. */
const TABLES = [
  ["sheet_reads", "machine readings of result sheets"],
  ["unit_updates", "the day's movements filed from booths"],
  ["incidents", "situation reports"],
  ["results", "filed returns"],
  ["declared", "declared figures entered by hand"],
  ["ledger", "the payment ledger"],
  ["broadcast_items", "items queued for the broadcast desk"],
  ["wa_positions", "where WhatsApp conversations had got to"],
  ["polling_units", "booths registered to this project"],
];

const counts = [];
for (const [table, what] of TABLES) {
  const row = await db
    .prepare(`SELECT COUNT(*)::int AS n FROM ${table} WHERE election_id = ?`)
    .get(project.id);
  counts.push({ table, what, n: Number(row?.n ?? 0) });
}

const photos = await db
  .prepare(
    `SELECT COUNT(*)::int AS n FROM media
      WHERE incident_id IN (SELECT id FROM incidents WHERE election_id = ?)`
  )
  .get(project.id);

/* Only what has not left yet. See the note at the head of this file. */
const queued = await db
  .prepare(
    `SELECT COUNT(*)::int AS n FROM dumpsite_outbox
      WHERE delivered_at IS NULL AND external_id LIKE ?`
  )
  .get(`poll360:result:${project.id}:%`);

/* ── THE AGENTS NAMED ON THE COMMAND LINE ───────────────────────────────────
   Resolved before anything is deleted, so the report can print who they are
   rather than the id somebody pasted.

   ── AND THE ROWS THEY LEFT ON OTHER PROJECTS ─────────────────────────────
   A test account rarely confines itself to one project. The agent used to
   rehearse the 2027 room is the same account somebody pressed SOS with while
   the demonstration project was open, and those rows sit under a project this
   run was never asked to clear.

   Removing the account without them would leave returns with no author. So
   this refuses by default and names what it found, and --with-their-rows is
   how somebody says "that account was test traffic, take its filings with
   it". Said out loud, because the rows it then removes are on a project
   nobody named on the command line. */
const agents = [];
for (const ref of agentRefs) {
  const digits = ref.replace(/[^\d]/g, "");
  const row = await db
    .prepare(
      `SELECT id, name, phone, unit_code, status FROM coordinators
        WHERE id = ? OR (phone IS NOT NULL AND phone = ?)`
    )
    .get(ref, digits || ref);

  if (!row) {
    console.error(`No agent on the roster with id or phone "${ref}".`);
    process.exit(1);
  }

  const held = await db
    .prepare(
      `SELECT e.title, e.slug, e.is_demo, COUNT(*)::int AS n FROM (
         SELECT election_id FROM results      WHERE coordinator_id = ?
         UNION ALL
         SELECT election_id FROM incidents    WHERE coordinator_id = ?
         UNION ALL
         SELECT election_id FROM unit_updates WHERE coordinator_id = ?
       ) held
       JOIN elections e ON e.id = held.election_id
       WHERE held.election_id <> ?
       GROUP BY e.title, e.slug, e.is_demo
       ORDER BY e.title`
    )
    .all(row.id, row.id, row.id, project.id);

  if (held.length > 0 && !takeTheirRows) {
    console.error(`${row.name} has also filed into ${held.length} other project(s):\n`);
    for (const where of held) {
      console.error(`  ${String(where.n).padStart(4)}  ${where.title}${where.is_demo ? "  (the demonstration project)" : ""}`);
    }
    console.error(
      "\nRemoving the account would leave those rows without an author, so this refuses.\n" +
        "If that account was test traffic, add --with-their-rows and its filings go with it.\n" +
        "If it was a real agent, disable the account instead: the trail stays readable."
    );
    process.exit(1);
  }

  agents.push({ ...row, held });
}

/* ------------------------------------------------------------------ report */

console.log(`\n${project.title}  (${project.slug}, ${project.status})\n`);

const total = counts.reduce((sum, row) => sum + row.n, 0);

if (total === 0 && agents.length === 0 && Number(queued?.n ?? 0) === 0) {
  console.log("Nothing filed into it. Already a clean slate.\n");
  process.exit(0);
}

for (const row of counts) {
  if (row.n === 0) continue;
  console.log(`  ${String(row.n).padStart(6)}  ${row.table.padEnd(18)} ${row.what}`);
}

if (Number(photos?.n ?? 0) > 0) {
  console.log(
    `  ${String(photos.n).padStart(6)}  ${"media".padEnd(18)} photographs, which go with those incidents`
  );
}

if (Number(queued?.n ?? 0) > 0) {
  console.log(
    `  ${String(queued.n).padStart(6)}  ${"dumpsite_outbox".padEnd(18)} deliveries still queued for Data Bank, cancelled`
  );
}

if (agents.length > 0) {
  console.log("\n  Leaving the roster:");
  for (const row of agents) {
    console.log(`    ${row.name} — ${row.unit_code ?? "no booth"} (${row.status})`);
    /* Named project by project rather than totalled, because "and 2 rows
       elsewhere" is the kind of line somebody scrolls past and "2 rows on the
       demonstration project" is not. */
    for (const where of row.held) {
      console.log(
        `      and ${where.n} row(s) filed into ${where.title}${where.is_demo ? " (the demonstration project)" : ""}`
      );
    }
  }
}

if (!commit) {
  console.log("\nNothing changed. Add --commit to clear it.\n");
  process.exit(0);
}

/* ------------------------------------------------------------------- clear */

/* ── THE PHOTOGRAPHS' BYTES, IF THEY ARE IN THE SECOND DATABASE ───────────
   `media` cascades from `incidents`, so deleting an incident takes its
   photograph's row with it. The bytes do not cascade: they are in another
   database, which knows nothing about a foreign key in this one.

   Left alone they are the exact opposite of what the second database is for —
   bytes nothing will ever ask for again, taking up the room that was the
   whole reason for having it. So the ids are read here, while the rows that
   name them still exist, and removed after. Failing to reach that database
   costs some wasted room and nothing else, so it does not stop the clear. */
const strandedIds = (
  await db
    .prepare(
      `SELECT id FROM media
        WHERE bytes_elsewhere = true
          AND incident_id IN (SELECT id FROM incidents WHERE election_id = ?)`
    )
    .all(project.id)
).map((row) => row.id);

for (const [table] of TABLES) {
  await db.prepare(`DELETE FROM ${table} WHERE election_id = ?`).run(project.id);
}

if (strandedIds.length) {
  try {
    const { secondDatabaseUrl } = await import("../lib/second-database.js");
    const url = secondDatabaseUrl();
    if (url) {
      const { neon } = await import("@neondatabase/serverless");
      await neon(url)`DELETE FROM media_bytes WHERE id = ANY(${strandedIds})`;
      console.log(`  ${strandedIds.length} photographs' bytes removed from the second database`);
    }
  } catch (error) {
    console.log(
      `  ${strandedIds.length} photographs' bytes are still in the second database — ` +
        `it could not be reached (${error.message}). Nothing points at them.`
    );
  }
}

await db
  .prepare("DELETE FROM dumpsite_outbox WHERE delivered_at IS NULL AND external_id LIKE ?")
  .run(`poll360:result:${project.id}:%`);

/* Last, and only now: the rows above referenced them, and a roster row
   removed first would have been refused by the keys rather than by us. */
for (const row of agents) {
  /* Their filings on projects this run did not clear. Reaching them at all
     took --with-their-rows, and without this the key on `results` would stop
     the account leaving anyway — see the note where `held` is built. */
  await db.prepare("DELETE FROM unit_updates WHERE coordinator_id = ?").run(row.id);
  await db.prepare("DELETE FROM incidents WHERE coordinator_id = ?").run(row.id);
  await db.prepare("DELETE FROM results WHERE coordinator_id = ?").run(row.id);
  await db.prepare("DELETE FROM coordinator_sessions WHERE coordinator_id = ?").run(row.id);
  await db.prepare("DELETE FROM coordinators WHERE id = ?").run(row.id);
}

console.log(`\nCleared. "${project.title}" holds nothing filed.`);
console.log("Command, Situations, Timeline and Booth now open empty.\n");
