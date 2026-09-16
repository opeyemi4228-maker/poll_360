import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSheet, wordsToNumber } from "../lib/sheet-vision.js";

/**
 * How a presiding officer actually writes a figure.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Taken from Form EC8A, S/N 0001745 — Osun 2026, R.C.M. School Onibambu,
 *  29/15/09/006 — where every figure on the sheet is dash-padded:
 *
 *      A     -100---   ONE HUNDRED
 *      AA    001- - -  ONE
 *      ADC   -001---   ONE
 *      APC   -091---   NINETY ONE
 *      APGA  -002---   TWO
 *      TOTAL -195--    ONE HUNDRED AND NINETY FIVE
 *
 *  This is not sloppiness. The officer fills the empty space so that nothing
 *  can be added to the number afterwards, and the form prints the same figure
 *  again in words for the same reason — a digit can be altered with one pen
 *  stroke and "NINETY ONE" cannot.
 *
 *  The parser required a token to be all digits, so it rejected every one of
 *  them. A sheet written exactly as an officer is meant to write it read as
 *  blank, and a blank figure is not a visible failure: it is a party silently
 *  recorded with no votes at all.
 * ══════════════════════════════════════════════════════════════════════════
 */

describe("dash-padded figures", () => {
  it("reads the party table off the sheet as written", () => {
    const parsed = parseSheet(
      [
        "1 A -100--- ONE HUNDRED",
        "2 AA 001- - - ONE",
        "4 ADC -001--- ONE",
        "6 APC -091--- NINETY ONE",
        "7 APGA -002--- TWO",
      ].join("\n")
    );

    const votes = parsed.votes ?? [];
    /* Positional over the register's own party order, so the figures are
       checked as a set rather than against indexes this test would have to
       track. */
    const found = votes.filter((value) => value > 0).sort((a, b) => a - b);
    assert.deepEqual(found, [1, 1, 2, 91, 100]);
    /* And they sum to the total the sheet declares. */
    assert.equal(found.reduce((sum, value) => sum + value, 0), 195);
  });

  it("reads the numbered boxes when they are padded too", () => {
    const parsed = parseSheet(
      [
        "#1 Number of Voters on the Register -484-",
        "#2 Number of Accredited Voters -195--",
        "#4 Number of Unused Ballot Papers -286-",
        "#5 Number of Spoiled Ballot Papers -003---",
        "#6 Number of Rejected Ballots -000---",
      ].join("\n")
    );

    assert.equal(parsed.registered, 484);
    assert.equal(parsed.accredited, 195);
    assert.equal(parsed.unusedBallots, 286);
    assert.equal(parsed.spoiled, 3);
    assert.equal(parsed.rejected, 0);
  });

  it("treats a leading dash as padding and never as a minus", () => {
    /* No figure on a result sheet is ever negative, so there is no minus sign
       here to protect. A negative vote count would also pass the arithmetic
       screening by cancelling a real one out — see lib/anomalies.js. */
    const parsed = parseSheet("6 APC -091--- NINETY ONE");
    assert.ok((parsed.votes ?? []).every((value) => value >= 0));
    assert.ok((parsed.votes ?? []).includes(91));
  });

  it("survives the pen strokes a reader returns as other dashes", () => {
    const parsed = parseSheet(
      ["#1 Number of Voters on the Register —484—", "#4 Number of Unused Ballot Papers _286_"].join("\n")
    );
    assert.equal(parsed.registered, 484);
    assert.equal(parsed.unusedBallots, 286);
  });

  it("still refuses a word with a digit in it", () => {
    /* The guard this sits beside: "EC8A" once read as the number 8 and gave
       every party on the header row 8 votes. Stripping dashes must not have
       opened that back up. */
    const parsed = parseSheet("FORM EC8A");
    assert.ok(!(parsed.votes ?? []).includes(8));
  });
});

describe("the figure written out in words", () => {
  it("reads every figure on the two sheets on file", () => {
    const cases = [
      ["ONE HUNDRED", 100],
      ["ONE", 1],
      ["NINETY ONE", 91],
      ["TWO", 2],
      ["ONE HUNDRED AND NINETY FIVE", 195],
      ["FOUR HUNDRED AND EIGHTY FOUR", 484],
      ["TWO HUNDRED AND EIGHTY SIX", 286],
      ["THREE", 3],
      ["ZERO", 0],
      ["FIVE HUNDRED AND FIFTY FIVE", 555],
    ];
    for (const [words, want] of cases) assert.equal(wordsToNumber(words), want, words);
  });

  it("handles a hyphenated figure and a thousand", () => {
    assert.equal(wordsToNumber("twenty-one"), 21);
    assert.equal(wordsToNumber("ONE THOUSAND TWO HUNDRED AND FOUR"), 1204);
  });

  it("corrects only the misspellings actually observed", () => {
    /* Not a spell-checker. A fuzzy match over number words invents figures,
       and an invented figure here is a vote. */
    assert.equal(wordsToNumber("NIENTY ONE"), 91);
    assert.equal(wordsToNumber("FOURTY"), 40);
  });

  it("returns nothing rather than a partial reading", () => {
    /* A number word half-read is a different number, not a smaller one. */
    for (const text of ["", "ORIGINAL", "NINETY ONE VOTES", "ELECTORAL COMMISSION"]) {
      assert.equal(wordsToNumber(text), null, text);
    }
  });
});
