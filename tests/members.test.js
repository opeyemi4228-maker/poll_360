import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGE_BANDS,
  PARTIES,
  TIERS,
  childrenOf,
  coverage,
  coveredStates,
  demographicsAt,
  membersAt,
  qualityOf,
  registerFor,
  strengthAt,
  tierOf,
  votesAt,
} from "../lib/members.js";
import { SOKOTO_ADC } from "../lib/data/members-sokoto-adc.js";

/**
 * Party strength on the ground.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  This module holds one real membership register — 66,474 ADC members in
 *  Sokoto, to polling-unit level — and its whole job is refusing to invent
 *  the things around it.
 *
 *  There are three ways a screen like this lies, and all three are cheap:
 *
 *    It draws a party with no register at nought, so a rival nobody has
 *    counted looks like a rival who is not there.
 *
 *    It divides a state's votes among its wards, producing a ward-level
 *    figure that looks precise and is entirely fabricated.
 *
 *    It treats members as votes, and quotes a total that includes nineteen
 *    hundred people too young to vote.
 *
 *  Everything below is one of those three.
 * ══════════════════════════════════════════════════════════════════════════
 */

describe("what has actually been imported", () => {
  it("holds the Sokoto ADC register, to polling-unit level", () => {
    const [held] = coverage();
    assert.equal(held.party, "ADC");
    assert.equal(held.state, "Sokoto");
    assert.equal(held.members, 66_474);
    assert.equal(held.lgas, 23, "Sokoto has 23 local governments");
    assert.ok(held.wards > 1500);
    assert.ok(held.units > 7000);
  });

  it("carries no personal data whatsoever", () => {
    /* ── THE TEST THIS FILE EXISTS FOR ────────────────────────────────────
       The register this was built from holds names, ages, telephone numbers
       and National Identification Numbers for sixty-six thousand people. This
       repository is pushed to a remote, and a NIN in a git history cannot be
       recalled from every clone that has already taken it.

       So the shipped data is asserted to contain nothing that could identify
       anybody: no eleven-digit numbers, which is what both a NIN and a
       Nigerian mobile are. A refactor of the importer that started emitting
       them fails here rather than being noticed by a journalist. */
    const written = JSON.stringify(SOKOTO_ADC);
    assert.ok(!/\b\d{11}\b/.test(written), "an eleven-digit number reached the data file");
    assert.ok(!/\b0[789]\d{9}\b/.test(written), "a mobile number reached the data file");
  });

  it("says which parties have a register and which have none", () => {
    const adc = PARTIES.find((party) => party.id === "ADC");
    const apc = PARTIES.find((party) => party.id === "APC");

    /* ADC is not one of the four broken out in the 2023 state table, so it is
       not in PARTIES at all — that is a fact about the vote data, and the
       register is reached by its own name. */
    assert.equal(adc, undefined);
    assert.ok(apc, "the APC is on the ballot and must be listed");
    assert.deepEqual(apc.registers, [], "no APC register has been imported");
    assert.deepEqual(coveredStates("ADC"), ["SOK"]);
    assert.deepEqual(coveredStates("APC"), []);
  });
});

describe("drilling from a state to a polling unit", () => {
  it("walks all four tiers and every tier is a real place", () => {
    assert.deepEqual(TIERS, ["state", "lga", "ward", "unit"]);

    const lgas = childrenOf("ADC", "SOK", []);
    assert.equal(lgas.length, 23);

    const lga = lgas[0];
    const wards = childrenOf("ADC", "SOK", [lga.name]);
    assert.ok(wards.length > 0, `${lga.name} has no wards`);

    const units = childrenOf("ADC", "SOK", [lga.name, wards[0].name]);
    assert.ok(units.length > 0, `${wards[0].name} has no polling units`);

    assert.equal(tierOf([]), "state");
    assert.equal(tierOf([lga.name]), "lga");
    assert.equal(tierOf([lga.name, wards[0].name]), "ward");
    assert.equal(tierOf([lga.name, wards[0].name, units[0].name]), "unit");
  });

  it("adds up the same however deep you count it", () => {
    /* ── THE ONE ARITHMETIC INVARIANT ────────────────────────────────────
       A ward's total is its polling units. A local government's is its wards.
       The state's is its local governments. If any tier disagreed with the
       one below it, a reader drilling down would watch the number change
       under them and rightly stop believing all of it. */
    const state = membersAt("ADC", "SOK");
    let fromLgas = 0;

    for (const lga of childrenOf("ADC", "SOK", [])) {
      let fromWards = 0;

      for (const ward of childrenOf("ADC", "SOK", [lga.name])) {
        const fromUnits = childrenOf("ADC", "SOK", [lga.name, ward.name]).reduce(
          (sum, unit) => sum + unit.members,
          0
        );
        assert.equal(fromUnits, ward.members, `${lga.name} / ${ward.name} does not add up`);
        assert.equal(membersAt("ADC", "SOK", [lga.name, ward.name]), ward.members);
        fromWards += ward.members;
      }

      assert.equal(fromWards, lga.members, `${lga.name} does not add up from its wards`);
      assert.equal(membersAt("ADC", "SOK", [lga.name]), lga.members);
      fromLgas += lga.members;
    }

    assert.equal(fromLgas, state, "the state does not add up from its local governments");
  });

  it("measures a share against the tier above it, never against the state", () => {
    /* A ward holding 4% is 4% of its own local government. A percentage whose
       denominator silently changes as you drill is the commonest way one of
       these screens misleads somebody. */
    for (const path of [[], ["Binji"]]) {
      const rows = childrenOf("ADC", "SOK", path);
      const total = rows.reduce((sum, row) => sum + row.share, 0);
      assert.ok(Math.abs(total - 100) < 0.001, `shares at ${JSON.stringify(path)} sum to ${total}`);
    }
  });

  it("ranks by size, because the question is always where we are strongest", () => {
    const rows = childrenOf("ADC", "SOK", []);
    for (let index = 1; index < rows.length; index += 1) {
      assert.ok(rows[index - 1].members >= rows[index].members);
    }
  });

  it("returns nothing for a place that is not in the register", () => {
    assert.equal(membersAt("ADC", "SOK", ["Ikeja"]), null);
    assert.deepEqual(childrenOf("ADC", "SOK", ["Ikeja"]), []);
  });
});

describe("a party with no register", () => {
  it("is unknown, never nought", () => {
    /* ── THE MISTAKE THAT COSTS A CAMPAIGN AN ELECTION ────────────────────
       "No APC register has been imported" and "the APC has no members in
       Tambuwal" are different statements. A zero says the second when only
       the first is true, and a campaign reads it as a rival who is not there.
       Null means unknown and every screen prints a dash. */
    assert.equal(registerFor("APC", "SOK"), null);
    assert.equal(membersAt("APC", "SOK"), null);
    assert.equal(membersAt("PDP", "SOK", ["Binji"]), null);
    assert.equal(qualityOf("APC", "SOK"), null);
  });

  it("still reports the votes it does have", () => {
    /* No register does not mean no data. The APC's vote in Sokoto is
       published and real, and the two measures are independent. */
    const seen = votesAt("APC", "SOK");
    assert.equal(seen.known, true);
    assert.equal(seen.votes, 285_444);
    assert.ok(seen.share > 48 && seen.share < 49);
  });
});

describe("votes, and what this module refuses to invent", () => {
  it("has no vote for any place below a state, and says so", () => {
    /* ── THE FABRICATION THIS PREVENTS ───────────────────────────────────
       No by-local-government vote table is published for any Nigerian
       election in the sources this product holds. Dividing Sokoto's 586,815
       votes among its 244 wards would produce a figure that looks precise, is
       entirely invented, and would be planned against. */
    for (const path of [["Binji"], ["Binji", "Maikulki"], ["Binji", "Maikulki", "any"]]) {
      const seen = votesAt("APC", "SOK", path);
      assert.equal(seen.known, false);
      assert.equal(seen.why, "below-state");
      assert.equal(seen.votes, undefined, "no vote figure may be returned below a state");
    }
  });

  it("separates a party inside the other column from a party with no data", () => {
    /* The ADC contested 2023 and its vote is inside the five-column table's
       "other" bucket, undivided. A dash for both would let a reader conclude
       the party never stood. */
    const adc = votesAt("ADC", "SOK");
    assert.equal(adc.known, false);
    assert.equal(adc.why, "in-other");
    assert.ok(adc.bucket > 0, "the other column has votes in it");

    const nowhere = votesAt("APC", "ZZZ");
    assert.equal(nowhere.why, "no-state");
  });

  it("never combines members and votes into one figure", () => {
    /* A member is somebody who filled in a form; a vote is a mark on a
       ballot, counted. `strengthAt` hands both back separately and there is
       no third field mixing them, because the moment one exists somebody
       quotes it. */
    const seen = strengthAt("ADC", "SOK", []);
    assert.equal(seen.members, 66_474);
    assert.equal(seen.votes.known, false);

    const fields = Object.keys(seen);
    assert.deepEqual(fields.sort(), ["children", "members", "path", "tier", "votes"]);
  });
});

describe("what is wrong with the register", () => {
  const found = qualityOf("ADC", "SOK");

  it("says how many members cannot lawfully vote", () => {
    /* The most important number on the screen after the total. A campaign
       planning votes against a 66,474 register is counting 1,900 people who
       are too young to cast one. */
    const note = found.notes.find((item) => item.id === "under-18");
    assert.ok(note, "the under-eighteen finding is missing");
    assert.equal(note.count, 1_900);
    assert.equal(found.votingAge, 66_474 - 1_900);
  });

  it("reports repeated identification numbers without accusing anybody", () => {
    const note = found.notes.find((item) => item.id === "repeat-nin");
    assert.equal(note.count, 364);

    /* The product's whole credibility is that it questions figures and never
       accuses people. A repeated NIN is far more often a typing error. */
    const words = `${note.says} ${note.why}`.toLowerCase();
    for (const accusation of ["fraud", "fake", "rigg", "falsif", "cheat"]) {
      assert.ok(!words.includes(accusation), `the finding says "${accusation}"`);
    }
  });

  it("excludes rows filed under another state rather than reassigning them", () => {
    /* Two members are filed under local governments in Anambra and Edo.
       Guessing which Sokoto local government was meant would be inventing a
       member's location; they are named and left out. */
    const note = found.notes.find((item) => item.id === "outside-state");
    assert.ok(note.says.includes("Ihiala"));
    assert.ok(note.says.includes("Uhunmwonde"));

    const codes = childrenOf("ADC", "SOK", []).map((row) => row.name);
    assert.ok(!codes.includes("Ihiala"));
    assert.ok(!codes.includes("Uhunmwonde"));
  });

  it("orders its findings worst first", () => {
    const rank = { SERIOUS: 2, INFO: 1 };
    const ranks = found.notes.map((note) => rank[note.severity]);
    assert.deepEqual(ranks, [...ranks].sort((a, b) => b - a));
  });
});

describe("who the members are", () => {
  it("splits by gender and age at a state, a local government and a ward", () => {
    const state = demographicsAt("ADC", "SOK", []);
    assert.equal(state.total, 66_474);
    assert.equal(state.men + state.women, state.total);

    const lga = childrenOf("ADC", "SOK", [])[0];
    const inLga = demographicsAt("ADC", "SOK", [lga.name]);
    assert.equal(inLga.total, lga.members, "the breakdown must reach the count on the map");

    const ward = childrenOf("ADC", "SOK", [lga.name])[0];
    const inWard = demographicsAt("ADC", "SOK", [lga.name, ward.name]);
    assert.ok(inWard, "a ward has a breakdown");
    assert.equal(inWard.total, ward.members);
  });

  it("has no breakdown for a polling unit, and says null rather than zeroes", () => {
    /* ── AN ABSENT CHART AND AN EMPTY ONE LOOK ALIKE ─────────────────────
       Seven counters across 7,433 booths is a large file to answer a question
       nobody asks of one booth. So the register holds a count there and no
       split, and this returns null so the card can say which — a row of
       zeroes would read as a booth whose members have no ages. */
    const lga = childrenOf("ADC", "SOK", [])[0];
    const ward = childrenOf("ADC", "SOK", [lga.name])[0];
    const unit = childrenOf("ADC", "SOK", [lga.name, ward.name])[0];

    assert.ok(membersAt("ADC", "SOK", [lga.name, ward.name, unit.name]) > 0);
    assert.equal(demographicsAt("ADC", "SOK", [lga.name, ward.name, unit.name]), null);
  });

  it("adds every band up to the people counted there", () => {
    for (const path of [[], ["Binji"]]) {
      const seen = demographicsAt("ADC", "SOK", path);
      const fromBands = seen.bands.reduce((sum, band) => sum + band.count, 0);
      assert.equal(fromBands, seen.total, `bands do not reach the total at ${JSON.stringify(path)}`);
      assert.ok(Math.abs(seen.menShare + seen.womenShare - 100) < 0.001);
    }
  });

  it("keeps under-eighteen out of the bands that can vote", () => {
    /* It is not another slice of the electorate, it is the count of people who
       cannot lawfully cast a vote. A card that draws it beside "26 to 35"
       invites a campaign to plan votes it does not have. */
    const under = AGE_BANDS.find((band) => band.id === "u18");
    assert.equal(under.canVote, false);
    assert.ok(AGE_BANDS.filter((band) => band.canVote).length === 4);

    const seen = demographicsAt("ADC", "SOK", []);
    assert.equal(seen.cannotVote, 1_900);
    assert.equal(seen.votingAge, seen.total - 1_900);
  });

  it("gives a party with no register no breakdown", () => {
    assert.equal(demographicsAt("APC", "SOK", []), null);
  });
});
