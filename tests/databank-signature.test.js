import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_AGE_S, SIGNATURE_HEADER, sign, verify } from "../lib/databank-signature.js";

/**
 * Proving a delivery to Data Bank came from this product, unaltered.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVIDENCE THAT CAN BE ALTERED IN TRANSIT IS NOT EVIDENCE
 *
 *  The pipeline to Data Bank carries the only copy of some things that will
 *  matter at a tribunal eighteen months later: a photograph of Form EC8A
 *  before anybody read it, and the figures somebody read off it. It carried
 *  them under a shared key, which proves that whoever called knew the key and
 *  proves nothing whatsoever about the body they sent.
 *
 *  These tests are that gap, closed. The signature covers this body at this
 *  second, and every one of the cases below is a thing an attacker would
 *  rather it did not cover.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── AND THE FIXED SIGNATURE AT THE BOTTOM IS THE POINT OF THE FILE ─────────
 * Both ends of this pipeline have to compute the same bytes. A test that only
 * checks sign-then-verify passes happily while both sides drift together into
 * a scheme the other product does not implement. One signature written out by
 * hand pins the wire format.
 */

const SECRET = "a-shared-signing-secret";
const BODY = JSON.stringify({ kind: "RESULT_FIGURES", payload: { accredited: 412 } });

describe("signing a delivery", () => {
  it("accepts a signature over the body it actually covers", () => {
    assert.equal(verify(SECRET, BODY, sign(SECRET, BODY)), true);
  });

  it("refuses a body that changed by one digit after it was signed", () => {
    /* The case the shared key could not see at all: a figure altered between
       here and the hub, arriving with a key that is still perfectly valid. */
    const header = sign(SECRET, BODY);
    const altered = BODY.replace("412", "912");

    assert.equal(verify(SECRET, altered, header), false);
  });

  it("refuses a signature made with a different secret", () => {
    assert.equal(verify(SECRET, BODY, sign("some-other-secret", BODY)), false);
  });

  it("refuses a capture replayed later", () => {
    const old = Math.floor(Date.now() / 1000) - (MAX_AGE_S + 60);
    const header = sign(SECRET, BODY, old);

    assert.equal(verify(SECRET, BODY, header), false);
  });

  it("allows a clock that is a little out at either end", () => {
    const now = Math.floor(Date.now() / 1000);

    assert.equal(verify(SECRET, BODY, sign(SECRET, BODY, now - 60), now), true);
    assert.equal(verify(SECRET, BODY, sign(SECRET, BODY, now + 60), now), true);
  });

  it("refuses everything when no secret is configured", () => {
    /* A deployment with no signing secret must not accidentally accept
       everything: the absence of a secret is the absence of proof, never a
       reason to stop asking for it. */
    assert.equal(verify("", BODY, sign(SECRET, BODY)), false);
    assert.equal(verify(SECRET, BODY, ""), false);
    assert.equal(verify(SECRET, BODY, null), false);
  });

  it("refuses a header that is the wrong shape rather than crashing on it", () => {
    for (const header of [
      "nonsense",
      "t=,v1=",
      "t=abc,v1=" + "a".repeat(64),
      "v1=" + "a".repeat(64),
      `t=${Math.floor(Date.now() / 1000)}`,
      /* A short hex string: Buffer.from returns a short buffer rather than
         throwing, and a short buffer compared against a long one is a
         comparison somebody could arrange to succeed. */
      `t=${Math.floor(Date.now() / 1000)},v1=ab`,
      `t=${Math.floor(Date.now() / 1000)},v1=${"z".repeat(64)}`,
    ]) {
      assert.equal(verify(SECRET, BODY, header), false, `accepted: ${header}`);
    }
  });

  it("travels in the header both products name the same way", () => {
    assert.equal(SIGNATURE_HEADER, "x-databank-signature");
  });

  it("computes the signature both ends must agree on", () => {
    /* Written out rather than computed, so this side cannot change the scheme
       without the test going red — which is the only thing that stops the two
       products drifting apart silently. The scheme is lib/agent-door.js's: an
       HMAC-SHA256 over "<timestamp>.<body>", hex, with the timestamp carried
       alongside it. */
    assert.equal(
      sign("secret", "hello", 1_700_000_000),
      "t=1700000000,v1=47b1df0ab12338b2685470b0d2b37033add7c3b2bc8172f313e77413f1bb78c8"
    );
  });
});
