import { parties } from "./election2023.js";
import { parseUnitCode } from "./units.js";

/**
 * Reading the result sheet from a photograph.
 *
 * ── WHAT THIS DOES AND, MORE IMPORTANTLY, WHAT IT NEVER DOES ───────────────
 * It reads an EC8A with Google Cloud Vision and proposes figures. It does not
 * file them. Nothing that comes out of here reaches the count until the agent
 * standing in front of the sheet has read the numbers back and confirmed
 * them, because optical character recognition confuses 3 and 8, 1 and 7, and
 * 0 and 6 on a creased form photographed under a torch, and a count that
 * accepted its own guess would be worse than no automation at all.
 *
 * What it is genuinely for is speed and typing errors. Filing a unit by hand
 * is eleven numbers typed into a phone in the dark. Reading them off the
 * photograph and asking "is this right" turns eleven chances to mistype into
 * one chance to disagree, and it keeps the photograph, the reading and the
 * confirmed figures side by side afterwards so the difference between them is
 * auditable.
 *
 * ── WITHOUT A KEY IT DEGRADES, IT DOES NOT BREAK ───────────────────────────
 * No API key means `available` is false and the bot simply asks its questions
 * the way it always did. The channel never depends on this.
 * ───────────────────────────────────────────────────────────────────────────
 */

const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

export function visionAvailable() {
  return Boolean(process.env.GOOGLE_VISION_API_KEY);
}

/**
 * Send an image and get its text back.
 *
 * DOCUMENT_TEXT_DETECTION rather than TEXT_DETECTION: the first is built for
 * dense structured documents and keeps the line and block structure, which is
 * the whole basis of the parsing below. The second returns a bag of words, and
 * a bag of words cannot tell you which number belongs to which party.
 */
export async function readImage(bytes) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) return { ok: false, reason: "GOOGLE_VISION_API_KEY is not set" };

  try {
    const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: Buffer.from(bytes).toString("base64") },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            /* English, and the hint matters: without it the reader will
               occasionally decide a column of Nigerian party initials is
               another script and return nothing useful. */
            imageContext: { languageHints: ["en"] },
          },
        ],
      }),
    });

    if (!response.ok) return { ok: false, reason: `Vision returned ${response.status}` };

    const body = await response.json();
    const annotation = body.responses?.[0];
    if (annotation?.error) return { ok: false, reason: annotation.error.message };

    const text = annotation?.fullTextAnnotation?.text ?? "";
    if (!text) return { ok: false, reason: "no text found in the image" };

    return { ok: true, text, confidence: pageConfidence(annotation) };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

/** Vision reports confidence per word. The page's is the mean of them. */
function pageConfidence(annotation) {
  const words = [];
  for (const page of annotation?.fullTextAnnotation?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          if (typeof word.confidence === "number") words.push(word.confidence);
        }
      }
    }
  }
  if (!words.length) return null;
  return words.reduce((sum, value) => sum + value, 0) / words.length;
}

/* ── parsing ──────────────────────────────────────────────────────────────── */

/**
 * Characters a reader confuses on a photographed form, corrected only inside
 * a field we already know is numeric. Applying this to free text would turn
 * names into gibberish; applying it to a figure recovers most misreads.
 */
function toNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const fixed = String(raw)
    .replace(/[Oo]/g, "0")
    .replace(/[lI|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[^0-9]/g, "");
  if (!fixed) return null;
  const value = Number(fixed);
  return Number.isFinite(value) ? value : null;
}

/**
 * The last figure on a line.
 *
 * ── WHY TOKENS AND NOT A DIGIT REGEX ───────────────────────────────────────
 * A digit regex run over "APC 16O" stops at the letter and returns 16, which
 * is a wrong number that looks entirely reasonable and would be filed. So the
 * line is split into words instead, words with no digit in them at all are
 * dropped as label text, and whatever survives is corrected for the
 * characters a reader confuses. "16O" keeps its shape and becomes 160;
 * "VOTERS" has no digit and is never considered.
 */
function lastFigure(line) {
  const tokens = String(line)
    .split(/[\s:|]+/)
    .filter((token) => /[0-9]/.test(token))
    /* A date or a form reference is not a figure. */
    .filter((token) => !/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(token));

  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const value = toNumber(tokens[index]);
    if (value !== null) return value;
  }
  return null;
}

/* Which figures a return cannot do without. The rest are corroboration: nice
   to have, and never a reason to reject a reading that is otherwise sound. */
const REQUIRED = new Set(["accredited"]);

const LABELS = {
  registered: [/registered\s*voters?/i, /no\.?\s*of\s*registered/i, /reg(istered)?\s*vot/i],
  accredited: [/accredited\s*voters?/i, /no\.?\s*of\s*accredited/i, /accredit/i],
  rejected: [/rejected\s*ballots?/i, /no\.?\s*of\s*rejected/i, /invalid\s*ballots?/i],
  valid: [/total\s*valid\s*votes?/i, /valid\s*votes?/i],
  total: [/total\s*votes?\s*cast/i, /ballots?\s*(papers?\s*)?used/i],
};

const OFFICER = [
  /presiding\s*officer'?s?\s*name\s*[:\-]?\s*(.+)/i,
  /name\s*of\s*presiding\s*officer\s*[:\-]?\s*(.+)/i,
  /po\s*name\s*[:\-]?\s*(.+)/i,
];

const UNIT_LABEL = [
  /polling\s*unit\s*(code|no|number)?\s*[:\-]?\s*([0-9][0-9\s\-\/]{6,})/i,
  /pu\s*code\s*[:\-]?\s*([0-9][0-9\s\-\/]{6,})/i,
];

/**
 * Turn the page's text into the figures a return is made of.
 *
 * ── LOOK ON THE LINE, THEN THE NEXT ONE ────────────────────────────────────
 * On a printed form the label and its box are usually on one line, but a
 * reader that has found a table will often emit the label and the figure as
 * two lines. So each label is searched on its own line first and on the
 * following line second. That single rule is the difference between reading
 * most real sheets and reading almost none.
 */
export function parseSheet(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const found = {};
  const missing = [];

  const figureFor = (patterns) => {
    for (const [index, line] of lines.entries()) {
      if (!patterns.some((pattern) => pattern.test(line))) continue;
      /* The figure on the label's own line, taking the last one, because the
         line often opens with an item number the form printed. */
      const own = lastFigure(line);
      if (own !== null) return own;

      const next = lastFigure(lines[index + 1] ?? "");
      if (next !== null) return next;
    }
    return null;
  };

  for (const [key, patterns] of Object.entries(LABELS)) {
    const value = figureFor(patterns);
    if (value === null) {
      if (REQUIRED.has(key)) missing.push(key);
    } else {
      found[key] = value;
    }
  }

  /* Party figures. The initials are unambiguous on the form and are the one
     thing a reader almost never gets wrong, so they anchor the row. */
  const votes = [];
  for (const party of parties) {
    const pattern = new RegExp(`\\b${party.id}\\b`, "i");
    let value = null;

    for (const [index, line] of lines.entries()) {
      if (!pattern.test(line)) continue;
      value = lastFigure(line.replace(pattern, " "));
      if (value === null) value = lastFigure(lines[index + 1] ?? "");
      if (value !== null) break;
    }

    /* A party with no figure is a hole in the return, not a zero, so it is
       always reported. A real zero is written on the sheet as a zero. */
    if (value === null) missing.push(party.id);
    votes.push(value ?? 0);
  }

  /* The presiding officer, kept as written. This is a person's name and the
     numeric corrections above must never touch it. */
  let repName = null;
  for (const line of lines) {
    for (const pattern of OFFICER) {
      const hit = line.match(pattern);
      if (hit?.[1]) {
        repName = hit[1].replace(/[^A-Za-z .'\-]/g, "").trim() || null;
        if (repName) break;
      }
    }
    if (repName) break;
  }

  let unitCode = null;
  for (const line of lines) {
    for (const pattern of UNIT_LABEL) {
      const hit = line.match(pattern);
      const candidate = parseUnitCode(hit?.[2] ?? hit?.[1] ?? "");
      if (candidate) {
        unitCode = candidate.code;
        break;
      }
    }
    if (unitCode) break;
  }

  return checked({
    unitCode,
    repName,
    registered: found.registered ?? null,
    accredited: found.accredited ?? null,
    rejected: found.rejected ?? 0,
    votes,
    missing,
  });
}

/**
 * Does the reading hold together on its own terms?
 *
 * ── THE ARITHMETIC IS THE REAL CONFIDENCE SCORE ────────────────────────────
 * The reader's own confidence tells you how clear the image was, which is not
 * the same question as whether it read the right numbers. A sheet where the
 * party votes add up to the valid total is almost certainly read correctly,
 * whatever the image quality, and one where they do not is wrong somewhere
 * however crisp the photograph. So the checks below decide whether to trust
 * it, and they are shown to the agent rather than hidden.
 */
function checked(read) {
  const problems = [];
  const sum = read.votes.reduce((total, value) => total + (value ?? 0), 0);

  if (read.accredited === null) problems.push("could not find the accredited figure");
  if (read.registered !== null && read.accredited !== null && read.accredited > read.registered) {
    problems.push("accredited is higher than registered");
  }
  if (read.accredited !== null) {
    const countable = read.accredited - (read.rejected ?? 0);
    if (sum > countable) problems.push(`the party figures add up to ${sum}, more than the ${countable} countable`);
  }
  if (read.missing.length) {
    problems.push(`could not read ${read.missing.join(", ")}`);
  }

  const balanced =
    read.accredited !== null && sum > 0 && sum === read.accredited - (read.rejected ?? 0);

  return {
    ...read,
    sum,
    balanced,
    problems,
    /* Trusted enough to propose. Never enough to file: that is the agent's. */
    usable: read.accredited !== null && sum > 0 && problems.length === 0,
  };
}
