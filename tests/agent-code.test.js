import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  issueAgentCode,
  looksLikeAgentCode,
  normaliseAgentCode,
  readTypedAgentCode,
  unitOfAgentCode,
} from "../lib/agent-code.js";
import { parseUnitCode } from "../lib/units.js";

/**
 * The code an agent signs in with.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Two failures matter here and they pull in opposite directions.
 *
 *  Too strict, and an agent standing at a booth at six in the morning types
 *  their own code correctly and is refused because they used spaces instead
 *  of hyphens. They cannot file, and the count loses a polling unit.
 *
 *  Too loose, and a code becomes guessable — or worse, the polling unit half
 *  starts being treated as though it proved something, when it is printed on
 *  every result sheet and published in this very repository.
 *
 *  Everything below is one of those two.
 * ══════════════════════════════════════════════════════════════════════════
 */

const BOOTH = "33/01/01/001";

describe("issuing a code", () => {
  it("carries the agent's own booth where they can read it", () => {
    const code = issueAgentCode(BOOTH);
    assert.match(code, /^33-0101001-[0-9A-Z]{6}$/);
    assert.equal(unitOfAgentCode(code), BOOTH);
  });

  it("is different every time, for the same booth", () => {
    /* Several agents can stand at one booth. If the booth decided the code
       they would all share one, which is the whole reason the polling unit
       cannot be the credential. */
    const codes = new Set(Array.from({ length: 200 }, () => issueAgentCode(BOOTH)));
    assert.equal(codes.size, 200);
  });

  it("uses no symbol a tired person misreads", () => {
    /* I and L are read as 1, O as 0, and U is out so the alphabet cannot
       spell something unfortunate by accident. */
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const secret = issueAgentCode(BOOTH).split("-")[2];
      assert.ok(!/[ILOU]/.test(secret), `issued a code containing a confusable: ${secret}`);
    }
  });

  it("refuses to build one without a real polling unit", () => {
    /* A code with no booth in it cannot be read back to anybody, and an agent
       cannot check it against the sheet in their hand. */
    for (const bad of ["", null, undefined, "33/01/01", "not a booth"]) {
      assert.throws(() => issueAgentCode(bad), /nine-digit/);
    }
  });

  it("names a booth this product can actually parse", () => {
    /* The unit it reports has to go back into lib/units.js unchanged, or the
       code names a place the rest of the system cannot find. */
    const seen = parseUnitCode(unitOfAgentCode(issueAgentCode(BOOTH)));
    assert.ok(seen, "the booth in the code did not parse");
    assert.equal(seen.stateNumber, "33");
  });
});

describe("reading a code somebody typed", () => {
  it("takes it however it was punctuated", () => {
    /* Every one of these is somebody typing their own code correctly. A
       sign-in that refuses any of them is a sign-in that loses a booth. */
    const code = issueAgentCode(BOOTH);
    const secret = code.split("-")[2];

    for (const typed of [
      code,
      code.toLowerCase(),
      code.replaceAll("-", ""),
      code.replaceAll("-", " "),
      `  ${code}  `,
      `33 0101001 ${secret}`,
      `33/0101001/${secret}`,
    ]) {
      assert.equal(normaliseAgentCode(typed), code, `refused "${typed}"`);
    }
  });

  it("folds the letters people substitute for digits", () => {
    /* O for nought and I or L for one are the substitutions that actually
       happen, in both directions, on a keypad at night. */
    const typed = "33-OIOIOOI-K7M4QX";
    assert.equal(normaliseAgentCode(typed), "33-0101001-K7M4QX");
  });

  it("refuses a code with words wrapped around it", () => {
    /* ── GENEROSITY THAT WOULD HAVE BEEN A HOLE ──────────────────────────
       Stripping every unrecognised character reads as helpful and is not:
       C, O, D and E are all symbols in this alphabet, so "code: 33-…" would
       have had four of them folded into the credential. Separators are
       removed by name; anything else left over means it is not a code. */
    const code = issueAgentCode(BOOTH);
    assert.equal(normaliseAgentCode(`code: ${code}`), null);
    assert.equal(normaliseAgentCode(`my code is ${code} thanks`), null);
  });

  it("refuses anything that is not a code", () => {
    for (const bad of [
      "",
      null,
      "33-0101001",
      "33-0101001-K7M4Q",
      "33-0101001-K7M4QXZ",
      "the quick brown fox jumped over it",
    ]) {
      assert.equal(normaliseAgentCode(bad), null, `accepted "${bad}"`);
      assert.equal(looksLikeAgentCode(bad), false);
    }
  });

  it("refuses a letter in the half that names the booth", () => {
    /* The first nine are a polling unit. A letter there is a typo landing in
       the readable half, and accepting it makes a code that names nowhere. */
    assert.equal(normaliseAgentCode("3K-0101001-K7M4QX"), null);
  });

  it("does not guess at a code it half recognises", () => {
    /* ── THE ONE THAT WOULD BE WORST ─────────────────────────────────────
       A sign-in that read most of a code and settled on something adjacent
       would let an agent file against a stranger's booth while believing they
       had signed in as themselves. Null, always, rather than nearly. */
    const code = issueAgentCode(BOOTH);
    assert.equal(normaliseAgentCode(code.slice(0, -1)), null);
    assert.equal(normaliseAgentCode(`${code}0`), null);
  });
});

describe("telling somebody what is missing", () => {
  it("recognises the polling unit number typed on its own", () => {
    /* The commonest wrong thing in the box. It must be named as what it is, so
       the form can say six more symbols come after it — and never accepted. */
    for (const typed of ["33/01/01/001", "330101001", "33-0101001", " 33 01 01 001 "]) {
      assert.equal(readTypedAgentCode(typed), "unit-only", `misread "${typed}"`);
      assert.equal(normaliseAgentCode(typed), null);
    }
  });

  it("says complete exactly when sign-in would accept it", () => {
    const code = issueAgentCode(BOOTH);
    for (const typed of [code, code.toLowerCase(), code.replaceAll("-", " ")]) {
      assert.equal(readTypedAgentCode(typed), "complete");
    }
  });

  it("tells apart half a code, too much, and words around it", () => {
    const code = issueAgentCode(BOOTH);
    assert.equal(readTypedAgentCode(""), "empty");
    assert.equal(readTypedAgentCode("   "), "empty");
    assert.equal(readTypedAgentCode("33-01"), "incomplete");
    assert.equal(readTypedAgentCode(code.slice(0, -1)), "incomplete");
    assert.equal(readTypedAgentCode(`${code}0`), "too-long");
    assert.equal(readTypedAgentCode(`code: ${code}!`), "stray");
  });
});

describe("what the booth half is and is not", () => {
  it("is readable, and is never evidence", () => {
    /* Anybody can write nine digits in front of six symbols, and the digits
       they would write are published — every polling unit in Nigeria is in
       public/geo/units/. The booth in a code is there for a human to check
       against their sheet; the account's booth comes from the account. */
    const forged = normaliseAgentCode("01-0101001-K7M4QX");
    assert.ok(forged, "a well-formed code is well-formed whoever wrote it");
    assert.equal(unitOfAgentCode(forged), "01/01/01/001");
    /* Nothing in this module says whether that code belongs to anybody. That
       question has exactly one answer and it is a hash lookup. */
  });
});
