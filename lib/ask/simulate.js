import { ELECTIONS } from "../strongholds.js";

/**
 * Simulating an election from the record: the same contest run ten thousand
 * times, each time moved the way the vote has actually moved before.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS IS, SAID BEFORE ANY FIGURE IT MAKES
 *
 *  Nothing on record says how the next campaign will go. What the record does
 *  say is how far the vote has moved between one election and the next, in
 *  every state, since 1999 — and that is a measured thing.
 *
 *  So each run starts from the last result on the ground asked about and
 *  moves every party by:
 *
 *    A NATIONAL MOVE   how far a party's share of the country moved between
 *                      two elections in a row — drawn from the moves on
 *                      record, in either direction.
 *    A STATE'S OWN     how much further a state moved than the country did
 *                      in the same election — drawn from the 185 on record.
 *
 *  The shares are made to add up again and the run is decided by the rule of
 *  the contest. A party that comes first in 6,400 of 10,000 runs is said to
 *  come first in 64% of them. That is a statement about the last result and
 *  the size of past swings. It is not a poll, it knows nothing of candidates,
 *  money, defections or a party that does not exist yet — and every answer
 *  that prints it says so beside it.
 *
 *  ── WHY EITHER DIRECTION ────────────────────────────────────────────────
 *  The PDP fell in three elections running. Drawing its moves as recorded
 *  would predict a fourth fall, which is a forecast of a trend the record
 *  cannot promise. Size is what history measures; direction is the campaign.
 *
 *  ── THE SAME QUESTION, THE SAME ANSWER ──────────────────────────────────
 *  The draws come from a generator seeded by the ground and the scenario, so
 *  asking twice — or downloading the answer an hour later — gives the same
 *  figures to the last digit.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const RUNS = 10_000;

/* Elections one cycle apart with a table by state. 2003 to 2015 is three
   cycles — 2007 and 2011 published no table — so it is not a single move. */
const PAIRS = [
  [1999, 2003],
  [2015, 2019],
  [2019, 2023],
];

const election = (year) => ELECTIONS.find((entry) => entry.year === year);
const totalOf = (row) => row.total ?? Object.values(row.votes).reduce((sum, n) => sum + n, 0);

/** How far the vote moved, as recorded: a party's national moves, and each state's move beyond it. */
function movesOnRecord() {
  const national = [];
  const state = [];
  let widest = 0;
  for (const [from, to] of PAIRS) {
    const a = election(from);
    const b = election(to);
    if (!a?.stateLevel || !b?.stateLevel) continue;
    const both = a.parties.filter((party) => party.id !== "OTH" && b.parties.some((other) => other.id === party.id)).map((party) => party.id);
    for (const id of both) {
      const shareIn = (entry) => {
        const votes = entry.rows.reduce((sum, row) => sum + (row.votes[id] ?? 0), 0);
        const all = entry.rows.reduce((sum, row) => sum + totalOf(row), 0);
        return all ? (votes / all) * 100 : null;
      };
      const move = shareIn(b) - shareIn(a);
      national.push({ id, from, to, move });
      for (const rowB of b.rows) {
        const rowA = a.rows.find((row) => row.code === rowB.code);
        if (!rowA || !totalOf(rowA) || !totalOf(rowB)) continue;
        const own = ((rowB.votes[id] ?? 0) / totalOf(rowB)) * 100 - ((rowA.votes[id] ?? 0) / totalOf(rowA)) * 100;
        state.push(own - move);
        widest = Math.max(widest, Math.abs(own));
      }
    }
  }
  return { national, state, widest };
}

export const MOVES = movesOnRecord();

/** What the simulation draws from, for the method line under an answer. */
export const BASIS = {
  runs: RUNS,
  national: MOVES.national.length,
  state: MOVES.state.length,
  pairs: PAIRS.map(([from, to]) => `${from}–${to}`),
  largestNational: Math.max(...MOVES.national.map((entry) => Math.abs(entry.move))),
  /* The furthest one party's share of one state moved between two elections. */
  largestState: MOVES.widest,
};

/* ══════════════════════════════════════════════════════════════ chance */

function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function generator(seed) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null);

/**
 * Run a contest.
 *
 * @param {object} args
 * @param {{ code: string, places: { key: string, cast: number, shares: Record<string, number> }[] }[]} args.states
 *        The ground, state by state. A state's `places` are what its own move
 *        is applied to alike: the state itself, or the local governments of
 *        it that are in the contest.
 * @param {string[]} args.ids       The parties that move. "Other parties" is carried and never moved.
 * @param {"plurality" | "president" | "governor"} args.rule
 * @param {Record<string, number>} [args.shift]  Points added to a party before every run — a scenario.
 * @param {string} args.seed
 * @param {number[]} [args.moves] The moves to draw from instead of the
 *        presidential record's — a seat's own contest brings its own, and has
 *        no national move apart from them.
 */
export function simulate({ states, ids, rule = "plurality", shift = {}, seed = "", runs = RUNS, moves = null }) {
  const next = generator(seedOf(`${seed}|${rule}|${JSON.stringify(shift)}`));
  const pickNational = moves ? () => 0 : () => MOVES.national[Math.floor(next() * MOVES.national.length)].move * (next() < 0.5 ? -1 : 1);
  const pool = moves ?? MOVES.state;
  const pickState = () => pool[Math.floor(next() * pool.length)] * (next() < 0.5 ? -1 : 1);

  const first = Object.fromEntries(ids.map((id) => [id, 0]));
  const declared = Object.fromEntries(ids.map((id) => [id, 0]));
  const shares = Object.fromEntries(ids.map((id) => [id, []]));
  const spread = Object.fromEntries(ids.map((id) => [id, []]));
  let undecided = 0;

  const placeCount = states.reduce((sum, state) => sum + state.places.length, 0);
  /* The spread a winner needs beside the most votes, where the contest has one. */
  const quota =
    rule === "president"
      ? 24
      : rule === "governor"
        ? Math.ceil((2 * placeCount) / 3)
        : 0;

  for (let run = 0; run < runs; run += 1) {
    const national = {};
    for (const id of ids) national[id] = pickNational() + (shift[id] ?? 0);

    const votes = Object.fromEntries(ids.map((id) => [id, 0]));
    const quarters = Object.fromEntries(ids.map((id) => [id, 0]));
    let all = 0;

    for (const state of states) {
      const own = {};
      for (const id of ids) own[id] = pickState();
      for (const place of state.places) {
        let sum = 0;
        const moved = {};
        for (const id of ids) {
          moved[id] = Math.max(0, (place.shares[id] ?? 0) + national[id] + own[id]);
          sum += moved[id];
        }
        const others = Math.max(0, 100 - ids.reduce((total, id) => total + (place.shares[id] ?? 0), 0));
        sum += others;
        if (!sum) continue;
        for (const id of ids) {
          const share = moved[id] / sum;
          votes[id] += share * place.cast;
          /* The FCT is not a state, and is counted apart from the 24. */
          if (quota && share >= 0.25 && !(rule === "president" && state.code === "FCT")) quarters[id] += 1;
        }
        all += place.cast;
      }
    }

    let leader = ids[0];
    for (const id of ids) if (votes[id] > votes[leader]) leader = id;
    first[leader] += 1;
    if (!quota || quarters[leader] >= quota) declared[leader] += 1;
    else undecided += 1;
    for (const id of ids) {
      shares[id].push(all ? (votes[id] / all) * 100 : 0);
      if (quota) spread[id].push(quarters[id]);
    }
  }

  const parties = ids
    .map((id) => {
      const sorted = shares[id].sort((a, b) => a - b);
      const reach = quota ? spread[id].sort((a, b) => a - b) : null;
      return {
        id,
        /* Came first on votes, and — where the contest asks for a spread too —
           came first with the spread, which is what being declared takes. */
        first: (first[id] / runs) * 100,
        win: (declared[id] / runs) * 100,
        median: quantile(sorted, 0.5),
        /* The middle half of the runs. A wider band would be mostly the two
           or three elections in which a state turned right over. */
        low: quantile(sorted, 0.25),
        high: quantile(sorted, 0.75),
        spread: reach ? quantile(reach, 0.5) : null,
      };
    })
    .sort((a, b) => b.win - a.win || b.first - a.first);

  return {
    runs,
    rule,
    quota: quota || null,
    places: placeCount,
    parties,
    /* Somebody led without the spread: a second ballot, under either section. */
    undecided: quota ? (undecided / runs) * 100 : 0,
    favourite: parties[0],
    /* How sure the record is, in the words an answer uses. */
    call: callOf(parties[0]?.win ?? 0),
  };
}

/** A likelihood in words. The bands are wide on purpose: this is not a poll. */
export function callOf(win) {
  if (win >= 85) return "strongly favoured";
  if (win >= 65) return "favoured";
  if (win >= 50) return "narrowly favoured";
  if (win >= 35) return "in a contest too close to call";
  return "open";
}
