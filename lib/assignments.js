import { randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";

import { normalisePhone } from "./phone.js";
import { levelOf, parentOf, tidyCode, whereGround } from "./ground.js";

/**
 * Who files for which polling unit, and who holds which ward.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A POLLING UNIT IS ASSIGNED, NOT TYPED
 *
 *  An agent files for the units assigned to them now and for no other. The
 *  party's list is where the assignments start; the Super Admin may change
 *  any of them, and a later copy of the list never quietly changes them
 *  back. Nothing is overwritten: a change ends one row and starts another, so
 *  the table answers "who held this unit at 4pm" as readily as "who holds it
 *  now".
 *
 *  The top half of this file is pure: reading the party's file, checking it
 *  against INEC's list, and working out what committing it would change.
 *  The bottom half is storage. The pure half takes what it needs as
 *  arguments, so it is tested without a database.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const REASONS = {
  AGENT_UNAVAILABLE: "Agent unavailable",
  AGENT_UNREACHABLE: "Agent unreachable",
  SECURITY: "Security",
  PARTY_INSTRUCTION: "Party instruction",
  DATA_CORRECTION: "Data correction",
  OTHER: "Other",
};

export const COLUMNS = ["role", "full_name", "phone", "state_code", "lga_code", "ward_code", "pu_code", "assignment_type", "party_ref"];

/** May this reason stand on its own? "Other" needs a note that says what. */
export function checkReason(reason, note) {
  if (!REASONS[reason]) return "Choose a reason for the change.";
  if (reason === "OTHER" && !String(note ?? "").trim()) return "Say what the reason is.";
  return null;
}

/* ------------------------------------------------------- reading the file */

/** A CSV as rows of cells. Quoted cells, doubled quotes and CRLF all read. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const body = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (quoted) {
      if (char === '"' && body[i + 1] === '"') (cell += '"'), (i += 1);
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") row.push(cell), (cell = "");
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && body[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length) row.push(cell), rows.push(row);
  return rows.filter((cells) => cells.some((value) => String(value).trim() !== ""));
}

/**
 * The first sheet of an .xlsx workbook as rows of cells.
 *
 * A workbook is a zip of XML. Reading one needs the zip's own index and
 * `inflate`, both of which node has, so there is no spreadsheet dependency to
 * install or keep current for the sake of one upload on one screen.
 */
export function parseXlsx(buffer) {
  const files = unzip(buffer);
  const text = (name) => files.get(name)?.toString("utf8") ?? "";
  const decode = (value) =>
    value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const shared = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    decode([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join(""))
  );
  const sheetName = [...files.keys()].filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()[0];
  if (!sheetName) throw new Error("That file has no sheet in it.");
  const rows = [];
  for (const rowMatch of text(sheetName).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)\d+"/.exec(cellMatch[1])?.[1] ?? "";
      const type = /t="([^"]+)"/.exec(cellMatch[1])?.[1] ?? "";
      const inner = cellMatch[2] ?? "";
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("");
      const column = [...ref].reduce((sum, letter) => sum * 26 + (letter.charCodeAt(0) - 64), 0) - 1;
      cells[Math.max(column, 0)] = type === "s" ? (shared[Number(raw)] ?? "") : decode(raw);
    }
    rows.push(Array.from(cells, (value) => value ?? ""));
  }
  return rows.filter((cells) => cells.some((value) => String(value).trim() !== ""));
}

function unzip(buffer) {
  const files = new Map();
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("That is not an .xlsx file.");
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(at + 10);
    const size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    if (/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name)) {
      files.set(name, method === 0 ? data : inflateRawSync(data));
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/** Rows of cells into records keyed by the template's column names. */
export function toRecords(rows) {
  if (!rows.length) return { records: [], missing: COLUMNS.slice(0, 6) };
  const head = rows[0].map((name) => String(name).trim().toLowerCase().replace(/\s+/g, "_"));
  const missing = COLUMNS.slice(0, 6).filter((column) => !head.includes(column));
  const records = rows.slice(1).map((cells, index) => {
    const record = { line: index + 2 };
    head.forEach((name, column) => (record[name] = String(cells[column] ?? "").trim()));
    return record;
  });
  return { records, missing };
}

/* ------------------------------------------------------ checking the rows */

const two = (value) => String(value ?? "").replace(/\D/g, "").padStart(2, "0");

/** One place code from the parts a row gives, whichever way the party wrote them. */
function codeFrom(parts, last) {
  const tail = String(last ?? "").trim();
  if (tail.split(/[^0-9]+/).filter(Boolean).length > 1) return tidyCode(tail);
  return tidyCode([...parts, tail].join("/"));
}

/**
 * Check every row against INEC's list.
 *
 * `exists(code)` answers whether INEC lists a place. Returns the rows that
 * can be used and the rows that cannot, each of the second with the reason in
 * words, because the party fixes its own file and needs to be told what to
 * fix.
 */
export function checkRows(records, { exists }) {
  const clean = [];
  const errors = [];
  for (const record of records) {
    const fail = (error) => errors.push({ ...record, error });
    const role = String(record.role ?? "").toUpperCase().replace(/\s+/g, "_");
    if (role !== "AGENT" && role !== "WARD_COORDINATOR") {
      fail("Role must be AGENT or WARD_COORDINATOR.");
      continue;
    }
    if (!record.full_name) {
      fail("The full name is missing.");
      continue;
    }
    const phone = normalisePhone(record.phone);
    if (!phone || !/^234\d{10}$/.test(phone)) {
      fail("The phone number is not a valid Nigerian number.");
      continue;
    }
    if (!record.state_code || !record.lga_code || !record.ward_code) {
      fail("State, local government and ward codes are all required.");
      continue;
    }
    const state = two(record.state_code);
    const lga = codeFrom([state], record.lga_code);
    const ward = lga && codeFrom(lga.split("/"), record.ward_code);
    if (!exists(state)) {
      fail(`INEC lists no state with code ${record.state_code}.`);
      continue;
    }
    if (!lga || !exists(lga) || !lga.startsWith(`${state}/`)) {
      fail(`Local government ${record.lga_code} is not in that state.`);
      continue;
    }
    if (!ward || !exists(ward) || !ward.startsWith(`${lga}/`)) {
      fail(`Ward ${record.ward_code} is not in that local government.`);
      continue;
    }
    const type = String(record.assignment_type || "PRIMARY").toUpperCase();
    if (type !== "PRIMARY" && type !== "BACKUP") {
      fail("Assignment type must be PRIMARY or BACKUP.");
      continue;
    }

    const person = { line: record.line, fullName: record.full_name, phone, partyRef: record.party_ref || null };
    if (role === "WARD_COORDINATOR") {
      clean.push({ ...person, role, targets: [{ type: "WARD", code: ward, role: "COORDINATOR" }] });
      continue;
    }
    const given = String(record.pu_code ?? "").split(";").map((value) => value.trim()).filter(Boolean);
    if (!given.length) {
      fail("An agent needs at least one polling unit code.");
      continue;
    }
    const units = given.map((value) => codeFrom(ward.split("/"), value));
    const bad = given.find((value, index) => !units[index] || !exists(units[index]));
    if (bad) {
      fail(`INEC lists no polling unit ${bad} in that ward.`);
      continue;
    }
    const stray = units.find((unit) => !unit.startsWith(`${ward}/`));
    if (stray) {
      fail(`Polling unit ${stray} is not in the ward this row names.`);
      continue;
    }
    clean.push({ ...person, role, targets: [...new Set(units)].map((code) => ({ type: "PU", code, role: type })) });
  }
  return { clean, errors };
}

/**
 * What committing a checked list would change.
 *
 * `current` is `{ people, assignments }` as they stand: people with `id`,
 * `partyRef`, `phone`; active assignments with `id`, `personId`,
 * `targetCode`, `role`, `source`. Nothing is written here.
 *
 * A person is matched by the party's own reference, then by phone number.
 */
export function diffList(clean, current) {
  const byRef = new Map(current.people.filter((person) => person.partyRef).map((person) => [person.partyRef, person]));
  const byPhone = new Map(current.people.filter((person) => person.phone).map((person) => [person.phone, person]));
  const heldBy = new Map();
  for (const held of current.assignments) heldBy.set(`${held.personId}|${held.targetCode}`, held);
  const primaryAt = new Map(current.assignments.filter((held) => held.role === "PRIMARY").map((held) => [held.targetCode, held]));
  const nameOf = new Map(current.people.map((person) => [person.id, person.name]));

  const out = { newPeople: [], newAssignments: [], changed: [], missing: [], manualDiffer: [], conflicts: [] };
  const wanted = new Set();
  const matched = new Set();
  const filePrimary = new Map();
  const filePhone = new Map();

  for (const row of clean) {
    const who = `${row.partyRef ?? ""}|${row.fullName.toLowerCase()}`;
    if (filePhone.has(row.phone) && filePhone.get(row.phone).who !== who) {
      /* Left out, not merged: one phone number is one person on the roster,
         and bringing this row in would hand the second person's units to
         the first. */
      out.conflicts.push({ kind: "SHARED_PHONE", line: row.line, says: `${row.fullName} and ${filePhone.get(row.phone).name} share one phone number` });
      continue;
    }
    filePhone.set(row.phone, { who, name: row.fullName });

    const person = (row.partyRef && byRef.get(row.partyRef)) || byPhone.get(row.phone) || null;
    const key = person?.id ?? `new:${row.partyRef ?? row.phone}`;
    if (person) matched.add(person.id);
    else if (!out.newPeople.some((fresh) => fresh.key === key)) {
      out.newPeople.push({ key, fullName: row.fullName, phone: row.phone, partyRef: row.partyRef, role: row.role });
    }

    for (const target of row.targets) {
      if (target.role === "PRIMARY") {
        const other = filePrimary.get(target.code);
        if (other && other.key !== key) {
          out.conflicts.push({ kind: "TWO_PRIMARY", line: row.line, code: target.code, says: `${row.fullName} and ${other.name} are both listed as primary` });
          continue;
        }
        filePrimary.set(target.code, { key, name: row.fullName });
      }
      wanted.add(`${key}|${target.code}`);
      const want = { key, personId: person?.id ?? null, fullName: row.fullName, type: target.type, code: target.code, role: target.role, line: row.line };
      const held = person ? heldBy.get(`${person.id}|${target.code}`) : null;
      const sitting = target.role === "PRIMARY" ? primaryAt.get(target.code) : null;

      if (held && held.role === target.role) continue;
      if (held) {
        const change = { ...want, endId: held.id, was: `${held.role.toLowerCase()} here` };
        (held.source === "MANUAL" ? out.manualDiffer : out.changed).push(change);
      } else if (sitting && sitting.personId !== person?.id) {
        const change = { ...want, endId: sitting.id, was: `${nameOf.get(sitting.personId) ?? "somebody else"} is primary` };
        (sitting.source === "MANUAL" ? out.manualDiffer : out.changed).push(change);
      } else out.newAssignments.push(want);
    }
  }

  /* On the last list and not on this one. Listed, never ended by itself: a
     row dropped from a file is as often a mistake in the file as a decision. */
  for (const held of current.assignments) {
    if (held.source !== "IMPORT" || wanted.has(`${held.personId}|${held.targetCode}`)) continue;
    out.missing.push({ endId: held.id, personId: held.personId, fullName: nameOf.get(held.personId) ?? "", code: held.targetCode, role: held.role });
  }
  return out;
}

/**
 * Turn a diff and the Super Admin's choices into what to end and start.
 *
 * `choices.manual` maps an assignment id to "list" where the list should win
 * over a manual override; anything else keeps the override. `choices.end` is
 * the set of missing assignments to end.
 */
export function planCommit(diff, choices = {}) {
  const ends = new Set();
  const starts = [];
  for (const want of diff.newAssignments) starts.push(want);
  for (const change of diff.changed) ends.add(change.endId), starts.push(change);
  for (const change of diff.manualDiffer) {
    if (choices.manual?.[change.endId] === "list") ends.add(change.endId), starts.push(change);
  }
  for (const gone of diff.missing) if (choices.end?.includes(gone.endId)) ends.add(gone.endId);
  return { ends: [...ends], starts, people: diff.newPeople };
}

/* ----------------------------------------------------------------- storage */

const iso = (value) => (value ? new Date(value).toISOString() : null);

const toAssignment = (row) => ({
  id: row.id,
  personId: row.person_id,
  name: row.name ?? null,
  phone: row.phone ?? null,
  status: row.person_status ?? null,
  lastSeen: iso(row.last_login_at),
  hasCode: Boolean(row.code_hash),
  targetType: row.target_type,
  targetCode: row.target_code,
  role: row.role,
  source: row.source,
  reason: row.reason,
  note: row.note,
  changedName: row.changed_name,
  startedAt: iso(row.started_at),
  endedAt: iso(row.ended_at),
  endedName: row.ended_name,
  endReason: row.end_reason,
  endNote: row.end_note,
});

const JOINED = `SELECT a.*, c.name, c.phone, c.status AS person_status, c.last_login_at, c.code_hash
                  FROM assignments a JOIN coordinators c ON c.id = a.person_id`;

/**
 * The storage half. Built around the database handle it is given, so this
 * file imports nothing that needs a connection and its pure half can be
 * tested alone. lib/room/assign.js hands it `db` and `transaction`.
 */
export function assignmentStore({ db, transaction }) {
  const store = {
    async current() {
      const [people, held] = await Promise.all([
        db.prepare("SELECT id, name, phone, party_ref FROM coordinators WHERE status IN ('ACTIVE', 'PENDING')").all(),
        db.prepare("SELECT id, person_id, target_code, role, source FROM assignments WHERE ended_at IS NULL").all(),
      ]);
      return {
        people: people.map((row) => ({ id: row.id, name: row.name, phone: row.phone, partyRef: row.party_ref })),
        assignments: held.map((row) => ({ id: row.id, personId: row.person_id, targetCode: row.target_code, role: row.role, source: row.source })),
      };
    },

    async list({ puCode = null, wardCode = null, personId = null, active = true, take = 200 } = {}) {
      const clauses = [];
      const params = [];
      if (puCode) clauses.push("a.target_code = ?"), params.push(puCode);
      if (wardCode) clauses.push("(a.target_code = ? OR a.target_code LIKE ?)"), params.push(wardCode, `${wardCode}/%`);
      if (personId) clauses.push("a.person_id = ?"), params.push(personId);
      if (active) clauses.push("a.ended_at IS NULL");
      const rows = await db
        .prepare(`${JOINED} ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY a.ended_at DESC NULLS FIRST, a.started_at DESC LIMIT ?`)
        .all(...params, take);
      return rows.map(toAssignment);
    },

    async get(id) {
      const row = await db.prepare(`${JOINED} WHERE a.id = ?`).get(id);
      return row ? toAssignment(row) : null;
    },

    /** Everybody holding a polling unit now, and the coordinators of its ward. */
    async forUnit(unitCode) {
      const rows = await db
        .prepare(`${JOINED} WHERE a.ended_at IS NULL AND a.target_code IN (?, ?) ORDER BY (a.role = 'PRIMARY') DESC, a.started_at`)
        .all(unitCode, parentOf(unitCode));
      const all = rows.map(toAssignment);
      return {
        primary: all.find((held) => held.role === "PRIMARY") ?? null,
        backups: all.filter((held) => held.role === "BACKUP"),
        coordinators: all.filter((held) => held.role === "COORDINATOR"),
      };
    },

    /** The polling units an agent may file for now, primary first. */
    async unitsOf(personId) {
      const rows = await db
        .prepare("SELECT target_code, role FROM assignments WHERE person_id = ? AND target_type = 'PU' AND ended_at IS NULL ORDER BY (role = 'PRIMARY') DESC, started_at")
        .all(personId);
      return rows.map((row) => ({ code: row.target_code, role: row.role }));
    },

    async wardsOf(personId) {
      const rows = await db
        .prepare("SELECT target_code FROM assignments WHERE person_id = ? AND target_type = 'WARD' AND ended_at IS NULL ORDER BY started_at")
        .all(personId);
      return rows.map((row) => row.target_code);
    },

    /** The one question filing asks. Answered from storage, every time. */
    async mayFile(personId, unitCode) {
      if (!personId || !unitCode) return false;
      const row = await db
        .prepare("SELECT 1 AS yes FROM assignments WHERE person_id = ? AND target_code = ? AND target_type = 'PU' AND ended_at IS NULL")
        .get(personId, unitCode);
      return Boolean(row);
    },

    /**
     * Keep the roster's own "unit in hand" true to the assignments.
     *
     * The agents' app, the roster and Data Bank all read one unit off the
     * agent's row. That stays: it is the unit they are working now. It is
     * kept if they still hold it, moved to another they hold if not, and
     * emptied if they hold none.
     */
    async syncPerson(personId) {
      const [units, row] = await Promise.all([
        store.unitsOf(personId),
        db.prepare("SELECT unit_code FROM coordinators WHERE id = ?").get(personId),
      ]);
      if (units.some((unit) => unit.code === row?.unit_code)) return row.unit_code;
      const next = units[0]?.code ?? null;
      await db.prepare("UPDATE coordinators SET unit_code = ?, state_code = COALESCE(?, state_code) WHERE id = ?").run(next, next?.slice(0, 2) ?? null, personId);
      return next;
    },

    /** An agent with several units picks the one they are at. */
    async choose(personId, unitCode) {
      if (!(await store.mayFile(personId, unitCode))) return false;
      await db.prepare("UPDATE coordinators SET unit_code = ?, state_code = ? WHERE id = ?").run(unitCode, unitCode.slice(0, 2), personId);
      return true;
    },

    /**
     * The first time an agent from Data Bank's list is seen here, the unit
     * the list gives them becomes their assignment. After that the
     * assignments are the record, and the list does not overrule them.
     */
    async adopt(personId, unitCode) {
      const any = await db.prepare("SELECT 1 AS yes FROM assignments WHERE person_id = ? LIMIT 1").get(personId);
      if (any || !unitCode) return false;
      const sitting = await db.prepare("SELECT 1 AS yes FROM assignments WHERE target_code = ? AND role = 'PRIMARY' AND ended_at IS NULL").get(unitCode);
      await db
        .prepare(
          `INSERT INTO assignments (id, person_id, target_type, target_code, role, source, reason)
           VALUES (?, ?, 'PU', ?, ?, 'IMPORT', 'From the agent list') ON CONFLICT DO NOTHING`
        )
        .run(randomUUID(), personId, unitCode, sitting ? "BACKUP" : "PRIMARY");
      return true;
    },

    /**
     * Apply a set of changes, all of them or none.
     *
     * `ends` are assignment ids, `starts` are `{ personId, type, code, role }`.
     * Checked against what is held before anything is written, so a refused
     * change is refused with a sentence and not with a database error.
     * Returns `{ ok, error }` or `{ ok, ended, started, people }`.
     */
    async apply({ ends = [], starts = [], source = "MANUAL", reason = null, note = null, user }) {
      const held = (await db.prepare("SELECT id, person_id, target_code, target_type, role FROM assignments WHERE ended_at IS NULL").all()).filter(
        (row) => !ends.includes(row.id)
      );
      const ending = ends.length
        ? await db.prepare(`SELECT id, person_id, target_code, role FROM assignments WHERE ended_at IS NULL AND id IN (${ends.map(() => "?").join(", ")})`).all(...ends)
        : [];
      const primary = new Set(held.filter((row) => row.role === "PRIMARY").map((row) => row.target_code));
      const pairs = new Set(held.map((row) => `${row.person_id}|${row.target_code}`));
      for (const start of starts) {
        const level = levelOf(start.code);
        if (start.role === "COORDINATOR" ? level !== "ward" : level !== "pu") {
          return { ok: false, error: start.role === "COORDINATOR" ? "A coordinator is assigned to a ward." : "An agent is assigned to a polling unit." };
        }
        if (pairs.has(`${start.personId}|${start.code}`)) return { ok: false, error: `${start.code} is already assigned to that person.` };
        if (start.role === "PRIMARY" && primary.has(start.code)) return { ok: false, error: `${start.code} already has a primary agent. Replace them, or add this one as a backup.` };
        pairs.add(`${start.personId}|${start.code}`);
        if (start.role === "PRIMARY") primary.add(start.code);
      }

      await transaction((q) => [
        ...ending.map((row) =>
          q("UPDATE assignments SET ended_at = now(), ended_by = ?, ended_name = ?, end_reason = ?, end_note = ? WHERE id = ? AND ended_at IS NULL", user.id, user.name, reason, note, row.id)
        ),
        ...starts.map((start) =>
          q(
            `INSERT INTO assignments (id, person_id, target_type, target_code, role, source, reason, note, changed_by, changed_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            randomUUID(), start.personId, start.role === "COORDINATOR" ? "WARD" : "PU", start.code, start.role, source, reason, note, user.id, user.name
          )
        ),
      ]);

      const people = [...new Set([...ending.map((row) => row.person_id), ...starts.map((start) => start.personId)])];
      for (const personId of people) await store.syncPerson(personId);
      return { ok: true, ended: ending.map((row) => ({ personId: row.person_id, code: row.target_code, role: row.role })), started: starts, people };
    },

    /** People on the roster the party's list named who are not there yet. */
    async addPeople(people, user) {
      const ids = new Map();
      for (const person of people) {
        const id = randomUUID();
        const rows = await db
          .prepare(
            `INSERT INTO coordinators (id, name, phone, password_hash, status, approved_by, approved_at, kind, party_ref, note)
             VALUES (?, ?, ?, 'code-only', 'ACTIVE', ?, now(), ?, ?, 'From the party list')
             ON CONFLICT (phone) DO UPDATE SET party_ref = COALESCE(coordinators.party_ref, excluded.party_ref), kind = excluded.kind
             RETURNING id`
          )
          .all(id, person.fullName, person.phone, user.id, person.role, person.partyRef);
        ids.set(person.key, rows[0]?.id ?? id);
      }
      return ids;
    },

    async search(text, take = 20) {
      const term = String(text ?? "").trim();
      if (term.length < 2) return [];
      const digits = term.replace(/\D/g, "");
      const rows = await db
        .prepare(
          `SELECT id, name, phone, status, kind, party_ref, unit_code, code_hint, last_login_at FROM coordinators
            WHERE status IN ('ACTIVE', 'PENDING') AND (lower(name) LIKE ? OR party_ref = ? ${digits.length >= 4 ? "OR phone LIKE ?" : ""} OR upper(code_hint) = ?)
            ORDER BY name LIMIT ?`
        )
        .all(...[`%${term.toLowerCase()}%`, term, digits.length >= 4 ? `%${digits.replace(/^0/, "")}%` : null, term.toUpperCase().slice(-2), take].filter((value) => value !== null));
      return rows.map((row) => ({
        id: row.id, name: row.name, phone: row.phone, status: row.status, kind: row.kind, partyRef: row.party_ref, unitCode: row.unit_code, lastSeen: iso(row.last_login_at),
      }));
    },

    async person(id) {
      const row = await db.prepare("SELECT id, name, phone, status, kind, party_ref, unit_code, last_login_at, code_hash FROM coordinators WHERE id = ?").get(id);
      return row && { id: row.id, name: row.name, phone: row.phone, status: row.status, kind: row.kind, partyRef: row.party_ref, unitCode: row.unit_code, lastSeen: iso(row.last_login_at), hasCode: Boolean(row.code_hash) };
    },

    /**
     * Where cover is missing. `units` is INEC's list of polling unit codes
     * under the place asked about, and `wards` its wards; both come from the
     * caller so that silence is measured against the list, not against rows.
     */
    async gaps({ units, wards, under = "", checkInBy = null }) {
      const like = under ? `${under}/%` : "%";
      const [primaries, coordinators, loose, silent] = await Promise.all([
        db.prepare("SELECT target_code FROM assignments WHERE role = 'PRIMARY' AND ended_at IS NULL AND target_code LIKE ?").all(like),
        db.prepare("SELECT target_code FROM assignments WHERE role = 'COORDINATOR' AND ended_at IS NULL AND (target_code = ? OR target_code LIKE ?)").all(under, like),
        db.prepare(
          `SELECT c.id, c.name, c.phone, c.kind FROM coordinators c
            WHERE c.status = 'ACTIVE' AND c.disabled_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.person_id = c.id AND a.ended_at IS NULL) ORDER BY c.name LIMIT 200`
        ).all(),
        checkInBy
          ? db.prepare(
              `SELECT a.target_code, c.name, c.phone FROM assignments a JOIN coordinators c ON c.id = a.person_id
                WHERE a.role = 'PRIMARY' AND a.ended_at IS NULL AND a.target_code LIKE ?
                  AND (c.last_login_at IS NULL OR c.last_login_at < ?) ORDER BY a.target_code LIMIT 300`
            ).all(like, checkInBy)
          : [],
      ]);
      const covered = new Set(primaries.map((row) => row.target_code));
      const led = new Set(coordinators.map((row) => row.target_code));
      return {
        noPrimary: units.filter((code) => !covered.has(code)),
        noCoordinator: wards.filter((code) => !led.has(code)),
        unassigned: loose.map((row) => ({ id: row.id, name: row.name, phone: row.phone, kind: row.kind })),
        notCheckedIn: silent.map((row) => ({ code: row.target_code, name: row.name, phone: row.phone })),
      };
    },

    async savePreview({ fileName, preview, user }) {
      const id = randomUUID();
      await db.prepare("INSERT INTO assignment_imports (id, file_name, preview, created_by) VALUES (?, ?, ?, ?)").run(id, fileName, JSON.stringify(preview), user.id);
      return id;
    },

    async preview(id) {
      const row = await db.prepare("SELECT * FROM assignment_imports WHERE id = ?").get(id);
      return row && { id: row.id, fileName: row.file_name, preview: JSON.parse(row.preview), committedAt: iso(row.committed_at), at: iso(row.created_at) };
    },

    /** Claimed in one statement, so a double click commits a list once. */
    async claimPreview(id) {
      const rows = await db.prepare("UPDATE assignment_imports SET committed_at = now() WHERE id = ? AND committed_at IS NULL RETURNING id").all(id);
      return rows.length > 0;
    },

    async releasePreview(id) {
      await db.prepare("UPDATE assignment_imports SET committed_at = NULL WHERE id = ?").run(id);
    },

    /** Agents on a ground, for a ward coordinator's or a desk's list. */
    async agentsOn(ground, take = 300) {
      const where = whereGround(ground, "a.target_code");
      const rows = await db.prepare(`${JOINED} WHERE a.ended_at IS NULL AND a.target_type = 'PU'${where.sql} ORDER BY a.target_code LIMIT ?`).all(...where.params, take);
      return rows.map(toAssignment);
    },
  };
  return store;
}
