import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { byPlace, placeKeyOf, liveRowsFrom, liveNodeFor } from "../lib/drill.js";

/**
 * A map shape finding its own figures.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FAILURE: A COUNTED PLACE DRAWN AS SILENT
 *
 *  Boundary files name a local government and carry no code — public/geo/lga
 *  holds `{ name: "Binji", d: … }`. An apportioned row is built from those
 *  names, so it carries `name` and no `key`, and the two always matched.
 *
 *  A live row does not. It comes off the tree in lib/live-board.js, where a
 *  place is identified by the booth code it was rolled up from: `key: "33/01"`.
 *  Looking that up by "Binji" misses, and a miss is not an error — it is a
 *  place with no figures, which by this product's own colour rules is grey,
 *  which reads as "no returns yet".
 *
 *  So the first real return filed into a live count drew Sokoto with 195 votes
 *  and drew Binji, the local government those votes came from, as silent.
 *  Nothing threw.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* The Sokoto tree exactly as lib/live-board.js builds it from one return at
   33/01/01/001. */
const tree = {
  level: "nation",
  key: "NG",
  name: "Nigeria",
  children: [
    {
      level: "state",
      key: "33",
      name: "Sokoto",
      units: 1,
      reported: 1,
      registered: 484,
      votes: [100, 91],
      total: 191,
      children: [
        {
          level: "lga",
          key: "33/01",
          name: "Binji",
          units: 1,
          reported: 1,
          registered: 484,
          votes: [100, 91],
          total: 191,
          children: [],
        },
      ],
    },
  ],
};

/* A local government as the boundary file carries it: a name and a path, and
   no code at all. */
const shape = { name: "Binji", d: "M0 0" };

describe("a live row and the shape it belongs to", () => {
  it("finds the row from the shape's name although the row is keyed by code", () => {
    const state = liveNodeFor(tree, "Sokoto");
    const rows = liveRowsFrom(state);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].key, "33/01", "the live row is keyed by its booth prefix");

    const index = byPlace(rows);
    const found = index.get(placeKeyOf(shape));

    assert.ok(found, "the shape could not find its own figures");
    assert.equal(found.total, 191);
    assert.equal(found.reported, true);
  });

  it("still finds the row by its code, which the search list and the drill use", () => {
    const rows = liveRowsFrom(liveNodeFor(tree, "Sokoto"));
    assert.equal(byPlace(rows).get("33/01")?.name, "Binji");
  });

  it("keeps working for an apportioned row, which has a name and no key", () => {
    /* The path that already worked must not be broken by fixing the one that
       did not. */
    const rows = [{ name: "Binji", total: 191, reported: true }];
    assert.equal(byPlace(rows).get(placeKeyOf(shape))?.total, 191);
  });
});

describe("what a shape calls itself", () => {
  it("prefers a code where the shape has one, as the states do", () => {
    assert.equal(placeKeyOf({ code: "SOK", name: "Sokoto" }), "SOK");
  });

  it("falls back to the name where it has none, as the local governments do", () => {
    assert.equal(placeKeyOf({ name: "Binji" }), "Binji");
  });

  it("is null for nothing at all rather than undefined", () => {
    assert.equal(placeKeyOf(null), null);
    assert.equal(placeKeyOf({}), null);
  });
});

describe("the index itself", () => {
  it("lets the code win a collision, because the code is the identity", () => {
    const rows = [
      { key: "33/01", name: "Binji", total: 1 },
      { key: "Binji", name: "Something else", total: 2 },
    ];
    const index = byPlace(rows);
    assert.equal(index.get("Binji").total, 2, "a real key was shadowed by another row's name");
  });

  it("survives rows that are missing either identity", () => {
    const index = byPlace([null, undefined, {}, { name: "Gada" }, { key: "33/04" }]);
    assert.equal(index.get("Gada")?.name, "Gada");
    assert.equal(index.get("33/04")?.key, "33/04");
  });

  it("indexes nothing from an empty list rather than throwing", () => {
    assert.equal(byPlace().size, 0);
    assert.equal(byPlace([]).size, 0);
  });
});
