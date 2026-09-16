import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  FACTORS,
  TIERS,
  TOP_UNITS,
  ZONE_ORDER,
  decodePlace,
  decodeUnit,
  encodePlace,
  encodeUnit,
  matchLgaNames,
  scorePlaces,
  statesOfZone,
  sumPlaces,
  tierOf,
} from "../lib/stronghold-map.js";
import { STRONGHOLDS } from "../lib/data/strongholds-index.js";
import { MODELLED } from "../lib/data/units-modelled.js";

const json = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));

/* ══════════════════════════════════════════════════════════════════════════
   THE THREE LEVELS
   ══════════════════════════════════════════════════════════════════════════ */

describe("the strength levels", () => {
  const won = (y2019, y2023) => ({ 2019: y2019, 2023: y2023 });

  it("is Primary when Atiku carried both 2019 and 2023, whatever the older record", () => {
    assert.equal(tierOf({ won: won(true, true), base: 0 }), "PRIMARY");
    assert.equal(tierOf({ won: won(true, true), base: 3 }), "PRIMARY");
  });

  it("is Secondary for one win on ground the PDP carried at least twice before", () => {
    assert.equal(tierOf({ won: won(false, true), base: 2 }), "SECONDARY");
    assert.equal(tierOf({ won: won(true, false), base: 3 }), "SECONDARY");
  });

  it("is Tertiary for one win without that base", () => {
    assert.equal(tierOf({ won: won(false, true), base: 1 }), "TERTIARY");
    assert.equal(tierOf({ won: won(true, false), base: 0 }), "TERTIARY");
  });

  it("is nothing where he carried neither run — the older record never makes a stronghold alone", () => {
    assert.equal(tierOf({ won: won(false, false), base: 3 }), null);
  });

  it("is nothing where a run cannot be read, rather than a loss", () => {
    assert.equal(tierOf({ won: won(true, null), base: 3 }), null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   THE COMPACT FORM
   ══════════════════════════════════════════════════════════════════════════ */

describe("encoding a place and decoding it back", () => {
  it("round-trips a polling unit, including an unreadable 2023", () => {
    const unit = decodeUnit(
      encodeUnit({
        registered: 812,
        cast: null,
        share: { 2019: 61.24, 2023: null },
        lead: { 2019: 30.06, 2023: null },
        won: { 2019: true, 2023: null },
        base: 2,
        top: true,
      })
    );
    assert.equal(unit.registered, 812);
    assert.equal(unit.cast, null);
    assert.equal(unit.share[2019], 61.2);
    assert.equal(unit.share[2023], null);
    assert.deepEqual(unit.won, { 2019: true, 2023: null });
    assert.equal(unit.base, 2);
    assert.equal(unit.top, 1);
    assert.equal(unit.tier, null);
    assert.equal(unit.turnout, null);
  });

  it("round-trips a ward with its polling unit counts", () => {
    const ward = decodePlace(
      encodePlace({
        registered: 10_000,
        cast: 2_500,
        booths: 20,
        share: { 2019: 48, 2023: 52.5 },
        lead: { 2019: -4, 2023: 9.1 },
        won: { 2019: false, 2023: true },
        base: 3,
        top: 6,
        wonBooths: { 2019: 8, 2023: 13 },
        tierBooths: { PRIMARY: 5, SECONDARY: 7, TERTIARY: 2 },
      })
    );
    assert.equal(ward.tier, "SECONDARY");
    assert.equal(ward.turnout, 25);
    assert.equal(ward.density, 500);
    assert.equal(ward.lead[2019], -4);
    assert.deepEqual(ward.wonBooths, { 2019: 8, 2023: 13 });
    assert.deepEqual(ward.tierBooths, { PRIMARY: 5, SECONDARY: 7, TERTIARY: 2 });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   THE BUILT INDEX
   ══════════════════════════════════════════════════════════════════════════ */

describe("the built index", () => {
  const states = STRONGHOLDS.states.map((state) => ({ ...state, place: decodePlace(state.f) }));
  const nation = sumPlaces(states.map((state) => state.place));

  it("covers every state, local government and polling unit once", () => {
    assert.equal(states.length, 37);
    assert.equal(
      states.reduce((sum, state) => sum + state.lgas.length, 0),
      774
    );
    assert.equal(nation.booths, 176_623);
    assert.equal(STRONGHOLDS.units, 176_623);
  });

  it("puts every state in exactly one of the six zones", () => {
    const zoned = ZONE_ORDER.flatMap((zone) => statesOfZone(zone));
    assert.equal(zoned.length, 37);
    assert.equal(new Set(zoned).size, 37);
    for (const state of states) assert.ok(ZONE_ORDER.includes(state.zone), state.code);
  });

  it("marks exactly the biggest 60,000 polling units", () => {
    assert.equal(nation.top, TOP_UNITS);
    assert.ok(STRONGHOLDS.threshold > 0);
  });

  it("counts the same polling units won as the existing booth model", () => {
    /* Two builds reading the same model must agree to the booth, or one of
       the two screens is telling the room a different story. */
    for (const year of [2019, 2023]) {
      const block = MODELLED[year];
      const slot = block.slots.indexOf("PDP");
      const expected = block.states.reduce((sum, state) => sum + state.won[slot], 0);
      assert.equal(nation.wonBooths[year], expected, String(year));
    }
  });

  it("adds each state's local governments back up to the state", () => {
    for (const state of states) {
      const lgas = sumPlaces(state.lgas.map((lga) => decodePlace(lga.f)));
      assert.equal(lgas.booths, state.place.booths, state.code);
      assert.equal(lgas.top, state.place.top, state.code);
      for (const tier of TIERS) {
        assert.equal(lgas.tierBooths[tier.id], state.place.tierBooths[tier.id], `${state.code} ${tier.id}`);
      }
    }
  });

  it("gives every local government an outline that exists in its boundary file", () => {
    for (const state of states) {
      const outline = json(`public/geo/lga/${state.code}.json`);
      const names = new Set(outline.lgas.map((shape) => shape.name));
      const used = new Set();
      for (const lga of state.lgas) {
        assert.ok(names.has(lga.shape), `${state.code}: ${lga.name} -> ${lga.shape}`);
        assert.ok(!used.has(lga.shape), `${state.code}: ${lga.shape} used twice`);
        used.add(lga.shape);
      }
    }
  });

  it("lines each state file up with its polling unit tree", () => {
    for (const number of ["04", "20", "37"]) {
      const tree = json(`public/geo/units/${number}.json`);
      const figures = json(`public/geo/strongholds/${number}.json`);
      assert.equal(figures.lgas.length, tree.lgas.length, number);
      tree.lgas.forEach((lga, li) => {
        assert.equal(figures.lgas[li].w.length, lga.wards.length, `${number}/${lga.n}`);
        lga.wards.forEach((ward, wi) => {
          assert.equal(figures.lgas[li].w[wi].u.length, ward.units.length, `${number}/${lga.n}/${ward.n}`);
        });
      });
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   LOCAL GOVERNMENT NAMES
   ══════════════════════════════════════════════════════════════════════════ */

describe("pairing INEC's local government names with the outlines", () => {
  it("pairs bracketed seats, respellings and renamed councils", () => {
    const pairs = matchLgaNames(
      ["Ikeduru (Iho)", "Egbado North", "Dawaki Kudu", "Municipal"],
      ["Municipal Area Council", "Dawakin Kudu", "Yewa North", "Ikeduru"]
    );
    assert.equal(pairs.get("Ikeduru (Iho)"), "Ikeduru");
    assert.equal(pairs.get("Dawaki Kudu"), "Dawakin Kudu");
    assert.equal(pairs.get("Egbado North"), "Yewa North");
    assert.equal(pairs.get("Municipal"), "Municipal Area Council");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   PLANNING
   ══════════════════════════════════════════════════════════════════════════ */

describe("scoring places to target", () => {
  const place = (registered, booths, turnout, lead) => ({
    registered,
    density: registered / booths,
    turnout,
    lead: { 2023: lead, 2019: lead },
  });

  it("puts the place that leads on every factor at the top, out of a hundred", () => {
    const rows = scorePlaces([
      place(1_000, 10, 60, 40),
      place(50_000, 50, 20, 1),
      place(8_000, 20, 40, -15),
    ]);
    assert.equal(rows[1].score, 100);
    assert.equal(rows[0].score, 0);
    assert.ok(rows[2].score > 0 && rows[2].score < 100);
  });

  it("only weighs the factors that are switched on", () => {
    const rows = scorePlaces([place(1_000, 1, 10, 0), place(90_000, 90, 90, 50)], { factors: ["close"] });
    assert.equal(rows[0].score, 100);
    assert.deepEqual(Object.keys(rows[0].parts), ["close"]);
  });

  it("ranks a place it cannot measure at the bottom of that factor, not the middle", () => {
    const rows = scorePlaces([place(5_000, 10, null, 5), place(4_000, 10, 30, 5)], { factors: ["turnout"] });
    assert.equal(rows[0].parts.turnout, 0);
  });

  it("names its reasons after the strongest factors", () => {
    const [row] = scorePlaces([place(9_000, 3, 10, 0), place(1, 1, 90, 90)]);
    assert.ok(row.why.length > 0 && row.why.length <= 2);
    for (const reason of row.why) assert.ok(FACTORS.some((factor) => factor.label === reason));
  });
});
