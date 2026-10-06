/**
 * Which reader turns an INEC sheet into figures, and the basic one's rules.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO READERS, AND THE WEAKER ONE IS HELD TO THE SHEET'S OWN ARITHMETIC
 *
 *  The handwriting reader (lib/sheet-claude.js) reads a presiding officer's
 *  figures properly and is used whenever its key is set.
 *
 *  Without it there is the optical reader, which hands back a page of text.
 *  Tried on real sheets from the portal it read a five-party bye-election
 *  sheet nearly whole and made nonsense of a sixteen-party governorship one,
 *  so it cannot be believed on its own word. But Form EC8A checks itself:
 *  every party's votes are written twice, in figures and in words, and the
 *  officer writes the total of all of them in a box of its own. So:
 *
 *    · a party's figure is taken where the figures and the words agree, or
 *      where only one of the two could be read;
 *    · the reading is marked as adding up only when the party figures sum to
 *      the total valid votes the officer wrote.
 *
 *  A reading that passes that is as good as the paper's own arithmetic. One
 *  that does not is kept, plainly marked, and never held against anything —
 *  see lib/irev/compare.js.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { readImage, readSheet, reader as configured, wordsToNumber } from "../sheet-vision.js";

/** Every party INEC has printed on a result sheet in the elections it publishes. */
const PARTIES = new Set([
  "A", "AA", "AAC", "ADC", "ADP", "APC", "APGA", "APM", "APP", "BP", "BOOT", "LP", "NDC",
  "NNPP", "NRM", "PDP", "PRP", "SDP", "YP", "YPP", "ZLP",
]);

/* Letters an optical reader returns from another alphabet for the same shape. */
const LOOKALIKE = { А: "A", В: "B", С: "C", Е: "E", Н: "H", К: "K", М: "M", О: "O", Р: "P", Т: "T", Х: "X", У: "Y" };

const latin = (text) => String(text ?? "").replace(/[АВСЕНКМОРТХУ]/g, (letter) => LOOKALIKE[letter]);

/** A cell that is a whole number and nothing else, or null. "06" is six. */
function figure(cell) {
  const text = String(cell ?? "").trim();
  return /^\d{1,5}$/.test(text) ? Number(text) : null;
}

/**
 * The numbered boxes at the head of the form. A box's figure is the last
 * number on its line, or the line below where the reader broke it there.
 */
function boxes(lines) {
  const found = {};
  lines.forEach((cells, index) => {
    const box = cells.join(" ").match(/^#?\s*([1-8])[.\s]+\s*(?:Total\s+)?Number of/i)?.[1];
    if (!box) return;

    const here = cells.slice(1).map(figure).filter((value) => value !== null);
    const below = lines[index + 1] ?? [];
    const next = below.length === 1 ? figure(below[0]) : null;
    const value = here.length ? here.at(-1) : next;
    if (value !== null) found[box] = value;
  });
  return found;
}

/**
 * The page of text an optical reader returned, as figures.
 *
 * Returns the same shape the handwriting reader's answer has, so nothing
 * after this point knows which one ran.
 */
export function figuresFromText(text) {
  const lines = latin(text)
    .split(/\r?\n/)
    .map((line) => line.split("\t").map((cell) => cell.trim()).filter(Boolean))
    .filter((cells) => cells.length);

  const box = boxes(lines);
  const votes = {};
  const doubted = [];
  let stated = box["7"] ?? null;

  for (const cells of lines) {
    if (/^TOTAL VALID VOTES/i.test(cells[0])) {
      const total = cells.slice(1).map(figure).find((value) => value !== null);
      if (total !== undefined) stated = stated ?? total;
      continue;
    }

    const at = cells.findIndex((cell) => PARTIES.has(cell.toUpperCase()));
    if (at < 0 || at > 1) continue;
    const party = cells[at].toUpperCase();
    if (party in votes) continue;

    const rest = cells.slice(at + 1);
    const inFigures = figure(rest[0]);
    const inWords = wordsToNumber(rest.slice(inFigures === null ? 0 : 1).join(" "));

    if (inFigures !== null && inWords !== null && inFigures !== inWords) {
      /* The figures and the words disagree. The figures are kept, because a
         reader mangles words more often than digits, and the row is named. */
      doubted.push(party);
      votes[party] = inFigures;
    } else if (inFigures !== null || inWords !== null) {
      votes[party] = inFigures ?? inWords;
    }
  }

  const sum = Object.values(votes).reduce((total, value) => total + value, 0);
  const read = Object.keys(votes).length;
  const balanced = read > 0 && stated !== null && sum === stated && sum > 0;

  const problems = [];
  if (read === 0) problems.push("no party's figure could be made out");
  else if (stated === null) problems.push("the sheet's total valid votes could not be made out, so the party figures cannot be checked");
  else if (!balanced) problems.push(`the party figures read add up to ${sum}, and the sheet's own total says ${stated}`);
  if (doubted.length && !balanced) problems.push(`figures and words disagree for ${doubted.join(", ")}`);

  return {
    figures: { votes },
    folded: [],
    parsed: {
      unitCode: null,
      registered: box["1"] ?? null,
      accredited: box["2"] ?? null,
      rejected: box["6"] ?? null,
      statedValid: stated,
      sum,
      balanced,
      problems,
      certification: null,
    },
  };
}

/**
 * The reader to use for INEC's sheets: `{ name, strong, read(bytes) }`, or
 * null where this deployment has none that can read handwriting at all.
 */
export function inecReader() {
  const which = configured();

  if (which === "claude") {
    /* It reads a document as readily as a photograph, so it is not told which. */
    return { name: "claude", strong: true, read: (bytes) => readSheet(bytes) };
  }

  if (which === "ocrspace" || which === "google") {
    return {
      name: which,
      strong: false,
      async read(bytes, { document = false } = {}) {
        if (document) {
          return { ok: false, gone: false, unreadable: true, reason: "this sheet is a document the basic reader cannot open; the handwriting reader can" };
        }
        const got = await readImage(bytes);
        if (!got.ok) {
          /* The service's own codes mean nothing to the person reading this. */
          const reason = /^Error E\d+|E\d{3}:/.test(got.reason ?? "")
            ? "the basic reader could not process this picture"
            : got.reason;
          return { ...got, reason };
        }
        return { ok: true, reader: which, legibility: null, usage: null, ...figuresFromText(got.text) };
      },
    };
  }

  return null;
}
