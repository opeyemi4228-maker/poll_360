import { createHash, randomUUID } from "node:crypto";

import { db, declared, results } from "../db.js";
import { cached, invalidate } from "../cache.js";
import { screenAll, screenReturn } from "../anomalies.js";
import { OBSERVED, certification } from "../certification.js";
import { ITEMS, RESOLUTIONS, bvasOf, coverageOf, itemsForUnit, lightOf, readSettings, rollUp, winnerOf } from "../lights.js";
import { WIDTH, childLevel, levelOf, whereGround } from "../ground.js";
import { childrenOn, pathName, place, placeName, unitsOn } from "./places.js";
import { inecForUnit } from "./inec.js";

/**
 * The situation room's storage: open items, the light on each polling unit,
 * and the small records a room keeps about its own night.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE WAY IN: `refreshUnit`
 *
 *  Whatever happens to a polling unit (a result arrives, somebody checks it,
 *  a figure is corrected, an SOS is pressed, an agent is moved), the caller
 *  says "this unit changed" and nothing more. `refreshUnit` reads the facts,
 *  asks lib/lights.js what should be open, opens what is missing, closes what
 *  has ended, and writes the unit's light. So there is one definition of what
 *  is wrong with a unit, and no screen or action computes its own.
 *
 *  A light is therefore changed where it is stored, as things happen, and
 *  reading one is an indexed sum over `unit_lights`. Nothing here scans the
 *  results to draw a board.
 * ══════════════════════════════════════════════════════════════════════════
 */

const iso = (value) => (value ? new Date(value).toISOString() : "");
const json = (text, fallback = null) => {
  try {
    return text == null ? fallback : JSON.parse(text);
  } catch {
    return fallback;
  }
};
const SYSTEM = "Poll360";
const lightsKey = (electionId) => `room:lights:${electionId}`;

/* ---------------------------------------------------------------- settings */

export const settings = {
  async get(electionId) {
    if (!electionId) return readSettings(null);
    const row = await db.prepare("SELECT settings FROM room_settings WHERE election_id = ?").get(electionId);
    return readSettings(json(row?.settings));
  },

  /** Returns `{ before, after }` so the caller can audit both. */
  async save(electionId, values, user) {
    const before = await settings.get(electionId);
    const after = readSettings({ ...before, ...values });
    await db
      .prepare(
        `INSERT INTO room_settings (election_id, settings, updated_by) VALUES (?, ?, ?)
         ON CONFLICT (election_id) DO UPDATE SET settings = excluded.settings, updated_by = excluded.updated_by, updated_at = now()`
      )
      .run(electionId, JSON.stringify(after), user?.id ?? null);
    return { before, after };
  },
};

const passed = (deadline) => {
  if (!deadline) return false;
  const when = new Date(deadline);
  return !Number.isNaN(when.getTime()) && when.getTime() <= Date.now();
};

/* ------------------------------------------------------------------ events */

export const events = {
  /**
   * Tell every open screen something happened. `areaCode` is where; a screen
   * hears only what is on its ground. Never throws: an event that could not
   * be written must not undo the thing it was announcing.
   */
  async emit(electionId, type, areaCode = "", payload = null, audience = null) {
    try {
      await db
        .prepare("INSERT INTO room_events (election_id, type, area_code, audience, payload) VALUES (?, ?, ?, ?, ?)")
        .run(electionId ?? null, type, areaCode ?? "", audience, payload ? JSON.stringify(payload) : null);
    } catch (error) {
      console.error("room event not written:", type, error?.message ?? error);
    }
  },

  async latest() {
    const row = await db.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM room_events").get();
    return Number(row?.seq ?? 0);
  },

  /** Everything after `seq`, newest last. Narrowing to a ground is the caller's. */
  async since(seq, take = 200) {
    const rows = await db
      .prepare("SELECT seq, election_id, type, area_code, audience, payload, created_at FROM room_events WHERE seq > ? ORDER BY seq LIMIT ?")
      .all(Number(seq) || 0, take);
    return rows.map((row) => ({
      seq: Number(row.seq),
      electionId: row.election_id,
      type: row.type,
      areaCode: row.area_code,
      audience: row.audience,
      payload: json(row.payload, {}),
      at: iso(row.created_at),
    }));
  },

  /** Events are a doorbell, not a record. A day of them is plenty. */
  async sweep() {
    await db.prepare("DELETE FROM room_events WHERE created_at < now() - interval '1 day'").run();
  },
};

/* ------------------------------------------------------------------- items */

const toItem = (row) =>
  row && {
    id: row.id,
    electionId: row.election_id,
    race: row.race,
    areaCode: row.area_code,
    level: row.level,
    place: pathName(row.area_code),
    code: row.code,
    light: row.light,
    title: ITEMS[row.code]?.title ?? row.code,
    desk: ITEMS[row.code]?.desk ?? "verify",
    closes: ITEMS[row.code]?.closes ?? "person",
    person: Boolean(ITEMS[row.code]?.person),
    ref: row.ref,
    says: row.says,
    status: row.status,
    raisedBy: row.raised_by,
    filedBy: row.filed_by,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    locked: Boolean(row.locked_until && new Date(row.locked_until) > new Date()),
    escalatedTo: row.escalated_to,
    escalatedName: row.escalated_name,
    escalatedAt: iso(row.escalated_at) || null,
    escalationNote: row.escalation_note,
    priority: row.priority,
    returnedNote: row.returned_note,
    legal: Boolean(row.legal),
    resolution: row.resolution,
    resolutionNote: row.resolution_note,
    resolvedName: row.resolved_name,
    resolvedAt: iso(row.resolved_at) || null,
    openedAt: iso(row.opened_at),
  };

/* How long a person holds an item they took before it frees itself. Long
   enough to read a sheet, short enough that a closed laptop does not strand
   a red item for the night. */
const LOCK_MINUTES = 10;

export const items = {
  async get(id) {
    return toItem(await db.prepare("SELECT * FROM room_items WHERE id = ?").get(id));
  },

  /**
   * Items on a ground. `under` narrows to one place, `desk` to one queue,
   * `escalatedTo` to an inbox. Red first, then oldest first: age is what a
   * room ranks by.
   */
  async list({ electionId, race = null, ground = null, under = "", status = "OPEN", light = null, desk = null, escalatedTo = null, legal = false, take = 200 }) {
    if (!electionId) return [];
    const where = whereGround(ground, "area_code");
    const clauses = [];
    const params = [electionId];
    if (race) clauses.push("race = ?"), params.push(race);
    if (status) clauses.push("status = ?"), params.push(status);
    if (light) clauses.push("light = ?"), params.push(light);
    if (under) clauses.push("(area_code = ? OR area_code LIKE ?)"), params.push(under, `${under}/%`);
    if (escalatedTo) clauses.push("escalated_to = ?"), params.push(escalatedTo);
    if (legal) clauses.push("legal");
    if (desk) {
      const codes = Object.keys(ITEMS).filter((code) => ITEMS[code].desk === desk);
      clauses.push(`code IN (${codes.map(() => "?").join(", ")})`);
      params.push(...codes);
    }
    const rows = await db
      .prepare(
        `SELECT * FROM room_items
          WHERE election_id = ?${clauses.map((clause) => ` AND ${clause}`).join("")}${where.sql}
          ORDER BY (light = 'RED') DESC, opened_at LIMIT ?`
      )
      .all(...params, ...where.params, take);
    return rows.map(toItem);
  },

  /** Everything that was ever open on one place, newest first. */
  async history(electionId, areaCode, take = 60) {
    const rows = await db
      .prepare("SELECT * FROM room_items WHERE election_id = ? AND area_code = ? ORDER BY opened_at DESC LIMIT ?")
      .all(electionId, areaCode, take);
    return rows.map(toItem);
  },

  /**
   * Take an item. Refused when somebody else holds it, so two people do not
   * read the same sheet. The lock frees itself after a few minutes.
   */
  async take(id, user) {
    const rows = await db
      .prepare(
        `UPDATE room_items SET owner_id = ?, owner_name = ?, locked_until = now() + interval '${LOCK_MINUTES} minutes'
          WHERE id = ? AND status = 'OPEN'
            AND (owner_id IS NULL OR owner_id = ? OR locked_until IS NULL OR locked_until < now())
        RETURNING id`
      )
      .all(user.id, user.name, id, user.id);
    return rows.length > 0;
  },

  async release(id, user) {
    await db.prepare("UPDATE room_items SET locked_until = NULL, owner_id = NULL, owner_name = NULL WHERE id = ? AND owner_id = ?").run(id, user.id);
  },

  /** Hand an item to a named person. They own it; nobody has it locked. */
  async assign(id, owner) {
    await db.prepare("UPDATE room_items SET owner_id = ?, owner_name = ?, locked_until = NULL WHERE id = ? AND status = 'OPEN'").run(owner.id, owner.name, id);
  },

  async escalate(id, { to, priority = "NORMAL", note = null }, user) {
    await db
      .prepare(
        `UPDATE room_items SET escalated_to = ?, escalated_by = ?, escalated_name = ?, escalated_at = now(),
                escalation_note = ?, priority = ?, returned_note = NULL, owner_id = NULL, owner_name = NULL, locked_until = NULL
          WHERE id = ? AND status = 'OPEN'`
      )
      .run(to, user.id, user.name, note, priority, id);
  },

  /** Send an escalation back to whoever raised it, with a note. */
  async giveBack(id, note) {
    await db
      .prepare(
        `UPDATE room_items SET escalated_to = NULL, returned_note = ?, owner_id = escalated_by, owner_name = escalated_name, locked_until = NULL
          WHERE id = ? AND status = 'OPEN'`
      )
      .run(note, id);
  },

  async sendToLegal(id) {
    await db.prepare("UPDATE room_items SET legal = true WHERE id = ?").run(id);
  },

  /** Open an item by hand: a request to the field, an area finding. */
  async open({ electionId, race, areaCode, code, ref = "", says = null, raisedBy = null }) {
    const id = randomUUID();
    const rows = await db
      .prepare(
        `INSERT INTO room_items (id, election_id, race, area_code, level, code, light, ref, says, raised_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (election_id, race, area_code, code, ref) WHERE status = 'OPEN' DO NOTHING
         RETURNING id`
      )
      .all(id, electionId, race, areaCode, levelOf(areaCode), code, ITEMS[code].light, ref, says, raisedBy);
    if (rows.length) {
      invalidate(lightsKey(electionId));
      await events.emit(electionId, "item.opened", areaCode, { id, code, light: ITEMS[code].light, title: ITEMS[code].title, person: Boolean(ITEMS[code].person) });
    }
    return rows.length ? id : null;
  },

  /**
   * Close an item. Whether this person may is decided before this is called
   * (lib/lights.js `mayResolve`); this only records it. Returns false when
   * somebody else closed it first.
   */
  async close(id, { resolution, note = null }, user) {
    const how = RESOLUTIONS[resolution];
    const rows = await db
      .prepare(
        `UPDATE room_items SET status = 'RESOLVED', resolution = ?, resolution_note = ?, resolved_by = ?, resolved_name = ?,
                resolved_at = now(), locked_until = NULL, legal = legal OR ?
          WHERE id = ? AND status = 'OPEN' RETURNING election_id, area_code, code, light`
      )
      .all(resolution, note, user?.id ?? null, user?.name ?? SYSTEM, Boolean(how?.malpractice), id);
    if (!rows.length) return false;
    invalidate(lightsKey(rows[0].election_id));
    await events.emit(rows[0].election_id, "item.resolved", rows[0].area_code, { id, code: rows[0].code, light: rows[0].light, resolution });
    return true;
  },

  /**
   * A red item nobody has owned for too long goes to the Director by itself,
   * so "nobody picked it up" is never how a red item is lost.
   */
  async escalateUnowned(electionId, minutes) {
    const rows = await db
      .prepare(
        `UPDATE room_items SET escalated_to = 'DIRECTOR', escalated_name = ?, escalated_at = now(),
                escalation_note = 'Open with no owner past the limit', priority = 'HIGH'
          WHERE election_id = ? AND status = 'OPEN' AND light = 'RED' AND owner_id IS NULL AND escalated_to IS NULL
            AND opened_at < now() - (? * interval '1 minute')
        RETURNING id, area_code`
      )
      .all(SYSTEM, electionId, minutes);
    for (const row of rows) await events.emit(electionId, "item.escalated", row.area_code, { id: row.id, to: "DIRECTOR" });
    return rows.length;
  },
};

/* ------------------------------------------------------------------ lights */

async function stateLight(electionId, race, state) {
  const row = await db
    .prepare(
      `SELECT count(*) FILTER (WHERE light = 'RED') AS red, count(*) FILTER (WHERE light = 'YELLOW') AS yellow,
              count(*) FILTER (WHERE light = 'GREEN') AS green
         FROM unit_lights WHERE election_id = ? AND race = ? AND unit_code LIKE ?`
    )
    .get(electionId, race, `${state}/%`);
  return rollUp({ red: Number(row?.red ?? 0), yellow: Number(row?.yellow ?? 0), green: Number(row?.green ?? 0) });
}

/**
 * Bring one polling unit's items and light up to date with the facts.
 *
 * `actor` is who caused the change, recorded on anything that closes because
 * of it. Safe to call twice, and safe to call for a unit nothing changed on.
 */
export async function refreshUnit({ project, race, unitCode, actor = null, cause = "" }) {
  const electionId = project?.id;
  if (!electionId || !race || !unitCode) return null;
  const state = unitCode.slice(0, 2);

  const [result, incidentRows, pendingRows, held, rules, assigned, before] = await Promise.all([
    results.forUnit(unitCode, electionId, race),
    db.prepare("SELECT id, kind, severity, sos FROM incidents WHERE election_id = ? AND unit_code = ? AND status = 'OPEN'").all(electionId, unitCode),
    db.prepare("SELECT kind, count(*) AS n FROM submissions WHERE election_id = ? AND race = ? AND unit_code = ? AND status = 'OPEN' GROUP BY kind").all(electionId, race, unitCode),
    db.prepare("SELECT id, code, ref, status, stamp, resolution, resolved_by FROM room_items WHERE election_id = ? AND race = ? AND area_code = ?").all(electionId, race, unitCode),
    settings.get(electionId),
    db.prepare("SELECT 1 AS yes FROM assignments WHERE target_code = ? AND ended_at IS NULL LIMIT 1").get(unitCode),
    stateLight(electionId, race, state),
  ]);

  const extra = result
    ? await db.prepare("SELECT accredited_manual, corrected_at, submitted_at, submitted_by, sheet_match FROM results WHERE id = ?").get(result.id)
    : null;
  const inec = result || passed(rules.inecDeadline) ? await inecForUnit(project, unitCode) : null;
  const pending = Object.fromEntries(pendingRows.map((row) => [row.kind, Number(row.n)]));
  const sheetRead = result ? await latestRead(electionId, unitCode) : null;
  const sheet = json(extra?.sheet_match);

  const wanted = itemsForUnit({
    result: result && { ...result, accreditedManual: extra?.accredited_manual ?? null },
    inec,
    certification: marksOn(sheetRead),
    findings: result ? screenReturn(result) : [],
    incidents: incidentRows.map((row) => ({ id: row.id, kind: row.kind, severity: row.severity, sos: Boolean(row.sos) })),
    pending: {
      conflicting: pending.CONFLICTING_SUBMISSION ?? 0,
      correctionRequests: pending.CORRECTION_REQUEST ?? 0,
      /* A sheet that was attached and could not be read at all. */
      unreadable: Boolean(sheet && sheet.compared === false),
    },
    overdue: Boolean(assigned) && passed(rules.returnDeadline),
    inecOverdue: passed(rules.inecDeadline),
    settings: rules,
  });

  /* Which version of the facts this is. A person's ruling on an item stands
     until the figures under it change. */
  const stamp = result ? `${iso(extra?.submitted_at)}|${iso(extra?.corrected_at)}` : "";
  const key = (row) => `${row.code}|${row.ref ?? ""}`;
  const open = new Map(held.filter((row) => row.status === "OPEN").map((row) => [key(row), row]));
  const ruled = new Set(
    held.filter((row) => row.status === "RESOLVED" && row.resolved_by && row.stamp === stamp).map(key)
  );
  const wantedKeys = new Set(wanted.map((item) => key({ code: item.code, ref: item.ref ?? "" })));

  for (const item of wanted) {
    const itemKey = key({ code: item.code, ref: item.ref ?? "" });
    if (open.has(itemKey) || ruled.has(itemKey)) continue;
    const id = randomUUID();
    const rows = await db
      .prepare(
        `INSERT INTO room_items (id, election_id, race, area_code, level, code, light, ref, says, filed_by, stamp)
         VALUES (?, ?, ?, ?, 'pu', ?, ?, ?, ?, ?, ?)
         ON CONFLICT (election_id, race, area_code, code, ref) WHERE status = 'OPEN' DO NOTHING
         RETURNING id`
      )
      .all(id, electionId, race, unitCode, item.code, ITEMS[item.code].light, item.ref ?? "", item.says, extra?.submitted_by ?? null, stamp);
    if (rows.length) {
      await events.emit(electionId, "item.opened", unitCode, {
        id,
        code: item.code,
        light: ITEMS[item.code].light,
        title: ITEMS[item.code].title,
        person: Boolean(ITEMS[item.code].person),
        place: pathName(unitCode),
      });
    }
  }

  /* What was open and is no longer true. An item raised by hand (a request
     to the field) is not derived from the figures and is left alone. */
  const BY_HAND = new Set(["Y_FIELD_CONFIRM"]);
  for (const [itemKey, row] of open) {
    if (wantedKeys.has(itemKey) || BY_HAND.has(row.code)) continue;
    await db
      .prepare(
        `UPDATE room_items SET status = 'RESOLVED', resolution = 'NO_LONGER_APPLIES', resolution_note = ?, resolved_name = ?,
                resolved_at = now(), locked_until = NULL
          WHERE id = ? AND status = 'OPEN'`
      )
      .run(cause || "The facts changed", actor?.name ?? SYSTEM, row.id);
    await events.emit(electionId, "item.resolved", unitCode, { id: row.id, code: row.code });
  }

  const now = await db
    .prepare(
      `SELECT count(*) FILTER (WHERE status = 'OPEN' AND light = 'RED') AS red,
              count(*) FILTER (WHERE status = 'OPEN' AND light = 'YELLOW') AS yellow,
              bool_or(resolution = 'CONFIRMED_MALPRACTICE_ESCALATED') AS malpractice
         FROM room_items WHERE election_id = ? AND race = ? AND area_code = ?`
    )
    .get(electionId, race, unitCode);
  const red = Number(now?.red ?? 0);
  const yellow = Number(now?.yellow ?? 0);
  const bvas = bvasOf(result);
  const disputed = result?.status === "DISPUTED";
  const light = lightOf({
    red,
    yellow,
    hasResult: Boolean(result),
    /* Checked by a second person, or disputed and ruled on. */
    checked: result?.status === "VERIFIED" || (disputed && red === 0 && yellow === 0),
  });

  await db
    .prepare(
      `INSERT INTO unit_lights (election_id, race, unit_code, light, red, yellow, has_result, checked, counts,
                                accredited, registered, cast_votes, rejected, malpractice, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
       ON CONFLICT (election_id, race, unit_code) DO UPDATE SET
         light = excluded.light, red = excluded.red, yellow = excluded.yellow, has_result = excluded.has_result,
         checked = excluded.checked, counts = excluded.counts, accredited = excluded.accredited,
         registered = excluded.registered, cast_votes = excluded.cast_votes, rejected = excluded.rejected,
         malpractice = excluded.malpractice, updated_at = now()`
    )
    .run(
      electionId, race, unitCode, light, red, yellow, Boolean(result), result?.status === "VERIFIED", Boolean(result) && !disputed,
      bvas.accredited, result ? bvas.registered : null, result ? bvas.cast : null, result ? bvas.rejected : null, Boolean(now?.malpractice)
    );

  invalidate(lightsKey(electionId));
  const after = await stateLight(electionId, race, state);
  if (after !== before) {
    await events.emit(electionId, "light.changed", state, { level: "state", from: before, to: after, name: placeName(state) });
  }
  await events.emit(electionId, "coverage.updated", unitCode, null);
  return { light, red, yellow };
}

/** Never let the room's bookkeeping fail the thing that caused it. */
export async function refreshUnitSafely(args) {
  try {
    return await refreshUnit(args);
  } catch (error) {
    console.error("unit light not refreshed:", args?.unitCode, error?.message ?? error);
    return null;
  }
}

/** The newest reading of this unit's sheet, with the photograph it came from. */
export async function latestRead(electionId, unitCode) {
  try {
    const row = await db
      .prepare("SELECT id, media_id, parsed, corrected, created_at FROM sheet_reads WHERE election_id = ? AND unit_code = ? ORDER BY created_at DESC LIMIT 1")
      .get(electionId, unitCode);
    return row ? { id: row.id, mediaId: row.media_id, parsed: json(row.parsed, {}), at: iso(row.created_at) } : null;
  } catch {
    return null;
  }
}

/**
 * Signature, stamp and officer's name as the lights read them: present,
 * absent, or unknown. Null when the reader that read this sheet could not
 * see such marks at all, which is not the same as their being unclear and
 * must not turn every optically read sheet yellow.
 */
function marksOn(read) {
  if (!read?.parsed?.certification) return null;
  const seen = certification(read.parsed);
  const word = (state) => (state === OBSERVED.PRESENT ? "present" : state === OBSERVED.ABSENT ? "absent" : "unknown");
  return { signature: word(seen.signature), stamp: word(seen.stamp), officer: seen.officer ? "present" : "unknown" };
}

const SUMS = `
  count(*) FILTER (WHERE light = 'RED') AS red,
  count(*) FILTER (WHERE light = 'YELLOW') AS yellow,
  count(*) FILTER (WHERE light = 'GREEN') AS green,
  count(*) FILTER (WHERE has_result) AS reported,
  count(*) FILTER (WHERE has_result AND checked) AS checked,
  COALESCE(sum(accredited) FILTER (WHERE counts AND accredited IS NOT NULL), 0) AS accredited,
  COALESCE(sum(registered) FILTER (WHERE counts AND accredited IS NOT NULL), 0) AS registered,
  COALESCE(sum(cast_votes) FILTER (WHERE counts AND accredited IS NOT NULL), 0) AS cast_votes,
  COALESCE(sum(rejected) FILTER (WHERE counts AND accredited IS NOT NULL), 0) AS rejected,
  count(*) FILTER (WHERE counts AND accredited IS NOT NULL) AS with_bvas,
  count(*) FILTER (WHERE has_result AND accredited IS NULL) AS bvas_missing,
  count(*) FILTER (WHERE has_result AND accredited IS NOT NULL AND cast_votes + rejected > accredited) AS overvoted,
  count(*) FILTER (WHERE malpractice) AS malpractice,
  max(updated_at) AS updated_at`;

function shape(code, name, total, row = {}, area = {}) {
  const n = (value) => Number(value ?? 0);
  const red = n(row.red);
  const yellow = n(row.yellow);
  const green = n(row.green);
  const reported = n(row.reported);
  const accredited = n(row.with_bvas) ? n(row.accredited) : null;
  const registered = n(row.registered);
  const cast = n(row.cast_votes);
  const rejected = n(row.rejected);
  return {
    code,
    name,
    level: levelOf(code),
    light: rollUp({ red, yellow, green, areaRed: n(area.red), areaYellow: n(area.yellow) }),
    /* Grey is what INEC lists less what has a light. Never less than zero:
       a result filed for a unit the list does not hold is still a result. */
    counts: { red, yellow, green, grey: Math.max(0, total - red - yellow - green) },
    areaItems: { red: n(area.red), yellow: n(area.yellow) },
    total,
    reported,
    checked: n(row.checked),
    coveragePct: coverageOf(reported, total),
    bvas: {
      accredited,
      registered,
      cast,
      rejected,
      headroom: accredited == null ? null : accredited - (cast + rejected),
      turnout: accredited != null && registered > 0 ? (accredited / registered) * 100 : null,
      units: n(row.with_bvas),
      coveragePct: coverageOf(n(row.with_bvas), total),
      missing: n(row.bvas_missing),
      overvoted: n(row.overvoted),
    },
    malpractice: n(row.malpractice),
    updatedAt: iso(row.updated_at) || null,
  };
}

export const lights = {
  /**
   * The light on one place, with its counts, coverage and BVAS.
   * `ground` narrows it to what the reader holds inside that place.
   */
  async at({ electionId, race, code = "", ground = null }) {
    return cached(`${lightsKey(electionId)}:at:${race}:${code}:${JSON.stringify(ground)}`, async () => {
      const where = whereGround(ground, "unit_code");
      const whereArea = whereGround(ground, "area_code");
      const like = code ? `${code}/%` : "%";
      const [row, area] = await Promise.all([
        db.prepare(`SELECT ${SUMS} FROM unit_lights WHERE election_id = ? AND race = ? AND (unit_code = ? OR unit_code LIKE ?)${where.sql}`)
          .get(electionId, race, code, like, ...where.params),
        db.prepare(
          `SELECT count(*) FILTER (WHERE light = 'RED') AS red, count(*) FILTER (WHERE light = 'YELLOW') AS yellow
             FROM room_items WHERE election_id = ? AND race = ? AND status = 'OPEN' AND level <> 'pu'
              AND (area_code = ? OR area_code LIKE ?)${whereArea.sql}`
        ).get(electionId, race, code, like, ...whereArea.params),
      ]);
      return shape(code, placeName(code) || "Nigeria", unitsOn(code, ground), row, area);
    }, { ttlMs: 1500 });
  },

  /** The lights on every place directly under one. Grey places included. */
  async under({ electionId, race, code = "", ground = null }) {
    return cached(`${lightsKey(electionId)}:under:${race}:${code}:${JSON.stringify(ground)}`, async () => {
      const level = childLevel(levelOf(code));
      if (!level) return [];
      const width = WIDTH[level];
      const where = whereGround(ground, "unit_code");
      const whereArea = whereGround(ground, "area_code");
      const like = code ? `${code}/%` : "%";
      const [rows, areaRows] = await Promise.all([
        db.prepare(
          `SELECT substr(unit_code, 1, ${width}) AS code, ${SUMS}
             FROM unit_lights WHERE election_id = ? AND race = ? AND unit_code LIKE ?${where.sql} GROUP BY 1`
        ).all(electionId, race, like, ...where.params),
        db.prepare(
          `SELECT substr(area_code, 1, ${width}) AS code,
                  count(*) FILTER (WHERE light = 'RED') AS red, count(*) FILTER (WHERE light = 'YELLOW') AS yellow
             FROM room_items WHERE election_id = ? AND race = ? AND status = 'OPEN' AND level <> 'pu'
              AND area_code LIKE ? AND length(area_code) >= ${width}${whereArea.sql} GROUP BY 1`
        ).all(electionId, race, like, ...whereArea.params),
      ]);
      const byCode = new Map(rows.map((row) => [row.code, row]));
      const areaByCode = new Map(areaRows.map((row) => [row.code, row]));
      return childrenOn(code, ground).map((child) => shape(child.code, child.name, child.units, byCode.get(child.code), areaByCode.get(child.code)));
    }, { ttlMs: 1500 });
  },

  /** Results received in the last ten minutes, per minute. */
  async rate(electionId, race) {
    const row = await db
      .prepare("SELECT count(*) AS n FROM results WHERE election_id = ? AND race = ? AND submitted_at > now() - interval '10 minutes'")
      .get(electionId, race);
    return Math.round((Number(row?.n ?? 0) / 10) * 10) / 10;
  },

  /** Units carrying a permanent "malpractice confirmed" marker. */
  async malpractice({ electionId, race, ground = null, take = 200 }) {
    const where = whereGround(ground, "area_code");
    const rows = await db
      .prepare(
        `SELECT * FROM room_items WHERE election_id = ? AND race = ? AND resolution = 'CONFIRMED_MALPRACTICE_ESCALATED'${where.sql}
          ORDER BY resolved_at DESC LIMIT ?`
      )
      .all(electionId, race, ...where.params, take);
    return rows.map(toItem);
  },
};

/* --------------------------------------------------------- the night's sweep */

/**
 * The things that become true because time passed, not because somebody did
 * something: a return that is now overdue, a red item nobody picked up.
 *
 * One process at a time and at most once a minute, decided in the database,
 * so sixty open screens asking do not run it sixty times.
 */
export async function sweep(project, race) {
  if (!project?.id || !race) return { ran: false };
  const turn = await db
    .prepare(
      `INSERT INTO room_settings (election_id, settings, updated_at) VALUES (?, '{}', now())
       ON CONFLICT (election_id) DO NOTHING RETURNING election_id`
    )
    .all(`sweep:${project.id}:${race}`);
  if (!turn.length) {
    const mine = await db
      .prepare("UPDATE room_settings SET updated_at = now() WHERE election_id = ? AND updated_at < now() - interval '55 seconds' RETURNING election_id")
      .all(`sweep:${project.id}:${race}`);
    if (!mine.length) return { ran: false };
  }

  const rules = await settings.get(project.id);
  let overdue = 0;

  if (passed(rules.returnDeadline)) {
    /* Every assigned unit with no result and no overdue item yet. Done one
       unit at a time through the one way in, a batch at a time, so a sweep
       never holds the database for a whole country. */
    const rows = await db
      .prepare(
        `SELECT DISTINCT a.target_code AS unit_code FROM assignments a
          WHERE a.target_type = 'PU' AND a.ended_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM results r WHERE r.election_id = ? AND r.race = ? AND r.unit_code = a.target_code)
            AND NOT EXISTS (SELECT 1 FROM room_items i WHERE i.election_id = ? AND i.race = ? AND i.area_code = a.target_code
                               AND i.code = 'Y_OVERDUE_RETURN' AND i.status = 'OPEN')
          LIMIT 150`
      )
      .all(project.id, race, project.id, race);
    for (const row of rows) await refreshUnitSafely({ project, race, unitCode: row.unit_code, cause: "Deadline passed" });
    overdue = rows.length;
  }

  /* Results that have no light yet: filed before the room kept lights, or
     filed while the room's bookkeeping could not be reached. Picked up here
     a batch at a time, so the lights heal themselves and nobody has to run
     anything to bring an old project in. */
  const unlit = await db
    .prepare(
      `SELECT r.unit_code FROM results r
        WHERE r.election_id = ? AND r.race = ?
          AND NOT EXISTS (SELECT 1 FROM unit_lights l WHERE l.election_id = r.election_id AND l.race = r.race AND l.unit_code = r.unit_code)
        LIMIT 40`
    )
    .all(project.id, race);
  for (const row of unlit) await refreshUnitSafely({ project, race, unitCode: row.unit_code, cause: "Brought into the lights" });

  const areas = await sweepAreas(project, race);

  const escalated = await items.escalateUnowned(project.id, rules.unownedRedMinutes);
  await events.sweep();
  return { ran: true, overdue, escalated, lit: unlit.length, areas };
}

/**
 * The two findings that belong to an area and never to one polling unit.
 *
 * A pattern in the last digits of a state's figures, which is a fact about a
 * batch and accuses nobody: it is only ever yellow. And an announced winner
 * that differs from the winner of our own checked count for the same place,
 * which is red.
 *
 * Both need every result in the project, so they run every fifth minute and
 * not on every sweep. An area item a person has ruled on is not raised again
 * for six hours.
 */
async function sweepAreas(project, race) {
  if (new Date().getMinutes() % 5 !== 0) return 0;
  const [rows, announced] = await Promise.all([results.counted(project.id, race), declared.all(project.id, race).catch(() => [])]);
  const settled = async (areaCode, code, ref) =>
    Boolean(
      await db
        .prepare(
          `SELECT 1 AS yes FROM room_items WHERE election_id = ? AND race = ? AND area_code = ? AND code = ? AND ref = ?
              AND (status = 'OPEN' OR (resolved_by IS NOT NULL AND resolved_at > now() - interval '6 hours')) LIMIT 1`
        )
        .get(project.id, race, areaCode, code, ref)
    );
  let opened = 0;
  const raise = async (areaCode, code, ref, says) => {
    if (await settled(areaCode, code, ref)) return;
    if (await items.open({ electionId: project.id, race, areaCode, code, ref, says })) opened += 1;
  };

  const byState = new Map();
  for (const row of rows) (byState.get(row.unitCode.slice(0, 2)) ?? byState.set(row.unitCode.slice(0, 2), []).get(row.unitCode.slice(0, 2))).push(row);
  for (const [state, group] of byState) {
    const pattern = screenAll(group).find((finding) => finding.severity === "PATTERN");
    if (pattern) await raise(state, "Y_PATTERN", pattern.rule, `${pattern.says}, across ${group.length} results`);
  }

  /* Announced against our checked count, place by place, where both exist. */
  for (const said of announced) {
    const key = String(said.placeKey ?? said.key ?? "");
    if (!key || !said.votes) continue;
    const ours = {};
    let checked = 0;
    for (const row of rows) {
      if (row.status !== "VERIFIED" || !(row.unitCode === key || row.unitCode.startsWith(`${key}/`))) continue;
      checked += 1;
      for (const [party, value] of Object.entries(row.votes ?? {})) ours[party] = (ours[party] ?? 0) + (Number(value) || 0);
    }
    const [mine, theirs] = [winnerOf(ours), winnerOf(said.votes)];
    if (checked && mine && theirs && mine !== theirs) {
      await raise(key, "R_ANNOUNCED_WINNER_MISMATCH", "announced", `Announced ${theirs}. Our checked count of ${checked} polling units has ${mine} in front`);
    }
  }
  return opened;
}

/* ------------------------------------------------------------- corrections */

const figuresOf = (result) => ({
  registered: result.registered,
  accredited: result.accredited,
  rejected: result.rejected,
  votes: result.votes,
});

export const corrections = {
  /**
   * Correct a result. The one result is changed, what it said before is
   * kept, and it waits for a different verifier. It never adds a second.
   */
  async make({ result, after, reason, user }) {
    const id = randomUUID();
    const before = figuresOf(result);
    await db
      .prepare(
        `INSERT INTO corrections (id, result_id, election_id, race, unit_code, before, after, reason, made_by, made_name)
         SELECT ?, id, election_id, race, unit_code, ?, ?, ?, ?, ? FROM results WHERE id = ?`
      )
      .run(id, JSON.stringify(before), JSON.stringify(after), reason ?? null, user.id, user.name, result.id);
    await db
      .prepare(
        `UPDATE results SET registered = ?, accredited = ?, rejected = ?, votes = ?,
                accredited_agent = COALESCE(accredited_agent, ?), accredited_manual = COALESCE(?, accredited_manual),
                corrected_by = ?, corrected_at = now()
          WHERE id = ?`
      )
      .run(after.registered, after.accredited, after.rejected, JSON.stringify(after.votes), result.accredited, after.accreditedManual ?? null, user.id, result.id);
    /* Through the accessor, so every board built from this result is dropped. */
    await results.setStatus(result.id, "CORRECTED", null);
    return id;
  },

  async pending(resultId) {
    const row = await db
      .prepare("SELECT * FROM corrections WHERE result_id = ? AND status = 'AWAITING_SECOND_CHECK' ORDER BY made_at DESC LIMIT 1")
      .get(resultId);
    return row && { id: row.id, before: json(row.before), after: json(row.after), reason: row.reason, madeBy: row.made_by, madeName: row.made_name, madeAt: iso(row.made_at) };
  },

  async forResult(resultId) {
    const rows = await db.prepare("SELECT * FROM corrections WHERE result_id = ? ORDER BY made_at DESC").all(resultId);
    return rows.map((row) => ({
      id: row.id, before: json(row.before), after: json(row.after), reason: row.reason, status: row.status,
      madeName: row.made_name, madeAt: iso(row.made_at), checkedName: row.checked_name, checkedAt: iso(row.checked_at) || null,
    }));
  },

  /** A different verifier agrees: the corrected figures stand, checked. */
  async confirm(correction, resultId, user) {
    await db.prepare("UPDATE corrections SET status = 'CONFIRMED', checked_by = ?, checked_name = ?, checked_at = now() WHERE id = ?").run(user.id, user.name, correction.id);
    await results.setStatus(resultId, "VERIFIED", user.id);
  },

  /** A different verifier disagrees: the old figures go back, unchecked. */
  async revert(correction, resultId, user) {
    const before = correction.before;
    await db
      .prepare("UPDATE results SET registered = ?, accredited = ?, rejected = ?, votes = ?, corrected_at = now() WHERE id = ?")
      .run(before.registered, before.accredited, before.rejected, JSON.stringify(before.votes), resultId);
    await db.prepare("UPDATE corrections SET status = 'REVERTED', checked_by = ?, checked_name = ?, checked_at = now() WHERE id = ?").run(user.id, user.name, correction.id);
    await results.setStatus(resultId, "SUBMITTED", null);
  },
};

/* ------------------------------------------------------------- submissions */

export const submissions = {
  async keep({ electionId, race, unitCode, kind, person, figures = null, note = null }) {
    const id = randomUUID();
    await db
      .prepare(
        `INSERT INTO submissions (id, election_id, race, unit_code, kind, person_id, person_name, figures, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, electionId, race, unitCode, kind, person?.id ?? null, person?.name ?? null, figures ? JSON.stringify(figures) : null, note);
    return id;
  },

  async open({ electionId, ground = null, unitCode = null, kind = null, take = 100 }) {
    const where = whereGround(ground, "unit_code");
    const rows = await db
      .prepare(
        `SELECT * FROM submissions WHERE election_id = ? AND status = 'OPEN'
            ${unitCode ? "AND unit_code = ?" : ""} ${kind ? "AND kind = ?" : ""}${where.sql}
          ORDER BY created_at LIMIT ?`
      )
      .all(...[electionId, unitCode, kind].filter(Boolean), ...where.params, take);
    return rows.map((row) => ({
      id: row.id, race: row.race, unitCode: row.unit_code, place: pathName(row.unit_code), kind: row.kind,
      personName: row.person_name, figures: json(row.figures), note: row.note, createdAt: iso(row.created_at),
    }));
  },

  async close(id, user) {
    const rows = await db
      .prepare("UPDATE submissions SET status = 'CLOSED', closed_by = ?, closed_at = now() WHERE id = ? AND status = 'OPEN' RETURNING election_id, race, unit_code")
      .all(user.id, id);
    return rows[0] ? { electionId: rows[0].election_id, race: rows[0].race, unitCode: rows[0].unit_code } : null;
  },
};

/* --------------------------------------------------------------- the field */

const toIncident = (row) => ({
  id: row.id,
  unitCode: row.unit_code,
  place: pathName(row.unit_code),
  kind: row.kind,
  severity: row.severity,
  sos: Boolean(row.sos),
  status: row.status,
  reporter: row.reporter ?? null,
  reporterPhone: row.reporter_phone ?? null,
  acknowledgedName: row.acknowledged_name,
  acknowledgedAt: iso(row.acknowledged_at) || null,
  assignedTo: row.assigned_to,
  resolvedName: row.resolved_name,
  createdAt: iso(row.created_at),
  hasPhoto: Boolean(row.has_photo),
});

export const field = {
  /** Reports from the field on a ground. Critical and unacknowledged first. */
  async incidents({ electionId, ground = null, open = true, critical = false, hours = null, take = 80 }) {
    if (!electionId) return [];
    const where = whereGround(ground, "i.unit_code");
    const rows = await db
      .prepare(
        `SELECT i.*, COALESCE(c.name, u.name) AS reporter, c.phone AS reporter_phone,
                EXISTS (SELECT 1 FROM media m WHERE m.incident_id = i.id) AS has_photo
           FROM incidents i
           LEFT JOIN coordinators c ON c.id = i.coordinator_id
           LEFT JOIN users u ON u.id = i.reported_by
          WHERE i.election_id = ?
            ${open ? "AND i.status = 'OPEN'" : ""}
            ${critical ? "AND (i.sos OR i.severity = 'CRITICAL')" : ""}
            ${hours ? `AND i.created_at > now() - interval '${Number(hours)} hours'` : ""}${where.sql}
          ORDER BY (i.acknowledged_at IS NULL AND (i.sos OR i.severity = 'CRITICAL')) DESC, i.created_at DESC LIMIT ?`
      )
      .all(electionId, ...where.params, take);
    return rows.map(toIncident);
  },

  async incident(id) {
    const row = await db.prepare("SELECT * FROM incidents WHERE id = ?").get(id);
    return row && { ...toIncident(row), electionId: row.election_id };
  },

  /**
   * The night as one clock: how many of a ground's polling units have sent
   * each step of the day, and how many have a result in.
   */
  async timeline({ electionId, race, ground = null }) {
    const where = whereGround(ground, "unit_code");
    const [steps, filed] = await Promise.all([
      db.prepare(`SELECT step, count(DISTINCT unit_code) AS n, max(created_at) AS last FROM unit_updates WHERE election_id = ?${where.sql} GROUP BY step`).all(electionId, ...where.params).catch(() => []),
      db.prepare(`SELECT count(*) AS n, max(submitted_at) AS last FROM results WHERE election_id = ? AND race = ?${where.sql}`).get(electionId, race, ...where.params),
    ]);
    return { steps: steps.map((row) => ({ step: row.step, units: Number(row.n), last: iso(row.last) || null })), results: Number(filed?.n ?? 0), lastResult: iso(filed?.last) || null };
  },

  /** How fast the checking is going: results checked and items closed in the last hour. */
  async throughput({ electionId, race, ground = null }) {
    const where = whereGround(ground, "unit_code");
    const whereItems = whereGround(ground, "area_code");
    const [checked, closed, waiting] = await Promise.all([
      db.prepare(`SELECT count(*) AS n FROM results WHERE election_id = ? AND race = ? AND verified_at > now() - interval '1 hour'${where.sql}`).get(electionId, race, ...where.params),
      db.prepare(`SELECT count(*) AS n FROM room_items WHERE election_id = ? AND race = ? AND resolved_by IS NOT NULL AND resolved_at > now() - interval '1 hour'${whereItems.sql}`).get(electionId, race, ...whereItems.params),
      db.prepare(`SELECT substr(area_code, 1, 2) AS state, count(*) AS n FROM room_items WHERE election_id = ? AND race = ? AND status = 'OPEN' AND code IN ('Y_AWAITING_CHECK', 'Y_AWAITING_SECOND_CHECK')${whereItems.sql} GROUP BY 1 ORDER BY 2 DESC`).all(electionId, race, ...whereItems.params),
    ]);
    return { checked: Number(checked?.n ?? 0), closed: Number(closed?.n ?? 0), backlog: waiting.map((row) => ({ state: row.state, name: placeName(row.state), waiting: Number(row.n) })) };
  },

  async markSos(id) {
    await db.prepare("UPDATE incidents SET sos = true WHERE id = ?").run(id);
  },

  /** The first person to acknowledge is the one named to everybody else. */
  async acknowledge(id, user) {
    const rows = await db
      .prepare("UPDATE incidents SET acknowledged_by = ?, acknowledged_name = ?, acknowledged_at = now() WHERE id = ? AND acknowledged_at IS NULL RETURNING id")
      .all(user.id, user.name, id);
    return rows.length > 0;
  },

  async assign(id, name) {
    await db.prepare("UPDATE incidents SET assigned_to = ? WHERE id = ?").run(name, id);
  },

  async resolve(id, user) {
    await db
      .prepare("UPDATE incidents SET status = 'RESOLVED', resolved_by = ?, resolved_name = ?, resolved_at = now() WHERE id = ? AND status = 'OPEN'")
      .run(user.id, user.name, id);
  },

  async logContact({ electionId, unitCode, personId = null, outcome, note = null, user }) {
    await db
      .prepare("INSERT INTO contact_attempts (id, election_id, unit_code, person_id, outcome, note, by_id, by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), electionId, unitCode, personId, outcome, note, user.id, user.name);
  },

  async contacts(electionId, unitCode, take = 10) {
    const rows = await db
      .prepare("SELECT outcome, note, by_name, created_at FROM contact_attempts WHERE election_id = ? AND unit_code = ? ORDER BY created_at DESC LIMIT ?")
      .all(electionId, unitCode, take);
    return rows.map((row) => ({ outcome: row.outcome, note: row.note, byName: row.by_name, at: iso(row.created_at) }));
  },

  /**
   * Assigned polling units with no result, longest silent first, each with
   * the agent to ring and the last thing they sent.
   */
  async notReporting({ electionId, race, ground = null, under = "", take = 100 }) {
    const where = whereGround(ground, "a.target_code");
    const rows = await db
      .prepare(
        `SELECT a.target_code AS unit_code, a.role, c.id AS person_id, c.name, c.phone, c.last_login_at,
                (SELECT max(created_at) FROM unit_updates uu WHERE uu.election_id = ? AND uu.unit_code = a.target_code) AS last_update,
                (SELECT step FROM unit_updates uu WHERE uu.election_id = ? AND uu.unit_code = a.target_code ORDER BY created_at DESC LIMIT 1) AS last_step,
                (SELECT outcome FROM contact_attempts ca WHERE ca.election_id = ? AND ca.unit_code = a.target_code ORDER BY created_at DESC LIMIT 1) AS last_contact
           FROM assignments a JOIN coordinators c ON c.id = a.person_id
          WHERE a.target_type = 'PU' AND a.ended_at IS NULL AND a.role = 'PRIMARY'
            AND (a.target_code = ? OR a.target_code LIKE ?)
            AND NOT EXISTS (SELECT 1 FROM results r WHERE r.election_id = ? AND r.race = ? AND r.unit_code = a.target_code)${where.sql}
          ORDER BY last_update NULLS FIRST, a.target_code LIMIT ?`
      )
      .all(electionId, electionId, electionId, under, under ? `${under}/%` : "%", electionId, race, ...where.params, take);
    return rows.map((row) => ({
      unitCode: row.unit_code,
      place: pathName(row.unit_code),
      personId: row.person_id,
      name: row.name,
      phone: row.phone,
      lastSeen: iso(row.last_login_at) || null,
      lastUpdate: iso(row.last_update) || null,
      lastStep: row.last_step,
      lastContact: row.last_contact,
    }));
  },
};

/* --------------------------------------------------- notes and the handover */

export const notes = {
  async add({ electionId, kind = "NOTE", areaCode = "", desk = null, body, user, toId = null }) {
    await db
      .prepare("INSERT INTO room_notes (id, election_id, kind, area_code, desk, body, by_id, by_name, to_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), electionId, kind, areaCode, desk, body, user.id, user.name, toId);
  },

  async list({ electionId, kind = "NOTE", ground = null, desk = null, take = 30 }) {
    if (!electionId) return [];
    const where = kind === "NOTE" ? whereGround(ground, "area_code") : { sql: "", params: [] };
    const rows = await db
      .prepare(
        `SELECT * FROM room_notes WHERE election_id = ? AND kind = ? ${desk ? "AND desk = ?" : ""}${where.sql}
          ORDER BY created_at DESC LIMIT ?`
      )
      .all(...[electionId, kind, desk].filter(Boolean), ...where.params, take);
    return rows.map((row) => ({
      id: row.id, areaCode: row.area_code, place: row.area_code ? placeName(row.area_code) : null, desk: row.desk, body: row.body,
      byId: row.by_id, byName: row.by_name, acceptedBy: row.accepted_by, acceptedAt: iso(row.accepted_at) || null, at: iso(row.created_at),
    }));
  },

  /** Take over a desk: the handover is accepted by name, once, not by its author. */
  async accept(id, user) {
    const rows = await db
      .prepare("UPDATE room_notes SET accepted_by = ?, accepted_at = now() WHERE id = ? AND kind = 'HANDOVER' AND accepted_at IS NULL AND by_id <> ? RETURNING id")
      .all(user.name, id, user.id);
    return rows.length > 0;
  },
};

/* --------------------------------------------------------------- the staff */

const toStaff = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  roles: [row.role, ...json(row.roles, [])],
  grants: json(row.grants, []),
  ground: row.ground,
  /* Seen in the last ninety seconds. Every open screen says so as it polls. */
  online: Boolean(row.last_seen_at && Date.now() - new Date(row.last_seen_at).getTime() < 90_000),
  lastSeen: iso(row.last_seen_at) || null,
  openItems: Number(row.open_items ?? 0),
});

export const staff = {
  async all() {
    const rows = await db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.roles, u.grants, u.ground, u.last_seen_at,
                (SELECT count(*) FROM room_items i WHERE i.owner_id = u.id AND i.status = 'OPEN') AS open_items
           FROM users u WHERE u.disabled_at IS NULL AND u.status = 'ACTIVE' AND u.role NOT IN ('VIEWER', 'PU_AGENT')
          ORDER BY u.name`
      )
      .all();
    return rows.map(toStaff);
  },

  async get(id) {
    const row = await db.prepare("SELECT id, name, email, role, roles, grants, ground, last_seen_at FROM users WHERE id = ?").get(id);
    return row ? toStaff(row) : null;
  },

  async setGround(id, ground) {
    await db.prepare("UPDATE users SET ground = ? WHERE id = ?").run(ground, id);
  },

  async setDesks(id, { roles, grants }) {
    await db.prepare("UPDATE users SET roles = ?, grants = ? WHERE id = ?").run(JSON.stringify(roles ?? []), JSON.stringify(grants ?? []), id);
  },

  /** Called as a screen polls. At most one write per person per half minute. */
  async seen(id) {
    await db.prepare("UPDATE users SET last_seen_at = now() WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < now() - interval '30 seconds')").run(id);
  },

  async sessions(take = 100) {
    const rows = await db
      .prepare(
        `SELECT s.id, s.user_agent, s.created_at, s.expires_at, u.id AS user_id, u.name, u.role
           FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.expires_at > now() ORDER BY s.created_at DESC LIMIT ?`
      )
      .all(take);
    return rows.map((row) => ({
      /* The stored id is the hash of the cookie, and only its head is shown. */
      id: row.id, short: String(row.id).slice(0, 8), userId: row.user_id, name: row.name, role: row.role,
      device: String(row.user_agent ?? "").slice(0, 80), since: iso(row.created_at),
    }));
  },

  async endSessions(userId) {
    await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  },
};

/* -------------------------------------------------------------------- tech */

export const tech = {
  async raise({ title, detail = null, severity = "MINOR", user }) {
    const id = randomUUID();
    await db
      .prepare("INSERT INTO tech_incidents (id, title, detail, severity, raised_by, raised_name) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, title, detail, severity, user.id, user.name);
    await events.emit(null, "tech.incident", "", { id, title, severity }, severity === "CRITICAL" ? "DIRECTOR" : "TECH");
    return id;
  },

  async list({ open = false, take = 50 } = {}) {
    const rows = await db
      .prepare(`SELECT * FROM tech_incidents ${open ? "WHERE status <> 'CLOSED'" : ""} ORDER BY (status <> 'CLOSED') DESC, created_at DESC LIMIT ?`)
      .all(take);
    return rows.map((row) => ({
      id: row.id, title: row.title, detail: row.detail, severity: row.severity, status: row.status, raisedName: row.raised_name,
      ownerName: row.owner_name, updates: json(row.updates, []), at: iso(row.created_at), closedAt: iso(row.closed_at) || null,
    }));
  },

  async update(id, { status, note, user }) {
    const row = await db.prepare("SELECT updates FROM tech_incidents WHERE id = ?").get(id);
    if (!row) return false;
    const updates = [...json(row.updates, []), { at: new Date().toISOString(), by: user.name, status, note }];
    await db
      .prepare(
        `UPDATE tech_incidents SET status = ?, updates = ?, owner_name = COALESCE(owner_name, ?),
                closed_at = CASE WHEN ? = 'CLOSED' THEN now() ELSE NULL END WHERE id = ?`
      )
      .run(status, JSON.stringify(updates), user.name, status, id);
    await events.emit(null, "tech.incident", "", { id, status }, "TECH");
    return true;
  },

  /**
   * The system light: red while a critical incident is open, amber while any
   * is, green otherwise. One word for every top bar in the room.
   */
  async light() {
    return cached("room:tech-light", async () => {
      const row = await db
        .prepare("SELECT count(*) FILTER (WHERE severity = 'CRITICAL') AS critical, count(*) AS open FROM tech_incidents WHERE status <> 'CLOSED'")
        .get();
      if (Number(row?.critical ?? 0) > 0) return "RED";
      return Number(row?.open ?? 0) > 0 ? "AMBER" : "GREEN";
    }, { ttlMs: 5000 });
  },

  /** How much is flowing. Counts only: no vote figure leaves this function. */
  async flow(electionId) {
    const one = (text, ...args) => db.prepare(text).get(...args);
    const [filed, minute, sheets, incidents, outbox] = await Promise.all([
      one("SELECT count(*) AS n, max(submitted_at) AS last FROM results WHERE election_id = ?", electionId),
      one("SELECT count(*) AS n FROM results WHERE election_id = ? AND submitted_at > now() - interval '10 minutes'", electionId),
      one("SELECT count(*) AS n, count(*) FILTER (WHERE created_at > now() - interval '10 minutes') AS recent FROM sheet_reads WHERE election_id = ?", electionId).catch(() => null),
      one("SELECT count(*) FILTER (WHERE status = 'OPEN') AS open FROM incidents WHERE election_id = ?", electionId),
      one("SELECT count(*) AS n FROM dumpsite_outbox").catch(() => null),
    ]);
    return {
      results: Number(filed?.n ?? 0),
      lastResult: iso(filed?.last) || null,
      perMinute: Math.round(Number(minute?.n ?? 0)) / 10,
      sheetsRead: sheets ? Number(sheets.n) : null,
      sheetsRecent: sheets ? Number(sheets.recent) : null,
      openReports: Number(incidents?.open ?? 0),
      waitingForDataBank: outbox ? Number(outbox.n) : null,
    };
  },

  /**
   * The machine room, measured: how long the database takes to answer, how
   * big it is, how many rows each table holds, results a minute for the last
   * hour, how stale each state is, and what the room's own bookkeeping is
   * doing. Counts, timings and ages only. No vote figure is read.
   */
  async telemetry(electionId, race) {
    const timed = async (label, run) => {
      const start = performance.now();
      try {
        const value = await run();
        return { label, ok: true, ms: Math.round(performance.now() - start), value };
      } catch (error) {
        return { label, ok: false, ms: Math.round(performance.now() - start), error: String(error?.message ?? error).slice(0, 160) };
      }
    };
    const q = (text, ...args) => db.prepare(text).all(...args);
    const [ping, size, tables, perMinute, byState, sources, statuses, sessions, eventsRow, sweepRow, itemsRow, migrations, slow, audits] = await Promise.all([
      timed("Database round trip", () => q("SELECT 1 AS one")),
      timed("Database size", () => q("SELECT pg_database_size(current_database()) AS bytes, current_database() AS name, version() AS version, (SELECT setting FROM pg_settings WHERE name = 'max_connections') AS max_connections, (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS connections")),
      timed("Table sizes", () => q(
        `SELECT c.relname AS name, c.reltuples::bigint AS rows, pg_total_relation_size(c.oid) AS bytes
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = current_schema() AND c.relkind = 'r' ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 14`)),
      timed("Results per minute", () => q(
        `SELECT to_char(date_trunc('minute', submitted_at), 'YYYY-MM-DD"T"HH24:MI') AS minute, count(*) AS n
           FROM results WHERE election_id = ? AND submitted_at > now() - interval '60 minutes' GROUP BY 1 ORDER BY 1`, electionId)),
      timed("Last heard, by state", () => q(
        `SELECT state_code AS state, count(*) AS n, max(submitted_at) AS last,
                count(*) FILTER (WHERE submitted_at > now() - interval '10 minutes') AS recent
           FROM results WHERE election_id = ? AND race = ? GROUP BY 1`, electionId, race)),
      timed("How results arrive", () => q("SELECT source, count(*) AS n FROM results WHERE election_id = ? GROUP BY 1 ORDER BY 2 DESC", electionId)),
      timed("Result states", () => q("SELECT status, count(*) AS n FROM results WHERE election_id = ? GROUP BY 1 ORDER BY 2 DESC", electionId)),
      timed("Sessions", () => q("SELECT (SELECT count(*) FROM sessions WHERE expires_at > now()) AS staff, (SELECT count(*) FROM coordinator_sessions WHERE expires_at > now()) AS agents, (SELECT count(*) FROM users WHERE last_seen_at > now() - interval '90 seconds') AS online")),
      timed("Event feed", () => q("SELECT COALESCE(max(seq), 0) AS seq, count(*) AS held, count(*) FILTER (WHERE created_at > now() - interval '1 minute') AS last_minute, max(created_at) AS last FROM room_events")),
      timed("Sweep", () => q("SELECT updated_at FROM room_settings WHERE election_id = ?", `sweep:${electionId}:${race}`)),
      timed("Lights bookkeeping", () => q(
        `SELECT (SELECT count(*) FROM unit_lights WHERE election_id = ? AND race = ?) AS lit,
                (SELECT count(*) FROM results WHERE election_id = ? AND race = ?) AS results,
                (SELECT count(*) FROM room_items WHERE election_id = ? AND status = 'OPEN') AS open_items,
                (SELECT count(*) FROM room_items WHERE election_id = ? AND status = 'OPEN' AND light = 'RED') AS open_red,
                (SELECT count(*) FROM room_items WHERE election_id = ? AND resolved_at > now() - interval '1 hour') AS closed_hour`,
        electionId, race, electionId, race, electionId, electionId, electionId)),
      timed("Schema", () => q("SELECT count(*) AS n, max(run_at) AS last FROM _migrations")),
      timed("Outbox to Data Bank", () => q("SELECT count(*) AS waiting, min(created_at) AS oldest FROM dumpsite_outbox")),
      timed("Audit and refusals", () => q(
        `SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS lines_hour,
                count(*) FILTER (WHERE created_at > now() - interval '1 hour' AND action IN ('access:denied', 'capability:denied')) AS refused_hour,
                count(*) FILTER (WHERE created_at > now() - interval '24 hours' AND action IN ('access:denied', 'capability:denied')) AS refused_day
           FROM audit WHERE created_at > now() - interval '24 hours'`)),
    ]);
    return { ping, size, tables, perMinute, byState, sources, statuses, sessions, events: eventsRow, sweep: sweepRow, items: itemsRow, migrations, outbox: slow, audits, at: new Date().toISOString() };
  },

  async blocked() {
    const rows = await db.prepare("SELECT * FROM blocked_addresses ORDER BY created_at DESC").all();
    return rows.map((row) => ({ ip: row.ip, reason: row.reason, byName: row.by_name, at: iso(row.created_at) }));
  },

  async block(ip, reason, user) {
    await db
      .prepare("INSERT INTO blocked_addresses (ip, reason, by_id, by_name) VALUES (?, ?, ?, ?) ON CONFLICT (ip) DO NOTHING")
      .run(ip, reason, user.id, user.name);
    invalidate("room:blocked");
  },

  async unblock(ip) {
    await db.prepare("DELETE FROM blocked_addresses WHERE ip = ?").run(ip);
    invalidate("room:blocked");
  },

  async isBlocked(ip) {
    if (!ip) return false;
    const list = await cached("room:blocked", async () => (await db.prepare("SELECT ip FROM blocked_addresses").all()).map((row) => row.ip), { ttlMs: 15_000 });
    return list.includes(ip);
  },
};

/* ------------------------------------------------------------------- packs */

export const packs = {
  async build({ electionId, title, note = null, contents, user }) {
    const id = randomUUID();
    const body = JSON.stringify(contents);
    const hash = createHash("sha256").update(body).digest("hex");
    await db
      .prepare("INSERT INTO evidence_packs (id, election_id, title, note, contents, hash, built_by, built_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, electionId, title, note, body, hash, user.id, user.name);
    return { id, hash };
  },

  async list(electionId, take = 50) {
    const rows = await db
      .prepare("SELECT id, title, note, hash, built_name, created_at, length(contents) AS size FROM evidence_packs WHERE election_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(electionId, take);
    return rows.map((row) => ({ id: row.id, title: row.title, note: row.note, hash: row.hash, builtName: row.built_name, at: iso(row.created_at), size: Number(row.size) }));
  },

  async get(id) {
    const row = await db.prepare("SELECT * FROM evidence_packs WHERE id = ?").get(id);
    if (!row) return null;
    /* Hashed again on the way out. A pack that no longer matches its seal
       says so, and is not handed over as if it did. */
    const sound = createHash("sha256").update(row.contents).digest("hex") === row.hash;
    return { id: row.id, electionId: row.election_id, title: row.title, note: row.note, hash: row.hash, sound, builtName: row.built_name, at: iso(row.created_at), contents: json(row.contents, {}) };
  },
};

/* ------------------------------------------------------------------- walls */

const hashKey = (key) => createHash("sha256").update(String(key)).digest("hex");

export const walls = {
  async create({ name, layout, user }) {
    const id = randomUUID().slice(0, 8);
    const key = randomUUID().replaceAll("-", "");
    await db.prepare("INSERT INTO walls (id, name, key_hash, layout, created_by) VALUES (?, ?, ?, ?, ?)").run(id, name, hashKey(key), JSON.stringify(layout), user.id);
    /* The key is returned once and never stored. */
    return { id, key };
  },

  async list() {
    const rows = await db.prepare("SELECT id, name, layout, seen_at, created_at FROM walls ORDER BY created_at DESC").all();
    return rows.map((row) => ({ id: row.id, name: row.name, layout: json(row.layout, {}), seenAt: iso(row.seen_at) || null }));
  },

  /** The wall, if this key opens it. */
  async open(id, key) {
    const row = await db.prepare("SELECT id, name, layout, key_hash FROM walls WHERE id = ?").get(id);
    if (!row || !key || row.key_hash !== hashKey(key)) return null;
    await db.prepare("UPDATE walls SET seen_at = now() WHERE id = ? AND (seen_at IS NULL OR seen_at < now() - interval '1 minute')").run(id);
    return { id: row.id, name: row.name, layout: json(row.layout, {}) };
  },

  async remove(id) {
    await db.prepare("DELETE FROM walls WHERE id = ?").run(id);
  },
};

/* --------------------------------------------------------------- the trail */

const toLine = (row) => ({
  id: row.id, at: iso(row.created_at), actor: row.actor_name, action: row.action, subject: row.subject, meta: json(row.meta, row.meta), ip: row.ip,
});

export const trail = {
  /** One person's own acts, newest first: the Director's decision log. */
  async byActor(actorId, take = 40) {
    const rows = await db.prepare("SELECT * FROM audit WHERE actor_id = ? ORDER BY created_at DESC LIMIT ?").all(actorId, take);
    return rows.map(toLine);
  },

  /** Lines whose action starts with one of these words, e.g. "security:". */
  async byKind(prefixes, take = 80) {
    const rows = await db
      .prepare(`SELECT * FROM audit WHERE ${prefixes.map(() => "action LIKE ?").join(" OR ")} ORDER BY created_at DESC LIMIT ?`)
      .all(...prefixes.map((prefix) => `${prefix}%`), take);
    return rows.map(toLine);
  },

  async forSubject(subject, take = 60) {
    const rows = await db.prepare("SELECT * FROM audit WHERE subject = ? ORDER BY created_at DESC LIMIT ?").all(subject, take);
    return rows.map(toLine);
  },
};

export { place };
