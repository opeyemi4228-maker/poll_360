import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cellsBelow, levelOf, sumRows, within } from "../lib/post-figures.js";
import { buildPost, describe as describePlace } from "../lib/post-build.js";
import { layoutFor } from "../lib/post-figures.js";

/**
 * A post's figures, from the country down to one booth.
 *
 * The card is what goes out in the organisation's name, and it is built on
 * the server from the stored returns. These pin the three things that would
 * be wrong on a card without anyone noticing: which booths a place contains,
 * what the place is called, and which drawing it gets.
 */

const row = (unitCode, votes, extra = {}) => ({ unitCode, status: "VERIFIED", registered: 500, accredited: 300, rejected: 4, votes, ...extra });

const ROWS = [
  row("19/03/07/012", { APC: 150, NNPP: 120 }, { position: { lat: 12.0012, lon: 8.5167 } }),
  row("19/03/07/013", { APC: 90, NNPP: 140 }),
  row("19/03/08/001", { APC: 60, NNPP: 30 }),
  row("19/04/01/001", { APC: 10, NNPP: 200 }),
  row("24/01/01/001", { LP: 300, APC: 100 }),
];

describe("which booths a place holds", () => {
  it("reads every level of scope", () => {
    assert.equal(levelOf("NATION"), "nation");
    assert.equal(levelOf("STATE:19"), "state");
    assert.equal(levelOf("LGA:19/03"), "lga");
    assert.equal(levelOf("WARD:19/03/07"), "ward");
    assert.equal(levelOf("UNIT:19/03/07/012"), "unit");
  });

  it("puts a booth in its state, LGA, ward and unit, and nowhere else", () => {
    const code = "19/03/07/012";
    for (const scope of ["NATION", "STATE:19", "LGA:19/03", "WARD:19/03/07", "UNIT:19/03/07/012"]) {
      assert.ok(within(code, scope), `${code} should be inside ${scope}`);
    }
    for (const scope of ["STATE:24", "LGA:19/04", "WARD:19/03/08", "UNIT:19/03/07/013", "NONSENSE:1"]) {
      assert.ok(!within(code, scope), `${code} should not be inside ${scope}`);
    }
  });

  it("adds up a place, and says what share of it has reported", () => {
    const sum = sumRows(ROWS.filter((entry) => within(entry.unitCode, "LGA:19/03")), 10);
    assert.equal(sum.filed, 3);
    assert.equal(sum.reporting, 30);
    assert.deepEqual(sum.parties.map((party) => party.id), ["APC", "NNPP"], "300 to 290, largest first");
    assert.equal(sum.cast, 150 + 120 + 90 + 140 + 60 + 30);
  });

  it("colours the places one level down by who leads each", () => {
    const cells = cellsBelow(ROWS, "STATE:19");
    const by = Object.fromEntries(cells.map((cell) => [cell.scope, cell]));
    assert.equal(by["LGA:19/03"].leader, "APC");
    assert.equal(by["LGA:19/04"].leader, "NNPP");
    assert.equal(cells.length, 2, "Lagos is not a local government in Kano");
  });
});

describe("what a place is called", () => {
  it("names every level from the published register", () => {
    assert.equal(describePlace("STATE:19").name, "Kano State");
    assert.equal(describePlace("LGA:19/03").name, "Bagwai LGA");
    assert.match(describePlace("WARD:19/03/07").name, / Ward$/);
    assert.match(describePlace("UNIT:19/03/07/012").parent, /^PU 19\/03\/07\/012 · .* Ward, Bagwai LGA, Kano State$/);
  });

  it("knows how many booths each level should produce", () => {
    assert.ok(describePlace("NATION").expected > 100000);
    assert.ok(describePlace("LGA:19/03").expected > 50);
    assert.equal(describePlace("UNIT:19/03/07/012").expected, 1);
  });
});

describe("a post, built", () => {
  it("stamps a booth with the position its agent filed from", () => {
    const post = buildPost({ rows: ROWS, scope: "UNIT:19/03/07/012", race: "GOVERNORSHIP", at: "2026-09-19T20:00:00Z" });
    assert.equal(post.stamp.place.gps, true);
    assert.equal(post.stamp.coords, "12.0012, 8.5167");
    assert.equal(post.figures.filed, 1);
    assert.equal(post.figures.registered, 500);
  });

  it("draws a state and an LGA as maps, a ward and a booth as bars", () => {
    for (const [scope, layout] of [
      ["NATION", "faces"],
      ["STATE:19", "map"],
      ["LGA:19/03", "map"],
      ["WARD:19/03/07", "bars"],
      ["UNIT:19/03/07/012", "bars"],
    ]) {
      const post = buildPost({ rows: ROWS, scope, race: "GOVERNORSHIP" });
      assert.equal(layoutFor({ ...post, format: "result-card" }), layout, `${scope} should draw as ${layout}`);
    }
  });

  it("lets the writer choose the drawing, but not the figures", () => {
    const post = buildPost({ rows: ROWS, scope: "STATE:19", race: "GOVERNORSHIP" });
    assert.equal(layoutFor({ ...post, format: "faces" }), "faces");
    assert.equal(layoutFor({ ...post, format: "breaking-card" }), "poster");
    assert.equal(post.figures.filed, 4, "every Kano booth, and not Lagos");
  });
});
