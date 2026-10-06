/**
 * What is wrong with what INEC published, place by place.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  AN ACCOUNT THAT NEEDS NO SHEET TO BE READ, AND NO RETURN OF OURS
 *
 *  lib/irev/verify.js holds INEC's sheets against our own returns, which
 *  needs the sheets read into figures and an agent of ours at the unit. But
 *  before either there is already a great deal to say about an election from
 *  the publishing alone:
 *
 *    · polling units INEC lists and published no sheet for
 *    · sheets that went up two, five, twenty days after the poll
 *    · sheets that were replaced after they first went up
 *    · sheets the portal says are up, whose address holds no file
 *
 *  For the 2023 presidential election that is the whole country, every one
 *  of 176,846 polling units, on the day it is gathered. This file adds those
 *  up by place and lists the polling units behind each count.
 *
 *  ── A SHARE, NOT A COLOUR ───────────────────────────────────────────────
 *  Nearly every state has a missing sheet. Marking a place "irregular" for
 *  holding one would mark everywhere, and say nothing. So each fault is
 *  given as how many polling units carry it and what share of the place's
 *  units that is, and places are set in order of that share. Thirty-one in a
 *  hundred sheets missing and one in a hundred are different facts, and only
 *  a share shows it.
 *
 *  ── FACTS, NOT VERDICTS ─────────────────────────────────────────────────
 *  A late sheet is late. Why — no network at the unit, a device that failed,
 *  or something worse — is not in the data and is not claimed here.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { STATES } from "../units.js";
import { bank } from "./bank.js";
import * as vault from "./vault.js";

/** Every fault, in the order the screen shows them, in words. */
export const FAULT_WORDS = {
  missing: {
    label: "No sheet published",
    what: "INEC lists the polling unit and has published no result sheet for it.",
  },
  late: {
    label: "Sheet went up late",
    what: `The sheet reached INEC's portal ${vault.LATE_DAYS} or more days after polling day.`,
  },
  replaced: {
    label: "Sheet replaced",
    what: "The sheet now shown is not the first one published for the polling unit.",
  },
  gone: {
    label: "Listed, but not there",
    what: "The portal says a sheet is up, and there is no file where it says the sheet is.",
  },
  odd_picture: {
    label: "Photographed elsewhere, or on another day",
    what: "The photograph's own details place it in another state, before polling day, or days after it.",
  },
  wrong_paper: {
    label: "Another polling unit's paper",
    what: "The code written on the sheet is not the polling unit it is published under.",
  },
  overvote: {
    label: "More votes than voters",
    what: "The sheet's own figures show more votes than accredited voters, or more accredited than registered.",
  },
  unreadable: {
    label: "Could not be read",
    what: "A sheet is up and its figures could not be made out.",
  },
  doubt: {
    label: "Reading in doubt",
    what: "Figures were read off the sheet and do not add up, so they are not relied on.",
  },
};

export const FAULT_ORDER = Object.keys(FAULT_WORDS);

/** How much of a unit's code names each step down: state, LGA, ward, unit. */
const WIDTHS = [2, 5, 8, 12];
const LEVELS = ["state", "lga", "ward", "unit"];

/** "05/16/01" tidied, or "" where it is not a place. */
export function tidyUnder(under) {
  const parts = String(under ?? "").split("/").map((part) => part.replace(/\D/g, "")).filter(Boolean).slice(0, 3);
  if (parts.some((part, index) => part.length !== 2 || (index === 0 && Number(part) > 37))) return "";
  return parts.join("/");
}

/** The fault a caller named, where it is one. */
export function tidyKind(kind) {
  return FAULT_ORDER.includes(kind) ? kind : null;
}

const stateName = (number) => STATES.find((state) => state.number === number)?.name ?? `State ${number}`;

/** The steps the days after polling day are counted in. */
const UPLOAD_STEPS = [
  { key: "before", label: "Before polling day", from: -Infinity, to: -1 },
  { key: "day", label: "On polling day", from: 0, to: 0 },
  { key: "next", label: "The day after", from: 1, to: 1 },
  { key: "two", label: "2 days after", from: 2, to: 2 },
  { key: "three", label: "3 days after", from: 3, to: 3 },
  { key: "week", label: "4 to 7 days after", from: 4, to: 7 },
  { key: "month", label: "8 to 30 days after", from: 8, to: 30 },
  { key: "later", label: "More than a month after", from: 31, to: Infinity },
];

/**
 * When the sheets under a place went up, in steps from polling day.
 *
 * `days` is rows of `{ day, sheets }`. Null where no sheet carries a time.
 * The two ends — before polling day, and more than a month after — are only
 * shown where a sheet falls in them; the steps between are always there, so
 * an empty polling day reads as empty and not as left out.
 */
export function uploadSteps(days = []) {
  const timed = days.reduce((sum, row) => sum + row.sheets, 0);
  if (timed === 0) return null;

  const steps = UPLOAD_STEPS.map((step) => ({
    key: step.key,
    label: step.label,
    late: step.from >= vault.LATE_DAYS,
    odd: step.to < 0,
    sheets: days.filter((row) => row.day >= step.from && row.day <= step.to).reduce((sum, row) => sum + row.sheets, 0),
  })).filter((step) => step.sheets > 0 || (step.key !== "before" && step.key !== "later"));

  return { timed, steps, lastDay: Math.max(...days.map((row) => row.day)) };
}

/** What is wrong at one flagged polling unit, as short sentences. */
export function faultSentences(flag) {
  const out = [];
  if (flag.sheet_up === false && !flag.no_voters) out.push("no sheet published");
  if (flag.no_file) out.push("listed as up, with no file at its address");
  else if (flag.picture_status === "gone" || flag.read_status === "gone") out.push("listed as up, and no longer on INEC's storage");
  if (Number.isInteger(flag.days_after) && flag.days_after >= vault.LATE_DAYS) out.push(`went up ${flag.days_after} days after polling day`);
  if (flag.earlier_sheets > 0) out.push(`replaced ${flag.earlier_sheets} time${flag.earlier_sheets === 1 ? "" : "s"}`);
  if (flag.place_ok === false) out.push(`photographed in ${[flag.taken_lga, flag.taken_state].filter(Boolean).join(", ")}, not where the unit is`);
  if (Number.isInteger(flag.days_from_poll) && flag.days_from_poll < 0) out.push(`photographed ${Math.abs(flag.days_from_poll)} day(s) before polling day`);
  if (Number.isInteger(flag.days_from_poll) && flag.days_from_poll > 1) out.push(`photographed ${flag.days_from_poll} days after polling day`);
  if (flag.code_matches === false) out.push(`carries another unit's code (${flag.code_on_sheet})`);
  if (flag.sound && flag.valid_votes > flag.accredited) out.push(`${flag.valid_votes} valid votes from ${flag.accredited} accredited voters`);
  if (flag.sound && flag.registered != null && flag.accredited > flag.registered) out.push(`${flag.accredited} accredited from ${flag.registered} registered`);
  if (flag.read_status === "unreadable") out.push("could not be read into figures");
  if (flag.read_status === "read" && !flag.sound && flag.code_matches !== false) out.push("the figures read off it do not add up");
  return out;
}

/**
 * The account for one place, from what the database returned. Pure.
 *
 * `totals` is vault.placeTotals for the place, `flags` vault.placeFlags, and
 * `days` vault.uploadDays.
 */
export function buildFaults({ under = "", totals = [], flags = [], days = [], kind = null }) {
  const depth = Math.min(String(under).split("/").filter(Boolean).length, 3);

  const children = totals.map((row) => ({
    key: row.key,
    name:
      depth === 0 ? stateName(row.key.slice(0, 2)) : depth === 1 ? (row.lga_name ?? row.key) : depth === 2 ? (row.ward_name ?? row.key) : (row.unit_name ?? row.key),
    unitId: depth === 3 ? row.unit_id : null,
    units: row.units,
    sheets: row.sheets,
    noVoters: row.no_voters ?? 0,
    timed: row.timed ?? 0,
    faulty: row.faulty ?? 0,
    faults: Object.fromEntries(FAULT_ORDER.map((name) => [name, row[name] ?? 0])),
  }));

  const whole = children.reduce(
    (sum, place) => {
      for (const name of ["units", "sheets", "noVoters", "timed", "faulty"]) sum[name] += place[name];
      for (const name of FAULT_ORDER) sum.faults[name] += place.faults[name];
      return sum;
    },
    { units: 0, sheets: 0, noVoters: 0, timed: 0, faulty: 0, faults: Object.fromEntries(FAULT_ORDER.map((name) => [name, 0])) }
  );

  return {
    under,
    level: LEVELS[depth],
    kind,
    whole,
    children,
    uploads: uploadSteps(days),
    flags: flags.map((flag) => ({
      unitId: flag.unit_id,
      unitCode: flag.pu_code,
      name: flag.unit_name,
      where: [flag.ward_name, flag.lga_name, depth === 0 ? flag.state_name : null].filter(Boolean).join(", "),
      what: faultSentences(flag),
    })),
  };
}

/* ── THE SAME PLACE ASKED FOR TWICE IN A MOMENT IS ADDED UP ONCE ────────────
   A nationwide election is 176,000 polling units, and a room on a wall
   redraws every fifteen seconds. What INEC published in 2023 does not change
   between two of those, and what is being gathered tonight moves by a few
   sheets. So what the database added up is kept for a few seconds. */
const KEEP_MS = 20000;
const kept = new Map();

function remembered(key, work) {
  const held = kept.get(key);
  if (held && Date.now() - held.at < KEEP_MS) return held.value;

  const value = work();
  kept.set(key, { at: Date.now(), value });
  /* A failure is not remembered: the next call asks again. */
  value.catch(() => kept.delete(key));
  if (kept.size > 300) {
    for (const [name, entry] of kept) if (Date.now() - entry.at >= KEEP_MS) kept.delete(name);
  }
  return value;
}

/** The crumbs from the country down to `under`, each with its name. */
async function crumbs(db, electionId, under) {
  const parts = under ? under.split("/") : [];
  const out = [{ key: "", name: "Nigeria" }];
  for (let depth = 0; depth < parts.length; depth += 1) {
    const key = parts.slice(0, depth + 1).join("/");
    let name = stateName(parts[0]);
    if (depth > 0) {
      const row = await vault.placeName(db, electionId, key);
      name = depth === 1 ? (row?.lga_name ?? key) : (row?.ward_name ?? key);
    }
    out.push({ key, name });
  }
  return out;
}

/**
 * The publishing account for one place under a project.
 *
 * Reads the election the project is already tied to and nothing else; the
 * tying itself is done by lib/irev/verify.js and the INEC results screen.
 * Like that file, it never throws: every way it can come up empty is a
 * `{ none: true, why }` the screen turns into a sentence.
 */
export async function publishingFaults(project, under = "", { kind: asked = null, limit = 60 } = {}) {
  if (!project?.id) return null;

  try {
    const db = bank();
    if (!db) return { none: true, why: "no-bank" };
    if (!(await vault.ready(db))) return { none: true, why: "not-opened" };

    const election = await vault.electionForProject(db, project.id);
    if (!election) return { none: true, why: "no-election" };
    if (!(election.gathered_at || election.pass_started_at)) {
      return { none: true, why: "not-gathered", election: { id: election.election_id, name: election.name } };
    }

    const id = election.election_id;
    const day = election.held_on;
    const at = tidyUnder(under);
    const kind = tidyKind(asked);
    const width = WIDTHS[Math.min(at ? at.split("/").length : 0, 3)];

    const [totals, days, path, progress, flags] = await Promise.all([
      remembered(`${id}|${at}|totals`, () => vault.placeTotals(db, id, at, width, day)),
      remembered(`${id}|${at}|days`, () => vault.uploadDays(db, id, at, day)),
      remembered(`${id}|${at}|crumbs`, () => crumbs(db, id, at)),
      remembered(`${id}|progress`, () => vault.progress(db, id)),
      /* A fault has to be named before its polling units are listed: "every
         unit with anything wrong" is most of the country. */
      kind ? remembered(`${id}|${at}|${kind}|${limit}`, () => vault.placeFlags(db, id, at, { kind, heldOn: day, limit })) : [],
    ]);

    return {
      election: {
        id,
        name: election.name,
        heldOn: day,
        gathering: Boolean(election.pass_started_at),
        gathered: Boolean(election.gathered_at),
        /* What the portal itself says it holds, to set beside what was gathered. */
        expected: election.expected_units ?? null,
        portalSheets: election.sheets_up ?? null,
        wards: progress?.wards ?? 0,
        wardsLeft: progress?.wards_left ?? 0,
        lateFrom: vault.LATE_DAYS,
      },
      crumbs: path,
      words: FAULT_WORDS,
      ...buildFaults({ under: at, totals, flags, days, kind }),
    };
  } catch (error) {
    return { none: true, why: "error", message: String(error?.message ?? error).slice(0, 200) };
  }
}

/**
 * Every polling unit under a place carrying one fault, as a spreadsheet.
 * Returns the text of a CSV, or null where there is nothing to give.
 */
export async function faultsSpreadsheet(project, under, asked) {
  const kind = tidyKind(asked);
  if (!kind) return null;

  const account = await publishingFaults(project, under, { kind, limit: 200000 });
  if (!account?.flags) return null;

  const cell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [["Polling unit code", "Polling unit", "Where", "What is wrong"].map(cell).join(",")];
  for (const flag of account.flags) {
    lines.push([flag.unitCode, flag.name, flag.where, flag.what.join("; ")].map(cell).join(","));
  }
  return {
    name: `${account.election.name} - ${account.crumbs.at(-1).name} - ${FAULT_WORDS[kind].label}.csv`.replace(/[\\/:*?"<>|]/g, " "),
    text: `﻿${lines.join("\n")}`,
  };
}
