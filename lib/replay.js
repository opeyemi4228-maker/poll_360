import nation from "@/public/geo/map/nation.json";
import { states2023, allParties, parties, others } from "./election2023";
import { EXTRA_PARTIES } from "./offcycle";
import { STATES } from "./units";

/**
 * The replay: the 2023 presidential election, arriving.
 *
 * ── WHAT IS REAL AND WHAT IS NOT ───────────────────────────────────────────
 * Real: every vote figure, every state's total, every turnout percentage, and
 * therefore the finished map, APC 12 states, PDP 12, LP 12, NNPP 1, which
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

/** mulberry32, small, fast, identical everywhere. */
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

/**
 * The board for a project.
 *
 * ── THE BUG THIS SIGNATURE EXISTS TO KILL ──────────────────────────────────
 * This used to take no argument. Every project therefore showed the same
 * thing: the 2023 presidential replay. Select the off-cycle governorships and
 * the board still said 176,623 booths, 21 million votes and Bola Tinubu, over
 * a map of six states that had never held a presidential election between
 * them. The figures were real, and they were answers to a question nobody had
 * asked, which is a worse failure than showing nothing.
 *
 * A replay is a demonstration device. It belongs to the worked example and to
 * nothing else, so it is gated on the project actually being one. Every other
 * project gets a board built from what has been filed against it and what has
 * been declared for it, and where that is nothing, the board says nothing
 * rather than borrowing somebody else's night.
 *
 * @param project        the selected election, or null
 * @param declaredRows   its declared figures, from lib/db declared.all()
 */
export function buildBoard(project = null, declaredRows = []) {
  if (!project || project.isDemo) {
    cached ??= build();
    return cached;
  }

  return fromProject(project, declaredRows);
}

/**
 * A board for a real project.
 *
 * ── NO EVENTS, ON PURPOSE ──────────────────────────────────────────────────
 * The replay's event stream is a story about how a night unfolded, invented
 * because INEC publishes no per-booth arrival log. A live project has a real
 * arrival order and it is simply "what has come in so far", so the stream is
 * empty and the board opens fully counted. The scrubber then has nothing to
 * scrub, which is correct: you cannot rewind a night that is still happening.
 */
/**
 * A party that polled votes and that nothing has a name or a colour for.
 *
 * Better than dropping it into "other": a party that won or nearly won a state
 * has to be nameable on the screen where it did so, and a loader adding a new
 * one should not have to touch this file first. It gets the neutral hue, which
 * says "counted, unbranded" rather than borrowing another party's colour and
 * asserting something false.
 */
function unnamedParty(id) {
  return { id, name: id, token: "var(--color-party-other)" };
}

/**
 * A state's INEC number from its three-letter code.
 *
 * Read from lib/units.js rather than tabulated again here, because a second
 * copy of the state ordering is a second chance to get it wrong and the whole
 * point of that table is that it exists once.
 */
const NUMBER_BY_CODE = new Map(STATES.map((state) => [state.code, state.number]));
const numberFor = (code) => NUMBER_BY_CODE.get(code) ?? null;

function fromProject(project, declaredRows) {
  const shapes = new Map(nation.states.map((state) => [state.code, state]));

  /* A governorship names its states; a national contest names none, and then
     the board is the whole federation. */
  const scope = project.scopeStates?.length
    ? new Set(project.scopeStates)
    : new Set(states2023.map((state) => state.code));

  /* ── TWO SPELLINGS OF ONE PLACE, AND THIS BOARD ONLY KNEW ONE ───────────
     A state-level declared row is keyed by the state. What "the state" is
     spelled as depends on which loader wrote it: lib/declared.js — the
     desk's own uploader, and `keyAt`, which is what our returns roll up to —
     writes INEC's two-digit number, "02". scripts/seed-offcycle.mjs writes
     the three-letter code the boundary files are named by, "KOG".

     This map was built on the second and looked up by the second, so a row
     written the canonical way was simply never found: the board drew Adamawa
     grey with a perfectly correct declared total sitting in the table beside
     it. Nothing errored, and the only symptom was a state that looked like it
     had not declared.

     Both are now keys to the same row. Fixing it here rather than in the
     loaders because the rows already written are the ones that have to be
     read, and a board that can only read half its own table is the bug. */
  const byPlace = new Map();
  for (const row of declaredRows) {
    if (row.level !== "STATE") continue;
    const key = row.placeKey ?? row.key;
    if (key) byPlace.set(String(key), row);
  }

  /* ── THE SLOTS THIS BOARD USES ───────────────────────────────────────────
     The presidential four first, so every existing screen keeps the order it
     was built around, then any party that actually appears in this contest's
     declared figures, then the bucket, last and always last — a great deal of
     code downstream relies on "other" being the final slot, including the
     leader test, which skips it.

     Extras are sorted by the votes they polled across the whole set rather
     than by the order rows happen to arrive, so the same contest produces the
     same board on every machine and a slot never moves under a cached
     figure. */
  const tallies = new Map();
  for (const row of byPlace.values()) {
    const stored = typeof row.votes === "string" ? JSON.parse(row.votes) : row.votes;
    for (const [id, value] of Object.entries(stored ?? {})) {
      tallies.set(id, (tallies.get(id) ?? 0) + Number(value ?? 0));
    }
  }

  const fixed = new Set(allParties.map((party) => party.id));
  const extras = [...tallies.entries()]
    .filter(([id]) => !fixed.has(id))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([id]) => EXTRA_PARTIES.find((party) => party.id === id) ?? unnamedParty(id));

  const boardParties = [...parties, ...extras, others];
  const boardIds = new Set(boardParties.map((party) => party.id));

  const states = states2023
    .filter((state) => scope.has(state.code))
    .map((state) => {
      const shape = shapes.get(state.code);
      /* By either spelling: the three-letter code, or INEC's number for it. */
      const found = byPlace.get(state.code) ?? byPlace.get(numberFor(state.code));

      /* ── A POSITIONAL ARRAY, OVER THE PARTIES THAT ACTUALLY RAN ───────
         Votes are stored keyed by party and the board wants them positional.
         The order used to be a fixed presidential four — APC, PDP, LP, NNPP,
         then other — which is an assumption a governorship breaks. Every
         party outside the four was summed into "other", so APGA's 422,664 in
         Anambra and Accord's 511,067 in Osun landed in the bucket, and a map
         that reads the leader off the array called Osun for the APC on
         444,815 votes: a state drawn for the party that LOST it.

         The slots are now built from the contest, so a party that won a state
         has a slot of its own. `boardParties` is computed once above from the
         whole set of rows, never per state, or two states would disagree
         about what index 4 means. */
      const stored = found
        ? typeof found.votes === "string"
          ? JSON.parse(found.votes)
          : found.votes
        : null;

      const votes = boardParties.map((party) => stored?.[party.id] ?? 0);

      /* Anything still unrecognised — a party the loader did not declare —
         goes to the bucket rather than being dropped, so a total is never
         quietly short. With slots built from the data this should be empty,
         and it is kept because "should be" is not "is". */
      if (stored) {
        const spare = Object.entries(stored)
          .filter(([id]) => !boardIds.has(id))
          .reduce((sum, [, value]) => sum + value, 0);
        if (spare > 0) votes[votes.length - 1] += spare;
      }

      const total = votes.reduce((sum, value) => sum + value, 0);

      /* Who actually won, by name. Read off the stored record rather than the
         array, so it stays right even if a slot is ever missed again. */
      const winner = stored
        ? Object.entries(stored)
            .filter(([id]) => id !== others.id)
            .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
        : null;

      return {
        code: state.code,
        name: state.name,
        d: shape.d,
        at: shape.at,
        booths: state.booths,
        registered: found?.registered ?? state.registered,
        declared: votes,
        declaredTotal: total,
        winner,
      };
    });


  /* ── ONE EVENT PER STATE, AND IT IS NOT A REPLAY ──────────────────────
     The board draws itself from an event stream, so a project with an empty
     stream renders zero everywhere: the right answer for a night that has not
     started, and the wrong one for six contests that finished years ago.

     Each declared state therefore lands as a single event carrying its whole
     figure. That is not a replay and does not pretend to be one: there is no
     invented arrival order, no batching, no timing. One place, one arrival,
     the figure that was declared. The board opens with all of them already
     landed, because they had all landed before anybody opened this screen.

     `source` says where the figures came from, so the room can label them as
     the commission's rather than as our own count. Presenting a declaration
     as a parallel count would make the product agree with itself by
     construction, which is the one thing it exists not to do. */
  const withVotes = states.filter((state) => state.declaredTotal > 0);

  const events = withVotes.map((state, index) => ({
    state: states.indexOf(state),
    votes: state.declared,
    /* `units`, not `booths`: the snapshot adds `event.units` into the reported
       count, and a field by any other name lands as NaN and takes every total
       on the board with it. */
    units: state.booths,
    registered: state.registered,
    at: index,
  }));

  return {
    width: nation.width,
    height: nation.height,
    attribution: nation.source,
    states,
    events,
    /* Everything already in, because it is. */
    opening: events.length,
    /* The slots this board's vote arrays are in. Everything that indexes into
       those arrays must read them from here and not from the presidential
       four, or it will name the wrong party the moment a fifth one wins
       something. */
    parties: boardParties,
    source: "DECLARED",
    declaredCount: withVotes.length,
    booths: states.reduce((sum, state) => sum + state.booths, 0),
    registered: states.reduce((sum, state) => sum + state.registered, 0),
  };
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
       noise comes from the differing weight vectors, which is what makes a
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
        /* A polling-unit code in INEC's grammar, state/LGA/ward/unit. The
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
 * moment, including backwards, which an accumulating counter cannot do
 * without keeping a second copy of the truth.
 */
export function snapshot(board, cursor) {
  /* The slots come from the board, not from the presidential four. A
     governorship board carries extra parties, and an accumulator sized to four
     would silently truncate them on the way in — the same class of bug as
     reading the leader off a fixed four, one layer down. A board built before
     this existed has no list and falls back to the presidential set, which is
     exactly what it used to be. */
  const slots = board.parties ?? allParties;
  const width = slots.length;

  const perState = board.states.map(() => ({
    units: 0,
    registered: 0,
    votes: new Array(width).fill(0),
    total: 0,
  }));

  const national = new Array(width).fill(0);
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
    /* Was `party < 5`, which is the number of presidential parties and not a
       property of the data. A board carrying a sixth would have silently
       dropped it. */
    for (let party = 0; party < event.votes.length; party += 1) {
      entry.votes[party] += event.votes[party];
      entry.total += event.votes[party];
      national[party] += event.votes[party];
    }
  }

  const nationalTotal = national.reduce((a, b) => a + b, 0);

  const standings = slots
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
      /* ── THE FIGURES THEMSELVES, NOT ONLY THE TOTAL ────────────────────
         The replay never needed these: the board it plays back already holds
         each state's declared result, and the map scales that by coverage. A
         live board has no declared result to scale — the only figures that
         exist are the ones that were filed — so the snapshot now hands back
         what it has already added up rather than throwing it away and making
         the caller add it up again. Costs nothing here and is the difference
         between a live map showing what arrived and a live map showing a
         fraction of the last election. */
      votes: [...entry.votes],
      /* The slice of this state's register that has reported, added up from the
         returns themselves rather than estimated from coverage. The replay has
         always tracked it; only the live board needs it handed back. */
      registered: entry.registered,
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
