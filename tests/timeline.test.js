import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nightTimeline, PHASES, SLOT_MINUTES } from "../lib/timeline.js";

/**
 * The night's clock, pinned.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  The whole argument of lib/timeline.js is that nothing on it is scheduled.
 *  A timeline that prints the timetable looks identical on the morning the
 *  lorries did not arrive, and that is the one morning anybody needs it.
 *
 *  So the tests that matter most here are the ones about absence: a phase
 *  nobody observed must have no time beside it, and a stretch where nothing
 *  happened must survive as empty buckets rather than being smoothed away.
 * ══════════════════════════════════════════════════════════════════════════
 */

const NOW = Date.UTC(2027, 1, 20, 20, 0, 0);
const ago = (minutes) => new Date(NOW - minutes * 60 * 1000);

const ret = (over = {}) => ({
  unitCode: "01/01/01/001",
  status: "SUBMITTED",
  submittedAt: ago(60),
  verifiedAt: null,
  ...over,
});

describe("a night nothing has happened in", () => {
  it("draws one bucket and no phases at all", () => {
    const line = nightTimeline({ now: NOW });
    assert.equal(line.slots.length, 1);
    assert.equal(line.slots[0].filed, 0);
    assert.ok(line.phases.every((phase) => phase.at === null));
    assert.equal(line.quietFor, null);
  });

  it("still says what each unobserved phase is waiting to see", () => {
    const line = nightTimeline({ now: NOW });
    for (const phase of line.phases) {
      assert.ok(phase.evidence, `${phase.id} does not say what it is waiting for`);
    }
    assert.equal(line.phases.length, PHASES.length);
  });
});

describe("the buckets", () => {
  it("runs to now rather than to the last thing that arrived", () => {
    /* Two hours of silence after the last return is the finding, and it has
       to survive as empty rows on the right of the chart. */
    const line = nightTimeline({ rows: [ret({ submittedAt: ago(180) })], now: NOW });

    const tail = line.slots.slice(-4);
    assert.ok(tail.every((slot) => slot.filed === 0));
    assert.equal(Math.round(line.quietFor), 180);
  });

  it("keeps an empty bucket in the middle rather than closing the gap", () => {
    const line = nightTimeline({
      rows: [
        ret({ unitCode: "01/01/01/001", submittedAt: ago(150) }),
        ret({ unitCode: "02/01/01/001", submittedAt: ago(20) }),
      ],
      now: NOW,
    });

    const filled = line.slots.filter((slot) => slot.filed > 0);
    assert.equal(filled.length, 2);
    assert.ok(line.slots.length > 2, "the gap between them was closed up");
  });

  it("aligns buckets to the half hour so two renders draw the same boundaries", () => {
    const a = nightTimeline({ rows: [ret()], now: NOW });
    const b = nightTimeline({ rows: [ret()], now: NOW + 60 * 1000 });
    assert.equal(a.slots.at(-1).at.getTime(), b.slots.at(-1).at.getTime());
    assert.equal(SLOT_MINUTES, 30);
  });

  it("counts reports at the top two severities apart from the rest", () => {
    const line = nightTimeline({
      rows: [ret()],
      incidents: [
        { id: "a", severity: "CRITICAL", createdAt: ago(60) },
        { id: "b", severity: "INFO", createdAt: ago(60) },
      ],
      now: NOW,
    });

    const busy = line.slots.find((slot) => slot.incidents > 0);
    assert.equal(busy.incidents, 2);
    assert.equal(busy.loud, 1);
  });

  it("names the states a bucket's returns came from", () => {
    const line = nightTimeline({
      rows: [
        ret({ unitCode: "01/01/01/001", submittedAt: ago(20) }),
        ret({ unitCode: "25/01/01/001", submittedAt: ago(20) }),
      ],
      now: NOW,
    });

    const busy = line.slots.find((slot) => slot.filed > 0);
    assert.equal(busy.states.length, 2);
    assert.ok(busy.states.every((name) => typeof name === "string" && name.length > 1));
  });
});

describe("the phases", () => {
  it("takes every time from something observed, never from the timetable", () => {
    const line = nightTimeline({
      rows: [ret({ submittedAt: ago(90), status: "VERIFIED", verifiedAt: ago(30) })],
      coordinators: [{ lastSeen: ago(600), seenAt: ago(500) }],
      incidents: [{ id: "a", severity: "INFO", createdAt: ago(400) }],
      now: NOW,
    });

    const at = Object.fromEntries(line.phases.map((phase) => [phase.id, phase.at]));
    assert.equal(at.deploy.getTime(), ago(600).getTime());
    assert.equal(at.located.getTime(), ago(500).getTime());
    assert.equal(at.opened.getTime(), ago(400).getTime());
    assert.equal(at.counting.getTime(), ago(90).getTime());
    assert.equal(at.verifying.getTime(), ago(30).getTime());
    assert.equal(at.latest.getTime(), ago(90).getTime());
  });

  it("leaves a phase blank when the thing that proves it never happened", () => {
    /* Returns arrived, but nobody signed in and no position was ever sent.
       Those two phases must stay empty rather than borrowing a nearby time. */
    const line = nightTimeline({ rows: [ret()], now: NOW });
    const at = Object.fromEntries(line.phases.map((phase) => [phase.id, phase.at]));

    assert.equal(at.deploy, null);
    assert.equal(at.located, null);
    assert.equal(at.opened, null);
    assert.ok(at.counting);
  });

  it("carries the timetable as context and never as an observation", () => {
    const line = nightTimeline({ now: NOW });
    const opened = line.phases.find((phase) => phase.id === "opened");
    assert.equal(opened.nominal, "08:30");
    assert.equal(opened.at, null);
  });

  it("finds the busiest half-hour and the moment volume began", () => {
    const rows = [
      /* One early return, then a burst. */
      ret({ unitCode: "01/01/01/001", submittedAt: ago(200) }),
      ...Array.from({ length: 8 }, (_, index) =>
        ret({ unitCode: `0${2 + index}/01/01/001`, submittedAt: ago(40) })
      ),
    ];

    const line = nightTimeline({ rows, now: NOW });
    const at = Object.fromEntries(line.phases.map((phase) => [phase.id, phase.at]));
    const peakSlot = line.slots.find((slot) => slot.filed === 8);

    assert.equal(at.peak.getTime(), peakSlot.at.getTime());
    /* The ramp is a quarter of the peak — two returns — so the lone early one
       does not count as volume arriving. */
    assert.equal(at.arriving.getTime(), peakSlot.at.getTime());
  });
});

describe("the moments", () => {
  it("names the first return out of each state exactly once", () => {
    const line = nightTimeline({
      rows: [
        ret({ unitCode: "01/01/01/001", submittedAt: ago(100) }),
        ret({ unitCode: "01/01/01/002", submittedAt: ago(90) }),
        ret({ unitCode: "25/01/01/001", submittedAt: ago(80) }),
      ],
      now: NOW,
    });

    const firsts = line.moments.filter((moment) => moment.kind === "first");
    assert.equal(firsts.length, 2);
    /* The first from that state, not the second. */
    const abia = firsts.find((moment) => moment.detail === "01/01/01/001");
    assert.ok(abia);
    assert.match(abia.headline, /^First return from /);
  });

  it("names every report at the top severity and nothing below it", () => {
    const line = nightTimeline({
      incidents: [
        { id: "a", severity: "CRITICAL", kind: "Agent obstructed", createdAt: ago(50), unitCode: "01/01/01/001" },
        { id: "b", severity: "SERIOUS", kind: "Materials late", createdAt: ago(40) },
      ],
      now: NOW,
    });

    const loud = line.moments.filter((moment) => moment.kind === "critical");
    assert.equal(loud.length, 1);
    assert.equal(loud[0].headline, "Agent obstructed");
  });

  it("reads newest first, the way a log is read during a night", () => {
    const line = nightTimeline({
      rows: [
        ret({ unitCode: "01/01/01/001", submittedAt: ago(100) }),
        ret({ unitCode: "25/01/01/001", submittedAt: ago(10) }),
      ],
      now: NOW,
    });

    const times = line.moments.map((moment) => new Date(moment.at).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => b - a));
  });
});

describe("the same phase, state by state", () => {
  /* ── THE CASE THIS EXISTS FOR ────────────────────────────────────────────
     Polls open at half past eight in some places and eleven in others. A
     national timeline shows the first of those and is silently wrong about
     the other thirty-six states, which is exactly the spread a room needs. */
  const day = Date.UTC(2027, 1, 20);
  const at = (h, m = 0) => new Date(day + h * 3600e3 + m * 60e3);

  const incidents = [
    { id: "a", unitCode: "25/07/04/019", createdAt: at(8, 5), severity: "INFO" },
    { id: "b", unitCode: "19/03/02/001", createdAt: at(9, 40), severity: "INFO" },
    { id: "c", unitCode: "01/01/01/001", createdAt: at(11, 12), severity: "INFO" },
  ];
  const rows = [
    { unitCode: "25/07/04/019", submittedAt: at(15), verifiedAt: at(16), status: "VERIFIED" },
    { unitCode: "19/03/02/001", submittedAt: at(16, 30) },
  ];

  const built = nightTimeline({ rows, incidents, coordinators: [], now: at(18).getTime() });
  const opened = built.phases.find((phase) => phase.id === "opened");

  it("lists every state, including the ones that have not got there", () => {
    /* A list that omitted the states still waiting would read as though they
       were not in the election, and "we have not seen this in Bayelsa" is the
       finding rather than an absence of one. */
    assert.equal(opened.byState.length, 37);
    assert.equal(opened.spread.seen, 3);
    assert.equal(opened.spread.waiting, 34);
  });

  it("puts the earliest first and the ones still waiting last", () => {
    const seen = opened.byState.filter((row) => row.at);
    for (let index = 1; index < seen.length; index += 1) {
      assert.ok(seen[index - 1].at.getTime() <= seen[index].at.getTime());
    }
    /* Nothing with a time may appear after something without one. */
    const firstBlank = opened.byState.findIndex((row) => !row.at);
    assert.ok(opened.byState.slice(firstBlank).every((row) => !row.at));
  });

  it("measures how far apart the first state and the last one were", () => {
    /* The whole point: not "polls opened at 08:05" but "three hours and seven
       minutes separate the first state from the last, and 34 have not got
       there". */
    assert.equal(opened.spread.first.name, "Nasarawa");
    assert.equal(opened.spread.last.name, "Abia");
    assert.equal(Math.round(opened.spread.minutes), 187);
  });

  it("agrees with the national figure about which state was first", () => {
    /* The national phase time and the top of its own per-state list are the
       same observation seen two ways. If they could differ, one of them is
       wrong and a reader has no way to tell which. */
    assert.equal(opened.at.getTime(), opened.spread.first.at.getTime());
  });

  it("gives every phase its own per-state list", () => {
    for (const phase of built.phases) {
      assert.equal(phase.byState.length, 37, `${phase.id} does not cover every state`);
      assert.ok(phase.spread, `${phase.id} has no spread`);
    }
  });

  it("finds each state's own busiest half-hour, not the country's", () => {
    /* A state's peak is a fact about that state. Kano's busiest half-hour is
       rarely the one the whole country was busiest in. */
    const peak = built.phases.find((phase) => phase.id === "peak");
    const kano = peak.byState.find((row) => row.name === "Kano");
    const nasarawa = peak.byState.find((row) => row.name === "Nasarawa");
    assert.ok(kano.at, "Kano filed and so has a peak");
    assert.ok(nasarawa.at, "Nasarawa filed and so has a peak");
    assert.notEqual(kano.at.getTime(), nasarawa.at.getTime());
  });

  it("says nothing about a state where nothing has happened", () => {
    const quiet = opened.byState.find((row) => row.name === "Bayelsa");
    assert.equal(quiet.at, null);
    assert.equal(quiet.figure, null);
  });
});
