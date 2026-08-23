import os from "node:os";
import path from "node:path";
import { parties } from "./election2023.js";
import { parseUnitCode } from "./units.js";

/**
 * Reading the result sheet from a photograph.
 *
 * ── WHAT THIS DOES AND, MORE IMPORTANTLY, WHAT IT NEVER DOES ───────────────
 * It reads an EC8A and proposes figures. It does not file them. Nothing that
 * comes out of here reaches the count until the agent standing in front of
 * the sheet has read the numbers back and confirmed them, because optical
 * character recognition confuses 3 and 8, 1 and 7, and 0 and 6 on a creased
 * form photographed under a torch, and a count that accepted its own guess
 * would be worse than no automation at all.
 *
 * What it is genuinely for is speed and typing errors. Filing a unit by hand
 * is eleven numbers typed into a phone in the dark. Reading them off the
 * photograph and asking "is this right" turns eleven chances to mistype into
 * one chance to disagree, and it keeps the photograph, the reading and the
 * confirmed figures side by side afterwards so the difference between them is
 * auditable.
 *
 * ── TWO READERS, AND NOTHING DOWNSTREAM KNOWS WHICH ONE RAN ────────────────
 * There are two ways of turning a photograph into text here. Everything after
 * that point — the parsing, the arithmetic, the agent's confirmation, what is
 * written to the record — is identical whichever one did the work:
 *
 *   local    Tesseract, running inside this process. No account, no key, no
 *            bill, and no photograph leaves the building. It is good at
 *            printed figures and only fair at handwriting, and most of what
 *            matters on an EC8A is handwritten, so it will hand back a
 *            reading the arithmetic rejects more often than the hosted one
 *            does. A rejected reading is not a wrong count — it is the bot
 *            asking its questions, which is what it did before any of this
 *            existed.
 *
 *   google   Google Cloud Vision. Costs money and wants a key, and is
 *            markedly better on a handwritten form photographed badly.
 *
 * Setting GOOGLE_VISION_API_KEY is the whole switchover. Nothing else in the
 * codebase changes and no sheet already read has to be read again. Each
 * reading carries a `reader` field naming the one that produced it, so a
 * caller that wants to measure the difference the key made has it to hand.
 *
 * SHEET_READER overrides the choice — `google`, `local`, or `off` to go back
 * to a bot that only ever asks its questions.
 *
 * ── WITHOUT A READER IT DEGRADES, IT DOES NOT BREAK ────────────────────────
 * Every failure here ends the same way: `ok` is false, a reason is given in
 * plain words, and the bot asks its questions. No reader configured, a
 * language file that would not download, a page of text that makes no sense,
 * a worker that fell over — the channel never depends on any of it.
 * ───────────────────────────────────────────────────────────────────────────
 */

const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

/* A photograph that cannot be read in this long will not be read at all, and
   somebody is standing in a schoolyard waiting for a reply. Failing at a time
   we choose is better than failing at whatever timeout the host imposes,
   because only one of those two can say something useful afterwards. */
const TIMEOUT_MS = Number(process.env.SHEET_READER_TIMEOUT_MS ?? 25_000);

/**
 * Which reader this deployment is using, or null for none.
 *
 * The key decides it. That is deliberate: switching to the hosted reader is
 * an act of configuration rather than of deployment, and it can be done and
 * undone on an election night by somebody who is not a programmer.
 */
export function reader() {
  const forced = String(process.env.SHEET_READER ?? "").trim().toLowerCase();
  if (forced === "off" || forced === "none") return null;
  if (forced === "google") return "google";
  if (forced === "local" || forced === "tesseract") return "local";
  return process.env.GOOGLE_VISION_API_KEY ? "google" : "local";
}

export function visionAvailable() {
  return reader() !== null;
}

/** Send an image and get its text back, by whichever reader is configured. */
export async function readImage(bytes) {
  const which = reader();
  if (!which) return { ok: false, reason: "sheet reading is switched off" };
  return which === "google" ? readWithGoogle(bytes) : readWithLocal(bytes);
}

/* ── the hosted reader ────────────────────────────────────────────────────── */

/**
 * DOCUMENT_TEXT_DETECTION rather than TEXT_DETECTION: the first is built for
 * dense structured documents and keeps the line and block structure, which is
 * the whole basis of the parsing below. The second returns a bag of words, and
 * a bag of words cannot tell you which number belongs to which party.
 */
async function readWithGoogle(bytes) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) return { ok: false, reason: "GOOGLE_VISION_API_KEY is not set" };

  try {
    const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
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

    return { ok: true, text, reader: "google", confidence: pageConfidence(annotation) };
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

/* ── the local reader ─────────────────────────────────────────────────────── */

/**
 * One worker, kept alive between sheets.
 *
 * Standing a worker up costs a couple of seconds and a collation centre sends
 * photographs in a stream rather than one at a time, so the first sheet pays
 * for the rest. Pages are put through it one after another because the worker
 * is a single thread: handing it two at once makes both slower rather than
 * either of them sooner.
 */
let workerPromise = null;

async function localWorker() {
  if (workerPromise) return workerPromise;

  /* Imported here rather than at the top of the file so a deployment using
     the hosted reader never pays to load a WebAssembly engine it will not
     call, and so a broken install fails at the first photograph rather than
     at boot, where it would take the whole channel with it. */
  workerPromise = (async () => {
    const { createWorker, OEM, PSM } = await import("tesseract.js");
    const worker = await createWorker("eng", OEM.LSTM_ONLY, {
      /* The English model is about ten megabytes, fetched once and then kept.
         The default is to keep it in the working directory, which on a
         serverless host is read-only — so it must be told somewhere writable
         or every single sheet pays the download again. */
      cachePath: process.env.SHEET_READER_CACHE ?? os.tmpdir(),
      /* For an installation with no outbound internet: point this at a
         directory holding eng.traineddata and nothing is fetched at all. */
      ...(process.env.SHEET_READER_LANG_PATH
        ? { langPath: path.resolve(process.env.SHEET_READER_LANG_PATH) }
        : {}),
    });

    await worker.setParameters({
      /* A result sheet is a table, not a paragraph. Automatic segmentation
         keeps the rows apart, and the parsing below is built entirely on the
         assumption that a label and its figure share a line or sit on two
         consecutive ones. */
      tessedit_pageseg_mode: PSM.AUTO,
      /* Without this the reader collapses the run of spaces between a party's
         initials and its figure, and "APC 160" arrives as one token. */
      preserve_interword_spaces: "1",
    });

    return worker;
  })().catch((error) => {
    workerPromise = null;
    throw error;
  });

  return workerPromise;
}

/** A worker that has fallen over stays fallen over. Throw it away. */
async function discardWorker() {
  const dying = workerPromise;
  workerPromise = null;
  try {
    (await dying)?.terminate?.();
  } catch {
    /* It was already broken. That was the point. */
  }
}

/* Pages go through the single worker in the order they arrive. Each link in
   the chain runs whether the one before it succeeded or failed, so one
   unreadable photograph cannot stall the queue behind it. */
let queue = Promise.resolve();

function enqueue(job) {
  const result = queue.then(job, job);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function withTimeout(promise, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), TIMEOUT_MS);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function readWithLocal(bytes) {
  try {
    const data = await enqueue(async () => {
      const worker = await localWorker();
      const { data } = await withTimeout(
        worker.recognize(Buffer.from(bytes)),
        "the picture took too long to read",
      );
      return data;
    });

    const text = String(data?.text ?? "").trim();
    if (!text) return { ok: false, reason: "no text found in the image" };

    return {
      ok: true,
      text,
      reader: "local",
      /* Tesseract reports 0–100 and Vision reports 0–1. Everything that
         stores or displays this number was built for the second, so the
         conversion belongs here and not in four places downstream. */
      confidence: typeof data.confidence === "number" ? data.confidence / 100 : null,
    };
  } catch (error) {
    await discardWorker();
    return { ok: false, reason: error?.message ?? "the picture could not be read" };
  }
}

/* ── parsing ──────────────────────────────────────────────────────────────── */

/**
 * Characters a reader confuses on a photographed form, corrected only inside
 * a field we already know is numeric. Applying this to free text would turn
 * names into gibberish; applying it to a figure recovers most misreads.
 */
function toNumber(raw) {
  if (raw === null || raw === undefined) return null;

  /* Separators the printer or the reader put in: 1,204 and 1 204 are both the
     same number, and neither is a reason to give up on the token. */
  const bare = String(raw).replace(/[,\s.]/g, "");

  /* The three substitutions a reader genuinely makes on a figure. */
  const corrected = bare
    .replace(/[Oo]/g, "0")
    .replace(/[lI|]/g, "1")
    .replace(/[Ss]/g, "5");

  /* ── A WORD WITH A DIGIT IN IT IS NOT A FIGURE ─────────────────────────
     This used to strip every remaining letter and take what was left, so the
     form's own name — EC8A — read as the number 8. On a sheet whose header
     listed the parties, that gave every one of them 8 votes, and because
     8+8+8+8 sits comfortably under the accredited total, nothing downstream
     objected: the reader proposed four confident, wrong, plausible numbers.

     A figure that has survived the substitutions above is all digits. If it is
     not, the token was a word — EC8A, FORM2, 3rd — and a word is not a number
     however many digits it contains. */
  if (!/^[0-9]+$/.test(corrected)) return null;

  const value = Number(corrected);
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

  /* ── A LINE NAMING SEVERAL PARTIES IS A HEADER ────────────────────────────
     A result row names one party and gives one figure. A line carrying three
     or four initials at once is the form's own column heading or a summary
     banner, and reading a figure off it attributes somebody else's number — or
     a piece of the form's name — to whichever party was matched first. */
  const partyPattern = (party) =>
    /* Initials arrive spaced as often as not: a reader that has found a table
       emits "A P C" where the form printed "APC". */
    new RegExp(`\\b${party.id.split("").join("\\s*")}\\b`, "i");

  const namesSeveral = (line) =>
    parties.filter((party) => partyPattern(party).test(line)).length > 1;

  for (const party of parties) {
    const pattern = partyPattern(party);
    let value = null;

    for (const [index, line] of lines.entries()) {
      if (!pattern.test(line) || namesSeveral(line)) continue;
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
