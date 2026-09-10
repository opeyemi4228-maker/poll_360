import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  QUARTER,
  STATES_REQUIRED,
  spreadFor,
  spreadTable,
  statesFromView,
} from "../lib/spread.js";

/**
 * Section 134, held to the constitution rather than to a hunch.
 *
 * The spread test is the figure a campaign will act on at two in the morning,
 * and it is the one nobody can check by eye: "we are in 23 states" is not
 * verifiable from a board. So it is pinned here.
 */

/** A state where `mine` of `total` votes are ours and the rest are APC's. */
const state = (code, mine, total, { reported = true } = {}) => ({
  code,
  name: code,
  total,
  reported,
  byParty: { ADC: mine, APC: Math.max(0, total - mine) },
});

/** `n` states in which we clear a quarter comfortably. */
const clearing = (n, from = 0) =>
  Array.from({ length: n }, (_, i) => state(`S${from + i}`, 40, 100));

/** `n` states in which we do not. */
const missing = (n, from = 0) =>
  Array.from({ length: n }, (_, i) => state(`M${from + i}`, 10, 100));

describe("the thresholds", () => {
  it("asks for a quarter in two-thirds of the states", () => {
    /* Named constants rather than literals buried in a comparison, for the
       reason lib/alerts.js gives about its own lines: a threshold a test
       cannot pin is a threshold that drifts. */
    assert.equal(STATES_REQUIRED, 24);
    assert.equal(QUARTER, 25);
  });
});

describe("counting states at a quarter", () => {
  it("counts a state at exactly a quarter as cleared", () => {
    /* "not less than one-quarter" — 25.0% clears. An off-by-one here is a
       state, and a state can be the election. */
    const out = spreadFor({ states: [state("AB", 25, 100)], partyId: "ADC" });
    assert.equal(out.rows[0].quarter, true);
    assert.equal(out.quarterStates, 1);
  });

  it("counts a state a hair under as not cleared", () => {
    const out = spreadFor({ states: [state("AB", 2499, 10000)], partyId: "ADC" });
    assert.equal(out.rows[0].quarter, false);
    assert.equal(out.quarterStates, 0);
  });

  it("clears the spread test at 24 states and not at 23", () => {
    const at23 = spreadFor({ states: [...clearing(23), ...missing(13, 90)], partyId: "ADC" });
    assert.equal(at23.quarterStates, 23);
    assert.equal(at23.clearsSpread, false);
    assert.equal(at23.statesShort, 1);

    const at24 = spreadFor({ states: [...clearing(24), ...missing(12, 90)], partyId: "ADC" });
    assert.equal(at24.quarterStates, 24);
    assert.equal(at24.clearsSpread, true);
    assert.equal(at24.statesShort, 0, "never asks for a negative number of states");
  });
});

describe("a state nobody has reported from", () => {
  it("is not yet cleared rather than failed", () => {
    /* The distinction the whole night turns on. Told "failed" when the truth
       is "not in yet", a room rings the wrong people. */
    const out = spreadFor({
      states: [state("AB", 0, 0, { reported: false })],
      partyId: "ADC",
    });
    assert.equal(out.rows[0].quarter, null);
    assert.equal(out.quarterStates, 0);
    assert.equal(out.statesUndecided, 1);
  });

  it("is never offered as a near miss", () => {
    /* A state with nothing in it is unknown, not near. Offering it as a
       target sends somebody to the wrong place. */
    const out = spreadFor({
      states: [state("AB", 0, 0, { reported: false }), state("CD", 20, 100)],
      partyId: "ADC",
    });
    assert.deepEqual(
      out.nearest.map((row) => row.code),
      ["CD"]
    );
  });

  it("treats a reported state with no votes at all as undecided, not lost", () => {
    const out = spreadFor({ states: [{ code: "AB", name: "AB", total: 0, byParty: {} }], partyId: "ADC" });
    assert.equal(out.rows[0].quarter, null);
    assert.equal(out.rows[0].won, false, "nobody leads a state with no votes");
  });
});

describe("states won", () => {
  it("counts the places we actually lead, not the ones we cleared", () => {
    /* Clearing a quarter and leading are different facts. 40% can lose a
       state and 26% can win one, and a room that conflates them will report
       a majority it does not have. */
    const states = [
      { code: "A", name: "A", total: 100, byParty: { ADC: 40, APC: 60 } },
      { code: "B", name: "B", total: 100, byParty: { ADC: 26, APC: 25, PDP: 24 } },
    ];
    const out = spreadFor({ states, partyId: "ADC" });
    assert.equal(out.quarterStates, 2, "cleared a quarter in both");
    assert.equal(out.statesWon, 1, "led only one");
  });
});

describe("the national share", () => {
  it("is our votes over every valid vote counted", () => {
    const states = [
      { code: "A", name: "A", total: 1000, byParty: { ADC: 400, APC: 600 } },
      { code: "B", name: "B", total: 1000, byParty: { ADC: 200, APC: 800 } },
    ];
    const out = spreadFor({ states, partyId: "ADC" });
    assert.equal(out.votes, 600);
    assert.equal(out.totalVotes, 2000);
    assert.equal(out.share, 30);
  });

  it("is zero rather than a division by nothing before any vote lands", () => {
    const out = spreadFor({ states: [], partyId: "ADC" });
    assert.equal(out.share, 0);
    assert.equal(out.clearsSpread, false);
  });
});

describe("the Federal Capital Territory", () => {
  it("is reported on its own line as well as counted in the rows", () => {
    /* Because the two readings of the clause differ on what the FCT is, and a
       room should be able to see it either way rather than be handed one
       reading as though it were arithmetic. */
    const out = spreadFor({
      states: [...clearing(24), state("FC", 30, 100)],
      partyId: "ADC",
    });
    assert.equal(out.fct.quarter, true);
    assert.equal(out.fct.share, 30);
    assert.equal(out.quarterStates, 25, "the FCT is also counted among the rows");
  });

  it("is null when the territory has not been handed over", () => {
    const out = spreadFor({ states: clearing(3), partyId: "ADC" });
    assert.equal(out.fct, null);
  });
});

describe("the nearest misses", () => {
  it("ranks the closest first and offers at most five", () => {
    const states = [
      state("A", 24, 100),
      state("B", 10, 100),
      state("C", 20, 100),
      state("D", 5, 100),
      state("E", 15, 100),
      state("F", 1, 100),
    ];
    const out = spreadFor({ states, partyId: "ADC" });
    assert.deepEqual(
      out.nearest.map((row) => row.code),
      ["A", "C", "E", "B", "D"]
    );
    assert.equal(out.nearest.length, 5);
  });
});

describe("every party by the same arithmetic", () => {
  it("computes the table identically and ranks by votes", () => {
    /* The proof that our own figure was not computed specially. */
    const states = [
      { code: "A", name: "A", total: 100, byParty: { ADC: 30, APC: 50, PDP: 20 } },
      { code: "B", name: "B", total: 100, byParty: { ADC: 40, APC: 35, PDP: 25 } },
    ];
    const table = spreadTable({ states, ballot: [{ id: "ADC" }, { id: "APC" }, { id: "PDP" }] });
    assert.deepEqual(
      table.map((row) => row.partyId),
      ["APC", "ADC", "PDP"]
    );
    assert.equal(table.find((row) => row.partyId === "ADC").votes, 70);
    assert.equal(table.find((row) => row.partyId === "APC").votes, 85);
  });
});

describe("guarding the inputs", () => {
  it("returns nothing when no party was named", () => {
    assert.equal(spreadFor({ states: clearing(3) }), null);
  });
});

describe("reading the board's own rows", () => {
  const ballot = [{ id: "ADC" }, { id: "APC" }, { id: "OTH" }];
  const states = [
    { code: "AB", name: "Abia" },
    { code: "AD", name: "Adamawa" },
  ];

  it("turns positional vote arrays into votes by name", () => {
    const rows = statesFromView({
      byState: [{ code: "AB", reported: true, total: 100, votes: [30, 60, 10] }],
      states,
      ballot,
    });
    assert.deepEqual(rows[0].byParty, { ADC: 30, APC: 60, OTH: 10 });
    assert.equal(rows[0].name, "Abia");
  });

  it("gives an unreported state no votes rather than a row of zeros", () => {
    /* An array of zeros says "polled nothing"; the absence says "not in yet".
       The spread test reads the second as undecided and the first as failed,
       and a room told the wrong one rings the wrong people. */
    const rows = statesFromView({
      byState: [{ code: "AD", reported: false, total: 0 }],
      states,
      ballot,
    });
    assert.deepEqual(rows[0].byParty, {});
    assert.equal(rows[0].reported, false);

    const out = spreadFor({ states: rows, partyId: "ADC" });
    assert.equal(out.rows[0].quarter, null, "undecided, not failed");
  });

  it("feeds spreadFor end to end", () => {
    const rows = statesFromView({
      byState: [
        { code: "AB", reported: true, total: 100, votes: [30, 60, 10] },
        { code: "AD", reported: true, total: 100, votes: [20, 70, 10] },
      ],
      states,
      ballot,
    });
    const out = spreadFor({ states: rows, partyId: "ADC" });
    assert.equal(out.votes, 50);
    assert.equal(out.share, 25);
    assert.equal(out.quarterStates, 1, "cleared a quarter in Abia only");
    assert.equal(out.statesWon, 0);
  });
});
