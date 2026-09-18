import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { boardKey, boardPrefix, cached, clearCache, invalidate, personal } from "../lib/cache.js";

/**
 * One answer, shared by everybody asking the same question.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE PROPERTY THAT DECIDES WHETHER THIS SURVIVES AN ELECTION NIGHT
 *
 *  A thousand people watching the same board refresh every twenty seconds.
 *  Without this they are three thousand identical queries a minute; with it
 *  they are one. The test that matters most is therefore not "does it
 *  remember" — every cache remembers — it is "what happens to the hundred
 *  requests that arrive in the same instant as a miss". A plain cache runs a
 *  hundred queries. This one runs one, and the third case below is that.
 * ══════════════════════════════════════════════════════════════════════════
 */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  clearCache();
});

describe("sharing one answer", () => {
  it("asks once and hands the same answer to the next caller", async () => {
    let asked = 0;
    const produce = async () => {
      asked += 1;
      return { units: 12 };
    };

    const first = await cached("k", produce, { ttlMs: 1000 });
    const second = await cached("k", produce, { ttlMs: 1000 });

    assert.equal(asked, 1);
    assert.deepEqual(second, first);
  });

  it("asks again once the answer is no longer current", async () => {
    let asked = 0;
    const produce = async () => ++asked;

    await cached("k", produce, { ttlMs: 20 });
    await wait(80);
    await cached("k", produce, { ttlMs: 20 });

    assert.equal(asked, 2);
  });

  it("runs one query for a hundred callers arriving together", async () => {
    let asked = 0;
    const produce = async () => {
      asked += 1;
      await wait(20);
      return asked;
    };

    /* The stampede: every one of these is a miss at the moment it is made. */
    const answers = await Promise.all(
      Array.from({ length: 100 }, () => cached("k", produce, { ttlMs: 1000 }))
    );

    assert.equal(asked, 1);
    assert.deepEqual(new Set(answers), new Set([1]));
  });

  it("hands over slightly old figures rather than making a reader wait", async () => {
    let asked = 0;
    const produce = async () => {
      asked += 1;
      await wait(20);
      return asked;
    };

    const first = await cached("k", produce, { ttlMs: 20, staleMs: 5000 });
    assert.equal(first, 1);

    await wait(80);

    /* Past its time to live, inside its stale window: answered immediately
       with the old value while a fresh one is fetched behind it. */
    const second = await cached("k", produce, { ttlMs: 20, staleMs: 5000 });
    assert.equal(second, 1);

    await wait(120);
    const third = await cached("k", produce, { ttlMs: 20, staleMs: 5000 });
    assert.equal(third, 2, "the refresh behind the stale answer did land");
  });

  it("never keeps a failure, so one bad query is not a window of bad answers", async () => {
    let asked = 0;
    const produce = async () => {
      asked += 1;
      if (asked === 1) throw new Error("the database could not be reached");
      return "figures";
    };

    await assert.rejects(() => cached("k", produce, { ttlMs: 1000 }));
    assert.equal(await cached("k", produce, { ttlMs: 1000 }), "figures");
    assert.equal(asked, 2);
  });

  it("keeps the old figures when a refresh fails, rather than showing an error", async () => {
    let fail = false;
    const produce = async () => {
      if (fail) throw new Error("gone");
      return "figures";
    };

    await cached("k", produce, { ttlMs: 20, staleMs: 5000 });
    fail = true;
    await wait(80);

    /* The stale answer is served and the refresh behind it fails quietly. A
       board reading slightly old totals beats a board reading an error. */
    assert.equal(await cached("k", produce, { ttlMs: 20, staleMs: 5000 }), "figures");
  });

  it("does not let a background failure become an unhandled rejection", async () => {
    /* A rejected promise nobody awaits takes the process down in Node. The
       stale path deliberately does not await its refresh, so this is the case
       that proves the refresh's own catch is doing its job. */
    const produce = async () => {
      throw new Error("gone");
    };

    await cached("k", async () => "figures", { ttlMs: 20, staleMs: 5000 });
    await wait(80);
    assert.equal(await cached("k", produce, { ttlMs: 20, staleMs: 5000 }), "figures");
    await wait(60);
  });
});

describe("throwing an answer away when something changed it", () => {
  it("clears every answer about one project and leaves the others", async () => {
    const produce = async () => "old";

    const mine = boardKey("counted", { electionId: "e1", race: "PRESIDENTIAL" });
    const theirs = boardKey("counted", { electionId: "e2", race: "PRESIDENTIAL" });

    await cached(mine, produce, { ttlMs: 10_000 });
    await cached(theirs, produce, { ttlMs: 10_000 });

    invalidate(boardPrefix("e1"));

    assert.equal(await cached(mine, async () => "new", { ttlMs: 10_000 }), "new");
    assert.equal(await cached(theirs, async () => "new", { ttlMs: 10_000 }), "old");
  });
});

describe("what may never go in here", () => {
  it("keys a board answer on the contest and the ground and nothing else", () => {
    const key = boardKey("counted", {
      electionId: "e1",
      race: "GOVERNORSHIP",
      territory: "25/07",
    });

    assert.equal(key, "board|e1|counted|GOVERNORSHIP|25/07");
  });

  it("gives two contests over the same ground two different answers", () => {
    assert.notEqual(
      boardKey("counted", { electionId: "e1", race: "PRESIDENTIAL", territory: "25" }),
      boardKey("counted", { electionId: "e1", race: "SENATE", territory: "25" })
    );
  });

  it("refuses, loudly, to hold anything belonging to one person", () => {
    assert.throws(personal, /belonging to one person/);
  });
});
