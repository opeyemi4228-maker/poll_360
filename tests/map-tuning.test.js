import assert from "node:assert/strict";
import test from "node:test";

import { TUNING, tuningFor } from "../lib/map-tuning.js";

/**
 * The three layers that draw on real imagery are not the same kind of
 * quantity, and the whole point of the tuning table is that they are not drawn
 * as though they were. These are the distinctions that matter; if one is ever
 * flattened out, this is where it should be noticed.
 */

test("a rate gets no density field", () => {
  /* Turnout is a percentage. A heat map sums the weights of nearby points,
     so a field over turnout adds one state's percentage to its neighbour's,
     which is not a measurement of anything. */
  assert.equal(TUNING.turnout.field, null);
});

test("mass and pressure both get a field, and they are not the same field", () => {
  assert.ok(TUNING.register.field, "the register is a mass and spreads");
  assert.ok(TUNING.density.field, "crowding is a pressure and concentrates");
  assert.ok(
    TUNING.density.field.radius < TUNING.register.field.radius,
    "crowding is a local fact — a wide blur would turn it into a regional one"
  );
});

test("only the crowding layer pins the markets", () => {
  /* A cluster's meaning is whatever is physically under it, and on this map
     that is usually a market. On the other two it would be decoration. */
  assert.equal(TUNING.density.centres, true);
  assert.equal(TUNING.register.centres, false);
  assert.equal(TUNING.turnout.centres, false);
});

test("every layer has a full ramp and says what it is", () => {
  for (const [id, tuned] of Object.entries(TUNING)) {
    assert.equal(tuned.ramp.length, 5, `${id} ramp`);
    for (const colour of tuned.ramp) {
      assert.match(colour, /^#[0-9a-f]{6}$/i, `${id} draws through Google's canvas, so no CSS vars`);
    }
    assert.ok(tuned.title, `${id} title`);
    assert.ok(tuned.caption, `${id} caption`);
    assert.ok(tuned.floor > 0 && tuned.floor < 1, `${id} floor keeps small places legible`);
  }
});

test("an unknown layer falls back rather than drawing nothing", () => {
  assert.equal(tuningFor("something-else"), TUNING.register);
  assert.equal(tuningFor(undefined), TUNING.register);
  assert.equal(tuningFor("density"), TUNING.density);
});
