import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

/**
 * A counter every instance of this application can see.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONE PROPERTY WORTH MORE THAN ACCURACY HERE IS THAT IT CANNOT LOCK
 *  ANYBODY OUT BY FAILING
 *
 *  This guards sign-in. If the shared store is unreachable at nine o'clock on
 *  election night and this throws, or counts a failure it never saw, then
 *  four thousand agents cannot get into the product — and the cause is a
 *  limiter that exists to slow down a nuisance. So every failure path below
 *  ends in "let them through", and the in-process limiter is still underneath
 *  it. That is the trade, stated out loud and tested.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* Loaded fresh per case: the module reads its configuration once as it loads,
   which is right for a server and means a test that changes the environment
   has to re-import to see it. */
async function load(env = {}) {
  for (const [name, value] of Object.entries(env)) {
    if (value === null) delete process.env[name];
    else process.env[name] = value;
  }
  return import(`../lib/shared-counter.js?t=${Math.random()}`);
}

let realFetch;

beforeEach(() => {
  realFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("counting in memory, when nothing shared is configured", () => {
  it("counts up within a window and starts again after it", async () => {
    const { increment, resetMemoryCounters } = await load({
      UPSTASH_REDIS_REST_URL: null,
      UPSTASH_REDIS_REST_TOKEN: null,
      DATABASE_URL: null,
      DATABANK_DATABASE_URL: null,
    });
    resetMemoryCounters();

    assert.equal(await increment("k", 120), 1);
    assert.equal(await increment("k", 120), 2);
    assert.equal(await increment("k", 120), 3);

    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(await increment("k", 120), 1, "a new window is a new count");
  });

  it("forgets a counter when whatever it guarded succeeded", async () => {
    const { increment, forget, resetMemoryCounters } = await load({
      UPSTASH_REDIS_REST_URL: null,
      DATABASE_URL: null,
      DATABANK_DATABASE_URL: null,
    });
    resetMemoryCounters();

    await increment("k", 1000);
    await increment("k", 1000);
    await forget("k");

    assert.equal(await increment("k", 1000), 1);
  });
});

describe("counting in Redis, when it is configured", () => {
  it("sends one pipelined request and reads the count from it", async () => {
    const sent = [];
    globalThis.fetch = async (url, init) => {
      sent.push({ url: String(url), body: JSON.parse(init.body), init });
      return new Response(JSON.stringify([{ result: 4 }, { result: 1 }]), { status: 200 });
    };

    const { increment, counterBacking } = await load({
      UPSTASH_REDIS_REST_URL: "https://redis.example/",
      UPSTASH_REDIS_REST_TOKEN: "token",
    });

    assert.equal(counterBacking(), "redis");
    assert.equal(await increment("signin:ip:203.0.113.9", 600_000), 4);

    assert.equal(sent.length, 1, "one round trip, not two");
    assert.equal(sent[0].url, "https://redis.example/pipeline");
    assert.deepEqual(sent[0].body, [
      ["INCR", "signin:ip:203.0.113.9"],
      ["EXPIRE", "signin:ip:203.0.113.9", "600"],
    ]);
    assert.equal(sent[0].init.headers.authorization, "Bearer token");
  });

  it("lets the caller through when the store cannot be reached", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed");
    };

    const { increment } = await load({
      UPSTASH_REDIS_REST_URL: "https://redis.example",
      UPSTASH_REDIS_REST_TOKEN: "token",
    });

    /* One, as though they were the first. Not an error, and not a number
       large enough to refuse them. */
    assert.equal(await increment("k", 1000), 1);
  });

  it("lets the caller through when the store answers with an error", async () => {
    globalThis.fetch = async () => new Response("no", { status: 500 });

    const { increment } = await load({
      UPSTASH_REDIS_REST_URL: "https://redis.example",
      UPSTASH_REDIS_REST_TOKEN: "token",
    });

    assert.equal(await increment("k", 1000), 1);
  });

  it("lets the caller through when the store answers with nonsense", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ hello: true }), { status: 200 });

    const { increment } = await load({
      UPSTASH_REDIS_REST_URL: "https://redis.example",
      UPSTASH_REDIS_REST_TOKEN: "token",
    });

    assert.equal(await increment("k", 1000), 1);
  });

  it("never throws out of forget, whatever the store does", async () => {
    globalThis.fetch = async () => {
      throw new Error("gone");
    };

    const { forget } = await load({
      UPSTASH_REDIS_REST_URL: "https://redis.example",
      UPSTASH_REDIS_REST_TOKEN: "token",
    });

    await forget("k");
  });
});
