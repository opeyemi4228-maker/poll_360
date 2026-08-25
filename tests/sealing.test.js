/**
 * Sealing, and the one failure that cannot be undone.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Every other bug in this product can be fixed and the data re-read. This
 *  one cannot: an incident narrative sealed with a key that no longer works,
 *  or written in a shape the reader does not recognise, is gone. There is no
 *  second copy — the plaintext was never stored.
 *
 *  So these check the round trip, and they check that tampering is *caught*
 *  rather than quietly rendered. A record that failed its integrity check and
 *  is displayed as though it had not is the worst outcome available here:
 *  it puts an altered account of what happened at a polling unit on a screen
 *  a broadcast is reading from, with nothing to say it was altered.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* Set before the module is imported: the key is read and cached on first use.
   A test that ran against a real deployment key would be both useless and a
   good way to leak one into CI output. */
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { blindIndex, seal, unseal } from "../lib/crypto.js";
import { hashPassword, verifyPassword } from "../lib/password.js";

describe("sealing a narrative", () => {
  it("comes back exactly as it went in", () => {
    for (const text of [
      "Queue still long at close, around three hundred waiting.",
      "Agent refused a copy of the sheet — resolved after the supervisor attended.",
      "Naira signs ₦, accents é, and an emoji 🇳🇬 all survive.",
      "a".repeat(5000),
    ]) {
      assert.equal(unseal(seal(text)), text, "a sealed narrative did not survive the round trip");
    }
  });

  it("returns null for nothing, so callers need no special case", () => {
    for (const empty of [null, undefined, ""]) {
      assert.equal(seal(empty), null);
    }
    assert.equal(unseal(null), null);
    assert.equal(unseal(undefined), null);
  });

  it("never produces the same ciphertext twice for the same text", () => {
    /* A fresh IV every time. Identical ciphertexts would leak that two
       incidents said the same thing, which at a polling unit is itself
       information. */
    const once = seal("Ballot box removed from the unit.");
    const twice = seal("Ballot box removed from the unit.");
    assert.notEqual(once, twice, "the same text sealed to the same ciphertext");
    assert.equal(unseal(once), unseal(twice));
  });

  it("catches tampering rather than rendering it", () => {
    const sealed = seal("Presiding officer confirmed the count at 16:20.");
    const [version, iv, tag, ciphertext] = sealed.split(".");

    /* One flipped character in the body. */
    const altered = [version, iv, tag, `${ciphertext.slice(0, -1)}${ciphertext.at(-1) === "A" ? "B" : "A"}`].join(".");
    const read = unseal(altered);

    assert.match(read, /unreadable/, "a tampered record was rendered as though it were the original");
    assert.notEqual(read, "Presiding officer confirmed the count at 16:20.");
  });

  it("refuses a record sealed under a version it does not know", () => {
    const sealed = seal("anything").split(".");
    sealed[0] = "v99";
    assert.match(unseal(sealed.join(".")), /unknown encryption version/);
  });

  it("does not throw on rubbish, so one bad row cannot take down a feed", () => {
    for (const rubbish of ["not-sealed", "v1.", "v1.a.b.c", "....", "🙃"]) {
      assert.doesNotThrow(() => unseal(rubbish), `unseal threw on ${JSON.stringify(rubbish)}`);
    }
  });
});

describe("the blind index", () => {
  it("is stable, so a sealed value can be looked up by equality", () => {
    assert.equal(blindIndex("08030000001"), blindIndex("08030000001"));
  });

  it("ignores case and surrounding space, the way people type", () => {
    assert.equal(blindIndex("Agent@Poll360.NG"), blindIndex("  agent@poll360.ng "));
  });

  it("separates different values", () => {
    assert.notEqual(blindIndex("08030000001"), blindIndex("08030000002"));
  });

  it("does not carry the plaintext in its output", () => {
    const index = blindIndex("08030000001");
    assert.ok(!index.includes("0803"), "the index leaks the number it indexes");
    assert.match(index, /^[0-9a-f]{64}$/);
  });

  it("returns null for nothing", () => {
    assert.equal(blindIndex(""), null);
    assert.equal(blindIndex(null), null);
  });
});

describe("passwords", () => {
  it("verifies the right one and refuses the wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");
    assert.equal(await verifyPassword("correct horse battery staple", stored), true);
    assert.equal(await verifyPassword("Correct Horse Battery Staple", stored), false);
    assert.equal(await verifyPassword("", stored), false);
  });

  it("never stores the password itself", () => {
    return hashPassword("poll360-super-admin").then((stored) => {
      assert.ok(!stored.includes("poll360-super-admin"), "the hash contains the password");
    });
  });

  it("salts, so two people with the same password do not share a hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    assert.notEqual(a, b, "two hashes of the same password matched");
    assert.equal(await verifyPassword("same", a), true);
    assert.equal(await verifyPassword("same", b), true);
  });

  it("does not throw on a malformed stored hash", async () => {
    for (const stored of ["", "rubbish", null, undefined]) {
      assert.equal(await verifyPassword("anything", stored), false, `threw or passed on ${stored}`);
    }
  });
});
