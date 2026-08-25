import { states2023, parties } from "./election2023.js";
import { buildFactors, adjustedTurnout } from "./factors.js";


/**
 * Projection and analysis.
 *
 * ── WHAT THIS IS, AND WHAT IT REFUSES TO PRETEND ───────────────────────────
 * This projects an election forward from the last one under stated
 * assumptions. It is a model, not a forecast off a crystal ball, and every
 * output carries the assumptions that produced it.
 *
 * Several factors that genuinely move Nigerian elections are NOT in this
 * repository: no census, no religious census, no rainfall series, no security
 * incident feed. They are declared in FACTORS below and marked `loaded: false`
 * rather than filled with invented numbers. Fabricating a religious breakdown
 * of thirty-seven states to colour a map would be inventing demographic facts
 * about millions of real people, and a model built on it would be confidently,
 * unfalsifiably wrong. The slots are here so a licensed dataset can be dropped
 * in; until then the panel says plainly which levers are live.
 *
 * ── THE MODEL ──────────────────────────────────────────────────────────────
 * Uniform national swing, the standard baseline in psephology: apply a shift
 * in each party's national share evenly across every state, then renormalise.
 * It is transparent, it is checkable by hand, and its failure mode is
 * well understood (it under-predicts regional realignment). A model somebody
 * can argue with beats a black box they cannot.
 * ───────────────────────────────────────────────────────────────────────────
 */

/* Nigeria's six geopolitical zones. Not a modelling convenience: it is the
   official regional structure, it is how the parties themselves organise, and
   it is the unit that zoning and power-rotation arguments are made in. */
export { ZONES } from "./zones.js";
import { ZONES } from "./zones.js";

const ZONE_OF = {};
for (const [zone, codes] of Object.entries(ZONES)) for (const code of codes) ZONE_OF[code] = zone;

/**
 * Every factor the model can take, and whether we actually hold it.
 *
 * Shown on screen exactly as written. A planner deserves to know which levers
 * are connected to something and which are placeholders waiting on data.
 */
export const FACTORS = [
  {
    key: "past",
    name: "Past results",
    loaded: true,
    weight: "Baseline",
    source: "INEC declared, 2023 presidential",
    note: "Every projection starts from the real result in each state.",
  },
  {
    key: "register",
    name: "Register size",
    loaded: true,
    weight: "High",
    source: "Derived from published turnout",
    note: "How many votes a state can physically produce.",
  },
  {
    key: "turnout",
    name: "Turnout history",
    loaded: true,
    weight: "High",
    source: "INEC declared, per state",
    note: "2023 ranged from 18% to 40% by state. Who turns out decides more than who switches.",
  },
  {
    key: "density",
    name: "Voter density",
    loaded: true,
    weight: "Medium",
    source: "Register divided by polling units",
    note: "Voters per booth. Drives queue length, closing-time risk and agent workload.",
  },
  {
    key: "zone",
    name: "Geopolitical zone",
    loaded: true,
    weight: "High",
    source: "Federal Republic of Nigeria",
    note: "The unit zoning and regional alignment are argued in.",
  },
  {
    key: "commerce",
    name: "Commercial centres",
    loaded: true,
    weight: "Medium",
    source: "20 principal markets, own coordinates",
    note: "Where turnout is densest and a disruption moves the most votes.",
  },
  {
    key: "population",
    generated: true,
    name: "Population and age",
    loaded: true,
    weight: "High",
    source: "Generated for demonstration",
    note: "Synthetic, from the register and latitude. Marked as generated wherever shown.",
  },
  {
    key: "religion",
    generated: true,
    name: "Religious composition",
    loaded: true,
    weight: "High",
    source: "Generated for demonstration",
    note: "Synthetic, a coarse split along the real north to south axis. Not a census, never to be quoted as one.",
  },
  {
    key: "climate",
    generated: true,
    name: "Rainfall on polling day",
    loaded: true,
    weight: "Medium",
    source: "Generated for demonstration",
    note: "Synthetic rainfall and polling-day rain risk, from latitude.",
  },
  {
    key: "security",
    generated: true,
    name: "Insecurity",
    loaded: true,
    weight: "High",
    source: "Generated for demonstration",
    note: "Synthetic baseline by zone, with our own live incident feed on top.",
  },
  {
    key: "economy",
    generated: true,
    name: "Economic conditions",
    loaded: true,
    weight: "Medium",
    source: "Generated for demonstration",
    note: "Synthetic, from urbanisation and latitude.",
  },
];

/* ------------------------------------------------------------------ model */

/**
 * Project every state forward.
 *
 * `swing` is a shift in national share, in points, per party. `turnout` is a
 * multiplier on the register that actually votes. Both are the caller's
 * assumptions and both are printed alongside the answer.
 */
/* Built once. The synthetic profile is deterministic, so there is nothing to
   recompute between requests. */
const FACTOR_ROWS = buildFactors();
const FACTOR_OF = new Map(FACTOR_ROWS.map((row) => [row.code, row]));

export { FACTOR_ROWS };

/**
 * @param swing   shift in national share, in points, per party
 * @param turnout multiplier on the 2023 level
 * @param levers  which synthetic factors are switched on, 0 to 1 each
 */
export function project({ swing = {}, turnout = 1, levers = null, scopeStates = null } = {}) {
  /* ── THE CONTEST IS NOT ALWAYS THE FEDERATION ───────────────────────────
     This used to project all 37 states whatever was being run, so an Ekiti
     governorship was analysed as a presidential election with Ekiti in it.
     Every figure downstream inherited that: the win condition tested a
     spread across 36 states nobody was voting in, the closest-states table
     ranked Kano against Ekiti, and the zone breakdown described six regions
     for a contest held in one.

     A contest scoped to some states is projected over exactly those. Empty
     or absent still means the whole federation, which is what a presidential
     genuinely is — "no scope" and "national" are the same fact here, and the
     project record already treats them that way. */
  const wanted = scopeStates?.length ? new Set(scopeStates) : null;
  const base = wanted ? states2023.filter((state) => wanted.has(state.code)) : states2023;

  const rows = base.map((state) => {
    const shares = parties.map((party, index) => {
      const base = state.total ? (state.votes[index] / state.total) * 100 : 0;
      return Math.max(0, base + (swing[party.id] ?? 0));
    });
    const others = state.total ? (state.votes[4] / state.total) * 100 : 0;

    /* Renormalise: shares must still sum to 100 after an arbitrary shift, or
       the "percentages" stop being percentages. */
    const sum = shares.reduce((a, b) => a + b, 0) + others;
    const normalised = shares.map((value) => (value / sum) * 100);
    const othersShare = (others / sum) * 100;

    /* Turnout is the state's own, moved by whichever synthetic factors are
       switched on, then by the global multiplier. With every lever off this
       reduces exactly to the declared 2023 turnout, so the baseline is always
       recoverable. */
    const factor = FACTOR_OF.get(state.code);
    const modelled = levers && factor ? adjustedTurnout(factor, levers).adjusted : state.turnout;
    const votesCast = Math.round(state.registered * (modelled / 100) * turnout);
    const votes = normalised.map((share) => Math.round((share / 100) * votesCast));

    const ranked = normalised
      .map((share, index) => ({ id: parties[index].id, share, votes: votes[index] }))
      .sort((a, b) => b.share - a.share);

    return {
      code: state.code,
      name: state.name,
      zone: ZONE_OF[state.code] ?? "Unzoned",
      baseTurnout: state.turnout,
      modelledTurnout: modelled,
      factor,
      registered: state.registered,
      booths: state.booths,
      votesCast,
      shares: normalised,
      othersShare,
      votes,
      winner: ranked[0].id,
      runnerUp: ranked[1].id,
      margin: ranked[0].share - ranked[1].share,
      /* The constitutional test, per state, per party. */
      quarter: normalised.map((share) => share >= 25),
    };
  });

  return { rows, swing, turnout, scoped: Boolean(wanted) };
}

/**
 * Nigeria's actual win condition.
 *
 * ── WHY A PLURALITY IS NOT ENOUGH ──────────────────────────────────────────
 * Section 134 requires the winner to have the highest number of votes AND at
 * least one quarter of the votes in at least two-thirds of the states. Every
 * generic forecasting tool models a plurality and stops. In Nigeria that is
 * the wrong answer: a candidate can lead the country and still fail, and the
 * question of whether the FCT counts as a state for this test was litigated
 * all the way to the Supreme Court in 2023.
 *
 * Both readings are reported, because the honest answer is that the threshold
 * is 24 of 36 states plus a contested question about the FCT, and a room
 * planning around it needs to see the margin under each.
 */
export function winCondition(projection) {
  const total = projection.rows.reduce((sum, row) => sum + row.votesCast, 0);

  /* ── THE SPREAD TEST IS A PRESIDENTIAL RULE ─────────────────────────────
     Section 134 applies to the election of a President. A governorship is
     won on the votes in one state, and reporting that a candidate "cleared a
     quarter in 1 of the 36 states needed" for a contest held in one state is
     not a near miss — it is a rule that does not apply, reported as though
     it had been failed. So the test is only computed where it governs, and
     a scoped contest is reported on the plurality that actually decides it. */
  const applies = !projection.scoped;

  return parties.map((party, index) => {
    const votes = projection.rows.reduce((sum, row) => sum + row.votes[index], 0);
    const states = projection.rows.filter((row) => row.winner === party.id).length;

    /* 36 states, FCT held separately: the two-thirds test is 24 of 36. */
    const quarterStates = projection.rows.filter(
      (row) => row.code !== "FCT" && row.quarter[index]
    ).length;
    const quarterFct = projection.rows.find((row) => row.code === "FCT")?.quarter[index] ?? false;

    return {
      id: party.id,
      name: party.name,
      candidate: party.candidate,
      votes,
      share: total ? (votes / total) * 100 : 0,
      states,
      quarterStates,
      quarterFct,
      /* Whether the spread test governs this contest at all. Everything
         reading these three has to know the difference between "passed",
         "failed" and "not a rule here". */
      spreadApplies: applies,
      /* Two readings, both shown. Where the test does not apply, a plurality
         is the whole condition, so both read true for whoever leads. */
      spreadStrict: applies ? quarterStates >= 24 && quarterFct : true,
      spreadPlain: applies ? quarterStates >= 24 : true,
      shortBy: applies ? Math.max(0, 24 - quarterStates) : 0,
    };
  }).sort((a, b) => b.votes - a.votes);
}

/**
 * Where a campaign's next hour is worth most.
 *
 * Three different questions, deliberately separated, because they give
 * different answers and a planner conflating them wastes the week:
 *
 *   flip      how few votes would change who wins this state
 *   yield     how many votes sit behind each polling unit
 *   headroom  how much of the register is not voting at all
 */
export function opportunities(projection, forParty) {
  const index = parties.findIndex((party) => party.id === forParty);

  return projection.rows
    .map((row) => {
      const mine = row.shares[index] ?? 0;
      const leader = Math.max(...row.shares);
      const gap = row.winner === forParty ? 0 : leader - mine;

      /* Votes needed to draw level, given this state's expected turnout. */
      const votesToFlip = Math.ceil((gap / 100) * row.votesCast);
      const nonVoters = Math.max(0, row.registered - row.votesCast);

      return {
        code: row.code,
        name: row.name,
        zone: row.zone,
        held: row.winner === forParty,
        share: mine,
        gap,
        votesToFlip,
        /* Cost per unit of effort: fewer booths for the same votes is cheaper
           to cover with agents. */
        yield: row.booths ? Math.round(row.votesCast / row.booths) : 0,
        booths: row.booths,
        headroom: nonVoters,
        headroomShare: row.registered ? (nonVoters / row.registered) * 100 : 0,
        /* A single ranking: cheap to flip and dense enough to be worth it. */
        priority:
          row.winner === forParty
            ? 0
            : Math.round((row.votesCast / Math.max(votesToFlip, 1)) * (row.booths ? 1 : 0) * 100) /
              100,
      };
    })
    .sort((a, b) => b.priority - a.priority);
}

/** Battlegrounds: close enough that either side can take them. */
export function battlegrounds(projection, threshold = 10) {
  return projection.rows
    .filter((row) => row.margin < threshold)
    .sort((a, b) => a.margin - b.margin);
}

/** The same projection, folded up by zone. */
export function byZone(projection) {
  /* ── A ZONE WITH NOBODY VOTING IN IT IS NOT A ROW ───────────────────────
     Six zones were returned whatever the contest, so a single-state election
     drew five empty ones reading "0 states, 0.0% turnout, no leader". That
     is the same mistake the map made before it learned about scope, and it
     is worse in a table: an empty bar looks like a zone that has not
     reported, which on election night means something entirely different
     from a zone that is not in the election. */
  return Object.keys(ZONES).flatMap((zone) => {
    const rows = projection.rows.filter((row) => row.zone === zone);
    if (!rows.length) return [];
    const votesCast = rows.reduce((sum, row) => sum + row.votesCast, 0);
    const registered = rows.reduce((sum, row) => sum + row.registered, 0);

    const totals = parties.map((_, index) =>
      rows.reduce((sum, row) => sum + row.votes[index], 0)
    );
    const ranked = totals
      .map((votes, index) => ({ id: parties[index].id, votes }))
      .sort((a, b) => b.votes - a.votes);

    return [{
      zone,
      states: rows.length,
      registered,
      votesCast,
      turnout: registered ? (votesCast / registered) * 100 : 0,
      leader: ranked[0]?.id ?? null,
      margin: votesCast ? ((ranked[0].votes - (ranked[1]?.votes ?? 0)) / votesCast) * 100 : 0,
      totals,
    }];
  });
}

/**
 * How sensitive the outcome is to turnout alone.
 *
 * Run the same swing at several turnout levels. If the winner changes across
 * that range, turnout is the story and the room should be spending its effort
 * on mobilisation rather than persuasion.
 */
export function turnoutSensitivity(swing, scopeStates = null) {
  return [0.7, 0.85, 1, 1.15, 1.3].map((level) => {
    const projection = project({ swing, turnout: level, scopeStates });
    const outcome = winCondition(projection)[0];
    return {
      level,
      label: `${Math.round(level * 100)}%`,
      winner: outcome.id,
      share: outcome.share,
      votes: outcome.votes,
      passes: outcome.spreadPlain,
    };
  });
}
