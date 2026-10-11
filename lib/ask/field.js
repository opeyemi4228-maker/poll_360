import { readFile } from "node:fs/promises";
import path from "node:path";

import { PARTY_GROUND } from "../data/party-ground.js";
import { STRONGHOLDS } from "../data/strongholds-index.js";
import { ELECTIONS } from "../strongholds.js";
import { decodePlace } from "../stronghold-map.js";
import { deepRows } from "./ground.js";

/**
 * The whole field: every party's vote on any ground, in every election read.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY ASK POLL360 NEEDED THIS
 *
 *  lib/ask/ground.js reads a place as one subject sees it: a share, a lead,
 *  carried or not. That answers "where is he strong". It cannot answer "who
 *  wins Kano Central", "how does the APC take this constituency" or "what
 *  does anybody need here", because those are questions about everybody on
 *  the ballot at once — and below a state, ground.js holds one party.
 *
 *  This holds them all:
 *
 *    A STATE, A ZONE, THE COUNTRY   INEC's declared result, added up. Counted.
 *    A DISTRICT, A CONSTITUENCY,    the local governments inside it, each one
 *    A LOCAL GOVERNMENT             the declared state total spread across
 *                                   its real polling units. Estimated.
 *    A WARD                         the same, one level down, for the last
 *                                   two elections.
 *
 *  It is the presidential vote throughout, because that is the only vote
 *  published party by party for every state in every election. Every answer
 *  built on this says so wherever the contest asked about is another one.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** The elections read, oldest first. */
export const FIELD_YEARS = [...PARTY_GROUND.years].sort((a, b) => a - b);
export const LATEST = FIELD_YEARS[FIELD_YEARS.length - 1];
export const BEFORE = FIELD_YEARS[FIELD_YEARS.length - 2];

const ELECTION = new Map(ELECTIONS.map((election) => [election.year, election]));
const YEAR_AT = new Map(PARTY_GROUND.years.map((year, index) => [year, index]));
const STATE_BY_CODE = new Map(STRONGHOLDS.states.map((state) => [state.code, state]));

/** A party in one election: its id, its name and whoever stood for it. */
export function partyOf(year, id) {
  return ELECTION.get(year)?.parties.find((party) => party.id === id) ?? null;
}

/** A party as a row is headed: "APC — Bola Ahmed Tinubu". */
export function partyLine(year, id) {
  if (id === "OTH") return "Other parties";
  const party = partyOf(year, id);
  return party?.candidate ? `${id} — ${party.candidate}` : id;
}

/* ══════════════════════════════════════════════════════════════ reading */

const tallyInto = (into, ids, votes) => {
  if (!votes) return;
  ids.forEach((id, index) => {
    into[id] = (into[id] ?? 0) + (votes[index] ?? 0);
  });
};

/** One election on one tally, ranked. "Other parties" is counted and never ranked first. */
function reading(year, tally) {
  const total = Object.values(tally).reduce((sum, n) => sum + n, 0);
  if (!total) return null;
  const parties = Object.entries(tally)
    .map(([id, votes]) => ({
      id,
      name: partyOf(year, id)?.name ?? id,
      candidate: partyOf(year, id)?.candidate ?? null,
      votes,
      share: (votes / total) * 100,
    }))
    .sort((a, b) => (a.id === "OTH") - (b.id === "OTH") || b.votes - a.votes);
  const [leader, second] = parties;
  return {
    year,
    total,
    parties,
    leader,
    second: second && second.id !== "OTH" ? second : null,
    margin: second ? leader.share - second.share : leader.share,
  };
}

/** The local governments of a ground, as the index holds them. */
function lgasOf(ground) {
  const out = [];
  for (const state of STRONGHOLDS.states) {
    if (ground.states && !ground.states.includes(state.code)) continue;
    state.lgas.forEach((lga, at) => {
      const key = `${state.number}/${lga.n}`;
      if (ground.lgas && !ground.lgas.includes(key)) return;
      out.push({ state, lga, at, key });
    });
  }
  return out;
}

/**
 * Every party on a ground, election by election.
 *
 * `ground` is `{ states: codes | null, lgas: keys | null }` — the same pair
 * the engine's scope carries. With no local governments named it is whole
 * states and reads the declared results; with them, it is those local
 * governments added up.
 *
 * @returns {{ counted: boolean, registered, cast, booths, turnout, lgas: number, by: Record<number, object> }}
 */
export function fieldOf(ground) {
  const whole = !ground.lgas;
  const by = {};
  let registered = 0;
  let cast = 0;
  let booths = 0;

  if (whole) {
    for (const year of FIELD_YEARS) {
      const tally = {};
      for (const row of ELECTION.get(year).rows) {
        if (ground.states && !ground.states.includes(row.code)) continue;
        for (const [id, n] of Object.entries(row.votes)) tally[id] = (tally[id] ?? 0) + n;
      }
      by[year] = reading(year, tally);
    }
    for (const state of STRONGHOLDS.states) {
      if (ground.states && !ground.states.includes(state.code)) continue;
      const place = decodePlace(state.f);
      const row = ELECTION.get(LATEST).rows.find((entry) => entry.code === state.code);
      registered += row?.registered ?? place.registered ?? 0;
      booths += row?.booths ?? place.booths ?? 0;
    }
    cast = by[LATEST]?.total ?? 0;
  } else {
    const members = lgasOf(ground);
    for (const year of FIELD_YEARS) {
      const tally = {};
      for (const { state, at } of members) {
        tallyInto(tally, PARTY_GROUND.slots[year], PARTY_GROUND.states[state.number]?.[at]?.[YEAR_AT.get(year)]);
      }
      by[year] = reading(year, tally);
    }
    for (const { lga } of members) {
      const place = decodePlace(lga.f);
      registered += place.registered ?? 0;
      booths += place.booths ?? 0;
    }
    cast = by[LATEST]?.total ?? 0;
  }

  return {
    counted: whole,
    registered,
    cast,
    booths,
    turnout: registered ? (cast / registered) * 100 : null,
    lgas: lgasOf(ground).length,
    by,
  };
}

/** A place's row: who led it, by how much, and each party's share of it. */
function placeRow(base, { registered, booths, cast, latest, before }) {
  const shares = {};
  const votes = {};
  for (const party of latest?.parties ?? []) {
    shares[party.id] = party.share;
    votes[party.id] = party.votes;
  }
  const sharesBefore = {};
  for (const party of before?.parties ?? []) sharesBefore[party.id] = party.share;
  const total = latest?.total ?? cast ?? null;
  return {
    ...base,
    registered,
    booths,
    cast: total,
    turnout: registered && total !== null ? (total / registered) * 100 : null,
    /* Registered and did not vote: the largest number on most ground. */
    stayed: registered && total !== null ? Math.max(0, registered - total) : null,
    leader: latest?.leader?.id ?? null,
    leader_share: latest?.leader?.share ?? null,
    leader_votes: latest?.leader?.votes ?? null,
    second: latest?.second?.id ?? null,
    margin: latest?.margin ?? null,
    shares,
    votes,
    sharesBefore,
    leaderBefore: before?.leader?.id ?? null,
  };
}

/** Every state of a ground, the whole field in each. Counted. */
export function stateField(ground) {
  return STRONGHOLDS.states
    .filter((state) => !ground.states || ground.states.includes(state.code))
    .map((state) => {
      const one = fieldOf({ states: [state.code], lgas: null });
      return placeRow(
        { level: "state", key: state.code, code: state.code, name: state.name, state: state.name, stateCode: state.code, zone: state.zone },
        { registered: one.registered, booths: one.booths, cast: one.cast, latest: one.by[LATEST], before: one.by[BEFORE] }
      );
    });
}

/** Every local government of a ground, the whole field in each. Estimated. */
export function lgaField(ground) {
  return lgasOf(ground).map(({ state, lga, at, key }) => {
    const held = PARTY_GROUND.states[state.number]?.[at] ?? [];
    const read = (year) => {
      const tally = {};
      tallyInto(tally, PARTY_GROUND.slots[year], held[YEAR_AT.get(year)]);
      return reading(year, tally);
    };
    const place = decodePlace(lga.f);
    return placeRow(
      { level: "lga", key, code: key, name: lga.name, lga: lga.name, lgaKey: key, state: state.name, stateCode: state.code, zone: state.zone },
      { registered: place.registered, booths: place.booths, cast: place.cast, latest: read(LATEST), before: read(BEFORE) }
    );
  });
}

const wardBooks = new Map();

/** One state's wards, every party. Read once and held, like the map's own files. */
function loadWards(state) {
  if (!wardBooks.has(state.number)) {
    const request = readFile(path.join(process.cwd(), "public", "geo", "parties", `${state.number}.json`), "utf8")
      .then((text) => {
        const book = JSON.parse(text);
        const byKey = new Map();
        for (const lga of book.lgas) for (const ward of lga.w) byKey.set(`${state.number}-${lga.n}-${ward.n}`, ward.v);
        return { years: book.years, byKey };
      })
      .catch((error) => {
        wardBooks.delete(state.number);
        throw error;
      });
    wardBooks.set(state.number, request);
  }
  return wardBooks.get(state.number);
}

/**
 * Every ward of a ground, the whole field in each. Estimated.
 *
 * Names, registers and turnout come from the files the map reads, so a ward
 * here is the ward there; this adds the parties.
 */
export async function wardField(ground) {
  const codes = ground.states ?? STRONGHOLDS.states.map((state) => state.code);
  const places = await deepRows("ward", { states: codes, lgaKeys: ground.lgas });
  const books = new Map();
  for (const code of new Set(places.map((row) => row.stateCode))) {
    books.set(code, await loadWards(STATE_BY_CODE.get(code)));
  }
  return places.map((row) => {
    const book = books.get(row.stateCode);
    const held = book?.byKey.get(row.key) ?? [];
    const read = (year) => {
      const at = book?.years.indexOf(year) ?? -1;
      if (at < 0) return null;
      const tally = {};
      tallyInto(tally, PARTY_GROUND.slots[year], held[at]);
      return reading(year, tally);
    };
    return placeRow(
      { level: "ward", key: row.key, code: row.code, name: row.name, ward: row.name, lga: row.lga, lgaKey: row.lgaKey, state: row.state, stateCode: row.stateCode, zone: row.zone },
      { registered: row.registered, booths: row.booths, cast: row.cast, latest: read(LATEST), before: read(BEFORE) }
    );
  });
}
