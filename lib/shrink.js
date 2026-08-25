/**
 * Shrink a photograph on the phone, before it is sent.
 *
 * ── WHY THIS HAPPENS ON THE DEVICE AND NOT THE SERVER ──────────────────────
 * A modern phone camera produces eight to twelve megabytes. Over a rural
 * signal at close of poll that is a submission that does not arrive — and the
 * server cannot shrink a file it never received. Drawing it to a canvas and
 * re-encoding as JPEG turns it into a few hundred kilobytes, and that is the
 * difference between a report that lands and one that times out.
 *
 * ── TWO DIFFERENT JOBS, TWO DIFFERENT SIZES ────────────────────────────────
 * This used to shrink everything to 1280px, with a comment asserting that
 * 1280 was "comfortably enough for the sheet reader". That was written when
 * the reader only read print, and it was never re-tested when the readers
 * became ones that read handwriting. It was wrong, and measurably so.
 *
 * An A4 result sheet at 1280px on its longest edge is about 110 dots per
 * inch. A handwritten figure five millimetres tall lands at roughly twenty
 * pixels, before JPEG quantisation takes a bite out of it. Optical readers
 * want something near 300 DPI on handwriting, and what actually happens at
 * 110 is the failure this was found by: the short figures on a sheet come
 * back correctly and the long ones — six digits crammed into the same width
 * of box, which on a Nigerian result sheet are the two parties that win — do
 * not come back at all.
 *
 * So a photograph of a result sheet is now kept at 2400px, which is about
 * 200 DPI on A4 and roughly four times the pixels per digit. An incident
 * photograph is still 1280: nothing reads it, a person looks at it, and 1280
 * is more than enough to see a queue or a barricade.
 *
 * ── AND WHY THERE IS A BYTE CEILING AS WELL AS A PIXEL ONE ─────────────────
 * Resolution is worth having right up until the upload stops arriving. Every
 * caller can name the most it is willing to send, and the encoder steps the
 * quality down and then the size down until it fits. That ceiling is a real
 * constraint rather than a guess: the free tier of the hosted reader refuses
 * anything over a megabyte, and a sheet that is refused for being too large
 * is a sheet nobody reads at all.
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

/** A photograph a person looks at. Big enough to see what happened. */
export const SNAPSHOT = { longestEdge: 1280, quality: 0.8 };

/**
 * A photograph a machine reads.
 *
 * 2400px is about 200 DPI across A4 and comfortably over the threshold where
 * handwritten figures stop being recovered. The megabyte ceiling is the free
 * tier of the hosted reader, which refuses anything larger outright.
 */
export const RESULT_SHEET = { longestEdge: 2400, quality: 0.9, maxBytes: 1_000_000 };

/**
 * Returns `{ file, url, kb, width, height }`, or null if it could not decode.
 *
 * ── FAILING HERE MUST NOT LOSE THE PICTURE ─────────────────────────────────
 * No canvas, a format the browser cannot decode, a photo library that hands
 * back something odd: the original is returned untouched rather than nothing
 * at all. The server checks the leading bytes and refuses anything that is not
 * a real photograph, so the worst case is a large upload, not a bad one.
 */
export async function shrinkImage(file, options = SNAPSHOT) {
  if (!file) return null;

  const { longestEdge, quality, maxBytes = null } = { ...SNAPSHOT, ...options };

  try {
    const bitmap = await createImageBitmap(file);

    /* Never upscale. Enlarging a small photograph adds pixels and no
       information, and it costs the upload it pretends to improve. */
    const scale = Math.min(1, longestEdge / Math.max(bitmap.width, bitmap.height));
    let blob = await encode(bitmap, scale, quality);
    if (!blob) return original(file);

    /* ── COME DOWN TO THE CEILING, QUALITY FIRST ──────────────────────────
       Quality before pixels, deliberately. Dropping from q90 to q75 costs a
       reader almost nothing on a high-contrast form, where halving the
       resolution costs it exactly the figures this was widened to keep. Only
       once quality is spent does the picture start getting smaller. */
    if (maxBytes) {
      for (const step of [0.8, 0.7, 0.6]) {
        if (blob.size <= maxBytes) break;
        const next = await encode(bitmap, scale, step);
        if (next) blob = next;
      }

      for (const step of [0.75, 0.55, 0.4]) {
        if (blob.size <= maxBytes) break;
        const next = await encode(bitmap, scale * step, 0.7);
        if (next) blob = next;
      }
    }

    const url = URL.createObjectURL(blob);
    return {
      file: new File([blob], "photo.jpg", { type: "image/jpeg" }),
      url,
      kb: Math.round(blob.size / 1024),
      width: Math.round(bitmap.width * scale),
      height: Math.round(bitmap.height * scale),
    };
  } catch {
    return original(file);
  }
}

function encode(bitmap, scale, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");
  /* The browser's own downsampler, told to use its best filter. The default
     on a large reduction is a nearest-neighbour-ish path that eats thin
     strokes, and a handwritten 3 is thin strokes. */
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

const original = (file) => ({
  file,
  url: URL.createObjectURL(file),
  kb: Math.round(file.size / 1024),
  width: null,
  height: null,
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
