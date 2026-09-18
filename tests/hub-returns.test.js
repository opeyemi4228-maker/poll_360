import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hubReturns } from "../lib/hub-returns.js";

/**
 * Data Bank's figures, as returns the command board may count.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY TEST HERE IS A WRONG NATIONAL TOTAL THAT DID NOT HAPPEN
 *
 *  This is not a feed. A mistake in a feed shows a wrong row and somebody
 *  scrolls past it. A mistake here shows a wrong total, in the largest type on
 *  the screen, under a named candidate's photograph, on a dashboard whose
 *  whole claim is that its figures can be checked.
 *
 *  Four things would each produce one — the same return counted twice, a
 *  machine's guess counted as a vote, a figure the hub itself calls
 *  impossible, and a return from another contest — so each has its own case
 *  below, named for the failure rather than for the code.
 * ══════════════════════════════════════════════════════════════════════════
 */

const RACE = "PRESIDENTIAL";

/* A hub row as `intake.v_result_figures` returns one: snake_case, votes as a
   jsonb object keyed by party. */
const hubRow = (over = {}) => ({
  polling_unit_code: "25/01/02/001",
  race: RACE,
  registered_voters: 500,
  accredited_voters: 300,
  rejected_ballots: 4,
  valid_votes: 296,
  votes: { APC: 100, PDP: 90, LP: 70, NNPP: 36 },
  channel: "A",
  source: "API",
  impossible: false,
  balances: true,
  received_at: "2027-02-20T18:00:00.000Z",
  ...over,
});

const hub = (rows) => ({ available: true, rows });
const ourRow = (unitCode) => ({ unitCode, votes: { APC: 1 }, submittedAt: new Date() });

describe("the same return, counted twice", () => {
  it("never counts a booth this product already holds", () => {
    /* The normal case, not the edge: every return filed here is also relayed
       to the hub, so almost every hub row is a copy. */
    const out = hubReturns({
      ours: [ourRow("25/01/02/001")],
      hub: hub([hubRow()]),
      race: RACE,
    });

    assert.equal(out.added, 0);
    assert.equal(out.rows.length, 0);
    assert.equal(out.duplicate, 1);
  });

  it("counts a booth this product has no return for", () => {
    const out = hubReturns({
      ours: [ourRow("25/01/02/999")],
      hub: hub([hubRow()]),
      race: RACE,
    });

    assert.equal(out.added, 1);
    assert.equal(out.rows[0].unitCode, "25/01/02/001");
    assert.equal(out.duplicate, 0);
  });

  it("counts one booth once however many rows the hub holds for it", () => {
    const out = hubReturns({
      ours: [],
      hub: hub([
        hubRow({ received_at: "2027-02-20T18:00:00.000Z", votes: { APC: 10 } }),
        hubRow({ received_at: "2027-02-20T19:00:00.000Z", votes: { APC: 20 } }),
        hubRow({ received_at: "2027-02-20T17:00:00.000Z", votes: { APC: 5 } }),
      ]),
      race: RACE,
    });

    assert.equal(out.added, 1);
    /* The newest, on the hub's own receiving clock. */
    assert.equal(out.rows[0].votes.APC, 20);
  });
});

describe("a machine's guess, counted as a vote", () => {
  it("refuses a row with no votes object at all", () => {
    /* A photographed sheet read by a model is forwarded as RESULT_FIGURES too,
       carrying `figures` and `ballot` and no `votes`. It is a proposal, and
       nothing that comes out of a reader reaches the count until the agent
       standing in front of the sheet has confirmed it. */
    const out = hubReturns({ ours: [], hub: hub([hubRow({ votes: null })]), race: RACE });

    assert.equal(out.added, 0);
    assert.equal(out.readings, 1);
  });

  it("refuses a votes object that is an array rather than a map", () => {
    const out = hubReturns({ ours: [], hub: hub([hubRow({ votes: [1, 2, 3] })]), race: RACE });
    assert.equal(out.added, 0);
    assert.equal(out.readings, 1);
  });

  it("refuses a votes object holding nothing for any party on this paper", () => {
    /* Zero for every party would add nothing to the figures and one to the
       booth count — coverage this product did not earn. */
    const out = hubReturns({
      ours: [],
      hub: hub([hubRow({ votes: { SOMETHING_ELSE: 400 } })]),
      race: RACE,
    });

    assert.equal(out.added, 0);
    assert.equal(out.readings, 1);
  });
});

describe("a figure the hub itself says cannot be true", () => {
  it("does not count a row the hub marked impossible", () => {
    const out = hubReturns({ ours: [], hub: hub([hubRow({ impossible: true })]), race: RACE });
    assert.equal(out.added, 0);
    assert.equal(out.impossible, 1);
  });

  it("counts it under impossible rather than under readings", () => {
    /* The two refusals mean different things and a screen prints them
       differently: one is a machine being ignored, the other is arithmetic
       being refused. */
    const out = hubReturns({
      ours: [],
      hub: hub([hubRow({ impossible: true }), hubRow({ polling_unit_code: "25/01/02/002", votes: null })]),
      race: RACE,
    });

    assert.equal(out.impossible, 1);
    assert.equal(out.readings, 1);
  });
});

describe("a return from somewhere that is not a place", () => {
  it("does not count a booth code that names no state", () => {
    const out = hubReturns({
      ours: [],
      hub: hub([hubRow({ polling_unit_code: "99/01/02/001" })]),
      race: RACE,
    });

    assert.equal(out.added, 0);
  });

  it("does not count a row with no booth code", () => {
    const out = hubReturns({
      ours: [],
      hub: hub([hubRow({ polling_unit_code: null })]),
      race: RACE,
    });

    assert.equal(out.added, 0);
  });
});

describe("when the hub is not there", () => {
  it("adds nothing and says the hub was unavailable", () => {
    const out = hubReturns({ ours: [ourRow("25/01/02/001")], hub: null, race: RACE });
    assert.equal(out.available, false);
    assert.equal(out.added, 0);
    assert.deepEqual(out.rows, []);
  });

  it("adds nothing when the hub is reachable and holds nothing", () => {
    const out = hubReturns({ ours: [], hub: { available: true, rows: [] }, race: RACE });
    assert.equal(out.added, 0);
  });

  it("never throws on a row that is missing everything", () => {
    const out = hubReturns({ ours: [], hub: hub([{}, null, undefined]), race: RACE });
    assert.equal(out.added, 0);
  });
});

describe("the shape it hands to the board", () => {
  it("matches what results.counted returns, so the board cannot tell them apart", () => {
    const out = hubReturns({ ours: [], hub: hub([hubRow()]), race: RACE });
    const row = out.rows[0];

    assert.equal(row.unitCode, "25/01/02/001");
    assert.equal(row.registered, 500);
    assert.equal(row.accredited, 300);
    assert.deepEqual(row.votes, { APC: 100, PDP: 90, LP: 70, NNPP: 36 });
    assert.ok(row.submittedAt, "a row with no time cannot be placed on a timeline");
  });

  it("carries no invented position", () => {
    /* The view holds no coordinate. A booth drawn where this product guessed
       is worse than a booth with no dot at all. */
    const out = hubReturns({ ours: [], hub: hub([hubRow()]), race: RACE });
    assert.equal(out.rows[0].position, null);
  });

  it("marks the row as the hub's, and says which channel it came over", () => {
    const out = hubReturns({ ours: [], hub: hub([hubRow({ channel: "B" })]), race: RACE });
    assert.equal(out.rows[0].fromHub, true);
    assert.equal(out.rows[0].channel, "B");
    assert.deepEqual(out.byChannel, { B: 1 });
  });

  it("counts the channels separately so a screen can print the split", () => {
    const out = hubReturns({
      ours: [],
      hub: hub([
        hubRow({ polling_unit_code: "25/01/02/001", channel: "A" }),
        hubRow({ polling_unit_code: "25/01/02/002", channel: "B" }),
        hubRow({ polling_unit_code: "25/01/02/003", channel: "B" }),
      ]),
      race: RACE,
    });

    assert.equal(out.added, 3);
    assert.deepEqual(out.byChannel, { A: 1, B: 2 });
  });
});

describe("a negative or nonsense figure", () => {
  it("never lets a negative count reduce a total", () => {
    const out = hubReturns({
      ours: [],
      hub: hub([hubRow({ registered_voters: -500, accredited_voters: "nonsense" })]),
      race: RACE,
    });

    assert.equal(out.rows[0].registered, 0);
    assert.equal(out.rows[0].accredited, 0);
  });
});
