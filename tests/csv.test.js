import assert from "node:assert/strict";
import test from "node:test";

import { cell, toCsv } from "../lib/csv.js";

/**
 * These files are worked with a handset and opened in Excel. A CSV writer that
 * gets escaping wrong produces a file that opens misaligned, and a misaligned
 * chase list means somebody rings the wrong number — which is a real failure
 * mode of this product and not a theoretical one.
 */

test("a plain value is not quoted", () => {
  assert.equal(cell("Kano"), "Kano");
  assert.equal(cell(1234), "1234");
});

test("nothing becomes an empty cell, not the word undefined", () => {
  assert.equal(cell(null), "");
  assert.equal(cell(undefined), "");
});

test("a comma in a place name does not split the row", () => {
  /* "Aba North, Abia" is how a row gets labelled, and it is one cell. */
  assert.equal(cell("Aba North, Abia"), '"Aba North, Abia"');
});

test("a slash in a name needs no quoting and keeps its slash", () => {
  /* Ile Oluji/Oke Igbo is a real local government. */
  assert.equal(cell("Ile Oluji/Oke Igbo"), "Ile Oluji/Oke Igbo");
});

test("a quote inside a value is doubled, as CSV requires", () => {
  assert.equal(cell('He said "no agents"'), '"He said ""no agents"""');
});

test("a newline in a narrative stays inside its cell", () => {
  /* An incident note is whatever somebody typed at 2am, newlines included. */
  const out = cell("Queue at close.\nPolice arrived.");
  assert.equal(out, '"Queue at close.\nPolice arrived."');
});

test("a table keeps its column order and its header", () => {
  const rows = [
    { unit: "25/07/04/019", name: "A. Bello", filed: false },
    { unit: "25/07/04/020", name: "Ngozi, O.", filed: true },
  ];

  const csv = toCsv(rows, [
    ["Polling unit", (row) => row.unit],
    ["Name", (row) => row.name],
    ["Filed", (row) => (row.filed ? "yes" : "NO")],
  ]);

  const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
  assert.equal(lines[0], "Polling unit,Name,Filed");
  assert.equal(lines[1], "25/07/04/019,A. Bello,NO");
  assert.equal(lines[2], '25/07/04/020,"Ngozi, O.",yes');
});

test("the file opens correctly in the spreadsheet it will be opened in", () => {
  const csv = toCsv([{ a: "x" }], [["A", (row) => row.a]]);
  /* A BOM, or every accented character arrives as mojibake in Excel. */
  assert.ok(csv.startsWith("﻿"));
  /* CRLF, which is what a Windows spreadsheet expects. */
  assert.ok(csv.includes("\r\n"));
});
