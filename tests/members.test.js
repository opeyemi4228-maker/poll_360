import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { before, describe, it } from "node:test";

import {
  AGE_BANDS,
  BARE_MEMBERS,
  CANDIDATES,
  STRENGTH_OF,
  PARTIES,
  TIERS,
  childrenOf,
  coverage,
  coveredStates,
  demographicsAt,
  ratioAt,
  strengthBand,
  membersAt,
  qualityOf,
  registerFor,
  strengthAt,
  tierOf,
  votesAt,
  hasDetail,
  loadDetail,
} from "../lib/members.js";

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

/* Sokoto is the state these tests drill into, so its wards and polling units
   have to be fetched before any of them run. Every other state stays
   unfetched on purpose — "a tier nobody has downloaded" is a state this
   module has to get right, and it is asserted below. */
before(async () => {
  await loadDetail("ADC", "SOK");
});

/**
 * How many state registers are actually on disk.
 *
 * ── DERIVED, BECAUSE THE HARDCODED 37 WAS WRONG AND SILENT ────────────────
 * These tests asserted all 36 states and the FCT. Twenty-eight registers have
 * been imported; the other nine the ADC has not published in a form this
 * product has read. The assertion did not catch a missing import — it fired
 * only once the index was built, long after the module had been written to
 * expect files that were never there.
 *
 * Counting the directory means importing the twenty-ninth state breaks
 * nothing, and an index that silently drops one still fails.
 */
const REGISTERS = readdirSync(join(process.cwd(), "lib", "data")).filter((name) =>
  /^members-[a-z]{3}-adc\.js$/.test(name)
).length;

describe("what has actually been imported", () => {
  it("holds one row per register imported, and no row for a state without one", () => {
    const rows = coverage();
    assert.equal(
      rows.length,
      REGISTERS,
      "the index and the state files on disk disagree — re-run scripts/build-member-index.mjs"
    );
    /* A state nobody has imported must be absent rather than present at
       nought. Nought members is a claim about the ADC that nobody has made;
       absent is answered as null, which is the truth. */
    assert.ok(rows.length > 0 && rows.length <= 37);
    assert.ok(
      rows.every((row) => row.party === "ADC"),
      "only the ADC register has been imported"
    );

    /* Sorted biggest first, because the question asked of this list is always
       "where is the party strongest". */
    for (let index = 1; index < rows.length; index += 1) {
      assert.ok(rows[index - 1].members >= rows[index].members);
    }

    const sokoto = rows.find((row) => row.stateCode === "SOK");
    assert.equal(sokoto.state, "Sokoto");
    assert.equal(sokoto.members, 66_474);
    assert.equal(sokoto.lgas, 23, "Sokoto has 23 local governments");
    /* Fewer ward names than the raw register held, because its spellings are
       folded — see "the register's own ward names" below. Still far more than
       INEC's 244, which is why no vote estimate is offered below a local
       government. */
    assert.ok(sokoto.wards > 1000 && sokoto.wards < 1568);
    assert.ok(sokoto.units > 7000);
  });

  it("counts every state's wards and booths without fetching them", () => {
    /* ── THE CAPTION MUST BE TRUE BEFORE THE FILES ARRIVE ────────────────
       Only Sokoto's detail is loaded, yet the coverage line quotes ward and
       polling-unit counts for all 37. They are counted at import time and
       carried in the index for exactly this reason: a caption that said
       "0 polling units" for every state nobody had opened would be false, and
       it would look like a register with nothing in it. */
    for (const row of coverage()) {
      if (row.stateCode === "SOK") continue;
      assert.equal(hasDetail("ADC", row.stateCode), false, `${row.state} was fetched`);
      assert.ok(row.lgas > 0, `${row.state} reports no local governments`);
      assert.ok(row.wards > 0, `${row.state} reports no wards`);
      assert.ok(row.units > 0, `${row.state} reports no polling units`);
    }
  });

  it("carries no personal data whatsoever, in any shipped file", () => {
    /* ── THE TEST THIS FILE EXISTS FOR ────────────────────────────────────
       The registers this was built from hold names, ages, telephone numbers
       and National Identification Numbers for millions of people. This
       repository is pushed to a remote, and a NIN in a git history cannot be
       recalled from every clone that has already taken it.

       So every shipped file is asserted to contain nothing that could
       identify anybody: no eleven-digit numbers, which is what both a NIN and
       a Nigerian mobile are. It reads them off disk rather than through the
       module, because the risk is what was written, not what is exported — a
       file nothing imports yet is still a file in the history.

       A refactor of the importer that started emitting them fails here rather
       than being noticed by a journalist. */
    const folder = join(process.cwd(), "lib", "data");
    const files = readdirSync(folder).filter((name) => /^members-.*\.js$/.test(name));

    /* Every register plus the index, and the count is derived so that a file
       appearing or disappearing cannot quietly drop out of this scan. The
       check that matters is the loop below; this one only guarantees the loop
       is not running over an empty list. */
    assert.equal(
      files.length,
      REGISTERS + 1,
      `expected ${REGISTERS} registers and one index, found ${files.length} files`
    );
    assert.ok(REGISTERS > 0, "no member registers found at all");

    for (const name of files) {
      const written = readFileSync(join(folder, name), "utf8");
      const eleven = written.match(/\b\d{11}\b/);
      assert.equal(eleven, null, `${name} contains ${eleven?.[0]}, which is a NIN or a telephone`);
      const mobile = written.match(/\b0[789]\d{9}\b/);
      assert.equal(mobile, null, `${name} contains the mobile number ${mobile?.[0]}`);
    }
  });

  it("keeps the wards out of the file every browser downloads", async () => {
    /* ── WHY THE SPLIT IS A TEST AND NOT A PREFERENCE ────────────────────
       The index is loaded eagerly by a client component, so anything in it is
       downloaded by everybody who opens the dashboard. The ward and
       polling-unit detail is megabytes. A change that folded it back into the
       index would not fail anything — the screens would work perfectly, and
       every visitor would silently pay for 36 states they never opened.

       Checked on the parsed object rather than on the text of the file: the
       index does legitimately carry the word "wards", because each state
       records HOW MANY wards it has so a caption can say so without fetching
       them. Counting them is the opposite of shipping them. */
    /* Not named `module`: Next refuses that identifier anywhere in the tree,
       because in a CommonJS scope it shadows the real one. */
    const loaded = await import("../lib/data/members-adc-index.js");
    const index = Object.values(loaded)[0];

    for (const [code, state] of Object.entries(index.states)) {
      assert.equal(typeof state.counts.wards, "number", `${code} does not count its wards`);

      for (const [name, lga] of Object.entries(state.lgas)) {
        assert.ok(!("wards" in lga), `${code} / ${name} carries its wards in the index`);
        assert.ok(!("units" in lga), `${code} / ${name} carries its polling units in the index`);
        assert.equal(typeof lga.members, "number", `${code} / ${name} has no count`);
      }
    }

    /* And the split has to have been worth making. */
    const folder = join(process.cwd(), "lib", "data");
    const size = (name) => statSync(join(folder, name)).size;
    const detail = readdirSync(folder)
      .filter((name) => /^members-[a-z]{3}-adc\.js$/.test(name))
      .reduce((total, name) => total + size(name), 0);

    assert.ok(
      size("members-adc-index.js") * 4 < detail,
      "the index is not materially smaller than the state files it exists to avoid loading"
    );
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
    assert.equal(coveredStates("ADC").length, REGISTERS);
    assert.ok(coveredStates("ADC").includes("SOK"));
    assert.ok(coveredStates("ADC").includes("LAG"));
    assert.deepEqual(coveredStates("APC"), []);
  });
});

describe("a state whose detail has not been fetched", () => {
  /* ── THE PROPERTY THE LAZY SPLIT LIVES OR DIES BY ──────────────────────
     Lagos is never loaded by these tests. Everything the index carries about
     it must still be right, and everything beneath a local government must
     read as UNKNOWN rather than as nought.

     A ward drawn at nought because its file is still in flight is a ward a
     campaign writes off, and it would right itself a second later with nobody
     aware of what they had just been shown. */
  it("still knows the state and its local governments", () => {
    assert.equal(hasDetail("ADC", "LAG"), false);
    assert.ok(membersAt("ADC", "LAG") > 0, "the state total comes from the index");

    const lgas = childrenOf("ADC", "LAG", []);
    assert.ok(lgas.length > 0, "the local governments come from the index");
    assert.ok(membersAt("ADC", "LAG", [lgas[0].name]) > 0);

    /* And the gender and age split, which the index also carries. */
    assert.ok(demographicsAt("ADC", "LAG", [])?.total > 0);
    assert.ok(demographicsAt("ADC", "LAG", [lgas[0].name])?.total > 0);
  });

  it("says unknown below a local government, never nought", () => {
    const lga = childrenOf("ADC", "LAG", [])[0].name;

    assert.equal(
      membersAt("ADC", "LAG", [lga, "any ward"]),
      null,
      "an unfetched ward reported a membership figure"
    );
    assert.notEqual(membersAt("ADC", "LAG", [lga, "any ward"]), 0, "unknown was reported as nought");
    assert.deepEqual(childrenOf("ADC", "LAG", [lga]), []);
    assert.equal(demographicsAt("ADC", "LAG", [lga, "any ward"]), null);
  });

  it("fetches on request, and then answers the same questions", async () => {
    /* The other half of the contract: what was unknown becomes known, and
       nothing about the tiers above it changes when it does. */
    const before = membersAt("ADC", "EBO");
    const lgas = childrenOf("ADC", "EBO", []).map((row) => row.name);

    assert.deepEqual(childrenOf("ADC", "EBO", [lgas[0]]), [], "not fetched yet");

    const loaded = await loadDetail("ADC", "EBO");
    assert.ok(loaded, "the state file did not arrive");
    assert.equal(hasDetail("ADC", "EBO"), true);

    assert.equal(membersAt("ADC", "EBO"), before, "the state total moved when its wards arrived");
    assert.deepEqual(childrenOf("ADC", "EBO", []).map((row) => row.name), lgas);

    const wards = childrenOf("ADC", "EBO", [lgas[0]]);
    assert.ok(wards.length > 0, "no wards after fetching");
    assert.equal(
      wards.reduce((sum, ward) => sum + ward.members, 0),
      membersAt("ADC", "EBO", [lgas[0]]),
      "the wards do not add up to the local government the index already held"
    );
  });

  it("asks once however many screens want it", async () => {
    /* Two components mounting together must not start two downloads. */
    const [one, two] = await Promise.all([loadDetail("ADC", "EKI"), loadDetail("ADC", "EKI")]);
    assert.ok(one);
    assert.equal(one, two, "the same fetch was not shared");
  });

  it("returns nothing for a state no register covers, rather than throwing", () => {
    assert.equal(registerFor("ADC", "ZZZ"), null);
    assert.equal(membersAt("ADC", "ZZZ"), null);
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

describe("how strong is strong", () => {
  it("measures a place against the even split of its own tier", () => {
    /* ── WHY NOT A FIXED PERCENTAGE ──────────────────────────────────────
       A state has 23 local governments, so an even split is 4.3% and nothing
       ever reaches 10%: on a fixed rule every local government in Nigeria is
       weak. A ward with four booths splits 25% each, so every booth in it is
       strong. The same number means opposite things one tier apart. */
    const even = 100 / 23;

    assert.equal(strengthBand(5000, even * 2.5, 23), "HEAVY");
    assert.equal(strengthBand(5000, even * 1.5, 23), "ABOVE");
    assert.equal(strengthBand(5000, even * 0.8, 23), "BELOW");
    assert.equal(strengthBand(5000, even * 0.3, 23), "THIN");

    /* The identical share, one tier down among four siblings, is thin. */
    assert.equal(strengthBand(5000, even * 2.5, 4), "THIN");
  });

  it("calls anything under ten members bare, however large its share", () => {
    /* Eight members out of twenty is 40% and reads as a stronghold. It is
       eight people. This is the band a campaign asked to find at a glance. */
    assert.equal(strengthBand(BARE_MEMBERS - 1, 90, 2), "BARE");
    assert.equal(strengthBand(BARE_MEMBERS - 1, 0.1, 500), "BARE");
    /* Ten members is not bare. The share here is a quarter of the even split
       among 500 siblings (0.2%), so it lands thin on its own merits. */
    assert.equal(strengthBand(BARE_MEMBERS, 0.05, 500), "THIN", "ten is not bare");
  });

  it("has no band for a place nobody has counted", () => {
    assert.equal(strengthBand(null, 0, 10), null);
  });

  it("gives every band a colour and a reason", () => {
    for (const id of ["BARE", "THIN", "BELOW", "ABOVE", "HEAVY"]) {
      assert.ok(STRENGTH_OF[id], `${id} is not defined`);
      assert.ok(STRENGTH_OF[id].fill.startsWith("var("));
      assert.ok(STRENGTH_OF[id].why.length > 0);
    }
  });
});

describe("the register against a candidate's vote", () => {
  it("measures ADC members against Atiku's vote in Sokoto", () => {
    const seen = ratioAt("ADC", "SOK", "PDP", []);
    assert.equal(seen.known, true);
    assert.equal(seen.candidate.name, "Atiku Abubakar");
    assert.equal(seen.votes, 288_679);
    assert.equal(seen.members, 66_474);
    assert.ok(seen.ratio > 22 && seen.ratio < 24);
  });

  it("offers the voting-age numerator beside the whole register", () => {
    /* 1,900 of the register cannot lawfully vote. A ratio quoted against a
       candidate's vote is being used to reason about votes, so the reader
       needs both figures and needs to see which one a number came from. */
    const seen = ratioAt("ADC", "SOK", "PDP", []);
    assert.equal(seen.votingAge, 66_474 - 1_900);
    assert.ok(seen.votingAgeRatio < seen.ratio);
  });

  it("marks the state figure counted and a local government estimated", () => {
    /* ── THE DISTINCTION THE WHOLE PANEL RESTS ON ────────────────────────
       Nothing is published below a state, so a local government's vote is the
       declared state total apportioned across its 23 real local governments —
       the same thing every map in this room does, under the doctrine at the
       head of lib/drill.js. Real at the state, modelled beneath it, and the
       flag says which so no screen can draw one as the other. */
    assert.equal(ratioAt("ADC", "SOK", "PDP", []).estimated, false);
    assert.equal(ratioAt("ADC", "SOK", "PDP", ["Binji"]).estimated, true);
  });

  it("apportions a local government so the parts add back to the declared vote", () => {
    /* An estimate that does not sum to the figure it came from is not an
       estimate, it is a different number. */
    const state = ratioAt("ADC", "SOK", "PDP", []);
    const parts = childrenOf("ADC", "SOK", []).reduce(
      (sum, lga) => sum + ratioAt("ADC", "SOK", "PDP", [lga.name]).votes,
      0
    );
    assert.equal(parts, state.votes);
  });

  it("is the same estimate every time it is asked", () => {
    /* Seeded by place name. A figure that moved between refreshes would be
       worse than no figure. */
    const once = ratioAt("ADC", "SOK", "PDP", ["Binji"]).votes;
    const twice = ratioAt("ADC", "SOK", "PDP", ["Binji"]).votes;
    assert.equal(once, twice);
  });

  it("refuses to go below a local government", () => {
    /* ── WHY THE FLOOR IS HERE AND NOT AT THE STATE ──────────────────────
       23 local governments are real places whose names match INEC's, so a
       split across them is defensible. Wards are not: the register's ward
       field is free text, Sokoto South alone arrives 95 ways, and even folded
       it is coarser than INEC's list. Splitting a state's votes across wards
       that match no ward list produced a ward at 1,191% before this guard. */
    const seen = ratioAt("ADC", "SOK", "PDP", ["Binji", "Maikulki"]);
    assert.equal(seen.known, false);
    assert.equal(seen.why, "below-lga");
    assert.equal(seen.ratio, undefined);
    /* The half that IS real at that depth is still returned. */
    assert.ok(seen.members > 0);
  });

  it("names every candidate a ratio can be measured against", () => {
    const names = CANDIDATES.map((row) => row.name);
    assert.ok(names.includes("Atiku Abubakar"));
    assert.ok(names.includes("Bola Tinubu"));
    /* Never the bucket: "14 other candidates" is not somebody to compare a
       register against. */
    assert.ok(!CANDIDATES.some((row) => row.id === "OTH"));
  });

  it("says so when the party has no register at all", () => {
    const seen = ratioAt("APC", "SOK", "PDP", []);
    assert.equal(seen.known, false);
    assert.equal(seen.why, "no-register");
  });
});

describe("the register's own ward names", () => {
  it("folds the spellings of one ward into one place", () => {
    /* ── A CORRECTNESS PROBLEM, NOT A COSMETIC ONE ───────────────────────
       Sokoto South has eleven wards and the raw register writes them 95 ways:
       GAGI A, Gagi 'A', Gagi "A", GaGi A. Left alone, one ward's members are
       split across five rows and every per-ward share is computed against a
       denominator that does not exist. */
    const found = qualityOf("ADC", "SOK");
    const note = found.notes.find((item) => item.id === "ward-spellings");
    assert.ok(note, "the folding is not reported");
    assert.ok(note.count > 300, "several hundred spellings were folded");

    /* Sokoto South is materially smaller than the 95 it arrived as. */
    const wards = childrenOf("ADC", "SOK", ["Sokoto South"]);
    assert.ok(wards.length < 95, `Sokoto South still has ${wards.length} ward names`);
  });

  it("does not merge two wards that are genuinely different", () => {
    /* "Gagi A" and "Gagi B" are two wards. Only case, quotes and repeated
       spaces are folded; a bare "Gagi" is left alone, because which of the
       three was meant is not knowable and guessing moves real people. */
    const wards = childrenOf("ADC", "SOK", ["Sokoto South"]).map((row) => row.name.toUpperCase());
    const gagis = wards.filter((name) => name.startsWith("GAGI"));
    assert.ok(gagis.length > 1, "the Gagi wards were collapsed into one");
  });

  it("keeps the total untouched by the folding", () => {
    /* Merging names must move nobody. */
    assert.equal(membersAt("ADC", "SOK"), 66_474);
  });
});
