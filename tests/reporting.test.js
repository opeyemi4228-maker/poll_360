import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { behind, boothTree, placeAt, placesUnder, summarise } from "../lib/reporting.js";

/**
 * The booth rollup, pinned.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Every assertion here is a figure that would go on a wall in a room where
 *  somebody is deciding who to ring next. The ones worth writing down are not
 *  the arithmetic — they are the four places this kind of rollup normally
 *  goes quietly wrong:
 *
 *    a booth that filed twice counted as two booths reporting
 *    a desk upload pushing a ward past 100%
 *    a disputed return counted as a booth that has spoken
 *    a place nobody was sent to drawn as a place that has gone silent
 *
 *  None of those throws. All four produce a plausible number on a screen.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* Two wards in one local government of Borno, plus one booth in Nasarawa. */
const ROSTER = [
  { unitCode: "08/03/07/012" },
  { unitCode: "08/03/07/013" },
  { unitCode: "08/03/07/014" },
  { unitCode: "08/03/08/001" },
  { unitCode: "25/07/04/019" },
];

describe("the booth rollup", () => {
  it("counts the roster as the denominator, not the registry", () => {
    const tree = boothTree({ roster: ROSTER, rows: [] });
    const nation = summarise(tree);

    assert.equal(nation.assigned, 5);
    assert.equal(nation.filed, 0);
    assert.equal(nation.silent, 5, "every booth we hold is silent before anything arrives");
    assert.equal(nation.reporting, 0);
  });

  it("adds each booth to every level above it", () => {
    const tree = boothTree({
      roster: ROSTER,
      rows: [{ unitCode: "08/03/07/012", status: "VERIFIED" }],
    });

    /* The same return, seen from four heights. A rollup that credits the ward
       and not the state is one where the map and the list disagree. */
    assert.equal(summarise(tree).filed, 1, "the country");
    assert.equal(placeAt(tree, ["BOR"]).filed, 1, "the state");
    assert.equal(placeAt(tree, ["BOR", "08/03"]).filed, 1, "the local government");
    assert.equal(placeAt(tree, ["BOR", "08/03", "08/03/07"]).filed, 1, "the ward");
  });

  it("children always add up to their parent", () => {
    const tree = boothTree({
      roster: ROSTER,
      rows: [
        { unitCode: "08/03/07/012", status: "VERIFIED" },
        { unitCode: "08/03/08/001", status: "SUBMITTED" },
      ],
    });

    /* The invariant the whole screen rests on: drilling never changes the
       total you started from. */
    for (const path of [[], ["BOR"], ["BOR", "08/03"]]) {
      const parent = placeAt(tree, path) ?? summarise(tree);
      const kids = placesUnder(tree, path);
      if (kids.length === 0) continue;

      const sum = (field) => kids.reduce((total, row) => total + row[field], 0);
      assert.equal(sum("assigned"), parent.assigned, `assigned under [${path}]`);
      assert.equal(sum("filed"), parent.filed, `filed under [${path}]`);
      assert.equal(sum("silent"), parent.silent, `silent under [${path}]`);
    }
  });

  it("counts a booth that files twice as one booth reporting", () => {
    /* An amended return is a correction, not a second booth. Counting rows
       instead of booths reports more booths reporting than exist, and the
       first place it shows up is a ward reading 120%. */
    const tree = boothTree({
      roster: ROSTER,
      rows: [
        { unitCode: "08/03/07/012", status: "SUBMITTED" },
        { unitCode: "08/03/07/012", status: "VERIFIED" },
      ],
    });

    assert.equal(summarise(tree).filed, 1);
    assert.equal(placeAt(tree, ["BOR", "08/03", "08/03/07"]).filed, 1);
  });

  it("never lets a booth nobody was assigned to push a place past 100%", () => {
    /* A desk upload, or a booth added during the day. It has genuinely
       spoken, so it counts as filed — and it must raise the denominator with
       it, or the ward reports more booths reporting than it holds. */
    const tree = boothTree({
      roster: [{ unitCode: "08/03/07/012" }],
      rows: [
        { unitCode: "08/03/07/012", status: "VERIFIED" },
        { unitCode: "08/03/07/099", status: "VERIFIED" },
      ],
    });

    const ward = placeAt(tree, ["BOR", "08/03", "08/03/07"]);
    assert.equal(ward.assigned, 2);
    assert.equal(ward.filed, 2);
    assert.equal(ward.reporting, 100);
    assert.ok(ward.reporting <= 100, "a share above 100% is a bug that reaches a bulletin");
  });

  it("keeps a thrown-out return out of what has been counted", () => {
    /* A disputed return is out of every sum — see results.counted in
       lib/db.js. Folding it into "filed" would inflate how much of the ground
       has spoken with returns nobody is allowed to use. */
    const tree = boothTree({
      roster: ROSTER,
      rows: [{ unitCode: "08/03/07/012", status: "DISPUTED" }],
    });

    const nation = summarise(tree);
    assert.equal(nation.filed, 0, "a thrown-out return is not a booth that has spoken");
    assert.equal(nation.rejected, 1);
    assert.equal(nation.silent, 4, "and it is not silent either — it is its own state");
  });

  it("separates a booth that has not spoken from one nobody was sent to", () => {
    /* The distinction the map is drawn on. Zero would be a measurement, and
       for a place we staffed nobody there is no measurement. */
    const empty = boothTree({ roster: [], rows: [] });
    assert.equal(summarise(empty).reporting, null, "no roster, no reporting rate");

    const staffed = boothTree({ roster: [{ unitCode: "08/03/07/012" }], rows: [] });
    assert.equal(summarise(staffed).reporting, 0, "staffed and silent is genuinely zero");
  });

  it("ranks what is behind by how many booths are missing, not by the rate", () => {
    /* A ward at 0% of two booths and a state at 40% of nine hundred are both
       behind, and only one is worth the next hour. Sorting by rate puts the
       two-booth ward at the top all night. */
    const roster = [
      ...Array.from({ length: 20 }, (_, i) => ({ unitCode: `08/03/07/${String(i + 1).padStart(3, "0")}` })),
      { unitCode: "25/07/04/019" },
      { unitCode: "25/07/04/020" },
    ];
    const rows = Array.from({ length: 12 }, (_, i) => ({
      unitCode: `08/03/07/${String(i + 1).padStart(3, "0")}`,
      status: "VERIFIED",
    }));

    const ranked = behind(boothTree({ roster, rows }));
    assert.equal(ranked[0].name, "Borno", "8 missing outranks 2 missing, though its rate is better");
    assert.equal(ranked[0].silent, 8);
    assert.equal(ranked[1].silent, 2);
  });

  it("still counts a booth whose code will not parse", () => {
    /* A malformed code is a booth somebody still has to ring. Dropping it
       would quietly shrink the denominator and make coverage look better than
       it is — the one direction an error here must never go. */
    const tree = boothTree({ roster: [{ unitCode: "nonsense" }, { unitCode: "08/03/07/012" }], rows: [] });
    assert.equal(summarise(tree).assigned, 2);
  });
});
