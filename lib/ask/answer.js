import { randomUUID } from "node:crypto";

import { run } from "./engine.js";
import { parse } from "./parse.js";
import { write, PROVENANCE } from "./write.js";
import { askModel, modelAvailable } from "./model.js";
import { checkAnswer, figuresFrom } from "./verify.js";
import { seal } from "./sign.js";

/**
 * Ask Poll360, end to end: a question in, a checked and sealed answer out.
 *
 * ── TWO WAYS TO UNDERSTAND, ONE WAY TO COUNT ──────────────────────────────
 * With a model configured, the model understands the question and writes the
 * answer; its writing is checked against the record and anything that does
 * not trace is dropped. Without one — or when it fails, refuses or runs out of
 * time — lib/ask/parse.js understands and lib/ask/write.js writes. Either way
 * the figures come from lib/ask/engine.js, and the method and provenance lines
 * are always Poll360's own, never the model's.
 */

/** How many rows of a table travel to the screen. Files carry the rest. */
export const SCREEN_ROWS = 250;

export async function answer({ question, previous = null, history = [], territory = null, userId, useModel = true }) {
  const askedAt = new Date().toISOString();
  let parsed = parse(question, previous);

  let engine = "poll360";
  let results = [];
  let text = null;
  let checked = null;

  if (useModel && modelAvailable()) {
    const scopeName = territory?.name ?? "Nigeria";
    const reply = await askModel({ question, history, territory, groundName: scopeName }).catch(() => null);
    if (reply && reply.results.length) {
      const chosen = pickResults(reply);
      const own = write(chosen[0]);
      const verdict = checkAnswer(reply.answer, figuresFrom(reply.payloads));
      engine = "model";
      results = chosen;
      text = {
        headline: verdict.headlineOk && reply.answer.headline ? reply.answer.headline : own.headline,
        reading: verdict.reading.length ? [...chosen[0].notes.filter((note) => !verdict.reading.includes(note)), ...verdict.reading] : own.reading,
        plan: verdict.plan,
        method: [...new Set(chosen.flatMap((result) => write(result).method))],
        followups: reply.answer.followups.length ? reply.answer.followups : own.followups,
      };
      checked = { figures: verdict.checked, dropped: verdict.dropped.length };
    } else if (reply && !reply.results.length && reply.answer.headline) {
      /* Outside what Ask Poll360 answers: a redirection, with no figures. */
      const verdict = checkAnswer(reply.answer, figuresFrom([]));
      if (verdict.headlineOk) {
        engine = "model";
        text = { headline: reply.answer.headline, reading: verdict.reading, plan: [], method: [], followups: reply.answer.followups };
        checked = { figures: verdict.checked, dropped: verdict.dropped.length };
      }
    }
  }

  if (!text) {
    let result;
    try {
      result = await run(parsed.plan, { territory });
    } catch (error) {
      /* The last plan came back from the browser. If it no longer runs — an
         old tab, a hand-edited request — the question is answered on its own
         rather than failing on somebody else's plan. */
      if (!previous) throw error;
      parsed = parse(question, null);
      result = await run(parsed.plan, { territory });
    }
    results = [result];
    text = write(result);
    engine = "poll360";
  }

  const first = results[0] ?? null;
  const plans = results.map((result) => result.plan);
  const payload = {
    id: randomUUID(),
    question: String(question),
    askedAt,
    engine,
    plans,
    answer: { headline: text.headline, reading: text.reading, plan: text.plan, method: text.method },
  };

  return {
    ...payload,
    token: seal(payload, userId),
    followups: text.followups ?? [],
    checked,
    understood: first?.understood ?? [],
    scope: first?.scope ?? null,
    who: first ? { name: first.whoLong, short: first.whoName } : null,
    sections: results.flatMap((result) => sectionsForScreen(result)),
  };
}

/** The results the model chose to show, or all of them. */
function pickResults(reply) {
  const map = new Map(reply.results);
  const refs = reply.shown.map((ref) => String(ref).split(".")[0]).filter((ref) => map.has(ref));
  const chosen = [...new Set(refs)].map((ref) => map.get(ref));
  if (chosen.length) return chosen;
  return [reply.results[reply.results.length - 1][1]];
}

export function sectionsForScreen(result) {
  return result.sections.map((section, index) => ({
    id: `${section.level}-${index}`,
    title: section.title,
    level: section.level,
    provenance: section.provenance,
    provenanceLabel: PROVENANCE[section.provenance] ?? PROVENANCE.counted,
    columns: section.columns,
    rows: section.rows.slice(0, SCREEN_ROWS),
    total: section.total,
    read: section.read,
    limited: section.limited ?? null,
    tiles: section.tiles,
  }));
}
