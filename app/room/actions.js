"use server";

import { revalidatePath } from "next/cache";

import { roomActor } from "@/lib/room/access";
import * as act from "@/lib/room/act";
import { changeByOps, importCommit, importPreview } from "@/lib/room/assign-act";
import { assignments } from "@/lib/room/assign";
import { chooseRace } from "@/lib/election-scope";

/**
 * Every form in the situation room posts here.
 *
 * One action, because every one of them is the same four steps: find out who
 * is asking, read the form, call the function in lib/room/act.js that holds
 * the rule, and say what happened. The rule is never in this file. A field
 * named `do` picks the function; anything it does not name is refused.
 */

const list = (form, name) => form.getAll(name).map(String).filter(Boolean);
const split = (form, name) => String(form.get(name) ?? "").split(/[\s,;]+/).filter(Boolean);

const DO = {
  check: (ctx, f) => act.checkResult(ctx, f.get("unit")),
  correct: (ctx, f) => {
    const votes = {};
    for (const [key, value] of f.entries()) if (key.startsWith("votes_") && value !== "") votes[key.slice(6)] = Number(value);
    return act.correctResult(ctx, f.get("unit"), {
      registered: f.get("registered"), accredited: f.get("accredited"), rejected: f.get("rejected"),
      accreditedManual: f.get("accreditedManual"), votes,
    }, f.get("reason"));
  },
  second: (ctx, f) => act.secondCheck(ctx, f.get("unit"), f.get("accept") === "yes"),
  dispute: (ctx, f) => act.disputeResult(ctx, f.get("unit"), f.get("note")),
  resolve: (ctx, f) => act.resolveItem(ctx, f.get("id"), String(f.get("resolution") ?? ""), f.get("note")),
  take: (ctx, f) => act.takeItem(ctx, f.get("id")),
  release: (ctx, f) => act.releaseItem(ctx, f.get("id")),
  escalate: (ctx, f) => act.escalateItem(ctx, f.get("id"), { to: String(f.get("to") ?? ""), priority: f.get("priority"), note: f.get("note") }),
  giveBack: (ctx, f) => act.returnItem(ctx, f.get("id"), f.get("note")),
  assignItem: (ctx, f) => act.assignItem(ctx, f.get("id"), f.get("owner")),
  legal: (ctx, f) => act.sendItemToLegal(ctx, f.get("id")),
  askField: (ctx, f) => act.askField(ctx, f.get("unit"), f.get("note")),
  acknowledge: (ctx, f) => act.acknowledgeIncident(ctx, f.get("id")),
  assignIncident: (ctx, f) => act.assignIncident(ctx, f.get("id"), f.get("name")),
  resolveIncident: (ctx, f) => act.resolveIncident(ctx, f.get("id")),
  contact: (ctx, f) => act.logContact(ctx, f.get("unit"), String(f.get("outcome") ?? ""), f.get("note")),
  closeSubmission: (ctx, f) => act.closeSubmission(ctx, f.get("id")),
  note: (ctx, f) => act.addNote(ctx, f.get("area"), f.get("body")),
  handOver: (ctx, f) => act.handOver(ctx, f.get("desk"), f.get("body")),
  acceptHandover: (ctx, f) => act.acceptHandover(ctx, f.get("id")),
  lightSettings: (ctx, f) => act.saveLightSettings(ctx, Object.fromEntries(f.entries())),
  staffGround: (ctx, f) => act.setStaffGround(ctx, f.get("user"), { zones: list(f, "zones"), codes: [...list(f, "codes"), ...split(f, "more")] }),
  splitState: (ctx, f) => act.splitState(ctx, f.get("state"), list(f, "users")),
  staffDesks: (ctx, f) => act.setStaffDesks(ctx, f.get("user"), { roles: list(f, "roles"), grants: list(f, "grants") }),
  techRaise: (ctx, f) => act.raiseTech(ctx, { title: f.get("title"), detail: f.get("detail"), severity: String(f.get("severity") ?? "") }),
  techUpdate: (ctx, f) => act.updateTech(ctx, f.get("id"), { status: String(f.get("status") ?? ""), note: f.get("note") }),
  endSessions: (ctx, f) => act.endSessions(ctx, f.get("user")),
  block: (ctx, f) => act.blockAddress(ctx, f.get("ip"), f.get("reason")),
  unblock: (ctx, f) => act.unblockAddress(ctx, f.get("ip")),
  pack: (ctx, f) => act.buildPack(ctx, { title: f.get("title"), note: f.get("note"), itemIds: list(f, "items") }),
  wallCreate: (ctx, f) => act.createWall(ctx, { name: f.get("name"), panels: list(f, "panels") }),
  wallRemove: (ctx, f) => act.removeWall(ctx, f.get("id")),

  /* Assignments. One reason covers the whole request. */
  assign: (ctx, f) => {
    const codes = [...list(f, "codes"), ...split(f, "code")];
    const op = f.get("op") || "assign";
    const ops =
      op === "assign" || op === "assignMany"
        ? [{ op: "assignMany", personId: f.get("person"), codes, role: String(f.get("role") ?? "PRIMARY") }]
        : op === "clearPrimary"
          ? [{ op, codes }]
          : op === "swap"
            ? [{ op, a: f.get("a"), b: f.get("b") }]
            : [{ op, id: f.get("id"), code: codes[0], personId: f.get("person") }];
    return changeByOps(ctx, ops, { reason: String(f.get("reason") ?? ""), note: f.get("note") });
  },
  importPreview: (ctx, f) => importPreview(ctx, f.get("file")),
  importCommit: (ctx, f) => {
    const manual = {};
    for (const [key, value] of f.entries()) if (key.startsWith("manual_")) manual[key.slice(7)] = String(value);
    return importCommit(ctx, String(f.get("id") ?? ""), { manual, end: list(f, "end") });
  },
};

export async function roomDo(_previous, formData) {
  const ctx = await roomActor();
  if (!ctx) return { ok: false, error: "You have been signed out. Sign in again.", at: Date.now() };
  const run = DO[String(formData.get("do") ?? "")];
  if (!run) return { ok: false, error: "That action is not known.", at: Date.now() };
  try {
    const out = await run(ctx, formData);
    if (out.ok) revalidatePath("/room", "layout");
    return { ...out, at: Date.now() };
  } catch (error) {
    console.error("room action failed:", formData.get("do"), error?.message ?? error);
    return { ok: false, error: "That could not be saved just now. Nothing was changed. Try again.", at: Date.now() };
  }
}

/** Find a person on the roster, for the assignment picker. */
export async function findPerson(text) {
  const ctx = await roomActor();
  if (!ctx?.holds("assignments:manage")) return [];
  return assignments.search(text);
}

/** Which of the project's contests this screen is showing. */
export async function pickRace(formData) {
  const ctx = await roomActor();
  if (!ctx) return;
  await chooseRace(String(formData.get("race") ?? ""));
  revalidatePath("/room", "layout");
}
