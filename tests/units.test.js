import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isUnitCode, parseUnitCode, unitCodeFromParts, STATES } from "../lib/units.js";
import { keyAt } from "../lib/declared.js";

/**
 * The address every figure in this product joins on.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A polling unit code is the primary key of the whole system. The registry
 *  holds one, a filed return carries one, an uploaded declaration is matched
 *  by one, and the parallel count joins our figures to the commission's on a
 *  truncation of one.
 *
 *  This module has already been the site of the worst class of bug available
 *  here, and its own comment records it: normalising to dashes produced a
 *  second key for the same booth, the registry held 01-01-04-006 while the
 *  result sat under 01/01/04/006, they never joined, and a tree of 488 units
 *  reported two. Nothing errored. Everything looked fine.
 *
 *  So: one booth, one key, however it was typed.
 * ══════════════════════════════════════════════════════════════════════════
 */

describe("reading a code", () => {
  it("reads the same booth from every way somebody writes it", () => {
    const canonical = parseUnitCode("01/01/04/006").code;

    for (const written of [
      "01/01/04/006",
      "01-01-04-006",
      "01 01 04 006",
      "010104006",
      " 01/01/04/006 ",
      "01.01.04.006",
    ]) {
      assert.equal(parseUnitCode(written)?.code, canonical, `"${written}" produced a different key`);
    }
  });

  it("normalises to slashes, because the returns on file already use them", () => {
    /* A new reader does not get to redefine the primary key of a system that
       already has one. */
    assert.equal(parseUnitCode("01-01-04-006").code, "01/01/04/006");
    assert.ok(!parseUnitCode("01-01-04-006").code.includes("-"));
  });

  it("pads every part, so 1/1/4/6 and 01/01/04/006 are one booth", () => {
    assert.equal(parseUnitCode("1/1/4/6").code, "01/01/04/006");
    assert.equal(parseUnitCode("1/1/4/6").code, parseUnitCode("01/01/04/006").code);
  });

  it("refuses anything that is not four parts", () => {
    /* Strict about shape on purpose: guessing at a short code files a result
       against the wrong place, which is worse than refusing it. */
    for (const bad of [
      "01/01/04",
      "01/01",
      "01",
      "",
      null,
      undefined,
      "not a code",
      "01/01/04/006/007",
    ]) {
      assert.equal(parseUnitCode(bad), null, `"${bad}" was accepted as a unit code`);
      assert.equal(isUnitCode(bad), false, `"${bad}" passed isUnitCode`);
    }
  });

  it("names the state from its number", () => {
    const at = parseUnitCode("25/07/04/019");
    assert.ok(at.stateName, "state 25 has no name");
    assert.ok(at.stateCode, "state 25 has no code");
    assert.equal(at.stateNumber, "25");
  });

  it("does not invent a state it cannot name", () => {
    /* An out-of-range state number is a typo, and a code that reports a
       confident state for it is worse than one that reports none. */
    const at = parseUnitCode("99/01/04/006");
    assert.equal(at.stateName, null);
    assert.equal(at.stateCode, null);
    assert.equal(at.stateNumber, "99");
  });

  it("builds the parent keys out of its own parts", () => {
    const at = parseUnitCode("01/01/04/006");
    assert.equal(at.wardCode, "01/01/04");
    assert.equal(at.lgaCode, "01/01");
    assert.equal(at.stateNumber, "01");
    assert.equal(at.unitNo, "006");
    /* Every parent key must be a prefix of the code itself, or a roll-up
       joins to a place the unit is not in. */
    assert.ok(at.code.startsWith(at.wardCode));
    assert.ok(at.wardCode.startsWith(at.lgaCode));
    assert.ok(at.lgaCode.startsWith(at.stateNumber));
  });
});

describe("rolling a code up to a level", () => {
  /* The parallel count joins our returns to the commission's declarations on
     these. A truncation that disagreed with the code it came from would
     compare two different places and report the difference as a finding. */
  it("truncates to exactly the place asked for", () => {
    assert.equal(keyAt("01/01/04/006", "UNIT"), "01/01/04/006");
    assert.equal(keyAt("01/01/04/006", "WARD"), "01/01/04");
    assert.equal(keyAt("01/01/04/006", "LGA"), "01/01");
    assert.equal(keyAt("01/01/04/006", "STATE"), "01");
  });

  it("agrees however the code was typed", () => {
    for (const written of ["01-01-04-006", "010104006", "1/1/4/6"]) {
      assert.equal(keyAt(written, "WARD"), "01/01/04", `"${written}" rolled up differently`);
      assert.equal(keyAt(written, "LGA"), "01/01", `"${written}" rolled up differently`);
    }
  });

  it("returns nothing for a code it cannot read", () => {
    assert.equal(keyAt("rubbish", "WARD"), null);
    assert.equal(keyAt(null, "WARD"), null);
  });

  it("returns nothing for a level that does not exist", () => {
    assert.equal(keyAt("01/01/04/006", "COUNTRY"), null);
  });

  it("puts two units in the same ward under the same ward key", () => {
    assert.equal(keyAt("01/01/04/006", "WARD"), keyAt("01/01/04/019", "WARD"));
    assert.notEqual(keyAt("01/01/04/006", "WARD"), keyAt("01/01/05/006", "WARD"));
  });
});

/**
 * The other direction: four answers from a form, back into one key.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  The sign-up form asks an agent for their state, local government, ward and
 *  unit separately, and this is what turns those four into the address every
 *  return they ever file will hang from. It is the only place in the product
 *  that builds a code rather than reading one, which makes it the only place
 *  a code can be built wrong.
 *
 *  The failure it exists to prevent is not an exception. It is a code that
 *  parses perfectly and names nowhere: ward 00, or a state number nobody has.
 *  Nothing downstream would object to either.
 * ══════════════════════════════════════════════════════════════════════════
 */
describe("building a code from what somebody chose", () => {
  it("pads every part to the width the register uses", () => {
    assert.equal(unitCodeFromParts({ state: "1", lga: "1", ward: "4", unit: "6" }), "01/01/04/006");
  });

  it("comes out where parseUnitCode goes in", () => {
    const built = unitCodeFromParts({ state: "24", lga: "13", ward: "06", unit: "012" });
    assert.equal(built, parseUnitCode("24/13/06/012").code);
  });

  it("refuses a part that was left empty", () => {
    assert.equal(unitCodeFromParts({ state: "24", lga: "13", ward: "", unit: "012" }), null);
    assert.equal(unitCodeFromParts({ state: "24", lga: "13", ward: "06", unit: "" }), null);
    assert.equal(unitCodeFromParts({ state: "", lga: "13", ward: "06", unit: "012" }), null);
    assert.equal(unitCodeFromParts({ state: "24", lga: "", ward: "06", unit: "012" }), null);
  });

  /* An empty box that became 00 was the bug this guard is for. It produces a
     nine-digit code that reads as a real one and points at no booth. */
  it("refuses a zero, which is an empty box and not a place", () => {
    assert.equal(unitCodeFromParts({ state: "24", lga: "13", ward: "00", unit: "012" }), null);
    assert.equal(unitCodeFromParts({ state: "24", lga: "13", ward: "06", unit: "000" }), null);
    assert.equal(unitCodeFromParts({ state: "00", lga: "13", ward: "06", unit: "012" }), null);
  });

  it("refuses a state number that names no state", () => {
    assert.equal(unitCodeFromParts({ state: "38", lga: "01", ward: "01", unit: "001" }), null);
    assert.equal(unitCodeFromParts({ state: "99", lga: "01", ward: "01", unit: "001" }), null);
  });

  it("refuses a part too long to be that part", () => {
    assert.equal(unitCodeFromParts({ state: "241", lga: "13", ward: "06", unit: "012" }), null);
    assert.equal(unitCodeFromParts({ state: "24", lga: "13", ward: "066", unit: "012" }), null);
    assert.equal(unitCodeFromParts({ state: "24", lga: "13", ward: "06", unit: "0121" }), null);
  });

  it("takes a part however the form punctuated it", () => {
    assert.equal(unitCodeFromParts({ state: " 24 ", lga: "13", ward: "06", unit: "012" }), "24/13/06/012");
  });
});

/**
 * The state table the picker offers.
 *
 * A sign-up form shows these by name and sends the number beside them, so an
 * ordering that drifted here would attach every return from one state to
 * another — silently, because the wrong number is still a valid code.
 */
describe("the states a form can offer", () => {
  it("holds all 37, numbered 01 upwards with no gaps", () => {
    assert.equal(STATES.length, 37);
    STATES.forEach((state, index) => {
      assert.equal(state.number, String(index + 1).padStart(2, "0"));
    });
  });

  it("agrees with what parseUnitCode reads back out of a code", () => {
    for (const state of STATES) {
      const at = parseUnitCode(`${state.number}/01/01/001`);
      assert.equal(at.stateName, state.name, `state ${state.number} disagrees with the parser`);
    }
  });

  it("names every state once, and gives each a short code", () => {
    assert.equal(new Set(STATES.map((state) => state.name)).size, 37);
    assert.equal(STATES.filter((state) => state.code).length, 37);
  });
});
