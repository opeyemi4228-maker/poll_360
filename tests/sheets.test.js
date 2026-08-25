import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSheet, trustworthy } from "../lib/sheet-vision.js";
import { scanList } from "../lib/party-register.js";

/**
 * Reading a result sheet.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  This module has already produced the worst failure in the repository's
 *  history, and the commit that fixed it says so in its title: the reader
 *  gave every party 8 votes and called it clean. A header line naming the
 *  parties —
 *
 *      EC8A FORM - APC PDP LP NNPP RESULT SUMMARY
 *
 *  — was read as figures, the read was marked usable, and nothing complained.
 *
 *  That is the shape of every dangerous bug here: not a crash, a confident
 *  wrong number. So these tests are written from the shapes an OCR reader
 *  actually emits rather than from the shape the parser expects, which is how
 *  the original was found.
 * ══════════════════════════════════════════════════════════════════════════
 */

const sheet = (lines) => parseSheet(lines.join("\n"));

/* Figures by party rather than by position. `parsed.votes` is positional over
   the list the reader scans — which is the whole party register, not any one
   ballot, because a photograph does not say which paper it is. Every
   assertion written as a bare array had to be rewritten the first time a
   party was added, and an assertion that has to be rewritten to stay green is
   one nobody reads carefully the second time. */
const byParty = (read) =>
  Object.fromEntries(scanList().map((party, index) => [party.id, read.votes[index]]));

describe("the header trap", () => {
  it("does not read the party names in a header as their votes", () => {
    /* The exact failure the fix was written for. */
    const read = sheet([
      "EC8A FORM - APC PDP LP NNPP RESULT SUMMARY",
      "POLLING UNIT: 01/01/04/006",
      "REGISTERED VOTERS 800",
      "ACCREDITED VOTERS 412",
      "APC 180",
      "PDP 140",
      "LP 70",
      "NNPP 20",
      "REJECTED 2",
    ]);

    const figures = byParty(read);

    assert.deepEqual(
      { APC: figures.APC, PDP: figures.PDP, LP: figures.LP, NNPP: figures.NNPP },
      { APC: 180, PDP: 140, LP: 70, NNPP: 20 },
      "the header was read as figures instead of the party rows"
    );
    /* Checked over the parties this sheet actually names. A party with no row
       on the paper comes back 0, and including those zeros here would make the
       "all the same" test pass even if the original bug came back — the four
       rows would read 8, 8, 8, 8 and the zeros would break the tie. */
    const onSheet = [figures.APC, figures.PDP, figures.LP, figures.NNPP];
    assert.ok(
      !onSheet.every((value) => value === onSheet[0]),
      "every party came back with the same figure, which is the original bug"
    );
  });

  it("does not treat a sheet that is only a header as readable", () => {
    const read = sheet(["EC8A FORM - APC PDP LP NNPP RESULT SUMMARY"]);
    assert.equal(read.usable, false, "a sheet with no figures on it was called usable");
    assert.ok(read.problems.length > 0, "a sheet with no figures raised no problem");
  });
});

describe("what balances and what does not", () => {
  const balanced = [
    "POLLING UNIT 01/01/04/006",
    "REGISTERED VOTERS 800",
    "ACCREDITED VOTERS 412",
    "APC 180",
    "PDP 140",
    "LP 70",
    "NNPP 20",
    "REJECTED 2",
  ];

  it("calls a sheet balanced only when the arithmetic actually holds", () => {
    /* 180+140+70+20 = 410, accredited 412 less 2 rejected = 410. */
    const read = sheet(balanced);
    assert.equal(read.sum, 410);
    assert.equal(read.balanced, true, `did not balance: ${read.problems.join("; ")}`);
    assert.equal(read.usable, true);
  });

  it("reads a rejected figure however the label was smudged", () => {
    /* An OCR pass over a photograph loses the second half of a line
       constantly. "REJECTED BALLOTS 2" arriving as "REJECTED 2" used to read
       as no rejected figure at all, which made the sheet unbalanceable. */
    for (const line of ["REJECTED 2", "REJECTED BALLOTS 2", "NO. OF REJECTED 2"]) {
      const read = sheet([...balanced.slice(0, 7), line]);
      assert.equal(read.rejected, 2, `"${line}" was not read as a rejected figure`);
      assert.equal(read.balanced, true, `"${line}" left the sheet unbalanceable`);
    }
  });

  it("reads a registered figure however the label was smudged", () => {
    for (const line of ["REGISTERED 800", "REGISTERED VOTERS 800"]) {
      const read = sheet([line, ...balanced.slice(2)]);
      assert.equal(read.registered, 800, `"${line}" was not read`);
    }
  });

  it("refuses a sheet whose parties exceed the accredited voters", () => {
    /* Replace the APC row rather than splicing around it: an earlier version
       of this test dropped PDP by accident and then asserted on a sheet that
       was failing for a different reason entirely. */
    const read = sheet(balanced.map((line) => (line.startsWith("APC") ? "APC 900" : line)));
    assert.equal(read.balanced, false);
    assert.equal(read.usable, false, "more ballots than accredited was called usable");
    assert.ok(read.problems.some((problem) => /more than/.test(problem)));
  });

  it("does not balance a sheet with no accredited figure on it", () => {
    const read = sheet(balanced.filter((line) => !line.startsWith("ACCREDITED")));
    assert.equal(read.balanced, false, "balanced against an accredited figure it never read");
    assert.equal(read.usable, false);
  });

  it("reports a party it could not make out as missing, never as zero", () => {
    /* A real zero is written on the sheet as a zero. A hole in the return is
       a different fact, and filing it as nought is how a party silently loses
       votes it was never credited with. */
    const read = sheet(balanced.filter((line) => !line.startsWith("NNPP")));
    assert.ok(read.missing.includes("NNPP"), `missing was ${JSON.stringify(read.missing)}`);
    assert.equal(read.usable, false, "a sheet with an unread party was called usable");
  });

  it("reads a genuine zero as a zero", () => {
    const read = sheet([
      "POLLING UNIT 01/01/04/006",
      "ACCREDITED VOTERS 390",
      "APC 200",
      "PDP 190",
      "LP 0",
      "NNPP 0",
      "REJECTED 0",
    ]);
    const figures = byParty(read);
    assert.deepEqual(
      { APC: figures.APC, PDP: figures.PDP, LP: figures.LP, NNPP: figures.NNPP },
      { APC: 200, PDP: 190, LP: 0, NNPP: 0 }
    );
    assert.ok(!read.missing.includes("LP"), "a written zero was reported as unread");
  });
});

describe("a row that is not on the paper", () => {
  /* ══════════════════════════════════════════════════════════════════════
     The ballot grew past the presidential four, and "no figure for this
     party" stopped having one meaning.

     A party whose initials are on the page and whose number cannot be read
     is a failed reading: stop, and make the agent look. A party whose
     initials are nowhere on the page did not stand in this contest, and the
     paper is an ordinary one.

     Conflating them refused every honest sheet — `usable` went false, and
     matchSheet refuses to compare an unusable reading, so a filing that was
     right in every particular was turned away with no mismatch to show for
     it. That is the same family as the header trap and the rejected-figure
     trap above: not a wrong number in the count, a wrong number in the
     comparison.
     ══════════════════════════════════════════════════════════════════════ */
  const fourRows = [
    "POLLING UNIT 01/01/04/006",
    "ACCREDITED VOTERS 412",
    "APC 180",
    "PDP 140",
    "LP 70",
    "NNPP 20",
    "REJECTED 2",
  ];

  it("does not call a sheet defective for a party that did not stand", () => {
    const read = sheet(fourRows);

    assert.deepEqual(read.missing, [], `missing was ${JSON.stringify(read.missing)}`);
    assert.ok(read.absent.includes("ADC"), "a party with no row was not reported absent");
    assert.equal(read.usable, true, `unusable: ${read.problems.join("; ")}`);
    assert.equal(read.balanced, true);
  });

  it("still stops on a party whose row is there and whose figure is not", () => {
    const read = sheet([...fourRows.slice(0, 6), "ADC", "REJECTED 2"]);

    assert.ok(read.missing.includes("ADC"), "an unreadable row was not reported missing");
    assert.ok(!read.absent.includes("ADC"), "a row that was on the page was called absent");
    assert.equal(read.usable, false, "a sheet with an unread party row was called usable");
  });

  it("does not refuse an honest filing over a party that is not on the sheet", async () => {
    const { matchSheet } = await import("../lib/sheet-match.js");

    const match = matchSheet(sheet(fourRows), {
      accredited: 412,
      rejected: 2,
      votes: { APC: 180, PDP: 140, LP: 70, NNPP: 20 },
    });

    assert.equal(match.agrees, true, `refused: ${match.reason ?? JSON.stringify(match.mismatches)}`);
    assert.deepEqual(match.mismatches, []);
  });

  it("never turns an absent party into a zero on the form", async () => {
    const { figuresForBallot } = await import("../lib/sheet-vision.js");
    const figures = figuresForBallot(sheet(fourRows), "PRESIDENTIAL");

    assert.equal(figures.votes.ADC, null, "a party nobody measured arrived as a counted zero");
    assert.equal(figures.votes.APC, 180);
  });
});

describe("what may be believed", () => {
  it("believes a reader that genuinely reads handwriting", () => {
    assert.equal(trustworthy({ reader: "claude" }), true);
    assert.equal(trustworthy({ reader: "google" }), true);
  });

  it("believes a weaker reader only when the arithmetic agrees", () => {
    /* OCR.space reads handwriting well enough to be worth running and not
       well enough to be believed without the sums holding. */
    assert.equal(trustworthy({ reader: "ocrspace", parsed: { balanced: true } }), true);
    assert.equal(trustworthy({ reader: "ocrspace", parsed: { balanced: false } }), false);
    assert.equal(trustworthy({ reader: "ocrspace" }), false);
  });

  it("believes nothing about nothing", () => {
    assert.equal(trustworthy(null), false);
    assert.equal(trustworthy({}), false);
    assert.equal(trustworthy(undefined), false);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  Both of these were found by reading a genuine INEC form — the 2020 Edo
 *  governorship declaration — through a reader good enough to reach them.
 *  Neither is a crash. Both produced small, plausible, arithmetically
 *  coherent figures for the two parties that actually won the election, and
 *  a count would have accepted either without complaint.
 *
 *  They are kept as separate describes rather than folded into the header
 *  trap above because they are a different mechanism with the same shape,
 *  and the shape is the thing worth guarding: a confident wrong number.
 * ══════════════════════════════════════════════════════════════════════════
 */

describe("the serial number trap", () => {
  it("does not read the S/N column as a party's votes", () => {
    /* The real failure. The reader made out the row and the party but not the
       figure, which is what happens on the cramped, heavily overwritten rows
       — and those are the rows carrying the largest numbers on the sheet. The
       leading row number was then the only digit left on the line. */
    const read = sheet([
      "POLLING UNIT 01/01/04/006",
      "ACCREDITED VOTERS 412",
      "11\tGodwin N. Obaseki\tM\tPDP",
    ]);

    assert.notEqual(read.votes[1], 11, "the row number was filed as PDP's vote");
    assert.ok(read.missing.includes("PDP"), "an unread figure was not reported missing");
  });

  it("still reads a figure on a numbered row", () => {
    /* The row number must be dropped without taking the real figure with it. */
    const read = sheet([
      "ACCREDITED VOTERS 412",
      "4\tOsagie A. Ize-Iyamu\tM\tAPC\t223619",
      "11\tGodwin N. Obaseki\tM\tPDP\t307955",
    ]);

    assert.equal(read.votes[0], 223619, "the leading row number ate APC's figure");
    assert.equal(read.votes[1], 307955, "the leading row number ate PDP's figure");
  });
});

describe("the next-row trap", () => {
  it("does not take a figure from the row below", () => {
    /* APC's figure was unreadable, so the parser fell through to the next
       line and filed APGA's 177 as APC's result. Guarding on "does the next
       line name another party" is not enough: this product knows four party
       codes and a real ballot paper carries eighteen, so APGA's row does not
       look like a party row to it. */
    const read = sheet([
      "ACCREDITED VOTERS 412",
      "Osagie A. Ize-Iyamu\tM\tAPC",
      "5\tOsagie L. Idehen\tAPGA\t177",
    ]);

    assert.notEqual(read.votes[0], 177, "APC was credited with APGA's votes");
    assert.ok(read.missing.includes("APC"), "an unread figure was not reported missing");
  });

  it("does not take a figure from a line of words", () => {
    /* The other half of the same sheet: the words column wrapping onto its
       own line, where "3P/ 165 SEVEN THON ANAN" is a mangled 307955. */
    const read = sheet([
      "ACCREDITED VOTERS 412",
      "Godwin N. Obaseki\tM\tPDP",
      "3P/ 165 SEVEN THON ANAN",
    ]);

    assert.notEqual(read.votes[1], 165, "a fragment of the words column became PDP's vote");
  });

  it("still reads a figure a reader put on its own line", () => {
    /* The layout the fallback exists for, which must keep working: a reader
       that emits the label and its figure as two lines. */
    const read = sheet([
      "ACCREDITED VOTERS 412",
      "APC",
      "180",
      "PDP 140",
      "LP 70",
      "NNPP 20",
    ]);

    assert.equal(read.votes[0], 180, "a figure on its own line was no longer read");
    assert.ok(!read.missing.includes("APC"), "a figure that was read was reported missing");
  });
});

describe("an unread figure blocks nothing", () => {
  it("does not manufacture a mismatch out of a rejected figure it never read", async () => {
    /* `rejected` used to default to 0 when the label could not be made out.
       An agent who read 2 off the sheet and typed it correctly was then held
       against a 0 nobody had measured, the figures "disagreed", and a filing
       that was right in every particular was refused.

       That is the same family as the header trap: not a crash, and not a
       wrong figure in the count — a wrong figure in the *comparison*, which
       stops an honest return at the door. An unread figure is null now, and
       matchSheet skips what it cannot compare. */
    const { matchSheet } = await import("../lib/sheet-match.js");

    const read = sheet([
      "POLLING UNIT 01/01/04/006",
      "ACCREDITED VOTERS 412",
      "APC 180",
      "PDP 140",
      "LP 70",
      "NNPP 20",
    ]);

    assert.equal(read.rejected, null, "an unread rejected figure came back as a measurement");

    const match = matchSheet(read, {
      accredited: 412,
      rejected: 2,
      votes: { APC: 180, PDP: 140, LP: 70, NNPP: 20 },
    });

    assert.equal(match.agrees, true, "a correct filing was refused over an unread figure");
    assert.deepEqual(match.mismatches, [], "a figure that was never read was reported as differing");
  });
});

describe("the second-pass trap", () => {
  /* When the first read of a sheet leaves figures unread, the reader is run
     again without table mode, which finds a different set of mistakes rather
     than the same ones louder. But that pass has no row structure at all —
     "the line after this one" is whatever the reader happened to emit next.
     Merging it loosely credited APC with 2374, which is ADP's figure, on a
     sheet where the first pass had honestly left APC empty. */

  it("takes no figure from an adjacent line when reading strictly", () => {
    const loose = parseSheet(["ACCREDITED VOTERS 412", "APC", "2374"].join("\n"));
    const strict = parseSheet(["ACCREDITED VOTERS 412", "APC", "2374"].join("\n"), {
      sameLineOnly: true,
    });

    assert.equal(loose.votes[0], 2374, "the loose parse stopped reading its own layout");
    assert.equal(strict.votes[0], 0, "a structureless pass invented a figure for APC");
    assert.ok(strict.missing.includes("APC"), "an unread figure was not reported missing");
  });

  it("still reads a figure sitting on the party's own line", () => {
    /* The whole point of the second pass: a cell the table mode dropped is
       often still there, on the row, in a flat reading of the page. */
    const strict = parseSheet(
      ["ACCREDITED VOTERS 412", "APC 223619", "PDP 307955"].join("\n"),
      { sameLineOnly: true }
    );

    assert.equal(strict.votes[0], 223619, "a same-line figure was discarded");
    assert.equal(strict.votes[1], 307955, "a same-line figure was discarded");
    assert.ok(!strict.missing.includes("APC"));
  });

  it("does not let strict mode invent a labelled voter figure either", () => {
    const strict = parseSheet(["ACCREDITED VOTERS", "412"].join("\n"), { sameLineOnly: true });
    assert.equal(strict.accredited, null, "a figure on the following line was taken as accredited");
  });
});
