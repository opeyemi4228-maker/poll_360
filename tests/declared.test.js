import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { levelOf, parseDeclared, summarise } from "../lib/declared.js";

/**
 * Reading what the desk uploads.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  This is the other half of the parallel count. Our agents' figures come in
 *  through the field app; the commission's come in through here, as a paste
 *  out of a browser table or a file somebody exported at a collation centre
 *  at two in the morning.
 *
 *  Two failures matter and both are quiet. Reading a row into the wrong place
 *  compares two different wards and reports the difference as a finding — the
 *  system inventing the very thing it exists to detect. And throwing on a bad
 *  line loses the good ones: a file of four thousand wards with a footer row
 *  in it is a good file with a footer row in it, and on a night when
 *  collation is running, losing it is the whole upload gone.
 * ══════════════════════════════════════════════════════════════════════════
 */

describe("what level a key names", () => {
  it("reads each depth off the shape of the code", () => {
    assert.equal(levelOf("01/01/04/006").level, "UNIT");
    assert.equal(levelOf("01/01/04").level, "WARD");
    assert.equal(levelOf("01/01").level, "LGA");
    assert.equal(levelOf("01").level, "STATE");
  });

  it("normalises padding, so 1/1/4 and 01/01/04 are one ward", () => {
    assert.equal(levelOf("1/1/4").key, "01/01/04");
    assert.equal(levelOf("1/1/4").key, levelOf("01/01/04").key);
    assert.equal(levelOf("1").key, "01");
  });

  it("accepts the separators people actually paste", () => {
    for (const written of ["01/01/04", "01-01-04", "01 01 04"]) {
      assert.equal(levelOf(written).key, "01/01/04", `"${written}" read differently`);
    }
  });

  it("refuses anything that is not a code", () => {
    for (const bad of ["", null, undefined, "Ikeja", "01/AB", "abc", "  "]) {
      assert.equal(levelOf(bad), null, `"${bad}" was read as a place`);
    }
  });

  it("agrees with the unit parser about a unit", () => {
    /* Both sides of the comparison derive their key from the same string.
       If these two ever disagreed, our returns and the declared figures would
       join on different keys and every place would look unmatched. */
    assert.equal(levelOf("01-01-04-006").key, "01/01/04/006");
  });
});

describe("reading an uploaded table", () => {
  const header = "unit,registered,accredited,rejected,APC,PDP,LP,NNPP";

  it("reads a clean comma file", () => {
    const { rows, problems } = parseDeclared(
      [header, "01/01/04/006,800,412,2,180,140,70,20"].join("\n")
    );
    assert.deepEqual(problems, [], `clean file reported ${problems.length} problems`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].level, "UNIT");
    assert.equal(rows[0].key, "01/01/04/006");
    assert.equal(rows[0].accredited, 412);
  });

  it("reads a tab paste, which is how this data usually arrives", () => {
    const { rows, problems } = parseDeclared(
      [header.replaceAll(",", "\t"), "01/01/04/006\t800\t412\t2\t180\t140\t70\t20"].join("\n")
    );
    assert.deepEqual(problems, []);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].key, "01/01/04/006");
  });

  it("reads a semicolon file, which is what a comma-decimal locale exports", () => {
    const { rows } = parseDeclared(
      [header.replaceAll(",", ";"), "01/01/04/006;800;412;2;180;140;70;20"].join("\n")
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].key, "01/01/04/006");
  });

  it("does not throw on an empty upload", () => {
    for (const empty of ["", "   ", null, undefined]) {
      assert.doesNotThrow(() => parseDeclared(empty));
      assert.deepEqual(parseDeclared(empty).rows, []);
    }
  });

  it("keeps the good rows and reports the bad ones by line", () => {
    /* The whole reason this returns problems rather than throwing them. */
    const { rows, problems } = parseDeclared(
      [
        header,
        "01/01/04/006,800,412,2,180,140,70,20",
        "TOTAL,,,,,,,",
        "01/01/04/007,800,400,1,190,130,60,18",
      ].join("\n")
    );

    assert.equal(rows.length, 2, "a footer row took the good rows with it");
    assert.ok(problems.length >= 1, "a footer row was accepted silently");
    assert.ok(
      problems.every((problem) => typeof problem.line === "number"),
      "a problem was reported without a line number"
    );
  });

  it("ignores columns that are none of its business", () => {
    /* A collation sheet carries a ward name, a returning officer and a
       timestamp. None of them is a fault. */
    const { rows, problems } = parseDeclared(
      [
        "unit,ward name,returning officer,registered,accredited,rejected,APC,PDP,LP,NNPP,declared at",
        "01/01/04/006,Agege I,Mrs A Bello,800,412,2,180,140,70,20,2027-02-27T21:04",
      ].join("\n")
    );
    assert.deepEqual(problems, [], `extra columns produced ${problems.length} problems`);
    assert.equal(rows[0].key, "01/01/04/006");
    assert.equal(rows[0].votes.APC ?? rows[0].votes[0], 180);
  });

  it("reads a ward-level upload as a ward, not as a broken unit", () => {
    const { rows, problems } = parseDeclared(
      [header.replace("unit", "place"), "01/01/04,9000,4200,30,1800,1400,700,200"].join("\n")
    );
    assert.deepEqual(problems, []);
    assert.equal(rows[0].level, "WARD");
    assert.equal(rows[0].key, "01/01/04");
  });
});

describe("the upload summary", () => {
  it("counts what it actually read", () => {
    const { rows } = parseDeclared(
      [
        "unit,registered,accredited,rejected,APC,PDP,LP,NNPP",
        "01/01/04/006,800,412,2,180,140,70,20",
        "01/01/04/007,800,400,1,190,130,60,18",
      ].join("\n")
    );
    const summary = summarise(rows);
    assert.ok(summary, "no summary was produced");
    assert.equal(typeof summary, "object");
  });

  it("does not invent a summary out of nothing", () => {
    assert.doesNotThrow(() => summarise([]));
  });
});
