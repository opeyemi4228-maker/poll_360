import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isStale, nextInterval, shouldRefresh } from "../lib/live-state.js";

/**
 * When a dashboard asks the server again.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A THOUSAND TABS ON A FIXED TIMER ARE THREE SPIKES A MINUTE, NOT A FLAT
 *  THOUSAND REQUESTS
 *
 *  Viewers do not arrive at random — they arrive when a bulletin says the
 *  figures are in, when a shift starts, when a link goes into a group. A
 *  fixed interval then preserves that alignment forever: everybody who opened
 *  the page in the same second refreshes in the same second, for the rest of
 *  the night.
 *
 *  The first two cases below are the whole of the fix, and the third is what
 *  happens when the server is already struggling.
 * ══════════════════════════════════════════════════════════════════════════
 */

describe("spreading the refresh out", () => {
  it("averages the interval it was asked for", () => {
    /* The spread must not quietly make every board slower or faster than the
       number written on it. */
    let total = 0;
    const runs = 20_000;
    for (let n = 0; n < runs; n += 1) total += nextInterval(20);

    const average = total / runs / 1000;
    assert.ok(Math.abs(average - 20) < 0.3, `averaged ${average}s rather than 20s`);
  });

  it("gives two viewers who started together different next refreshes", () => {
    const seen = new Set();
    for (let n = 0; n < 500; n += 1) seen.add(nextInterval(20));

    assert.ok(seen.size > 100, "every viewer was handed the same interval");
  });

  it("keeps the figures within a quarter of the age the screen claims", () => {
    /* Somebody reading a total out loud is entitled to know it is twenty
       seconds old rather than thirty. */
    for (let n = 0; n < 2000; n += 1) {
      const interval = nextInterval(20) / 1000;
      assert.ok(interval >= 15 && interval <= 25, `${interval}s is outside the window`);
    }
  });

  it("asks less often after a failure, and much less after several", () => {
    const steady = nextInterval(20, { failures: 0, random: () => 0.5 });
    const once = nextInterval(20, { failures: 1, random: () => 0.5 });
    const twice = nextInterval(20, { failures: 2, random: () => 0.5 });

    assert.equal(steady, 20_000);
    assert.equal(once, 40_000);
    assert.equal(twice, 80_000);
  });

  it("stops backing off, so a board cannot quietly go dark for an hour", () => {
    /* Eight times the interval, and no further. Beyond that a board has
       stopped being live, and a board that is silently no longer live is the
       one failure this component exists to prevent — so the backoff is capped
       and the ring on the screen says "stale" instead. */
    assert.equal(nextInterval(20, { failures: 3, random: () => 0.5 }), 160_000);
    assert.equal(nextInterval(20, { failures: 40, random: () => 0.5 }), 160_000);
  });

  it("makes sense of an interval nobody meant", () => {
    for (const asked of [0, -5, Number.NaN, undefined, "twenty"]) {
      const interval = nextInterval(asked, { random: () => 0.5 });
      assert.ok(Number.isFinite(interval) && interval > 0, `${asked} gave ${interval}`);
    }
  });
});

describe("whether to ask at all", () => {
  it("does not ask when nobody is looking", () => {
    assert.equal(shouldRefresh({ visible: false, online: true, busy: false }), false);
  });

  it("does not ask when there is no network", () => {
    /* On a handset at a booth, retrying into nothing is the battery going for
       nothing. */
    assert.equal(shouldRefresh({ visible: true, online: false, busy: false }), false);
  });

  it("does not start a second refresh on top of one already running", () => {
    /* A slow server would otherwise collect a queue of duplicate work per
       viewer, which is the last thing a slow server needs. */
    assert.equal(shouldRefresh({ visible: true, online: true, busy: true }), false);
  });

  it("asks when the tab is open, the network is there and nothing is in flight", () => {
    assert.equal(shouldRefresh({ visible: true, online: true, busy: false }), true);
  });

  it("asks by default, so a browser that reports none of this is not frozen", () => {
    assert.equal(shouldRefresh({}), true);
  });
});

describe("saying when the figures have stopped moving", () => {
  it("holds off until well past one missed refresh", () => {
    assert.equal(isStale(25, 20), false);
    assert.equal(isStale(45, 20), false);
    assert.equal(isStale(60, 20), true);
  });
});
