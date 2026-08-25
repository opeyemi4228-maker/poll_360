/* Relative rather than "@/public/...", which lib/replay.js uses. The alias is
   resolved by the bundler and by nothing else, so a module that carries it can
   only ever be loaded by the application — and this one is also loaded by the
   scripts in scripts/ and by anything checking a board outside a request. */
import nation from "../public/geo/map/nation.json" with { type: "json" };

import { results } from "./db.js";
import { states2023 } from "./election2023.js";
import { ballotFor } from "./races.js";
import { groupUnits, parseUnitCode } from "./units.js";
import { nameUnits } from "./lga-names.js";

/**
 * The board, built from returns that actually arrived.
 *
 * ── THE SAME SHAPE AS THE REPLAY, AND NOTHING LIKE IT ──────────────────────
 * lib/replay.js builds a board out of the 2023 declared results and plays them
 * back on a timer: real figures, an illustrative arrival order, a finished
 * election. This builds the identical structure out of rows in the results
 * table, so the map, the standings, the coverage dial and the ticker draw a
 * live count without knowing which of the two they were handed.
 *
 * Everything below the surface is different in one way that matters: there is
 * nothing to play back. A return exists or it does not. So every event is one
 * booth, the cursor opens at the end, and the board says `live` so the screens
 * that would otherwise scale a declared total by coverage know not to.
 *
 * ── WHAT AN EMPTY PROJECT LOOKS LIKE, AND WHY IT LOOKS LIKE THAT ───────────
 * A project with nothing filed against it produces a board with no events, and
 * every state comes back `reported: false`, which the map already draws as
 * grey. Not a pale colour, not a zero: an absence. That is the correct picture
 * of an hour before polls close, and it is the picture this returns until
 * somebody files the first return.
 *
 * ── AND WHY COVERAGE IS AGAINST THE 2023 BOOTH COUNT ───────────────────────
 * "62% counted" needs a denominator, and the only real one available is how
 * many polling units each state had at the last general election. It is the
 * right order of magnitude and it is not this election's register, so
 * everything that quotes it says what it is measured against rather than
 * implying a precision nobody has.
 * ───────────────────────────────────────────────────────────────────────────
 */

/* The shapes, once. A pure function of a file that does not change. */
const SHAPES = new Map(nation.states.map((state) => [state.code, state]));

/**
 * Where a return happened, from the code printed on its own sheet.
 *
 * Never from `results.state_code`: that column has been written by three
 * different callers over time, some with INEC's number and some with this
 * product's letters, and a board that trusted it would silently lose whichever
 * half disagreed. The unit code is the one fact every return carries in the
 * same shape.
 */
function stateOf(row) {
  return parseUnitCode(row.unitCode)?.stateCode ?? null;
}

export async function liveBoard({ electionId, race }) {
  const rows = electionId ? await results.counted(electionId, race) : [];
  const ballot = ballotFor(race);

  /* States in a fixed order, because an event names its state by index into
     this array and the two must not be able to drift apart. Every state is
     here whether or not it has reported — the ones that have not are what the
     map draws grey, and leaving them out would draw a country with holes in
     it rather than a country waiting. */
  const states = states2023.map((state) => {
    const shape = SHAPES.get(state.code);
    return {
      code: state.code,
      name: state.name,
      d: shape?.d,
      at: shape?.at,
      booths: state.booths,
      registered: state.registered,
      /* No declared figure exists for a contest that is still being counted.
         Zeros rather than last election's totals: a board that fell back to
         2023 would show a finished result underneath a live one. */
      declared: ballot.map(() => 0),
      declaredTotal: 0,
    };
  });

  const indexOf = new Map(states.map((state, index) => [state.code, index]));

  /* One event per return, in the order they were filed. `t` exists for the
     replay's benefit and is spent here only on keeping the sequence stable. */
  const events = [];
  for (const row of rows) {
    const code = stateOf(row);
    const index = indexOf.get(code);
    /* A return whose unit code names no state we know is counted in no state.
       It stays in the table, and it is not quietly attributed to somewhere
       plausible — see the bug this same assumption caused on the broadcast
       desk, where twenty-two states were shifted by one. */
    if (index === undefined) continue;

    events.push({
      t: events.length,
      state: index,
      units: 1,
      registered: row.registered ?? 0,
      votes: ballot.map((party) => Number(row.votes?.[party.id] ?? 0)),
      code: row.unitCode,
      at: row.submittedAt ?? null,
    });
  }

  return {
    width: nation.width,
    height: nation.height,
    attribution: nation.source,
    states,
    events,
    /* No playback. Everything that has been filed is on the board the moment
       the page renders, which is what "live" means. */
    opening: events.length,
    booths: states.reduce((sum, state) => sum + state.booths, 0),
    registered: states.reduce((sum, state) => sum + state.registered, 0),
    /* The flag the room branches on. A replay board does not carry it, so the
       replay keeps its existing behaviour untouched. */
    live: true,
    filed: events.length,
  };
}

/**
 * The same returns, folded into the places they came from.
 *
 * ── WHY THE DRILL-DOWN CANNOT BE APPORTIONED HERE ──────────────────────────
 * lib/drill.js splits a state's declared total across its local governments on
 * a stable seed, and says plainly on every screen that it is doing so. That is
 * a defensible way to show the shape of a finished election nobody published a
 * breakdown of. It would be an indefensible way to show a live count: the
 * figures underneath a state would be invented while looking exactly like
 * returns, and somebody would ring a ward coordinator about a number this
 * product made up.
 *
 * So a live drill-down shows what was filed and nothing else. A local
 * government with no returns in it is absent rather than estimated, which is
 * the honest answer to "what is happening in Ikeja" when nothing has come in
 * from Ikeja.
 */
export async function liveTree({ electionId, race }) {
  const rows = electionId ? await results.counted(electionId, race) : [];
  const ballot = ballotFor(race);

  return groupUnits(
    nameUnits(
      rows.map((row) => ({
        code: row.unitCode,
        name: null,
        reported: true,
        registered: row.registered ?? 0,
        accredited: row.accredited ?? 0,
        votes: ballot.map((party) => Number(row.votes?.[party.id] ?? 0)),
        at: row.submittedAt ?? null,
      }))
    )
  );
}
