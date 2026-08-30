import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADAMAWA, DECLARED, LOCAL_GOVERNMENT, SEATS } from "../lib/adamawa.js";
import { federalIn, resolveTerritory, senatorialIn } from "../lib/constituencies.js";
import { lgasForState } from "../lib/lga-names.js";
import { describeTerritory, levelForRace } from "../lib/territory.js";
import { RESULTS } from "../lib/election2023.js";
import { ballotIds } from "../lib/races.js";

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  A HAND-TRANSCRIBED TABLE, HELD AGAINST THE ONES THE PRODUCT GENERATES
 *
 *  lib/adamawa.js was typed by a person from published sources. Everything in
 *  it that names a place can be checked against the district tables, and
 *  everything in it that carries a figure can be checked against the 2023
 *  results this repository already ships.
 *
 *  The failure worth catching is a seat filed under the wrong constituency.
 *  It would look completely ordinary — a real name, a real party, a real
 *  constituency, in the wrong pairing — and it would put an account on a map
 *  of somewhere else. Names cannot be checked here, so what is checked is
 *  that each of the 3 districts and each of the 8 constituencies is named
 *  once and only once, which is what catches a row that drifted onto its
 *  neighbour.
 * ══════════════════════════════════════════════════════════════════════════
 */

describe("Adamawa, as the tables see it", () => {
  it("is the second state, with 21 local governments", () => {
    assert.equal(ADAMAWA.number, "02");
    assert.equal(lgasForState(ADAMAWA.number).length, ADAMAWA.lgas);
    assert.equal(ADAMAWA.lgas, 21);
  });

  it("has the three districts and eight constituencies the product holds", () => {
    assert.equal(senatorialIn(ADAMAWA.number).length, ADAMAWA.senatorialDistricts);
    assert.equal(federalIn(ADAMAWA.number).length, ADAMAWA.federalConstituencies);
  });
});

describe("who holds every Adamawa seat", () => {
  it("names a place the product can resolve, every time", () => {
    for (const seat of SEATS) {
      const place = resolveTerritory(seat.territory);
      assert.ok(place, `${seat.place}: ${seat.territory} resolves to nothing`);
      assert.equal(place.stateNumber, ADAMAWA.number, `${seat.place} is not in Adamawa`);
    }
  });

  it("files each seat under the extent its contest is fought over", () => {
    for (const seat of SEATS) {
      assert.equal(
        resolveTerritory(seat.territory).level,
        levelForRace(seat.race),
        `${seat.place}: a ${seat.race} seat over ${seat.territory}`
      );
    }
  });

  /* The check that catches a row that drifted onto its neighbour: a real
     member filed under a real constituency that is not theirs leaves one
     constituency named twice and another named not at all. */
  it("names each senatorial district exactly once", () => {
    const held = SEATS.filter((seat) => seat.race === "SENATE").map((seat) => seat.territory);
    const all = senatorialIn(ADAMAWA.number).map((row) => `SENATORIAL:${row.key}`);

    assert.equal(held.length, 3);
    assert.deepEqual([...held].sort(), [...all].sort());
  });

  it("names each federal constituency exactly once", () => {
    const held = SEATS.filter((seat) => seat.race === "REPRESENTATIVES").map((seat) => seat.territory);
    const all = federalIn(ADAMAWA.number).map((row) => `FEDERAL:${row.key}`);

    assert.equal(held.length, 8);
    assert.deepEqual([...held].sort(), [...all].sort());
  });

  it("gives every seat a holder, a party on the ballot and a source", () => {
    const ballot = ballotIds("PRESIDENTIAL");
    for (const seat of SEATS) {
      assert.ok(seat.holder?.length > 2, `${seat.place} has no holder`);
      assert.ok(ballot.includes(seat.party), `${seat.place}: ${seat.party} is not a party we can draw`);
      assert.ok(seat.source?.length > 5, `${seat.place} has no source`);
    }
  });

  /* Five PDP and three APC, which is the split the 10th National Assembly
     actually returned. Written out rather than counted from the rows, so a
     party changed on one row fails here instead of silently redefining what
     the state looks like. */
  it("returns five PDP and three APC members of the House", () => {
    const reps = SEATS.filter((seat) => seat.race === "REPRESENTATIVES");
    assert.equal(reps.filter((seat) => seat.party === "PDP").length, 5);
    assert.equal(reps.filter((seat) => seat.party === "APC").length, 3);
  });
});

describe("the declared figures we hold for Adamawa", () => {
  it("is state-level for both contests, and says which state", () => {
    for (const row of DECLARED) {
      assert.equal(row.level, "STATE");
      assert.equal(row.key, ADAMAWA.number);
    }
  });

  it("only carries parties that have a box on the ballot", () => {
    for (const row of DECLARED) {
      const ballot = ballotIds(row.race);
      for (const party of Object.keys(row.votes)) {
        assert.ok(ballot.includes(party), `${row.race}: ${party} has no box on that paper`);
      }
    }
  });

  it("names the party with the most votes as the winner", () => {
    for (const row of DECLARED) {
      const [top] = Object.entries(row.votes).sort((a, b) => b[1] - a[1]);
      assert.equal(top[0], row.winner, `${row.race} was won by ${row.winner} on fewer votes`);
    }
  });

  /* The presidential row is a copy of one this repository already ships. A
     copy that drifts is two answers to one question, and the state board and
     this table would disagree about the same election. */
  it("agrees with lib/election2023.js about the presidential result", () => {
    const row = DECLARED.find((one) => one.race === "PRESIDENTIAL");
    const [, , votes, valid, , registered] = RESULTS.find((one) => one[0] === ADAMAWA.code);
    const [apc, pdp, lp, nnpp, others] = votes;

    assert.deepEqual(row.votes, { APC: apc, PDP: pdp, LP: lp, NNPP: nnpp, OTH: others });
    assert.equal(row.registered, registered);
    assert.equal(
      Object.values(row.votes).reduce((a, b) => a + b, 0),
      valid,
      "the parties must sum to the published valid vote"
    );
  });

  /* The governorship's two figures are deliberately short of the declared
     turnout, because twelve other parties' totals are not held. The gap is
     asserted rather than left to be discovered on a screen: if somebody later
     "fixes" it by inventing a distribution, this fails. */
  it("is honest about the governorship being two parties out of fourteen", () => {
    const row = DECLARED.find((one) => one.race === "GOVERNORSHIP");
    const counted = Object.values(row.votes).reduce((a, b) => a + b, 0);

    assert.equal(Object.keys(row.votes).length, 2);
    assert.equal(counted, 829_649);
    assert.ok(counted < row.registered * 0.399, "the two parties must be short of declared turnout");
    assert.match(row.note, /not held/);
    assert.equal(row.accredited, null, "an unpublished count is null, never zero");
  });
});

describe("the last local government election", () => {
  it("is the June 2026 one, declared by ADSIEC", () => {
    assert.equal(LOCAL_GOVERNMENT.votesOn, "2026-06-13");
    assert.ok(LOCAL_GOVERNMENT.declaredOn > LOCAL_GOVERNMENT.votesOn);
    assert.match(LOCAL_GOVERNMENT.by, /Adamawa State Independent Electoral Commission/);
  });

  it("records a sweep as a count of seats and not as invented votes", () => {
    assert.equal(LOCAL_GOVERNMENT.chairmanships.total, ADAMAWA.lgas);
    assert.equal(LOCAL_GOVERNMENT.chairmanships.PDP, ADAMAWA.lgas);
    assert.equal(LOCAL_GOVERNMENT.wards.total, ADAMAWA.wards);
    assert.equal(LOCAL_GOVERNMENT.votes, null, "no per-council totals were published");
  });
});

describe("the ground each Adamawa campaign stands on", () => {
  /* The four territories scripts/seed-adamawa.mjs issues accounts against.
     Written out here so a change to that script's choices has to be a change
     somebody made on purpose. */
  const GROUNDS = [
    ["GOVERNORSHIP", "STATE:02", 21],
    ["SENATE", "SENATORIAL:02/adamawa-central", 7],
    ["REPRESENTATIVES", "FEDERAL:02/yola-north-yola-south-girei", 3],
    ["LGA", "LGA:02/20", 1],
  ];

  it("nests: the constituency inside the district, the council inside both", () => {
    const state = resolveTerritory("STATE:02");
    const district = resolveTerritory("SENATORIAL:02/adamawa-central");
    const seat = resolveTerritory("FEDERAL:02/yola-north-yola-south-girei");
    const council = resolveTerritory("LGA:02/20");

    assert.ok(seat.lgas.every((code) => district.lgas.includes(code)), "the seat must sit inside the district");
    assert.ok(district.lgas.every((code) => state.lgas.includes(code)), "the district must sit inside the state");
    assert.ok(council.lgas.every((code) => seat.lgas.includes(code)), "the council must sit inside the seat");
  });

  it("gives each campaign the ground its contest is counted over", () => {
    for (const [race, stored, size] of GROUNDS) {
      const place = resolveTerritory(stored);
      assert.ok(place, `${stored} resolves to nothing`);
      assert.equal(place.level, levelForRace(race), `${race} over ${stored}`);
      assert.equal(place.lgas.length, size, `${describeTerritory(place)} has ${place.lgas.length}`);
      assert.equal(place.stateNumber, "02");
    }
  });

  it("puts the local government campaign in Yola North", () => {
    assert.equal(resolveTerritory("LGA:02/20").name, "Yola North");
  });
});
