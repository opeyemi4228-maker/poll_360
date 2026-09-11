import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ELECTIONS,
  MAPPABLE,
  NATIONAL_ONLY,
  COUNTED_STATES,
  STRONGHOLD,
  bandOf,
  biggest,
  bucketOf,
  carriedBy,
  concentration,
  countedUnitsOf,
  electionOf,
  hasCountedUnits,
  modelState,
  runsOf,
  scenario,
  stateSeries,
  tally,
  unitsOfWard,
  wardsOf,
  winnerOf,
} from "../lib/strongholds.js";
import { MODELLED } from "../lib/data/units-modelled.js";

const book = (number) =>
  JSON.parse(readFileSync(new URL(`../public/geo/units/${number}.json`, import.meta.url), "utf8"));

const ANAMBRA = book("04");
const SOKOTO = book("33");

/* ══════════════════════════════════════════════════════════════════════════
   THE RECORD
   ══════════════════════════════════════════════════════════════════════════ */

describe("what the record actually holds", () => {
  it("carries seven presidential elections, 1999 to 2023", () => {
    assert.deepEqual(
      ELECTIONS.map((election) => election.year),
      [1999, 2003, 2007, 2011, 2015, 2019, 2023]
    );
  });

  it("knows which two published no state table", () => {
    /* 2007 and 2011. The whole reason this module distinguishes mappable from
       national: drawing them as blank states would be a lie, and drawing them
       as zero would be a worse one. */
    assert.deepEqual(
      NATIONAL_ONLY.map((election) => election.year),
      [2007, 2011]
    );
    assert.deepEqual(
      MAPPABLE.map((election) => election.year),
      [1999, 2003, 2015, 2019, 2023]
    );
  });

  it("keys 2023 by party, though the source stores it by position", () => {
    /* The source array is APC, PDP, LP, NNPP, bucket. Getting that order wrong
       does not throw — it credits one candidate with another's votes — so the
       published national figures are asserted outright. */
    const national = electionOf(2023).national;
    assert.equal(national.APC, 8_805_420);
    assert.equal(national.PDP, 6_980_290);
    assert.equal(national.LP, 6_091_017);
    assert.equal(national.NNPP, 1_496_671);
  });

  it("gives every mappable election a row for all thirty-seven places", () => {
    for (const election of MAPPABLE) {
      assert.equal(election.rows.length, 37, `${election.year} has ${election.rows.length} rows`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   WHO WAS ON THE BALLOT
   ══════════════════════════════════════════════════════════════════════════ */

describe("a candidate's own runs", () => {
  it("finds Atiku in 2007, 2019 and 2023 — and not in between", () => {
    /* The finding that makes this module necessary. He contested 2007 for the
       Action Congress, against the PDP; 2011 and 2015 he did not contest at
       all. Reading his record off the PDP's column would credit him with three
       elections that were not his. */
    const runs = runsOf("Atiku Abubakar");
    assert.deepEqual(
      runs.map((run) => [run.year, run.party]),
      [
        [2007, "AC"],
        [2019, "PDP"],
        [2023, "PDP"],
      ]
    );
  });

  it("marks the run that cannot be drawn on a map", () => {
    const runs = runsOf("Atiku Abubakar");
    assert.equal(runs.find((run) => run.year === 2007).mappable, false);
    assert.equal(runs.find((run) => run.year === 2023).mappable, true);
  });

  it("carries the published national figure for each run", () => {
    const runs = runsOf("Atiku Abubakar");
    assert.equal(runs.find((run) => run.year === 2019).votes, 11_262_978);
    assert.equal(runs.find((run) => run.year === 2023).votes, 6_980_290);
  });

  it("knows nobody by a name nobody ran under", () => {
    assert.deepEqual(runsOf("Nobody At All"), []);
    assert.deepEqual(runsOf(""), []);
    assert.deepEqual(runsOf(null), []);
  });
});

describe("how often a candidate carried a state", () => {
  it("counts only their own runs, and only the readable ones", () => {
    /* Atiku has three runs and 2007 published no state table, so every state is
       checkable twice, never three times. "1 of 3" would report a loss in an
       election nobody can read. */
    const kano = carriedBy("KAN", "Atiku Abubakar");
    assert.equal(kano.of, 2);
    assert.equal(kano.unreadable, 1);
  });

  it("says he lost Kano both times", () => {
    /* Buhari in 2019, Kwankwaso in 2023. A state this size going twice against
       him is the sort of thing a stronghold map must not soften. */
    const kano = carriedBy("KAN", "Atiku Abubakar");
    assert.equal(kano.carried, 0);
    assert.equal(kano.always, false);
    assert.equal(kano.streak, 0);
  });

  it("separates a streak from a count", () => {
    /* Sokoto: lost in 2019, carried in 2023. One of two either way, and the
       streak is what tells them apart — a state carried once and lost since is
       not a stronghold. */
    const sokoto = carriedBy("SOK", "Atiku Abubakar");
    assert.equal(sokoto.carried, 1);
    assert.equal(sokoto.streak, 1);
    assert.equal(sokoto.always, false);
  });

  it("never calls an unreadable state a stronghold", () => {
    const nowhere = carriedBy("ZZZ", "Atiku Abubakar");
    assert.equal(nowhere.of, 0);
    assert.equal(nowhere.always, false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   THE STATE SERIES
   ══════════════════════════════════════════════════════════════════════════ */

describe("one state across the record", () => {
  it("returns a row per mappable election", () => {
    const series = stateSeries("LAG");
    assert.deepEqual(series.map((row) => row.year), [1999, 2003, 2015, 2019, 2023]);
  });

  it("never names the bucket as a winner", () => {
    /* "Other parties" carrying a state is not a fact about who won it. */
    for (const row of stateSeries("LAG")) assert.notEqual(row.winner, "OTH");
  });

  it("has shares that sum to a hundred", () => {
    for (const row of stateSeries("KAN")) {
      const total = Object.values(row.shares).reduce((sum, share) => sum + share, 0);
      assert.ok(Math.abs(total - 100) < 0.01, `${row.year} sums to ${total}`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   BANDS
   ══════════════════════════════════════════════════════════════════════════ */

describe("stronghold bands", () => {
  it("puts each share in the band its own label claims", () => {
    assert.equal(bandOf(82).id, "FORTRESS");
    assert.equal(bandOf(70).id, "FORTRESS");
    assert.equal(bandOf(69.9).id, "STRONG");
    assert.equal(bandOf(45).id, "HELD");
    assert.equal(bandOf(44.9).id, "THIN");
    assert.equal(bandOf(0).id, "LOST");
  });

  it("gives nothing a band rather than the bottom one", () => {
    /* A place with no figure is unknown, not lost. Those are different colours
       and drawing one as the other invents a defeat. */
    assert.equal(bandOf(null), null);
    assert.equal(bandOf(undefined), null);
    assert.equal(bandOf(Number.NaN), null);
  });

  it("has bands that descend without a gap", () => {
    for (let index = 1; index < STRONGHOLD.length; index += 1) {
      assert.ok(STRONGHOLD[index].from < STRONGHOLD[index - 1].from);
    }
    assert.equal(STRONGHOLD.at(-1).from, 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   THE GEOGRAPHY
   ══════════════════════════════════════════════════════════════════════════ */

describe("the real unit tree", () => {
  it("builds unit codes from the state number, not the letter code", () => {
    /* The bug this catches joined zero of 3,679 counted Anambra units: the
       geography file carries both `state` ("04") and `code` ("ANA"), and a key
       built from the letters is well-formed and matches nothing. */
    const wards = wardsOf(ANAMBRA);
    assert.match(wards[0].units[0].code, /^04\/\d{2}\/\d{2}\/\d{3}$/);
  });

  it("carries every ward in the state", () => {
    assert.equal(wardsOf(ANAMBRA).length, 326);
    assert.ok(wardsOf(SOKOTO).length > 200);
  });

  it("keeps the real names, which is the half that is counted", () => {
    const ward = wardsOf(ANAMBRA).find((entry) => entry.lga === "Aguata");
    assert.ok(ward.name.length > 0);
    assert.ok(ward.units.every((unit) => unit.name.length > 0));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   COUNTED UNITS
   ══════════════════════════════════════════════════════════════════════════ */

describe("the states where real unit figures exist", () => {
  it("is Anambra 2023, and says how much of it", () => {
    assert.equal(COUNTED_STATES.length, 1);
    const [anambra] = COUNTED_STATES;
    assert.equal(anambra.code, "ANA");
    assert.equal(anambra.units, 3679);
    assert.ok(anambra.coverage > 60 && anambra.coverage < 70);
  });

  it("knows which state-and-year it holds and which it does not", () => {
    assert.equal(hasCountedUnits("04", 2023), true);
    assert.equal(hasCountedUnits("04", 2019), false);
    assert.equal(hasCountedUnits("33", 2023), false);
  });

  it("maps transcribed parties into this product's slot order", () => {
    const counted = countedUnitsOf("04", 2023);
    assert.deepEqual(counted.slots, ["APC", "PDP", "LP", "NNPP", "OTH"]);

    /* Obi's own state. If the slot mapping were off by one, LP's votes would
       land on somebody else and this would fail. */
    let lp = 0;
    let apc = 0;
    for (const unit of counted.units.values()) {
      lp += unit.votes[2];
      apc += unit.votes[0];
    }
    assert.ok(lp > apc * 10, `LP ${lp} should dwarf APC ${apc} in Anambra`);
  });

  it("leaves the bucket at zero rather than inventing it", () => {
    /* A transcription of four parties does not know what the other candidates
       polled. Filling the bucket from the difference would turn a missing
       figure into a fabricated one. */
    const counted = countedUnitsOf("04", 2023);
    for (const unit of counted.units.values()) assert.equal(unit.votes[4], 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   THE MODEL
   ══════════════════════════════════════════════════════════════════════════ */

describe("modelling a state onto its real places", () => {
  it("sums back to the figure INEC declared", () => {
    /* `apportion`'s guarantee, and the property that makes a modelled ward
       worth drawing: wrong about the ward, right about the state. */
    const model = modelState({ book: SOKOTO, year: 2023 });
    const published = electionOf(2023).rows.find((row) => row.code === "SOK").votes;

    model.slots.forEach((party, slot) => {
      const modelled = model.wardRows.reduce((sum, row) => sum + row.votes[slot], 0);
      assert.equal(modelled, published[party], `${party} does not sum back`);
    });
  });

  it("puts the real booth counts back after apportioning", () => {
    const model = modelState({ book: SOKOTO, year: 2023 });
    for (const row of model.wardRows) {
      assert.equal(row.booths, model.byKey.get(row.name).units.length);
    }
  });

  it("gives the same answer twice", () => {
    /* Deterministic, or a planner watching the map redraw on every render
       cannot tell a scenario from noise. */
    const once = modelState({ book: SOKOTO, year: 2023 }).wardRows.map((row) => row.total);
    const twice = modelState({ book: SOKOTO, year: 2023 }).wardRows.map((row) => row.total);
    assert.deepEqual(once, twice);
  });

  it("refuses an election that published no state table", () => {
    assert.equal(modelState({ book: SOKOTO, year: 2007 }), null);
    assert.equal(modelState({ book: SOKOTO, year: 2011 }), null);
  });

  it("scales to the slice when only part of a state is drawn", () => {
    /* Three local governments must not be shown casting a state's ballots. */
    const whole = modelState({ book: SOKOTO, year: 2023 });
    const slice = modelState({ book: SOKOTO, year: 2023, only: [whole.wards[0].lgaKey] });
    const sum = (model) => model.wardRows.reduce((total, row) => total + row.total, 0);
    assert.ok(sum(slice) < sum(whole));
    assert.ok(slice.fraction > 0 && slice.fraction < 1);
  });
});

describe("units within a ward", () => {
  it("hands back transcriptions in a counted state", () => {
    const model = modelState({ book: ANAMBRA, year: 2023 });
    const units = unitsOfWard({ model, wardKey: model.wards[0].key });
    assert.ok(units.some((unit) => unit.counted === true));
  });

  it("marks an untranscribed booth unknown, never zero", () => {
    /* A booth with no sheet did not cast no votes. It has a `why` and a null
       total, and a screen that drew it as a zero would report a turnout
       collapse that never happened. */
    const model = modelState({ book: ANAMBRA, year: 2023 });
    const units = unitsOfWard({ model, wardKey: model.wards[0].key });
    const missing = units.filter((unit) => !unit.counted);
    assert.ok(missing.length > 0, "this ward is fully transcribed; pick another for the test");
    for (const unit of missing) {
      assert.equal(unit.total, null);
      assert.equal(unit.registered, null);
      assert.match(unit.why, /sheet/i);
    }
  });

  it("models them where nothing was transcribed, and says so", () => {
    const model = modelState({ book: SOKOTO, year: 2023 });
    const units = unitsOfWard({ model, wardKey: model.wards[0].key });
    assert.ok(units.length > 0);
    for (const unit of units) assert.equal(unit.counted, false);
  });

  it("sums modelled units back to their own ward", () => {
    const model = modelState({ book: SOKOTO, year: 2023 });
    const wardKey = model.wards[0].key;
    const wardRow = model.wardRows.find((row) => row.name === wardKey);
    const units = unitsOfWard({ model, wardKey });

    model.slots.forEach((_, slot) => {
      const summed = units.reduce((total, unit) => total + unit.votes[slot], 0);
      assert.equal(summed, wardRow.votes[slot]);
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   SCENARIOS
   ══════════════════════════════════════════════════════════════════════════ */

describe("moving a party and seeing what changes hands", () => {
  const rows = [
    { votes: [500, 400, 100, 0, 0], total: 1000 },
    { votes: [300, 600, 100, 0, 0], total: 1000 },
  ];

  it("takes the points it gives from the others", () => {
    /* Adding to one party and leaving the rest is not a scenario, it is an
       arithmetic error: the shares stop summing to a hundred and every margin
       on the screen is then wrong in the same direction. */
    const [first] = scenario(rows, { slot: 1, swing: 10 });
    const cast = first.votes.reduce((sum, n) => sum + n, 0);
    assert.ok(Math.abs(cast - 1000) <= 2, `cast drifted to ${cast}`);
    assert.ok(Math.abs(first.votes[1] / cast - 0.5) < 0.01);
  });

  it("reports the places that changed hands", () => {
    const moved = scenario(rows, { slot: 1, swing: 10 }).filter((row) => row.moved);
    assert.equal(moved.length, 1);
    assert.equal(moved[0].was, 0);
  });

  it("does not move a place that was already held", () => {
    const [, second] = scenario(rows, { slot: 1, swing: 10 });
    assert.equal(second.moved, false);
  });

  it("refuses to produce a negative vote", () => {
    for (const row of scenario(rows, { slot: 1, swing: -99 })) {
      for (const count of row.votes) assert.ok(count >= 0, `${count} is negative`);
    }
  });

  it("scales the whole place on turnout without moving a share", () => {
    /* A place voting more heavily elects the same person. Turnout changes what
       a place is worth in a total, not who wins it. */
    const [first] = scenario(rows, { slot: 1, swing: 0, turnout: 20 });
    assert.ok(first.total > 1100);
    assert.equal(first.moved, false);
    assert.equal(winnerOf(first.votes), 0);
  });

  it("leaves an empty place empty", () => {
    const [dead] = scenario([{ votes: [0, 0, 0, 0, 0], total: 0 }], { slot: 1, swing: 30 });
    assert.equal(dead.total, 0);
    assert.equal(dead.moved, false);
  });
});

describe("who leads", () => {
  it("ignores the bucket in the last slot", () => {
    /* "Other parties" out-polling every named candidate does not make them the
       winner of the place. */
    assert.equal(winnerOf([10, 20, 5, 1, 900]), 1);
  });

  it("says nobody when nothing was cast", () => {
    assert.equal(winnerOf([0, 0, 0, 0, 0]), null);
  });

  it("finds the bucket by name, never by position", () => {
    assert.equal(bucketOf(["APC", "PDP", "LP", "NNPP", "OTH"]), 4);
    /* 1999. Two parties, no bucket — so nothing may be skipped. */
    assert.equal(bucketOf(["PDP", "AD-APP"]), -1);
    assert.equal(bucketOf([]), -1);
  });

  it("lets the last slot win when it is a party and not a bucket", () => {
    /* ── THE REGRESSION ────────────────────────────────────────────────
       1999 fielded Obasanjo's PDP and Olu Falae's AD-APP and no "other"
       bucket. A winner test that skips the last position skips Falae, and the
       first run of the national model duly reported the PDP carrying 176,598
       of 176,623 booths — a hundred percent of a country in an election it won
       with 62.8% of the vote. Nothing errored. */
    assert.equal(winnerOf([100, 400], bucketOf(["PDP", "AD-APP"])), 1);
  });

  it("still skips a real bucket when told where it is", () => {
    assert.equal(winnerOf([10, 20, 900], bucketOf(["APC", "PDP", "OTH"])), 1);
  });

  it("carries the bucket into a scenario and a tally", () => {
    const rows = [{ votes: [100, 400], total: 500 }];
    const bucket = bucketOf(["PDP", "AD-APP"]);

    assert.equal(tally(rows, 1, bucket).won, 1);
    /* And with the old assumption, slot 1 could never be credited. */
    assert.equal(tally(rows, 1).won, 0);

    const [swung] = scenario(rows, { slot: 0, swing: 40, bucket });
    assert.equal(swung.moved, true);
    assert.equal(swung.was, 1);
  });
});

describe("the national model that ships with this product", () => {
  it("never has one party carrying the whole country", () => {
    /* The shape of the bug above, asserted against the generated table itself
       rather than against the function — a future change to either one that
       reintroduces it fails here. */
    for (const [year, block] of Object.entries(MODELLED)) {
      const total = block.states.reduce((sum, state) => sum + state.units, 0);
      for (const [index, party] of block.slots.entries()) {
        const won = block.states.reduce((sum, state) => sum + state.won[index], 0);
        assert.ok(
          won < total * 0.97,
          `${party} carries ${won} of ${total} booths in ${year}`
        );
      }
    }
  });

  it("counts the same booths every election", () => {
    const counts = Object.values(MODELLED).map((block) =>
      block.states.reduce((sum, state) => sum + state.units, 0)
    );
    assert.deepEqual([...new Set(counts)], [176623]);
  });

  it("marks Anambra's transcribed booths and nowhere else's", () => {
    const states = MODELLED[2023].states;
    const counted = states.filter((state) => state.counted > 0);
    assert.equal(counted.length, 1);
    assert.equal(counted[0].code, "ANA");
    assert.equal(counted[0].counted, 3679);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   TALLIES
   ══════════════════════════════════════════════════════════════════════════ */

describe("counting up a set of places", () => {
  const rows = [
    { votes: [500, 400, 100, 0, 0], total: 1000 },
    { votes: [300, 600, 100, 0, 0], total: 1000 },
    { votes: [200, 700, 100, 0, 0], total: 1000 },
  ];

  it("counts places won and votes cast separately", () => {
    /* The two figures a planner holds against each other: a party can carry
       most of the places and lose on votes. */
    const out = tally(rows, 1);
    assert.equal(out.won, 2);
    assert.equal(out.places, 3);
    assert.equal(out.votes, 1700);
    assert.ok(Math.abs(out.share - 66.67) < 0.1);
  });

  it("reports a share of the places counted, not of the country", () => {
    assert.equal(tally(rows.slice(0, 1), 1).places, 1);
    assert.equal(tally([], 1).share, 0);
  });
});

describe("size and concentration", () => {
  const rows = [
    { registered: 100, total: 80 },
    { registered: 900, total: 500 },
    { registered: 500, total: 300 },
  ];

  it("ranks the biggest by register", () => {
    assert.deepEqual(biggest(rows, 2).map((row) => row.registered), [900, 500]);
  });

  it("does not mutate what it was given", () => {
    biggest(rows, 2);
    assert.equal(rows[0].registered, 100);
  });

  it("says how much of the vote sits in the largest places", () => {
    const out = concentration(rows, 1 / 3);
    assert.equal(out.places, 1);
    assert.equal(out.of, 3);
    assert.ok(out.registerShare > 55 && out.registerShare < 65);
  });
});
