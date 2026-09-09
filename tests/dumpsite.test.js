import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

/**
 * The door to DumpSite.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONLY PROPERTY THAT REALLY MATTERS HERE IS THAT IT CANNOT HURT ANYBODY
 *
 *  An agent standing at a booth at nine at night presses "file". If delivering
 *  that return to the hub is anywhere on the path between them and a saved
 *  result, then a hub that is slow, unreachable, unconfigured or simply not
 *  deployed yet becomes an agent who cannot file — and the count loses a
 *  polling unit to a piece of plumbing.
 *
 *  So every test below is one shape of that: the send fails, and the caller
 *  carries on. The second property is that the failure is kept rather than
 *  forgotten, because fire-and-forget is only honest if the forgetting is
 *  written down.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THIS MOCKS `fetch` AND NOT A CLIENT LIBRARY ────────────────────────
 * There is no client library. The module calls the platform's own `fetch`, so
 * the seam a test can hold is the global, and holding it here means the test
 * exercises the same code path production does rather than a stub of it.
 */

const KEY = "test-key";
const URL = "https://dumpsite.example";

/* Loaded fresh per case: the module reads its configuration once as it loads,
   which is right for a server and means a test that changes the environment
   has to re-import to see it. */
async function load({ url = URL, key = KEY } = {}) {
  process.env.DUMPSITE_URL = url ?? "";
  process.env.DUMPSITE_API_KEY = key ?? "";
  /* A fresh query string is the documented way to defeat the module cache. */
  return import(`../lib/dumpsite.js?t=${Math.random()}`);
}

let calls;
let realFetch;

beforeEach(() => {
  calls = [];
  realFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.DUMPSITE_URL;
  delete process.env.DUMPSITE_API_KEY;
});

/** A hub that accepts everything and remembers what it was sent. */
function hubAccepts() {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: "item-1", status: "RECEIVED" }), { status: 200 });
  };
}

describe("whether the hub is wired up at all", () => {
  it("does nothing, quietly, when nobody has connected one", async () => {
    /* Not an error. A deployment with no hub is a perfectly ordinary
       deployment, and it must not fill an outbox with rows nobody asked for. */
    const { configured, sendToDumpSite } = await load({ url: "", key: "" });
    globalThis.fetch = () => {
      throw new Error("must not reach the network");
    };

    assert.equal(configured(), false);
    const seen = await sendToDumpSite({ kind: "REGISTRATION", payload: {} });
    assert.deepEqual(seen, { sent: false, why: "not-configured" });
  });

  it("needs both the address and the key before it will send", async () => {
    /* Half a configuration is a misconfiguration, and sending to a hub with
       no key just fills its log with 403s. */
    const withoutKey = await load({ url: URL, key: "" });
    assert.equal(withoutKey.configured(), false);

    const withoutUrl = await load({ url: "", key: KEY });
    assert.equal(withoutUrl.configured(), false);

    const both = await load();
    assert.equal(both.configured(), true);
  });
});

describe("what reaches the hub", () => {
  it("presents the key in the header the hub reads", async () => {
    const { sendToDumpSite } = await load();
    hubAccepts();

    await sendToDumpSite({ kind: "REGISTRATION", payload: { name: "A" } });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.headers["x-dumpsite-key"], KEY);
    assert.match(calls[0].url, /\/api\/intake$/);
  });

  it("does not double the slash when the address has a trailing one", async () => {
    /* A URL nobody notices is wrong until the hub returns 404 for everything. */
    const { sendToDumpSite } = await load({ url: `${URL}/` });
    hubAccepts();

    await sendToDumpSite({ kind: "MESSAGE", payload: {} });
    assert.equal(calls[0].url, `${URL}/api/intake`);
  });

  it("stamps every payload with which product sent it and when", async () => {
    /* The hub serves more than one product. A row with no origin is a row
       nobody can trace back on the morning somebody asks where it came from. */
    const { sendToDumpSite } = await load();
    hubAccepts();

    await sendToDumpSite({ kind: "RESULT_FIGURES", payload: { unitCode: "25/07/04/019" } });

    const { payload } = calls[0].body;
    assert.equal(payload.origin, "POLL360");
    assert.ok(Date.parse(payload.sentAt), "sentAt is not a date");
    assert.equal(payload.unitCode, "25/07/04/019", "the caller's own fields survive");
  });

  it("carries the external id, so a replay cannot make a second copy", async () => {
    /* The hub dedupes on it. Without one, sending the outbox again after a bad
       night would double every return that had already landed. */
    const { sendToDumpSite } = await load();
    hubAccepts();

    await sendToDumpSite({
      kind: "RESULT_FIGURES",
      externalId: "poll360:result:e1:PRESIDENTIAL:25/07/04/019",
      payload: {},
    });

    assert.equal(calls[0].body.externalId, "poll360:result:e1:PRESIDENTIAL:25/07/04/019");
  });

  it("carries media hashes so a figure can be paired with its photograph", async () => {
    /* The hub holds the image and the reading as two items and pairs them on
       the hash, rather than keeping a second copy of a six-megabyte photo. */
    const { sendToDumpSite } = await load();
    hubAccepts();

    await sendToDumpSite({ kind: "RESULT_FIGURES", payload: {}, mediaHashes: ["abc123"] });
    assert.deepEqual(calls[0].body.mediaHashes, ["abc123"]);
  });
});

describe("when the hub is having a bad night", () => {
  it("returns why rather than throwing, when it refuses", async () => {
    const { sendToDumpSite } = await load();
    globalThis.fetch = async () => new Response("no", { status: 403 });

    const seen = await sendToDumpSite({ kind: "REGISTRATION", payload: {} });
    assert.equal(seen.sent, false);
    assert.equal(seen.why, "http-403");
  });

  it("returns why rather than throwing, when it cannot be reached", async () => {
    const { sendToDumpSite } = await load();
    globalThis.fetch = async () => {
      throw Object.assign(new Error("connect ECONNREFUSED"), { name: "TypeError" });
    };

    const seen = await sendToDumpSite({ kind: "REGISTRATION", payload: {} });
    assert.equal(seen.sent, false);
    assert.equal(seen.why, "unreachable");
  });

  it("returns why rather than throwing, when it is too slow", async () => {
    const { sendToDumpSite } = await load();
    globalThis.fetch = async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    };

    const seen = await sendToDumpSite({ kind: "RESULT_SHEET", payload: {} });
    assert.equal(seen.sent, false);
    assert.equal(seen.why, "timeout");
  });

  it("never rejects out of the fire-and-forget form, whatever happens", async () => {
    /* ── THE TEST THIS FILE EXISTS FOR ───────────────────────────────────
       `forwardToDumpSite` is called from server actions on a user's path. An
       unhandled rejection there can take the request down, which would mean a
       hub being unreachable costs an agent their return — the exact failure
       this whole design is arranged to prevent. */
    const { forwardToDumpSite } = await load();
    globalThis.fetch = async () => {
      throw new Error("something nobody anticipated");
    };

    let rejected = false;
    const onRejection = () => {
      rejected = true;
    };
    process.on("unhandledRejection", onRejection);

    assert.equal(forwardToDumpSite({ kind: "REGISTRATION", payload: {} }), undefined);
    /* Two turns of the loop is enough for a rejection to surface. */
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    process.off("unhandledRejection", onRejection);
    assert.equal(rejected, false, "a failed send rejected onto the caller's path");
  });

  it("gives the caller nothing to await, so it cannot be put on the path", async () => {
    /* Shape as documentation: `forwardToDumpSite` returns undefined on
       purpose, so a call site that tried to await it gets nothing and the
       mistake is visible in review rather than at nine at night. */
    const { forwardToDumpSite } = await load();
    hubAccepts();
    assert.equal(forwardToDumpSite({ kind: "MESSAGE", payload: {} }), undefined);
  });
});
