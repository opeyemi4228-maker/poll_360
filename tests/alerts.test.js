import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { raiseAlerts, watchBand, LEVELS, SEVERITY_ORDER, THRESHOLDS } from "../lib/alerts.js";

/**
 * The warning system, pinned.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  These sentences are read out loud in a room and then acted on. "47 booths
 *  in Kano have not reported" dispatches somebody; "the room is Critical"
 *  changes what a bulletin is allowed to say. Every one of them therefore has
 *  to be checkable here rather than by watching a dashboard on the night.
 *
 *  Two properties are load-bearing beyond any individual rule:
 *
 *    EVERY ALERT NAMES A NUMBER AND A PLACE. A rule that fires without one is
 *    a rule the room learns to scroll past, and once they scroll past one they
 *    scroll past all of them.
 *
 *    THE QUIET CASE IS STILL A ROW. An empty panel reads as "all clear" and as
 *    "this is broken" equally well, and at two in the morning people assume
 *    the second.
 * ══════════════════════════════════════════════════════════════════════════
 */

const NOW = Date.UTC(2027, 1, 20, 20, 0, 0);
const ago = (minutes) => new Date(NOW - minutes * 60 * 1000);

/** A pulse with nothing above any line in it. */
const calm = (over = {}) => ({
  filed: 100,
  verified: 100,
  awaiting: 0,
  assigned: 100,
  clocks: { quietMinutes: 2, verify: { counted: 100, p50: 8, p90: 20 } },
  silence: [],
  positions: { matched: 100, near: 0, far: 0, unmatched: 0, unknown: 0 },
  sheets: { audited: 100, balances: 100, fails: 0 },
  states: [],
  incidents: { total: 0, bySeverity: {} },
  ...over,
});

const find = (raised, id) => raised.alerts.find((row) => row.id === id);

describe("nothing wrong", () => {
  it("says so out loud rather than drawing an empty panel", () => {
    const raised = raiseAlerts({ pulse: calm(), now: NOW });
    assert.equal(raised.level, "NORMAL");
    assert.equal(raised.alerts.length, 1);
    assert.equal(raised.alerts[0].id, "normal");
    assert.match(raised.alerts[0].detail, /100 returns in/);
  });

  it("gives the quiet row nothing to acknowledge and nowhere to go", () => {
    const raised = raiseAlerts({ pulse: calm(), now: NOW });
    assert.equal(raised.alerts[0].goto, null);
    assert.equal(raised.alerts[0].act, null);
  });
});

describe("the level the room is in", () => {
  it("is the loudest rule that fired, and is computed exactly once", () => {
    const raised = raiseAlerts({
      pulse: calm({ incidents: { total: 1, bySeverity: { CRITICAL: 1 } } }),
      incidents: [{ id: "i1", severity: "CRITICAL", stateCode: "KAN" }],
      now: NOW,
    });

    assert.equal(raised.level, "CRITICAL");
    assert.equal(raised.level, raised.alerts[0].level);
  });

  it("ranks loudest first, then by size", () => {
    const raised = raiseAlerts({
      pulse: calm({
        awaiting: 400,
        incidents: { total: 3, bySeverity: { CRITICAL: 1, SERIOUS: 2 } },
      }),
      incidents: [
        { id: "i1", severity: "CRITICAL", stateCode: "KAN" },
        { id: "i2", severity: "SERIOUS", stateCode: "LAG" },
        { id: "i3", severity: "SERIOUS", stateCode: "LAG" },
      ],
      now: NOW,
    });

    const ranks = raised.alerts.map((row) => LEVELS[row.level].rank);
    assert.deepEqual(ranks, [...ranks].sort((a, b) => b - a));
  });
});

describe("the field", () => {
  it("raises the top severity above everything else", () => {
    const raised = raiseAlerts({
      pulse: calm({ incidents: { total: 4, bySeverity: { CRITICAL: 4 } } }),
      incidents: Array.from({ length: 4 }, (_, index) => ({
        id: `i${index}`,
        severity: "CRITICAL",
        stateCode: index < 3 ? "KAN" : "LAG",
      })),
      now: NOW,
    });

    const alert = find(raised, "incidents-critical");
    assert.equal(alert.level, "CRITICAL");
    assert.equal(alert.count, 4);
    assert.match(alert.headline, /4 reports at the top severity/);
    /* The place, not just the count. */
    assert.match(alert.detail, /KAN/);
    /* The field reports are one half of the alerts console now — see
       components/dash/RoomWatch.jsx — so the door on a report alert opens
       the screen it is already standing on, with the reports beside it. */
    assert.equal(alert.goto, "alerts");
  });

  it("notices several reports from one booth without calling it anything", () => {
    const incidents = Array.from({ length: THRESHOLDS.repeatReports }, (_, index) => ({
      id: `i${index}`,
      severity: "INFO",
      unitCode: "19/04/02/007",
      stateCode: "KAD",
    }));

    const raised = raiseAlerts({ pulse: calm(), incidents, now: NOW });
    const alert = find(raised, "incidents-repeat");

    assert.ok(alert);
    assert.match(alert.detail, /19\/04\/02\/007/);
    /* It suggests a check, never a conclusion. */
    assert.match(alert.act, /one situation or one sender/i);
  });

  it("leaves a booth alone below the repeat line", () => {
    const incidents = Array.from({ length: THRESHOLDS.repeatReports - 1 }, (_, index) => ({
      id: `i${index}`,
      severity: "INFO",
      unitCode: "19/04/02/007",
    }));
    const raised = raiseAlerts({ pulse: calm(), incidents, now: NOW });
    assert.equal(find(raised, "incidents-repeat"), undefined);
  });
});

describe("figures that cannot be true", () => {
  it("raises them without ever saying anybody falsified anything", () => {
    const raised = raiseAlerts({
      pulse: calm(),
      integrity: { impossible: 3, flagged: 9, screened: 400 },
      now: NOW,
    });

    const alert = find(raised, "integrity-impossible");
    assert.equal(alert.level, "CRITICAL");
    assert.match(alert.headline, /cannot be arithmetically true/);

    const words = `${alert.headline} ${alert.detail} ${alert.act}`.toLowerCase();
    for (const accusation of ["fraud", "rigg", "falsif", "cheat", "stole"]) {
      assert.ok(!words.includes(accusation), `alert says "${accusation}"`);
    }
  });

  it("counts unbalanced sheets against the ones that captured boxes", () => {
    const raised = raiseAlerts({
      pulse: calm({ sheets: { audited: 80, balances: 68, fails: 12 } }),
      now: NOW,
    });
    const alert = find(raised, "sheets-unbalanced");
    assert.equal(alert.count, 12);
    assert.match(alert.detail, /80/);
  });
});

describe("the count itself", () => {
  it("says a stalled count in minutes, and gets louder as it lengthens", () => {
    const brief = raiseAlerts({
      pulse: calm({ clocks: { quietMinutes: THRESHOLDS.stallMinutes + 1, verify: {} } }),
      now: NOW,
    });
    const long = raiseAlerts({
      pulse: calm({ clocks: { quietMinutes: THRESHOLDS.stallMinutes * 2 + 1, verify: {} } }),
      now: NOW,
    });

    assert.equal(find(brief, "count-stalled").level, "WARNING");
    assert.equal(find(long, "count-stalled").level, "SERIOUS");
  });

  it("says nothing about a count that has only just gone quiet", () => {
    const raised = raiseAlerts({
      pulse: calm({ clocks: { quietMinutes: THRESHOLDS.stallMinutes - 1, verify: {} } }),
      now: NOW,
    });
    assert.equal(find(raised, "count-stalled"), undefined);
  });

  it("never raises a stall on a night where nothing has arrived at all", () => {
    /* `quietMinutes` is null when no return has ever landed. "Nothing has
       arrived for null minutes" is the classic shape of this bug. */
    const raised = raiseAlerts({
      pulse: calm({ filed: 0, verified: 0, clocks: { quietMinutes: null, verify: {} } }),
      now: NOW,
    });
    assert.equal(find(raised, "count-stalled"), undefined);
  });

  it("names the state and the number of booths that have not reported", () => {
    const raised = raiseAlerts({
      pulse: calm({
        states: [
          { code: "KAN", name: "Kano", assigned: 500, filed: 453 },
          { code: "LAG", name: "Lagos", assigned: 500, filed: 498 },
        ],
      }),
      now: NOW,
    });

    const alert = find(raised, "silent-KAN");
    assert.equal(alert.count, 47);
    assert.equal(alert.headline, "47 booths in Kano have not reported");
    assert.equal(alert.goto, "coverage");
    /* Two short of the line, so Lagos is not on the list. */
    assert.equal(find(raised, "silent-LAG"), undefined);
  });
});

describe("the people", () => {
  it("separates somebody who stopped from somebody who never started", () => {
    const raised = raiseAlerts({
      pulse: calm({
        silence: [
          { id: "a", quietMinutes: THRESHOLDS.quietMinutes + 5 },
          { id: "b", quietMinutes: THRESHOLDS.quietMinutes + 90 },
          { id: "c", quietMinutes: null },
        ],
      }),
      now: NOW,
    });

    assert.equal(find(raised, "coordinators-stale").count, 2);
    assert.equal(find(raised, "coordinators-absent").count, 1);
    /* And they are not the same problem, so they do not share a door. */
    assert.match(find(raised, "coordinators-absent").act, /deployment failure/i);
  });

  it("says nothing about somebody quiet for less than the hour", () => {
    const raised = raiseAlerts({
      pulse: calm({ silence: [{ id: "a", quietMinutes: THRESHOLDS.quietMinutes - 1 }] }),
      now: NOW,
    });
    assert.equal(find(raised, "coordinators-stale"), undefined);
  });
});

describe("the desk", () => {
  it("raises a verification queue and quotes the median wait", () => {
    const raised = raiseAlerts({
      pulse: calm({
        awaiting: THRESHOLDS.awaitingBacklog + 3,
        clocks: { quietMinutes: 2, verify: { counted: 30, p50: 18, p90: 60 } },
      }),
      now: NOW,
    });
    const alert = find(raised, "verification-backlog");
    assert.match(alert.headline, /23 returns waiting/);
    assert.match(alert.detail, /18 minutes/);
  });

  it("tells a slow queue apart from returns that have stopped moving", () => {
    const raised = raiseAlerts({
      pulse: calm(),
      operations: {
        stuck: [
          { unitCode: "01/01/01/001", minutes: THRESHOLDS.stuckMinutes + 10, because: "Waiting for a desk" },
          { unitCode: "02/01/01/001", minutes: THRESHOLDS.stuckMinutes - 10, because: "Waiting for a desk" },
        ],
      },
      now: NOW,
    });

    const alert = find(raised, "pipeline-stuck");
    assert.equal(alert.count, 1);
    assert.match(alert.detail, /Waiting for a desk \(1\)/);
  });
});

describe("every alert", () => {
  const raised = raiseAlerts({
    pulse: calm({
      awaiting: 90,
      clocks: { quietMinutes: 200, verify: { counted: 4, p50: 30, p90: 90 } },
      silence: [{ id: "a", quietMinutes: 300 }, { id: "b", quietMinutes: null }],
      positions: { matched: 10, near: 2, far: 3, unmatched: 1, unknown: 0 },
      sheets: { audited: 20, balances: 18, fails: 2 },
      states: [{ code: "KAN", name: "Kano", assigned: 500, filed: 400 }],
      incidents: { total: 5, bySeverity: { CRITICAL: 2, SERIOUS: 3 } },
    }),
    integrity: { impossible: 1, flagged: 4, screened: 90 },
    operations: { withoutEvidence: 7, stuck: [] },
    incidents: [
      { id: "i1", severity: "CRITICAL", stateCode: "KAN", unitCode: "20/01/01/001" },
      { id: "i2", severity: "CRITICAL", stateCode: "KAN", unitCode: "20/01/01/001" },
      { id: "i3", severity: "SERIOUS", stateCode: "LAG" },
      { id: "i4", severity: "SERIOUS", stateCode: "LAG" },
      { id: "i5", severity: "SERIOUS", stateCode: "OYO" },
    ],
    now: NOW,
  });

  it("carries a number", () => {
    for (const alert of raised.alerts) {
      assert.ok(Number.isFinite(alert.count), `${alert.id} has no count`);
      assert.match(alert.headline, /\d/, `${alert.id} states no figure`);
    }
  });

  it("carries a level the room knows how to draw", () => {
    for (const alert of raised.alerts) {
      assert.ok(LEVELS[alert.level], `${alert.id} has level ${alert.level}`);
    }
  });

  it("ends in a door", () => {
    for (const alert of raised.alerts) {
      assert.ok(alert.goto, `${alert.id} cannot be opened`);
    }
  });

  it("has an id nothing else shares, so acknowledging one clears one", () => {
    const ids = raised.alerts.map((row) => row.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("counts itself the same way the header does", () => {
    const summed = Object.values(raised.counts).reduce((sum, value) => sum + value, 0);
    assert.equal(summed, raised.alerts.length);
  });
});

/**
 * The watch console's picture band.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS SUITE EXISTS BECAUSE THE SCREEN WENT DOWN
 *
 *  The band's arithmetic was written inside the component and it took the
 *  alerts console out twice on the evening it shipped: once by reading what
 *  `raiseAlerts` returns as an array — it is an object whose `alerts` key
 *  holds the rows — and once by reading a variable that had been renamed
 *  underneath it.
 *
 *  Neither could be caught by anything this repository runs. The build cannot
 *  see them; no test here renders a client component and none ever will
 *  without a DOM and a path-alias resolver. So the arithmetic moved into
 *  lib/alerts.js and these tests hold it to the shape the room actually hands
 *  it. The first test below is the outage, written down.
 * ══════════════════════════════════════════════════════════════════════════
 */
describe("the watch console's band", () => {
  it("takes what raiseAlerts actually returns, which is an object", () => {
    /* The outage, exactly: the room passes this value straight through, and
       anything that treats it as a list throws on the first render. */
    const raised = raiseAlerts({ pulse: calm(), now: NOW });
    assert.ok(!Array.isArray(raised), "raiseAlerts returns a report, not a list");
    assert.ok(Array.isArray(raised.alerts), "and the rows are under .alerts");

    const band = watchBand({ alerts: raised, incidents: [] });
    assert.equal(band.level, "NORMAL");
    assert.equal(band.raised, 0);
  });

  it("draws an empty room rather than throwing when it is handed nothing", () => {
    /* A caller that has not been updated, or a room before the first refresh.
       Every field a screen reads has to be present and safe. */
    const band = watchBand();
    assert.equal(band.raised, 0);
    assert.equal(band.states, 0);
    assert.equal(band.label, "Normal");
    assert.deepEqual(band.raisedRows, []);
    assert.equal(band.bySeverity.length, 3);
  });

  it("does not count Normal as a thing to look at", () => {
    /* A quiet room raises one row, and that row says everything is fine.
       Counting it would put a clear room at "1 thing to look at", which is
       the fastest way to teach people to ignore the figure. */
    const raised = raiseAlerts({ pulse: calm(), now: NOW });
    assert.equal(raised.alerts.length, 1);
    assert.equal(raised.alerts[0].level, "NORMAL");
    assert.equal(watchBand({ alerts: raised }).raisedRows.length, 0);
  });

  it("adds both halves of the console into the one figure the arc draws", () => {
    const incidents = [
      { severity: "CRITICAL", stateCode: "KAN" },
      { severity: "SERIOUS", stateCode: "KAN" },
      { severity: "INFO", stateCode: "LAG" },
    ];
    const raised = raiseAlerts({
      pulse: calm({ incidents: { total: 3, bySeverity: { CRITICAL: 1, SERIOUS: 1 } } }),
      incidents,
      now: NOW,
    });

    const band = watchBand({ alerts: raised, incidents });
    assert.equal(band.reports, 3);
    assert.equal(band.raised, band.raisedRows.length + 3);
    assert.equal(band.needSomebody, 2, "critical and serious, not the noted one");
  });

  it("colours a state by the worst thing in it and counts everything in it", () => {
    const incidents = [
      { severity: "INFO", stateCode: "KAN" },
      { severity: "CRITICAL", stateCode: "KAN" },
      { severity: "SERIOUS", stateCode: "LAG" },
    ];
    const band = watchBand({ alerts: null, incidents });

    assert.equal(band.byState.KAN.rank, 0, "critical outranks the noted one beside it");
    assert.equal(band.byState.KAN.count, 2, "and both are still counted");
    assert.equal(band.byState.LAG.rank, 1);
    assert.equal(band.states, 2);
  });

  it("leaves a state with nothing reported out altogether", () => {
    /* Absent, not zero. It is what lets the map leave it blank rather than
       drawing it as a low number — the rule every map in this product
       follows. */
    const band = watchBand({ incidents: [{ severity: "INFO", stateCode: "KAN" }] });
    assert.ok(!("LAG" in band.byState));
  });

  it("ignores a report with no state rather than inventing one for it", () => {
    const band = watchBand({ incidents: [{ severity: "CRITICAL" }, { severity: "INFO", stateCode: "KAN" }] });
    assert.equal(band.states, 1);
    /* Still counted in the totals: it happened, it just cannot be drawn. */
    assert.equal(band.reports, 2);
  });

  it("ranks every severity the console can be handed", () => {
    /* The rank is an index into SEVERITY_ORDER and the component colours by
       position, so a severity this file does not know would silently pick the
       loudest colour. Anything unrecognised is clamped to the quietest. */
    assert.deepEqual(SEVERITY_ORDER, ["CRITICAL", "SERIOUS", "INFO"]);
    const band = watchBand({ incidents: [{ severity: "GOSSIP", stateCode: "KAN" }] });
    assert.equal(band.byState.KAN.rank, 0);
  });
});
