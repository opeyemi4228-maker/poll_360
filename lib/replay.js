import nation from "@/public/geo/map/nation.json";
import { states2023, allParties, parties } from "./election2023";

/**
 * The replay: the 2023 presidential election, arriving.
 *
 * ── WHAT IS REAL AND WHAT IS NOT ───────────────────────────────────────────
 * Real: every vote figure, every state's total, every turnout percentage, and
 * therefore the finished map — APC 12 states, PDP 12, LP 12, NNPP 1 — which
 * anyone can check against the record.
 *
 * Not real: the order and timing of arrival, and the polling-unit codes in the
 * ticker. INEC publishes no per-booth arrival log, so the replay distributes
 * each state's declared total across batches. Every batch is a real slice of a
 * real total; the sequence they land in is illustrative, and the board says so
 * on its face.
 *
 * The one hard guarantee: the batches for a state sum *exactly* to that
 * state's declared figures. A replay that drifted from the published result
 * would be a simulation wearing a real election's name, which is the one thing
 * this file must never be.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * ── WHY IT IS SEEDED ───────────────────────────────────────────────────────
 * One constant, one pseudo-random sequence, one identical answer on the server
 * and in the browser. That is what lets the board be server-rendered: the map
 * is in the HTML before a line of JavaScript runs, so it survives a hydration
 * failure, a blocked bundle and a crawler. `Math.random()` here would produce
 * a hydration mismatch on every load.
 * ───────────────────────────────────────────────────────────────────────────
 */

const SEED = 2023;

/** mulberry32 — small, fast, identical everywhere. */
function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Split `total` into `parts` positive integers that sum to exactly `total`.
 *
 * The remainder goes onto the last part rather than being distributed, because
 * the invariant that matters here is the sum, not the smoothness.
 */
function split(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((weight) => Math.floor((total * weight) / sum));
  const allocated = parts.reduce((a, b) => a + b, 0);
  parts[parts.length - 1] += total - allocated;
  return parts;
}

/* The feed is a pure function of one constant, so it is built once per process
   rather than once per request. It mattered less when every page was
   prerendered; now that the layout reads the session and the whole site is
   rendered per request, regenerating ~370 batches on each one would be work
   done to produce a byte-identical answer. */
let cached = null;

export function buildBoard() {
  cached ??= build();
  return cached;
}

function build() {
  const rng = mulberry32(SEED);

  const shapes = new Map(nation.states.map((state) => [state.code, state]));

  const states = states2023.map((state) => {
    const shape = shapes.get(state.code);
    return {
      code: state.code,
      name: state.name,
      d: shape.d,
      at: shape.at,
      booths: state.booths,
      registered: state.registered,
      /* The declared result, kept on the state so the board can show what a
         place finished at as well as where it currently stands. */
      declared: state.votes,
      declaredTotal: state.total,
    };
  });

  /* ---------------------------------------------------------------- feed */

  const events = [];

  for (const [index, state] of states.entries()) {
    const batches = 4 + Math.floor(rng() * 8);
    const weights = Array.from({ length: batches }, () => 0.4 + rng());

    /* Each party's declared total is split independently, then the batch's
       noise comes from the differing weight vectors — which is what makes a
       leader change hands at 20% counted and settle by 60%, exactly as it did
       on the night. The sums stay exact. */
    const perParty = state.declared.map((total) =>
      split(total, Array.from({ length: batches }, () => 0.4 + rng()))
    );
    const perBooths = split(state.booths, weights);
    const perRegistered = split(state.registered, weights);

    const startAt = rng() * 0.45;

    for (let batch = 0; batch < batches; batch += 1) {
      const votes = perParty.map((party) => party[batch]);
      events.push({
        t: startAt + (1 - startAt) * ((batch + 0.5) / batches) * (0.8 + 0.35 * rng()),
        state: index,
        units: perBooths[batch],
        registered: perRegistered[batch],
        votes,
        /* A polling-unit code in INEC's grammar — state/LGA/ward/unit. The
           shape is real so the ticker reads the way the paperwork does; the
           numbers are synthetic, because no arrival log is published. */
        code:
          `${String(index + 1).padStart(2, "0")}/` +
          `${String(1 + Math.floor(rng() * 27)).padStart(2, "0")}/` +
          `${String(1 + Math.floor(rng() * 12)).padStart(2, "0")}/` +
          `${String(1 + Math.floor(rng() * 40)).padStart(3, "0")}`,
      });
    }
  }

  events.sort((a, b) => a.t - b.t);

  /* The board is server-rendered mid-count rather than empty: a first paint
     of a blank grey country would misrepresent the product, and a finished one
     would misrepresent the evening. This is where playback begins and where
     the loop returns to. */
  const totalUnits = events.reduce((sum, event) => sum + event.units, 0);
  let running = 0;
  let opening = 0;
  for (const [index, event] of events.entries()) {
    running += event.units;
    if (running / totalUnits > 0.28) {
      opening = index;
      break;
    }
  }

  return {
    width: nation.width,
    height: nation.height,
    attribution: nation.source,
    states,
    events,
    opening,
    booths: states.reduce((sum, state) => sum + state.booths, 0),
    registered: states.reduce((sum, state) => sum + state.registered, 0),
  };
}

/* --------------------------------------------------------------- snapshot */

/**
 * The state of the count after `cursor` batches have landed.
 *
 * Recomputed from the start on every tick rather than accumulated. It is a few
 * hundred additions, it cannot drift, and it lets the board be scrubbed to any
 * moment — including backwards, which an accumulating counter cannot do
 * without keeping a second copy of the truth.
 */
export function snapshot(board, cursor) {
  const perState = board.states.map(() => ({
    units: 0,
    registered: 0,
    votes: [0, 0, 0, 0, 0],
    total: 0,
  }));

  const national = [0, 0, 0, 0, 0];
  let unitsReported = 0;
  let registered = 0;

  const limit = Math.min(cursor, board.events.length);
  for (let index = 0; index < limit; index += 1) {
    const event = board.events[index];
    const entry = perState[event.state];
    entry.units += event.units;
    entry.registered += event.registered;
    unitsReported += event.units;
    registered += event.registered;
    for (let party = 0; party < 5; party += 1) {
      entry.votes[party] += event.votes[party];
      entry.total += event.votes[party];
      national[party] += event.votes[party];
    }
  }

  const nationalTotal = national.reduce((a, b) => a + b, 0);

  const standings = allParties
    .map((party, index) => ({
      ...party,
      votes: national[index],
      share: nationalTotal ? (national[index] / nationalTotal) * 100 : 0,
    }))
    /* `others` is a bucket, not a contender: counted in every total, and
       pinned to the bottom rather than sorted into a place it did not win. */
    .sort((a, b) => (a.id === "OTH" ? 1 : b.id === "OTH" ? -1 : b.votes - a.votes));

  let complete = 0;

  const byState = board.states.map((state, index) => {
    const entry = perState[index];
    if (!entry.units) {
      return { code: state.code, reported: false, units: 0, total: 0, coverage: 0 };
    }

    const coverage = (entry.units / state.booths) * 100;
    if (coverage >= 99.5) complete += 1;

    const ranked = entry.votes
      .map((votes, party) => ({ party, votes }))
      .sort((a, b) => b.votes - a.votes);

    const leader = ranked[0];
    const runnerUp = ranked[1] ?? { votes: 0 };

    return {
      code: state.code,
      reported: true,
      units: entry.units,
      total: entry.total,
      coverage,
      /* The `others` bucket never colours a state. If it were ever ahead on
         partial returns the state reads as leading-unknown rather than being
         painted in a colour that names nobody. */
      leader: leader.party < 4 ? leader.party : null,
      leaderShare: entry.total ? (leader.votes / entry.total) * 100 : 0,
      marginShare: entry.total ? ((leader.votes - runnerUp.votes) / entry.total) * 100 : 0,
      call: callState({
        coverage,
        marginShare: entry.total ? ((leader.votes - runnerUp.votes) / entry.total) * 100 : 0,
      }),
    };
  });

  return {
    cursor: limit,
    standings,
    total: nationalTotal,
    leader: standings[0] ?? null,
    margin: standings.length > 1 ? standings[0].votes - standings[1].votes : 0,
    unitsReported,
    booths: board.booths,
    coverage: board.booths ? (unitsReported / board.booths) * 100 : 0,
    statesComplete: complete,
    statesTotal: board.states.length,
    registered,
    /* Valid votes as a share of the register that has reported. Named for what
       it is rather than "turnout", which in INEC's tables means accredited
       voters over the register and is a different quantity. */
    turnout: registered ? (nationalTotal / registered) * 100 : 0,
    byState,
    ticker: board.events
      .slice(Math.max(0, limit - 7), limit)
      .map((event) => ({
        code: event.code,
        state: board.states[event.state].name,
        units: event.units,
        votes: event.votes.reduce((a, b) => a + b, 0),
        leader: event.votes.indexOf(Math.max(...event.votes)),
      }))
      .reverse(),
  };
}

/**
 * Whether a place can be called yet.
 *
 * Coverage first, margin second, and deliberately conservative: a thirty-point
 * lead on 4% of booths is not a lead, it is four per cent of booths.
 * Broadcasters need a defensible line between "leading" and "won", and this is
 * the one the product ships with.
 */
export function callState({ coverage, marginShare }) {
  if (coverage < 25) return "early";
  if (marginShare < 5) return "close";
  if (coverage >= 60 && marginShare >= 12) return "decided";
  return "leaning";
}

export const CALL_LABEL = {
  early: "Too early",
  close: "Too close",
  leaning: "Leaning",
  decided: "Decided",
};

export { parties, allParties };
export { others, SILENT } from "./election2023";
