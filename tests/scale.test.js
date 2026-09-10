import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { breaksFor } from "../lib/scale.js";

/**
 * The ranked scale, and the failure that made it necessary.
 *
 * The clusters map drew the whole federation in the bottom band with one
 * bright state. Two separate causes, and only the second is a scale problem:
 * the measure was reading the reporting register rather than the whole one, so
 * every state that had not filed computed to zero; and voters per polling unit
 * is skewed enough that a linear ramp spends most of its bands on a range
 * nothing occupies.
 *
 * This pins the second. Each band must hold roughly a tenth of the places, so
 * every band is occupied whatever the distribution does.
 */

describe("quantile breaks", () => {
  it("gives one fewer break than there are bands", () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    assert.equal(breaksFor(values, 10).length, 9);
  });

  it("spreads an even distribution evenly", () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    const breaks = breaksFor(values, 10);
    assert.deepEqual(breaks, [10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it("survives one enormous outlier", () => {
    /* The Lagos case: thirty-six places in a narrow band and one far above.
       A linear scale puts all thirty-six in band 0; ranked, they spread. */
    const values = [...Array.from({ length: 36 }, (_, i) => 400 + i), 40000];
    const breaks = breaksFor(values, 10);

    assert.equal(new Set(breaks).size, breaks.length, "no two bands share an edge");
    assert.ok(
      breaks[0] < 420,
      `the first break must fall inside the crowd, was ${breaks[0]}`
    );
    assert.ok(breaks.at(-1) <= 40000);
  });

  it("puts every place in a band, and uses the whole ramp", () => {
    const values = [...Array.from({ length: 36 }, (_, i) => 400 + i), 40000];
    const breaks = breaksFor(values, 10);

    const band = (value) => {
      let index = 0;
      while (index < breaks.length && value >= breaks[index]) index += 1;
      return index;
    };

    const used = new Set(values.map(band));
    assert.ok(
      used.size >= 9,
      `a ranked scale should occupy nearly every band, used ${used.size} of 10`
    );
    assert.equal(band(40000), 9, "the outlier sits in the top band");
  });

  it("is monotonic, so a bigger figure never ranks lower", () => {
    const values = [5, 1, 9, 3, 7, 2, 8, 4, 6, 10, 12, 11];
    const breaks = breaksFor(values, 5);
    for (let i = 1; i < breaks.length; i += 1) {
      assert.ok(breaks[i] >= breaks[i - 1], "breaks must not go backwards");
    }
  });

  it("has nothing to say about nothing", () => {
    assert.deepEqual(breaksFor([], 10), []);
  });

  it("ignores figures that are not numbers", () => {
    /* A row with no register and no booths yields NaN, and one NaN in the
       sort corrupts every break after it. */
    const breaks = breaksFor([1, NaN, 3, undefined, 5, null, 7], 4);
    assert.ok(breaks.every(Number.isFinite), `got ${JSON.stringify(breaks)}`);
  });
});
