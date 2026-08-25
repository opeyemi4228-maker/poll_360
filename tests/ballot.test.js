import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ballotFor, countedParties, ballotIds } from "../lib/races.js";
import { allParties, parties, others } from "../lib/election2023.js";
import { partyById } from "../lib/party-register.js";
import { PATTERNED, partyFill } from "../lib/party-pattern.js";

/**
 * The ballot, and the things that must agree with it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A party is added to this product in more places than anybody remembers.
 *  It needs a box on the filing form, a slot in the stored return, a colour
 *  on two different surfaces, a column the declared-figures importer will
 *  accept, and — if its colour collides with another under colour blindness —
 *  a texture. Miss one and the failure is silent: votes land in "other", or a
 *  map draws two parties the same, and both look completely fine.
 *
 *  So the wiring is asserted rather than remembered.
 * ══════════════════════════════════════════════════════════════════════════
 */

describe("the ballot", () => {
  it("carries every party on a Nigerian ballot paper", () => {
    const ids = ballotFor("PRESIDENTIAL").map((party) => party.id);
    /* Alphabetical by the code INEC prints, which puts Accord first as "A".
       The bucket is last and is not a party. */
    assert.deepEqual(ids, [
      "ACCORD", "AA", "AAC", "ADC", "ADP", "APC", "APGA", "APM", "APP",
      "BP", "LP", "NDC", "NNPP", "PDP", "PRP", "SDP", "YPP", "ZLP", "OTH",
    ]);
  });

  it("puts the bucket last, on every position", () => {
    /* Several things read the bucket off the end of the array. A position
       whose ballot ended somewhere else would credit the wrong party. */
    for (const race of ["PRESIDENTIAL", "GOVERNORSHIP", "SENATE", "REPRESENTATIVES", "LGA"]) {
      const ids = ballotFor(race).map((party) => party.id);
      assert.equal(ids.at(-1), others.id, `${race} did not end with the bucket`);
      assert.equal(new Set(ids).size, ids.length, `${race} listed a party twice`);
    }
  });

  it("counts every party except the bucket by name", () => {
    const counted = countedParties().map((party) => party.id);
    assert.ok(!counted.includes(others.id), "the bucket was counted as a party");
    assert.equal(counted.length, ballotIds().length - 1);
  });

  it("gives every party on it a colour", () => {
    for (const party of ballotFor()) {
      assert.match(
        party.token ?? "",
        /^var\(--color-[a-z-]+\)$/,
        `${party.id} has no colour token, so it would be drawn as nothing`
      );
    }
  });

  it("leaves the 2023 declared record alone", () => {
    /* `allParties` is the schema of the 2023 results and several screens index
       into those vote arrays positionally. The ballot has grown well past it;
       the record itself must not move a single slot. */
    assert.deepEqual(parties.map((party) => party.id), ["APC", "PDP", "LP", "NNPP"]);
    assert.equal(allParties.length, parties.length + 1, "the 2023 record grew a party");
  });

  it("defines every party once, in the register", () => {
    /* A party with two definitions is a party with two colours the day
       somebody edits one of them. */
    for (const party of countedParties()) {
      const registered = partyById(party.id);
      assert.ok(registered, `${party.id} is on the ballot and not in the register`);
      assert.equal(party.token, registered.token, `${party.id} has two different colours`);
      assert.ok(party.name?.length > 2, `${party.id} has no name to show anybody`);
    }
  });

  it("marks everyone but the four optional on a sheet", () => {
    /* This is what lets the Osun paper, which carries neither PDP nor LP, be
       an ordinary sheet rather than a failed reading. See tests/sheets.test.js. */
    for (const party of countedParties()) {
      const core = ["APC", "PDP", "LP", "NNPP"].includes(party.id);
      assert.equal(Boolean(party.optional), !core, `${party.id} optional flag is wrong`);
    }
  });
});

describe("the parties that carry a texture", () => {
  it("are all on the ballot", () => {
    for (const id of Object.keys(PATTERNED)) {
      assert.ok(ballotIds().includes(id), `${id} is textured but cannot be counted`);
    }
  });

  it("asks for a pattern by the map's own prefix", () => {
    assert.equal(partyFill("NDC", "scope", "var(--color-ndc-l)"), "url(#scope-pattern-NDC)");
    assert.equal(partyFill("LP", "room", "var(--color-lp-l)"), "url(#room-pattern-LP)");
  });

  it("leaves every other party flat", () => {
    assert.equal(partyFill("APC", "scope", "var(--color-apc-l)"), "var(--color-apc-l)");
    /* Nothing has reported. Not a party, and not a pattern. */
    assert.equal(partyFill(null, "scope", "var(--color-silent)"), "var(--color-silent)");
  });

  it("covers both pairs that colour cannot separate", () => {
    /* PDP/LP and APC/NDC. If a third such pair ever appears, the fill that
       loses is the one that has to be added here — see globals.css. */
    assert.equal(PATTERNED.LP, "diagonal");
    assert.equal(PATTERNED.NDC, "dots");
    assert.notEqual(PATTERNED.LP, PATTERNED.NDC, "two textured parties share a texture");
  });
});
