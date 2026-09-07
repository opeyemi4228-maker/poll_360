import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { boothFromForm } from "../lib/booth.js";

/**
 * Which booth an application is for.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  The sign-up form asks for the polling unit twice over: as four things
 *  chosen from lists, and — for somebody holding the sheet — as the whole code
 *  typed into a box. This is what turns either of those into the one address
 *  every return that account ever files will hang from.
 *
 *  It is worth this much test because of how it fails. A wrong polling unit
 *  raises nothing: it files a real return, with real figures, against a booth
 *  in the wrong ward, and every screen in the product looks entirely normal.
 *  So the cases below are mostly about refusing rather than accepting.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* The form as the browser sends it. Written out rather than hidden in a
   helper with defaults, because half these tests are about a field being
   absent and a default would quietly fill it back in. */
const form = (fields) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

/* Nasarawa is state 25 in this product's table and has 13 local governments,
   so it carries both an in-range and an out-of-range number to test with. */
const NASARAWA = { state: "25", lga: "25/13", ward: "06", unit: "012" };

describe("the booth chosen from the lists", () => {
  it("builds the code from the four parts", () => {
    const booth = boothFromForm(form(NASARAWA));
    assert.deepEqual(booth.errors, {});
    assert.equal(booth.code, "25/13/06/012");
  });

  it("pads what was typed short", () => {
    assert.equal(boothFromForm(form({ ...NASARAWA, ward: "6", unit: "12" })).code, "25/13/06/012");
  });

  it("takes the state from the local government, which carries its own", () => {
    /* The state field is a convenience for the picker. The local government's
       value is "SS/LL", so the choice can never be attached to a state other
       than the one it was listed under. */
    const booth = boothFromForm(form({ lga: "25/13", ward: "06", unit: "012" }));
    assert.equal(booth.code, "25/13/06/012");
  });

  it("refuses a state and a local government that disagree", () => {
    /* Unreachable from the form, which is the point: a server action is a
       public endpoint and the form is a description of one caller. */
    const booth = boothFromForm(form({ ...NASARAWA, state: "24" }));
    assert.equal(booth.code, null);
    assert.match(booth.errors.lga, /do not agree/);
  });

  it("says which box is empty, one box at a time", () => {
    assert.ok(boothFromForm(form({ ward: "06", unit: "012" })).errors.state);
    assert.ok(boothFromForm(form({ state: "25", ward: "06", unit: "012" })).errors.lga);
    assert.ok(boothFromForm(form({ ...NASARAWA, ward: "" })).errors.ward);
    assert.ok(boothFromForm(form({ ...NASARAWA, unit: "" })).errors.unit);
  });

  it("refuses a ward or unit of zero, which is an empty box and not a place", () => {
    assert.ok(boothFromForm(form({ ...NASARAWA, ward: "00" })).errors.ward);
    assert.ok(boothFromForm(form({ ...NASARAWA, unit: "000" })).errors.unit);
  });

  /* The one part of a code we hold a list to check against. */
  it("refuses a local government the state does not have", () => {
    const booth = boothFromForm(form({ ...NASARAWA, lga: "25/27" }));
    assert.equal(booth.code, null);
    assert.match(booth.errors.lga, /13 local governments/);
  });

  it("refuses a state number that names no state", () => {
    const booth = boothFromForm(form({ state: "44", lga: "44/01", ward: "06", unit: "012" }));
    assert.equal(booth.code, null);
    assert.ok(booth.errors.state);
  });

  it("gives back what was chosen, so the form can be handed back filled in", () => {
    const booth = boothFromForm(form({ ...NASARAWA, ward: "" }));
    assert.equal(booth.state, "25");
    assert.equal(booth.lga, "25/13");
    assert.equal(booth.unit, "012");
  });
});

describe("the whole code, typed by somebody holding the sheet", () => {
  it("is accepted on its own, however it was punctuated", () => {
    for (const written of ["25/13/06/012", "25-13-06-012", "251306012"]) {
      const booth = boothFromForm(form({ unitCode: written }));
      assert.deepEqual(booth.errors, {}, `"${written}" was refused`);
      assert.equal(booth.code, "25/13/06/012", `"${written}" read as a different booth`);
    }
  });

  it("is refused when it is not a code at all", () => {
    const booth = boothFromForm(form({ unitCode: "25/13" }));
    assert.equal(booth.code, null);
    assert.match(booth.errors.unitCode, /nine digits/);
  });

  /* ── THE CASE THIS FUNCTION EXISTS FOR ────────────────────────────────────
     Both halves filled in, naming different booths. A preference between them
     would be a coin toss deciding where an agent's returns go for the rest of
     the election, with the losing half still on screen looking accepted. */
  it("refuses to choose when the typed code and the boxes disagree", () => {
    const booth = boothFromForm(form({ ...NASARAWA, unitCode: "24/13/06/012" }));
    assert.equal(booth.code, null);
    assert.match(booth.errors.unitCode, /24\/13\/06\/012/);
    assert.match(booth.errors.unitCode, /25\/13\/06\/012/);
  });

  it("is content when the two agree", () => {
    const booth = boothFromForm(form({ ...NASARAWA, unitCode: "25/13/06/012" }));
    assert.deepEqual(booth.errors, {});
    assert.equal(booth.code, "25/13/06/012");
  });

  it("wins outright when the boxes were left alone", () => {
    const booth = boothFromForm(form({ unitCode: "25/13/06/012", state: "", lga: "", ward: "", unit: "" }));
    assert.equal(booth.code, "25/13/06/012");
  });
});

describe("an empty form", () => {
  it("asks for the state first and does not invent a booth", () => {
    const booth = boothFromForm(form({}));
    assert.equal(booth.code, null);
    assert.ok(booth.errors.state);
  });
});
