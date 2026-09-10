/**
 * The other half of winning.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  LEADING THE COUNT IS NOT WINNING THE ELECTION
 *
 *  Every results board in the country reports one number: who has the most
 *  votes. For a Nigerian presidential election that number decides half the
 *  question. Section 134 of the constitution asks for two things, not one:
 *
 *    · the highest number of votes cast at the election, AND
 *    · not less than one-quarter of the votes cast in each of at least
 *      two-thirds of the states of the federation and the FCT.
 *
 *  The second is the spread test, and it is invisible on every board there
 *  is, because it is not a total. It is a shape. It asks *where* the votes
 *  are, not how many, and the difference is operational: a campaign can add
 *  four hundred thousand votes in a stronghold and move no closer to winning
 *  at all. The only way to see that is to count states.
 *
 *  This file counts states. It is the arithmetic a room needs to answer "are
 *  we winning" rather than "who is winning", and it is deliberately separate
 *  from anything that draws, so a test can pin it.
 *
 *  ── HOW MANY STATES, AND WHY THE ANSWER IS ARGUED ABOUT ─────────────────
 *  Two-thirds of the 36 states is 24. The clause then says "and the Federal
 *  Capital Territory, Abuja", and what that conjunction does is exactly what
 *  was litigated after the 2023 presidential election: whether the FCT is a
 *  37th unit among which two-thirds must be found, or an additional,
 *  separately-required one. The Supreme Court took the first reading.
 *
 *  This product does not adjudicate that. It computes the count, states the
 *  threshold it is using, and reports the FCT's own figure separately and
 *  always — so a room can see both readings and is never silently handed one
 *  of them as though it were arithmetic. A threshold a reader cannot see is a
 *  threshold they cannot argue with; this is the same principle
 *  lib/alerts.js states about its own lines.
 *
 *  ── AND THIS IS COMPUTED IDENTICALLY FOR EVERY PARTY ────────────────────
 *  The room has a principal (lib/principal.js) and this file does not care.
 *  It runs the same arithmetic over whoever it is asked about. A product that
 *  computed its own side's figures by a different route than its opponents'
 *  would be worthless the first time somebody checked, and it would deserve
 *  to be. Whose figure is shown first is a presentation decision made
 *  somewhere else.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** Two-thirds of the 36 states. See the note above on what is argued about. */
export const STATES_REQUIRED = 24;

/** The share of a state's valid votes that section 134 asks for. */
export const QUARTER = 25;

/** The code this product uses for the Federal Capital Territory. */
export const FCT_CODE = "FC";

const share = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

/**
 * Where one party stands against both halves of section 134.
 *
 * `states` is one row per state, each carrying that state's total valid votes
 * and the votes each party took in it:
 *
 *   { code, name, total, byParty: { ADC: 1200, APC: 900, … }, reported }
 *
 * A state nobody has reported from must arrive with `reported: false`, and it
 * is counted as *not yet* cleared rather than as failed. That distinction is
 * the whole difference between "we have not won this yet" and "we have lost
 * this", and a room told the second when the first is true rings the wrong
 * people.
 */
export function spreadFor({ states = [], partyId = null } = {}) {
  if (!partyId) return null;

  const rows = states.map((state) => {
    const mine = state.byParty?.[partyId] ?? 0;
    const total = state.total ?? 0;
    const pct = share(mine, total);

    /* The leader in this state, by name, so "states won" is a count of places
       rather than a guess from a share. A state with no votes at all has no
       leader — not a tie, and not us. */
    let leader = null;
    let leaderVotes = -1;
    for (const [id, votes] of Object.entries(state.byParty ?? {})) {
      if (votes > leaderVotes) {
        leaderVotes = votes;
        leader = id;
      }
    }
    if (leaderVotes <= 0) leader = null;

    return {
      code: state.code,
      name: state.name,
      reported: state.reported !== false && total > 0,
      votes: mine,
      total,
      share: pct,
      /* Cleared, missed, or not yet known. Three states, never two. */
      quarter: state.reported === false || total === 0 ? null : pct >= QUARTER,
      won: leader === partyId,
      leader,
      /* How far off the quarter this state is, in points. Negative means it is
         over. Used to rank the nearest misses, because "3.1 points short in
         Plateau" is an instruction and "you are short in 19 states" is a
         mood. */
      gap: QUARTER - pct,
    };
  });

  /* The FCT is reported on its own line as well as counted in the rows, for
     the reason in the note at the head of this file: the two readings of the
     clause differ on what it is, and a room should see it either way. */
  const fct = rows.find((row) => row.code === FCT_CODE) ?? null;

  const quarterStates = rows.filter((row) => row.quarter === true).length;
  const statesWon = rows.filter((row) => row.won).length;
  const undecided = rows.filter((row) => row.quarter === null).length;

  const votes = rows.reduce((sum, row) => sum + row.votes, 0);
  const totalVotes = rows.reduce((sum, row) => sum + row.total, 0);

  /* The nearest states we have not cleared, closest first. Only ones that
     have actually reported: a state with nothing in it is not "near", it is
     unknown, and offering it as a target sends somebody to the wrong place. */
  const nearest = rows
    .filter((row) => row.quarter === false)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 5);

  return {
    partyId,
    /* The headline: our share of every valid vote counted so far. This is the
       figure a campaign watches climb, and it is the one that is comparable
       to "the president was elected on 36.6%". */
    share: share(votes, totalVotes),
    votes,
    totalVotes,

    /* Half one of section 134 is decided nationally and is not decidable
       here — this file is handed states, not a national leader board — so it
       is reported as a fact about states and left to the caller to combine.
       See `clearsSpread` below for the half this file can answer. */
    quarterStates,
    statesRequired: STATES_REQUIRED,
    clearsSpread: quarterStates >= STATES_REQUIRED,
    /* How many more states at a quarter are needed. Zero once cleared, never
       negative — "you need -3 states" is not a sentence. */
    statesShort: Math.max(0, STATES_REQUIRED - quarterStates),

    statesWon,
    /* Still to be heard from. A room reading "18 of 24" needs to know whether
       the remaining six are lost or simply not in yet. */
    statesUndecided: undecided,

    fct: fct && { share: fct.share, quarter: fct.quarter, won: fct.won },

    nearest,
    rows,
  };
}

/**
 * The same, for everybody on the ballot, ranked by national share.
 *
 * Used where a room has to show that its own figure was not computed
 * specially — the whole table is the proof.
 */
export function spreadTable({ states = [], ballot = [] } = {}) {
  return ballot
    .map((party) => spreadFor({ states, partyId: party.id ?? party }))
    .filter(Boolean)
    .sort((a, b) => b.votes - a.votes);
}

/**
 * The board's own rows, in the shape `spreadFor` reads.
 *
 * ── WHY AN ADAPTER RATHER THAN A SECOND SHAPE ──────────────────────────────
 * The board carries each state's votes as a positional array over the ballot,
 * because a board plays back thousands of events and an array of nineteen
 * numbers is the cheap thing to add up. This file wants them by name, because
 * a spread test is about one named party and positional indices are exactly
 * the assumption that drew a live map blank — see tests/board-leader.test.js
 * for what that cost.
 *
 * So the translation happens once, here, by name, rather than each caller
 * indexing into the ballot and every one of them being a place to get it
 * wrong. `byState` rows come from `snapshot` in lib/replay.js; `states` is the
 * board's own state list, which is what carries the names.
 */
export function statesFromView({ byState = [], states = [], ballot = [] } = {}) {
  const names = new Map(states.map((state) => [state.code, state.name]));

  return byState.map((row) => {
    const byParty = {};
    /* A state nobody has reported from has no votes array at all — it is not
       an array of zeros, and treating it as one is how "not in yet" becomes
       "polled nothing". */
    if (row.votes) {
      for (let index = 0; index < ballot.length; index += 1) {
        byParty[ballot[index].id] = row.votes[index] ?? 0;
      }
    }

    return {
      code: row.code,
      name: names.get(row.code) ?? row.code,
      total: row.total ?? 0,
      reported: Boolean(row.reported),
      byParty,
    };
  });
}
