import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addressOf, pull, readSource } from "../lib/declared-feed.js";

/**
 * Declared figures fetched from a sheet.
 *
 * Nobody is watching when this runs, so what is pinned here is what it does
 * when the sheet is wrong: an unreadable or unreachable sheet must change
 * nothing already filed, and an unchanged one must not be filed again.
 */

const SHEET = "Code,Units,APC,PDP\n25/07/04,18,2210,3105\n25/07/05,22,3020,3640\n";
const answering = (text, status = 200) => async () => new Response(text, { status });

function store() {
  const saved = [];
  const recorded = [];
  return {
    saved,
    recorded,
    declared: { save: async (batch) => (saved.push(batch), { written: batch.rows.length }) },
    declaredSources: { record: async (row) => recorded.push(row) },
  };
}

const source = { electionId: "e1", race: "PRESIDENTIAL", address: "https://example.org/sheet.csv", addedBy: "u1", fingerprint: null };

describe("the address of a sheet", () => {
  it("turns a spreadsheet's editing link into the one that returns its cells", () => {
    assert.equal(
      addressOf("https://docs.google.com/spreadsheets/d/abc_123-X/edit#gid=77").address,
      "https://docs.google.com/spreadsheets/d/abc_123-X/export?format=csv&gid=77"
    );
    assert.equal(
      addressOf("https://docs.google.com/spreadsheets/d/e/2PACX-9/pubhtml").address,
      "https://docs.google.com/spreadsheets/d/e/2PACX-9/pub?output=csv"
    );
  });

  it("refuses anything that is not a public https address", () => {
    for (const bad of ["", "sheet", "http://example.org/a.csv", "https://localhost/a", "https://10.0.0.8/a", "https://[::1]/a", "https://intranet/a", "https://db.internal/a", "https://me:pw@example.org/a"]) {
      assert.ok(addressOf(bad).error, bad);
    }
  });
});

describe("reading a sheet", () => {
  it("files what it finds, marked as fetched and attributed to whoever gave the link", async () => {
    const db = store();
    const went = await pull(source, db, { fetchImpl: answering(SHEET) });
    assert.equal(went.status, "CHANGED");
    assert.equal(went.written, 2);
    assert.equal(db.saved[0].source, "FETCHED");
    assert.equal(db.saved[0].enteredBy, "u1");
    assert.equal(db.saved[0].rows[0].votes.PDP, 3105);
    assert.ok(db.recorded[0].fingerprint);
  });

  it("does not file a sheet that has not changed", async () => {
    const db = store();
    await pull(source, db, { fetchImpl: answering(SHEET) });
    const again = await pull({ ...source, fingerprint: db.recorded[0].fingerprint }, db, { fetchImpl: answering(SHEET) });
    assert.equal(again.status, "SAME");
    assert.equal(db.saved.length, 1);
  });

  it("changes nothing when the sheet cannot be reached, is a sign-in page, or holds no figures", async () => {
    for (const fetchImpl of [
      answering("no", 403),
      answering("<!DOCTYPE html><html><body>Sign in</body></html>"),
      answering("Code,APC\n"),
      answering("just some words\nand more"),
      async () => {
        throw new Error("offline");
      },
    ]) {
      const db = store();
      const went = await pull(source, db, { fetchImpl });
      assert.notEqual(went.status, "CHANGED");
      assert.equal(db.saved.length, 0);
      assert.ok(db.recorded[0].said);
      assert.equal(db.recorded[0].fingerprint, undefined);
    }
  });

  it("keeps the good lines of a sheet with a bad one in it", async () => {
    const found = await readSource({ address: source.address, fetchImpl: answering(SHEET + "Total,,5230,6745\n") });
    assert.equal(found.status, "CHANGED");
    assert.equal(found.rows.length, 2);
    assert.equal(found.problems.length, 1);
  });
});

describe("being sent elsewhere", () => {
  it("follows a sheet to where its cells are served, and not to a private address", async () => {
    const hops = (to) => async (url) =>
      String(url) === source.address
        ? new Response(null, { status: 302, headers: { location: to } })
        : new Response(SHEET);
    assert.equal((await readSource({ address: source.address, fetchImpl: hops("https://cells.example.net/x.csv") })).status, "CHANGED");
    assert.equal((await readSource({ address: source.address, fetchImpl: hops("https://169.254.169.254/latest") })).status, "UNREACHABLE");
  });
});
