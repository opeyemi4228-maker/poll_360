/**
 * Reading the sheets IReV publishes into figures.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE PORTAL PUBLISHES PAPER. THIS IS WHERE THE PAPER BECOMES NUMBERS.
 *
 *  Each sheet is fetched from the commission's own storage, handed to the
 *  same reader Poll360 uses for a sheet an agent photographs (lib/sheet-
 *  vision.js), and what comes back is kept beside the sheet in Data Bank: the
 *  voter figures, every party's votes, and whether the page was signed and
 *  stamped.
 *
 *  ── A READING IS KEPT WITH ITS OWN CHECK, NOT TRUSTED ON SIGHT ──────────
 *  `balanced` says the party figures add up to accredited less rejected.
 *  `code_matches` says the unit code written on the paper is the unit the
 *  portal filed it under. A reading that fails either is still kept — it is
 *  what the page said — but it is marked, and anything that totals these
 *  figures can choose to leave it out.
 *
 *  ── EVERY SHEET CAN BE READ, IN WHATEVER FORM IT WAS PUBLISHED ──────────
 *  Elections since late 2025 are photographs of about four megabytes, which
 *  are brought down to a size the reader takes without losing the handwriting.
 *  Earlier ones, 2023 included, are scanned documents and go to the reader as
 *  they are. Some from 2020 are no longer on the commission's storage at all;
 *  those are recorded as gone rather than tried forever.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { analyse, packedPageInside, picturesInside } from "../picture.js";
import { samePlace, whereIs } from "../place.js";
import { inTurn } from "./client.js";
import * as vault from "./vault.js";

/** Longest edge and quality: the same as a sheet an agent files (lib/shrink.js). */
const EDGE = 2400;
const QUALITY = 88;
/* Past this an image goes to the reader smaller, or not at all. */
const IMAGE_LIMIT = 3_500_000;
const PDF_LIMIT = 30_000_000;
/* A 2023 sheet is a document of up to eighteen megabytes on storage that is
   sometimes slow; a whole one is given a minute and a half. */
const FETCH_MS = 90_000;

/**
 * Why a sheet could not be fetched, in words.
 *
 * ── AN ADDRESS THAT WILL NOT RESOLVE IS NOT PROOF THE STORAGE IS GONE ──────
 * It was treated as one: a name that cannot be looked up, so the storage no
 * longer exists, so never ask again. Run against the 2023 election it wrote
 * off two sheets that were there all along — the machine's own connection
 * had failed to look the name up for a moment. From here the two cannot be
 * told apart, so neither is final: it is tried again, a handful of times and
 * behind everything else, and a storage that really has gone simply uses
 * those up.
 */
function unreachable(error) {
  if (error?.cause?.code === "ENOTFOUND" || error?.cause?.code === "EAI_AGAIN") {
    return { ok: false, reason: "the storage this sheet is on could not be found just now" };
  }
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return { ok: false, reason: "the commission's storage took too long to answer" };
  }
  return { ok: false, reason: "the commission's storage could not be reached" };
}

export function kindOf(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  return null;
}

/** Fetch one sheet. Never throws: a sheet that is not there is an answer. */
export async function fetchSheet(url, { fetcher = fetch, timeoutMs = FETCH_MS } = {}) {
  try {
    const answer = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (answer.status === 404 || answer.status === 403 || answer.status === 410) {
      return { ok: false, gone: true, reason: "the sheet is no longer on the commission's storage" };
    }
    if (!answer.ok) return { ok: false, reason: `the commission's storage answered ${answer.status}` };

    const bytes = Buffer.from(await answer.arrayBuffer());
    const kind = kindOf(bytes);
    if (!kind) return { ok: false, gone: true, reason: "what is stored there is not a sheet" };
    return { ok: true, bytes, kind };
  } catch (error) {
    return unreachable(error);
  }
}

/* Every reader takes a photograph this size; the basic one refuses more. */
const READER_LIMIT = 1_300_000;

/**
 * A photograph, brought down until it is under the readers' limit. Sharpness
 * is given up before size, and only as much of either as it takes.
 */
async function shrink(sharp, picture) {
  let smaller = null;
  for (const [edge, quality] of [[EDGE, QUALITY], [EDGE, 76], [2000, 76], [1700, 70]]) {
    smaller = await picture
      .clone()
      .rotate()
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    if (smaller.length <= READER_LIMIT) break;
  }
  return smaller;
}

/**
 * Bring a sheet down to a photograph every reader takes.
 *
 * A scanned document is a picture wrapped in a document, and it is unwrapped
 * here whichever way it was stored: as a photograph, which is lifted straight
 * out, or packed, which is unpacked into one. Only a document that is neither
 * is passed on as it is, and only the handwriting reader can take that.
 */
export async function fit(bytes, kind) {
  if (kind === "pdf") {
    const [page] = picturesInside(bytes);
    if (page && page.length > 100_000) return fit(page, "jpeg");

    const packed = packedPageInside(bytes);
    if (packed) {
      try {
        const { default: sharp } = await import("sharp");
        const { data, width, height, channels } = packed;
        return { ok: true, bytes: await shrink(sharp, sharp(data, { raw: { width, height, channels } })) };
      } catch {
        /* Fall through to handing the document over whole. */
      }
    }
    return bytes.length > PDF_LIMIT
      ? { ok: false, reason: "the document is too large to read" }
      : { ok: true, bytes, document: true };
  }

  try {
    const { default: sharp } = await import("sharp");
    return { ok: true, bytes: await shrink(sharp, sharp(bytes)) };
  } catch {
    /* No image library on this machine. A small enough photograph still goes. */
    return bytes.length <= IMAGE_LIMIT
      ? { ok: true, bytes }
      : { ok: false, reason: "the photograph is too large and could not be made smaller" };
  }
}

const digits = (value) => String(value ?? "").replace(/\D/g, "");

/** Every party row that carried a figure, by the name printed against it. */
function partyVotes(read) {
  const votes = {};
  for (const [party, value] of Object.entries(read.figures?.votes ?? {})) {
    if (value !== null && value !== undefined) votes[party] = value;
  }
  /* Parties the product has no box for arrive as "NAME 12". */
  for (const entry of read.folded ?? []) {
    const [, party, value] = String(entry).match(/^(.+)\s(\d+)$/) ?? [];
    if (party) votes[party] = (votes[party] ?? 0) + Number(value);
  }
  return votes;
}

/** A reader's answer for one sheet, as the row kept in Data Bank. */
export function readingRow(sheet, read) {
  const base = {
    election_id: sheet.election_id,
    unit_id: sheet.unit_id,
    pu_code: sheet.pu_code,
    sheet_url: sheet.sheet_url,
    attempts: (sheet.attempts ?? 0) + 1,
  };

  if (!read.ok) {
    /* Gone will not come back; unreadable is this reader's limit and not worth
       repeating; anything else is tried again. */
    const status = read.gone ? "gone" : read.unreadable ? "unreadable" : "failed";
    return { ...base, status, problems: read.reason ?? null };
  }

  const parsed = read.parsed ?? {};
  const votes = partyVotes(read);
  const found = Object.keys(votes).length > 0 || parsed.accredited != null;
  const written = digits(parsed.unitCode);
  const usage = read.usage ?? null;

  return {
    ...base,
    status: found ? "read" : "unreadable",
    balanced: found ? Boolean(parsed.balanced) : null,
    problems: parsed.problems?.length ? parsed.problems.join("; ") : null,
    code_on_sheet: parsed.unitCode ?? null,
    code_matches: written ? written === digits(sheet.pu_code) : null,
    registered: parsed.registered ?? null,
    accredited: parsed.accredited ?? null,
    rejected: parsed.rejected ?? null,
    valid_votes: found ? (parsed.sum ?? null) : null,
    stated_valid: parsed.statedValid ?? null,
    party_votes: found ? votes : null,
    legibility: read.legibility ?? null,
    signature: parsed.certification?.signature ?? null,
    stamp: parsed.certification?.stamp ?? null,
    alteration: parsed.certification?.alteration ?? null,
    reader: read.reader ?? null,
    tokens_in: usage
      ? (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
      : null,
    tokens_out: usage?.output_tokens ?? null,
  };
}

/** Fetch, fit and read one sheet, and keep what came back. */
export async function readOne(db, sheet, { readSheet, fetcher = fetch, fetchMs = FETCH_MS }) {
  let read = await fetchSheet(sheet.sheet_url, { fetcher, timeoutMs: fetchMs });
  if (read.ok) {
    const fitted = await fit(read.bytes, read.kind);
    read = fitted.ok ? await readSheet(fitted.bytes, { document: Boolean(fitted.document) }) : fitted;

    /* ── THE READER'S TROUBLE IS NOT THE SHEET'S ──────────────────────────
       A reader that is over its daily allowance, busy, or refusing its key
       fails every sheet it is shown, for a reason that has nothing to do
       with any of them. Recorded against the sheets, that would use up each
       one's three attempts in a minute and leave a whole election marked
       unreadable by the time the allowance came back. So nothing is written:
       the sheet stays waiting, and the caller is told to stop asking. */
    if (fitted.ok && !read.ok && !read.gone && !read.unreadable && READER_TROUBLE.test(read.reason ?? "")) {
      return { status: "paused", problems: read.reason };
    }
  }

  const row = readingRow(sheet, read);
  await vault.saveReading(db, row);
  return row;
}

const READER_TROUBLE = /busy|refused|did not answer in time|limit|maximum|number of times|too many|not set|quota/i;

/**
 * Read up to `limit` of an election's waiting sheets, a few at a time.
 *
 * `limit` is the spending control. The reader costs money for every sheet it
 * is shown, so nothing here reads "all of them" by default: a caller says how
 * many, and the tokens each reading used are kept so the cost of the next
 * thousand is a measured figure and not a guess.
 */
export async function readSome(db, electionId, { limit = 20, atOnce = 3, until = Infinity, readSheet, fetcher = fetch, fetchMs = FETCH_MS, said = () => {} }) {
  const waiting = await vault.sheetsToRead(db, electionId, limit);
  const total = { read: 0, balanced: 0, unreadable: 0, gone: 0, failed: 0, tokensIn: 0, tokensOut: 0, paused: null };

  await inTurn(
    waiting,
    async (sheet) => {
      /* Once the reader is in trouble the rest of the batch is left alone. */
      if (total.paused) return;
      const row = await readOne(db, sheet, { readSheet, fetcher, fetchMs });
      if (row.status === "paused") {
        total.paused = row.problems;
        return;
      }
      total[row.status] += 1;
      if (row.balanced) total.balanced += 1;
      total.tokensIn += row.tokens_in ?? 0;
      total.tokensOut += row.tokens_out ?? 0;
      said({ ...total, of: waiting.length });
    },
    { atOnce, until }
  );

  if (waiting.length) await vault.settle(db);
  return { ...total, tried: total.read + total.unreadable + total.gone + total.failed };
}

/* ══════════════════════════════════════════════════════════════════════════
   WHAT EACH SHEET'S OWN FILE SAYS

   The device that photographed a sheet wrote into the file when it did so,
   what it was, and — since late 2025 — the spot it was standing on. That note
   sits at the very start of the file, so it is read by asking the
   commission's storage for the first part only: a fraction of a second and a
   few hundred kilobytes a sheet, where fetching the whole photograph would be
   four megabytes. It costs nothing, so it is done for every gathered sheet
   without being asked.
   ══════════════════════════════════════════════════════════════════════════ */

const HEAD = 262_144;
const HEAD_MS = 20_000;

/** The first part of a sheet's file. Never throws. */
export async function fetchHead(url, { fetcher = fetch } = {}) {
  try {
    const answer = await fetcher(url, {
      headers: { range: `bytes=0-${HEAD - 1}` },
      /* A quarter of a megabyte. If that takes this long it is not coming. */
      signal: AbortSignal.timeout(HEAD_MS),
    });
    if (answer.status === 404 || answer.status === 403 || answer.status === 410) {
      return { ok: false, gone: true, reason: "the sheet is no longer on the commission's storage" };
    }
    if (!answer.ok) return { ok: false, reason: `the commission's storage answered ${answer.status}` };

    let bytes = Buffer.from(await answer.arrayBuffer()).subarray(0, HEAD * 4);
    const stored = Date.parse(answer.headers?.get?.("last-modified") ?? "");

    /* A document keeps its own record — what made it, and when — at its very
       end. One more small request, and only for a document. */
    if (kindOf(bytes) === "pdf" && bytes.length >= HEAD) {
      const tail = await fetcher(url, { headers: { range: "bytes=-6000" }, signal: AbortSignal.timeout(HEAD_MS) }).catch(() => null);
      if (tail?.ok) bytes = Buffer.concat([bytes, Buffer.from(await tail.arrayBuffer()).subarray(-6000)]);
    }

    return { ok: true, bytes, storedAt: Number.isNaN(stored) ? null : new Date(stored).toISOString() };
  } catch (error) {
    return unreachable(error);
  }
}

/** Days from polling day to the day the file says, counted in Lagos time. */
function daysFromPoll(analysis, heldOn) {
  const satellite = analysis.place?.satelliteTime;
  /* The satellites keep world time; Nigeria is an hour ahead of it. */
  const day = satellite
    ? new Date(Date.parse(`${satellite.replace(" ", "T")}Z`) + 3600000).toISOString().slice(0, 10)
    : (analysis.taken?.at?.slice(0, 10) ?? null);
  if (!day || !heldOn) return null;
  const days = Math.round((Date.parse(day) - Date.parse(String(heldOn).slice(0, 10))) / 86400000);
  return Number.isFinite(days) ? days : null;
}

/**
 * When the commission's system received a sheet, from the two places it is
 * written down.
 *
 * A scanned document was made by the commission's server at the moment the
 * sheet arrived, and says when, in world time. A photograph has no such
 * record, but the storage it sits on notes when the file landed. That second
 * one is only believed close to polling day: the commission moved its 2023
 * files to new storage in late 2024, and every one of them now carries the
 * day of the move.
 */
function receivedAt(found, storedAt, heldOn) {
  const made = found.document?.created?.at;
  if (made) return `${made.replace(" ", "T")}Z`;
  if (!storedAt) return null;
  if (!heldOn) return storedAt;
  const days = (Date.parse(storedAt) - Date.parse(String(heldOn).slice(0, 10))) / 86400000;
  return days > -2 && days < 60 ? storedAt : null;
}

/** An analysis of one sheet's file, as the row kept in Data Bank. */
export async function pictureRow(sheet, got, { heldOn = null, state = null, locate = whereIs } = {}) {
  const base = {
    election_id: sheet.election_id,
    unit_id: sheet.unit_id,
    pu_code: sheet.pu_code,
    sheet_url: sheet.sheet_url,
    attempts: (sheet.attempts ?? 0) + 1,
  };
  if (!got.ok) return { ...base, status: got.gone ? "gone" : "failed", notes: got.reason ?? null };

  const found = analyse(got.bytes);
  const place = found.place;
  const where = place ? await locate(place.latitude, place.longitude) : null;

  return {
    ...base,
    status: "examined",
    kind: found.kind,
    device_make: found.camera?.make ?? null,
    device_model: found.camera?.model ?? null,
    software: found.camera?.software ?? null,
    taken_at: found.taken?.at ?? null,
    satellite_at: place?.satelliteTime ? `${place.satelliteTime.replace(" ", "T")}Z` : null,
    latitude: place?.latitude ?? null,
    longitude: place?.longitude ?? null,
    altitude: place?.altitude ?? null,
    taken_state: where?.state ?? null,
    taken_lga: where?.lga ?? null,
    /* Only a different state is called wrong. The boundaries are drawn
       coarsely, and a collation centre one local government over is ordinary. */
    place_ok: where && state ? samePlace(where.state, state) : null,
    days_from_poll: daysFromPoll(found, heldOn),
    width: found.width,
    height: found.height,
    saved_with: found.document?.savedWith ?? null,
    document_at: found.document?.created?.at ?? null,
    /* When the commission's own system received the sheet. Not when it was
       photographed — but it is a time the commission wrote, and for a sheet
       whose camera details were removed it is the only one there is. */
    stored_at: receivedAt(found, got.storedAt, heldOn),
    notes: found.notes.join(" ") || null,
  };
}

/** Look at one sheet's file now, and keep what it says. */
export async function examineUnit(db, election, sheet, { fetcher = fetch } = {}) {
  const row = await pictureRow(sheet, await fetchHead(sheet.sheet_url, { fetcher }), {
    heldOn: election.held_on,
    state: sheet.state_name ?? election.state_name ?? null,
  });
  await vault.savePicture(db, row);
  return row;
}

/** Look at the files of up to `limit` of an election's sheets. */
export async function examineSome(db, election, { limit = 40, atOnce = 6, until = Infinity, fetcher = fetch } = {}) {
  const waiting = await vault.sheetsToExamine(db, election.election_id, limit);
  if (waiting.length === 0) return { examined: 0, tried: 0 };

  const states = new Map((await vault.lgas(db, election.election_id)).map((lga) => [lga.lga_id, lga.state_name]));
  let examined = 0;
  let tried = 0;

  const lost = await inTurn(
    waiting,
    async (sheet) => {
      tried += 1;
      const row = await pictureRow(sheet, await fetchHead(sheet.sheet_url, { fetcher }), {
        heldOn: election.held_on,
        state: states.get(sheet.lga_id) ?? election.state_name ?? null,
      });
      await vault.savePicture(db, row);
      if (row.status === "examined") examined += 1;
    },
    { atOnce, until }
  );

  /* A sheet that cannot be fetched is recorded as such above. Anything that
     throws is a fault on this side, and is said out loud. */
  if (lost.length && examined === 0) throw lost[0].error;

  return { examined, tried };
}
