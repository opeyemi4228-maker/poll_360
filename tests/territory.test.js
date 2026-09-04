import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LEVEL_FOR_RACE,
  coversLga,
  coversState,
  coversUnit,
  describeTerritory,
  formatTerritory,
  levelForRace,
  lgaOf,
  parseTerritory,
  within,
  withinDeclared,
} from "../lib/territory.js";
import {
  allPlaces,
  federalIn,
  lgasOf,
  resolveTerritory,
  senatorialIn,
} from "../lib/constituencies.js";
import { RACE_IDS } from "../lib/races.js";
import { STATES } from "../lib/units.js";

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THESE TESTS ARE ACTUALLY GUARDING
 *
 *  A territory decides which booths an account can see, which shapes its map
 *  draws, and what the denominator of its coverage percentage is. Every one
 *  of those is wrong silently. A room given Kaduna instead of Kaduna Central
 *  shows a perfectly formatted map, a perfectly formatted total and a
 *  coverage figure measured against 23 local governments it has agents in 7
 *  of — and nothing anywhere says so.
 *
 *  So the checks below are about arithmetic and containment rather than about
 *  rendering: does every local government belong to exactly one senatorial
 *  district, does a district's booths test as inside it and its neighbour's
 *  as outside, and does a stored territory come back as the same territory.
 * ══════════════════════════════════════════════════════════════════════════
 */

describe("the constituency tables", () => {
  const places = allPlaces();

  it("holds 109 senatorial districts", () => {
    const total = places.reduce((sum, state) => sum + state.senatorial.length, 0);
    assert.equal(total, 109);
  });

  it("holds 360 federal constituencies", () => {
    const total = places.reduce((sum, state) => sum + state.federal.length, 0);
    assert.equal(total, 360);
  });

  it("gives every state three senatorial districts, and the FCT one", () => {
    for (const state of places) {
      assert.equal(
        state.senatorial.length,
        state.code === "FCT" ? 1 : 3,
        `${state.name} has ${state.senatorial.length}`
      );
    }
  });

  /* The check that matters most, because it is the one a wrong join breaks
     without changing any total: a local government in two districts would
     have its booths counted in both, and a local government in none would
     have its booths visible to nobody. */
  it("puts every local government in exactly one senatorial district", () => {
    const seen = new Map();
    for (const state of STATES) {
      for (const district of senatorialIn(state.number)) {
        for (const code of resolveTerritory(`SENATORIAL:${district.key}`).lgas) {
          seen.set(code, (seen.get(code) ?? 0) + 1);
        }
      }
    }

    const expected = places.reduce((sum, state) => sum + state.lgas.length, 0);
    assert.equal(expected, 774, "the boundary files should hold 774 local governments");
    assert.equal(seen.size, 774);
    for (const [code, times] of seen) assert.equal(times, 1, `${code} is in ${times} districts`);
  });

  /* "At least one" rather than "exactly one", and the difference is real:
     Surulere, Mushin, Oshodi-Isolo, Lagos Island and Port Harcourt each elect
     two members, and the line between the two seats runs between wards. */
  it("puts every local government in at least one federal constituency", () => {
    const seen = new Map();
    for (const state of STATES) {
      for (const seat of federalIn(state.number)) {
        for (const code of resolveTerritory(`FEDERAL:${seat.key}`).lgas) {
          seen.set(code, (seen.get(code) ?? 0) + 1);
        }
      }
    }
    assert.equal(seen.size, 774);
  });

  it("marks the seats that share a local government, and only those", () => {
    const shared = STATES.flatMap((state) => federalIn(state.number)).filter((row) => row.shared);
    assert.equal(shared.length, 10, "five pairs of seats share one local government");
    for (const seat of shared) assert.equal(seat.shared.length, 2);
  });

  /* Spot checks against the published compositions. Not a proof, but these
     are the ones a wrong alphabetical assumption would move first: a district
     whose local governments sort near the start or end of its state. */
  it("agrees with the published composition of districts we checked by hand", () => {
    const kadunaNorth = lgasOf(resolveTerritory("SENATORIAL:18/kaduna-north")).map((row) => row.name);
    assert.deepEqual(
      [...kadunaNorth].sort(),
      ["Ikara", "Kubau", "Kudan", "Lere", "Makarfi", "Sabon Gari", "Soba", "Zaria"]
    );

    const fct = resolveTerritory("SENATORIAL:37/abuja");
    assert.equal(fct.lgas.length, 6);

    const kanoCentral = resolveTerritory("SENATORIAL:19/kano-central");
    assert.equal(kanoCentral.lgas.length, 15);
  });
});

describe("resolving a stored territory", () => {
  it("reads the federation as the federation and not as an empty list", () => {
    const nation = resolveTerritory("NATION");
    assert.equal(nation.level, "NATION");
    assert.equal(nation.lgas, null);
    assert.equal(coversUnit(nation, "01/01/04/006"), true);
    assert.equal(within(nation).sql, "", "the federation adds no clause at all");
  });

  it("resolves a state to its own local governments", () => {
    const lagos = resolveTerritory("STATE:24");
    assert.equal(lagos.name, "Lagos");
    assert.equal(lagos.lgas.length, 20);
    assert.ok(lagos.lgas.every((code) => code.startsWith("24/")));
  });

  it("resolves a local government to itself", () => {
    const one = resolveTerritory("LGA:24/13");
    assert.equal(one.stateName, "Lagos");
    assert.deepEqual(one.lgas, ["24/13"]);
    assert.ok(one.name && one.name !== "24/13", "a local government must resolve to a name");
  });

  /* Null rather than "everywhere". An account whose territory no longer
     resolves must not quietly become a national account. */
  it("returns nothing for a territory that names nowhere", () => {
    assert.equal(resolveTerritory("SENATORIAL:18/no-such-district"), null);
    assert.equal(resolveTerritory("STATE:99"), null);
    assert.equal(resolveTerritory("LGA:24/99"), null);
    assert.equal(resolveTerritory("PARISH:1"), null);
    assert.equal(resolveTerritory(""), null);
    assert.equal(resolveTerritory(null), null);
  });
});

describe("what a territory contains", () => {
  const central = resolveTerritory("SENATORIAL:18/kaduna-central");
  const north = resolveTerritory("SENATORIAL:18/kaduna-north");

  it("holds its own booths and not the district next door's", () => {
    const mine = `${central.lgas[0]}/04/006`;
    const theirs = `${north.lgas[0]}/04/006`;

    assert.equal(coversUnit(central, mine), true);
    assert.equal(coversUnit(central, theirs), false);
    assert.equal(coversUnit(north, theirs), true);
  });

  it("holds no booth from another state", () => {
    assert.equal(coversUnit(central, "24/13/04/006"), false);
    assert.equal(coversState(central, "24"), false);
    assert.equal(coversState(central, "18"), true);
  });

  it("says no to a code it cannot place, rather than yes", () => {
    assert.equal(coversUnit(central, ""), false);
    assert.equal(coversUnit(central, "nonsense"), false);
    assert.equal(coversLga(central, "18/99"), false);
  });

  it("turns into the clause that selects its returns", () => {
    const clause = within(central);
    assert.match(clause.sql, /^ AND substr\(unit_code, 1, 5\) IN \(\?(, \?)*\)$/);
    assert.deepEqual(clause.params, central.lgas);
    assert.equal(clause.sql.split("?").length - 1, central.lgas.length, "one mark per parameter");
  });

  it("narrows whichever column it is pointed at", () => {
    assert.match(within(central, "i.unit_code").sql, /substr\(i\.unit_code, 1, 5\)/);
  });

  /* The failure this guards against is silent and total: an empty ground that
     produced no clause would read every return in Nigeria. */
  it("matches nothing for a territory that contains nothing", () => {
    const empty = { level: "SENATORIAL", lgas: [], stateNumber: "18" };
    assert.equal(within(empty).sql, " AND 1 = 0");
    assert.deepEqual(within(empty).params, []);
    assert.equal(withinDeclared(empty).sql, " AND 1 = 0");
  });

  /* An unnarrowed account is the whole federation, deliberately: it is every
     account that predates this feature, and emptying their rooms would be a
     silent outage dressed up as caution. */
  it("treats no territory at all as the federation", () => {
    assert.equal(coversUnit(null, "01/01/04/006"), true);
    assert.equal(coversState(null, "24"), true);
    assert.equal(within(null).sql, "");
    assert.deepEqual(within(null).params, []);
  });
});

describe("narrowing the declared figures", () => {
  const central = resolveTerritory("SENATORIAL:18/kaduna-central");
  const kaduna = resolveTerritory("STATE:18");

  it("adds no clause for the federation", () => {
    assert.equal(withinDeclared(resolveTerritory("NATION")).sql, "");
    assert.equal(withinDeclared(null).sql, "");
  });

  /* A state's declared total is not a figure about one district inside it, so
     a district must not be handed the state row to be measured against. Its
     place key is two digits and never matches a five-character local
     government code, which is what keeps it out. */
  it("keeps a state's own declaration out of a district's comparison", () => {
    const clause = withinDeclared(central);
    assert.ok(!clause.sql.includes("level = 'STATE'"));
    assert.deepEqual(clause.params, central.lgas);
  });

  it("gives a room holding the whole state its state row", () => {
    const clause = withinDeclared(kaduna);
    assert.ok(clause.sql.includes("level = 'STATE'"));
    assert.equal(clause.params.at(-1), "18");
    assert.deepEqual(clause.params.slice(0, -1), kaduna.lgas);
  });
});

describe("writing a territory down and reading it back", () => {
  it("round-trips every level", () => {
    for (const stored of ["NATION", "STATE:24", "SENATORIAL:18/kaduna-central", "FEDERAL:24/surulere-i", "LGA:24/13"]) {
      assert.equal(formatTerritory(parseTerritory(stored)), stored);
    }
  });

  it("refuses a level nobody defined", () => {
    assert.equal(parseTerritory("WARD:24/13/04"), null);
    assert.equal(parseTerritory("STATE"), null, "a level below the federation must name a place");
    assert.equal(parseTerritory(""), null);
  });
});

describe("which extent a contest is fought over", () => {
  it("gives every contest on the ballot one", () => {
    for (const race of RACE_IDS) {
      assert.ok(levelForRace(race), `${race} has no territory level`);
    }
  });

  it("knows nothing about a contest that is not on the ballot", () => {
    assert.equal(levelForRace("MAYOR"), null);
  });

  /* The pairing the whole feature turns on. Written out rather than derived,
     so changing one is a change somebody has to make on purpose. */
  it("pairs each contest with the ground it is counted over", () => {
    assert.equal(LEVEL_FOR_RACE.PRESIDENTIAL, "NATION");
    assert.equal(LEVEL_FOR_RACE.GOVERNORSHIP, "STATE");
    assert.equal(LEVEL_FOR_RACE.SENATE, "SENATORIAL");
    assert.equal(LEVEL_FOR_RACE.REPRESENTATIVES, "FEDERAL");
    assert.equal(LEVEL_FOR_RACE.ASSEMBLY, "LGA");
    assert.equal(LEVEL_FOR_RACE.LGA, "LGA");
  });
});

describe("naming a territory on a screen", () => {
  it("places a district that does not say where it is", () => {
    assert.equal(describeTerritory(resolveTerritory("FEDERAL:24/ikeja")), "Ikeja, Lagos");
  });

  it("does not repeat a state that is already in the name", () => {
    assert.equal(describeTerritory(resolveTerritory("SENATORIAL:18/kaduna-central")), "Kaduna Central");
    assert.equal(describeTerritory(resolveTerritory("STATE:24")), "Lagos");
  });

  it("calls the federation by its name", () => {
    assert.equal(describeTerritory(resolveTerritory("NATION")), "Nigeria");
    assert.equal(describeTerritory(null), "Nigeria");
  });
});

describe("reading a local government off a unit code", () => {
  it("takes the first four digits however the code was punctuated", () => {
    assert.equal(lgaOf("24/13/04/006"), "24/13");
    assert.equal(lgaOf("241304006"), "24/13");
    assert.equal(lgaOf("24-13-04-006"), "24/13");
  });

  it("refuses anything too short to name one", () => {
    assert.equal(lgaOf("24"), null);
    assert.equal(lgaOf(""), null);
    assert.equal(lgaOf(null), null);
  });
});
