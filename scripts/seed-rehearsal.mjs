/**
 * Start an empty project to upload returns into.
 *
 * ── WHY A PROJECT AND NOT A SWITCH ─────────────────────────────────────────
 * The 2023 project holds 487 real returns and a replay of a finished election.
 * Uploading a rehearsal return into it would put an invented figure in the same
 * table as the record of an actual night, where nothing afterwards could tell
 * them apart. A project is the unit of separation this product already has:
 * everything operational carries an election id, so a new one starts empty
 * without a single row of the old one being touched or deleted.
 *
 * ── AND WHY IT IS EMPTY, DELIBERATELY ──────────────────────────────────────
 * Nothing is seeded into it. Not a plausible-looking starter return, not a
 * partially filled map. It is blank because nothing has been filed against it,
 * which is exactly what a project looks like an hour before polls close, and
 * the first thing anybody uploads is the first thing that appears.
 *
 * ── IT IS NAMED AS A REHEARSAL, ON PURPOSE ─────────────────────────────────
 * Every screen prints the project's title. Somebody walking past a wall display
 * has to be able to tell in one glance whether they are looking at a count or a
 * practice, and the only reliable way to guarantee that is for the practice to
 * say so in its own name.
 *
 *   node --env-file=.env.local scripts/seed-rehearsal.mjs [--commit] [--title "..."]
 */

import { elections } from "../lib/elections.js";
import { prepare } from "../lib/sql.js";
import { RACES } from "../lib/races.js";

const argv = process.argv.slice(2);
const commit = argv.includes("--commit");

const titleAt = argv.indexOf("--title");
const TITLE =
  titleAt !== -1 && argv[titleAt + 1]
    ? argv[titleAt + 1]
    : `Upload rehearsal ${new Date().getFullYear()}`;

const NOTE =
  "A rehearsal project. Nothing here came from a polling unit unless somebody uploaded it " +
  "through the filing screen, and nothing in it should ever be broadcast as a result. " +
  "It starts empty and fills only with what is filed against it.";

console.log(`Project:   ${TITLE}`);
console.log(`Positions: ${RACES.map((race) => race.label).join(", ")}`);
console.log("Scope:     the whole federation — every state can report");
console.log("Contents:  nothing. It fills from the filing screen and from nowhere else.\n");

if (!commit) {
  console.log("Nothing written. Re-run with --commit.");
  process.exit(0);
}

/* Found by title rather than created blindly, so running this twice does not
   leave two rehearsals nobody can tell apart. */
const existing = (await elections.list()).find((row) => row.title === TITLE);

const project =
  existing ??
  (await elections.create({
    title: TITLE,
    /* The headline contest of the day. Every position is filed into this one
       project; this is only what the day is named after, and what a screen
       opens on before anybody has chosen. */
    kind: "PRESIDENTIAL",
    votesOn: null,
    note: NOTE,
    /* Empty means the whole federation. A rehearsal that could only report
       from one state would be a rehearsal of a different election. */
    scopeStates: [],
  }));

console.log(`${existing ? "Using existing" : "Created"} project ${project.id}`);

/* Read back rather than assumed: the point of the project is that it is empty,
   and a script that says so without checking is a script that will one day say
   so about a project with returns in it. */
const held = await prepare(
  `SELECT
     (SELECT COUNT(*) FROM results   WHERE election_id = $1) AS results,
     (SELECT COUNT(*) FROM incidents WHERE election_id = $1) AS incidents,
     (SELECT COUNT(*) FROM declared  WHERE election_id = $1) AS declared`.replace(/\$1/g, "?")
).get(project.id, project.id, project.id);

console.log(
  `Holds ${held.results} returns, ${held.incidents} incidents, ${held.declared} declared figures.`
);
console.log("\nOpen any dashboard and pick it in the project switcher, top of the screen.");
console.log("Then file into it from /field. The map fills as returns land.");
