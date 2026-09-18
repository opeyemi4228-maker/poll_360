import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { clientAddress, limiterKey } from "../lib/client-ip.js";

/**
 * Where a request came from.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE BUG THESE TESTS EXIST FOR WAS A RATE LIMITER THAT LIMITED NOTHING
 *
 *  Every limit in this product was keyed on the leftmost entry of
 *  X-Forwarded-For, which is a value the caller sends. Set it to a fresh
 *  random string each time and every request is a new caller, so "eight
 *  attempts per account" became unlimited attempts per account — while the
 *  limiter kept counting, kept firing and kept looking like it worked.
 *
 *  The first case below is that bug, written down.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** A Headers object from a plain map, which is what a test wants to write. */
const headersOf = (map) => new Headers(map);

afterEach(() => {
  delete process.env.TRUSTED_PROXY_HOPS;
});

describe("reading a caller's address", () => {
  it("ignores what the caller claims and counts in from the right", () => {
    /* One proxy in front of us. It appended 203.0.113.9, which is the address
       it actually received the request from. Everything to its left is what
       arrived, and what arrived here is a forgery. */
    const address = clientAddress(
      headersOf({ "x-forwarded-for": "10.9.9.9, 203.0.113.9" })
    );

    assert.equal(address.ip, "203.0.113.9");
    assert.equal(address.trusted, true);
    /* The forgery is kept, because an audit entry that says "they claimed to
       be 10.9.9.9" is worth more than one that silently discards it. */
    assert.equal(address.claimed, "10.9.9.9");
  });

  it("gives one forger the same key however many addresses they invent", () => {
    const first = clientAddress(
      headersOf({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" })
    );
    const second = clientAddress(
      headersOf({ "x-forwarded-for": "2.2.2.2, 3.3.3.3, 203.0.113.9" })
    );

    assert.equal(limiterKey(first), limiterKey(second));
  });

  it("prefers a header the platform sets, which a caller cannot forge", () => {
    const address = clientAddress(
      headersOf({
        "x-forwarded-for": "10.9.9.9, 198.51.100.4",
        "x-vercel-forwarded-for": "203.0.113.9",
      })
    );

    assert.equal(address.ip, "203.0.113.9");
    assert.equal(address.trusted, true);
  });

  it("honours a deployment with two proxies in front of it", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";

    const address = clientAddress(
      headersOf({ "x-forwarded-for": "10.9.9.9, 203.0.113.9, 198.51.100.4" })
    );

    assert.equal(address.ip, "203.0.113.9");
    assert.equal(address.trusted, true);
  });

  it("does not trust a chain shorter than the proxies it was told to expect", () => {
    process.env.TRUSTED_PROXY_HOPS = "3";

    const address = clientAddress(headersOf({ "x-forwarded-for": "10.9.9.9" }));

    assert.equal(address.trusted, false);
    /* And an untrusted address is never used as a limiter key, because keying
       on something the caller chooses is the same as not keying at all. */
    assert.equal(limiterKey(address), "unverified");
  });

  it("says 'local' for a direct connection, which is development", () => {
    const address = clientAddress(headersOf({}));

    assert.equal(address.ip, "local");
    assert.equal(address.trusted, false);
    assert.equal(address.claimed, null);
  });

  it("drops the port some proxies append, in either family's spelling", () => {
    assert.equal(
      clientAddress(headersOf({ "x-real-ip": "203.0.113.9:54321" })).ip,
      "203.0.113.9"
    );
    assert.equal(
      clientAddress(headersOf({ "x-real-ip": "[2001:db8::1]:443" })).ip,
      "2001:db8::1"
    );
    /* A bare IPv6 address is all colons and must survive intact. */
    assert.equal(clientAddress(headersOf({ "x-real-ip": "2001:db8::1" })).ip, "2001:db8::1");
  });

  it("refuses a header that is prose, padding, or an injection attempt", () => {
    /* Eight kilobytes of rubbish in a header is a way to blow out a limiter's
       key space without sending anything that looks like an attack. */
    const long = "9".repeat(4000);
    assert.equal(clientAddress(headersOf({ "x-real-ip": long })).trusted, false);
    assert.equal(
      clientAddress(headersOf({ "x-real-ip": "not an address at all" })).trusted,
      false
    );
  });

  it("skips unusable entries rather than reading one as the caller", () => {
    /* A proxy that writes "unknown" is a real thing some of them do. */
    const address = clientAddress(
      headersOf({ "x-forwarded-for": "unknown, 203.0.113.9" })
    );

    assert.equal(address.ip, "203.0.113.9");
    assert.equal(address.trusted, true);
  });
});
