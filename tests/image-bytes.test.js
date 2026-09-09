import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sniffImage } from "../lib/image-bytes.js";

/**
 * The bytes decide, not the label.
 *
 * This is the check standing between an agent's upload box and both the media
 * table and DumpSite, so what it refuses matters more than what it accepts.
 * The cases below are the ones that have actually been tried against upload
 * forms in the wild rather than a sweep of every format in existence.
 */

/** The first bytes of a real file of each kind, which is all this reads. */
const head = (...bytes) => Buffer.from([...bytes, ...Array(16).fill(0)]);

const JPEG = head(0xff, 0xd8, 0xff, 0xe0);
const PNG = head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

describe("what a photograph actually is", () => {
  it("knows a JPEG from a phone camera", () => {
    assert.equal(sniffImage(JPEG), "image/jpeg");
  });

  it("knows a PNG", () => {
    assert.equal(sniffImage(PNG), "image/png");
  });

  it("refuses an SVG, which is a script wearing an image's name", () => {
    assert.equal(sniffImage(Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"><script/></svg>")), null);
  });

  it("refuses HTML, whatever it was uploaded as", () => {
    assert.equal(sniffImage(Buffer.from("<!doctype html><html><body>not a photo</body>")), null);
  });

  it("refuses a PDF", () => {
    assert.equal(sniffImage(Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj")), null);
  });

  it("refuses a GIF, which is an image and still not one of the two", () => {
    assert.equal(sniffImage(head(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)), null);
  });

  it("refuses a file that only starts like a JPEG", () => {
    /* Two of the three magic bytes. A check written as `bytes[0] === 0xff &&
       bytes[1] === 0xd8` alone would take this. */
    assert.equal(sniffImage(head(0xff, 0xd8, 0x00, 0x00)), null);
  });

  it("refuses nothing at all rather than throwing on it", () => {
    /* An empty file is what a form sends when a phone's camera is cancelled,
       so this arrives at the server on an ordinary afternoon. */
    assert.equal(sniffImage(Buffer.alloc(0)), null);
    assert.equal(sniffImage(null), null);
    assert.equal(sniffImage(undefined), null);
  });

  it("refuses a file too short to be either", () => {
    /* Three correct bytes and nothing after them is not a JPEG; a length floor
       means the checks below never read past the end of a truncated upload. */
    assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff])), null);
  });

  it("reads a plain Uint8Array, not only a Buffer", () => {
    /* `new Uint8Array(await file.arrayBuffer())` is the other way this is
       written, and it would be a nasty surprise for it to answer differently. */
    assert.equal(sniffImage(new Uint8Array(JPEG)), "image/jpeg");
  });
});
