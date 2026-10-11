import { log } from "../guard.js";
import { REASONS, checkReason } from "../assignments.js";
import { tidyCode } from "../ground.js";
import { exists, pathName } from "./places.js";
import { assignments, changeAssignments, commitImport, previewImport } from "./assign.js";

/**
 * The Super Admin's assignment operations, as the screens and the API name
 * them: assign, replace, add a backup, promote, move, remove, swap, clear.
 *
 * Each is turned into the two things storage understands, rows to end and
 * rows to start, and the whole request is applied together or not at all.
 * Every change carries a reason, and the audit line carries what was there
 * before.
 */

const no = (error, status = 400) => ({ ok: false, error, status });

function allowed(ctx) {
  if (!ctx?.user) return no("Sign in again.", 401);
  if (!ctx.holds("assignments:manage")) return no("Only the Super Admin assigns agents and coordinators.", 403);
  return null;
}

async function expand(op) {
  const code = op.code ? tidyCode(op.code) : null;
  const need = (value, what) => {
    if (!value) throw new Error(what);
    return value;
  };
  const place = (value) => {
    const tidy = need(tidyCode(value), "That is not a place code.");
    if (!exists(tidy)) throw new Error(`INEC lists no place with code ${tidy}.`);
    return tidy;
  };

  switch (op.op) {
    case "assign":
      return { ends: [], starts: [{ personId: need(op.personId, "Choose a person."), code: place(code), role: ["BACKUP", "COORDINATOR"].includes(op.role) ? op.role : "PRIMARY" }] };
    case "assignMany":
      return { ends: [], starts: need(op.codes?.length && op.codes, "Choose at least one place.").map((each) => ({ personId: need(op.personId, "Choose a person."), code: place(each), role: op.role === "COORDINATOR" ? "COORDINATOR" : op.role === "BACKUP" ? "BACKUP" : "PRIMARY" })) };
    case "replace": {
      const held = await assignments.forUnit(place(code));
      return { ends: held.primary ? [held.primary.id] : [], starts: [{ personId: need(op.personId, "Choose a person."), code: place(code), role: "PRIMARY" }] };
    }
    case "end":
      return { ends: [need(op.id, "Choose an assignment.")], starts: [] };
    case "move": {
      const from = need(await assignments.get(op.id), "That assignment is no longer there.");
      return { ends: [from.id], starts: [{ personId: from.personId, code: place(op.code), role: from.role }] };
    }
    case "promote": {
      const backup = need(await assignments.get(op.id), "That assignment is no longer there.");
      const held = await assignments.forUnit(backup.targetCode);
      return { ends: [backup.id, ...(held.primary ? [held.primary.id] : [])], starts: [{ personId: backup.personId, code: backup.targetCode, role: "PRIMARY" }] };
    }
    case "clearPrimary": {
      const ends = [];
      for (const each of need(op.codes?.length && op.codes, "Choose at least one polling unit.")) {
        const held = await assignments.forUnit(place(each));
        if (held.primary) ends.push(held.primary.id);
      }
      return { ends, starts: [] };
    }
    case "swap": {
      const [a, b] = [place(op.a), place(op.b)];
      const [heldA, heldB] = [await assignments.forUnit(a), await assignments.forUnit(b)];
      if (!heldA.primary || !heldB.primary) throw new Error("Both polling units need a primary agent to swap.");
      return {
        ends: [heldA.primary.id, heldB.primary.id],
        starts: [
          { personId: heldA.primary.personId, code: b, role: "PRIMARY" },
          { personId: heldB.primary.personId, code: a, role: "PRIMARY" },
        ],
      };
    }
    default:
      throw new Error("That is not an assignment operation.");
  }
}

/** Apply one or many operations under one reason. All succeed or none do. */
export async function changeByOps(ctx, ops, { reason, note }) {
  const stop = allowed(ctx);
  if (stop) return stop;
  const why = checkReason(reason, note);
  if (why) return no(why);
  if (!Array.isArray(ops) || !ops.length) return no("Nothing to change.");
  if (ops.length > 2000) return no("That is too many changes for one request. Split it.");

  const ends = new Set();
  const starts = [];
  try {
    for (const op of ops) {
      const each = await expand(op);
      each.ends.forEach((id) => ends.add(id));
      starts.push(...each.starts);
    }
  } catch (error) {
    return no(error.message);
  }

  const before = [];
  for (const id of ends) {
    const held = await assignments.get(id);
    if (held) before.push({ name: held.name, place: held.targetCode, role: held.role, source: held.source });
  }
  const text = String(note ?? "").trim().slice(0, 500) || null;
  const done = await changeAssignments({ ends: [...ends], starts, reason, note: text, user: ctx.user, project: ctx.project });
  if (!done.ok) return { ...done, status: 409 };
  await log(ctx.user, "assignment:changed", starts[0]?.code ?? before[0]?.place ?? "", {
    reason: REASONS[reason],
    note: text,
    previous: before,
    now: starts.map((start) => ({ personId: start.personId, place: start.code, role: start.role })),
  });
  return { ok: true, ended: done.ended.length, started: done.started.length };
}

export async function importPreview(ctx, file) {
  const stop = allowed(ctx);
  if (stop) return stop;
  if (!file || typeof file.arrayBuffer !== "function" || !file.size) return no("Choose the party's file first.");
  if (file.size > 25_000_000) return no("That file is over 25MB. Split it by state.");
  if (!/\.(csv|xlsx)$/i.test(file.name ?? "")) return no("The file must be a .csv or an .xlsx.");
  const out = await previewImport({ fileName: file.name, bytes: Buffer.from(await file.arrayBuffer()), user: ctx.user });
  if (out.ok) await log(ctx.user, "assignment:import-previewed", file.name, { preview: out.id });
  return out;
}

export async function importCommit(ctx, id, choices) {
  const stop = allowed(ctx);
  if (stop) return stop;
  const out = await commitImport({ id, choices, user: ctx.user, project: ctx.project });
  if (out.ok) await log(ctx.user, "assignment:import-committed", id, { people: out.people, started: out.started, ended: out.ended, choices });
  return out.ok ? out : { ...out, status: 409 };
}

/** What a confirmation should say before a change is made. */
export async function effectOf(op) {
  if (op.op === "move") {
    const from = await assignments.get(op.id);
    if (from) return `Moving ${from.name} from ${pathName(from.targetCode)} to ${pathName(tidyCode(op.code) ?? "")} removes their access to ${pathName(from.targetCode)} immediately.`;
  }
  return null;
}
