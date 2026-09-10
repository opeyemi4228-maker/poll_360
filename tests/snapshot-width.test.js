import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addVotes, foldIndex } from "../lib/tally.js";

/**
 * Adding vote arrays up, pinned.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  This is the bug that turned the command dashboard into "VOTES COUNTED
 *  NaN" over four full-width bars. The accumulators were sized from the
 *  board's party list; the loop that filled them ran to the *event's* vote
 *  length. One event carrying more positions than the board named wrote past
 *  the end of the array, and `undefined + n` is NaN — which propagated into
 *  the national total, every state total, every share and every bar width.
 *
 *  It is worth a test of its own because of how it presented. A bar width of
 *  `NaN%` is discarded by the browser, the element falls back to `width:
 *  auto`, and a block element then fills its whole track. The failure did not
 *  look like an error. It looked like every party had won.
 * ══════════════════════════════════════════════════════════════════════════
 */

const tally = (width) => new Array(width).fill(0);

describe("an event wider than the ballot", () => {
  it("never writes past the end of the tally", () => {
    const into = tally(3);
    addVotes(into, [10, 8, 6, 4], -1);

    assert.equal(into.length, 3);
    assert.ok(into.every(Number.isFinite), `tally is ${into}`);
  });

  it("folds the unnamed position into the others bucket rather than dropping it", () => {
    /* Three named positions, the third of which is the bucket. The fourth
       figure has no party on this ballot, so it belongs with the other votes
       nobody named — not nowhere. */
    const into = tally(3);
    const { counted, unnamed } = addVotes(into, [10, 8, 6, 4], 2);

    assert.deepEqual(into, [10, 8, 10]);
    assert.equal(counted, 28);
    assert.equal(unnamed, 0);
  });

  it("reports a surplus it has nowhere to put, rather than counting it", () => {
    /* An unnamed figure added to the total would inflate every share computed
       against that total. A malformed board loses the surplus instead of
       distorting the figures that are right — and says how much. */
    const into = tally(2);
    const { counted, unnamed } = addVotes(into, [10, 8, 6], -1);

    assert.deepEqual(into, [10, 8]);
    assert.equal(counted, 18);
    assert.equal(unnamed, 6);
  });
});

describe("figures that are not figures", () => {
  it("skips a hole in the array instead of poisoning the tally", () => {
    const into = tally(4);
    const holes = [10, , 6, undefined];
    const { counted } = addVotes(into, holes, -1);

    assert.ok(into.every(Number.isFinite), `tally is ${into}`);
    assert.equal(counted, 16);
  });

  it("skips a NaN rather than spreading it", () => {
    const into = tally(3);
    addVotes(into, [10, NaN, 6], -1);

    assert.deepEqual(into, [10, 0, 6]);
  });
});

describe("the ordinary case is untouched", () => {
  it("adds an event that matches the ballot exactly", () => {
    const into = tally(3);
    const { counted, unnamed } = addVotes(into, [10, 8, 6], 2);

    assert.deepEqual(into, [10, 8, 6]);
    assert.equal(counted, 24);
    assert.equal(unnamed, 0);
  });

  it("accumulates across several events", () => {
    const into = tally(3);
    addVotes(into, [10, 8, 6], 2);
    addVotes(into, [1, 2, 3], 2);

    assert.deepEqual(into, [11, 10, 9]);
  });

  it("still counts a party the old hardcoded limit would have dropped", () => {
    /* The bug this replaced: a fixed `party < 5` silently lost a sixth. */
    const into = tally(6);
    addVotes(into, [1, 1, 1, 1, 1, 9], -1);

    assert.deepEqual(into, [1, 1, 1, 1, 1, 9]);
  });

  it("adds a short event without touching the positions it does not reach", () => {
    const into = tally(4);
    addVotes(into, [5, 5], -1);

    assert.deepEqual(into, [5, 5, 0, 0]);
  });
});

describe("finding the bucket", () => {
  it("names the others slot wherever it sits", () => {
    assert.equal(foldIndex([{ id: "ADC" }, { id: "OTH" }, { id: "APC" }]), 1);
  });

  it("returns -1 for a ballot with no bucket at all", () => {
    assert.equal(foldIndex([{ id: "ADC" }, { id: "APC" }]), -1);
  });

  it("survives a malformed slot rather than throwing", () => {
    assert.equal(foldIndex([null, undefined, { id: "OTH" }]), 2);
  });
});
