/**
 * Holding the model's sentences to the record.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A MODEL MAY WRITE THE WORDS. IT MAY NOT MAKE THE NUMBERS.
 *
 *  lib/assistant.js was built without a model for one reason: asked for a
 *  figure it does not have, a model produces one anyway, and on a campaign
 *  desk a confident wrong number is the worst thing this product can print.
 *
 *  Ask Poll360 uses a model to understand questions and to write — and keeps
 *  that rule by checking its writing. Every figure in every sentence it hands
 *  back must be one the engine gave it, at the precision it printed. A
 *  sentence carrying a figure that traces to nothing is dropped, and a
 *  headline that fails is replaced by Poll360's own. The model cannot add two
 *  numbers together and print the sum, because the sum was never handed to
 *  it; the engine computes every total it might want to say.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* Figures that are true by definition rather than by the record: the
   Constitution's own numbers, the size of the federation, and the election
   years. Deliberately no small counts — "3 short" has to trace like any
   other figure. */
const STANDING = [
  134, 24, 36, 37, 25, 100, 774, 8809, 176623, 176846,
  1999, 2003, 2007, 2011, 2015, 2019, 2023, 2027,
];

const NUMBER =
  /(?<![\w.])(-|−)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*(million|m\b|bn|billion|k\b|thousand))?(\s*(?:%|per ?cent|percentage points?|points?|pts)\b|%)?/gi;

const SCALE = { million: 1e6, m: 1e6, bn: 1e9, billion: 1e9, k: 1e3, thousand: 1e3 };

/* Words that announce a rounded figure. Only after one of these may a whole
   number stand for a fraction: "about 19 per polling unit" for 18.9. */
const APPROX = /\b(about|around|roughly|nearly|almost|some|approximately|close to)\s*$/i;

/** Every figure a sentence states, with the precision it was stated to. */
export function figuresIn(text) {
  const source = String(text ?? "");
  const out = [];
  for (const match of source.matchAll(NUMBER)) {
    const digits = match[2].replace(/,/g, "");
    const value = Number(digits);
    if (!Number.isFinite(value)) continue;
    const scale = SCALE[String(match[3] ?? "").toLowerCase()] ?? 1;
    const decimals = digits.includes(".") ? digits.split(".")[1].length : 0;
    out.push({
      text: match[0].trim(),
      value,
      scale,
      decimals,
      rate: Boolean(match[4]),
      approx: APPROX.test(source.slice(0, match.index)),
    });
  }
  return out;
}

/** Every number in whatever the engine handed the model. */
export function figuresFrom(payloads) {
  const out = new Set(STANDING);
  const walk = (value) => {
    if (value === null || value === undefined) return;
    if (typeof value === "number" && Number.isFinite(value)) {
      out.add(value);
      out.add(Math.abs(value));
      return;
    }
    if (typeof value === "string") {
      for (const figure of figuresIn(value)) out.add(figure.value * figure.scale);
      return;
    }
    if (Array.isArray(value)) value.forEach(walk);
    else if (typeof value === "object") Object.values(value).forEach(walk);
  };
  payloads.forEach(walk);
  return [...out];
}

/**
 * Whether a stated figure traces to one the engine produced.
 *
 * "57.1%" traces to 57.1177; "1.3 million" to 1,345,005; "about 19" to 18.9.
 * A share or a scaled figure may differ from the record by honest rounding —
 * half a unit in the last place printed. A plain count may not: "21 states"
 * must be a 21 the engine computed, unless the sentence says it is rounded.
 */
function traces(figure, allowed) {
  const unit = 10 ** -figure.decimals;
  const plainCount = figure.decimals === 0 && figure.scale === 1 && !figure.rate && !figure.approx;
  if (plainCount) return allowed.some((have) => Math.abs(have) === figure.value);
  const slack = figure.approx ? 0.5 : unit * 0.5 + 1e-9;
  return allowed.some((have) => Math.abs(Math.abs(have) / figure.scale - figure.value) <= slack);
}

/** One sentence: does every figure in it trace? */
export function checkSentence(text, allowed) {
  const figures = figuresIn(text);
  const failed = figures.filter((figure) => !traces(figure, allowed));
  return { ok: failed.length === 0, figures: figures.length, failed: failed.map((figure) => figure.text) };
}

/**
 * Check a written answer. Keeps what traces, drops what does not, and says
 * how much was checked — the card prints that count.
 */
export function checkAnswer(answer, allowed) {
  let checked = 0;
  const dropped = [];

  const keep = (sentence) => {
    const result = checkSentence(sentence, allowed);
    checked += result.figures;
    if (!result.ok) dropped.push({ sentence, figures: result.failed });
    return result.ok;
  };

  const headlineCheck = checkSentence(answer.headline, allowed);
  checked += headlineCheck.figures;
  if (!headlineCheck.ok) dropped.push({ sentence: answer.headline, figures: headlineCheck.failed });

  return {
    headlineOk: headlineCheck.ok,
    reading: (answer.reading ?? []).filter(keep),
    plan: (answer.plan ?? []).filter(keep),
    checked,
    dropped,
  };
}
