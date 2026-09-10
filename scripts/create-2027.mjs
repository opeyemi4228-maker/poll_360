/**
 * Open the 2027 general election as a project.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A CLEAN SLATE IS A PROJECT, NOT A DELETION
 *
 *  "Start the dashboards empty for 2027" has two possible meanings and only
 *  one of them is safe. It could mean emptying the tables — which would
 *  destroy the 2023 replay every demonstration runs on, the Adamawa
 *  transcription, and the rehearsal uploads. Or it could mean opening a new
 *  project and switching to it, which is what this product's whole
 *  multi-project design exists for: every result, incident, ledger entry and
 *  polling unit is keyed to an election id, so a new project *is* an empty
 *  room, and yesterday's work is still there when somebody wants it.
 *
 *  This does the second. Nothing existing is touched.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE DATE IS A CLAIM, SO IT IS CHECKABLE ────────────────────────────────
 * `votesOn` is left for an operator to set rather than guessed at here. A
 * polling day written into a project by a script is a fact nobody chose and
 * everybody downstream trusts — the timeline dashboard measures phases against
 * it, and the alert rules read it. A date this file invented would be wrong
 * quietly. Pass one when you know it:
 *
 *   node --env-file=.env.local scripts/create-2027.mjs --votes-on 2027-02-20 --commit
 *
 * Without --commit it prints what it would do and writes nothing.
 *
 * Idempotent on the slug: run it twice and the second run reports the project
 * already exists rather than opening a second one. Two projects with the same
 * name is the failure mode that makes a room ask "which 2027 am I looking at".
 */

import { elections } from "../lib/elections.js";
import { sql } from "../lib/sql.js";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => {
  const at = args.indexOf(flag);
  return at === -1 ? null : (args[at + 1] ?? null);
};

const COMMIT = has("--commit");
const TITLE = value("--title") ?? "2027 Presidential Election";
const KIND = value("--kind") ?? "PRESIDENTIAL";
const VOTES_ON = value("--votes-on");

/* ── WHY THE DATE IS VALIDATED AND NOT MERELY PASSED THROUGH ───────────────
   `new Date("next tuesday")` is `Invalid Date`, which Postgres will refuse
   with an error nobody reads, or — worse, on a looser column — store as null
   and leave the timeline measuring against nothing. */
let votesOn = null;
if (VOTES_ON) {
  const parsed = new Date(`${VOTES_ON}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    console.error(`\n  "${VOTES_ON}" is not a date. Use YYYY-MM-DD.\n`);
    process.exit(1);
  }
  votesOn = parsed.toISOString();
}

const NOTE =
  "Opened for the 2027 general election. Every dashboard starts empty here: " +
  "results, incidents, coordinators and the ledger are all keyed to this " +
  "project, so nothing from an earlier election appears in it.";

async function main() {
  const existing = await sql`
    SELECT id, title, slug, status, votes_on
    FROM elections
    WHERE title ILIKE ${"%2027%"} OR slug LIKE ${"%2027%"}
  `;

  if (existing.length) {
    console.log("\n  A 2027 project already exists. Nothing to do.\n");
    for (const row of existing) {
      console.log(`    ${row.slug}`);
      console.log(`      ${row.title}`);
      console.log(`      ${row.status} · polling day ${row.votes_on ? String(row.votes_on).slice(0, 10) : "not set"}`);
    }
    console.log("");
    process.exit(0);
  }

  console.log("\n  Open a new project");
  console.log(`    title      ${TITLE}`);
  console.log(`    kind       ${KIND}`);
  console.log(`    polling day ${votesOn ? votesOn.slice(0, 10) : "not set — pass --votes-on YYYY-MM-DD"}`);
  console.log(`    scope      the whole federation`);

  if (!COMMIT) {
    console.log("\n  Dry run. Nothing was written. Add --commit to open it.\n");
    process.exit(0);
  }

  const project = await elections.create({
    title: TITLE,
    kind: KIND,
    votesOn,
    note: NOTE,
    createdBy: null,
    /* Empty: a presidential contest is fought everywhere, and an empty scope
       is what this product reads as "the whole federation". Naming all
       thirty-seven would be the same thing said worse — and it would then
       need maintaining. */
    scopeStates: [],
  });

  console.log(`\n  Opened ${project.slug} (${project.id})`);
  console.log("\n  Every dashboard in the situation room is now empty for this");
  console.log("  project. Switch to it with the project selector in the room.");
  if (!votesOn) {
    console.log("\n  No polling day is set. The election timeline measures its");
    console.log("  phases against one, so set it when the commission publishes it.");
  }
  console.log("");
  process.exit(0);
}

main().catch((error) => {
  console.error("\n  Failed:", error.message, "\n");
  process.exit(1);
});
