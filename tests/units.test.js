import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isUnitCode, parseUnitCode } from "../lib/units.js";
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
