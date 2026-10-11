import { SEAT_HISTORY } from "../data/seat-history.js";

/**
 * The seats' own elections: every senate election in a senatorial district
 * and every governorship election in a state, as lib/data/seat-history.js
 * holds them, and what those elections say about seats in general.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A SEAT IS PLANNED FROM ITS OWN ELECTIONS
 *
 *  A senate plan is read from senate elections and a governorship plan from
 *  governorship elections. The presidential vote is never borrowed for
 *  either: it is a different ballot, with different candidates, and in most
 *  states it is decided on a different day.
 *
 *  ── WHAT IS HELD, SAID PER ELECTION ─────────────────────────────────────
 *  Who won is on record for nearly every seat in every election since 1999.
 *  The votes are on record where the result was published with figures —
 *  most governorships, most senate seats in 2019, few in 2023. An election
 *  with a winner and no figures is a real fact and is printed as one.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ── ONE PARTY UNDER SEVERAL NAMES ─────────────────────────────────────────
   The APC was formed in 2013 by the ACN, the CPC and the ANPP; the ANPP had
   been the APP, and the ACN the AC and before it the AD. A seat the ACN won
   in 2011 and the APC in 2015 did not change hands. Counted as one line for
   that purpose only — every election is still printed under the name it was
   fought under. */
const LINE = { APP: "APC", ANPP: "APC", AD: "APC", AC: "APC", ACN: "APC", CPC: "APC" };
export const lineOf = (party) => LINE[party] ?? party;

const KIND = { SENATE: "senate", GOVERNORSHIP: "governor" };

/** Whether Poll360 holds a seat's own elections for this contest at all. */
export const holdsRecord = (contest) => Boolean(KIND[contest]);

function electionsOf(record) {
  return Object.entries(record ?? {})
    .map(([year, election]) => {
      const counted = election.votes?.filter((entry) => entry.party !== "OTH") ?? null;
      const total = election.total ?? null;
      const first = counted?.[0] ?? null;
      const second = counted?.[1] ?? null;
      const winnerVotes = counted?.find((entry) => entry.party === election.winner.party)?.votes ?? null;
      return {
        year: Number(year),
        on: election.on ?? null,
        winner: election.winner,
        overturned: Boolean(election.overturned),
        votes: election.votes,
        total,
        winnerVotes,
        winnerShare: winnerVotes !== null && total ? (winnerVotes / total) * 100 : null,
        /* The runner-up is whoever was nearest the party that holds the seat. */
        second: counted ? (first?.party === election.winner.party ? second : first) ?? null : null,
        margin: first && second && total ? ((first.votes - second.votes) / total) * 100 : null,
        marginVotes: first && second ? first.votes - second.votes : null,
      };
    })
    .sort((a, b) => a.year - b.year);
}

/**
 * A seat's elections, oldest first, or null where none are held.
 *
 * @param {"SENATE" | "GOVERNORSHIP"} contest
 * @param {string} key  A district key ("19/kano-central") or a state code ("KAN").
 */
export function recordOf(contest, key) {
  const kind = KIND[contest];
  const record = kind ? SEAT_HISTORY[kind][key] : null;
  if (!record) return null;
  const elections = electionsOf(record);
  if (!elections.length) return null;
  const latest = elections[elections.length - 1];
  const counted = [...elections].reverse().find((election) => election.votes) ?? null;

  /* How many elections running the party that holds the seat has won it. */
  let streak = 0;
  for (let i = elections.length - 1; i >= 0; i -= 1) {
    if (lineOf(elections[i].winner.party) !== lineOf(latest.winner.party)) break;
    streak += 1;
  }
  let changed = 0;
  for (let i = 1; i < elections.length; i += 1) {
    if (lineOf(elections[i].winner.party) !== lineOf(elections[i - 1].winner.party)) changed += 1;
  }
  const wonBy = {};
  for (const election of elections) wonBy[lineOf(election.winner.party)] = (wonBy[lineOf(election.winner.party)] ?? 0) + 1;

  return { contest, key, elections, latest, counted, streak, changed, wonBy };
}

/* ══════════════════════════════════════════════════════════════ in general */

const everySeat = (contest) => Object.keys(SEAT_HISTORY[KIND[contest]] ?? {}).map((key) => recordOf(contest, key)).filter(Boolean);

const memo = new Map();
const once = (name, make) => {
  if (!memo.has(name)) memo.set(name, make());
  return memo.get(name);
};

/**
 * How often a seat stays with the party that holds it, counted over every
 * pair of elections in a row, in every seat of this kind — and split by how
 * long the party had already held it, because a seat won once and a seat
 * held for twenty years are not the same bet.
 *
 * @returns {{ all: { n, held }, by: Record<"1" | "2" | "3", { n, held }> }}
 */
export function holdRates(contest) {
  return once(`hold:${contest}`, () => {
    const all = { n: 0, held: 0 };
    const by = { 1: { n: 0, held: 0 }, 2: { n: 0, held: 0 }, 3: { n: 0, held: 0 } };
    for (const seat of everySeat(contest)) {
      let run = 1;
      for (let i = 1; i < seat.elections.length; i += 1) {
        const kept = lineOf(seat.elections[i].winner.party) === lineOf(seat.elections[i - 1].winner.party);
        const bucket = by[Math.min(3, run)];
        bucket.n += 1;
        all.n += 1;
        if (kept) {
          bucket.held += 1;
          all.held += 1;
          run += 1;
        } else run = 1;
      }
    }
    return { all, by };
  });
}

/** The hold rate for a seat held this many elections running. */
export function holdRateFor(contest, streak) {
  const bucket = holdRates(contest).by[Math.min(3, Math.max(1, streak))];
  return { n: bucket.n, held: bucket.held, rate: bucket.n ? (bucket.held / bucket.n) * 100 : null, streak: Math.min(3, Math.max(1, streak)) };
}

/**
 * How far a party's share of a seat moved between two counted elections in a
 * row, over every seat of this kind — what a simulation of the next one draws
 * from. Only parties that stood both times, by their own line.
 */
export function movesOnRecord(contest) {
  return once(`moves:${contest}`, () => {
    const moves = [];
    for (const seat of everySeat(contest)) {
      const counted = seat.elections.filter((election) => election.votes && election.total);
      for (let i = 1; i < counted.length; i += 1) {
        /* Elections in a row only: a gap of more than six years is two moves. */
        if (counted[i].year - counted[i - 1].year > 6) continue;
        const share = (election) => {
          const out = {};
          for (const entry of election.votes) if (entry.party !== "OTH") out[lineOf(entry.party)] = (out[lineOf(entry.party)] ?? 0) + (entry.votes / election.total) * 100;
          return out;
        };
        const a = share(counted[i - 1]);
        const b = share(counted[i]);
        for (const party of Object.keys(a)) if (party in b) moves.push(b[party] - a[party]);
      }
    }
    return moves;
  });
}

/** How much of the record is held, for the method line and the coverage note. */
export function coverage(contest) {
  return once(`cover:${contest}`, () => {
    const seats = everySeat(contest);
    const elections = seats.flatMap((seat) => seat.elections);
    return {
      seats: seats.length,
      elections: elections.length,
      counted: elections.filter((election) => election.votes).length,
      from: Math.min(...elections.map((election) => election.year)),
      to: Math.max(...elections.map((election) => election.year)),
    };
  });
}
