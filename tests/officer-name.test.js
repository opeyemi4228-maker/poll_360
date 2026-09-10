import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSheet } from "../lib/sheet-vision.js";

/**
 * Reading the presiding officer's name off the declaration.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Taken from Form EC8A, S/N 0000611 — Osun 2026, Idiomo Apena Compd.,
 *  29/07/04/010 — which is the sheet this product is built around.
 *
 *  Its declaration reads:
 *
 *    I, HASSAN HABEEB ......... (Name of Presiding Officer) hereby certify
 *    that the information contained in this form is a true and accurate
 *    account of votes cast in this polling Unit ...
 *
 *  Two things about that line broke the reader, and both are pinned below.
 *
 *  The name comes BEFORE its own label, with a rule of dots and a bracketed
 *  caption in between. A pattern wanting "I, NAME hereby certify" cannot
 *  cross the brackets and finds nothing on the real form.
 *
 *  And "(Name of Presiding Officer)" is pre-printed on every sheet. A label
 *  pattern loose enough to match it captured the sentence that followed, so a
 *  form where the officer had left the line blank came back named "hereby
 *  certify that the information" — a blank box read as a person.
 * ══════════════════════════════════════════════════════════════════════════
 */

const read = (line) => parseSheet(line)?.repName ?? null;

describe("the declaration as OCR actually returns it", () => {
  it("reads the name when OCR drops the \"I,\" and the opening bracket", () => {
    /* Verbatim from OCR.space on the sheet above, tabs and all. Neither the
       "I," nor the "(" survived the scan — the closing bracket did, and its
       partner did not. Every pattern anchored on the start of that sentence
       matched nothing, so a sheet with HASSAN HABEEB plainly written on it
       reported "could not be read from this photograph". */
    assert.equal(
      read("HASSAN HABEEB\t..... Name of Presiding Officer) hereby certify that the information\t"),
      "HASSAN HABEEB"
    );
  });

  it("finds nothing on the label line when the name did not scan with it", () => {
    /* The same sheet's second pass, where the handwriting was dropped and only
       the printed caption came through. There is no name on this line and one
       must not be manufactured from the words that follow. */
    assert.equal(
      read("..... Name of Presiding Officer) hereby certify that the information"),
      null
    );
  });

  it("reads the name written before the printed label", () => {
    assert.equal(
      read("I, HASSAN HABEEB ......................... (Name of Presiding Officer) hereby certify that the information"),
      "HASSAN HABEEB"
    );
  });

  it("reads it whether or not the ruled line survived the scan", () => {
    for (const line of [
      "I, HASSAN HABEEB (Name of Presiding Officer) hereby certify",
      "I, HASSAN HABEEB.....(Name of Presiding Officer) hereby certify",
      "I, HASSAN HABEEB ....... (Name of Presiding officer)",
    ]) {
      assert.equal(read(line), "HASSAN HABEEB", line);
    }
  });

  it("reads the shorter declaration other forms use", () => {
    assert.equal(read("I, A. BELLO, hereby certify that the votes recorded above are correct"), "A. BELLO");
    assert.equal(read("I, ADEYEMI O'BRIEN-KAREEM, do hereby declare"), "ADEYEMI O'BRIEN-KAREEM");
  });

  it("still reads a plain labelled field", () => {
    assert.equal(read("NAME OF PRESIDING OFFICER: HASSAN HABEEB"), "HASSAN HABEEB");
    assert.equal(read("Presiding Officer's Name - Hassan Habeeb"), "Hassan Habeeb");
  });
});

describe("what must never be read as a name", () => {
  it("returns nothing when the officer left the line blank", () => {
    /* The failure this test exists for. A blank declaration must produce no
       name at all — never the printed words that follow the label. */
    assert.equal(
      read("I, ......................... (Name of Presiding Officer) hereby certify that the information"),
      null
    );
  });

  it("does not take a polling agent's name off the party table", () => {
    assert.equal(read("1 A 417 four hundred and seventeen Saheed Sarafa"), null);
  });

  it("does not read the signature label as a name", () => {
    assert.equal(read("Sign/Stamp of Presiding Officer"), null);
  });
});
