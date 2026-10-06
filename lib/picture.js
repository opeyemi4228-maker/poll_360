import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

/**
 * What a picture file says about itself.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A CAMERA WRITES A NOTE INSIDE EVERY PICTURE IT TAKES
 *
 *  When it was taken, with what, and — where the device knew — the spot on
 *  the earth it was standing on. A scanner or an app that makes a document
 *  writes a shorter note: what made it and when. This reads those notes out
 *  of a photograph (.jpeg, .png) or a document (.pdf), including the notes of
 *  any photograph placed inside a document, which is how a scanned result
 *  sheet usually travels.
 *
 *  ── WHAT IT IS EVIDENCE OF, AND WHAT IT IS NOT ──────────────────────────
 *  The note is written by the device and can be rewritten by anybody with
 *  the file. So a time and a place found here are what the file claims, not
 *  proof. They are still worth a great deal: a sheet whose own file says it
 *  was photographed forty kilometres from its polling unit, or the day before
 *  the poll, is a sheet somebody should look at. And the absence of a note is
 *  not suspicious on its own — most messaging apps strip it from every
 *  picture they carry.
 *
 *  Nothing here guesses. A field the file does not carry is null, and
 *  `notes` says in plain words what was missing.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * No library: the format is a small table of numbered fields, the fields that
 * matter are a few dozen, and a dependency that parses every vendor's private
 * extensions is a great deal of somebody else's code to run on files that
 * arrive from strangers.
 */

export function kindOf(bytes) {
  if (bytes?.[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (bytes?.[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes?.[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  return null;
}

/* ── THE TABLE OF FIELDS ──────────────────────────────────────────────────
   Every value sits at an offset from the start of the table, in one of two
   byte orders the table itself declares. Each read is bounds-checked: these
   files come from anywhere, and a table that points outside itself must end
   the read, not the process. */

const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function table(view, little) {
  const u16 = (at) => (at + 2 <= view.byteLength ? view.getUint16(at, little) : null);
  const u32 = (at) => (at + 4 <= view.byteLength ? view.getUint32(at, little) : null);
  const i32 = (at) => (at + 4 <= view.byteLength ? view.getInt32(at, little) : null);

  function value(type, count, at) {
    const size = SIZES[type];
    if (!size || count > 4096 || at + size * count > view.byteLength) return null;

    if (type === 2) {
      let text = "";
      for (let i = 0; i < count; i += 1) {
        const code = view.getUint8(at + i);
        if (code === 0) break;
        text += String.fromCharCode(code);
      }
      return text.trim() || null;
    }

    const one = (index) => {
      const here = at + index * size;
      if (type === 1 || type === 7) return view.getUint8(here);
      if (type === 3) return u16(here);
      if (type === 4) return u32(here);
      if (type === 9) return i32(here);
      const top = type === 5 ? u32(here) : i32(here);
      const bottom = type === 5 ? u32(here + 4) : i32(here + 4);
      return bottom ? top / bottom : null;
    };

    return count === 1 ? one(0) : Array.from({ length: count }, (_, index) => one(index));
  }

  /** The fields of one directory, by number. */
  function directory(at) {
    const fields = new Map();
    const entries = u16(at);
    if (entries === null || entries > 512) return fields;

    for (let index = 0; index < entries; index += 1) {
      const entry = at + 2 + index * 12;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const count = u32(entry + 4);
      if (tag === null || count === null || !SIZES[type]) continue;

      /* Four bytes or fewer sit in the entry itself; anything longer is
         somewhere else and the entry holds where. */
      const inline = SIZES[type] * count <= 4;
      const where = inline ? entry + 8 : u32(entry + 8);
      if (where === null) continue;
      fields.set(tag, value(type, count, where));
    }
    return fields;
  }

  return { directory, u16, u32 };
}

const first = (value) => (Array.isArray(value) ? value[0] : value);
const round = (value, places) => (Number.isFinite(value) ? Number(value.toFixed(places)) : null);

/** "2026:09:19 17:42:10" as "2026-09-19 17:42:10", or null where it is not a date. */
function stamp(text) {
  const found = String(text ?? "").match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!found || found[1] === "0000") return null;
  return `${found[1]}-${found[2]}-${found[3]} ${found[4]}:${found[5]}:${found[6]}`;
}

function degrees(parts, ref) {
  if (!Array.isArray(parts) || parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const value = parts[0] + parts[1] / 60 + parts[2] / 3600;
  if (value === 0 && !ref) return null;
  return ref === "S" || ref === "W" ? -value : value;
}

/** Read the camera's note from the block that carries it. */
export function readNote(block) {
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  if (view.byteLength < 8) return null;

  const order = view.getUint16(0, false);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  const { directory, u32 } = table(view, little);

  const main = directory(u32(4) ?? 8);
  const detail = Number.isInteger(main.get(0x8769)) ? directory(main.get(0x8769)) : new Map();
  const gps = Number.isInteger(main.get(0x8825)) ? directory(main.get(0x8825)) : new Map();

  const latitude = degrees(gps.get(2), gps.get(1));
  const longitude = degrees(gps.get(4), gps.get(3));
  const located = latitude !== null && longitude !== null && !(latitude === 0 && longitude === 0);

  const gpsDay = String(gps.get(0x1d) ?? "").match(/^(\d{4}):(\d{2}):(\d{2})/);
  const gpsClock = gps.get(7);
  const satelliteTime =
    gpsDay && Array.isArray(gpsClock) && gpsClock.every(Number.isFinite)
      ? `${gpsDay[1]}-${gpsDay[2]}-${gpsDay[3]} ${gpsClock
          .map((part) => String(Math.floor(part)).padStart(2, "0"))
          .join(":")}`
      : null;

  const exposure = detail.get(0x829a);
  const altitude = first(gps.get(6));

  return {
    camera: {
      make: main.get(0x010f) ?? null,
      model: main.get(0x0110) ?? null,
      software: main.get(0x0131) ?? null,
      lens: detail.get(0xa434) ?? null,
      serial: detail.get(0xa431) ?? null,
    },
    taken: {
      /* The moment the shutter fired, on the device's own clock. */
      at: stamp(detail.get(0x9003)),
      offset: detail.get(0x9011) ?? detail.get(0x9010) ?? null,
      /* When the file was last written. Later than `at` means it was saved
         again after it was taken. */
      saved: stamp(main.get(0x0132)),
    },
    place: located
      ? {
          latitude: round(latitude, 6),
          longitude: round(longitude, 6),
          altitude: Number.isFinite(altitude) ? round(first(gps.get(5)) === 1 ? -altitude : altitude, 1) : null,
          /* How far off the device thought it might be, in metres. */
          accuracy: Number.isFinite(first(gps.get(0x1f))) ? round(first(gps.get(0x1f)), 1) : null,
          facing: Number.isFinite(first(gps.get(0x11))) ? round(first(gps.get(0x11)), 0) : null,
          /* The satellites' clock, which the device cannot be set wrong on. */
          satelliteTime,
        }
      : null,
    settings: {
      exposure: Number.isFinite(exposure) && exposure > 0 ? (exposure < 1 ? `1/${Math.round(1 / exposure)} s` : `${exposure} s`) : null,
      aperture: Number.isFinite(detail.get(0x829d)) ? `f/${round(detail.get(0x829d), 1)}` : null,
      iso: first(detail.get(0x8827)) ?? null,
      focalLength: Number.isFinite(detail.get(0x920a)) ? `${round(detail.get(0x920a), 1)} mm` : null,
      flash: Number.isInteger(detail.get(0x9209)) ? (detail.get(0x9209) & 1 ? "fired" : "did not fire") : null,
    },
    orientation: main.get(0x0112) ?? null,
    description: main.get(0x010e) ?? null,
    author: main.get(0x013b) ?? null,
  };
}

/** A photograph's size and its camera's note. */
function jpeg(bytes) {
  const out = { width: null, height: null, note: null };
  let at = 2;

  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    const length = bytes.readUInt16BE(at + 2);
    if (length < 2) break;

    if (marker === 0xe1 && !out.note && bytes.toString("latin1", at + 4, at + 10) === "Exif\0\0") {
      out.note = readNote(bytes.subarray(at + 10, at + 2 + length));
    }
    /* The frame header, in any of its forms, carries the real pixel size. */
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      out.height = bytes.readUInt16BE(at + 5);
      out.width = bytes.readUInt16BE(at + 7);
      break;
    }
    if (marker === 0xda) break;
    at += 2 + length;
  }

  return out;
}

function png(bytes) {
  const out = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), note: null };
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("latin1", at + 4, at + 8);
    if (type === "eXIf") out.note = readNote(bytes.subarray(at + 8, at + 8 + length));
    if (type === "IDAT" || type === "IEND") break;
    at += 12 + length;
  }
  return out;
}

/* ── DOCUMENTS ────────────────────────────────────────────────────────────
   A PDF keeps a short record of what made it and when, and holds each
   scanned page as an ordinary photograph. Both are found by looking, not by
   interpreting the whole document: a full reader is a large thing, and these
   two facts sit in the open in every scanned sheet examined. */

/** A PDF date, "D:20230226143107+01'00'", as a time and its offset. */
function pdfDate(text) {
  const found = String(text ?? "").match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?\s*([Zz+-])?(\d{2})?'?(\d{2})?/);
  if (!found) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00", sign, offHour, offMinute] = found;
  return {
    at: `${year}-${month}-${day} ${hour}:${minute}:${second}`,
    offset: !sign ? null : /z/i.test(sign) ? "+00:00" : `${sign}${offHour ?? "00"}:${offMinute ?? "00"}`,
  };
}

/** One entry of the document's record, whichever way it was written down. */
function pdfText(source, name) {
  const plain = source.match(new RegExp(`/${name}\\s*\\(((?:\\\\.|[^\\\\)])*)\\)`));
  if (plain) {
    const text = plain[1].replace(/\\([()\\])/g, "$1").replace(/\\[nrt]/g, " ").replace(/\\0+|\0/g, "");
    /* Two bytes a letter, behind a marker, is how a non-Latin name is kept. */
    if (text.startsWith("þÿ")) {
      return Buffer.from(text.slice(2), "latin1").swap16().toString("utf16le").trim() || null;
    }
    return text.trim() || null;
  }

  const hex = source.match(new RegExp(`/${name}\\s*<([0-9A-Fa-f\\s]+)>`));
  if (!hex) return null;
  const raw = Buffer.from(hex[1].replace(/\s/g, ""), "hex");
  if (raw[0] === 0xfe && raw[1] === 0xff) return raw.subarray(2).swap16().toString("utf16le").trim() || null;
  return raw.toString("latin1").trim() || null;
}

/** Every photograph held inside a document, largest first. */
export function picturesInside(bytes) {
  const found = [];
  let from = 0;

  while (found.length < 50) {
    const at = bytes.indexOf("stream", from, "latin1");
    if (at < 0) break;
    from = at + 6;
    if (bytes[at - 1] === 0x64 /* the "d" of endstream */) continue;

    let start = at + 6;
    if (bytes[start] === 0x0d) start += 1;
    if (bytes[start] === 0x0a) start += 1;
    if (bytes[start] !== 0xff || bytes[start + 1] !== 0xd8 || bytes[start + 2] !== 0xff) continue;

    /* No end means only the head of the document is in hand, which is enough:
       the camera's note is at the very start of the photograph. */
    const end = bytes.indexOf("endstream", start, "latin1");
    found.push(bytes.subarray(start, end < 0 ? bytes.length : end));
    if (end < 0) break;
    from = end + 9;
  }

  /* A document often carries a postage-stamp preview beside the page itself. */
  const real = found.filter((picture) => picture.length > 30000);
  return (real.length ? real : found).sort((a, b) => b.length - a.length);
}

/**
 * The page of a scanned document that was stored packed, not as a photograph.
 *
 * Some of INEC's 2023 sheets are documents whose one page is the raw picture,
 * compressed the way a zip file is. Nothing that reads photographs can open
 * that, so it is unpacked here into plain pixels: `{ data, width, height,
 * channels }`, which an image library turns back into a photograph. Returns
 * null where there is no such page, or it is not a kind this understands.
 */
export function packedPageInside(bytes) {
  let from = 0;
  while (true) {
    const at = bytes.indexOf("/Subtype /Image", from, "latin1");
    if (at < 0) return null;
    from = at + 15;

    const open = bytes.lastIndexOf("<<", at, "latin1");
    const stream = bytes.indexOf("stream", at, "latin1");
    if (open < 0 || stream < 0 || stream - open > 2000) continue;

    const about = bytes.toString("latin1", open, stream);
    if (!/\/FlateDecode/.test(about) || /\/DCTDecode|\/Predictor/.test(about)) continue;
    const width = Number(about.match(/\/Width\s+(\d+)/)?.[1]);
    const height = Number(about.match(/\/Height\s+(\d+)/)?.[1]);
    if (!(width > 200 && height > 200) || width * height > 60_000_000) continue;
    if (Number(about.match(/\/BitsPerComponent\s+(\d+)/)?.[1]) !== 8) continue;

    let start = stream + 6;
    if (bytes[start] === 0x0d) start += 1;
    if (bytes[start] === 0x0a) start += 1;
    const end = bytes.indexOf("endstream", start, "latin1");
    if (end < 0) return null;

    try {
      const data = inflateSync(bytes.subarray(start, end));
      const channels = data.length / (width * height);
      if (channels !== 1 && channels !== 3 && channels !== 4) continue;
      return { data, width, height, channels };
    } catch {
      /* Cut short or damaged. Try the next picture in the document. */
    }
  }
}

function pdf(bytes) {
  const source = bytes.toString("latin1");
  const xmp = (name) => source.match(new RegExp(`<${name}>([^<]+)</${name}>`))?.[1]?.trim() ?? null;

  const created = pdfDate(pdfText(source, "CreationDate"));
  const changed = pdfDate(pdfText(source, "ModDate"));
  const xmpCreated = stamp(xmp("xmp:CreateDate")?.replace("T", " "));

  return {
    version: source.match(/^%PDF-(\d\.\d)/)?.[1] ?? null,
    pages: (source.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length || null,
    madeWith: pdfText(source, "Creator") ?? xmp("xmp:CreatorTool"),
    savedWith: pdfText(source, "Producer") ?? xmp("pdf:Producer"),
    title: pdfText(source, "Title"),
    author: pdfText(source, "Author"),
    created: created ?? (xmpCreated ? { at: xmpCreated, offset: null } : null),
    changed,
  };
}

/**
 * Everything a file says about itself.
 *
 * Always returns: a file that is none of the three kinds comes back with
 * `kind: null` and a note saying so. `fingerprint` is the file's SHA-256, so
 * two copies of the same picture can be told from two pictures of the same
 * sheet.
 */
export function analyse(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input ?? []);
  const kind = kindOf(bytes);
  const out = {
    kind,
    size: bytes.length,
    fingerprint: createHash("sha256").update(bytes).digest("hex"),
    width: null,
    height: null,
    camera: null,
    taken: null,
    place: null,
    settings: null,
    document: null,
    inside: [],
    notes: [],
  };

  if (!kind) {
    out.notes.push("This is not a photograph or a document this can read. It takes .jpeg, .png and .pdf files.");
    return out;
  }

  try {
    if (kind === "pdf") {
      out.document = pdf(bytes);
      /* Each photograph inside is analysed as a photograph in its own right. */
      out.inside = picturesInside(bytes)
        .slice(0, 8)
        .map((picture) => analyse(picture));

      const best = out.inside.find((picture) => picture.camera || picture.taken || picture.place);
      if (best) Object.assign(out, { camera: best.camera, taken: best.taken, place: best.place, settings: best.settings });
      if (out.inside[0]) Object.assign(out, { width: out.inside[0].width, height: out.inside[0].height });

      if (!best) {
        out.notes.push(
          "This sheet was published as a scanned document with the camera's details removed, so the file cannot say what photographed it or where."
        );
      }
    } else {
      const read = kind === "jpeg" ? jpeg(bytes) : png(bytes);
      out.width = read.width;
      out.height = read.height;

      const note = read.note;
      if (note) {
        const has = (group) => Object.values(group ?? {}).some((value) => value !== null);
        out.camera = has(note.camera) ? note.camera : null;
        out.taken = has(note.taken) ? note.taken : null;
        out.place = note.place;
        out.settings = has(note.settings) ? note.settings : null;
      } else {
        out.notes.push(
          "This picture carries no camera details at all. That is normal for a picture that came through WhatsApp or was saved from a screen, which remove them."
        );
      }
    }
  } catch {
    out.notes.push("Part of this file could not be read, so some details may be missing.");
  }

  if (kind !== "pdf" || out.inside.length) {
    if ((out.camera || out.taken) && !out.place) out.notes.push("The device did not record where it was. Location was off, or it had no fix.");
    if (out.camera && !out.taken?.at) out.notes.push("The device did not record when the picture was taken.");
  }
  if (out.taken?.at && out.taken?.saved && out.taken.saved > out.taken.at) {
    out.notes.push("The file was saved again after the picture was taken, so it may have been edited or re-exported.");
  }
  if (/photoshop|gimp|lightroom|snapseed|picsart|canva/i.test(out.camera?.software ?? "")) {
    out.notes.push(`The file was last saved by an editing program (${out.camera.software}).`);
  }

  return out;
}

/** Metres between two points on the ground. */
export function metresBetween(a, b) {
  if (![a?.latitude, a?.longitude, b?.latitude, b?.longitude].every(Number.isFinite)) return null;
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(h)));
}
