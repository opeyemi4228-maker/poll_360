import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { REMEMBER_HOURS, forgetView, recallView, rememberView } from "../lib/last-view.js";

/**
 * Remembering where somebody was, and the four ways that goes wrong.
 *
 * Every case here is one somebody actually meets: a private window that throws
 * on read, a tab removed by a deployment, a value left over from three days
 * ago, and a shared machine where the previous reader's place must not become
 * the next reader's front door.
 */

/** A storage that behaves. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    size: () => map.size,
  };
}

/** A storage that throws on everything, as a private window does. */
const hostileStorage = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
  removeItem() {
    throw new Error("blocked");
  },
};

const VALID = new Set(["command", "results", "booth"]);

describe("remembering a view", () => {
  it("gives back what was written", () => {
    const storage = fakeStorage();
    rememberView({ storage, view: "booth", now: 1000 });
    assert.equal(recallView({ storage, valid: VALID, now: 2000 }), "booth");
  });

  it("has nothing to give back before anything is written", () => {
    assert.equal(recallView({ storage: fakeStorage(), valid: VALID }), null);
  });

  it("keeps a view written just inside the window", () => {
    const storage = fakeStorage();
    const now = 1_000_000_000;
    rememberView({ storage, view: "results", now });
    const justInside = now + REMEMBER_HOURS * 3600_000 - 1000;
    assert.equal(recallView({ storage, valid: VALID, now: justInside }), "results");
  });

  it("discards one older than the window", () => {
    /* A tab remembered from three days ago is archaeology, not a place, and
       restoring it would be surprising in exactly the way this prevents. */
    const storage = fakeStorage();
    const now = 1_000_000_000;
    rememberView({ storage, view: "results", now });
    const wellOutside = now + (REMEMBER_HOURS + 1) * 3600_000;
    assert.equal(recallView({ storage, valid: VALID, now: wellOutside }), null);
  });
});

describe("a view that no longer exists", () => {
  it("is discarded rather than restored", () => {
    /* Tabs are renamed and removed between deployments. Restoring a name
       nothing renders drops the reader on a blank frame, which is worse than
       the front door this feature exists to improve on. */
    const storage = fakeStorage();
    rememberView({ storage, view: "pulse", now: 1000 });
    assert.equal(recallView({ storage, valid: VALID, now: 2000 }), null);
  });

  it("is checked against the set it was given, not against a copy", () => {
    const storage = fakeStorage();
    rememberView({ storage, view: "watch", now: 1000 });
    assert.equal(recallView({ storage, valid: new Set(["watch"]), now: 2000 }), "watch");
    assert.equal(recallView({ storage, valid: new Set(["command"]), now: 2000 }), null);
  });
});

describe("storage that will not co-operate", () => {
  it("reads as nothing rather than throwing", () => {
    /* A room that will not paint because it could not read a convenience is
       strictly worse than one that opens on the wrong tab. */
    assert.doesNotThrow(() => recallView({ storage: hostileStorage, valid: VALID }));
    assert.equal(recallView({ storage: hostileStorage, valid: VALID }), null);
  });

  it("writes without throwing", () => {
    assert.doesNotThrow(() => rememberView({ storage: hostileStorage, view: "booth" }));
  });

  it("forgets without throwing", () => {
    assert.doesNotThrow(() => forgetView({ storage: hostileStorage }));
  });

  it("copes with no storage at all", () => {
    assert.equal(recallView({ storage: null, valid: VALID }), null);
    assert.doesNotThrow(() => rememberView({ storage: null, view: "booth" }));
    assert.doesNotThrow(() => forgetView({ storage: null }));
  });
});

describe("rubbish in the slot", () => {
  it("ignores something that is not JSON", () => {
    const storage = fakeStorage({ "poll360:last-view": "not json at all" });
    assert.equal(recallView({ storage, valid: VALID }), null);
  });

  it("ignores JSON of the wrong shape", () => {
    const storage = fakeStorage({ "poll360:last-view": JSON.stringify({ nope: true }) });
    assert.equal(recallView({ storage, valid: VALID }), null);
  });

  it("ignores an entry with no timestamp", () => {
    /* Written by an older build. Without a time there is no way to know
       whether it is a place or archaeology, so it is not trusted. */
    const storage = fakeStorage({ "poll360:last-view": JSON.stringify({ view: "booth" }) });
    assert.equal(recallView({ storage, valid: VALID }), null);
  });
});

describe("signing in", () => {
  it("clears the previous reader's place", () => {
    /* A shared newsroom laptop. The last person's tab is a leftover, not a
       preference, and a shift should start where the product says. */
    const storage = fakeStorage();
    rememberView({ storage, view: "booth", now: 1000 });
    forgetView({ storage });
    assert.equal(recallView({ storage, valid: VALID, now: 2000 }), null);
  });

  it("leaves nothing behind in storage at all", () => {
    const storage = fakeStorage();
    rememberView({ storage, view: "booth", now: 1000 });
    forgetView({ storage });
    assert.equal(storage.size(), 0);
  });
});

describe("guarding what is written", () => {
  it("refuses to remember a view with no name", () => {
    const storage = fakeStorage();
    rememberView({ storage, view: "", now: 1000 });
    rememberView({ storage, view: undefined, now: 1000 });
    assert.equal(storage.size(), 0);
  });
});
