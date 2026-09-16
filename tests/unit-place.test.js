import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { placeOf } from "../lib/lga-names.js";

/**
 * The names a unit code stands for, as Data Bank's Sheets board groups by
 * them. Read from INEC's own list; never guessed from the numbers.
 */
describe("naming the place a unit code names", () => {
  it("names the state, local government, ward and unit", () => {
    const place = placeOf("33/01/01/001");
    assert.equal(place.stateName, "Sokoto");
    assert.equal(place.lgaName, "Binji");
    assert.equal(place.wardName, "Inname");
    assert.equal(place.unitName, "Inname Masukayi");
  });

  it("tidies the spacing INEC's list carries, and nothing else", () => {
    /* "Faruwa  Jamali" is listed with two spaces. */
    assert.equal(placeOf("33/01/01/004").unitName, "Faruwa Jamali");
  });

  it("leaves a name out rather than inventing one", () => {
    const place = placeOf("33/01/01/999");
    assert.equal(place.wardName, "Inname");
    assert.equal(place.unitName, null);
    assert.equal(placeOf("not a unit"), null);
  });
});
