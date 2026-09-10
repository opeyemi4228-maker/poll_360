import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  REMEMBER_HOURS,
  VIEW_COOKIE,
  decodeView,
  forgetViewCookie,
  rememberViewCookie,
  viewFromCookies,
} from "../lib/last-view.js";
import { IS_VIEW, LANDING, VIEWS } from "../lib/room-views.js";

/**
 * The room's memory, now that the server is the one reading it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  The point of moving this into a cookie was that the server can render the
 *  remembered view itself, so a reload never paints the front door first. That
 *  buys a property and it also buys a risk: a cookie is a string somebody can
 *  type, and it is now read *before* anything is drawn. A value this module
 *  accepts and the room cannot render is a blank frame, which is strictly
 *  worse than the front door the whole feature exists to improve on.
 *
 *  So every test here is about refusing input, except the two that prove the
 *  thing works at all.
 * ══════════════════════════════════════════════════════════════════════════
 */

const NOW = Date.UTC(2027, 1, 27, 20, 0, 0);
const stamp = (view, at) => `${view}.${at}`;

describe("reading a remembered view", () => {
  it("returns the view somebody was on", () => {
    assert.equal(decodeView(stamp("timeline", NOW - 60_000), { valid: IS_VIEW, now: NOW }), "timeline");
  });

  it("refuses a view this build does not render", () => {
    /* Tabs are renamed and removed between deployments. A value naming one
       that has gone would drop the reader on a blank frame. */
    assert.equal(decodeView(stamp("pulse", NOW), { valid: IS_VIEW, now: NOW }), null);
    assert.equal(decodeView(stamp("ruling", NOW), { valid: IS_VIEW, now: NOW }), null);
    /* "watch" was a tab in this room while this file was being written and
       had stopped being one by the time it ran. That is the whole reason the
       validation is not optional. */
    assert.equal(decodeView(stamp("watch", NOW), { valid: IS_VIEW, now: NOW }), null);
  });

  it("refuses anything that is not a stored value at all", () => {
    /* It is a cookie. Everything below is something a browser, an extension
       or a person can put in one, and none of it may reach the room. */
    for (const raw of ["", "booth", ".", ".123", "booth.", "booth.abc", "<script>", null, undefined, 42, {}]) {
      assert.equal(decodeView(raw, { valid: IS_VIEW, now: NOW }), null, `accepted ${JSON.stringify(raw)}`);
    }
  });

  it("forgets a place older than the window", () => {
    /* A tab remembered from three days ago is archaeology, not a place. */
    const old = NOW - (REMEMBER_HOURS + 1) * 3600_000;
    assert.equal(decodeView(stamp("booth", old), { valid: IS_VIEW, now: NOW }), null);

    const fresh = NOW - (REMEMBER_HOURS - 1) * 3600_000;
    assert.equal(decodeView(stamp("booth", fresh), { valid: IS_VIEW, now: NOW }), "booth");
  });

  it("refuses a stamp from the future", () => {
    /* A clock that has been changed, or a value somebody wrote by hand to
       make it never expire. Either way it is not a measurement. */
    assert.equal(decodeView(stamp("booth", NOW + 3600_000), { valid: IS_VIEW, now: NOW }), null);
  });

  it("keeps a view whose name contains the separator", () => {
    /* The stamp is split on the LAST dot, so a view id is free to contain
       one. Splitting on the first would silently truncate the name and the
       value would then fail validation for the wrong reason. */
    assert.equal(
      decodeView(stamp("a.b", NOW), { valid: new Set(["a.b"]), now: NOW }),
      "a.b"
    );
  });
});

describe("reading it out of a cookie jar", () => {
  it("takes Next's jar and a plain map alike", () => {
    const next = { get: (name) => (name === VIEW_COOKIE ? { value: stamp("integrity", NOW) } : undefined) };
    assert.equal(viewFromCookies(next, { valid: IS_VIEW, now: NOW }), "integrity");

    const plain = new Map([[VIEW_COOKIE, stamp("clusters", NOW)]]);
    assert.equal(viewFromCookies(plain, { valid: IS_VIEW, now: NOW }), "clusters");
  });

  it("is null when there is no cookie, rather than throwing", () => {
    /* A first visit, a cleared browser, a screenshot renderer. The room opens
       where it always does; nothing anywhere may fail because of it. */
    assert.equal(viewFromCookies(new Map(), { valid: IS_VIEW, now: NOW }), null);
    assert.equal(viewFromCookies(null, { valid: IS_VIEW, now: NOW }), null);
    assert.equal(viewFromCookies(undefined, { valid: IS_VIEW, now: NOW }), null);
  });
});

describe("writing it", () => {
  it("round-trips through what it wrote", () => {
    let written = "";
    rememberViewCookie("planning", { now: NOW, write: (value) => (written = value), secure: false });

    const value = decodeURIComponent(written.split(";")[0].slice(VIEW_COOKIE.length + 1));
    assert.equal(decodeView(value, { valid: IS_VIEW, now: NOW }), "planning");
  });

  it("scopes the cookie to the whole site and lets it expire", () => {
    let written = "";
    rememberViewCookie("booth", { now: NOW, write: (value) => (written = value), secure: false });
    assert.match(written, /path=\//);
    assert.match(written, new RegExp(`max-age=${REMEMBER_HOURS * 3600}`));
    assert.match(written, /samesite=lax/i);
  });

  it("marks it secure only where the page already is", () => {
    /* A Secure cookie is silently dropped over plain http — which is how the
       whole feature would stop working at a dev server and nowhere else. */
    let overHttps = "";
    rememberViewCookie("booth", { now: NOW, write: (v) => (overHttps = v), secure: true });
    assert.match(overHttps, /; secure/);

    let overHttp = "";
    rememberViewCookie("booth", { now: NOW, write: (v) => (overHttp = v), secure: false });
    assert.doesNotMatch(overHttp, /; secure/);
  });

  it("writes nothing for a non-view", () => {
    let written = null;
    rememberViewCookie("", { write: (v) => (written = v) });
    rememberViewCookie(undefined, { write: (v) => (written = v) });
    assert.equal(written, null);
  });

  it("expires the cookie when somebody signs in", () => {
    /* A shared newsroom laptop: the previous reader's tab is a leftover, not
       a preference. */
    let written = "";
    forgetViewCookie({ write: (value) => (written = value) });
    assert.match(written, /max-age=0/);
    assert.match(written, new RegExp(`^${VIEW_COOKIE}=;`));
  });
});

describe("where the room opens with nothing remembered", () => {
  it("is never the command dashboard", () => {
    /* Asked for directly: the room must not land on Command. It stays a tab
       somebody can press; it is not where the door opens. */
    assert.notEqual(LANDING, "command");
  });

  it("is a view that actually exists", () => {
    assert.ok(IS_VIEW.has(LANDING), `${LANDING} is not one of the room's views`);
  });

  it("names every view exactly once", () => {
    assert.equal(VIEWS.length, IS_VIEW.size, "VIEWS contains a duplicate");
  });
});
