/**
 * Shrink a photograph on the phone, before it is sent.
 *
 * ── WHY THIS HAPPENS ON THE DEVICE AND NOT THE SERVER ──────────────────────
 * A modern phone camera produces eight to twelve megabytes. Over a rural
 * signal at close of poll that is a submission that does not arrive — and the
 * server cannot shrink a file it never received. Drawing it to a canvas at
 * 1280px and re-encoding as JPEG q80 turns it into two to four hundred
 * kilobytes, indistinguishable on screen, and the difference between a report
 * that lands and one that times out.
 *
 * 1280px is also comfortably enough for the sheet reader: the figures on an
 * EC8A are large, hand-written and high contrast, and the reader's accuracy
 * stops improving long before the file stops growing.
 *
 * ── WHY IT LIVES HERE ──────────────────────────────────────────────────────
 * Two forms need it — the incident photograph and the result sheet — and it
 * was written twice before it was written once. Two copies of an image
 * pipeline drift, and the way you find out is one form quietly sending
 * eight-megabyte originals for a month.
 *
 * It imports nothing and touches no server API, so either side may hold it.
 * ───────────────────────────────────────────────────────────────────────────
 */

const LONGEST_EDGE = 1280;
const QUALITY = 0.8;

/**
 * Returns `{ file, url, kb }`, or null if the browser could not decode it.
 *
 * ── FAILING HERE MUST NOT LOSE THE PICTURE ─────────────────────────────────
 * No canvas, a format the browser cannot decode, a photo library that hands
 * back something odd: the original is returned untouched rather than nothing
 * at all. The server checks the leading bytes and refuses anything that is not
 * a real photograph, so the worst case is a large upload, not a bad one.
 */
export async function shrinkImage(file) {
  if (!file) return null;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, LONGEST_EDGE / Math.max(bitmap.width, bitmap.height));

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) return original(file);

    return {
      file: new File([blob], "photo.jpg", { type: "image/jpeg" }),
      url: URL.createObjectURL(blob),
      kb: Math.round(blob.size / 1024),
    };
  } catch {
    return original(file);
  }
}

const original = (file) => ({
  file,
  url: URL.createObjectURL(file),
  kb: Math.round(file.size / 1024),
});

/**
 * Put a file back on an <input type="file"> so the form submits it normally.
 *
 * The shrunk blob has to replace what the input holds, or the form posts the
 * original and every byte saved above is wasted. DataTransfer is the only way
 * to write to `input.files`, and it is not available everywhere — where it is
 * not, the input keeps the original and the upload still works.
 */
export function putOnInput(input, file) {
  try {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    return true;
  } catch {
    return false;
  }
}
