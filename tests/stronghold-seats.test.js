import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { STRONGHOLDS } from "../lib/data/strongholds-index.js";
import { decodePlace, groundIn, readingFor, seatLevelOf, sumPlaces } from "../lib/stronghold-map.js";
import { lastGovernorships } from "../lib/record.js";
import { baselineFrom } from "../lib/executive.js";

const districts = JSON.parse(
  readFileSync(new URL("../public/geo/constituencies.json", import.meta.url), "utf8")
);

/* ══════════════════════════════════════════════════════════════════════════
   THE SEATS, ROLLED UP AT BUILD TIME
   ══════════════════════════════════════════════════════════════════════════ */

describe("the seats in the built index", () => {
  const count = (race) =>
    STRONGHOLDS.states.reduce((sum, state) => sum + (state.seats?.[race]?.length ?? 0), 0);

  it("carries every senatorial district and every federal constituency", () => {
    assert.equal(count("SENATE"), districts.senatorial.length);
    assert.equal(count("REPRESENTATIVES"), districts.federal.length);
  });

  it("puts every local government in exactly one senatorial district, and every polling unit with it", () => {
    for (const state of STRONGHOLDS.states) {
      const seats = state.seats.SENATE;
      const members = seats.flatMap((seat) => seat.lgas).sort((a, b) => a - b);
      assert.deepEqual(members, state.lgas.map((_, index) => index), state.name);

      const booths = (places) => places.reduce((sum, place) => sum + decodePlace(place.f).booths, 0);
      assert.equal(booths(seats), booths(state.lgas), state.name);
    }
  });

  it("counts a seat from its own local governments and nothing else", () => {
    const adamawa = STRONGHOLDS.states.find((state) => state.code === "ADA");
    const central = adamawa.seats.SENATE.find((seat) => seat.key === "02/adamawa-central");
    const summed = sumPlaces(central.lgas.map((at) => decodePlace(adamawa.lgas[at].f)));
    const place = decodePlace(central.f);

    assert.equal(central.lgas.length, 7);
    assert.equal(place.registered, summed.registered);
    assert.equal(place.booths, summed.booths);
    assert.equal(place.tierBooths.PRIMARY, summed.tierBooths.PRIMARY);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   THE GROUND A ROOM HOLDS
   ══════════════════════════════════════════════════════════════════════════ */

describe("the ground a room holds", () => {
  const states = STRONGHOLDS.states;
  const adamawa = states.find((state) => state.code === "ADA");

  it("is nothing for a room that holds the country", () => {
    assert.equal(groundIn(states, null), null);
    assert.equal(groundIn(states, { level: "NATION" }), null);
  });

  it("is the whole state for a state account", () => {
    assert.deepEqual(groundIn(states, { level: "STATE", stateCode: "ADA", name: "Adamawa" }), {
      state: "ADA",
      seat: null,
      lga: null,
      name: "Adamawa",
    });
  });

  it("is the district's own local governments for a Senate account", () => {
    const ground = groundIn(states, {
      level: "SENATORIAL",
      key: "02/adamawa-central",
      name: "Adamawa Central",
      stateCode: "ADA",
      lgas: ["02/02", "02/04", "02/05", "02/07", "02/18", "02/20", "02/21"],
    });
    assert.deepEqual(ground.seat, { race: "SENATE", key: "02/adamawa-central" });
    assert.equal(ground.lgas.length, 7);
    assert.equal(adamawa.lgas[ground.lgas[0]].name, "Fufore");
  });

  it("is one local government for an assembly or council account", () => {
    const ground = groundIn(states, { level: "LGA", key: "02/01", stateCode: "ADA", lgas: ["02/01"] });
    assert.equal(ground.lga, 0);
    assert.equal(ground.name, "Demsa");
  });

  it("opens on the country rather than on a guess when the places are not held", () => {
    assert.equal(groundIn(states, { level: "SENATORIAL", key: "nowhere", stateCode: "ADA", lgas: ["02/99"] }), null);
    assert.equal(groundIn(states, { level: "STATE", stateCode: "XXX" }), null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SAYING WHICH VOTE IS ON THE MAP
   ══════════════════════════════════════════════════════════════════════════ */

describe("which vote the stronghold map reads", () => {
  it("adds nothing for the presidential race, whose vote it is", () => {
    assert.equal(readingFor("PRESIDENTIAL"), null);
  });

  it("names the presidential vote under every other contest", () => {
    for (const race of ["GOVERNORSHIP", "SENATE", "REPRESENTATIVES", "ASSEMBLY", "LGA"]) {
      assert.match(readingFor(race), /presidential vote/, race);
    }
  });

  it("gives Senate and House rooms a seat level, and no other contest", () => {
    assert.equal(seatLevelOf("SENATE").one, "district");
    assert.equal(seatLevelOf("representatives").many, "constituencies");
    assert.equal(seatLevelOf("GOVERNORSHIP"), null);
    assert.equal(seatLevelOf("ASSEMBLY"), null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   THE GOVERNORSHIP A GOVERNORSHIP COUNT IS HELD AGAINST
   ══════════════════════════════════════════════════════════════════════════ */

describe("the last governorship in each state", () => {
  const record = lastGovernorships({
    extra: [{ code: "ADA", state: "Adamawa", votes: { PDP: 430_861, APC: 398_788 }, votesOn: "2023-03-18" }],
  });

  it("holds one row per state", () => {
    assert.equal(new Set(record.rows.map((row) => row.code)).size, record.rows.length);
    assert.equal(record.rows.find((row) => row.code === "EDO").votes.APC, 291_667);
  });

  it("leaves out a total nobody has checked", () => {
    assert.equal(record.rows.find((row) => row.code === "ANA"), undefined);
  });

  it("takes a state transcribed on its own", () => {
    assert.equal(record.rows.find((row) => row.code === "ADA").total, 829_649);
  });

  it("gives a swing only where that state's governorship is on record", () => {
    const base = baselineFrom(record, "APC");
    assert.ok(Math.abs(base.EDO.share - (291_667 / (291_667 + 247_274 + 22_763)) * 100) < 1e-9);
    assert.equal(base.KAN, undefined);
  });
});
