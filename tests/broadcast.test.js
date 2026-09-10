import assert from "node:assert/strict";
import { test } from "node:test";

import {
  byState,
  clearance,
  deskLoad,
  inScope,
  mayMove,
  reportingTrends,
  rollUp,
  runningOrder,
  tickerLines,
} from "../lib/broadcast.js";

/**
 * The broadcast desk's arithmetic.
 *
 * Every figure tested here is one a presenter reads out loud or an editor
 * clears for air, which is exactly why it is checked by a test rather than by
 * looking at a dashboard: the failures that matter are the quiet ones — a
 * clearance that covers more booths than it was granted for, a share printed
 * without its coverage, a total that disagrees with the table above it.
 */

const MIN = 60 * 1000;

/** A return, with only the fields the arithmetic reads. */
const filed = (unitCode, votes, { status = "SUBMITTED", registered = 500, at = 0 } = {}) => ({
  unitCode,
  votes,
  status,
  registered,
  accredited: 0,
  source: "APP",
  submittedAt: new Date(at).toISOString(),
});

/* ────────────────────────────────────────────────────────────── scopes ──── */

test("a clearance covers exactly the ground it names", () => {
  assert.equal(inScope("20/03/04/001", "NATION"), true);
  assert.equal(inScope("20/03/04/001", null), true);

  assert.equal(inScope("20/03/04/001", "STATE:20"), true);
  assert.equal(inScope("21/03/04/001", "STATE:20"), false);

  assert.equal(inScope("20/03/04/001", "LGA:20/03"), true);
  assert.equal(inScope("20/04/04/001", "LGA:20/03"), false);
});

test("an unrecognised scope clears nothing rather than everything", () => {
  /* The safe direction to be wrong in. A scope this product does not
     understand must not be read as "the whole country may go out". */
  assert.equal(inScope("20/03/04/001", "WARD:20/03/04"), false);
  assert.equal(inScope("20/03/04/001", "SENATORIAL:20/kaduna-central"), false);
  assert.equal(inScope("not a code", "STATE:20"), false);
});

/* ────────────────────────────────────────────────────────── the funnel ──── */

test("each stage of the funnel is a subset of the one above it", () => {
  const rows = [
    filed("20/03/04/001", { APC: 100 }, { status: "VERIFIED" }),
    filed("20/03/04/002", { APC: 90 }, { status: "VERIFIED" }),
    filed("20/03/04/003", { PDP: 80 }),
    filed("21/01/01/001", { PDP: 70 }),
  ];

  const pipeline = clearance({
    rows,
    clearances: [{ id: "a", scope: "STATE:20", state: "CLEARED", payload: { returns: 3 } }],
    expected: 10,
  });

  const [received, verified, cleared, air] = pipeline.stages.map((stage) => stage.count);
  assert.equal(received, 4);
  assert.equal(verified, 2);
  assert.equal(cleared, 3, "the Kano clearance covers its three booths and not the fourth");
  assert.equal(air, 0, "cleared is not on air");
});

test("a clearance waiting on an editor is not a permission", () => {
  const rows = [filed("20/03/04/001", { APC: 10 })];
  const pipeline = clearance({
    rows,
    clearances: [{ id: "a", scope: "NATION", state: "REVIEW" }],
  });
  assert.equal(pipeline.stages.find((stage) => stage.id === "cleared").count, 0);
});

test("overlapping clearances are not added together", () => {
  /* A national clearance and a state one both cover the state's returns.
     Summing them would report more booths on air than exist, which is the
     shape of bug that puts "112%" on a wall. */
  const rows = [
    filed("20/03/04/001", { APC: 10 }),
    filed("20/03/04/002", { APC: 10 }),
    filed("21/01/01/001", { PDP: 10 }),
  ];

  const pipeline = clearance({
    rows,
    clearances: [
      { id: "a", scope: "NATION", state: "ON_AIR" },
      { id: "b", scope: "STATE:20", state: "ON_AIR" },
    ],
  });

  assert.equal(pipeline.stages.find((stage) => stage.id === "air").count, 3);
});

test("a clearance records what it was granted at, and the desk can see it has moved", () => {
  const rows = [
    filed("20/03/04/001", { APC: 10 }),
    filed("20/03/04/002", { APC: 10 }),
    filed("20/03/04/003", { APC: 10 }),
  ];

  const pipeline = clearance({
    rows,
    clearances: [{ id: "a", scope: "STATE:20", state: "CLEARED", payload: { returns: 1 } }],
  });

  const row = pipeline.clearances[0];
  assert.equal(row.returnsThen, 1);
  assert.equal(row.returnsNow, 3, "two returns have arrived since it was passed");
});

/* ─────────────────────────────────────────────────────── rolling up ────── */

test("a state with no booth count gets no percentage rather than a wrong one", () => {
  const places = byState({
    rows: [filed("20/03/04/001", { APC: 10 })],
    booths: {},
  });

  assert.equal(places.length, 1);
  assert.equal(places[0].reporting, null, "no denominator, no percentage");
});

test("shares are computed over the votes actually in", () => {
  const places = byState({
    rows: [
      filed("20/03/04/001", { APC: 60, PDP: 40 }),
      filed("20/03/04/002", { APC: 40, PDP: 60 }),
    ],
    booths: { 20: 4 },
  });

  const kano = places[0];
  assert.equal(kano.filed, 2);
  assert.equal(kano.cast, 200);
  assert.equal(kano.reporting, 50);
  assert.equal(kano.parties[0].share, 50);
});

test("the total is the states added up, so it cannot disagree with the table", () => {
  const places = byState({
    rows: [
      filed("20/03/04/001", { APC: 100 }, { registered: 400 }),
      filed("21/01/01/001", { PDP: 100 }, { registered: 600 }),
    ],
    booths: { 20: 2, 21: 2 },
  });

  const all = rollUp(places);
  assert.equal(all.filed, 2);
  assert.equal(all.cast, 200);
  assert.equal(all.expected, 4);
  assert.equal(all.reporting, 50);
  assert.equal(all.turnout, 20, "200 votes against a register of 1,000");
});

/* ──────────────────────────────────────────────────────── the ticker ────── */

test("a generated result line always carries its coverage", () => {
  const places = byState({
    rows: [
      filed("20/03/04/001", { APC: 60, PDP: 40 }),
      filed("20/03/04/002", { APC: 40, PDP: 60 }),
    ],
    booths: { 20: 4 },
  });

  const lines = tickerLines({ places, national: rollUp(places, "Nigeria") });
  const result = lines.find((line) => line.band === "RESULT");

  assert.ok(result, "a place with two parties in earns a result line");
  assert.match(result.text, /50% IN/, "the coverage rides on the line itself");
  assert.match(result.text, /APC/);
});

test("a place with no returns generates no line at all", () => {
  const lines = tickerLines({ places: [], national: null });
  assert.equal(lines.length, 0);
});

test("an incident line says a report exists and never that something happened", () => {
  const lines = tickerLines({
    places: [],
    incidents: [{ id: "i1", unitCode: "20/03/07/012" }],
  });

  const line = lines.find((row) => row.band === "INCIDENT");
  assert.ok(line);
  assert.match(line.text, /REPORTED/);
  assert.match(line.text, /VERIFICATION UNDERWAY/);
  assert.match(line.text, /WARD 7/);
});

/* ───────────────────────────────────────────────────────────── trends ───── */

test("rankings are by share of a place's own booths, not by raw count", () => {
  /* Lagos will always file more returns than Bayelsa because it has more
     booths. Ranked on the count, "fastest reporting" just re-lists the biggest
     states every night. */
  const places = byState({
    rows: [
      filed("25/01/01/001", { APC: 1 }),
      filed("25/01/01/002", { APC: 1 }),
      filed("06/01/01/001", { APC: 1 }),
    ],
    booths: { 25: 100, 6: 2 },
  });

  const trends = reportingTrends({ places, rows: [] });
  assert.equal(trends.fastest[0].number, "06", "one of two beats two of a hundred");
});

test("a state that has not started is not ranked as slow", () => {
  const places = [
    { number: "20", name: "Kano", filed: 0, expected: 100, reporting: 0, parties: [], cast: 0, turnout: null, votes: {}, verified: 0 },
    { number: "21", name: "Katsina", filed: 5, expected: 100, reporting: 5, parties: [], cast: 0, turnout: null, votes: {}, verified: 0 },
  ];

  const trends = reportingTrends({ places, rows: [] });
  assert.deepEqual(
    trends.slowest.map((row) => row.number),
    ["21"],
    "silence is not a low score"
  );
});

test("movement is counted inside the window and nowhere else", () => {
  const now = 10 * 60 * MIN;
  const places = byState({
    rows: [filed("20/03/04/001", { APC: 1 })],
    booths: { 20: 10 },
  });

  const rows = [
    filed("20/03/04/001", { APC: 1 }, { at: now - 5 * MIN }),
    filed("20/03/04/002", { APC: 1 }, { at: now - 400 * MIN }),
  ];

  const trends = reportingTrends({ places, rows, now, windowMinutes: 60 });
  assert.equal(trends.surging[0].moved, 1);
});

/* ────────────────────────────────────────────────── the running order ───── */

test("what is on air is what somebody put on air, not what the clock says", () => {
  const now = 12 * 60 * MIN;
  const items = [
    {
      id: "a",
      kind: "PROGRAMME",
      state: "OFF_AIR",
      title: "Morning coverage",
      scheduledFor: new Date(now - 120 * MIN),
    },
    {
      id: "b",
      kind: "PROGRAMME",
      state: "ON_AIR",
      title: "Results watch",
      scheduledFor: new Date(now - 30 * MIN),
    },
    {
      id: "c",
      kind: "PROGRAMME",
      state: "CLEARED",
      title: "Results special",
      scheduledFor: new Date(now + 30 * MIN),
    },
  ];

  const order = runningOrder(items, now);
  assert.equal(order.now.id, "b");
  assert.equal(order.next.id, "c");
  assert.equal(order.overdue.length, 0);
});

test("a slot past its start with nobody having taken it is reported as adrift", () => {
  const now = 12 * 60 * MIN;
  const items = [
    { id: "a", kind: "PROGRAMME", state: "ON_AIR", title: "Still running", scheduledFor: new Date(now - 90 * MIN) },
    { id: "b", kind: "PROGRAMME", state: "CLEARED", title: "Should have started", scheduledFor: new Date(now - 5 * MIN) },
  ];

  const order = runningOrder(items, now);
  assert.equal(order.overdue.length, 1);
  assert.equal(order.adrift, true);
});

/* ──────────────────────────────────────────────────────── the journey ───── */

test("the state machine allows only the moves the desk draws", () => {
  assert.equal(mayMove("DRAFT", "REVIEW"), true);
  assert.equal(mayMove("REVIEW", "CLEARED"), true);
  assert.equal(mayMove("CLEARED", "ON_AIR"), true);
  assert.equal(mayMove("ON_AIR", "OFF_AIR"), true);

  /* The one that matters: nothing skips the editor. */
  assert.equal(mayMove("DRAFT", "ON_AIR"), false);
  assert.equal(mayMove("DRAFT", "CLEARED"), false);
  assert.equal(mayMove("REVIEW", "ON_AIR"), false);
  assert.equal(mayMove("OFF_AIR", "ON_AIR"), false);
});

test("the desk's load counts one definition of waiting on an editor", () => {
  const items = [
    { id: "a", kind: "TICKER", state: "REVIEW", createdAt: new Date(1) },
    { id: "b", kind: "TICKER", state: "ON_AIR", createdAt: new Date(2), airedAt: new Date(3) },
    { id: "c", kind: "BANNER", state: "DRAFT", createdAt: new Date(4) },
    { id: "d", kind: "BANNER", state: "REJECTED", createdAt: new Date(5) },
  ];

  const load = deskLoad(items);
  assert.equal(load.review.length, 1);
  assert.equal(load.onAir.length, 1);
  assert.equal(load.drafts.length, 1);
  assert.equal(load.rejected.length, 1);
  assert.equal(load.aired.length, 1);
  assert.equal(load.kinds.length, 2);
});
