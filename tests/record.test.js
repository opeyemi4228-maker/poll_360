import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMPETITIVE,
  TIMELINE,
  TRENDS,
  compare,
  partyRecord,
  span,
  stateTrends,
  turnoutByState,
  turnoutRecord,
} from "../lib/record.js";

/**
 * The record, 1999 to the last election held.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  This module joins two things a reader thinks of as one history and that
 *  are emphatically not one contest: seven presidential elections, and the
 *  off-cycle governorships that run on their own cycle underneath them.
 *
 *  Every test below is about a line that must not be crossed. The expensive
 *  mistake here is not arithmetic — it is a subtraction between two numbers
 *  that are both correct and have nothing to do with each other, which comes
 *  out as a confident sentence about a swing that never happened.
 * ══════════════════════════════════════════════════════════════════════════
 */

describe("what the record covers", () => {
  it("runs from 1999 to the most recent election held", () => {
    const cover = span(new Date("2026-09-04"));
    assert.equal(cover.from, 1999);
    assert.equal(cover.to, 2026);
    assert.equal(cover.lastLabel, "Osun 2026");
    assert.equal(cover.lastHeld, "2026-08-15");
  });

  it("is ordered by the day each election was held, not by year", () => {
    /* 2023 holds a presidential in February and three governorships in
       November. Sorting by year alone would put them in an arbitrary order
       inside the year, and a timeline that reads out of sequence is a
       timeline nobody trusts. */
    const days = TIMELINE.map((row) => row.held);
    assert.deepEqual(days, [...days].sort());
  });

  it("names the two elections it has no state table for", () => {
    /* 2007 and 2011 are in the record with their national figures and no
       rows. Leaving them out entirely would draw a different country's
       history; leaving them in unmarked would let a per-state chart treat an
       absence as a set of zeroes. */
    assert.deepEqual(span().missingStateTables, [2007, 2011]);
    for (const year of [2007, 2011]) {
      const row = TIMELINE.find((item) => item.year === year && item.kind === "PRESIDENTIAL");
      assert.equal(row.stateLevel, false);
      assert.equal(row.states, 0);
    }
  });

  it("keeps the two kinds of election apart on every row", () => {
    const kinds = new Set(TIMELINE.map((row) => row.kind));
    assert.deepEqual([...kinds].sort(), ["GOVERNORSHIP", "PRESIDENTIAL"]);
    /* A governorship is one state. A presidential with a table is 37. */
    for (const row of TIMELINE) {
      if (row.kind === "GOVERNORSHIP") assert.equal(row.states, 1);
    }
  });

  it("carries Osun 2026 as Accord, which is the fact the record ends on", () => {
    const osun = TIMELINE.find((row) => row.id === "GOV-OSU-2026");
    assert.equal(osun.winner, "ACCORD");
    assert.equal(osun.candidate, "Ademola Adeleke");
    assert.equal(osun.place, "Osun");
    assert.equal(osun.votes.ACCORD, 511_067);
    assert.equal(osun.votes.APC, 444_815);
    assert.equal(osun.cast, 1_005_800);
  });
});

describe("comparing two elections", () => {
  it("refuses to compare across the two kinds", () => {
    /* The whole reason this module exists. Accord's 50.8% in Osun in 2026
       against APC's presidential share there in 2023 is a real subtraction
       between two real numbers and it means nothing: different office,
       different ballot, different electorate. A governorship year is not in
       the presidential record at all, so it cannot be asked for. */
    const bad = compare(2023, 2026);
    assert.equal(bad.ok, false);
    assert.match(bad.why, /not in the record/);
  });

  it("refuses an election with no by-state table rather than drawing zeroes", () => {
    const bad = compare(2003, 2007);
    assert.equal(bad.ok, false);
    assert.match(bad.why, /2007/);
    assert.match(bad.why, /no by-state table/i);
  });

  it("gives a row per state with the change between them", () => {
    const seen = compare(2019, 2023);
    assert.equal(seen.ok, true);
    assert.equal(seen.rows.length, 37);

    for (const row of seen.rows) {
      assert.equal(
        Math.round((row.now.share - row.was.share) * 1e6) / 1e6,
        Math.round(row.change * 1e6) / 1e6
      );
    }
  });

  it("computes the national change from votes, never by averaging states", () => {
    /* An average of 37 percentages weights Bayelsa like Kano. The national
       figure has to be the sum of the votes over the sum of the cast. */
    const seen = compare(2019, 2023, "APC");
    const votes = seen.rows.reduce((sum, row) => sum + row.now.votes, 0);
    const cast = seen.rows.reduce((sum, row) => sum + row.now.cast, 0);
    assert.equal(
      Math.round(seen.national.now * 100) / 100,
      Math.round(((votes / cast) * 100) * 100) / 100
    );

    const mean = seen.rows.reduce((sum, row) => sum + row.now.share, 0) / seen.rows.length;
    assert.notEqual(Math.round(mean * 10), Math.round(seen.national.now * 10));
  });

  it("says which states changed hands when comparing winners", () => {
    const seen = compare(2015, 2023);
    assert.ok(seen.rows.some((row) => row.flipped === true));
    assert.ok(seen.rows.every((row) => typeof row.flipped === "boolean"));
  });

  it("has no opinion about flipping when a party is fixed", () => {
    /* Both sides are that party by construction, so "did it change hands" is
       not a question this comparison is answering. Null rather than false: it
       is unasked, not answered no. */
    const seen = compare(2015, 2023, "APC");
    assert.ok(seen.rows.every((row) => row.flipped === null));
  });
});

describe("what each state has been doing", () => {
  it("grades every state it has a run for", () => {
    const trends = stateTrends();
    assert.equal(trends.length, 37);
    for (const state of trends) {
      assert.ok(TRENDS[state.trend], `${state.name} got an unknown trend`);
    }
  });

  it("calls a place held on a knife edge a swing state whatever its past", () => {
    /* A state can have been held by one party throughout and still be a
       contest now. Grading it "settled" on its history alone would tell a
       campaign to leave it alone. */
    const trends = stateTrends();
    for (const state of trends) {
      if (state.margin < COMPETITIVE) {
        assert.equal(state.trend, "SWING", `${state.name} is at ${state.margin.toFixed(1)} and not a swing`);
      }
    }
  });

  it("does not call a state that realigned once, long ago, a swing state", () => {
    /* Changed hands in 2015 and safe ever since is a realignment, not a
       marginal. Every swing has either changed hands more than once or is
       close right now. */
    const trends = stateTrends();
    for (const state of trends) {
      if (state.trend === "SWING") {
        assert.ok(
          state.changes > 1 || state.margin < COMPETITIVE,
          `${state.name} is a swing on neither test`
        );
      }
    }
  });

  it("separates a state newly taken from one that has been growing", () => {
    const trends = stateTrends();
    for (const state of trends) {
      if (state.trend === "EMERGING") {
        const run = state.run;
        assert.notEqual(run[run.length - 1].winner, run[run.length - 2].winner);
      }
      if (state.trend === "GROWING" || state.trend === "DECLINING") {
        const run = state.run;
        assert.equal(run[run.length - 1].winner, run[run.length - 2].winner);
      }
    }
  });
});

describe("turnout across the record", () => {
  it("leaves a governorship off the turnout chart rather than plotting it at zero", () => {
    /* The declared totals carry no register, so turnout for them is not
       known. A point at the bottom of the axis reads as an election nobody
       voted in, which is a much stronger claim than "we do not have it". */
    const record = turnoutRecord();
    assert.ok(record.points.every((point) => point.kind === "PRESIDENTIAL"));
    assert.equal(record.points.length, 7);
    assert.equal(record.withoutTurnout.length, 8);
    assert.ok(record.withoutTurnout.includes("Osun 2026"));
  });

  it("measures the fall from the peak, not from the first election", () => {
    /* Turnout rose between 1999 and 2003 and has fallen since. Measuring from
       1999 understates the collapse by the whole of that rise. */
    const record = turnoutRecord();
    assert.equal(record.peak.year, 2003);
    assert.equal(record.last.year, 2023);
    assert.ok(record.fall.points > 40);
    assert.ok(record.fall.share > 60, "well over half the turnout of 2003 is gone");
  });

  it("ranks states by how many people stayed at home, not by rate", () => {
    /* A rate finds small states. A campaign wants the votes, and the votes
       are where the people are. */
    const rows = turnoutByState();
    assert.equal(rows.length, 37);
    for (let index = 1; index < rows.length; index += 1) {
      assert.ok(rows[index - 1].stayedHome >= rows[index].stayedHome);
    }
  });
});

describe("the parties", () => {
  it("gives a party with no presidential run no national share at all", () => {
    /* Accord holds Osun since August 2026 and has never stood a presidential
       candidate in this record. Its national share is not nought per cent; it
       is not a number that exists, and a zero would put it at the bottom of a
       ranking as though it had contested and lost. */
    const accord = partyRecord().find((party) => party.id === "ACCORD");
    assert.ok(accord, "Accord is missing from the record");
    assert.equal(accord.latest, null);
    assert.equal(accord.elections, 0);
    assert.equal(accord.governorships.length, 1);
    assert.equal(accord.governorships[0].state, "Osun");
    assert.equal(accord.governorships[0].year, 2026);
  });

  it("never adds a governorship into a presidential share", () => {
    const apc = partyRecord().find((party) => party.id === "APC");
    const run2023 = apc.run.find((step) => step.year === 2023);
    /* The APC won several governorships in the window and its 2023
       presidential share must be untouched by them. */
    assert.ok(run2023.share > 30 && run2023.share < 40);
    assert.ok(apc.governorships.length > 1);
  });

  it("counts Osun 2026 to Accord and not to the party that lost it", () => {
    const record = partyRecord();
    const apc = record.find((party) => party.id === "APC");
    assert.ok(!apc.governorships.some((seat) => seat.code === "OSU"));
  });
});
