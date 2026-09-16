import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchRecord, matchSheet } from "../lib/sheet-match.js";

/**
 * The join between a photograph and the figures read off it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Data Bank pairs a result sheet with its figures on a content hash: the
 *  image travels as RESULT_SHEET carrying the hash of its bytes, the numbers
 *  travel as RESULT_FIGURES carrying the same hash, and the hub joins them
 *  rather than holding a second copy of a six-megabyte photograph.
 *
 *  Every forward in this product read that hash off `sheet.record.hash`.
 *  `record` is whatever `matchRecord()` returns, and it has never had a hash
 *  field — so the figures went to the hub with an empty media list while the
 *  photograph went with a real one, and nothing could ever be paired.
 *
 *  The failure was silent and total. No error, no empty screen, no failing
 *  test: just a hub that never joined a single return to its own evidence,
 *  under a comment at the call site asserting that it did.
 *
 *  So this pins the shape. `matchRecord` answers whether the figures and the
 *  photograph agree; it is not where the hash lives and must not silently
 *  become so — the forwards read `sheet.hash`, taken from the bytes at the
 *  point the photograph is opened.
 * ══════════════════════════════════════════════════════════════════════════
 */

const typed = { accredited: 300, rejected: 4, votes: { APC: 150, PDP: 146 } };

/**
 * A reading off a photograph, in the shape `matchSheet` requires.
 *
 * `usable` is the gate: a reading that did not hold together is not allowed to
 * contradict anybody, so without it every comparison comes back "no
 * comparison" — which is what this test first asserted against, wrongly.
 */
const reading = (over = {}) => ({
  usable: true,
  accredited: 300,
  registered: null,
  rejected: 4,
  votes: { APC: 150, PDP: 146 },
  missing: [],
  absent: [],
  ...over,
});

describe("what a match record carries", () => {
  it("answers whether the sheet and the figures agree", () => {
    const record = matchRecord(matchSheet(reading(), typed));

    assert.equal(record.compared, true);
    assert.equal(record.agrees, true);
    assert.ok(Array.isArray(record.checked));
    assert.ok(Array.isArray(record.mismatched));
  });

  it("does not carry the photograph's hash, on any path", () => {
    /* If this ever fails, somebody has added a hash to the comparison record.
       That is fine — but the Data Bank forwards read `sheet.hash`, and two
       places holding one hash is how they come to disagree. Point them at the
       new one and delete this test rather than leaving both. */
    const agreed = matchRecord(matchSheet(reading(), typed));
    const differs = matchRecord(matchSheet(reading({ accredited: 999 }), typed));
    const nothing = matchRecord(
      matchSheet(null, typed)
    );

    for (const record of [agreed, differs, nothing]) {
      assert.equal(
        record.hash,
        undefined,
        "matchRecord grew a hash — see the note at the head of this file"
      );
    }
  });

  it("still records a comparison that could not be made", () => {
    /* The three states a forward has to tell apart: no sheet, a sheet that
       could not be read, and a sheet that disagreed. */
    const record = matchRecord(matchSheet(null, typed));
    assert.equal(record.compared, false);
    assert.ok("reason" in record);
  });

  it("names the fields that disagreed, so a desk knows what to check", () => {
    const record = matchRecord(matchSheet(reading({ accredited: 999 }), typed));
    assert.equal(record.agrees, false);
    assert.ok(record.mismatched.includes("accredited"));
  });
});
