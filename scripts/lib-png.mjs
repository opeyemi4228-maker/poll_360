import { deflateSync } from "node:zlib";

/**
 * A very small PNG encoder.
 *
 * Here because the seeded incidents needed photographs and the alternative was
 * a native image library: a compiled dependency, in a deployment image, to
 * draw a few rectangles once. PNG's container is four chunks and a CRC, and
 * writing them out is less code than installing something would be.
 *
 * Truecolour, eight bits a channel, filter type 0 on every scanline. No
 * interlacing, no palette, no transparency. Enough to draw with, and nothing
 * that has to be maintained.
 */

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A drawing surface. `set` is clipped, so nothing has to bounds check. */
export function surface(width, height, [r, g, b] = [255, 255, 255]) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 3] = r;
    pixels[i * 3 + 1] = g;
    pixels[i * 3 + 2] = b;
  }

  const set = (x, y, [pr, pg, pb], alpha = 1) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const at = (py * width + px) * 3;
    pixels[at] = Math.round(pixels[at] * (1 - alpha) + pr * alpha);
    pixels[at + 1] = Math.round(pixels[at + 1] * (1 - alpha) + pg * alpha);
    pixels[at + 2] = Math.round(pixels[at + 2] * (1 - alpha) + pb * alpha);
  };

  return {
    width,
    height,
    set,
    rect(x, y, w, h, colour, alpha = 1) {
      for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) set(px, py, colour, alpha);
    },
    encode() {
      const raw = Buffer.alloc(height * (width * 3 + 1));
      for (let y = 0; y < height; y += 1) {
        raw[y * (width * 3 + 1)] = 0;
        pixels.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
      }

      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(width, 0);
      ihdr.writeUInt32BE(height, 4);
      ihdr[8] = 8;
      ihdr[9] = 2;

      return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
      ]);
    },
  };
}
