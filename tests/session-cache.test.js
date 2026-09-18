import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

/**
 * Recognising somebody without asking the database every single time.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS TRADES A STATED GUARANTEE FOR CAPACITY, AND THE TRADE HAS TO BE
 *  EXACTLY THE ONE THAT WAS DESCRIBED
 *
 *  lib/session.js reads who is asking from the database on every request, on
 *  purpose, so that disabling an account takes effect on the next click. That
 *  is also one query per request from every signed-in person, which is the
 *  busiest query in the product and does not survive a hundred thousand
 *  people with a dashboard open.
 *
 *  Holding the answer for a few seconds fixes the capacity and moves the
 *  guarantee. These tests hold the moved guarantee to exactly what the module
 *  claims — in particular the two things that must not have moved at all:
 *  a failed lookup is never remembered, and nobody can be handed somebody
 *  else's session.
 * ══════════════════════════════════════════════════════════════════════════
 */

async function load(seconds) {
  if (seconds === null) delete process.env.SESSION_CACHE_SECONDS;
  else process.env.SESSION_CACHE_SECONDS = String(seconds);
  return import(`../lib/session-cache.js?t=${Math.random()}`);
}

let savedNodeEnv;

beforeEach(() => {
  savedNodeEnv = process.env.NODE_ENV;
});

afterEach(() => {
  delete process.env.SESSION_CACHE_SECONDS;
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("holding the answer", () => {
  it("asks once and reuses it inside the window", async () => {
    const { recogniseWith } = await load(1);
    let asked = 0;
    const lookUp = async () => {
      asked += 1;
      return { id: "u1", role: "ADMIN" };
    };

    const first = await recogniseWith("token-hash", lookUp);
    const second = await recogniseWith("token-hash", lookUp);

    assert.equal(asked, 1);
    assert.deepEqual(second, first);
  });

  it("asks again once the window has passed", async () => {
    const { recogniseWith } = await load(0.05);
    let asked = 0;
    const lookUp = async () => ++asked;

    await recogniseWith("token-hash", lookUp);
    await wait(120);
    await recogniseWith("token-hash", lookUp);

    assert.equal(asked, 2);
  });

  it("never hands one session's answer to another", async () => {
    /* The failure that would matter most. It cannot happen by construction —
       the key is the hash of the token itself, so an entry can only be read
       by whoever already holds that token — and it is asserted anyway. */
    const { recogniseWith } = await load(10);

    const mine = await recogniseWith("hash-a", async () => ({ id: "u1" }));
    const theirs = await recogniseWith("hash-b", async () => ({ id: "u2" }));

    assert.equal(mine.id, "u1");
    assert.equal(theirs.id, "u2");
  });

  it("does not remember a token that matched nothing", async () => {
    /* Otherwise a session created a moment ago is remembered as invalid, and
       somebody signs in and is told they are not signed in. */
    const { recogniseWith } = await load(10);
    let asked = 0;
    const lookUp = async () => {
      asked += 1;
      return asked === 1 ? null : { id: "u1" };
    };

    assert.equal(await recogniseWith("hash", lookUp), null);
    assert.deepEqual(await recogniseWith("hash", lookUp), { id: "u1" });
    assert.equal(asked, 2);
  });

  it("forgets one session on demand, which is what signing out does", async () => {
    const { recogniseWith, forgetSession } = await load(10);
    let asked = 0;
    const lookUp = async () => ({ id: "u1", n: ++asked });

    await recogniseWith("hash", lookUp);
    forgetSession("hash");
    await recogniseWith("hash", lookUp);

    assert.equal(asked, 2);
  });
});

describe("switching it off", () => {
  it("asks every time when the window is zero", async () => {
    const { recogniseWith } = await load(0);
    let asked = 0;
    const lookUp = async () => ({ id: "u1", n: ++asked });

    await recogniseWith("hash", lookUp);
    await recogniseWith("hash", lookUp);
    await recogniseWith("hash", lookUp);

    assert.equal(asked, 3, "the window could not be switched off");
  });

  it("is off in development, so revoking an account can be tested", async () => {
    process.env.NODE_ENV = "development";
    const { sessionCacheStats } = await load(null);

    assert.equal(sessionCacheStats().seconds, 0);
  });

  it("is on, and short, in production", async () => {
    process.env.NODE_ENV = "production";
    const { sessionCacheStats } = await load(null);

    const { seconds } = sessionCacheStats();
    assert.ok(seconds > 0 && seconds <= 10, `held for ${seconds}s, which is not "a few"`);
  });

  it("refuses to be talked into holding a session for an hour", async () => {
    /* A window long enough to matter is a window in which a disabled account
       keeps working, and the whole argument for this is that it does not. */
    process.env.NODE_ENV = "production";
    const { sessionCacheStats } = await load(6000);

    assert.ok(sessionCacheStats().seconds <= 60);
  });

  it("ignores a setting that is not a number of seconds", async () => {
    process.env.NODE_ENV = "production";
    const { sessionCacheStats } = await load("soon");

    assert.equal(sessionCacheStats().seconds, 5, "fell back to something other than the default");
  });
});
