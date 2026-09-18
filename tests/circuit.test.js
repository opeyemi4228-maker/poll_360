import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { backoff, breaker, gate } from "../lib/circuit.js";

/**
 * Keeping one slow dependency from taking this product down with it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  "FIRE AND FORGET" NEVER MEANT "COSTS NOTHING"
 *
 *  Every forward to Data Bank is deliberately not awaited, so that a hub
 *  having a bad night cannot become an agent who could not file. What that
 *  does not do is make the forward free: it holds a socket for up to twenty
 *  seconds, and on the hour every booth finishes counting there is no bound
 *  on how many are open at once.
 *
 *  These are the bounds.
 * ══════════════════════════════════════════════════════════════════════════
 */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("only so many at once", () => {
  it("runs up to the limit together and makes the rest wait", async () => {
    const door = gate({ limit: 2 });
    let running = 0;
    let peak = 0;

    const work = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await wait(10);
      running -= 1;
    };

    await Promise.all(Array.from({ length: 10 }, () => door.run(work)));

    assert.equal(peak, 2, "more than the limit ran at the same time");
  });

  it("releases its slot when the work throws, not only when it succeeds", async () => {
    /* A gate that leaks a slot on failure closes itself over an evening of
       failures, which is precisely the evening it is needed. */
    const door = gate({ limit: 1 });

    for (let n = 0; n < 5; n += 1) {
      await assert.rejects(() => door.run(async () => {
        throw new Error("no");
      }));
    }

    assert.equal(await door.run(async () => "through"), "through");
  });

  it("releases its slot when the work throws before returning a promise", async () => {
    const door = gate({ limit: 1 });

    await assert.rejects(() =>
      door.run(() => {
        throw new Error("threw rather than rejected");
      })
    );

    assert.equal(await door.run(async () => "through"), "through");
  });

  it("turns work away rather than queueing without end", async () => {
    /* An unbounded queue is a memory leak that presents as a working system:
       everything is accepted, nothing is done, and the first symptom is the
       process being killed with the whole queue inside it. */
    const door = gate({ limit: 1, queueLimit: 2 });
    const held = [];

    /* One running, two queued. */
    held.push(door.run(() => wait(50)));
    held.push(door.run(() => wait(50)));
    held.push(door.run(() => wait(50)));

    await assert.rejects(
      () => door.run(() => wait(50)),
      (error) => error.shed === true && error.name === "Shed"
    );

    await Promise.all(held);
  });

  it("keeps running the queue after one piece of work fails", async () => {
    const door = gate({ limit: 1 });
    const done = [];

    const results = await Promise.allSettled([
      door.run(async () => {
        throw new Error("no");
      }),
      door.run(async () => done.push("second")),
      door.run(async () => done.push("third")),
    ]);

    assert.equal(results[0].status, "rejected");
    assert.deepEqual(done, ["second", "third"]);
  });
});

describe("giving up on something that is plainly down", () => {
  it("stays out of the way until it has seen enough failures", () => {
    const fuse = breaker({ failures: 3 });

    for (let n = 0; n < 2; n += 1) {
      assert.equal(fuse.ready(), true);
      fuse.failed();
    }

    assert.equal(fuse.ready(), true, "opened before it had grounds to");
    fuse.failed();
    assert.equal(fuse.ready(), false, "did not open after enough failures");
  });

  it("forgets the failures as soon as one call works", () => {
    const fuse = breaker({ failures: 3 });

    fuse.failed();
    fuse.failed();
    fuse.succeeded();
    fuse.failed();
    fuse.failed();

    assert.equal(fuse.ready(), true, "counted failures either side of a success");
  });

  it("lets exactly one call through when the cool-off has passed", async () => {
    /* The whole trick. Without it, the instant the cool-off expires every
       waiting caller tries at once, against an endpoint very likely still
       down — and the breaker has arranged a stampede rather than prevented
       one. */
    const fuse = breaker({ failures: 1, coolOffMs: 60 });

    fuse.ready();
    fuse.failed();
    assert.equal(fuse.ready(), false);

    await wait(90);

    assert.equal(fuse.ready(), true, "the one probe was not let through");
    assert.equal(fuse.ready(), false, "a second probe went through as well");
  });

  it("waits longer each time the probe fails, up to a ceiling", async () => {
    const fuse = breaker({ failures: 1, coolOffMs: 60, maxCoolOffMs: 180 });

    fuse.ready();
    fuse.failed();
    assert.equal(fuse.stats().coolOffMs, 60);

    await wait(90);
    fuse.ready();
    fuse.failed();
    assert.equal(fuse.stats().coolOffMs, 120);

    await wait(150);
    fuse.ready();
    fuse.failed();
    assert.equal(fuse.stats().coolOffMs, 180, "did not stop at the ceiling");
  });

  it("closes again, and resets its patience, when the probe works", async () => {
    const fuse = breaker({ failures: 1, coolOffMs: 60 });

    fuse.ready();
    fuse.failed();
    await wait(90);

    assert.equal(fuse.ready(), true);
    fuse.succeeded();

    assert.equal(fuse.stats().state, "closed");
    assert.equal(fuse.ready(), true);
  });
});

describe("waiting a bit, and not the same bit as everybody else", () => {
  it("grows the span it draws from, and stops at the ceiling", () => {
    const spans = [];
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      let widest = 0;
      for (let n = 0; n < 200; n += 1) widest = Math.max(widest, backoff(attempt, { base: 100, ceiling: 5000 }));
      spans.push(widest);
    }

    assert.ok(spans[0] <= 100);
    assert.ok(spans[3] > spans[0], "the wait did not grow");
    assert.ok(spans.at(-1) <= 5000, "the wait passed its ceiling");
  });

  it("does not hand every caller the same wait", () => {
    /* Four hundred failed forwards retrying at exactly 800ms is the first
       wave arriving a second time, all at once, at a hub that was recovering.
       The jitter is what turns that wave into a slope. */
    const seen = new Set();
    for (let n = 0; n < 200; n += 1) seen.add(backoff(4, { base: 100, ceiling: 5000 }));

    assert.ok(seen.size > 50, "the waits are not spread out at all");
  });

  it("never returns a negative wait, whatever it is handed", () => {
    for (const attempt of [0, -1, Number.NaN]) {
      const waited = backoff(attempt, { base: 100 });
      assert.ok(Number.isFinite(waited) && waited >= 0, `attempt ${attempt} gave ${waited}`);
    }
  });
});
