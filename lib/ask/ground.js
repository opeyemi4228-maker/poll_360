import { readFile } from "node:fs/promises";
import path from "node:path";

import { STRONGHOLDS } from "../data/strongholds-index.js";
import { ELECTIONS, MAPPABLE } from "../strongholds.js";
import { decodePlace, tierOf } from "../stronghold-map.js";
import { ZONES } from "../zones.js";

/**
 * Ask Poll360's ground: every place the product holds a figure for, as flat
 * rows a question can be asked of.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SAME FILES THE STRONGHOLDS MAP READS, AND NOTHING ELSE
 *
 *  An answer here and the map on the Strongholds tab must never disagree about
 *  a place, so this reads exactly what that screen reads:
 *
 *    STATES        the declared results, every party, every election that
 *                  published a table by state (lib/strongholds.js, ELECTIONS).
 *    BELOW A STATE the index and the per-state files the stronghold build
 *                  writes — lib/data/strongholds-index.js for local
 *                  governments, districts and constituencies, and
 *                  public/geo/strongholds/ with public/geo/units/ for wards
 *                  and polling units.
 *
 *  Below a state every vote figure is Atiku's, because that is the only vote
 *  the build spreads across real places. Nobody else's vote is held there,
 *  and the engine says so rather than borrowing his.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── READ FROM DISK, ONCE PER STATE ─────────────────────────────────────────
 * Wards and polling units are 14MB across 37 states. They are read the first
 * time a question needs a state and held for the life of the process, so the
 * second question about Kano costs nothing. The files ship with the functions
 * that read them — see `outputFileTracingIncludes` in next.config.mjs.
 */

const STATE_BY_CODE = new Map(STRONGHOLDS.states.map((state) => [state.code, state]));
const STATE_BY_NUMBER = new Map(STRONGHOLDS.states.map((state) => [state.number, state]));

export const STATE_LIST = STRONGHOLDS.states.map((state) => ({
  code: state.code,
  number: state.number,
  name: state.name,
  zone: state.zone,
}));

export const stateByCode = (code) => STATE_BY_CODE.get(code) ?? null;
export const stateByNumber = (number) => STATE_BY_NUMBER.get(number) ?? null;

export const ZONE_NAMES = Object.keys(ZONES);

/** The years a figure below the state exists for, newest first. */
export const DEEP_YEARS = [2023, 2019];

/** Every election that published a table by state, newest first. */
export const STATE_YEARS = MAPPABLE.map((election) => election.year).sort((a, b) => b - a);

/* ══════════════════════════════════════════════════════════════ who */

/**
 * Who a question is about, resolved to a party in each election.
 *
 * A candidate is followed across parties — Atiku stood for the AC in 2007 and
 * the PDP in 2019 and 2023 — and a party is read as itself, whoever it put up.
 * `partyIn(who, year)` is the one place that decision is made.
 */
export function partyIn(who, year) {
  const election = ELECTIONS.find((entry) => entry.year === year);
  if (!election || !who) return null;
  if (who.kind === "party") {
    return election.parties.find((party) => party.id === who.id) ?? null;
  }
  const wanted = String(who.name ?? "").toLowerCase();
  return (
    election.parties.find((party) => String(party.candidate ?? "").toLowerCase() === wanted) ?? null
  );
}

/** Every year this subject has a state table to read, newest first. */
export function yearsFor(who) {
  return STATE_YEARS.filter((year) => partyIn(who, year));
}

/**
 * Whether the figures below a state belong to this subject in this year.
 *
 * They are Atiku's vote in 2019 and 2023, which is the PDP's vote in those two
 * years and nobody else's.
 */
export function deepFor(who, year) {
  if (!DEEP_YEARS.includes(year)) return false;
  const party = partyIn(who, year);
  return Boolean(party && party.id === "PDP");
}

/** The words a subject is printed in: "Atiku", "the APC". */
export function nameOf(who, { long = false } = {}) {
  if (!who) return "";
  if (who.kind === "candidate") {
    const parts = String(who.name).split(" ");
    return long ? who.name : SHORT_NAMES[who.name] ?? parts[parts.length - 1];
  }
  return long ? PARTY_NAMES[who.id] ?? who.id : `the ${who.id}`;
}

const SHORT_NAMES = {
  "Atiku Abubakar": "Atiku",
  "Bola Ahmed Tinubu": "Tinubu",
  "Peter Obi": "Obi",
  "Rabiu Kwankwaso": "Kwankwaso",
  "Muhammadu Buhari": "Buhari",
  "Goodluck Jonathan": "Jonathan",
  "Olusegun Obasanjo": "Obasanjo",
};

const PARTY_NAMES = Object.fromEntries(
  ELECTIONS.flatMap((election) => election.parties.map((party) => [party.id, party.name]))
);

/* ══════════════════════════════════════════════════════════════ states */

/**
 * Every state, for one subject, in every year it can be read.
 *
 * `share[year]` is the subject's share of the valid vote; `lead[year]` is that
 * share minus the best of everybody else — positive where it carried the state.
 * A year the subject did not stand is absent, never zero.
 */
export function stateRows(who) {
  const years = yearsFor(who);
  return STRONGHOLDS.states.map((state) => {
    const share = {};
    const lead = {};
    const won = {};
    const votes = {};
    const cast = {};
    let registered = null;
    let booths = null;

    for (const year of years) {
      const election = ELECTIONS.find((entry) => entry.year === year);
      const row = election.rows.find((entry) => entry.code === state.code);
      const party = partyIn(who, year);
      if (!row || !party) continue;

      const total = row.total ?? Object.values(row.votes).reduce((sum, n) => sum + n, 0);
      const mine = row.votes[party.id] ?? 0;
      const best = Math.max(
        0,
        ...Object.entries(row.votes)
          .filter(([id]) => id !== party.id && id !== "OTH")
          .map(([, n]) => n)
      );
      share[year] = total > 0 ? (mine / total) * 100 : null;
      lead[year] = total > 0 ? ((mine - best) / total) * 100 : null;
      won[year] = total > 0 ? mine > best : null;
      votes[year] = mine;
      cast[year] = total;
      if (year === 2023) {
        registered = row.registered ?? null;
        booths = row.booths ?? null;
      }
    }

    const latest = years[0];
    const place = decodePlace(state.f);
    return {
      level: "state",
      key: state.code,
      code: state.code,
      name: state.name,
      state: state.name,
      stateCode: state.code,
      zone: state.zone,
      registered: registered ?? place.registered,
      booths: booths ?? place.booths,
      cast: cast[latest] ?? null,
      castBy: cast,
      votes,
      share,
      lead,
      won,
      tier: place.tier,
      top: place.top,
      turnout:
        registered && cast[2023] ? (cast[2023] / registered) * 100 : place.turnout ?? null,
      density: place.density,
      counted: true,
    };
  });
}

/* ══════════════════════════════════════════════════════════════ below */

/** A place above a polling unit, from its build tuple. */
function placeRow(level, tuple, where) {
  const place = decodePlace(tuple);
  const share23 = place.share[2023];
  return {
    level,
    ...where,
    registered: place.registered,
    booths: place.booths,
    cast: place.cast,
    votes: {
      2023: share23 === null || place.cast === null ? null : Math.round((share23 / 100) * place.cast),
    },
    share: place.share,
    lead: place.lead,
    won: place.won,
    tier: place.tier,
    top: place.top,
    wonBooths: place.wonBooths,
    tierBooths: place.tierBooths,
    turnout: place.turnout,
    density: place.density,
    counted: false,
  };
}

/** Local governments, districts or constituencies — all in the index. */
export function indexRows(level, states = null) {
  const wanted = states ? new Set(states) : null;
  const out = [];
  for (const state of STRONGHOLDS.states) {
    if (wanted && !wanted.has(state.code)) continue;
    const base = { state: state.name, stateCode: state.code, zone: state.zone };

    if (level === "lga") {
      state.lgas.forEach((lga) => {
        out.push(
          placeRow("lga", lga.f, {
            ...base,
            key: `${state.number}/${lga.n}`,
            code: `${state.number}/${lga.n}`,
            name: lga.name,
            lga: lga.name,
            lgaKey: `${state.number}/${lga.n}`,
          })
        );
      });
    } else {
      const race = level === "district" ? "SENATE" : "REPRESENTATIVES";
      for (const seat of state.seats?.[race] ?? []) {
        out.push(
          placeRow(level, seat.f, {
            ...base,
            key: seat.key,
            code: seat.key,
            name: seat.name,
            lgaKeys: (seat.lgas ?? []).map((at) => `${state.number}/${state.lgas[at]?.n}`),
          })
        );
      }
    }
  }
  return out;
}

const bookCache = new Map();

/** The files for one state, read once. */
async function loadState(state) {
  if (!bookCache.has(state.number)) {
    const root = path.join(process.cwd(), "public", "geo");
    const request = Promise.all([
      readFile(path.join(root, "units", `${state.number}.json`), "utf8"),
      readFile(path.join(root, "strongholds", `${state.number}.json`), "utf8"),
    ])
      .then(([tree, figures]) => ({ tree: JSON.parse(tree), figures: JSON.parse(figures) }))
      .catch((error) => {
        bookCache.delete(state.number);
        throw error;
      });
    bookCache.set(state.number, request);
  }
  return bookCache.get(state.number);
}

/* Unit tuple positions, from lib/stronghold-map.js `encodeUnit`. Read here
   without building the nested objects `decodeUnit` makes, because a national
   question walks 176,000 of them and keeps only the few that match. */
const FLAG_WON_2019 = 1;
const FLAG_WON_2023 = 2;
const FLAG_TOP = 16;
const FLAG_UNKNOWN_2023 = 32;
const tenth = (value) => (value === null || value === undefined ? null : value / 10);

function unitRow(tuple, where) {
  const [registered, cast, s23, l23, s19, l19, flags] = tuple;
  const unknown = Boolean(flags & FLAG_UNKNOWN_2023) || cast === null;
  const won = {
    2019: Boolean(flags & FLAG_WON_2019),
    2023: unknown ? null : Boolean(flags & FLAG_WON_2023),
  };
  const base = (flags >> 2) & 3;
  const share = { 2023: tenth(s23), 2019: tenth(s19) };
  return {
    level: "unit",
    ...where,
    registered,
    booths: 1,
    cast,
    votes: { 2023: share[2023] === null || cast === null ? null : Math.round((share[2023] / 100) * cast) },
    share,
    lead: { 2023: tenth(l23), 2019: tenth(l19) },
    won,
    tier: tierOf({ won, base }),
    top: flags & FLAG_TOP ? 1 : 0,
    turnout: cast !== null && registered > 0 ? (cast / registered) * 100 : null,
    counted: false,
  };
}

/**
 * Walk the wards or polling units of some states, keeping what `keep` accepts.
 *
 * `lgaKeys`, when given, narrows to those local governments ("02/01"). The
 * rows are built only for places that pass, so a question with a tight filter
 * over the whole country holds a handful of objects rather than 176,000.
 */
export async function deepRows(level, { states, lgaKeys = null, keep = () => true } = {}) {
  const wantedLgas = lgaKeys ? new Set(lgaKeys) : null;
  const codes = states?.length ? states : STATE_LIST.map((state) => state.code);
  const out = [];
  let scanned = 0;

  for (const code of codes) {
    const state = STATE_BY_CODE.get(code);
    if (!state) continue;
    const { tree, figures } = await loadState(state);

    tree.lgas.forEach((lga, li) => {
      const lgaKey = `${state.number}/${lga.n}`;
      if (wantedLgas && !wantedLgas.has(lgaKey)) return;
      const wardsFig = figures.lgas[li]?.w ?? [];

      (lga.wards ?? []).forEach((ward, wi) => {
        const figure = wardsFig[wi];
        if (!figure) return;
        const where = {
          state: state.name,
          stateCode: state.code,
          zone: state.zone,
          lga: lga.name,
          lgaKey,
        };

        if (level === "ward") {
          const row = placeRow("ward", figure.f, {
            ...where,
            key: `${state.number}-${lga.n}-${ward.n}`,
            code: `${state.number}-${lga.n}-${ward.n}`,
            name: ward.name,
            ward: ward.name,
          });
          scanned += 1;
          if (keep(row)) out.push(row);
          return;
        }

        const density = figure.f[2] > 0 ? figure.f[0] / figure.f[2] : 0;
        (ward.units ?? []).forEach((unit, ui) => {
          const tuple = figure.u?.[ui];
          if (!tuple) return;
          const code = `${state.number}-${lga.n}-${ward.n}-${unit.n}`;
          const row = unitRow(tuple, {
            ...where,
            ward: ward.name,
            key: code,
            code,
            name: unit.name,
            density,
          });
          scanned += 1;
          if (keep(row)) out.push(row);
        });
      });
    });
  }
  /* How many places were read, whatever the filter kept — "0 of 484 wards",
     never "0 of 0". */
  out.scanned = scanned;
  return out;
}

/** Every local government's name, for recognising one in a question. */
export const LGA_NAMES = STRONGHOLDS.states.flatMap((state) =>
  state.lgas.map((lga) => ({
    name: lga.name,
    key: `${state.number}/${lga.n}`,
    stateCode: state.code,
    stateName: state.name,
  }))
);

/** Whether Anambra's 2023 booths are read from sheets — the one counted exception. */
export const COUNTED_BELOW = new Set(
  STRONGHOLDS.states.filter((state) => state.counted > 0).map((state) => state.code)
);
