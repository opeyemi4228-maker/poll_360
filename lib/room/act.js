import { results } from "../db.js";
import { log } from "../guard.js";
import { ITEMS, RESOLUTIONS, mayResolve, readSettings } from "../lights.js";
import { ROLES, PERSONAL_GRANTS, rolesOf } from "../roles.js";
import { readGround, statesOfZone, tidyCode, writeGround, ZONE_NAMES, covers as groundCovers } from "../ground.js";
import { ballotFor } from "../races.js";
import { exists, place as placeOf } from "./places.js";
import { corrections, events, field, items, notes, packs, refreshUnitSafely, settings, staff, submissions, tech, walls, lights } from "./store.js";
import { assignments, refreshEveryRace } from "./assign.js";

/**
 * Everything a person in the room can do, with the rule that allows it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Each function takes who is asking (`ctx`, from lib/room/access.js) and
 *  answers `{ ok: true }` or `{ ok: false, error, status }`. The screens call
 *  these through server actions and the API routes call the same functions,
 *  so a button and an endpoint cannot disagree about who may do what, and a
 *  hidden button is never the control.
 *
 *  Three rules are checked here and nowhere else, because they are the ones
 *  that must hold whatever role somebody is given:
 *    · the place is on the asker's ground
 *    · nobody checks, corrects-then-checks, or resolves their own work
 *    · every act is written to the audit log with who and when
 * ══════════════════════════════════════════════════════════════════════════
 */

const no = (error, status = 403) => ({ ok: false, error, status });
const yes = (extra = {}) => ({ ok: true, ...extra });
const text = (value, max = 500) => String(value ?? "").trim().slice(0, max) || null;

const NOT_YOURS = "That place is not on your ground.";
const NO_PROJECT = "No election project is open.";

function gate(ctx, capability, code = null) {
  if (!ctx?.user) return no("Sign in again.", 401);
  if (!ctx.project) return no(NO_PROJECT, 409);
  if (capability && !ctx.holds(capability)) return no("Your account cannot do that.");
  if (code != null && !ctx.covers(code)) return no(NOT_YOURS);
  return null;
}

async function unitResult(ctx, unitCode) {
  const code = tidyCode(unitCode);
  if (!code) return { stop: no("That is not a polling unit code.", 400) };
  const result = await results.forUnit(code, ctx.project.id, ctx.race);
  if (!result) return { stop: no("No result has been filed for that polling unit.", 404) };
  return { code, result };
}

const refresh = (ctx, unitCode, cause) => refreshUnitSafely({ project: ctx.project, race: ctx.race, unitCode, actor: ctx.user, cause });

/* ----------------------------------------------------------------- results */

/** First check: a second person agrees the figures match the sheet. */
export async function checkResult(ctx, unitCode) {
  const stop = gate(ctx, "results:verify", tidyCode(unitCode) ?? "");
  if (stop) return stop;
  const { stop: missing, code, result } = await unitResult(ctx, unitCode);
  if (missing) return missing;
  if (result.status === "VERIFIED") return yes();
  if (result.status === "CORRECTED") return no("This result was corrected. It needs a second check, not a first.", 409);
  if (result.status !== "SUBMITTED") return no("A disputed result cannot be checked.", 409);
  if (result.submittedBy === ctx.user.id) return no("You filed this result. Somebody else has to check it.");
  await results.setStatus(result.id, "VERIFIED", ctx.user.id);
  await log(ctx.user, "result:verified", code, { race: ctx.race });
  await refresh(ctx, code, "Checked by a second person");
  return yes();
}

/**
 * Correct a figure. The one result is updated and waits for a different
 * verifier; until then it shows as corrected and unchecked.
 */
export async function correctResult(ctx, unitCode, figures, reason) {
  const stop = gate(ctx, "results:correct", tidyCode(unitCode) ?? "");
  if (stop) return stop;
  const { stop: missing, code, result } = await unitResult(ctx, unitCode);
  if (missing) return missing;
  if (result.status === "DISPUTED") return no("A disputed result is not corrected. It is ruled on.", 409);
  if (await corrections.pending(result.id)) return no("A correction is already waiting for its second check.", 409);
  if (!text(reason)) return no("Say why the figure is being corrected.", 400);

  const whole = (value) => Number.isInteger(value) && value >= 0;
  const after = {
    registered: Number(figures.registered),
    accredited: Number(figures.accredited),
    rejected: Number(figures.rejected ?? 0),
    accreditedManual: figures.accreditedManual === "" || figures.accreditedManual == null ? null : Number(figures.accreditedManual),
    votes: {},
  };
  for (const party of ballotFor(ctx.race)) after.votes[party.id] = Number(figures.votes?.[party.id] ?? result.votes?.[party.id] ?? 0);
  const all = [after.registered, after.accredited, after.rejected, ...Object.values(after.votes)];
  if (!all.every(whole) || (after.accreditedManual != null && !whole(after.accreditedManual))) {
    return no("Every figure must be a whole number, zero or more.", 400);
  }
  const same =
    after.registered === result.registered && after.accredited === result.accredited && after.rejected === result.rejected &&
    Object.keys(after.votes).every((party) => after.votes[party] === Number(result.votes?.[party] ?? 0)) && after.accreditedManual == null;
  if (same) return no("Nothing was changed.", 400);

  const id = await corrections.make({ result, after, reason: text(reason), user: ctx.user });
  await log(ctx.user, "result:corrected", code, {
    race: ctx.race,
    correction: id,
    before: { registered: result.registered, accredited: result.accredited, rejected: result.rejected, votes: result.votes },
    after,
    reason: text(reason),
  });
  await refresh(ctx, code, "Figures corrected");
  return yes({ id });
}

/** A different verifier confirms a correction, or puts the old figures back. */
export async function secondCheck(ctx, unitCode, accept) {
  const stop = gate(ctx, "results:second-check", tidyCode(unitCode) ?? "");
  if (stop) return stop;
  const { stop: missing, code, result } = await unitResult(ctx, unitCode);
  if (missing) return missing;
  const pending = await corrections.pending(result.id);
  if (!pending) return no("There is no correction waiting on this result.", 409);
  if (pending.madeBy === ctx.user.id) return no("You made this correction. A different verifier has to check it.");
  if (result.submittedBy === ctx.user.id) return no("You filed this result. Somebody else has to check it.");
  if (accept) await corrections.confirm(pending, result.id, ctx.user);
  else await corrections.revert(pending, result.id, ctx.user);
  await log(ctx.user, accept ? "correction:confirmed" : "correction:reverted", code, { race: ctx.race, correction: pending.id });
  await refresh(ctx, code, accept ? "Correction confirmed by a second verifier" : "Correction put back");
  return yes();
}

/** Mark a result disputed. It stays where it is and stops counting. */
export async function disputeResult(ctx, unitCode, note) {
  const stop = gate(ctx, "results:dispute", tidyCode(unitCode) ?? "");
  if (stop) return stop;
  const { stop: missing, code, result } = await unitResult(ctx, unitCode);
  if (missing) return missing;
  if (!text(note)) return no("Say why the result is disputed.", 400);
  if (result.status !== "DISPUTED") await results.setStatus(result.id, "DISPUTED", null);
  await log(ctx.user, "result:disputed", code, { race: ctx.race, note: text(note) });
  await refresh(ctx, code, "Marked disputed");
  return yes();
}

/* ------------------------------------------------------------------- items */

async function itemFor(ctx, id) {
  const item = await items.get(String(id ?? ""));
  if (!item || item.electionId !== ctx.project?.id) return { stop: no("That item is no longer there.", 404) };
  if (!ctx.covers(item.areaCode)) return { stop: no(NOT_YOURS) };
  return { item };
}

export async function resolveItem(ctx, id, resolution, note) {
  const stop = gate(ctx, null);
  if (stop) return stop;
  const { stop: missing, item } = await itemFor(ctx, id);
  if (missing) return missing;
  const how = RESOLUTIONS[resolution];
  const may = mayResolve({ item, resolution, userId: ctx.user.id, holds: ctx.holds, covers: ctx.covers });
  if (!may.ok) return no(may.why);
  if (how.needsNote && !text(note)) return no("A note is required for that.", 400);

  const unit = item.level === "pu";
  const result = unit ? await results.forUnit(item.areaCode, ctx.project.id, item.race) : null;

  if (how.disputes) {
    if (!result) return no("There is no result here to dispute.", 409);
    await results.setStatus(result.id, "DISPUTED", null);
  } else if (item.code === "R_DISPUTED" && result?.status === "DISPUTED" && !how.malpractice) {
    /* Ruled genuine: the result counts again, and is checked again. */
    await results.setStatus(result.id, "SUBMITTED", null);
  }

  if (!(await items.close(item.id, { resolution, note: text(note) }, ctx.user))) return no("Somebody else resolved that first.", 409);
  await log(ctx.user, "item:resolved", item.areaCode, { item: item.code, light: item.light, resolution, note: text(note), race: item.race });
  if (unit) await refreshUnitSafely({ project: ctx.project, race: item.race, unitCode: item.areaCode, actor: ctx.user, cause: how.label });
  return yes();
}

export async function takeItem(ctx, id) {
  const stop = gate(ctx, null);
  if (stop) return stop;
  const { stop: missing, item } = await itemFor(ctx, id);
  if (missing) return missing;
  if (!(await items.take(item.id, ctx.user))) return no(`${item.ownerName ?? "Somebody else"} has this open.`, 409);
  await events.emit(ctx.project.id, "item.taken", item.areaCode, { id: item.id, by: ctx.user.name });
  return yes();
}

export async function releaseItem(ctx, id) {
  const stop = gate(ctx, null);
  if (stop) return stop;
  const { stop: missing, item } = await itemFor(ctx, id);
  if (missing) return missing;
  await items.release(item.id, ctx.user);
  return yes();
}

const ESCALATE_TO = ["ZONE_LEAD", "LEAD_VERIFIER", "DIRECTOR"];

export async function escalateItem(ctx, id, { to, priority, note }) {
  const stop = gate(ctx, null);
  if (stop) return stop;
  /* A zone lead passes upward under the same button. */
  if (!ctx.holds("items:escalate") && !ctx.holds("items:lead")) return no("Your account cannot do that.");
  const { stop: missing, item } = await itemFor(ctx, id);
  if (missing) return missing;
  if (!ESCALATE_TO.includes(to)) return no("Choose who it goes to.", 400);
  if (!text(note)) return no("Say what you need from them.", 400);
  await items.escalate(item.id, { to, priority: priority === "HIGH" ? "HIGH" : "NORMAL", note: text(note) }, ctx.user);
  await log(ctx.user, "item:escalated", item.areaCode, { item: item.code, to, note: text(note) });
  await events.emit(ctx.project.id, "item.escalated", item.areaCode, { id: item.id, to, title: item.title, place: item.place, by: ctx.user.name }, to);
  return yes();
}

export async function returnItem(ctx, id, note) {
  const stop = gate(ctx, "items:lead");
  if (stop) return stop;
  const { stop: missing, item } = await itemFor(ctx, id);
  if (missing) return missing;
  if (!text(note)) return no("Say why it is going back.", 400);
  await items.giveBack(item.id, text(note));
  await log(ctx.user, "item:returned", item.areaCode, { item: item.code, note: text(note) });
  return yes();
}

export async function assignItem(ctx, id, ownerId) {
  const stop = gate(ctx, "items:lead");
  if (stop) return stop;
  const { stop: missing, item } = await itemFor(ctx, id);
  if (missing) return missing;
  const owner = await staff.get(String(ownerId ?? ""));
  if (!owner) return no("That person is not on the roster.", 404);
  await items.assign(item.id, owner);
  await log(ctx.user, "item:assigned", item.areaCode, { item: item.code, to: owner.name });
  await events.emit(ctx.project.id, "item.assigned", item.areaCode, { id: item.id, to: owner.id });
  return yes();
}

export async function sendItemToLegal(ctx, id) {
  const stop = gate(ctx, "items:lead");
  if (stop) return stop;
  const { stop: missing, item } = await itemFor(ctx, id);
  if (missing) return missing;
  await items.sendToLegal(item.id);
  await log(ctx.user, "item:legal", item.areaCode, { item: item.code });
  await events.emit(ctx.project.id, "legal.item", item.areaCode, { id: item.id }, "LEGAL");
  return yes();
}

/** A verifier asks the field to confirm something about a unit. */
export async function askField(ctx, unitCode, note) {
  const code = tidyCode(unitCode);
  const stop = gate(ctx, "results:verify", code ?? "");
  if (stop) return stop;
  if (!code || !text(note)) return no("Say what the field should confirm.", 400);
  await items.open({ electionId: ctx.project.id, race: ctx.race, areaCode: code, code: "Y_FIELD_CONFIRM", ref: String(Date.now()), says: text(note), raisedBy: ctx.user.id });
  await log(ctx.user, "field:asked", code, { note: text(note) });
  await refresh(ctx, code, "Field confirmation requested");
  return yes();
}

/* --------------------------------------------------------------- the field */

async function incidentFor(ctx, id) {
  const incident = await field.incident(String(id ?? ""));
  if (!incident || incident.electionId !== ctx.project?.id) return { stop: no("That report is no longer there.", 404) };
  if (!ctx.covers(incident.unitCode)) return { stop: no(NOT_YOURS) };
  return { incident };
}

export async function acknowledgeIncident(ctx, id) {
  const stop = gate(ctx, "field:act");
  if (stop) return stop;
  const { stop: missing, incident } = await incidentFor(ctx, id);
  if (missing) return missing;
  const first = await field.acknowledge(incident.id, ctx.user);
  if (first) {
    await log(ctx.user, "incident:acknowledged", incident.unitCode, { kind: incident.kind, sos: incident.sos });
    await events.emit(ctx.project.id, "incident.acknowledged", incident.unitCode, { id: incident.id, by: ctx.user.name });
  }
  return yes({ first });
}

export async function assignIncident(ctx, id, name) {
  const stop = gate(ctx, "field:act");
  if (stop) return stop;
  const { stop: missing, incident } = await incidentFor(ctx, id);
  if (missing) return missing;
  await field.assign(incident.id, text(name, 80) ?? "Field operations");
  await log(ctx.user, "incident:assigned", incident.unitCode, { to: text(name, 80) });
  await events.emit(ctx.project.id, "incident.assigned", incident.unitCode, { id: incident.id });
  return yes();
}

export async function resolveIncident(ctx, id) {
  const stop = gate(ctx, "field:act");
  if (stop) return stop;
  const { stop: missing, incident } = await incidentFor(ctx, id);
  if (missing) return missing;
  await field.resolve(incident.id, ctx.user);
  await log(ctx.user, "incident:resolved", incident.unitCode, { kind: incident.kind });
  await refreshEveryRace(ctx.project, incident.unitCode, { actor: ctx.user, cause: "Report from the field dealt with" });
  return yes();
}

const OUTCOMES = { REACHED: "Reached", NO_ANSWER: "No answer", SWITCHED_OFF: "Switched off" };

export async function logContact(ctx, unitCode, outcome, note) {
  const code = tidyCode(unitCode);
  const stop = gate(ctx, "field:act", code ?? "");
  if (stop) return stop;
  if (!code || !OUTCOMES[outcome]) return no("Choose how the call went.", 400);
  const held = await assignments.forUnit(code);
  await field.logContact({ electionId: ctx.project.id, unitCode: code, personId: held.primary?.personId ?? null, outcome, note: text(note), user: ctx.user });
  await log(ctx.user, "field:contact", code, { outcome });
  return yes();
}

export async function closeSubmission(ctx, id) {
  const stop = gate(ctx, null);
  if (stop) return stop;
  if (!ctx.holds("items:resolve-yellow") && !ctx.holds("items:resolve-field")) return no("Your account cannot do that.");
  const closed = await submissions.close(String(id ?? ""), ctx.user);
  if (!closed) return no("That is no longer open.", 404);
  if (!ctx.covers(closed.unitCode)) return no(NOT_YOURS);
  await log(ctx.user, "submission:closed", closed.unitCode);
  await refreshUnitSafely({ project: ctx.project, race: closed.race, unitCode: closed.unitCode, actor: ctx.user, cause: "Submission reviewed" });
  return yes();
}

/* ------------------------------------------------------ notes and handover */

export async function addNote(ctx, areaCode, body) {
  const code = tidyCode(areaCode) ?? "";
  const stop = gate(ctx, "room:read", code);
  if (stop) return stop;
  if (!text(body, 2000)) return no("Write the note first.", 400);
  await notes.add({ electionId: ctx.project.id, areaCode: code, body: text(body, 2000), user: ctx.user });
  await events.emit(ctx.project.id, "note.added", code, null);
  return yes();
}

export async function handOver(ctx, desk, body) {
  const stop = gate(ctx, null);
  if (stop) return stop;
  if (!text(body, 4000)) return no("Write what the next person needs to know.", 400);
  await notes.add({ electionId: ctx.project.id, kind: "HANDOVER", desk: text(desk, 40), body: text(body, 4000), user: ctx.user });
  await log(ctx.user, "handover:left", desk);
  return yes();
}

export async function acceptHandover(ctx, id) {
  const stop = gate(ctx, null);
  if (stop) return stop;
  if (!(await notes.accept(String(id ?? ""), ctx.user))) return no("That handover was already taken, or you wrote it.", 409);
  await log(ctx.user, "handover:accepted", String(id));
  return yes();
}

/* -------------------------------------------------------- the super admin */

export async function saveLightSettings(ctx, values) {
  const stop = gate(ctx, "lights:settings");
  if (stop) return stop;
  const { before, after } = await settings.save(ctx.project.id, readSettings(values), ctx.user);
  await log(ctx.user, "lights:settings", ctx.project.id, { before, after });
  await events.emit(ctx.project.id, "settings.changed", "", null);
  return yes();
}

/**
 * Say which ground a member of the room covers.
 *
 * The Super Admin and the Director may place anybody. A zone lead places
 * observers inside their own zone; a lead verifier places verifiers inside
 * their own ground. Nobody hands out ground they do not hold.
 */
export async function setStaffGround(ctx, userId, { zones = [], codes = [] }) {
  const stop = gate(ctx, "staff:assign");
  if (stop) return stop;
  const person = await staff.get(String(userId ?? ""));
  if (!person) return no("That person is not on the roster.", 404);
  const everywhere = ctx.ground == null;
  if (!everywhere) {
    const mine = rolesOf(ctx.user);
    const theirs = person.roles;
    const allowed = (mine.includes("ZONE_LEAD") && theirs.includes("STATE_OBSERVER")) || (mine.includes("LEAD_VERIFIER") && theirs.includes("VERIFIER"));
    if (!allowed) return no("You can place observers in your zone, or verifiers on your ground, and nobody else.");
    if (zones.length) return no("Only the Super Admin or the Director assigns a whole zone.");
  }
  const tidy = [...new Set(codes.map(tidyCode).filter(Boolean))];
  const bad = tidy.find((code) => !exists(code));
  if (bad) return no(`INEC lists no place with code ${bad}.`, 400);
  if (!everywhere && tidy.some((code) => !groundCovers(ctx.ground, code))) return no("Some of those places are not on your own ground.");
  const ground = { zones: zones.filter((zone) => ZONE_NAMES.includes(zone)), codes: tidy };
  const before = readGround(person.ground);
  await staff.setGround(person.id, writeGround(ground));
  await log(ctx.user, "staff:ground", person.name, { before, after: ground });
  /* Their open screen narrows or widens at once, without signing out. */
  await events.emit(ctx.project.id, "scope.changed", "", { userId: person.id }, `user:${person.id}`);
  return yes();
}

/**
 * Split one state among several observers, by local government.
 *
 * Shared out so each observer carries about the same number of polling
 * units: the largest local government goes to whoever holds least so far.
 * It replaces what each of them held inside that state and leaves the rest of
 * their ground alone. The Super Admin can edit the result afterwards.
 */
export async function splitState(ctx, state, userIds) {
  const stop = gate(ctx, "accounts:issue");
  if (stop) return stop;
  const code = tidyCode(state);
  const here = code && code.length === 2 ? placeOf(code) : null;
  if (!here) return no("Choose the state to split.", 400);
  const people = (await Promise.all([...new Set(userIds.map(String))].map((id) => staff.get(id)))).filter(Boolean);
  if (people.length < 2) return no("Choose at least two observers to split it between.", 400);

  const shares = people.map((person) => ({ person, units: 0, lgas: [] }));
  for (const lga of [...here.children].sort((a, b) => b.units - a.units)) {
    const least = shares.reduce((low, each) => (each.units < low.units ? each : low));
    least.lgas.push(lga.code);
    least.units += lga.units;
  }
  for (const share of shares) {
    const held = readGround(share.person.ground) ?? { zones: [], codes: [] };
    /* A whole zone that contains this state would swallow the split, so the
       zone is spelt out as its other states first. */
    const zoneStates = held.zones.flatMap(statesOfZone).filter((number) => number !== code);
    const kept = [...zoneStates, ...held.codes.filter((each) => each !== code && !each.startsWith(`${code}/`))];
    const ground = { zones: [], codes: [...new Set([...kept, ...share.lgas])] };
    await staff.setGround(share.person.id, writeGround(ground));
    await log(ctx.user, "staff:ground", share.person.name, { split: here.name, after: ground, units: share.units });
    await events.emit(ctx.project.id, "scope.changed", "", { userId: share.person.id }, `user:${share.person.id}`);
  }
  return yes({ said: shares.map((share) => `${share.person.name}: ${share.lgas.length} local governments, ${share.units} polling units`).join(" · ") });
}

/** Which desks an account holds beside its first, and what it is granted by name. */
export async function setStaffDesks(ctx, userId, { roles = [], grants = [] }) {
  const stop = gate(ctx, "accounts:issue");
  if (stop) return stop;
  const person = await staff.get(String(userId ?? ""));
  if (!person) return no("That person is not on the roster.", 404);
  const extra = [...new Set(roles)].filter((role) => ROLES[role]?.room && role !== person.role && role !== "WALL_DEVICE");
  const held = [...new Set(grants)].filter((grant) => PERSONAL_GRANTS[grant]);
  await staff.setDesks(person.id, { roles: extra, grants: held });
  await log(ctx.user, "staff:desks", person.name, { roles: extra, grants: held });
  await events.emit(ctx.project.id, "scope.changed", "", { userId: person.id }, `user:${person.id}`);
  return yes();
}

/* -------------------------------------------------------------------- tech */

export async function raiseTech(ctx, { title, detail, severity }) {
  if (!ctx?.user) return no("Sign in again.", 401);
  if (!ctx.holds("tech:raise")) return no("Your account cannot do that.");
  if (!text(title, 140)) return no("Say what is wrong in a line.", 400);
  const level = ["MINOR", "MAJOR", "CRITICAL"].includes(severity) ? severity : "MINOR";
  const id = await tech.raise({ title: text(title, 140), detail: text(detail, 2000), severity: level, user: ctx.user });
  await log(ctx.user, "tech:raised", id, { title: text(title, 140), severity: level });
  return yes({ id });
}

export async function updateTech(ctx, id, { status, note }) {
  if (!ctx?.user) return no("Sign in again.", 401);
  if (!ctx.holds("tech:run")) return no("Your account cannot do that.");
  if (!["OPEN", "WORKING", "WATCHING", "CLOSED"].includes(status)) return no("Choose where it stands.", 400);
  if (!(await tech.update(String(id ?? ""), { status, note: text(note, 1000), user: ctx.user }))) return no("That incident is no longer there.", 404);
  await log(ctx.user, "tech:updated", String(id), { status });
  return yes();
}

export async function endSessions(ctx, userId) {
  if (!ctx?.user) return no("Sign in again.", 401);
  if (!ctx.holds("security:act")) return no("Your account cannot do that.");
  const person = await staff.get(String(userId ?? ""));
  if (!person) return no("That person is not on the roster.", 404);
  if (person.id === ctx.user.id) return no("Sign out to end your own session.", 400);
  await staff.endSessions(person.id);
  await log(ctx.user, "security:sessions-ended", person.name);
  return yes();
}

const ADDRESS = /^[0-9a-fA-F:.]{3,45}$/;

export async function blockAddress(ctx, ip, reason) {
  if (!ctx?.user) return no("Sign in again.", 401);
  if (!ctx.holds("security:act")) return no("Your account cannot do that.");
  const address = String(ip ?? "").trim();
  if (!ADDRESS.test(address)) return no("That is not an internet address.", 400);
  if (!text(reason)) return no("Say why it is being blocked.", 400);
  await tech.block(address, text(reason), ctx.user);
  await log(ctx.user, "security:blocked", address, { reason: text(reason) });
  return yes();
}

export async function unblockAddress(ctx, ip) {
  if (!ctx?.user) return no("Sign in again.", 401);
  if (!ctx.holds("security:act")) return no("Your account cannot do that.");
  await tech.unblock(String(ip ?? "").trim());
  await log(ctx.user, "security:unblocked", String(ip ?? "").trim());
  return yes();
}

/* ------------------------------------------------------------------- legal */

/**
 * Build an evidence pack: the items chosen, each with the place's light, the
 * result as it stands, every correction made to it and everything that was
 * ever open there. Sealed with a hash of its own contents.
 */
export async function buildPack(ctx, { title, note, itemIds = [] }) {
  const stop = gate(ctx, "evidence:pack");
  if (stop) return stop;
  if (!text(title, 140)) return no("Give the pack a title.", 400);
  const chosen = [...new Set(itemIds.map(String))].slice(0, 200);
  if (!chosen.length) return no("Choose at least one item to put in the pack.", 400);

  const entries = [];
  for (const id of chosen) {
    const item = await items.get(id);
    if (!item || item.electionId !== ctx.project.id) continue;
    const unit = item.level === "pu";
    const result = unit ? await results.forUnit(item.areaCode, ctx.project.id, item.race) : null;
    entries.push({
      item,
      light: await lights.at({ electionId: ctx.project.id, race: item.race, code: item.areaCode }),
      result: result && {
        id: result.id, status: result.status, source: result.source, registered: result.registered, bvasAccredited: result.accredited,
        rejected: result.rejected, votes: result.votes, filedAt: result.submittedAt, checkedAt: result.verifiedAt, sheet: result.sheetMatch,
      },
      corrections: result ? await corrections.forResult(result.id) : [],
      history: await items.history(ctx.project.id, item.areaCode),
    });
  }
  if (!entries.length) return no("None of those items could be found.", 404);
  const built = await packs.build({
    electionId: ctx.project.id,
    title: text(title, 140),
    note: text(note, 2000),
    contents: { project: ctx.project.title ?? ctx.project.id, builtAt: new Date().toISOString(), builtBy: ctx.user.name, entries },
    user: ctx.user,
  });
  await log(ctx.user, "evidence:pack", built.id, { title: text(title, 140), items: entries.length, hash: built.hash });
  return yes(built);
}

/* ------------------------------------------------------------------- walls */

export const WALL_PANELS = { lights: "State lights", bvas: "BVAS accredited", count: "Running count", red: "Open red items", clock: "Clock" };

export async function createWall(ctx, { name, panels = [] }) {
  const stop = gate(ctx, "accounts:issue");
  if (stop) return stop;
  if (!text(name, 60)) return no("Name the screen, so the room knows which wall it is.", 400);
  const chosen = panels.filter((panel) => WALL_PANELS[panel]);
  const made = await walls.create({ name: text(name, 60), layout: { panels: chosen.length ? chosen : ["lights", "bvas"], race: ctx.race, electionId: ctx.project.id }, user: ctx.user });
  await log(ctx.user, "wall:created", made.id, { name: text(name, 60) });
  return yes(made);
}

export async function removeWall(ctx, id) {
  const stop = gate(ctx, "accounts:issue");
  if (stop) return stop;
  await walls.remove(String(id ?? ""));
  await log(ctx.user, "wall:removed", String(id));
  return yes();
}

export { ITEMS, OUTCOMES };
