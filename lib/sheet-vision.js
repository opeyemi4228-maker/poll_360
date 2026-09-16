import os from "node:os";
import path from "node:path";
import { scanList } from "./party-register.js";

/* Every party the product can name, not one position's ballot.

   A photograph does not say which paper it is, so a reader that scanned a
   single ballot would miss eleven of the fifteen rows on an Osun governorship
   sheet and find rows that are not there on a presidential one. It reads what
   is on the page; `figuresForBallot` decides which of those belong on the
   return being filed. */
const parties = scanList();
import { ballotFor } from "./races.js";
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
const TIMEOUT_MS = Number(process.env.SHEET_READER_TIMEOUT_MS ?? 45_000);

/* ── THE WHOLE READ'S BUDGET, AND ONE ATTEMPT'S SHARE OF IT ───────────────
   Sized against the 60-second ceiling on the routes that reach here, with
   room left for the request to answer rather than be killed mid-flight.

   ── TWELVE SECONDS AN ATTEMPT WAS MEASURED AND WAS WRONG ────────────────
   It was twelve, on the reasoning that the reader answers a good request in
   two to four. It does, usually. Measured against a document-like image the
   size of a real sheet upload — 1.22 MB, four attempts: 2.9s, **16.0s**, 2.7s,
   2.6s. All four succeeded.

   The sixteen-second one is the whole problem. A cap of twelve aborts it at
   twelve, calls a successful read a timeout, and retries — and the retry is
   just as likely to be the slow one. Three attempts later the budget is gone
   and the agent is told the sheet could not be read, when a single wait would
   have returned it. A cap short enough to fire on a legitimate response does
   not protect anything; it manufactures the failure it was added to survive.

   Twenty-five covers the slowest observed read with half again as much room.
   A 503 comes back in under a second, so the attempt count still buys three
   goes at a busy reader — the case retrying was actually for — while a slow
   success now gets the time it needs. */
const BUDGET_MS = Number(process.env.SHEET_READER_BUDGET_MS ?? 50_000);
const ATTEMPT_MS = 25_000;
const ATTEMPTS = 3;

/* Statuses worth trying again, and the ones that are the sender's fault and
   never will be. 503 is what the free tier answers when it is busy, which is
   most of a polling evening; 429 is the rate limit and passes; 500, 502 and
   504 are somebody else's bad minute. A 400 or a 403 is a key or a payload
   problem and retrying it is just three times the wait for one answer. */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  if (forced === "claude") return "claude";
  if (forced === "google") return "google";
  if (forced === "ocrspace") return "ocrspace";
  if (forced === "local" || forced === "tesseract") return "local";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.GOOGLE_VISION_API_KEY) return "google";
  if (process.env.OCRSPACE_API_KEY) return "ocrspace";
  return "local";
}

/**
 * Can the configured reader read handwriting?
 *
 * The one question that decides whether photographing a sheet is worth doing
 * at all, because every figure on an EC8A is written by hand. Kept as a list
 * of what each reader can actually do rather than inferred from anything,
 * because getting it wrong in the optimistic direction means filling an
 * agent's form with guesses.
 */
export function readsHandwriting() {
  const which = reader();
  /* All three of these read handwriting. They differ in how well, and that
     difference is `trustworthy` below, not this. The one that cannot read it
     at all is the local reader, which is what this exists to tell you. */
  return which === "claude" || which === "google" || which === "ocrspace";
}

/**
 * Whether the configured reader can see a signature, a stamp, or an alteration.
 *
 * ── A DIFFERENT QUESTION FROM `readsHandwriting`, AND A NARROWER ANSWER ────
 * Three readers can read handwriting. Exactly one can answer whether a sheet
 * was signed and stamped, because that is not a reading problem at all — a
 * signature is a mark rather than a word and a stamp is an impression, so
 * neither produces any text for an optical reader to return. OCR.space and
 * Google hand back a page of words; there is no arrangement of those words
 * that says whether somebody signed the bottom of the page.
 *
 * This is worth its own function rather than being folded into the one above
 * because the deployment it warns about looks completely healthy: a key is
 * set, the reader runs, figures come back, and the certification is silently
 * "unclear" on every sheet forever. Nobody would go looking for a cause,
 * because nothing appears to be wrong.
 */
export function readsCertification() {
  return reader() === "claude";
}

/**
 * Read a sheet and get the figures a return is made of.
 *
 * ── THIS IS THE FRONT DOOR, NOT `readImage` ────────────────────────────────
 * The two kinds of reader do genuinely different things. An optical reader
 * hands back a page of text which then has to be parsed into figures; the
 * model hands back the figures. Callers should not have to know which one is
 * configured, so both paths end here, in the same shape, having passed the
 * same arithmetic in `checked()`.
 *
 * `readImage` remains the way to get raw text out of an optical reader, which
 * is worth having for a stored record of what was actually on the page.
 */
export async function readSheet(bytes) {
  const which = reader();
  if (!which) return { ok: false, reason: "sheet reading is switched off" };

  if (which === "claude") {
    const { readWithClaude } = await import("./sheet-claude.js");
    const read = await readWithClaude(bytes);
    if (!read.ok) return read;
    return { ...read, text: null, parsed: checked(fromFigures(read.figures)) };
  }

  if (which === "ocrspace") return readWithSecondLook(bytes);

  const read = await readImage(bytes);
  if (!read.ok) return read;
  return { ...read, parsed: parseSheet(read.text) };
}

/**
 * Read it twice when the first read came back with holes in it.
 *
 * ── WHY A SECOND PASS FINDS ANYTHING THE FIRST ONE DID NOT ─────────────────
 * The table mode is what keeps a result sheet's rows apart, and it is worth
 * having: without it the reader returns a bag of lines and the parsing below
 * cannot tell which figure belongs to which party. But it works by resolving
 * the printed cell borders, and where a border is broken by a crease, a
 * shadow or a pen stroke crossing it, the whole cell is dropped — silently,
 * and usually the cell with the longest figure in it, because that is the one
 * whose digits touch the ruling.
 *
 * Reading again without table mode gets a different set of mistakes rather
 * than the same ones louder. So the second pass runs only when the first left
 * a figure unread, and only its holes are filled from it.
 *
 * ── AND WHY THE MERGE ONLY EVER FILLS HOLES ────────────────────────────────
 * The first reading always wins where it read something. A merge that let a
 * second, worse-structured pass overwrite a figure the first one read would
 * be a machine quietly changing a vote count on the strength of nothing, and
 * there would be no way afterwards to say which pass a filed figure came
 * from. It fills blanks. It never overwrites.
 */
async function readWithSecondLook(bytes) {
  /* ── ONE BUDGET FOR EVERY ATTEMPT, NOT A TIMEOUT PER CALL ──────────────
     This makes up to two passes and each pass may now retry a transient
     failure, so a per-call timeout is the wrong shape: two 45-second calls
     already exceed the 60-second ceiling on the routes that reach here (see
     `maxDuration` in app/field/page.jsx), and adding retries underneath that
     would let a bad afternoon at the reader hold a request open until the
     platform killed it — which the agent sees as the page hanging, the worst
     of the available failures.

     So the deadline is set once, here, and every attempt below fits inside
     what is left of it. When it runs out the reader gives up and says so, and
     the agent types the figures, which is what they would have done anyway. */
  const deadline = Date.now() + BUDGET_MS;

  const first = await readWithOcrSpace(bytes, { table: true, deadline });
  if (!first.ok) return first;

  const parsed = parseSheet(first.text);

  /* Nothing missing, or nothing a second look could help with. */
  if (!parsed.missing.length) return { ...first, parsed };

  const second = await readWithOcrSpace(bytes, { table: false, deadline });
  if (!second.ok) return { ...first, parsed };

  /* ── THE SECOND PASS IS READ STRICTLY, AND HERE IS WHY ──────────────────
     Without table mode the reader returns a bag of lines with no row
     structure at all, so "the line after this one" means nothing — the next
     line is whatever the reader happened to emit next, which is frequently
     another party's figure.

     Measured: merging a loosely-parsed second pass credited APC with 2374,
     which is ADP's figure, on a sheet where the first pass had honestly left
     APC empty. That is the whole failure this reader exists to avoid, arrived
     at by trying to be helpful.

     So the second pass counts a figure only when it sits on the same line as
     the party's own code. Everything else it might have seen is discarded. */
  const merged = mergeReadings(parsed, parseSheet(second.text, { sameLineOnly: true }));

  return {
    ...first,
    /* Both pages of text, in the order they were read, because the stored
       record should show everything the machine actually saw. */
    text: `${first.text}\n\n--- second pass ---\n\n${second.text}`,
    parsed: merged,
    passes: 2,
  };
}

/** Fill the first reading's holes from the second, then re-check the sums. */
function mergeReadings(first, second) {
  const take = (a, b) => (a === null || a === undefined ? (b ?? null) : a);

  const votes = parties.map((party, index) => {
    /* Not read in the first pass covers both causes: a figure it could not
       make out, and a row it never found. Either way the second pass is worth
       consulting, and either way its own placeholder is not a reading. */
    const unread =
      first.missing.includes(party.id) || (first.absent ?? []).includes(party.id);
    if (!unread) return first.votes[index];
    if (second.missing.includes(party.id) || (second.absent ?? []).includes(party.id)) return 0;
    return second.votes[index] ?? 0;
  });

  const missing = [];
  /* Absent in both passes means the row really is not on the paper. Absent in
     one and read in the other means it was there and the first pass lost it,
     which the merge has just recovered — so it is neither absent nor missing. */
  const absent = [];
  for (const [index, party] of parties.entries()) {
    const unreadable = first.missing.includes(party.id) && second.missing.includes(party.id);
    const nowhere =
      (first.absent ?? []).includes(party.id) && (second.absent ?? []).includes(party.id);

    if (nowhere) absent.push(party.id);
    else if (unreadable) missing.push(party.id);
    else if (votes[index] === null || votes[index] === undefined) missing.push(party.id);
  }

  const accredited = take(first.accredited, second.accredited);
  if (accredited === null) missing.push("accredited");

  return checked({
    unitCode: take(first.unitCode, second.unitCode),
    repName: take(first.repName, second.repName),
    registered: take(first.registered, second.registered),
    accredited,
    rejected: take(first.rejected, second.rejected),
    votes,
    others: first.others || second.others || 0,
    missing,
    absent,
  });
}

/**
 * A reading, in the shape the filing form's boxes are in.
 *
 * ── A HOLE IN THE RETURN IS NOT A ZERO ─────────────────────────────────────
 * `parsed.votes` carries 0 for a party the reader could not make out, because
 * the arithmetic in `checked()` needs a number to add up. That 0 must never
 * reach a form. On screen it cannot be told apart from a party that genuinely
 * polled nothing, and the difference matters: an empty box is something an
 * agent has to fill, and a box reading 0 is something they skim past.
 *
 * `parsed.missing` is the list of what was never actually read, so those come
 * back as null and their boxes stay empty. This lives here, beside the parsing
 * that produces the shape, because both filing paths need it and two copies of
 * this rule would eventually disagree about which zeros are real.
 */
export function figuresForBallot(parsed, race) {
  /* Read back by id, not by position. `parsed.votes` is positional over the
     list this reader scanned, and the ballot is a different list that happens
     to start with the same parties in the same order. "Happens to" is not a
     guarantee, and the failure it invites is silent and severe: one party's
     figure appearing in another party's box. */
  const read = new Map(parties.map((party, index) => [party.id, parsed?.votes?.[index] ?? null]));

  const votes = Object.fromEntries(
    ballotFor(race).map((party) => {
      if (party.id === "OTH") {
        /* Only an optical reader leaves this at zero, and only because it has
           no way to tell an unknown party from a smudge. A zero nobody
           measured is not an answer. */
        return [party.id, parsed?.others ? parsed.others : null];
      }
      /* Both causes give an empty box. A party the reader could not make out
         and a party with no row on the paper are different facts about the
         sheet, and identical instructions to the agent: type what you see. */
      if ((parsed?.missing ?? []).includes(party.id)) return [party.id, null];
      if ((parsed?.absent ?? []).includes(party.id)) return [party.id, null];
      return [party.id, read.get(party.id) ?? null];
    })
  );

  return {
    registered: parsed?.registered ?? null,
    accredited: parsed?.accredited ?? null,
    rejected: parsed?.rejected ?? null,
    votes,
    unitCode: parsed?.unitCode ?? null,
    repName: parsed?.repName ?? null,
    /* Everything else on the paper. An optical reader leaves most of these
       null, which is the honest answer for a reader that never looked for
       them — the boxes stay empty and the agent fills them in. */
    formSerial: parsed?.formSerial ?? null,
    ballotsIssued: parsed?.ballotsIssued ?? null,
    unusedBallots: parsed?.unusedBallots ?? null,
    spoiled: parsed?.spoiled ?? null,
    statedValid: parsed?.statedValid ?? null,
    usedBallots: parsed?.usedBallots ?? null,
    sheetDate: parsed?.sheetDate ?? null,
    contested: parsed?.contested ?? null,
    agents: parsed?.agents ?? null,
    /* ── CARRIED THROUGH, NEVER MANUFACTURED ────────────────────────────
       This function shapes a reading from *either* reader onto the ballot, so
       it must pass the certification along rather than compose one. The first
       version wrote a fixed "unclear" block here on the reasoning that an
       optical reader cannot see a signature — true of that reader, and wrong
       here: this is the path a vision reading also takes, and the fixed block
       overwrote a real observation with a shrug. A model that had plainly seen
       an unsigned sheet would have had its finding erased on the way to the
       agent's screen.

       Where a reader genuinely could not look — the optical one matches
       patterns in extracted text, and a signature is a mark rather than a word
       — it reports "unclear" itself, at the point it knows that. The fallback
       below is only for a reading that carries no block at all, and it is the
       cautious state for the reason the whole three-state rule exists: never
       "absent", because that is an allegation about a named official and
       nothing here has looked at anything capable of supporting one. See
       lib/certification.js. */
    certification: parsed?.certification ?? {
      signature: "unclear",
      stamp: "unclear",
      officerName: parsed?.repName ? "written" : "illegible",
      alteration: "unclear",
    },
  };
}

/**
 * A name as written, with the page's noise taken off it.
 *
 * Letters, spaces, full stops, apostrophes and hyphens: enough for "A. Bello",
 * "O'Brien" and "Abdul-Kareem", and nothing else. Optical output around a
 * ruled line is full of underscores, pipes and stray punctuation, and any of
 * them left on the end would make one officer read as two different people
 * across two sheets.
 *
 * What it does not do is change the name. No case folding, no initial
 * expansion, no matching against a roll — this is a transcription of
 * somebody's handwriting, and every tidy-up beyond stripping noise is a chance
 * to attach a finding to the wrong person. See lib/certification.js.
 */
function clean(text) {
  const kept = String(text ?? "")
    .replace(/[^A-Za-z .'\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  /* A line of nothing but a rule comes back as one or two stray letters. That
     is not a name and must not be recorded as one. */
  if (kept.length < 3) return null;
  /* Nor is a run of the form's own printed words — see NOT_A_NAME. */
  if (NOT_A_NAME.test(kept)) return null;
  return kept;
}

/**
 * Whether a reading has earned the right to write into an agent's form.
 *
 * Two ways it can, and nothing else counts:
 *
 *   · the reader can actually read handwriting, which is what the figures on
 *     an EC8A are; or
 *   · the arithmetic corroborates it — the party votes sum exactly to
 *     accredited minus rejected. A reader hitting that by accident has
 *     essentially not happened, and it is the same standard this file already
 *     uses to decide whether to trust a reading at all.
 *
 * Everything else is shown to the agent and left out of the boxes. Filling a
 * form with figures a weak reader guessed at is worse than reading nothing:
 * nobody re-reads a box that is already filled as carefully as an empty one.
 */
export function trustworthy(read) {
  /* Both of these genuinely read handwriting. OCR.space is deliberately not
     on this list: it reads handwriting well enough to be worth running and
     not well enough to be believed without the arithmetic agreeing. */
  if (read?.reader === "claude" || read?.reader === "google") return true;
  return read?.parsed?.balanced === true;
}

/**
 * A model's reading, in the shape the arithmetic expects.
 *
 * The votes arrive keyed by party because that is how they are read; the
 * checks below want them in ballot order. A party the reader could not make
 * out is a hole in the return and is reported as one — never a zero, because
 * a real zero is written on the sheet as a zero.
 */
function fromFigures(figures) {
  const missing = [];
  const absent = [];

  const votes = parties.map((party) => {
    const value = figures?.votes?.[party.id];
    if (value === null || value === undefined) {
      /* The model is told to omit rows left blank, so a party it did not
         return had no figure written against it. For the presidential four
         that is a hole worth stopping for — they are on every sheet in the
         country. For a party added to the ballot it is the ordinary case of
         a paper it did not stand on. */
      /* The model is asked for every row carrying a figure and told to omit
         only genuinely blank ones, so a party it did not return is a party
         with no row on this paper. Absent, not missing — the same rule the
         optical path follows above, for the same reason. A figure it could
         see but not read comes back in `unreadable` instead. */
      absent.push(party.id);
      return 0;
    }
    return value;
  });

  if (figures?.accredited === null || figures?.accredited === undefined) missing.push("accredited");

  return {
    unitCode: figures?.unitCode ?? null,
    repName: figures?.repName ?? null,
    registered: figures?.registered ?? null,
    accredited: figures?.accredited ?? null,
    rejected: figures?.rejected ?? null,
    votes,
    /* Every party on the paper without a box of its own, already added up. */
    others: figures?.others ?? 0,
    missing,
    absent,
    /* The rest of Form EC8A, straight through. `checked()` spreads whatever it
       is given, so these reach the caller without every layer between here and
       the form having to name them one by one. */
    formSerial: figures?.formSerial ?? null,
    ballotsIssued: figures?.ballotsIssued ?? null,
    unusedBallots: figures?.unusedBallots ?? null,
    spoiled: figures?.spoiled ?? null,
    statedValid: figures?.statedValid ?? null,
    usedBallots: figures?.usedBallots ?? null,
    sheetDate: figures?.sheetDate ?? null,
    contested: figures?.contested ?? null,
    agents: figures?.agents ?? null,
    /* Three states, straight through. Anything that flattens these on the way
       to a screen turns a bad photograph into an accusation — see the note in
       lib/certification.js. */
    certification: figures?.certification ?? {
      signature: "unclear",
      stamp: "unclear",
      officerName: "illegible",
    },
  };
}

export function visionAvailable() {
  return reader() !== null;
}

/**
 * Send an image and get its *text* back.
 *
 * Optical readers only. The model does not produce a page of text and asking
 * it to would throw away the thing that makes it worth using, so where it is
 * the configured reader this still falls through to the best optical one —
 * callers wanting figures want `readSheet` above.
 */
export async function readImage(bytes) {
  const which = reader();
  if (which === null) return { ok: false, reason: "sheet reading is switched off" };
  if (which === "google" || (which === "claude" && process.env.GOOGLE_VISION_API_KEY)) {
    return readWithGoogle(bytes);
  }
  if (which === "ocrspace") return readWithOcrSpace(bytes);
  return readWithLocal(bytes);
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

/* ── the no-account reader ────────────────────────────────────────────────── */

/**
 * OCR.space, on its handwriting engine.
 *
 * ── WHY THIS ONE IS HERE ───────────────────────────────────────────────────
 * It is the only reader in this file that reads handwriting and can be turned
 * on with nothing but an email address — no cloud account, no card, no
 * billing project. That is the entire reason it exists: an election is a date
 * that does not move, and "we are waiting on a billing account" is not a
 * thing you can tell a room full of agents on polling morning.
 *
 * It is not as good as the other two at this. Expect it to read most of a
 * clearly written sheet and to struggle with a cramped or creased one, which
 * is why nothing it produces fills a form unless the arithmetic corroborates
 * it — see `trustworthy` above. It is the floor, not the ceiling.
 *
 * ── ENGINE 2, AND WHY IT MATTERS ───────────────────────────────────────────
 * Engine 1 is a print reader and returns almost nothing from a handwritten
 * form. Engine 2 is the one trained on handwriting. The difference between
 * them is the difference between this reader working and not.
 */
async function readWithOcrSpace(bytes, { table = true, deadline = null } = {}) {
  const apiKey = process.env.OCRSPACE_API_KEY;
  if (!apiKey) return { ok: false, reason: "OCRSPACE_API_KEY is not set" };

  /* ── THE CEILING IS 1.5 MB, NOT 1 ────────────────────────────────────
     This refused anything over 1,024,000 bytes. Measured against the service:
     a 2.9 MB upload comes back 413 with "E556: File too large. Max 1.5 MB for
     Free Plan", so half a megabyte of headroom was being thrown away by a
     guard that was simply wrong about the limit.

     That headroom is not spare capacity, it is legibility. Every figure on an
     EC8A is handwritten, the reader's whole job is to make out a cramped
     corrected digit, and the difference between a 1 MB and a 1.4 MB
     photograph of the same sheet is exactly the detail it needs. The client
     shrinks to fit whatever this says — see RESULT_SHEET in lib/shrink.js —
     so this number decides how good a picture the reader ever sees.

     Held just under the stated limit rather than at it: multipart encoding
     adds its own overhead on top of the bytes, and a request refused for
     being four kilobytes over is a request that made the round trip for
     nothing. */
  if (bytes.length > 1_450_000) {
    return { ok: false, reason: "the picture is too large for this reader — under 1.4MB" };
  }

  const until = deadline ?? Date.now() + BUDGET_MS;
  let last = "the picture could not be read";

  /* ── A 503 IS A BUSY AFTERNOON, NOT AN ANSWER ──────────────────────────
     This gave up on the first non-OK status and told the agent "the reader
     returned 503", which is both useless to somebody holding a phone at a
     polling unit and wrong about what happened: the free tier answers 503
     when it is under load, which on a polling evening is most of the time,
     and the same request a second later usually succeeds.

     So a transient status is tried again, up to three times, inside the
     budget the whole read shares. What is never retried is a 400 or a 403 —
     those are the key or the payload and will fail identically forever. */
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const left = until - Date.now();
    /* No point starting an attempt that cannot finish. Half a second of
       headroom so the answer has somewhere to land. */
    if (left < 1_500) break;

    const outcome = await attemptOcrSpace(bytes, {
      apiKey,
      table,
      timeout: Math.min(ATTEMPT_MS, left - 500),
    });

    if (outcome.ok) return outcome;
    last = outcome.reason;
    if (!outcome.retry) return outcome;

    /* Backing off rather than hammering: the reader is busy, and three
       requests in three hundred milliseconds is what made it busy. */
    if (attempt < ATTEMPTS) await wait(attempt === 1 ? 700 : 1_800);
  }

  return { ok: false, reason: last };
}

/** One request to the reader. Says whether trying again is worth anything. */
async function attemptOcrSpace(bytes, { apiKey, table, timeout }) {
  try {
    const form = new FormData();
    form.set("apikey", apiKey);
    form.set("language", "eng");
    /* The handwriting engine. Without this it reads print only. */
    form.set("OCREngine", "2");
    /* A result sheet is a table, and the table mode keeps the rows apart —
       which is the whole basis of the label-and-figure parsing below. It also
       drops the occasional cell whose borders it cannot resolve, which is why
       `readSheet` runs this a second time without it when figures come back
       missing. See there. */
    if (table) form.set("isTable", "true");
    /* Upscales a small photograph before reading it, which is most of what a
       phone at close of poll produces. */
    form.set("scale", "true");
    form.set("detectOrientation", "true");
    form.set("file", new Blob([bytes]), "sheet.jpg");

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      /* Oversize is settled, and the service says so precisely. Retrying it
         is three round trips to be told the same thing. */
      if (response.status === 413) {
        return { ok: false, retry: false, reason: "the picture is too large for this reader" };
      }
      const busy = TRANSIENT.has(response.status);
      return {
        ok: false,
        retry: busy,
        /* Said in words an agent can act on. "503" is a fact about a server
           and tells somebody holding a phone nothing at all. */
        reason: busy
          ? "the reader is busy — it was tried three times"
          : response.status === 403 || response.status === 401
            ? "the reader refused this key"
            : `the reader could not read it (${response.status})`,
      };
    }

    const body = await response.json();

    /* This API answers 200 with the failure in the body, so the status code
       above proves nothing on its own. */
    if (body.IsErroredOnProcessing) {
      const message = Array.isArray(body.ErrorMessage) ? body.ErrorMessage[0] : body.ErrorMessage;
      return { ok: false, reason: message || "the picture could not be read" };
    }

    const text = (body.ParsedResults ?? [])
      .map((result) => result?.ParsedText ?? "")
      .join("\n")
      .trim();

    if (!text) return { ok: false, reason: "no text found in the image" };

    /* It reports no confidence of its own on this engine. Null rather than an
       invented number: the arithmetic is what decides trust here anyway. */
    return { ok: true, text, reader: "ocrspace", confidence: null };
  } catch (error) {
    const name = error?.name ?? "";
    const timedOut = name === "TimeoutError" || name === "AbortError";
    return {
      ok: false,
      /* A timeout and a dropped connection are both worth one more go; a
         malformed body is not. */
      retry: timedOut || name === "TypeError",
      reason: timedOut
        ? "the reader did not answer in time"
        : (error?.message ?? "the picture could not be read"),
    };
  }
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
  let bare = String(raw).replace(/[,\s.]/g, "");

  /* ── DASH PADDING IS AN ANTI-TAMPERING DEVICE, NOT PART OF THE FIGURE ──
     Presiding officers fill the empty space in a figure box so nothing can be
     added to the number later. Taken from Form EC8A, S/N 0001745 — Osun 2026,
     R.C.M. School Onibambu — where every figure is written that way:

       -100---   one hundred
       001- - -  one
       -091---   ninety one
       -002---   two
       -195--    one hundred and ninety five

     The all-digits test below rejected every one of them, so a sheet written
     exactly as an officer is meant to write it read as blank — and a blank
     figure is not a visible failure. It is a party silently recorded with no
     votes.

     Every dash goes, not merely the leading one. No figure on a result sheet
     is ever negative, so a minus sign has no meaning here to protect: on this
     form a dash is always padding. The variants are what a reader returns for
     a pen stroke — hyphen, en dash, em dash, underscore, tilde. */
  bare = bare.replace(/[-–—_~]/g, "");

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

/* ── THE WORDS COLUMN, WHICH IS THE OTHER HALF OF THE SAME DEVICE ─────────
   Form EC8A prints every figure twice: once in digits and once in words. That
   is not redundancy, it is the same anti-tampering measure as the dash padding
   — a digit can be altered with one pen stroke and "NINETY ONE" cannot.

   It is also the more legible of the two on a photograph. A cramped, corrected
   digit in a narrow box is exactly what a reader gets wrong; the same figure
   written out is unambiguous even at poor quality. So the words are read too,
   and where the two columns disagree that is a finding worth surfacing rather
   than a tie to break silently. */
const ONES = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};

const TENS = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};

/* What a reader returns for these words when the handwriting is joined up.
   Only the ones actually observed, rather than a spell-checker: a fuzzy match
   over number words invents figures, and an invented figure is a vote. */
const MISREAD = {
  fourty: "forty",
  nienty: "ninety",
  ninty: "ninety",
  hundered: "hundred",
  hundread: "hundred",
  thousend: "thousand",
  zeno: "zero",
  nill: "zero",
  nil: "zero",
};

/**
 * A figure written out in words, as a number.
 *
 * Returns null rather than a guess for anything it cannot resolve whole. A
 * partial reading of a number word is not a smaller number, it is a different
 * one, and this is a vote count.
 */
export function wordsToNumber(text) {
  if (!text) return null;

  const words = String(text)
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    /* "twenty-one" is one figure written with a hyphen. */
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((word) => MISREAD[word] ?? word)
    .filter((word) => word && word !== "and");

  if (!words.length) return null;

  let total = 0;
  let run = 0;
  let seen = false;

  for (const word of words) {
    if (word in ONES) {
      run += ONES[word];
      seen = true;
    } else if (word in TENS) {
      run += TENS[word];
      seen = true;
    } else if (word === "hundred") {
      /* "hundred" with nothing before it is one hundred, which is how it is
         written on a sheet more often than "one hundred". */
      run = (run || 1) * 100;
      seen = true;
    } else if (word === "thousand") {
      total += (run || 1) * 1000;
      run = 0;
      seen = true;
    } else {
      /* A word that is not part of a number. The column carries nothing else,
         so this is a misread, and a misread figure must not be salvaged into
         a plausible one. */
      return null;
    }
  }

  return seen ? total + run : null;
}

/**
 * The polling agent's name on a party's row, where one signed.
 *
 * ── THE WITNESS RECORD, WHICH THE OPTICAL READER WAS DISCARDING ───────────
 * The last column of Form EC8A is "NAME/SIGNATURE OF POLLING AGENT", and it
 * is the strongest thing on the page: every agent who signs is a party's own
 * representative attesting to that figure at that booth. The model reader has
 * always captured it; the optical one returned `agents: null` unconditionally,
 * so a sheet read that way kept the figures and threw away who stood behind
 * them.
 *
 * What is left on a row once the serial, the party's initials, the padded
 * figure and the figure-in-words are taken off it is the agent. Each of those
 * is removed by something that knows what it is rather than by position,
 * because a reader emits the columns in whatever order it resolved them.
 */
function agentOn(line, pattern) {
  const raw = String(line ?? "");

  /* ── THE ROW IS A TABLE, SO TAKE THE CELL ──────────────────────────────
     Real OCR of the Onibambu sheet returns the columns tab-separated:

       "6\tAPC\t-091- - -\tNINETY ONE\tJEREMINI SAMSON"
       "7\tAPGA\t-002-- -\tTHO\tS-A"
       "1\tA\t- 100---\tONE HUNDRED"

     Stripping the figure and its words out of the whole line and keeping the
     remainder is what this did first, and on those rows it produced
     "- ONE HUNDRED" and "THO S-A" — the exact garbage the guards were meant
     to prevent, because a stray dash at the head of the run stopped the
     number-word strip before it began.

     The last cell is the agent's column when the reader found the table, and
     that is a far stronger signal than anything recovered from a remainder.
     The old approach stays as the fallback for a reader that emitted no
     tabs. */
  const cells = raw.split("\t").map((cell) => cell.trim()).filter(Boolean);
  if (cells.length >= 2) {
    const named = asAgentName(cells[cells.length - 1]);
    if (named) return named;
    /* The last cell was the figure or its words, so no agent signed. Not
       worth falling through: a name is never in an earlier column. */
    return null;
  }

  let rest = raw
    /* The party's own initials, wherever on the row they landed. */
    .replace(pattern, " ")
    /* The figure, padded as the officer wrote it. */
    .replace(/[-–—_~]*\d[\d\s,.\-–—_~]*/g, " ");

  /* The same figure again, in words. Removed token by token against the number
     vocabulary rather than by a pattern over the whole cell: "ONE HUNDRED AND
     NINETY ONE JEREMIAH SAMSON" has no boundary in it that a pattern could
     find, and a greedy one would eat the name. */
  const words = rest.split(/\s+/).filter(Boolean);
  let at = 0;
  while (at < words.length) {
    const word = String(words[at]).toLowerCase().replace(/[^a-z]/g, "");
    const mapped = MISREAD[word] ?? word;
    if (mapped in ONES || mapped in TENS || mapped === "hundred" || mapped === "thousand" || mapped === "and") {
      at += 1;
      continue;
    }
    break;
  }

  rest = words.slice(at).join(" ");

  return asAgentName(rest);
}

/**
 * Whether a cell holds a polling agent's name, and that name if it does.
 *
 * ── TWO WORDS, BECAUSE ONE IS A SCRAWL ─────────────────────────────────────
 * The agent column carries a name and a signature in the same box, so what
 * comes back is frequently part name and part pen stroke: "S-A", "THO",
 * "Gwn". Every one of those clears a length test and none of them is a name
 * anybody could act on — and this column's whole value is that it names the
 * party representative who attested to a figure.
 *
 * Two alphabetic tokens of two letters or more is the rule. It keeps
 * "JEREMINI SAMSON" and "OSUOLA BENJAMEN", which is what the sheet actually
 * carries, and refuses the scrawls. A genuine single-word signature is lost,
 * which is the right trade: an unread agent is a blank, and a blank is
 * recoverable by looking at the photograph. A scrawl recorded as a person is
 * a name in the evidence that no one can be held to.
 */
function asAgentName(text) {
  const cleaned = String(text ?? "")
    .replace(/[^A-Za-z .'\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 4) return null;
  /* The form's own words are not a person. Same guard the officer's name uses
     — see NOT_A_NAME — plus the caption printed over this very column. */
  if (NOT_A_NAME.test(cleaned)) return null;
  if (/\b(polling|agent|party|total|valid|scored|figures|words)\b/i.test(cleaned)) return null;

  /* And not the figure written out, which shares this cell on a row the
     reader could not split. */
  const words = cleaned.split(" ");
  if (words.some((word) => {
    const key = word.toLowerCase().replace(/[^a-z]/g, "");
    return (MISREAD[key] ?? key) in ONES || (MISREAD[key] ?? key) in TENS ||
      key === "hundred" || key === "thousand";
  })) return null;

  const solid = words.filter((word) => word.replace(/[^A-Za-z]/g, "").length >= 2);
  return solid.length >= 2 ? cleaned : null;
}

/**
 * Drop the S/N column.
 *
 * ── WHY A ROW NUMBER IS THE MOST DANGEROUS NUMBER ON THE PAGE ──────────────
 * A result sheet is a numbered table, so most rows open with a small integer
 * that is not a vote. Where the reader failed to make out the actual figure —
 * which is what happens on the cramped, heavily overwritten rows, and those
 * are the rows carrying the largest numbers — the row number is the only
 * digit left on the line, and `lastFigure` below would return it.
 *
 * That is not a near miss. A real sheet was read here and the leading party
 * came back with eleven votes: arithmetically coherent, small enough to pass
 * for a genuine result at a quiet booth, and entirely invented.
 *
 * So a leading one- or two-digit number followed by text is removed before
 * anything looks at the line. A figure in the figures column is never in that
 * position; a row number always is.
 */
function withoutSerial(line) {
  return String(line ?? "").replace(/^\s*\d{1,2}[\s:|\t]+(?=\D)/, " ");
}

/**
 * Is this line nothing but a figure?
 *
 * ── WHY THE NEXT-LINE FALLBACK HAD TO BE NARROWED TO THIS ──────────────────
 * A reader that has found a table sometimes emits a label on one line and its
 * figure on the next, which is the case the fallback below was written for.
 * But on a real sheet the *following* line is far more often the next party's
 * row, or the tail of a figure spelled out in words, and taking a number from
 * either silently credits one party with another's votes.
 *
 * Measured on a genuine INEC form, the unrestricted fallback produced two
 * wrong party figures and no correct ones: APC came back with 177, which is
 * APGA's figure one row down, and PDP with 165, a fragment of the words
 * column. Both are small, plausible, and completely invented.
 *
 * Guarding on "does the next line name another party" is not enough either —
 * this product knows four party codes and a real ballot paper carries
 * eighteen, so APGA's row does not look like another party's row to it.
 *
 * So the fallback now accepts the next line only when that line is a bare
 * figure and nothing else, which is precisely the layout it was written for
 * and nothing else. A figure that cannot be read this way is reported
 * missing, and the agent types it. Missing is recoverable. Wrong is not.
 */
function isBareFigure(line) {
  const text = String(line ?? "").trim();
  return text.length > 0 && /^[\d\s.,]+$/.test(text) && /\d/.test(text);
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
  const tokens = withoutSerial(line)
    .split(/[\s:|\t]+/)
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

/**
 * ── EVERY LABEL NEEDS A BARE FORM ──────────────────────────────────────────
 * `accredited` had one — a plain `/accredit/i` at the end — and the others did
 * not, which made them fail on exactly the input this module exists to read.
 * An OCR pass over a photograph of a form smudges the second half of a line
 * constantly, so "REJECTED BALLOTS 2" arrives as "REJECTED 2" and "REGISTERED
 * VOTERS 800" as "REGISTERED 800".
 *
 * Missing the rejected figure was the damaging one, and it failed quietly in
 * the worst direction. The balance check reads `rejected ?? 0`, so an unread
 * figure was treated as none — the sum then never matched the countable
 * total, `balanced` came back false, and `trustworthy()` therefore refused
 * every reading from the cheaper reader on any sheet that had rejected
 * ballots on it, however correct that reading was. A perfectly good read
 * discarded, with nothing on screen to say why.
 *
 * The bare forms go last so a specific label still wins, and a line carrying
 * a label with no figure on it is passed over anyway: `figureFor` requires a
 * figure on the line or a bare figure on the one below.
 */
const LABELS = {
  registered: [
    /registered\s*voters?/i,
    /no\.?\s*of\s*registered/i,
    /reg(istered)?\s*vot/i,
    /\bregistered\b/i,
    /* ── WHAT THE FORM ACTUALLY SAYS ──────────────────────────────────────
       Box #1 on Form EC8A is headed "Number of Voters on the Register" — the
       noun, not the adjective. Every pattern above looks for "registered",
       so on a real INEC sheet this box read null and the register figure was
       lost from every return an optical reader touched. */
    /voters?\s*on\s*the\s*register/i,
    /\bregister\b/i,
  ],
  accredited: [/accredited\s*voters?/i, /no\.?\s*of\s*accredited/i, /accredit/i],
  rejected: [
    /rejected\s*ballots?/i,
    /no\.?\s*of\s*rejected/i,
    /invalid\s*ballots?/i,
    /\brejected\b/i,
    /\binvalid\b/i,
  ],
  /* ── BOX #3 ─────────────────────────────────────────────────────────────
     "Number of Ballot Papers Issued to the Polling Unit". */
  issued: [/ballot\s*papers?\s*issued/i, /papers?\s*issued/i, /\bissued\b/i],
  /* ── BOX #4 ─────────────────────────────────────────────────────────── */
  unused: [/unused\s*ballot\s*papers?/i, /\bunused\b/i],
  /* ── BOX #5 ─────────────────────────────────────────────────────────────
     Spoiled is not rejected. A spoiled paper was mismarked and swapped before
     it went in the box, so it was issued and never cast — it is exactly the
     difference between the used total and the accredited count, and folding
     the two together is what makes a sheet look like it does not balance. */
  spoiled: [/spoiled\s*ballot\s*papers?/i, /\bspoiled\b/i],
  /* ── BOX #7, as the officer wrote it ────────────────────────────────── */
  valid: [/total\s*valid\s*votes?/i, /valid\s*votes?/i],
  /* ── BOX #8 ─────────────────────────────────────────────────────────────
     `\bused` and not `used`: without the word boundary this matches inside
     "UNUSED BALLOT PAPERS", which is box #4 and sits three lines higher on
     every form. Box #4 would then be read as box #8, and on the Osun sheet
     that turns 556 into 417 — a sheet that balances into one that does not,
     invented entirely by a missing `\b`. */
  total: [/total\s*votes?\s*cast/i, /\bused\s*ballot\s*papers?/i, /number\s*of\s*used\s*ballots?/i],
};

/* The pre-printed serial, which is the sheet's own identity. Captured rather
   than counted: it is the only field on the paper that can tell two booths'
   returns apart from one sheet photographed twice. */
/* ── "S/N" IS THREE CHARACTERS A READER GETS WRONG ────────────────────────
   The slash is thin and often dropped or read as a letter, so the label comes
   back as "SIN", "S1N", "SN" or "S | N". The first pattern already allowed an
   optional slash; the middle character is now allowed to be the digit or
   letter a reader substitutes for it, because a serial that is not read is a
   sheet that cannot be told apart from another photographed twice. */
const SERIAL = [
  /s\s*[\/|1lI]?\s*n\s*[:.\-]*\s*\.*\s*(\d{3,})/i,
  /serial\s*(?:no|number)?\s*[:.\-]*\s*(\d{3,})/i,
];

/* The date at the foot of the form, kept exactly as written. Not parsed into a
   timestamp: this is a transcription of what somebody wrote in a box, and
   parsing would quietly invent a day for anything ambiguous. */
/* ── A DATE IS NOT A POLLING UNIT CODE ──────────────────────────────────
   "29/07/04/010" is three slash-separated numbers followed by a fourth, and a
   naive date pattern reads the first three of them as 29 July 2004 — which is
   what this did, on the very sheet it was written for. The lookarounds refuse
   a match that has a digit or another slash on either side of it, so a
   four-part code is rejected whole rather than sliced into a plausible date. */
const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december";

const SHEET_DATE = [
  /(?<![\d\/-])(\d{1,2}\s*[-\/.]\s*\d{1,2}\s*[-\/.]\s*\d{2,4})(?![\d\/-])/,
  /* ── AND THE ONE AN OFFICER WRITES OUT ──────────────────────────────────
     "16th of AUGUST, 2026", from Form EC8A S/N 0001745. Only a numeric date
     was matched, so a sheet dated in words carried no date at all — and the
     date is how a return is tied to the polling day it belongs to.

     Kept exactly as written, like the numeric form beside it: this is a
     transcription of a box somebody filled in, not a timestamp, and parsing
     it into one would invent a precision the paper does not have. */
  /* ── THE DAY IS NOT PARSED, SO IT NEED NOT BE DIGITS ──────────────────
     Real OCR of Form EC8A S/N 0001745 returned "1Eth of AUGUST, 2026": the 6
     of "16th" came back as an E. A pattern demanding digits for the day found
     nothing, and the sheet carried no date at all.

     It does not need them. This value is kept exactly as written — a
     transcription of a box somebody filled in, never parsed into a timestamp
     — so the day may be whatever the reader made of it, provided it starts
     with a digit and a real month name follows. The month and the year are
     what make it a date; the day is transcribed either way, and "1Eth of
     AUGUST, 2026" beside a photograph is worth incomparably more than null. */
  new RegExp(`(\\b[0-9][0-9A-Za-z]{0,3}\\s*(?:of\\s+)?(?:${MONTHS})\\s*,?\\s*\\d{4})`, "i"),
  new RegExp(`((?:${MONTHS})\\s+\\d{1,2}\\s*(?:st|nd|rd|th)?\\s*,?\\s*\\d{4})`, "i"),
];

/**
 * The presiding officer's name, which is at the foot of the sheet.
 *
 * ── IT IS IN THE DECLARATION, NOT IN A FIELD AT THE TOP ────────────────────
 * These patterns all wanted the words "presiding officer" and the name on one
 * line, which is one of the several ways an EC8A actually presents it and not
 * the commonest. The name lives in the declaration block below the party
 * figures, where the officer certifies the count, and that block is written
 * three different ways across the forms in use:
 *
 *   NAME OF PRESIDING OFFICER: A. BELLO      label and name, one line
 *   PRESIDING OFFICER                        label alone, name on the line
 *   A. BELLO                                   beneath it
 *   I, A. BELLO, hereby certify that ...     the name inside the sentence
 *
 * Only the first was matched, so on the other two the name came back null and
 * the sheet looked as though nobody had been named on it.
 *
 * ── AND THE DECLARATION SENTENCE IS MATCHED FIRST ──────────────────────────
 * Order matters here. "I, A. BELLO, hereby certify" also contains no label, so
 * a loose label pattern run first would never see it; and a sheet carrying
 * both forms should be read from the one the officer actually filled in.
 */
const OFFICER = [
  /* ── THE FORM'S OWN WORDING, TAKEN FROM THE PAPER ──────────────────────
     Form EC8A, S/N 0000611, Osun 2026, reads:

       I, HASSAN HABEEB ......... (Name of Presiding Officer) hereby certify
       that the information contained in this form is a true and accurate
       account of votes cast in this polling Unit ...

     The name comes *before* its own label, with a ruled line of dots and a
     parenthetical between the two. A pattern wanting "I, NAME hereby certify"
     — which is what this file had first — cannot cross the brackets and
     matches nothing on the actual form. These two come first because they are
     what the real sheet says. */
  /* ── ANCHORED ON THE LABEL, LOOKING BACK AT THE HANDWRITING ─────────
     One pattern rather than two, and both the leading "I," and the opening
     bracket are optional, because OCR drops either or both. Verbatim from
     OCR.space on the sheet above:

       "HASSAN HABEEB\t..... Name of Presiding Officer) hereby certify ..."

     No "I,". No "(". The closing bracket survived and its partner did not.
     Patterns requiring the opening of that sentence matched nothing on the
     real page, which is how a sheet with the name plainly written on it read
     as "could not be read from this photograph". */
  /* ── THE COMMA IS LOAD-BEARING ────────────────────────────────────────
     This allowed the leading "I" to be followed by an optional comma, so on
     a sheet reading "IBRAHIM SAMUEL (Name of Presiding Officer)" the prefix
     matched the I of IBRAHIM and the name came back as "BRAHIM SAMUEL" — the
     officer's first initial silently eaten, on the one field this product
     prints beside an allegation.

     Requiring the comma fixes it in both directions: "I, IBRAHIM SAMUEL"
     still drops the "I," because the comma is there, and a bare "IBRAHIM
     SAMUEL" keeps its I because it is not. */
  /(?:\bi\s*,\s*)?([A-Za-z][A-Za-z .'\-]{2,60}?)\s*[.…]*\s*\(?\s*name\s+of\s+presiding\s+officer/i,
  /* The shorter declaration some forms use, anchored on the certifying verb
     so it cannot match an arbitrary comma-separated clause elsewhere. */
  /\bi,?\s+([A-Za-z][A-Za-z .'\-]{2,60}?),?\s+(?:do\s+)?hereby\s+(?:certify|declare)/i,
  /* ── A LABEL, BUT NEVER THE PARENTHETICAL ONE ──────────────────────────
     The lookbehind and the required colon or dash are both load-bearing. On
     the sheet above, "(Name of Presiding Officer)" appears in the middle of
     the declaration sentence, and a looser pattern matched *that* and captured
     what followed it — so a sheet where the officer had left their name blank
     came back named "hereby certify that the information". A blank box read
     as a person. */
  /(?<!\()\bpresiding\s*officer'?s?\s*name\s*[:\-]\s*(.+)/i,
  /(?<!\()\bname\s*of\s*presiding\s*officer\s*[:\-]\s*(.+)/i,
  /\bpo\s*name\s*[:\-]\s*(.+)/i,
];

/* Words that prove a capture is a run of the declaration rather than a name.
   Belt to the lookbehind's braces: the patterns above are the fix, and this is
   what stops the next loosely-written one from putting a sentence in a field
   that is printed as a person. */
const NOT_A_NAME =
  /\b(hereby|certify|declare|contested|information|account|votes|polling|unit|form|true|accurate|signature|stamp|date|name\s+of|presiding)\b/i;

/**
 * A label with nothing after it, whose name is on the next line.
 *
 * Kept separate from OFFICER because it is matched against a different string
 * — the line after this one — and folding the two together would mean every
 * pattern above had to be tried twice against every line.
 */
const OFFICER_LABEL =
  /^\s*(?:name\s*of\s*)?presiding\s*officer'?s?(?:\s*name)?\s*[:\-]?\s*$/i;

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
export function parseSheet(text, { sameLineOnly = false } = {}) {
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

      /* Same rule as the party rows: only a line that is a bare figure. */
      if (sameLineOnly) continue;
      const following = lines[index + 1] ?? "";
      if (!isBareFigure(following)) continue;

      const next = lastFigure(following);
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
  /* Parties with no row on this paper, as opposed to no readable figure. */
  const absent = [];

  /* ── A LINE NAMING SEVERAL PARTIES IS A HEADER ────────────────────────────
     A result row names one party and gives one figure. A line carrying three
     or four initials at once is the form's own column heading or a summary
     banner, and reading a figure off it attributes somebody else's number — or
     a piece of the form's name — to whichever party was matched first. */
  const partyPattern = (party) => {
    /* What the commission prints, which is not always what we call them:
       Accord's row on Form EC8A is headed with a bare "A". */
    const code = party.sheet ?? party.id;

    /* ── A ONE-LETTER CODE CANNOT BE MATCHED ANYWHERE ON THE LINE ─────────
       `\bA\b` hits a standalone "A" in any prose the reader picked up off
       the page — a heading, a place name, the certification paragraph — and
       whatever figure happened to share that line would be credited to
       Accord. On the form the code sits at the head of its row, behind at
       most a serial number, so that is the only place it is looked for. */
    if (code.length === 1) return new RegExp(`^\\s*\\d{0,2}[\\s.|)-]*${code}\\b`, "i");

    /* Initials arrive spaced as often as not: a reader that has found a table
       emits "A P C" where the form printed "APC". */
    return new RegExp(`\\b${code.split("").join("\\s*")}\\b`, "i");
  };

  const namesSeveral = (line) =>
    parties.filter((party) => partyPattern(party).test(line)).length > 1;

  const agents = {};

  for (const party of parties) {
    const pattern = partyPattern(party);
    let value = null;
    /* Whether this party's row is on the page at all, which is a different
       fact from whether its figure could be read. See `absent` below. */
    let named = false;

    for (const [index, line] of lines.entries()) {
      if (!pattern.test(line) || namesSeveral(line)) continue;
      named = true;
      value = lastFigure(line.replace(pattern, " "));

      /* Whoever signed for this party, off the row already in hand. Taken
         whether or not the figure could be read: an agent's attestation is
         evidence in its own right and does not depend on the digit beside it
         having survived the photograph. */
      if (!agents[party.id]) {
        const who = agentOn(line, pattern);
        if (who) agents[party.id] = who;
      }

      /* ── THE NEXT LINE, BUT ONLY IF IT IS STILL THIS ROW ────────────────
         A reader that has found a table often emits a label and its figure as
         two lines, which is why the following line is consulted at all. But
         where the figure is genuinely missing, the following line is the
         *next party's row*, and taking its figure silently credits one party
         with another's votes.

         A real sheet was read here and APC came back with 177 — APGA's
         figure, one row down. So a line naming any other party is refused and
         the figure is reported missing instead. Missing is recoverable: the
         agent types it. Wrong is not. */
      if (value === null && !sameLineOnly) {
        const next = lines[index + 1] ?? "";
        if (isBareFigure(next)) value = lastFigure(next);
      }

      if (value !== null) break;
    }

    /* ── A HOLE IN THE RETURN, OR A ROW THAT WAS NEVER THERE ─────────────
       A party with no figure is a hole in the return, not a zero, so it is
       always reported. A real zero is written on the sheet as a zero.

       But "no figure" has two causes and they are not the same fact. A
       party whose initials are on the page and whose number could not be
       read is a failed reading: the sheet is not usable and the agent must
       look. A party whose initials are nowhere on the page did not stand in
       this contest, and a paper that does not mention it is not a defective
       paper — it is an ordinary one.

       Conflating them refused every honest sheet the moment the ballot grew
       past the presidential four, which are the only parties printed on
       every result sheet in the country. Only those four are held to
       "must be here"; a party marked optional may simply be absent.

       Either way the figure is never invented: absent comes back null, the
       agent's box stays empty, and nothing is filed that nobody measured. */
    /* ── NAMED AND UNREADABLE, OR SIMPLY NOT ON THIS PAPER ─────────────────
       The only failed reading is a row that IS on the page and whose figure
       could not be made out. A party that is not printed on this ballot at
       all is not a failure of anything.

       This used to also force the four presidential parties into `missing`
       whether or not they appeared, on the theory that they are printed on
       every sheet in the country. The Osun 2026 governorship paper carries
       neither PDP nor LP, so a perfectly read sheet came back
       "could not read PDP, LP", was marked unusable, and the comparison
       against what the agent typed silently never ran — on exactly the form
       this product was built around.

       Nothing is lost by trusting `named`: a photograph that yielded no party
       rows at all still fails, because `checked` requires the votes to sum to
       more than zero. */
    if (value === null) (named ? missing : absent).push(party.id);
    votes.push(value ?? 0);
  }

  /* The presiding officer, kept as written. This is a person's name and the
     numeric corrections above must never touch it. */
  let repName = null;
  for (let index = 0; index < lines.length && !repName; index += 1) {
    const line = lines[index];

    for (const pattern of OFFICER) {
      const hit = line.match(pattern);
      if (hit?.[1]) {
        repName = clean(hit[1]);
        if (repName) break;
      }
    }
    if (repName) break;

    /* ── THE LABEL ON ONE LINE, THE NAME ON THE NEXT ────────────────────
       The same rule the figures already follow — see "look on the line, then
       the next one" above. A printed form gives the officer a ruled line to
       write on beneath the label as often as it gives them one beside it, and
       reading only the first left every sheet of the second kind unnamed. */
    if (OFFICER_LABEL.test(line)) {
      repName = clean(lines[index + 1] ?? "");
    }
  }

  let formSerial = null;
  for (const line of lines) {
    for (const pattern of SERIAL) {
      const hit = line.match(pattern);
      const digits = (hit?.[2] ?? hit?.[1] ?? "").replace(/\D/g, "");
      if (digits) {
        formSerial = digits;
        break;
      }
    }
    if (formSerial) break;
  }

  let sheetDate = null;
  for (const line of lines) {
    for (const pattern of SHEET_DATE) {
      const hit = line.match(pattern);
      if (hit?.[1]) {
        /* A numeric date has its spaces squeezed out — "15 - 08 - 2026" is one
           token badly spaced. A written one must keep them, or "16th of AUGUST
           2026" becomes an unreadable run of letters. */
        sheetDate = /[a-z]/i.test(hit[1])
          ? hit[1].replace(/\s+/g, " ").trim()
          : hit[1].replace(/\s+/g, "");
        break;
      }
    }
    if (sheetDate) break;
  }

  /* ── THE CERTIFICATION ─────────────────────────────────────────────────
     The officer strikes one of "CONTESTED / NOT CONTESTED" out, and OCR does
     not see a strikethrough — it reads both words either way. So this is
     deliberately left null for an optical reader rather than guessed: a
     coin-flip here records a certification nobody made. The model reader can
     see the pen stroke and answers it; see lib/sheet-claude.js. */
  const contested = null;

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
    /* Null, not zero. `checked()` below already reads this as zero for the
       arithmetic, so nothing downstream changes — but a figure the reader
       never found must not reach a form looking like one it did. */
    rejected: found.rejected ?? null,
    /* Boxes #3, #4, #5, #7 and #8. Two of these were already being parsed and
       then thrown away — `valid` and `total` have had label patterns for as
       long as this file has existed and never reached the caller, so the sheet
       could not be checked against itself even where the reader had already
       read what it needed. */
    ballotsIssued: found.issued ?? null,
    unusedBallots: found.unused ?? null,
    spoiled: found.spoiled ?? null,
    statedValid: found.valid ?? null,
    usedBallots: found.total ?? null,
    formSerial,
    sheetDate,
    contested,
    agents: Object.keys(agents).length ? agents : null,
    votes,
    /* An optical reader is given no way to tell a party it does not know from
       a smudge, so it never fills the bucket. Present and zero rather than
       absent, so every reading has the same shape. */
    others: 0,
    missing,
    absent,
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
  /* The bucket is part of the count, not a remainder left over after it. A
     sheet fought by eighteen parties whose sum ignored fourteen of them would
     never balance, and "does not add up" would stop meaning anything. */
  const listed = (Array.isArray(read.votes) ? read.votes : Object.values(read.votes ?? {}))
    .reduce((total, value) => total + (value ?? 0), 0);
  const sum = listed + (read.others ?? 0);

  if (read.accredited === null) problems.push("could not find the accredited figure");
  if (read.registered !== null && read.accredited !== null && read.accredited > read.registered) {
    problems.push("accredited is higher than registered");
  }
  if (read.accredited !== null) {
    const countable = read.accredited - (read.rejected ?? 0);
    if (sum > countable) problems.push(`the party figures add up to ${sum}, more than the ${countable} countable`);
  }
  /* ── A ROW THE READER NEVER SAW: MISSED, OR NOT ON THE PAPER? ──────────
     `absent` is a party the reader found no row for at all, and those are two
     different facts it cannot tell apart from the party alone — the Osun 2026
     governorship paper genuinely has no PDP row, and a torn photograph of a
     presidential sheet genuinely does.

     The sheet settles it. Box #7 is the officer's own total of every party
     row, so if what the reader added up equals what the officer wrote then no
     row was missed, however many parties are absent. If it falls short, one
     was dropped — and the shortfall says by how much.

     This is better evidence than any list of which parties "should" be on a
     ballot, because it comes off the paper in front of the reader rather than
     from an assumption about the contest. The assumption was wrong: it used
     to hold that APC, PDP, LP and NNPP are printed on every sheet in Nigeria,
     which made a perfectly read Osun sheet unusable and silently cancelled
     the comparison it exists to feed. */
  if (read.statedValid !== null && sum > 0 && sum !== read.statedValid) {
    problems.push(
      `the party rows add up to ${sum}, and the sheet's own total says ${read.statedValid}`
    );
  }

  if (read.missing.length) {
    problems.push(`could not read ${read.missing.join(", ")}`);
  }
  /* `read.absent` is deliberately NOT a problem. A party with no row on the
     paper is a fact about the contest, not a defect in the reading, and
     listing it here would make every sheet unusable — which is precisely
     what `usable` below feeds, and what matchSheet refuses to compare. */

  const balanced =
    read.accredited !== null && sum > 0 && sum === read.accredited - (read.rejected ?? 0);

  return {
    ...read,
    /* Normalised here rather than at each call site, so a reading built by
       any path has the same shape and nothing downstream has to guard. */
    absent: read.absent ?? [],
    sum,
    balanced,
    problems,
    /* Trusted enough to propose. Never enough to file: that is the agent's. */
    usable: read.accredited !== null && sum > 0 && problems.length === 0,
  };
}
