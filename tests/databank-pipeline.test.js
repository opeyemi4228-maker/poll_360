import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { verify } from "../lib/databank-signature.js";

/**
 * The pipeline to Data Bank, under load and under failure.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE HOUR EVERY BOOTH FINISHES COUNTING IS THE ONLY HOUR THAT MATTERS
 *
 *  tests/databank.test.js covers the thing that must never happen: a forward
 *  failing onto an agent's path. This file covers what happens when the hub
 *  is *slow* rather than broken, and thousands of returns arrive at once —
 *  which is not a failure anybody sees, and is how a product falls over
 *  because of a dependency it was careful not to depend on.
 * ══════════════════════════════════════════════════════════════════════════
 */

const KEY = "test-key";
const URL = "https://databank.example";
const SECRET = "a-shared-signing-secret";

async function load({ url = URL, key = KEY, secret = null } = {}) {
  process.env.DATABANK_URL = url ?? "";
  process.env.DATABANK_API_KEY = key ?? "";
  if (secret) process.env.DATABANK_SIGNING_SECRET = secret;
  else delete process.env.DATABANK_SIGNING_SECRET;
  return import(`../lib/databank.js?t=${Math.random()}`);
}

let realFetch;

beforeEach(() => {
  realFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.DATABANK_URL;
  delete process.env.DATABANK_API_KEY;
  delete process.env.DATABANK_SIGNING_SECRET;
});

const accepts = (calls) => async (url, init) => {
  calls.push({ url: String(url), init });
  return new Response(JSON.stringify({ id: "item-1", status: "RECEIVED" }), { status: 200 });
};

describe("signing what is sent", () => {
  it("signs the exact bytes that are posted", async () => {
    const calls = [];
    globalThis.fetch = accepts(calls);

    const { sendToDataBank } = await load({ secret: SECRET });
    await sendToDataBank({ kind: "RESULT_FIGURES", payload: { accredited: 412 } });

    const { headers, body } = calls[0].init;
    assert.ok(headers["x-databank-signature"], "nothing was signed");
    assert.equal(verify(SECRET, body, headers["x-databank-signature"]), true);
  });

  it("still presents the key, so a hub that does not check signatures keeps working", async () => {
    /* Added beside the key rather than instead of it: a change that needs two
       deployments to land at the same instant is a change that will be made on
       an election morning. */
    const calls = [];
    globalThis.fetch = accepts(calls);

    const { sendToDataBank } = await load({ secret: SECRET });
    await sendToDataBank({ kind: "MESSAGE", payload: {} });

    assert.equal(calls[0].init.headers["x-databank-key"], KEY);
    assert.equal(calls[0].init.headers["x-dumpsite-key"], KEY);
  });

  it("sends nothing extra when no signing secret is configured", async () => {
    const calls = [];
    globalThis.fetch = accepts(calls);

    const { sendToDataBank } = await load();
    await sendToDataBank({ kind: "MESSAGE", payload: {} });

    assert.equal(calls[0].init.headers["x-databank-signature"], undefined);
  });

  it("signs a body an eavesdropper cannot then edit", async () => {
    const calls = [];
    globalThis.fetch = accepts(calls);

    const { sendToDataBank } = await load({ secret: SECRET });
    await sendToDataBank({ kind: "RESULT_FIGURES", payload: { accredited: 412 } });

    const { headers, body } = calls[0].init;
    const altered = body.replace("412", "912");

    assert.equal(verify(SECRET, altered, headers["x-databank-signature"]), false);
  });
});

describe("when the hub is slow rather than broken", () => {
  it("does not hold more sockets open than its own ceiling", async () => {
    /* The failure this bounds: every return of the busiest hour in flight at
       once, none of them awaited, all of them competing with the agents' own
       requests for the same file descriptors. */
    let open = 0;
    let peak = 0;

    globalThis.fetch = async () => {
      open += 1;
      peak = Math.max(peak, open);
      await new Promise((resolve) => setTimeout(resolve, 15));
      open -= 1;
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    };

    const { sendToDataBank } = await load();

    await Promise.all(
      Array.from({ length: 100 }, (_, n) =>
        sendToDataBank({ kind: "RESULT_FIGURES", externalId: `r${n}`, payload: {} })
      )
    );

    assert.ok(peak <= 16, `held ${peak} connections open at once`);
    assert.ok(peak > 1, "sent them one at a time, which would be far too slow");
  });

  it("still delivers every one of them", async () => {
    const seen = new Set();
    globalThis.fetch = async (_url, init) => {
      seen.add(JSON.parse(init.body).externalId);
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    };

    const { sendToDataBank } = await load();

    const answers = await Promise.all(
      Array.from({ length: 50 }, (_, n) =>
        sendToDataBank({ kind: "RESULT_FIGURES", externalId: `r${n}`, payload: {} })
      )
    );

    assert.equal(seen.size, 50);
    assert.ok(answers.every((answer) => answer.sent), "a queued forward was lost");
  });
});

describe("when the hub is plainly down", () => {
  it("stops calling it, rather than collecting a timeout per return", async () => {
    /* A thousand calls to a dead endpoint is a thousand twenty-second
       timeouts to learn something already known — and every one of those is a
       socket the agents need. */
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts += 1;
      throw Object.assign(new Error("connect ECONNREFUSED"), { name: "TypeError" });
    };

    const { sendToDataBank, hubStats } = await load();

    for (let n = 0; n < 40; n += 1) {
      await sendToDataBank({ kind: "MESSAGE", externalId: `m${n}`, payload: {} });
    }

    assert.equal(attempts, 5, "kept calling a hub it already knew was down");
    assert.equal(hubStats().breaker.state, "open");
  });

  it("says so in the answer, so the outbox records why", async () => {
    globalThis.fetch = async () => {
      throw Object.assign(new Error("gone"), { name: "TypeError" });
    };

    const { sendToDataBank } = await load();

    for (let n = 0; n < 5; n += 1) {
      await sendToDataBank({ kind: "MESSAGE", externalId: `m${n}`, payload: {} });
    }

    const refused = await sendToDataBank({ kind: "MESSAGE", externalId: "m9", payload: {} });
    assert.deepEqual(refused, { sent: false, why: "hub-down" });
  });

  it("does not give up on the hub over a refusal that is this product's fault", async () => {
    /* A 401 is a key that was rotated. Retrying it a thousand times will not
       fix it, and neither will refusing to talk to a hub that is perfectly
       well — the fix is setting the new key and draining the outbox, and that
       drain needs the breaker closed. */
    globalThis.fetch = async () => new Response("no", { status: 401 });

    const { sendToDataBank, hubStats } = await load();

    for (let n = 0; n < 10; n += 1) {
      await sendToDataBank({ kind: "MESSAGE", externalId: `m${n}`, payload: {} });
    }

    assert.equal(hubStats().breaker.state, "closed");
  });

  it("does give up when the hub itself is failing", async () => {
    globalThis.fetch = async () => new Response("no", { status: 503 });

    const { sendToDataBank, hubStats } = await load();

    for (let n = 0; n < 6; n += 1) {
      await sendToDataBank({ kind: "MESSAGE", externalId: `m${n}`, payload: {} });
    }

    assert.equal(hubStats().breaker.state, "open");
  });
});

describe("what the health screen can see", () => {
  it("reports whether anything is wired up, and whether it is signed", async () => {
    const off = await load({ url: "", key: "" });
    assert.equal(off.hubStats().configured, false);
    assert.equal(off.hubStats().signed, false);

    const on = await load({ secret: SECRET });
    assert.equal(on.hubStats().configured, true);
    assert.equal(on.hubStats().signed, true);
  });

  it("never throws, whatever state the pipeline is in", async () => {
    const { hubStats } = await load();
    assert.doesNotThrow(hubStats);
  });
});
