import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  barPercent,
  bandFor,
  beyondScale,
  meterPosition,
  minutesSince,
  recencyPosition,
  splitShares,
} from "../lib/console-charts.js";

/**
 * The console's pictures, held to the numbers they claim to be drawing.
 *
 * A chart that misplaces a figure is not ugly, it is false, and it is false in
 * the way nobody checks: a plausible bar and a correct bar look the same. So
 * the mapping from number to pixel is pinned here rather than eyeballed.
 */

const BANDS = [
  { to: 250, label: "fast", tone: "good" },
  { to: 800, label: "usable", tone: "good" },
  { to: 1500, label: "slow", tone: "warn" },
  { to: 4000, label: "timing out", tone: "alert" },
];

describe("the latency meter", () => {
  it("puts a reading where the scale says it goes", () => {
    assert.equal(meterPosition(0, 4000), 0);
    assert.equal(meterPosition(2000, 4000), 0.5);
    assert.equal(meterPosition(4000, 4000), 1);
  });

  it("pins a reading past the top rather than drawing it off the track", () => {
    assert.equal(meterPosition(40000, 4000), 1);
  });

  it("says out loud that it pinned it", () => {
    /* The whole point. A 4-second query and a 40-second one are both drawn at
       the right-hand end, and only this tells them apart. */
    assert.equal(beyondScale(4000, 4000), false);
    assert.equal(beyondScale(4001, 4000), true);
  });

  it("has no position and no band for a database that did not answer", () => {
    assert.equal(meterPosition(null, 4000), 0);
    assert.equal(beyondScale(null, 4000), false);
    assert.equal(bandFor(null, BANDS), null);
  });

  it("reads a value into the band that decides what it means", () => {
    assert.equal(bandFor(120, BANDS).label, "fast");
    assert.equal(bandFor(250, BANDS).label, "fast", "a band includes its own ceiling");
    assert.equal(bandFor(251, BANDS).label, "usable");
    assert.equal(bandFor(1400, BANDS).label, "slow");
    assert.equal(bandFor(3000, BANDS).label, "timing out");
  });

  it("keeps a reading past every band in the worst one", () => {
    assert.equal(bandFor(99999, BANDS).label, "timing out");
  });
});

describe("the recency scale", () => {
  const WEEK = 60 * 24 * 7;

  it("puts now at the right-hand edge", () => {
    assert.equal(recencyPosition(0, WEEK), 1);
    assert.equal(recencyPosition(1, WEEK), 1);
  });

  it("puts the horizon and anything older at the left-hand edge", () => {
    assert.equal(recencyPosition(WEEK, WEEK), 0);
    assert.equal(recencyPosition(WEEK * 10, WEEK), 0);
  });

  it("never pushes a fresh event off the end", () => {
    /* Twenty seconds ago. Linear this is fine; logarithmic it goes negative
       and lands outside the track unless it is clamped. */
    const place = recencyPosition(0.33, WEEK);
    assert.ok(place <= 1 && place >= 0, `expected 0..1, got ${place}`);
  });

  it("spreads the live end instead of collapsing it", () => {
    /* The reason the axis is logarithmic at all. On a linear week, a minute
       and an hour are 0.0099 apart — the same pixel. They must be far
       enough apart here to be told apart across a room. */
    const minute = recencyPosition(1, WEEK);
    const hour = recencyPosition(60, WEEK);
    const day = recencyPosition(60 * 24, WEEK);

    assert.ok(minute > hour && hour > day, "more recent must sit further right");
    assert.ok(
      minute - hour > 0.3,
      `a minute and an hour should be well separated, were ${(minute - hour).toFixed(3)}`
    );
  });

  it("orders every pair the way time does", () => {
    const ages = [2, 10, 60, 240, 1440, 4320, WEEK - 1];
    for (let i = 1; i < ages.length; i += 1) {
      assert.ok(
        recencyPosition(ages[i - 1], WEEK) > recencyPosition(ages[i], WEEK),
        `${ages[i - 1]} min should sit right of ${ages[i]} min`
      );
    }
  });

  it("has no position for something that never happened", () => {
    /* Never is not a very old time, it is a different fact. A dot at the far
       left would claim evidence this product does not have. */
    assert.equal(recencyPosition(null, WEEK), null);
    assert.equal(minutesSince(null, Date.now()), null);
    assert.equal(minutesSince("not a date", Date.now()), null);
  });

  it("measures an age from the instant it was given", () => {
    const now = Date.UTC(2026, 8, 4, 12, 0, 0);
    assert.equal(minutesSince(new Date(Date.UTC(2026, 8, 4, 11, 0, 0)), now), 60);
    /* A row written a moment in the future — clock skew between the database
       and this process — is "just now", never a negative age. */
    assert.equal(minutesSince(new Date(Date.UTC(2026, 8, 4, 12, 5, 0)), now), 0);
  });
});

describe("bar lengths", () => {
  it("draws a share of the largest row", () => {
    assert.equal(barPercent(50, 100), 50);
    assert.equal(barPercent(100, 100), 100);
  });

  it("gives a tiny real value visible ink", () => {
    /* Three audit lines beside three million returns. An empty track means
       "none" everywhere else in this product, and "a few" is not none. */
    assert.ok(barPercent(3, 3_000_000) >= 1.5);
  });

  it("gives a true zero no ink at all", () => {
    assert.equal(barPercent(0, 100), 0);
  });

  it("never runs past the end of its track", () => {
    assert.equal(barPercent(500, 100), 100);
  });
});

describe("splitting a whole", () => {
  it("turns counts into shares that account for all of it", () => {
    const shares = splitShares([
      { label: "can sign in", value: 30 },
      { label: "waiting", value: 10 },
      { label: "shut off", value: 10 },
    ]);
    assert.equal(shares.length, 3);
    assert.equal(Math.round(shares.reduce((sum, row) => sum + row.share, 0)), 100);
    assert.equal(shares[0].share, 60);
  });

  it("drops a category with nothing in it rather than drawing a sliver", () => {
    const shares = splitShares([
      { label: "can sign in", value: 5 },
      { label: "waiting", value: 0 },
    ]);
    assert.deepEqual(
      shares.map((row) => row.label),
      ["can sign in"]
    );
  });

  it("draws nothing at all when there is nothing to divide", () => {
    assert.deepEqual(splitShares([{ label: "none", value: 0 }]), []);
  });
});
