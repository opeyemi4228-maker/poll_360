import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { alarming, divergenceOf, screenDivergence } from "../lib/divergence.js";

/**
 * Holding our count against the declared one.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  This is the reason anybody funds a parallel count, and it has exactly two
 *  ways to fail, both silent.
 *
 *  It can miss. A rule that stops firing means a room is told the declared
 *  figures agree with theirs when they do not, which is worse than having no
 *  parallel count at all — they would at least have known they did not know.
 *
 *  It can cry wolf. Two people copying the same handwritten sheet disagree by
 *  a digit sometimes, and a system that reports every one of those trains the
 *  room to close the panel by nine o'clock. Then the real one arrives at ten.
 *
 *  So these pin both edges: a misread digit must pass in silence, and a
 *  changed winner must always be found.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* Codes are SS/LL/WW/UUU, so a ward key is the first three parts. */
const unit = (code, votes, over = {}) => ({
  unitCode: code,
  registered: 800,
  accredited: 500,
  rejected: 5,
  votes,
  ...over,
});

/* Four units in one ward, agreeing among themselves. */
const ourWard = [
  unit("01/01/04/001", { APC: 200, PDP: 150, LP: 100, NNPP: 20, OTH: 5 }),
  unit("01/01/04/002", { APC: 190, PDP: 160, LP: 110, NNPP: 15, OTH: 5 }),
  unit("01/01/04/003", { APC: 210, PDP: 140, LP: 95, NNPP: 25, OTH: 5 }),
  unit("01/01/04/004", { APC: 180, PDP: 170, LP: 105, NNPP: 20, OTH: 5 }),
];

const ourTotals = { APC: 780, PDP: 620, LP: 410, NNPP: 80, OTH: 20 };

const declaredWard = (votes, over = {}) => [
  {
    level: "WARD",
    key: "01/01/04",
    votes,
    total: Object.values(votes).reduce((sum, value) => sum + value, 0),
    accredited: 2000,
    rejected: 20,
    ...over,
  },
];

const expected = new Map([["01/01/04", 4]]);

describe("when the two counts agree", () => {
  it("finds nothing at all", () => {
    const flags = screenDivergence(ourWard, declaredWard(ourTotals), expected);
    assert.deepEqual(flags, [], `agreement produced ${flags.length} findings`);
  });

  it("leaves a single misread digit alone", () => {
    /* A 3 read as an 8 moves a figure by five. Reporting that trains a room
       to stop reading the panel before the real finding arrives. */
    const nearly = { ...ourTotals, APC: ourTotals.APC + 5 };
    const flags = screenDivergence(ourWard, declaredWard(nearly), expected);
    assert.deepEqual(flags, [], "a five-vote transcription difference was reported");
  });

  it("still says how much it actually compared", () => {
    /* A ward held in full that agrees perfectly produces no finding, so the
       summary cannot count distinct keys among the findings — it would report
       "nothing checked" exactly when everything checked out. */
    const summary = divergenceOf(ourWard, declaredWard(ourTotals), expected);
    assert.ok(summary.compared >= 1, "a clean comparison was counted as nothing compared");
    assert.equal(summary.places, 0, "a clean comparison reported differing places");
  });
});

describe("when the two counts disagree", () => {
  it("finds a changed winner, which is the whole point", () => {
    /* Our booths put APC ahead. The declared figures for the same booths put
       PDP ahead. Two independently sourced counts of the same units naming
       different winners is the finding this system exists to produce. */
    const flipped = { APC: 620, PDP: 780, LP: 410, NNPP: 80, OTH: 20 };
    const flags = screenDivergence(ourWard, declaredWard(flipped), expected);

    const found = flags.find((flag) => flag.severity === "FLIPPED");
    assert.ok(found, `a changed winner was not found: ${flags.map((f) => f.severity).join(", ")}`);
    assert.ok(found.why?.length > 0, "the finding does not explain itself");
    assert.ok(alarming(flags).length > 0, "a changed winner did not raise the alarm");
  });

  it("finds figures that moved beyond transcription", () => {
    const moved = { ...ourTotals, APC: ourTotals.APC + 400 };
    const flags = screenDivergence(ourWard, declaredWard(moved), expected);
    assert.ok(
      flags.some((flag) => flag.severity === "DIVERGENT" || flag.severity === "FLIPPED"),
      "four hundred moved votes were not reported"
    );
  });

  it("finds a part that exceeds the whole", () => {
    /* We hold four of four units and our total is larger than the declared
       one for the same place. No coverage story explains that. */
    const smaller = { APC: 100, PDP: 90, LP: 50, NNPP: 10, OTH: 2 };
    const flags = screenDivergence(ourWard, declaredWard(smaller), expected);
    assert.ok(
      flags.some((flag) => flag.severity === "IMPOSSIBLE" || flag.severity === "DIVERGENT"),
      "our count exceeding the declared total was not reported"
    );
  });

  it("calls a place we hold nothing in a coverage gap, not a fault", () => {
    const flags = screenDivergence([], declaredWard(ourTotals), expected);
    const found = flags.find((flag) => flag.rule === "no-return");
    assert.ok(found, "a declared place we hold nothing in was not reported");
    assert.equal(found.severity, "UNMATCHED", "our own coverage gap was graded as a fault");
    assert.match(found.why, /coverage/i, "the gap was not described as ours");
    assert.equal(alarming(flags).length, 0, "a coverage gap raised the alarm");
  });
});

describe("the summary", () => {
  it("reports nothing to compare when nothing was declared", () => {
    const summary = divergenceOf(ourWard, [], new Map());
    assert.equal(summary.places, 0);
    assert.equal(summary.compared, 0);
  });

  it("never claims to have compared more places than were declared", () => {
    const summary = divergenceOf(ourWard, declaredWard(ourTotals), expected);
    assert.ok(summary.compared <= 1, `compared ${summary.compared} of 1 declared place`);
  });
});
