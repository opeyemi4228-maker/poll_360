import { z } from "zod";

import {
  COUNTED_BELOW,
  DEEP_YEARS,
  LGA_NAMES,
  STATE_LIST,
  STATE_YEARS,
  ZONE_NAMES,
  deepFor,
  deepRows,
  indexRows,
  nameOf,
  partyIn,
  stateByCode,
  stateRows,
  yearsFor,
} from "./ground.js";
import { CANDIDATES, ELECTIONS } from "../strongholds.js";
import { FACTORS, scorePlaces } from "../stronghold-map.js";
import { project, winCondition } from "../forecast.js";
import { ZONES } from "../zones.js";
import { strengthSections } from "./strength.js";
import { LEVEL_WORDS, STATUS, TIER_LABEL, count, fmtInt, fmtPct, fmtPts, listOf } from "./format.js";

/**
 * Ask Poll360's engine: a question, already understood, answered from the
 * record.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONLY PLACE A FIGURE IS MADE
 *
 *  Whether a question was understood by the parser in lib/ask/parse.js or by
 *  the model in lib/ask/model.js, what arrives here is a `Plan` — a small,
 *  validated description of what to compute. The engine computes it from
 *  lib/ask/ground.js and returns tables and facts. Nothing downstream of it
 *  invents a number: the written answer is built from `facts`, and when the
 *  model writes it instead, every figure it uses is checked against what this
 *  returned (see lib/ask/verify.js).
 *
 *  The ground an account holds is applied here, not in the route and not in
 *  the prompt. A plan can ask for Kano; an account that holds Adamawa gets
 *  Adamawa and a sentence saying why.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const INTENTS = ["reach", "list", "target", "swing", "profile", "scenario", "strength", "overview"];
export const LEVELS = ["zone", "state", "district", "constituency", "lga", "ward", "unit"];
export const FIELDS = ["share", "lead", "swing", "turnout", "registered", "cast", "votes", "won", "tier", "top", "booths"];
const OPS = [">=", ">", "<=", "<", "=", "!="];

const DEEP = new Set(["district", "constituency", "lga", "ward", "unit"]);

/** How many rows of one table may leave in a file. The same ceiling the count export keeps. */
export const FILE_CEILING = 20_000;

/**
 * How many rows one CSV or XML file carries across all its tables.
 *
 * A deployed function returns a few megabytes at most, and an answer about
 * every polling unit in the country is 165,000 rows. So a file takes each
 * table whole while the budget lasts, higher levels first, and says in its
 * own rows where it stopped. A whole state's polling units always fit.
 */
export const FILE_BUDGET = 12_000;

const Who = z.union([
  z.object({ kind: z.literal("candidate"), name: z.string().min(2).max(80) }),
  z.object({ kind: z.literal("party"), id: z.string().min(1).max(12) }),
]);

export const PlanSchema = z.object({
  intent: z.enum(INTENTS),
  who: Who,
  levels: z.array(z.enum(LEVELS)).min(1).max(4),
  year: z.number().int().nullable().default(null),
  compareYear: z.number().int().nullable().default(null),
  threshold: z.number().min(0).max(100).nullable().default(null),
  band: z.number().min(0).max(50).nullable().default(null),
  show: z.enum(["all", "can", "cleared", "short"]).nullable().default(null),
  within: z
    .object({
      zones: z.array(z.string().max(40)).max(6).default([]),
      states: z.array(z.string().max(4)).max(37).default([]),
      lgas: z.array(z.string().max(8)).max(60).default([]),
    })
    .default({ zones: [], states: [], lgas: [] }),
  filters: z
    .array(
      z.object({
        field: z.enum(FIELDS),
        op: z.enum(OPS),
        value: z.union([z.number(), z.boolean(), z.string().max(20)]),
      })
    )
    .max(6)
    .default([]),
  /* Strength only: set the party's register against Atiku's vote, place by
     place. Never added together — see lib/ask/strength.js. */
  against: z.enum(["vote"]).nullable().default(null),
  sort: z
    .object({ field: z.enum([...FIELDS, "score", "gap", "need", "members", "per_thousand"]), dir: z.enum(["asc", "desc"]) })
    .nullable()
    .default(null),
  limit: z.number().int().min(1).max(FILE_CEILING).nullable().default(null),
  factors: z.array(z.enum(["voters", "clusters", "turnout", "close"])).min(1).nullable().default(null),
  place: z.object({ level: z.enum(LEVELS), key: z.string().max(24) }).nullable().default(null),
  scenario: z
    .object({
      swing: z.record(z.string(), z.number().min(-50).max(50)).default({}),
      turnout: z.number().min(0.3).max(2).nullable().default(null),
    })
    .nullable()
    .default(null),
});

/* ══════════════════════════════════════════════════════════════ who */

const KNOWN_CANDIDATES = new Map(CANDIDATES.map((entry) => [entry.name.toLowerCase(), entry.name]));
const KNOWN_PARTIES = new Set(ELECTIONS.flatMap((election) => election.parties.map((party) => party.id)));

function resolveWho(who) {
  if (who.kind === "candidate") {
    const name = KNOWN_CANDIDATES.get(who.name.toLowerCase());
    return name ? { kind: "candidate", name } : null;
  }
  const id = who.id.toUpperCase();
  return KNOWN_PARTIES.has(id) && id !== "OTH" ? { kind: "party", id } : null;
}

/* ══════════════════════════════════════════════════════════════ ground */

/**
 * The ground a plan may read: what it asked for, inside what the account holds.
 *
 * Returns `states` (codes, or null for every state), `lgas` (keys, or null),
 * a name for the ground in words, and whether anything was held back.
 */
export function scopeOf(within = {}, territory = null) {
  const notes = [];
  const zoneStates = (within.zones ?? [])
    .map((zone) => ZONE_NAMES.find((name) => name.toLowerCase() === String(zone).toLowerCase()))
    .filter(Boolean);
  const askedStates = new Set([
    ...(within.states ?? []).map((code) => String(code).toUpperCase()).filter((code) => stateByCode(code)),
    ...zoneStates.flatMap((zone) => ZONES[zone]),
  ]);
  const askedLgas = (within.lgas ?? []).filter((key) => LGA_NAMES.some((lga) => lga.key === key));
  for (const key of askedLgas) {
    const lga = LGA_NAMES.find((entry) => entry.key === key);
    if (lga && !askedStates.size) askedStates.add(lga.stateCode);
  }

  /* ── WHAT THE ACCOUNT HOLDS ─────────────────────────────────────────────
     An account whose ground no longer resolves reads nothing — the same rule
     lib/viewing.js applies to every screen, for the same reason. */
  if (territory && (territory.level === "UNRESOLVED" || (!territory.stateCode && territory.level !== "NATION"))) {
    return { states: [], lgas: [], name: "no ground", empty: true, clamped: true, notes: [
      "This account's ground no longer names a place Poll360 holds, so there is nothing to read. An administrator can set it again.",
    ] };
  }

  let states = askedStates.size ? [...askedStates] : null;
  let lgas = askedLgas.length ? askedLgas : null;
  let clamped = false;

  if (territory?.stateCode) {
    const held = territory.stateCode;
    const heldLgas = territory.level === "STATE" ? null : territory.lgas ?? null;
    const outside = states ? states.filter((code) => code !== held) : [];
    if (states && outside.length) {
      notes.push(
        `This account holds ${territory.name}, so ${listOf(outside.map((code) => stateByCode(code)?.name))} ${
          outside.length === 1 ? "is" : "are"
        } outside it and not read here.`
      );
    }
    if (!states || outside.length) clamped = !states || outside.length > 0;
    states = [held];
    if (heldLgas) {
      const inside = lgas ? lgas.filter((key) => heldLgas.includes(key)) : heldLgas;
      if (lgas && inside.length < lgas.length) {
        notes.push(`Only the part of the question inside ${territory.name} is answered.`);
      }
      lgas = inside.length ? inside : heldLgas;
      clamped = true;
    }
  }

  const name = lgas
    ? territory?.stateCode && territory.level !== "STATE" && territory.level !== "LGA" && lgas === territory.lgas
      ? territory.name
      : listOf(lgas.map((key) => LGA_NAMES.find((lga) => lga.key === key)?.name), 4)
    : states
      ? zoneStates.length && !territory?.stateCode && sameSet(states, zoneStates.flatMap((zone) => ZONES[zone]))
        ? `the ${listOf(zoneStates)}`
        : listOf(states.map((code) => stateByCode(code)?.name), 5)
      : "Nigeria";

  return { states, lgas, name: name || "Nigeria", empty: false, clamped, notes, national: !states && !lgas };
}

const sameSet = (a, b) => a.length === b.length && a.every((item) => b.includes(item));

/* ══════════════════════════════════════════════════════════════ reading rows */

function zoneRows(who) {
  const years = yearsFor(who);
  return ZONE_NAMES.map((zone) => {
    const codes = ZONES[zone];
    const share = {};
    const lead = {};
    const won = {};
    const votes = {};
    const castBy = {};
    let registered = 0;
    let booths = 0;
    for (const year of years) {
      const election = ELECTIONS.find((entry) => entry.year === year);
      const party = partyIn(who, year);
      const tally = {};
      let total = 0;
      for (const row of election.rows.filter((entry) => codes.includes(entry.code))) {
        for (const [id, n] of Object.entries(row.votes)) tally[id] = (tally[id] ?? 0) + n;
        total += row.total ?? Object.values(row.votes).reduce((sum, n) => sum + n, 0);
        if (year === 2023) {
          registered += row.registered ?? 0;
          booths += row.booths ?? 0;
        }
      }
      const mine = tally[party.id] ?? 0;
      const best = Math.max(0, ...Object.entries(tally).filter(([id]) => id !== party.id && id !== "OTH").map(([, n]) => n));
      share[year] = total ? (mine / total) * 100 : null;
      lead[year] = total ? ((mine - best) / total) * 100 : null;
      won[year] = total ? mine > best : null;
      votes[year] = mine;
      castBy[year] = total;
    }
    const cast23 = castBy[2023] ?? null;
    return {
      level: "zone",
      key: zone,
      code: zone,
      name: zone,
      zone,
      registered: registered || null,
      booths: booths || null,
      cast: castBy[years[0]] ?? null,
      castBy,
      votes,
      share,
      lead,
      won,
      turnout: registered && cast23 ? (cast23 / registered) * 100 : null,
      density: booths ? registered / booths : null,
      counted: true,
    };
  });
}

async function rowsAt(level, who, scope, keep = () => true) {
  if (level === "zone") return zoneRows(who).filter(keep);
  if (level === "state") {
    return stateRows(who).filter((row) => (!scope.states || scope.states.includes(row.code)) && keep(row));
  }
  if (level === "lga") {
    return indexRows("lga", scope.states).filter(
      (row) => (!scope.lgas || scope.lgas.includes(row.lgaKey)) && keep(row)
    );
  }
  if (level === "district" || level === "constituency") {
    return indexRows(level, scope.states).filter(
      (row) => (!scope.lgas || row.lgaKeys.some((key) => scope.lgas.includes(key))) && keep(row)
    );
  }
  return deepRows(level, { states: scope.states, lgaKeys: scope.lgas, keep });
}

/* ══════════════════════════════════════════════════════════════ filters */

function valueOf(row, field, ctx) {
  switch (field) {
    case "share":
      return row.share?.[ctx.year] ?? null;
    case "lead":
      return row.lead?.[ctx.year] ?? null;
    case "swing": {
      const now = row.share?.[ctx.year];
      const then = ctx.prev ? row.share?.[ctx.prev] : null;
      return now === null || now === undefined || then === null || then === undefined ? null : now - then;
    }
    case "won":
      return row.won?.[ctx.year] ?? null;
    case "votes":
      return row.votes?.[ctx.year] ?? null;
    case "tier":
      return row.tier ?? null;
    case "score":
    case "gap":
    case "need":
      return row[field] ?? null;
    default:
      return row[field] ?? null;
  }
}

function passes(row, filters, ctx) {
  return filters.every(({ field, op, value }) => {
    const have = valueOf(row, field, ctx);
    if (field === "tier") {
      const any = String(value).toLowerCase() === "any";
      if (op === "!=") return any ? !have : have !== String(value).toUpperCase();
      return any ? Boolean(have) : have === String(value).toUpperCase();
    }
    if (have === null || have === undefined) return false;
    const want = typeof value === "string" ? Number(value) : value;
    if (typeof have === "boolean" || typeof want === "boolean") {
      const flag = Boolean(want);
      return op === "!=" ? have !== flag : have === flag;
    }
    switch (op) {
      case ">=":
        return have >= want;
      case ">":
        return have > want;
      case "<=":
        return have <= want;
      case "<":
        return have < want;
      case "!=":
        return have !== want;
      default:
        return Math.abs(have - want) < 1e-9;
    }
  });
}

function sortRows(rows, sort, ctx) {
  const dir = sort.dir === "asc" ? 1 : -1;
  return rows.sort((a, b) => {
    const x = valueOf(a, sort.field, ctx);
    const y = valueOf(b, sort.field, ctx);
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * dir;
  });
}

/* ══════════════════════════════════════════════════════════════ columns */

function placeColumns(level) {
  const first = { key: "rank", label: "#", kind: "int" };
  switch (level) {
    case "zone":
      return [first, { key: "name", label: "Zone", kind: "text", main: true }];
    case "state":
      return [first, { key: "name", label: "State", kind: "text", main: true }, { key: "zone", label: "Zone", kind: "text" }];
    case "district":
    case "constituency":
    case "lga":
      return [
        first,
        { key: "name", label: level === "lga" ? "Local government" : LEVEL_WORDS[level].title.replace(/s$/, ""), kind: "text", main: true },
        { key: "state", label: "State", kind: "text" },
      ];
    case "ward":
      return [
        first,
        { key: "name", label: "Ward", kind: "text", main: true },
        { key: "lga", label: "Local government", kind: "text" },
        { key: "state", label: "State", kind: "text" },
      ];
    default:
      return [
        first,
        { key: "code", label: "PU code", kind: "text", mono: true },
        { key: "name", label: "Polling unit", kind: "text", main: true },
        { key: "ward", label: "Ward", kind: "text" },
        { key: "lga", label: "Local government", kind: "text" },
        { key: "state", label: "State", kind: "text" },
      ];
  }
}

function placeValues(row) {
  return {
    key: row.key,
    name: row.name,
    code: row.code,
    zone: row.zone,
    state: row.state,
    lga: row.lga,
    ward: row.ward,
  };
}

/* ══════════════════════════════════════════════════════════════ provenance */

function provenanceOf(level, scope) {
  if (level === "state" || level === "zone") return "counted";
  const anambra = !scope.states || scope.states.includes("ANA");
  return anambra && COUNTED_BELOW.size ? "estimated-anambra" : "estimated";
}

/* ══════════════════════════════════════════════════════════════ reach */

/**
 * Where a subject clears a share, and what it would take where it does not.
 *
 * ── THE VOTES NEEDED, AND WHY THEY ARE THE LARGER NUMBER ─────────────────
 * Two different sums answer "how many more votes to reach 25%". If the extra
 * votes are won from another party, the total stays put and fewer are needed.
 * If they come from people who stayed home, the total grows with them and
 * more are needed. A campaign cannot choose which it gets, so the plan is
 * costed on the second — new voters, everybody else holding what they had —
 * and a vote converted from a rival is simply worth more than the plan
 * assumed.
 */
function reachSection(level, rows, ctx) {
  const { threshold: T, band, year, prev } = ctx;
  const aboveState = level === "state" || level === "zone";

  const read = rows.map((row) => {
    const cur = row.share?.[year] ?? null;
    const was = prev ? row.share?.[prev] ?? null : null;
    let status;
    if (cur === null) status = "unknown";
    else if (cur >= T) status = was !== null && was >= T ? "held" : "cleared";
    else if (was !== null && was >= T) status = "slipped";
    else if (cur >= T - band) status = "reach";
    else status = "beyond";

    const cast = aboveState ? row.castBy?.[year] ?? null : year === 2023 ? row.cast : null;
    const mine = aboveState ? row.votes?.[year] ?? null : cur !== null && cast !== null ? (cur / 100) * cast : null;
    const need =
      cur !== null && cast && mine !== null && T < 100
        ? Math.max(0, Math.ceil((T * cast - 100 * mine) / (100 - T)))
        : null;

    return {
      row,
      status,
      cur,
      was,
      gap: cur === null ? null : T - cur,
      need,
      perUnit: need !== null && row.booths ? need / row.booths : null,
    };
  });

  const counts = Object.fromEntries(Object.keys(STATUS).map((id) => [id, 0]));
  for (const entry of read) counts[entry.status] += 1;

  const show = ctx.show ?? (level === "ward" || level === "unit" ? "can" : "all");
  const keep = {
    all: () => true,
    can: (entry) => ["held", "cleared", "slipped", "reach"].includes(entry.status),
    cleared: (entry) => ["held", "cleared"].includes(entry.status),
    short: (entry) => ["slipped", "reach", "beyond"].includes(entry.status),
  }[show];

  let kept = read.filter(keep).filter((entry) => passes(entry.row, ctx.filters, ctx));
  if (ctx.sort) {
    kept.sort((a, b) => {
      const x = ctx.sort.field === "need" ? a.need : ctx.sort.field === "gap" ? a.gap : valueOf(a.row, ctx.sort.field, ctx);
      const y = ctx.sort.field === "need" ? b.need : ctx.sort.field === "gap" ? b.gap : valueOf(b.row, ctx.sort.field, ctx);
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (x - y) * (ctx.sort.dir === "asc" ? 1 : -1);
    });
  } else {
    kept.sort((a, b) => STATUS[a.status].rank - STATUS[b.status].rank || (b.cur ?? -1) - (a.cur ?? -1));
  }

  /* Short enough to sit in a table cell whole; the column head says which
     line they are against. */
  const labels = {
    held: prev ? "Held both years" : `Cleared ${year}`,
    cleared: prev ? `New in ${year}` : `Cleared ${year}`,
    slipped: `Lost since ${prev}`,
    reach: `Within ${fmtNumber(band)} pts`,
    beyond: "Out of reach",
    unknown: "No reading",
  };

  const tableRows = kept.map((entry, index) => ({
    rank: index + 1,
    ...placeValues(entry.row),
    share: entry.cur,
    share_prev: entry.was,
    change: entry.cur !== null && entry.was !== null ? entry.cur - entry.was : null,
    status: entry.status,
    status_label: labels[entry.status],
    gap: entry.gap !== null && entry.gap > 0 ? entry.gap : null,
    need: entry.need && entry.need > 0 ? entry.need : null,
    per_unit: entry.need && entry.perUnit ? entry.perUnit : null,
    registered: entry.row.registered,
    booths: entry.row.booths,
    turnout: entry.row.turnout,
  }));

  const columns = [
    ...placeColumns(level),
    { key: "share", label: `${year} share`, kind: "bar", threshold: T },
    ...(prev ? [{ key: "share_prev", label: `${prev} share`, kind: "pct" }, { key: "change", label: "Change", kind: "pts" }] : []),
    { key: "status", label: `Against ${fmtNumber(T)}%`, kind: "status" },
    { key: "gap", label: "Short by", kind: "gap" },
    { key: "need", label: "Votes to find", kind: "int" },
    { key: "per_unit", label: "Per polling unit", kind: "int" },
    { key: "registered", label: "Registered", kind: "int" },
    ...(level === "unit" ? [] : [{ key: "booths", label: "Polling units", kind: "int" }]),
    { key: "turnout", label: "Turnout", kind: "pct" },
  ];

  const nameList = (status, max = 8) =>
    read
      .filter((entry) => entry.status === status)
      .sort((a, b) => (b.cur ?? 0) - (a.cur ?? 0))
      .slice(0, max)
      .map((entry) => ({ name: entry.row.name, share: entry.cur, need: entry.need, state: entry.row.state }));

  const within = read.filter((entry) => entry.status === "reach" || entry.status === "slipped");
  const needWithin = within.reduce((sum, entry) => sum + (entry.need ?? 0), 0);
  const unitsWithin = within.reduce((sum, entry) => sum + (entry.row.booths ?? 0), 0);
  const cleared = counts.held + counts.cleared;

  /* ── SECTION 134, WHERE IT GOVERNS ──────────────────────────────────────
     A quarter of the vote in two-thirds of the states — 24 of 36 — with the
     FCT argued separately. Only computed for a whole-country reading of the
     states at the 25% line, which is the only reading the rule speaks to. */
  let section134 = null;
  if (level === "state" && T === 25 && ctx.scope.national) {
    const states36 = read.filter((entry) => entry.row.code !== "FCT");
    const clearedStates = states36.filter((entry) => entry.cur !== null && entry.cur >= 25).length;
    const reachStates = states36.filter((entry) => entry.status === "reach" || entry.status === "slipped").length;
    const fct = read.find((entry) => entry.row.code === "FCT");
    section134 = {
      cleared: clearedStates,
      required: 24,
      shortBy: Math.max(0, 24 - clearedStates),
      reach: reachStates,
      withReach: clearedStates + reachStates,
      fct: fct ? fct.cur !== null && fct.cur >= 25 : null,
      fctShare: fct?.cur ?? null,
    };
  }

  const tiles = [
    { label: `Cleared ${fmtNumber(T)}% in ${year}`, value: fmtInt(cleared), sub: `of ${count(read.length, level)}` },
    ...(prev ? [{ label: `Held in ${prev} and ${year}`, value: fmtInt(counts.held), sub: "the base" }] : []),
    {
      label: `Within reach`,
      value: fmtInt(counts.reach + counts.slipped),
      sub: `short by ${fmtNumber(band)} points or less, or held in ${prev ?? "the last run"}`,
    },
    {
      label: "Votes to find",
      value: fmtInt(needWithin),
      sub: unitsWithin ? `about ${fmtInt(needWithin / unitsWithin)} per polling unit` : "to lift those within reach",
    },
  ];
  if (section134) {
    tiles.unshift({
      label: "Section 134",
      value: `${section134.cleared} of 36`,
      sub: section134.shortBy ? `${section134.shortBy} short of the 24 needed` : "24 needed, met",
      tone: section134.shortBy ? "warn" : "good",
    });
    tiles.length = 4;
  }

  return {
    level,
    columns,
    rows: tableRows,
    total: tableRows.length,
    read: read.length,
    shown: show,
    tiles,
    facts: {
      kind: "reach",
      threshold: T,
      band,
      counts,
      cleared,
      read: read.length,
      within: within.length,
      needWithin,
      unitsWithin,
      perUnitWithin: unitsWithin ? needWithin / unitsWithin : null,
      held: nameList("held"),
      newly: nameList("cleared"),
      slipped: nameList("slipped"),
      reach: nameList("reach"),
      closestBeyond: nameList("beyond", 5),
      /* The within-reach places that cost least to lift, cheapest first — the
         order a plan short of a spread test would take them in. */
      cheapest: within
        .filter((entry) => entry.need !== null)
        .sort((a, b) => a.need - b.need)
        .slice(0, 8)
        .map((entry) => ({ name: entry.row.name, share: entry.cur, need: entry.need, state: entry.row.state })),
      section134,
      show,
    },
  };
}

function fmtNumber(n) {
  return Number.isInteger(n) ? String(n) : Number(n).toFixed(1);
}

/* ══════════════════════════════════════════════════════════════ list */

function listSection(level, rows, ctx) {
  let kept = rows.filter((row) => passes(row, ctx.filters, ctx));
  const sort = ctx.sort ?? { field: ctx.rankBy ?? "share", dir: "desc" };
  kept = sortRows(kept, sort, ctx);
  const deep = DEEP.has(level);

  const tableRows = kept.map((row, index) => ({
    rank: index + 1,
    ...placeValues(row),
    share: row.share?.[ctx.year] ?? null,
    share_prev: ctx.prev ? row.share?.[ctx.prev] ?? null : null,
    lead: row.lead?.[ctx.year] ?? null,
    won: row.won?.[ctx.year] ?? null,
    votes: row.votes?.[ctx.year] ?? null,
    tier: row.tier ?? null,
    registered: row.registered,
    booths: row.booths,
    turnout: row.turnout,
    top: row.top,
  }));

  const columns = [
    ...placeColumns(level),
    { key: "share", label: `${ctx.year} share`, kind: "bar", threshold: ctx.threshold ?? null },
    ...(ctx.prev ? [{ key: "share_prev", label: `${ctx.prev} share`, kind: "pct" }] : []),
    { key: "lead", label: "Lead", kind: "pts" },
    { key: "won", label: `Carried ${ctx.year}`, kind: "bool" },
    { key: "votes", label: deep ? "Votes (est.)" : "Votes", kind: "int" },
    ...(ctx.deepWho ? [{ key: "tier", label: "Stronghold", kind: "tier" }] : []),
    { key: "registered", label: "Registered", kind: "int" },
    ...(level === "unit" ? [] : [{ key: "booths", label: "Polling units", kind: "int" }]),
    { key: "turnout", label: "Turnout", kind: "pct" },
  ];

  const carried = tableRows.filter((row) => row.won).length;
  const votes = tableRows.reduce((sum, row) => sum + (row.votes ?? 0), 0);
  const registered = tableRows.reduce((sum, row) => sum + (row.registered ?? 0), 0);

  return {
    level,
    columns,
    rows: tableRows,
    total: tableRows.length,
    read: ctx.scanned ?? rows.length,
    tiles: [
      { label: `${LEVEL_WORDS[level].title} that match`, value: fmtInt(tableRows.length), sub: `of ${count(ctx.scanned ?? rows.length, level)} read` },
      { label: `Carried in ${ctx.year}`, value: fmtInt(carried), sub: "of those listed" },
      { label: deep ? "Votes, estimated" : "Votes", value: fmtInt(votes), sub: `${ctx.whoName}, ${ctx.year}` },
      { label: "Registered voters", value: fmtInt(registered), sub: "on those lists" },
    ],
    facts: {
      kind: "list",
      matched: tableRows.length,
      read: ctx.scanned ?? rows.length,
      /* Where nothing matched, the strongest places anyway, so the answer
         says where he stands rather than only where he does not. */
      strongest: tableRows.length
        ? []
        : [...rows]
            .filter((row) => row.share?.[ctx.year] !== null && row.share?.[ctx.year] !== undefined)
            .sort((a, b) => b.share[ctx.year] - a.share[ctx.year])
            .slice(0, 5)
            .map((row) => ({ name: row.name, share: row.share[ctx.year], state: row.state, lead: row.lead?.[ctx.year] ?? null })),
      carried,
      votes,
      registered,
      sortedBy: sort,
      top: tableRows.slice(0, 8).map((row) => ({ name: row.name, share: row.share, registered: row.registered, state: row.state })),
    },
  };
}

/* ══════════════════════════════════════════════════════════════ target */

function targetSection(level, rows, ctx) {
  const factors = ctx.factors ?? FACTORS.map((factor) => factor.id);
  const filtered = rows.filter((row) => passes(row, ctx.filters, ctx));
  const scored = scorePlaces(filtered, { factors, year: ctx.year }).sort((a, b) => b.score - a.score);
  const labels = FACTORS.filter((factor) => factors.includes(factor.id)).map((factor) => factor.label);

  const tableRows = scored.map((row, index) => ({
    rank: index + 1,
    ...placeValues(row),
    score: row.score,
    why: row.why.join(" · "),
    share: row.share?.[ctx.year] ?? null,
    lead: row.lead?.[ctx.year] ?? null,
    registered: row.registered,
    density: row.density ?? null,
    turnout: row.turnout,
  }));

  return {
    level,
    columns: [
      ...placeColumns(level),
      { key: "score", label: "Priority", kind: "score" },
      { key: "why", label: "Why it ranks", kind: "text" },
      { key: "share", label: `${ctx.year} share`, kind: "bar", threshold: ctx.threshold ?? null },
      { key: "lead", label: "Lead", kind: "pts" },
      { key: "registered", label: "Registered", kind: "int" },
      ...(level === "unit" ? [] : [{ key: "density", label: "Voters per unit", kind: "int" }]),
      { key: "turnout", label: "Turnout", kind: "pct" },
    ],
    rows: tableRows,
    total: tableRows.length,
    read: filtered.length,
    tiles: [
      { label: "Places ranked", value: fmtInt(tableRows.length), sub: count(filtered.length, level) },
      { label: "Top priority", value: tableRows[0]?.name ?? "—", sub: tableRows[0] ? `scores ${tableRows[0].score} of 100` : "" },
      {
        label: "Registered in the top 20",
        value: fmtInt(tableRows.slice(0, 20).reduce((sum, row) => sum + (row.registered ?? 0), 0)),
        sub: "voters to reach",
      },
      { label: "Weighed on", value: `${labels.length} factors`, sub: labels.join(", ") },
    ],
    facts: {
      kind: "target",
      factors: labels,
      ranked: tableRows.length,
      top: tableRows.slice(0, 8).map((row) => ({ name: row.name, score: row.score, why: row.why, share: row.share, registered: row.registered, state: row.state })),
      top20Registered: tableRows.slice(0, 20).reduce((sum, row) => sum + (row.registered ?? 0), 0),
    },
  };
}

/* ══════════════════════════════════════════════════════════════ swing */

function swingSection(level, rows, ctx) {
  if (!ctx.prev) return null;
  const filtered = rows.filter((row) => passes(row, ctx.filters, ctx));
  const sort = ctx.sort ?? { field: "swing", dir: "desc" };
  const sorted = sortRows(filtered, sort, ctx).filter((row) => valueOf(row, "swing", ctx) !== null);

  const tableRows = sorted.map((row, index) => ({
    rank: index + 1,
    ...placeValues(row),
    share_prev: row.share?.[ctx.prev] ?? null,
    share: row.share?.[ctx.year] ?? null,
    change: valueOf(row, "swing", ctx),
    won_prev: row.won?.[ctx.prev] ?? null,
    won: row.won?.[ctx.year] ?? null,
    registered: row.registered,
  }));

  const gained = tableRows.filter((row) => row.change > 0).length;
  const flippedIn = tableRows.filter((row) => row.won && row.won_prev === false).length;
  const flippedOut = tableRows.filter((row) => row.won === false && row.won_prev).length;

  return {
    level,
    columns: [
      ...placeColumns(level),
      { key: "share_prev", label: `${ctx.prev} share`, kind: "pct" },
      { key: "share", label: `${ctx.year} share`, kind: "bar", threshold: ctx.threshold ?? null },
      { key: "change", label: "Change", kind: "pts" },
      { key: "won_prev", label: `Carried ${ctx.prev}`, kind: "bool" },
      { key: "won", label: `Carried ${ctx.year}`, kind: "bool" },
      { key: "registered", label: "Registered", kind: "int" },
    ],
    rows: tableRows,
    total: tableRows.length,
    read: filtered.length,
    tiles: [
      { label: `Gained since ${ctx.prev}`, value: fmtInt(gained), sub: `of ${count(tableRows.length, level)}` },
      { label: `Lost ground`, value: fmtInt(tableRows.length - gained), sub: `share fell or held` },
      { label: `Carried in ${ctx.year}, not ${ctx.prev}`, value: fmtInt(flippedIn), sub: "won over" },
      { label: `Carried in ${ctx.prev}, not ${ctx.year}`, value: fmtInt(flippedOut), sub: "lost" },
    ],
    facts: {
      kind: "swing",
      gained,
      fell: tableRows.length - gained,
      flippedIn,
      flippedOut,
      best: tableRows.slice(0, 5).map((row) => ({ name: row.name, change: row.change, share: row.share })),
      worst: tableRows.slice(-5).reverse().map((row) => ({ name: row.name, change: row.change, share: row.share })),
    },
  };
}

/* ══════════════════════════════════════════════════════════════ profile */

async function profileSections(plan, who, scope, ctx) {
  const place = plan.place;
  if (!place) return [];
  const level = place.level;

  if (level === "state") {
    const code = place.key.toUpperCase();
    if (scope.states && !scope.states.includes(code)) return [];
    const history = ELECTIONS.filter((election) => election.stateLevel)
      .map((election) => {
        const row = election.rows.find((entry) => entry.code === code);
        if (!row) return null;
        const total = row.total ?? Object.values(row.votes).reduce((sum, n) => sum + n, 0);
        const ranked = Object.entries(row.votes).filter(([id]) => id !== "OTH").sort((a, b) => b[1] - a[1]);
        const party = partyIn(who, election.year);
        const mine = party ? row.votes[party.id] ?? 0 : null;
        const winner = election.parties.find((entry) => entry.id === ranked[0]?.[0]);
        return {
          rank: election.year,
          year: election.year,
          subject: party ? `${party.candidate} (${party.id})` : "Did not stand",
          share: party && total ? (mine / total) * 100 : null,
          votes: mine,
          winner: winner ? `${winner.id} · ${winner.candidate}` : ranked[0]?.[0],
          winner_share: total ? (ranked[0][1] / total) * 100 : null,
          margin: total && ranked[1] ? ((ranked[0][1] - ranked[1][1]) / total) * 100 : null,
          cast: total,
          turnout: row.registered ? (total / row.registered) * 100 : null,
          name: String(election.year),
        };
      })
      .filter(Boolean)
      .reverse();

    const state = stateByCode(code);
    const latest = history.find((row) => row.share !== null) ?? history[0];
    const earlier = history.filter((row) => row.share !== null && row !== latest)[0] ?? null;
    const sections = [];
    if (deepFor(who, 2023)) {
      const lgaRows = await rowsAt("lga", who, { ...scope, states: [code] });
      const lgas = listSection("lga", lgaRows, { ...ctx, year: 2023, prev: 2019, filters: [], sort: null, rankBy: "share", deepWho: true, whoName: nameOf(who) });
      lgas.title = `${state.name}'s local governments: ${nameOf(who)}, 2023`;
      lgas.provenance = provenanceOf("lga", { states: [code] });
      sections.push(lgas);
    }
    return [
      {
        level: "state",
        title: `${state.name}, every presidential election on record`,
        columns: [
          { key: "year", label: "Year", kind: "text", main: true },
          { key: "subject", label: nameOf(who, { long: true }), kind: "text" },
          { key: "share", label: "Share", kind: "bar", threshold: ctx.threshold ?? 25 },
          { key: "votes", label: "Votes", kind: "int" },
          { key: "winner", label: "Carried by", kind: "text" },
          { key: "winner_share", label: "Winner's share", kind: "pct" },
          { key: "margin", label: "Margin", kind: "pts" },
          { key: "cast", label: "Valid votes", kind: "int" },
          { key: "turnout", label: "Turnout", kind: "pct" },
        ],
        rows: history,
        total: history.length,
        read: history.length,
        tiles: [
          { label: `${nameOf(who)}, ${latest.year}`, value: fmtPct(latest.share), sub: `${fmtInt(latest.votes)} votes` },
          ...(earlier ? [{ label: `${nameOf(who)}, ${earlier.year}`, value: fmtPct(earlier.share), sub: `${fmtInt(earlier.votes)} votes` }] : []),
          { label: `Carried by, ${latest.year}`, value: latest.winner.split(" · ")[0], sub: `${fmtPct(latest.winner_share)} · margin ${fmtPts(latest.margin)}` },
          { label: `Turnout, ${latest.year}`, value: fmtPct(latest.turnout), sub: `${fmtInt(latest.cast)} valid votes` },
        ],
        facts: {
          kind: "profile-state",
          state: state.name,
          zone: state.zone,
          history,
          lgas: sections[0]?.facts ?? null,
        },
        provenance: "counted",
      },
      ...sections,
    ];
  }

  /* A place below the state: find it, then set it beside its state. */
  const narrowed = { ...scope };
  let rows;
  if (level === "lga" || level === "district" || level === "constituency") {
    rows = (await rowsAt(level, who, narrowed)).filter((row) => row.key === place.key);
  } else {
    const [stateNumber, lgaN] = place.key.split(/[-/]/);
    const state = STATE_LIST.find((entry) => entry.number === stateNumber);
    if (!state || (scope.states && !scope.states.includes(state.code))) return [];
    const lgaKey = `${stateNumber}/${lgaN}`;
    if (scope.lgas && !scope.lgas.includes(lgaKey)) return [];
    rows = await deepRows(level, { states: [state.code], lgaKeys: [lgaKey], keep: (row) => row.key === place.key });
  }
  const row = rows[0];
  if (!row) return [];
  const parent = stateRows(who).find((entry) => entry.code === row.stateCode);

  const lines = [
    ["Registered voters", row.registered, "int"],
    ["Votes cast, 2023", row.cast, "int"],
    ["Turnout, 2023", row.turnout, "pct"],
    ...(level === "unit" ? [] : [["Polling units", row.booths, "int"]]),
    [`${nameOf(who)}'s share, 2023`, row.share?.[2023], "pct"],
    [`${nameOf(who)}'s share, 2019`, row.share?.[2019], "pct"],
    ["Change since 2019", row.share?.[2023] != null && row.share?.[2019] != null ? row.share[2023] - row.share[2019] : null, "pts"],
    ["Lead over the next party, 2023", row.lead?.[2023], "pts"],
    ["Carried in 2023", row.won?.[2023], "bool"],
    ["Carried in 2019", row.won?.[2019], "bool"],
    ["Stronghold level", row.tier, "tier"],
    [`${row.state}: ${nameOf(who)}'s share, 2023 (counted)`, parent?.share?.[2023], "pct"],
  ];

  return [
    {
      level,
      title: `${row.name}${row.lga && level !== "lga" ? `, ${row.lga}` : ""}, ${row.state}`,
      columns: [
        { key: "name", label: "Measure", kind: "text", main: true },
        { key: "value_text", label: "Figure", kind: "text", numericLook: true },
      ],
      rows: lines.map(([label, value, kind], index) => ({
        rank: index + 1,
        name: label,
        value,
        kind,
        value_text:
          value === null || value === undefined
            ? "—"
            : kind === "int"
              ? fmtInt(value)
              : kind === "pct"
                ? fmtPct(value)
                : kind === "pts"
                  ? fmtPts(value)
                  : kind === "bool"
                    ? value ? "Yes" : "No"
                    : TIER_LABEL[value] ?? String(value),
      })),
      total: lines.length,
      read: 1,
      tiles: [],
      facts: {
        kind: "profile-place",
        place: row.name,
        level,
        state: row.state,
        lga: row.lga ?? null,
        share23: row.share?.[2023] ?? null,
        share19: row.share?.[2019] ?? null,
        stateShare23: parent?.share?.[2023] ?? null,
        won23: row.won?.[2023] ?? null,
        tier: row.tier ?? null,
        registered: row.registered,
        turnout: row.turnout,
      },
    },
  ];
}

/* ══════════════════════════════════════════════════════════════ scenario */

function scenarioSection(plan, who, scope, ctx) {
  const party = partyIn(who, 2023);
  if (!party || !["APC", "PDP", "LP", "NNPP"].includes(party.id)) return null;
  const swing = {};
  for (const [id, points] of Object.entries(plan.scenario?.swing ?? {})) {
    const key = id.toUpperCase();
    if (["APC", "PDP", "LP", "NNPP"].includes(key)) swing[key] = points;
  }
  const turnout = plan.scenario?.turnout ?? 1;
  const projection = project({ swing, turnout, scopeStates: scope.states ?? null });
  const index = ["APC", "PDP", "LP", "NNPP"].indexOf(party.id);
  const verdicts = winCondition(projection);
  const mine = verdicts.find((entry) => entry.id === party.id);
  const base = stateRows(who);
  const T = ctx.threshold ?? 25;

  const rows = projection.rows
    .map((row) => {
      const before = base.find((entry) => entry.code === row.code)?.share?.[2023] ?? null;
      const after = row.shares[index];
      return {
        key: row.code,
        name: row.name,
        zone: row.zone,
        share_prev: before,
        share: after,
        change: before === null ? null : after - before,
        winner: row.winner,
        won: row.winner === party.id,
        clears: after >= T,
        votes: row.votes[index],
        cast: row.votesCast,
      };
    })
    .sort((a, b) => b.share - a.share)
    .map((row, at) => ({ ...row, rank: at + 1 }));

  const leader = verdicts[0];
  const swingWords = Object.entries(swing)
    .map(([id, points]) => `${id} ${points > 0 ? "+" : "−"}${Math.abs(points)} pts`)
    .join(", ");

  return {
    level: "state",
    title: `If ${swingWords || "nothing moves"}${turnout !== 1 ? `, turnout ×${turnout}` : ""}`,
    columns: [
      ...placeColumns("state"),
      { key: "share_prev", label: "2023 share", kind: "pct" },
      { key: "share", label: "Projected share", kind: "bar", threshold: T },
      { key: "change", label: "Change", kind: "pts" },
      { key: "winner", label: "Projected winner", kind: "text" },
      { key: "clears", label: `Clears ${fmtNumber(T)}%`, kind: "bool" },
      { key: "votes", label: "Projected votes", kind: "int" },
    ],
    rows,
    total: rows.length,
    read: rows.length,
    provenance: "scenario",
    tiles: [
      { label: "Projected national share", value: fmtPct(mine.share), sub: `${nameOf(who)}, ${fmtInt(mine.votes)} votes` },
      { label: "States carried", value: fmtInt(mine.states), sub: `of ${rows.length}` },
      ...(mine.spreadApplies
        ? [{
            label: "Section 134",
            value: `${mine.quarterStates} of 36`,
            sub: mine.shortBy ? `${mine.shortBy} short of the 24 needed` : mine.quarterFct ? "24 needed, met, and the FCT" : "24 needed, met; the FCT short",
            tone: mine.shortBy ? "warn" : "good",
          }]
        : []),
      { label: "Leads the count", value: leader.id === party.id ? "Yes" : "No", sub: leader.id === party.id ? "first on votes" : `${leader.id} leads on ${fmtPct(leader.share)}` },
    ],
    facts: {
      kind: "scenario",
      swing,
      turnout,
      share: mine.share,
      votes: mine.votes,
      states: mine.states,
      quarterStates: mine.quarterStates,
      quarterFct: mine.quarterFct,
      shortBy: mine.shortBy,
      spreadApplies: mine.spreadApplies,
      leads: leader.id === party.id,
      leader: { id: leader.id, share: leader.share },
      flipped: rows.filter((row) => row.won && base.find((entry) => entry.code === row.key)?.won?.[2023] === false).map((row) => row.name),
    },
  };
}

/* ══════════════════════════════════════════════════════════════ run */

/**
 * Answer a plan.
 *
 * @returns {{ plan, who, whoName, year, prev, scope, sections, notes, understood }}
 */
export async function run(input, { territory = null } = {}) {
  const plan = PlanSchema.parse(input);
  const notes = [];

  const who = resolveWho(plan.who);
  if (!who) {
    return empty(plan, "That candidate or party is not in Poll360's presidential record, 1999 to 2023.");
  }
  const whoName = nameOf(who);
  const years = yearsFor(who);

  /* ── STRENGTH READS EVERY PARTY, NOT ONE RUN ────────────────────────────
     A party with no presidential column of its own (the ADC in 2023) still
     has a vote inside "Other parties" and, for the ADC, a register — so this
     is answered before the check that a subject has runs of its own. */
  if (plan.intent === "strength") {
    const scope = scopeOf(plan.within, territory);
    if (scope.empty) return { ...empty(plan, scope.notes[0]), scope };
    const partyId = who.kind === "party" ? who.id : partyIn(who, 2023)?.id ?? partyIn(who, years[0])?.id ?? "PDP";
    const year = plan.year && STATE_YEARS.includes(plan.year) ? plan.year : STATE_YEARS[0];
    const found = await strengthSections({ partyId, levels: plan.levels, year, scope, sort: plan.sort, against: plan.against });
    return {
      plan,
      who: { kind: "party", id: partyId },
      whoName: `the ${partyId}`,
      whoLong: nameOf({ kind: "party", id: partyId }, { long: true }),
      party: { id: partyId },
      partyId,
      year,
      prev: null,
      threshold: null,
      band: 5,
      scope: { name: scope.name, clamped: scope.clamped, national: scope.national },
      sections: found.sections,
      notes: [...scope.notes, ...found.notes],
      understood: [
        { label: "About", value: nameOf({ kind: "party", id: partyId }, { long: true }) },
        { label: "Ground", value: scope.name },
        {
          label: "Reading",
          value: found.sections.some((section) => section.provenance === "register")
            ? plan.against === "vote"
              ? `The party's register, set against Atiku's ${year} vote`
              : "The party's member register"
            : `The ${year} vote`,
        },
        ...(plan.sort?.dir === "asc" ? [{ label: "Order", value: "Weakest first" }] : []),
      ],
    };
  }

  if (!years.length) {
    return empty(plan, `${nameOf(who, { long: true })} has no presidential run in a year that published results by state.`);
  }

  const scope = scopeOf(plan.within, territory);
  notes.push(...scope.notes);
  if (scope.empty) return { ...empty(plan, scope.notes[0]), scope };

  /* ── WHICH LEVELS CAN BE READ FOR THIS SUBJECT ──────────────────────────
     Below the state, Poll360 holds Atiku's 2019 and 2023 vote and nobody
     else's. A deeper level asked of anybody else is read at the state, and
     the answer says so in the same breath. */
  let year = plan.year && years.includes(plan.year) ? plan.year : null;
  if (plan.year && !years.includes(plan.year)) {
    notes.push(`${nameOf(who, { long: true })} has no state-by-state result for ${plan.year}; the nearest year on record is read instead.`);
  }
  const wantsDeep = plan.levels.some((level) => DEEP.has(level));
  const deepYear = year ?? DEEP_YEARS[0];
  const deepOk = deepFor(who, deepYear);
  let levels = [...plan.levels];
  if (wantsDeep && !deepOk) {
    notes.push(
      `Below the state, Poll360 holds Atiku's presidential vote for 2019 and 2023 and nobody else's. ${
        who.kind === "candidate" && who.name === "Atiku Abubakar" ? `There is no reading below the state for ${plan.year}.` : `${capital(whoName)} is read state by state instead.`
      }`
    );
    levels = [...new Set(levels.map((level) => (DEEP.has(level) ? "state" : level)))];
  }
  if (!scope.national) {
    const before = levels.length;
    levels = levels.filter((level) => level !== "zone");
    if (!levels.length || before !== levels.length) {
      if (!levels.length) levels = ["state"];
    }
  }
  if (!year) year = levels.some((level) => DEEP.has(level)) ? deepYear : years[0];

  const deepNow = levels.some((level) => DEEP.has(level));
  let prev = plan.compareYear ?? null;
  const prevChoices = deepNow ? DEEP_YEARS.filter((entry) => deepFor(who, entry)) : years;
  if (prev && (!prevChoices.includes(prev) || prev === year)) prev = null;
  if (!prev && ["reach", "swing"].includes(plan.intent)) {
    prev = prevChoices.find((entry) => entry < year) ?? null;
  }
  if (plan.intent === "list" && !prev && plan.compareYear) prev = null;

  const threshold = plan.threshold ?? (plan.intent === "reach" ? 25 : null);
  const ctx = {
    year,
    prev,
    threshold,
    band: plan.band ?? 5,
    show: plan.show,
    filters: plan.filters,
    sort: plan.sort,
    factors: plan.factors,
    scope,
    whoName,
    deepWho: deepOk,
    rankBy: plan.filters.some((filter) => filter.field === "registered") || plan.sort?.field === "registered" ? "registered" : "share",
  };

  const sections = [];
  if (plan.intent === "profile") {
    sections.push(...(await profileSections(plan, who, scope, ctx)));
    if (!sections.length) notes.push("That place is not one Poll360 can find inside the ground this account holds.");
  } else if (plan.intent === "scenario") {
    const section = scenarioSection(plan, who, scope, ctx);
    if (section) sections.push(section);
    else notes.push(`A scenario is run on the 2023 result, where ${capital(whoName)} did not stand among the four largest parties.`);
  } else {
    for (const level of levels) {
      /* A tight filter is applied while the rows are read, so a question
         about polling units across the whole country holds only its matches. */
      const early = plan.intent === "list" && plan.filters.length && level === "unit" ? (row) => passes(row, plan.filters, ctx) : () => true;
      const rows = await rowsAt(level, who, scope, early);
      ctx.scanned = rows.scanned ?? rows.length;
      let section = null;
      if (plan.intent === "reach") section = reachSection(level, rows, ctx);
      else if (plan.intent === "target") section = targetSection(level, rows, ctx);
      else if (plan.intent === "swing") section = swingSection(level, rows, ctx);
      else section = listSection(level, rows, ctx);
      if (!section) {
        if (plan.intent === "swing") notes.push(`${capital(whoName)} has only one run to read, so there is no change to measure.`);
        continue;
      }
      if (plan.limit && section.rows.length > plan.limit) {
        section.rows = section.rows.slice(0, plan.limit);
        section.limited = plan.limit;
      }
      section.provenance = provenanceOf(level, scope);
      section.title = titleFor(plan.intent, level, ctx, section);
      sections.push(section);
    }
  }

  /* Inside one state, that state's own counted share — the line every
     local government and ward in it is read against. */
  const oneState = scope.states?.length === 1 ? stateRows(who).find((row) => row.code === scope.states[0]) : null;

  return {
    plan: { ...plan, levels },
    stateContext: oneState ? { name: oneState.name, share: oneState.share, won: oneState.won } : null,
    who,
    whoName,
    whoLong: nameOf(who, { long: true }),
    party: partyIn(who, year),
    year,
    prev,
    threshold,
    band: ctx.band,
    scope: { name: scope.name, clamped: scope.clamped, national: scope.national },
    sections,
    notes,
    understood: understood(plan, { who, year, prev, threshold, levels, scope, band: ctx.band }),
  };
}

function titleFor(intent, level, ctx, section) {
  const many = LEVEL_WORDS[level].title;
  switch (intent) {
    case "reach":
      return `${many} against ${fmtNumber(ctx.threshold)}% for ${ctx.whoName}, ${ctx.year}${ctx.prev ? ` and ${ctx.prev}` : ""}`;
    case "target":
      return `${many} ranked for ${ctx.whoName}'s next votes`;
    case "swing":
      return `${many}: ${ctx.whoName}'s share, ${ctx.prev} to ${ctx.year}`;
    default:
      return `${many}: ${ctx.whoName}, ${ctx.year}${section.total !== section.read ? ` — ${fmtInt(section.total)} that match` : ""}`;
  }
}

function capital(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function empty(plan, why) {
  return {
    plan,
    who: null,
    whoName: "",
    whoLong: "",
    year: null,
    prev: null,
    threshold: null,
    scope: { name: "Nigeria", clamped: false, national: true },
    sections: [],
    notes: [why],
    understood: [],
  };
}

/** The question as Poll360 understood it, in chips a person can check. */
function understood(plan, { who, year, prev, threshold, levels, scope, band }) {
  const chips = [
    { label: "About", value: nameOf(who, { long: true }) },
    { label: "Ground", value: scope.name },
    { label: "Level", value: levels.map((level) => LEVEL_WORDS[level].title).join(", ") },
    { label: "Year", value: prev ? `${year}, set against ${prev}` : String(year) },
  ];
  if (threshold !== null && threshold !== undefined) chips.push({ label: "Line", value: `${fmtNumber(threshold)}% of the vote` });
  if (plan.intent === "reach") chips.push({ label: "Within reach", value: `${fmtNumber(band)} points or less` });
  if (plan.intent === "scenario" && plan.scenario) {
    const moves = Object.entries(plan.scenario.swing ?? {}).map(([id, n]) => `${id} ${n > 0 ? "+" : "−"}${Math.abs(n)}`);
    chips.push({ label: "Scenario", value: moves.join(", ") || "no swing" });
  }
  for (const filter of plan.filters) {
    chips.push({ label: "Only", value: `${filter.field} ${filter.op} ${filter.value}` });
  }
  return chips;
}

export { FACTORS };
