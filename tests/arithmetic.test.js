import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { apportion, leaderOf, unitCount, wardCount } from "../lib/drill.js";
import { states2023, parties, others } from "../lib/election2023.js";
import { byZone, project, winCondition } from "../lib/forecast.js";

/**
 * The promises this codebase makes about its own arithmetic.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THESE AND NOT COVERAGE
 *
 *  Every file in this product carries a comment claiming something specific
 *  and checkable: that figures add up exactly at every level, that a
 *  projection with nothing set returns the declared result, that a share can
 *  never exceed 100%. Those claims are the product. A room trusts a number on
 *  a wall because somebody promised it was arrived at honestly.
 *
 *  An untested promise is a comment. These are the promises, executed.
 *
 *  They use node:test, so there is no test dependency to install, keep
 *  current or audit — which matters more than usual for software that has to
 *  build on somebody else's machine on the morning of an election.
 * ══════════════════════════════════════════════════════════════════════════
 */

const ALL = [...parties, others];
const sum = (values) => values.reduce((total, value) => total + value, 0);

describe("the declared 2023 table", () => {
  it("has 37 states and no missing figures", () => {
    assert.equal(states2023.length, 37);
    for (const state of states2023) {
      assert.ok(state.registered > 0, `${state.name} has no register`);
      assert.ok(state.booths > 0, `${state.name} has no polling units`);
      assert.equal(state.votes.length, ALL.length, `${state.name} is missing a party column`);
    }
  });

  it("has every state's party votes summing to its total", () => {
    for (const state of states2023) {
      assert.equal(
        sum(state.votes),
        state.total,
        `${state.name}: the parties do not add up to the total`
      );
    }
  });

  it("never reports more votes than registered voters", () => {
    /* The single check that catches a transcription slip most reliably, and
       the one whose failure would be visible on air. */
    for (const state of states2023) {
      assert.ok(
        state.total <= state.registered,
        `${state.name} reports ${state.total} votes from ${state.registered} registered`
      );
    }
  });
});

describe("apportionment", () => {
  /* The claim, from lib/drill.js and repeated on screen: "the numbers add up
     exactly at every step". Rounding a parent into children is exactly where
     that usually stops being true. */
  const parent = states2023.find((state) => state.code === "LAG");

  const children = apportion({
    names: Array.from({ length: 20 }, (_, index) => `LGA ${index + 1}`),
    votes: parent.votes,
    booths: parent.booths,
    registered: parent.registered,
    parentKey: parent.code,
  });

  it("returns exactly one row per name", () => {
    assert.equal(children.length, 20);
  });

  it("gives back the parent's votes exactly, party by party", () => {
    for (let index = 0; index < parent.votes.length; index += 1) {
      assert.equal(
        sum(children.map((child) => child.votes[index])),
        parent.votes[index],
        `party ${index} does not add back up`
      );
    }
  });

  it("gives back the parent's booths and register exactly", () => {
    assert.equal(sum(children.map((child) => child.booths)), parent.booths);
    assert.equal(sum(children.map((child) => child.registered)), parent.registered);
  });

  it("is deterministic, so the same place is the same size every time", () => {
    const again = apportion({
      names: Array.from({ length: 20 }, (_, index) => `LGA ${index + 1}`),
      votes: parent.votes,
      booths: parent.booths,
      registered: parent.registered,
      parentKey: parent.code,
    });
    assert.deepEqual(children, again);
  });

  it("never gives a child a negative or impossible figure", () => {
    for (const child of children) {
      assert.ok(child.booths >= 0, `${child.name} has negative booths`);
      assert.ok(child.registered >= 0, `${child.name} has a negative register`);
      assert.ok(child.turnout >= 0 && child.turnout <= 100, `${child.name} turnout is ${child.turnout}`);
      for (const votes of child.votes) assert.ok(votes >= 0);
    }
  });

  it("counts wards and units within the stated ranges", () => {
    for (const name of ["Ikeja", "Alimosho", "Aba North"]) {
      const wards = wardCount(name);
      assert.ok(wards >= 8 && wards <= 15, `${name} produced ${wards} wards`);
    }
    for (const key of ["LAG:Ikeja:Ward 01", "ABI:Aba North:Ward 03"]) {
      const units = unitCount(key);
      assert.ok(units >= 12 && units <= 29, `${key} produced ${units} units`);
    }
  });
});

describe("the projection", () => {
  /* The claim, from lib/forecast.js and printed on the analytics screen:
     "Every lever set back to nothing returns the real declared result
     exactly, so there is always a known true anchor one click away." */
  it("with nothing set, reproduces the declared result", () => {
    const projected = project({});
    assert.equal(projected.rows.length, states2023.length);

    for (const row of projected.rows) {
      const declared = states2023.find((state) => state.code === row.code);
      assert.equal(row.registered, declared.registered);
      assert.equal(row.booths, declared.booths);
      /* Turnout untouched to the precision it is stored at. */
      assert.ok(
        Math.abs(row.modelledTurnout - declared.turnout) < 1e-9,
        `${row.name} turnout drifted with every lever off`
      );
    }
  });

  it("keeps shares summing to 100 after an arbitrary swing", () => {
    const projected = project({ swing: { APC: 12, LP: -7, PDP: 3 } });
    for (const row of projected.rows) {
      const total = sum(row.shares) + row.othersShare;
      assert.ok(
        Math.abs(total - 100) < 1e-6,
        `${row.name}: shares sum to ${total}, not 100`
      );
    }
  });

  it("never produces a share above 100 or below 0", () => {
    for (const swing of [{ APC: 90 }, { LP: -90 }, { PDP: 45, NNPP: 45 }]) {
      for (const row of project({ swing }).rows) {
        for (const share of row.shares) {
          assert.ok(share >= 0 && share <= 100, `${row.name}: share of ${share}`);
        }
      }
    }
  });
});

describe("the win condition", () => {
  it("applies the two-thirds spread test to a national contest", () => {
    const outcome = winCondition(project({}));
    const leader = outcome[0];
    assert.equal(leader.spreadApplies, true);
    /* 2023 as declared: the winner cleared a quarter in more than 24 states,
       so the result stood without a run-off. */
    assert.ok(leader.quarterStates >= 24, `leader cleared only ${leader.quarterStates} states`);
    assert.equal(leader.spreadPlain, true);
  });

  it("counts the quarter states out of 36, holding the FCT separately", () => {
    const outcome = winCondition(project({}));
    for (const party of outcome) {
      assert.ok(party.quarterStates <= 36, `${party.id} cleared ${party.quarterStates} of 36`);
      assert.equal(typeof party.quarterFct, "boolean");
    }
  });

  it("does not apply the spread test to a contest fought in one state", () => {
    /* Section 134 governs electing a President. Reporting a governorship as
       "1 of the 24 states required" is a rule that does not apply, reported
       as though it had been failed. */
    const outcome = winCondition(project({ scopeStates: ["EKI"] }));
    assert.equal(outcome[0].spreadApplies, false);
    assert.equal(outcome[0].shortBy, 0);
    assert.equal(outcome[0].spreadPlain, true);
  });
});

describe("scoping a contest", () => {
  it("projects only the states in the election", () => {
    const scoped = project({ scopeStates: ["EKI", "OND"] });
    assert.equal(scoped.rows.length, 2);
    assert.deepEqual(scoped.rows.map((row) => row.code).sort(), ["EKI", "OND"]);
    assert.equal(scoped.scoped, true);
  });

  it("treats an empty scope as the whole federation", () => {
    /* "No scope" and "national" are the same fact, and the project record
       already stores them the same way. */
    assert.equal(project({ scopeStates: [] }).rows.length, 37);
    assert.equal(project({ scopeStates: null }).rows.length, 37);
    assert.equal(project({}).scoped, false);
  });

  it("drops zones with nobody voting in them", () => {
    /* An empty zone row reads as a zone that has not reported, which on
       election night means something entirely different. */
    assert.equal(byZone(project({ scopeStates: ["EKI"] })).length, 1);
    assert.equal(byZone(project({})).length, 6);
    for (const zone of byZone(project({ scopeStates: ["LAG", "OGU"] }))) {
      assert.ok(zone.states > 0, `${zone.zone} has no states in it`);
    }
  });
});

describe("leaderOf", () => {
  it("returns null when nothing has been cast", () => {
    assert.equal(leaderOf([0, 0, 0, 0, 0]), null);
  });

  it("picks the largest of the four parties", () => {
    assert.equal(leaderOf([10, 90, 20, 5, 0]), 1);
  });
});
