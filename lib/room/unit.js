import { db, results } from "../db.js";
import { ballotFor } from "../races.js";
import { bvasOf } from "../lights.js";
import { assignments } from "./assign.js";
import { inecForUnit } from "./inec.js";
import { pathName, placeName } from "./places.js";
import { corrections, field, items, latestRead, lights, submissions } from "./store.js";

/**
 * Everything the room knows about one polling unit, for the panel that opens
 * on it. Loaded together, once, so the panel is one consistent picture.
 */
export async function unitView(ctx, code) {
  const electionId = ctx.project.id;
  const [light, result, held, history, reports, waiting, contacts, read] = await Promise.all([
    lights.at({ electionId, race: ctx.race, code }),
    results.forUnit(code, electionId, ctx.race),
    assignments.forUnit(code),
    items.history(electionId, code),
    field.incidents({ electionId, ground: { zones: [], codes: [code] }, open: false, take: 20 }),
    submissions.open({ electionId, unitCode: code }),
    field.contacts(electionId, code),
    latestRead(electionId, code),
  ]);

  let extra = null;
  let filer = null;
  let pending = null;
  let made = [];
  let inec = null;
  if (result) {
    [extra, pending, made, inec] = await Promise.all([
      db.prepare("SELECT accredited_agent, accredited_manual FROM results WHERE id = ?").get(result.id),
      corrections.pending(result.id),
      corrections.forResult(result.id),
      inecForUnit(ctx.project, code),
    ]);
    const row = result.coordinatorId
      ? await db.prepare("SELECT name FROM coordinators WHERE id = ?").get(result.coordinatorId)
      : await db.prepare("SELECT name FROM users WHERE id = ?").get(result.submittedBy);
    filer = row?.name ?? null;
  }

  return {
    code,
    name: placeName(code),
    path: pathName(code),
    light,
    result,
    filer,
    parties: ballotFor(ctx.race),
    bvas: result ? bvasOf(result) : null,
    sources: result && { agent: extra?.accredited_agent ?? result.accredited, inec: inec?.accredited ?? null, manual: extra?.accredited_manual ?? null },
    inec,
    hasSheet: Boolean(read?.mediaId),
    readAt: read?.at ?? null,
    held,
    history,
    reports,
    waiting,
    contacts,
    pending,
    corrections: made,
    malpractice: history.some((item) => item.resolution === "CONFIRMED_MALPRACTICE_ESCALATED"),
  };
}
