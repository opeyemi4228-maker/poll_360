/**
 * Create the off-cycle governorship project and load its declared results.
 *
 * ── WHY THESE GO IN AS "DECLARED" AND NOT AS RESULTS ───────────────────────
 * A result in this product is something we counted: a return from a booth
 * with an agent's name on it. These are the commission's own figures. Filing
 * them as results would make the product agree with itself by construction,
 * which is precisely the failure a parallel count exists to avoid. They go
 * into the declared table, where they are the thing our count is held
 * against, and the divergence room can do its job the moment real returns
 * arrive.
 *
 *   node --env-file=.env.local scripts/seed-offcycle.mjs [--commit]
 */

import { elections } from "../lib/elections.js";
import { declared } from "../lib/db.js";
import { OFF_CYCLE, NOT_LOADED, coverage } from "../lib/offcycle.js";

const commit = process.argv.includes("--commit");
const span0 = coverage();
const TITLE = `Off-cycle governorships, ${span0.fromYear} to ${span0.toYear}`;

const span = span0;
console.log(`${span.states} contests loaded, window ${span.from} to ${span.to}`);
console.log(`${span.missing} in the window and not loaded: ${NOT_LOADED.map((r) => r.state).join(", ")}`);

if (!commit) {
  for (const row of OFF_CYCLE) {
    const total = Object.values(row.votes).reduce((a, b) => a + b, 0);
    console.log(
      `  ${row.state.padEnd(9)} ${row.votesOn}  ${row.winner.padEnd(5)} ` +
        `${total.toLocaleString().padStart(9)} votes${row.unverified ? "   [unverified]" : ""}`
    );
  }
  console.log("\nNothing written. Re-run with --commit.");
  process.exit(0);
}

/* One project, found by title rather than created blindly, so running this
   twice does not leave two of them. */
const existing = (await elections.list()).find((row) => row.title === TITLE);

const project =
  existing ??
  (await elections.create({
    title: TITLE,
    kind: "GOVERNORSHIP",
    /* Polling day is the most recent of them: the project spans several, and
       a single date field has to mean something, so it means "as at". */
    votesOn: new Date(`${span.lastLoaded}T00:00:00Z`),
    note:
      "Declared state-level results for Nigeria's off-cycle governorship elections. " +
      "Transcribed from INEC declarations, not a live feed. Verify before broadcast. " +
      `Not loaded: ${NOT_LOADED.map((r) => `${r.state} (${r.votesOn})`).join(", ")}.`,
    scopeStates: OFF_CYCLE.map((row) => row.code),
  }));

console.log(`${existing ? "Using existing" : "Created"} project ${project.id}`);

/* `declared.save` takes a batch, and takes it in the shape its own uploader
   speaks: `key` rather than `placeKey`, `total` alongside `statedTotal`. The
   whole set goes in one call, which also means one round trip rather than six
   over a link that charges for each. */
const rows = OFF_CYCLE.map((row) => {
  const total = Object.values(row.votes).reduce((a, b) => a + b, 0);
  return {
    level: "STATE",
    key: row.code,
    stateNumber: row.code,
    votes: row.votes,
    total,
    statedTotal: total,
    /* Accreditation and rejected ballots are published per state and I do not
       hold them reliably, so they are left null rather than guessed. A null
       reads as "not loaded" everywhere; a zero would read as a fact. */
    registered: null,
    accredited: null,
    rejected: null,
    note:
      `${row.candidate} (${row.winner}) declared winner, ${row.votesOn}.` +
      (row.unverified ? " Totals not independently verified." : ""),
  };
});

const written = await declared.save({
  electionId: project.id,
  rows,
  enteredBy: null,
  source: "INEC declaration, transcribed",
});

console.log(`${typeof written === "number" ? written : rows.length} declared state results written`);
console.log("\nLocal government figures were NOT written, because they were not available.");
console.log("Load them with the importer when you have them, from IReV or a published tally.");
