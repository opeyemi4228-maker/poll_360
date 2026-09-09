/**
 * What a file actually is, read from the bytes rather than the label.
 *
 * ── THE CONTENT TYPE IS A CLAIM; THE FIRST FOUR BYTES ARE A FACT ───────────
 * A browser sends whatever it likes in `Content-Type`, and a file called
 * photo.jpg is a name somebody chose. Only two formats are accepted here, both
 * of which every phone camera produces, and everything else is refused —
 * including SVG, which is a script in a trench coat and would be served back
 * to a desk as an image.
 *
 * ── AND IT LIVES HERE BECAUSE IT WAS ABOUT TO BE WRITTEN TWICE ─────────────
 * There was one of these in app/field/actions.js for incident photographs, and
 * the agent sign-up form needed the same check. Two copies of a security check
 * drift, and the way that is discovered is one of them quietly accepting
 * something the other refuses for a month. lib/shrink.js exists for exactly
 * this reason and says so; this is the same lesson on the server side.
 */
export function sniffImage(bytes) {
  if (!bytes || bytes.length < 12) return null;

  /* JPEG: FF D8 FF. */
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";

  /* PNG: the eight-byte signature, of which the first four are enough to
     separate it from anything else a camera produces. */
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }

  return null;
}
