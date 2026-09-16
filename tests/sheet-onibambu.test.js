import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSheet } from "../lib/sheet-vision.js";

/**
 * Form EC8A, S/N 0001745 — Osun 2026, R.C.M. School Onibambu, 29/15/09/006.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Four separate things on this one sheet that the reader got wrong, each
 *  for its own reason, and each invisible in a different way.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ── VERBATIM OCR, NOT A TIDIED VERSION OF IT ────────────────────────────
   These lines are what OCR.space actually returned from the photograph, tabs
   and misreads intact. An idealised fixture passes while the real page fails,
   which is precisely what happened here: a hand-written version of this sheet
   read perfectly and the real one returned "- ONE HUNDRED" as an agent's name
   and no date at all. */
const SHEET = [
  "INDEPENDENT NATIONAL ELECTORAL COMMISSION",
  "2026 OSUN STATE GOVERNORSHIP ELECTION",
  "FORM EC 8A",
  "S/N ..0001745",
  "#1 Number of Voters on the Register 484",
  "#2 Number of Accredited Voters 195",
  "#5 Number of Spoiled Ballot Papers 3",
  "#6 Number of Rejected Ballots 0",
  "1\tA\t- 100---\tONE HUNDRED",
  "AA\t001---\tONE",
  "3\tAAC",
  "4\tADC\t- 001 - - -\tONE",
  "6\tAPC\t-091- - -\tNINETY ONE\tJEREMINI SAMSON",
  "7\tAPGA\t-002-- -\tTHO\tS-A",
  "8\tAPM",
  "TOTAL VALID VOTES -195-- ONE HUNDRED AND NINETY FIVE",
  "I, ....IBRAHIM SAMUEL......................(Name of Presiding Officer) hereby certify that the information",
  "1Eth of AUGUST, 2026",
  "Date\tSign/Stamp of Presiding Officer",
].join("\n");

const sheet = parseSheet(SHEET);

describe("the serial", () => {
  it("reads it through the dots the form prints", () => {
    assert.equal(sheet.formSerial, "0001745");
  });

  it("reads it when the reader loses the slash in S/N", () => {
    /* The slash is thin and is routinely dropped or read as a letter. A
       serial that is not read is a sheet that cannot be told apart from
       another photographed twice. */
    for (const label of ["SIN 0001745", "S1N 0001745", "S / N ... 0001745", "S/N. 0001745"]) {
      assert.equal(parseSheet(label).formSerial, "0001745", label);
    }
  });
});

describe("the presiding officer's initial", () => {
  it("does not eat the I of IBRAHIM", () => {
    /* The declaration pattern allowed the leading "I" of "I, ..." to be
       followed by an *optional* comma, so on this sheet it matched the I of
       IBRAHIM and returned "BRAHIM SAMUEL" — an officer's first initial
       silently removed, on the one field this product prints beside a
       finding. Requiring the comma fixes both directions. */
    assert.equal(sheet.repName, "IBRAHIM SAMUEL");
  });

  it("keeps the I whether or not the reader kept the \"I,\"", () => {
    assert.equal(
      parseSheet(SHEET.replace("I, ....IBRAHIM SAMUEL", "IBRAHIM SAMUEL")).repName,
      "IBRAHIM SAMUEL"
    );
  });

  it("still drops the declaration's own \"I,\" when it is there", () => {
    assert.ok(!String(sheet.repName).startsWith("I,"));
  });
});

describe("the date", () => {
  it("reads one written out in words, with the day the reader mangled", () => {
    /* The photograph says "16th of AUGUST, 2026" and OCR returned "1Eth" —
       the 6 came back as an E. A pattern demanding digits for the day found
       nothing at all, and the date is what ties a return to its polling day.

       The day is not parsed and never was: this value is kept exactly as
       written. So it may be whatever the reader made of it, provided a real
       month and year follow. "1Eth of AUGUST, 2026" beside a photograph is
       worth incomparably more than null. */
    assert.equal(sheet.sheetDate, "1Eth of AUGUST, 2026");
  });

  it("still reads a numeric one, and still squeezes its spaces", () => {
    assert.equal(parseSheet("15-08-2026").sheetDate, "15-08-2026");
    assert.equal(parseSheet("15 - 08 - 2026").sheetDate, "15-08-2026");
  });

  it("keeps a written date's spaces rather than running it together", () => {
    assert.ok(/\s/.test(sheet.sheetDate));
  });
});

describe("the polling agents", () => {
  it("takes the name off the agent's own column", () => {
    /* The last column is the witness record: every agent who signs is a
       party's own representative attesting to that figure at that booth. The
       optical reader returned null for all of them, so a sheet read that way
       kept the figures and threw away who stood behind them. */
    assert.equal(sheet.agents?.APC, "JEREMINI SAMSON");
  });

  it("refuses a scrawl rather than recording it as a person", () => {
    /* APGA's cell came back "S-A" — part signature, part pen stroke. It
       clears any length test and is not a name anybody could be held to. A
       blank is recoverable by looking at the photograph; a scrawl written
       into the evidence as a person is not. */
    assert.equal(sheet.agents?.APGA, undefined);
  });

  it("records nobody for a row with no agent cell at all", () => {
    /* Accord, AA and ADC have figures and no agent column on the row the
       reader emitted. An unsigned row must stay unsigned rather than
       borrowing a name, or a number, from beside it. */
    for (const party of ["ACCORD", "AA", "ADC"]) {
      assert.equal(sheet.agents?.[party], undefined, party);
    }
  });

  it("never lets the figure's words become the name", () => {
    /* Accord's row is "1\tA\t- 100---\tONE HUNDRED" and once returned
       "- ONE HUNDRED" as its agent: a stray dash at the head of the run
       stopped the number-word strip before it began. */
    for (const name of Object.values(sheet.agents ?? {})) {
      assert.ok(!/^[\s\-–—_~]/.test(name), `"${name}" opens with padding`);
    }
  });

  it("never mistakes the figure or its words for a name", () => {
    for (const name of Object.values(sheet.agents ?? {})) {
      assert.ok(!/\d/.test(name), `"${name}" carries a digit`);
      assert.ok(!/\b(one|two|ninety|hundred|and)\b/i.test(name), `"${name}" carries a number word`);
    }
  });

  it("does not read the column's own printed caption as a person", () => {
    const parsed = parseSheet("6 APC -091--- NINETY ONE NAME/SIGNATURE OF POLLING AGENT");
    assert.equal(parsed.agents?.APC, undefined);
  });
});

describe("the figures, still", () => {
  it("reads the padded party votes and the boxes", () => {
    const found = (sheet.votes ?? []).filter((value) => value > 0).sort((a, b) => a - b);
    assert.deepEqual(found, [1, 1, 2, 91, 100]);
    assert.equal(sheet.registered, 484);
    assert.equal(sheet.accredited, 195);
    assert.equal(sheet.spoiled, 3);
    assert.equal(sheet.rejected, 0);
  });

  it("balances the way the sheet says it does", () => {
    /* #5 spoiled 3 + #6 rejected 0 + #7 valid 195 = 198 = box #8. */
    const valid = (sheet.votes ?? []).reduce((sum, value) => sum + value, 0);
    assert.equal(valid, 195);
    assert.equal(sheet.spoiled + sheet.rejected + valid, 198);
  });
});
