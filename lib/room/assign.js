import { db } from "../db.js";
import { transaction } from "../sql.js";
import { RACE_IDS, defaultRace } from "../races.js";
import { assignmentStore, checkRows, diffList, parseCsv, parseXlsx, planCommit, toRecords } from "../assignments.js";
import { exists, pathName, place } from "./places.js";
import { events, refreshUnitSafely } from "./store.js";

/**
 * Assignments, wired to storage and to the rest of the room.
 *
 * lib/assignments.js decides; this file is where a decision reaches the
 * database, the agent's phone and the lights.
 */
export const assignments = assignmentStore({ db, transaction });

/** Every contest a unit has a light in, plus the project's own. */
export async function racesAt(project, unitCode) {
  const rows = await db.prepare("SELECT DISTINCT race FROM results WHERE election_id = ? AND unit_code = ?").all(project.id, unitCode);
  return [...new Set([defaultRace(project), ...rows.map((row) => row.race)])].filter((race) => RACE_IDS.includes(race));
}

export async function refreshEveryRace(project, unitCode, extra = {}) {
  if (!project?.id) return;
  for (const race of await racesAt(project, unitCode)) await refreshUnitSafely({ project, race, unitCode, ...extra });
}

/**
 * Change assignments and tell everything that needs to know.
 *
 * An agent taken off a unit loses it at once: their open app is told
 * (`assignment.revoked`) and the filing action asks storage on every filing
 * in any case, so a phone that never hears the event still cannot file.
 */
export async function changeAssignments({ ends = [], starts = [], source = "MANUAL", reason, note, user, project }) {
  const done = await assignments.apply({ ends, starts, source, reason, note, user });
  if (!done.ok) return done;
  for (const ended of done.ended) {
    await events.emit(project?.id ?? null, "assignment.revoked", ended.code, { personId: ended.personId }, `agent:${ended.personId}`);
  }
  for (const personId of done.people) await events.emit(project?.id ?? null, "assignment.changed", "", { personId }, `agent:${personId}`);
  const units = [...new Set([...done.ended, ...done.started].map((row) => row.code).filter((code) => code.split("/").length === 4))];
  await events.emit(project?.id ?? null, "assignment.changed", units[0]?.slice(0, 2) ?? "", { units: units.length });
  /* A unit that gained or lost its agent may now be overdue, or no longer. */
  if (project) for (const code of units.slice(0, 50)) await refreshEveryRace(project, code, { actor: user, cause: "Assignment changed" });
  return done;
}

/** Read the party's file and say what committing it would change. Writes only the preview. */
export async function previewImport({ fileName, bytes, user }) {
  let rows;
  try {
    rows = /\.xlsx$/i.test(fileName) ? parseXlsx(bytes) : parseCsv(bytes.toString("utf8"));
  } catch (error) {
    return { ok: false, error: error?.message ?? "That file could not be read." };
  }
  const { records, missing } = toRecords(rows);
  if (missing.length) return { ok: false, error: `The file is missing these columns: ${missing.join(", ")}.` };
  if (!records.length) return { ok: false, error: "The file has a heading and no rows." };
  if (records.length > 200_000) return { ok: false, error: "That is more rows than one file may hold. Split it by state." };

  const { clean, errors } = checkRows(records, { exists });
  const diff = diffList(clean, await assignments.current());
  const id = await assignments.savePreview({ fileName, preview: { diff, errors, rows: records.length, usable: clean.length }, user });
  return { ok: true, id };
}

const named = (row) => ({ ...row, place: pathName(row.code) });

/** A stored preview, with place names put in for the screen. */
export async function readPreview(id) {
  const stored = await assignments.preview(id);
  if (!stored) return null;
  const { diff, errors, rows, usable } = stored.preview;
  return {
    id: stored.id,
    fileName: stored.fileName,
    committedAt: stored.committedAt,
    rows,
    usable,
    errors,
    newPeople: diff.newPeople,
    newAssignments: diff.newAssignments.map(named),
    changed: diff.changed.map(named),
    missing: diff.missing.map(named),
    manualDiffer: diff.manualDiffer.map(named),
    conflicts: diff.conflicts,
  };
}

/**
 * Commit a preview. Checked again against what is held now, because the
 * roster may have moved between the preview and the click.
 */
export async function commitImport({ id, choices, user, project }) {
  const stored = await assignments.preview(id);
  if (!stored) return { ok: false, error: "That preview is no longer there. Upload the file again." };
  if (stored.committedAt) return { ok: false, error: "That list has already been committed." };
  if (!(await assignments.claimPreview(id))) return { ok: false, error: "That list is being committed already." };

  try {
    const plan = planCommit(stored.preview.diff, choices);
    const ids = await assignments.addPeople(plan.people, user);
    const starts = plan.starts.map((start) => ({ personId: start.personId ?? ids.get(start.key), code: start.code, role: start.role })).filter((start) => start.personId);
    const done = await changeAssignments({ ends: plan.ends, starts, source: "IMPORT", reason: "PARTY_INSTRUCTION", note: stored.fileName, user, project });
    if (!done.ok) {
      await assignments.releasePreview(id);
      return done;
    }
    return { ok: true, people: plan.people.length, started: starts.length, ended: plan.ends.length };
  } catch (error) {
    await assignments.releasePreview(id);
    throw error;
  }
}

/** INEC's units and wards under a place, as plain code lists, for the gaps view. */
export function listed(under) {
  const units = [];
  const wards = [];
  const walk = (code) => {
    const here = place(code);
    if (!here) return;
    const depth = code ? code.split("/").length : 0;
    if (depth === 3) {
      wards.push(code);
      for (const child of here.children) units.push(child.code);
    } else for (const child of here.children) walk(child.code);
  };
  walk(under);
  return { units, wards };
}
