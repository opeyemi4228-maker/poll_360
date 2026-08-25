import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { states2023 } from "../lib/election2023.js";
import { GOVERNORS, DEFECTIONS, ruling, seatsBy } from "../lib/governors.js";
import { NOT_LOADED, OFF_CYCLE } from "../lib/offcycle.js";
import { ZONES } from "../lib/zones.js";

/**
 * Holding the hand-transcribed tables against each other.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE PRODUCT'S OWN DATA IS NOT EXEMPT FROM ITS OWN PRINCIPLE
 *
 *  This product exists because two independently sourced numbers held against
 *  each other catch things neither catches alone. Its reference tables were
 *  written at different times from different reporting, and they overlap: the
 *  governors table and the off-cycle results table both record when a state
 *  last elected a governor.
 *
 *  Nothing was checking that they agreed. They do not.
 * ══════════════════════════════════════════════════════════════════════════
 */

const CODES = new Set(states2023.map((state) => state.code));

describe("the reference tables", () => {
  it("uses state codes that exist, everywhere", () => {
    for (const row of GOVERNORS) {
      assert.ok(CODES.has(row.code), `GOVERNORS has unknown state ${row.code}`);
    }
    for (const row of [...OFF_CYCLE, ...NOT_LOADED]) {
      assert.ok(CODES.has(row.code), `off-cycle table has unknown state ${row.code}`);
    }
    for (const row of DEFECTIONS) {
      assert.ok(CODES.has(row.code), `DEFECTIONS has unknown state ${row.code}`);
    }
  });

  it("has a governor for all 36 states and none for the FCT", () => {
    assert.equal(GOVERNORS.length, 36);
    assert.ok(!GOVERNORS.some((row) => row.code === "FCT"), "the FCT has no governor");
  });

  it("places every state in exactly one zone", () => {
    const seen = new Map();
    for (const [zone, codes] of Object.entries(ZONES)) {
      for (const code of codes) {
        assert.ok(!seen.has(code), `${code} is in both ${seen.get(code)} and ${zone}`);
        seen.set(code, zone);
      }
    }
    for (const state of states2023) {
      assert.ok(seen.has(state.code), `${state.name} is in no zone`);
    }
  });

  it("dates every defection and gives it a source", () => {
    for (const row of DEFECTIONS) {
      assert.match(row.on, /^\d{4}-\d{2}-\d{2}$/, `${row.code} has no usable date`);
      assert.ok(row.source?.length > 3, `${row.code} has no source`);
      assert.ok(["settled", "reported"].includes(row.grade), `${row.code} has grade ${row.grade}`);
    }
  });

  it("applies only settled defections to the sitting party", () => {
    for (const row of ruling()) {
      if (!row.moved) assert.equal(row.current, row.elected);
      else assert.equal(row.moved.grade, "settled");
    }
  });

  it("keeps the seat tallies adding up to 36 on both questions", () => {
    for (const which of ["elected", "current"]) {
      const total = seatsBy(which).reduce((sum, row) => sum + row.seats, 0);
      assert.equal(total, 36, `seats counted ${which} come to ${total}`);
    }
  });
});

describe("the off-cycle results", () => {
  it("gives every contest a winner that actually polled", () => {
    for (const row of OFF_CYCLE) {
      assert.ok(row.votes[row.winner] > 0, `${row.state}: winner ${row.winner} has no votes`);
      const top = Object.entries(row.votes).sort((a, b) => b[1] - a[1])[0][0];
      assert.equal(top, row.winner, `${row.state}: ${top} polled more than the declared winner`);
    }
  });

  it("never declares more votes than the state has registered voters", () => {
    for (const row of OFF_CYCLE) {
      const cast = Object.values(row.votes).reduce((sum, value) => sum + value, 0);
      const state = states2023.find((item) => item.code === row.code);
      assert.ok(
        cast <= state.registered,
        `${row.state}: ${cast} votes from ${state.registered} registered`
      );
    }
  });

  it("sources every contest and dates it", () => {
    for (const row of OFF_CYCLE) {
      assert.match(row.votesOn, /^\d{4}-\d{2}-\d{2}$/, `${row.state} has no usable date`);
      assert.ok(row.source?.length > 3, `${row.state} has no source`);
    }
  });

  it("does not list a state as both loaded and not loaded", () => {
    const loaded = new Set(OFF_CYCLE.map((row) => row.code));
    for (const row of NOT_LOADED) {
      assert.ok(!loaded.has(row.code), `${row.state} is in both tables`);
    }
  });

  /**
   * ── THE ONE THAT CATCHES THE REAL DEFECT ────────────────────────────────
   * Both tables record when a state last elected a governor, written from
   * different reporting at different times. Where they disagree at least one
   * is wrong, and until now nothing said so.
   */
  it("agrees with the governors table on when each state last voted", () => {
    const conflicts = [];
    const held = new Map(GOVERNORS.map((row) => [row.code, row]));

    for (const row of [...OFF_CYCLE, ...NOT_LOADED]) {
      const seat = held.get(row.code);
      if (!seat) continue;
      if (seat.votedOn !== row.votesOn) {
        conflicts.push(`${row.state}: governors say ${seat.votedOn}, results say ${row.votesOn}`);
      }
    }

    assert.deepEqual(
      conflicts,
      [],
      `the reference tables contradict each other:\n  ${conflicts.join("\n  ")}`
    );
  });
});
