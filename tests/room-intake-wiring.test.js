import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The two connections into the situation room, pinned.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A DOOR THAT IS BUILT AND NOT HUNG MAKES NO NOISE
 *
 *  `lib/intake.js` — the read back from Data Bank — was written, commented,
 *  and imported by nothing. Every function in it worked. No screen called one.
 *  The room therefore showed every situation report filed *to Poll360* and
 *  none of the ones that reached the hub by another road, and there was no
 *  symptom: no error, no empty panel, no log line. The feature simply was not
 *  there, and the file said it was.
 *
 *  `unit_updates` was the same shape of failure in the other direction. Agents
 *  wrote to it all day; only the agents' own screens read it back. The room's
 *  timeline inferred its phases from incidents instead.
 *
 *  Nothing in this repository would have caught either. The build does not —
 *  an import nobody uses is valid, and a table nobody selects from is valid.
 *  No test reaches the room page, because node's runner has no DOM, no path
 *  aliases and no database. So this reads the source, the same way
 *  tests/call-sites.test.js and tests/databank-contract.test.js do, and for
 *  the same reason: it is crude, and it is the only check available.
 * ══════════════════════════════════════════════════════════════════════════
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const ROOM = read("../app/room/page.jsx");
const SHELL = read("../components/dash/SituationRoom.jsx");
const SITUATIONS = read("../components/dash/RoomSituations.jsx");
const TIMELINE = read("../lib/timeline.js");
const INTAKE = read("../lib/intake.js");
const DB = read("../lib/db.js");

describe("Data Bank's reports reach the room", () => {
  it("the room page reads the hub, not only its own incidents", () => {
    assert.match(ROOM, /from "@\/lib\/intake"/, "the room does not import the intake door");
    assert.match(ROOM, /situationsFor\s*\(/, "the room never calls situationsFor");
  });

  it("scopes the read to the booths the room already watches", () => {
    /* ── THE PROPERTY THIS GUARDS IS NOT COSMETIC ───────────────────────
       `situationsFor([])` returns nothing rather than everything, on purpose:
       a reader that answered an empty scope with the whole federation would
       quietly widen every narrowed room. A room holding one senatorial
       district must not learn what happened in Kano from this panel. So the
       call has to pass codes, and they have to be the room's own. */
    assert.match(ROOM, /situationsFor\(watchedCodes\)/);
    assert.match(ROOM, /const watchedCodes\s*=/);
    assert.match(
      ROOM,
      /coordinators\.map\(\(person\) => person\.unitCode\)/,
      "the watched list is not built from this room's coordinators"
    );
  });

  it("hands the hub's rows to the room, separately from our own", () => {
    assert.match(ROOM, /hubReports=\{hubReports\}/);
    assert.match(SHELL, /hubReports = null/, "the room shell does not accept them");
    assert.match(SHELL, /hubReports=\{hubReports\}/, "the shell does not pass them on");
    assert.match(SITUATIONS, /hubReports = null/, "the situations screen does not accept them");
  });

  it("never merges them into the incident feed", () => {
    /* ── WHY THIS IS WORTH A TEST ───────────────────────────────────────
       The hub's view carries no narrative and must not: it is a minimisation
       boundary. Concatenating the two lists would be the obvious tidy-up and
       would put narrative-less rows beside narrated ones, reading as data
       that failed to load. It would also be the moment somebody decided the
       fix was to pull narratives across the boundary. */
    assert.doesNotMatch(
      ROOM,
      /incidents:\s*\[\s*\.\.\.feed,\s*\.\.\.hubReports/,
      "the hub's rows have been merged into the incident feed"
    );
    assert.match(
      SITUATIONS,
      /<HubReports/,
      "the hub's rows are not drawn in their own lane"
    );
  });

  it("the intake door still refuses an empty scope", () => {
    assert.match(
      INTAKE,
      /export async function situationsFor\(codes = \[\][^)]*\)\s*\{\s*\n\s*if \(!codes\.length\) return nothing\(\);/,
      "situationsFor no longer refuses an empty scope"
    );
  });

  it("the intake door still never throws", () => {
    /* A situation room that goes blank because a second system has not been
       set up is worse than one that says so. */
    const body = INTAKE.slice(INTAKE.indexOf("export async function situationsFor"));
    assert.match(body.slice(0, 900), /catch \{\s*\n\s*return nothing\(\);/);
  });
});

describe("the agents' updates reach the timeline", () => {
  it("the store can be read from the room's side, not only the agent's", () => {
    assert.match(DB, /async recent\(electionId, territory = null/, "unitUpdates.recent is gone");
  });

  it("narrows updates the same way it narrows incidents", () => {
    /* An update names a booth. A room that may not read that booth's figures
       has no business reading its procedural record either. */
    const store = DB.slice(DB.indexOf("export const unitUpdates = {"));
    assert.match(store.slice(0, 3000), /within\(territory, "u\.unit_code"\)/);
  });

  it("the room page fetches them and hands them to the timeline", () => {
    assert.match(ROOM, /unitUpdates\.recent\(project\.id, territory\)/);
    assert.match(ROOM, /nightTimeline\(\{[^}]*updates: dayUpdates/);
  });

  it("fetches them in the one wait rather than adding a round trip", () => {
    /* The room re-runs this every twenty seconds on a wall. A ninth question
       asked in sequence is a ninth round trip on every refresh. */
    const block = ROOM.slice(ROOM.indexOf("] = await Promise.all(["), ROOM.indexOf("]);"));
    assert.match(block, /unitUpdates\.recent/, "the updates are fetched outside the shared wait");
  });

  it("the timeline accepts updates and uses them to time a phase", () => {
    assert.match(TIMELINE, /updates = \[\]/, "nightTimeline does not accept updates");
    assert.match(TIMELINE, /opened: earliest\(\[firstStep\.polls_open, firstIncident\]\)/);
    assert.match(TIMELINE, /deploy: earliest\(\[firstStep\.arrival, firstSeen\]\)/);
  });

  it("keeps the older inference underneath rather than replacing it", () => {
    /* A deployment running without the agents' app must draw exactly what it
       drew before. `earliest` ignores nulls, which is what makes that true. */
    assert.match(TIMELINE, /firstIncident/, "the fallback to the first report has been removed");
    assert.match(TIMELINE, /firstSeen/, "the fallback to the first sign-in has been removed");
  });

  it("the step vocabulary is read from one place, not spelled out twice", () => {
    /* A step renamed in lib/agent-day.js and not here would silently stop
       timing its phase — the button would still work and the timeline would
       quietly go back to guessing. */
    assert.match(TIMELINE, /import \{ UPDATE_STEPS \} from "\.\/agent-day\.js"/);
  });
});

describe("the steps the timeline watches for are steps that exist", () => {
  it("every step named in STEP_PHASE is a real update step", async () => {
    /* ── THE FAILURE THIS CATCHES IS SILENT ─────────────────────────────
       `STEP_PHASE` keys are strings. A typo, or a step renamed in
       lib/agent-day.js, leaves a phase that can never be timed — and the
       timeline falls back to its older inference without complaining, so the
       screen looks plausible and is wrong. */
    const { UPDATE_STEPS } = await import("../lib/agent-day.js");
    const known = new Set(UPDATE_STEPS.map((step) => step.type));

    const table = TIMELINE.slice(
      TIMELINE.indexOf("const STEP_PHASE = {"),
      TIMELINE.indexOf("};", TIMELINE.indexOf("const STEP_PHASE = {"))
    );
    const named = [...table.matchAll(/^\s*(\w+):/gm)].map((match) => match[1]);

    assert.ok(named.length >= 3, "STEP_PHASE looks empty");
    for (const step of named) {
      assert.ok(known.has(step), `STEP_PHASE names "${step}", which is not an update step`);
    }
  });

  it("every phase STEP_PHASE points at is a real phase", async () => {
    const { PHASES } = await import("../lib/timeline.js");
    const ids = new Set(PHASES.map((phase) => phase.id));

    const table = TIMELINE.slice(
      TIMELINE.indexOf("const STEP_PHASE = {"),
      TIMELINE.indexOf("};", TIMELINE.indexOf("const STEP_PHASE = {"))
    );
    const targets = [...table.matchAll(/:\s*"(\w+)"/g)].map((match) => match[1]);

    for (const phase of targets) {
      assert.ok(ids.has(phase), `STEP_PHASE points at "${phase}", which is not a phase`);
    }
  });
});

describe("the room still says so when Data Bank is not there", () => {
  it("draws words rather than an empty panel", async () => {
    const hub = read("../components/dash/HubReports.jsx");
    assert.match(hub, /if \(!hubReports\?\.available\)/, "the disconnected state is not handled");
    assert.match(
      hub,
      /not reading Data Bank yet/,
      "the disconnected state does not say so in words"
    );
  });

  it("counts a disconnected hub as unknown, never as zero", () => {
    /* "No reports" and "not reading the hub" are different sentences, and the
       second must never be able to look like the first on a wall. */
    assert.match(
      SITUATIONS,
      /hubReports\?\.available \? \(hubReports\.rows\?\.length \?\? 0\) : null/
    );
  });
});
