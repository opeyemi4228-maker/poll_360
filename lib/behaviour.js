import { HISTORY } from "./history.js";
import { states2023, parties as parties2023, others as others2023 } from "./election2023.js";
import { OFF_CYCLE } from "./offcycle.js";
import { ZONES } from "./zones.js";

/**
 * How Nigerians have actually voted since 1999.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS A SEPARATE LIBRARY AND NOT A CHART COMPONENT
 *
 *  Every figure here is a measurement of real declared results, and several
 *  of them are measurements a room will quote out loud. Turnout has more than
 *  halved since 2003; the register has grown by 61% while the votes cast in
 *  it fell by 43%. Those are strong claims, and a claim that strong belongs
 *  somewhere it can be recomputed and checked rather than inside the thing
 *  that draws it.
 *
 *  Nothing in this file models, projects or estimates. Where a figure cannot
 *  be computed from the record it is absent, and the absence is named — see
 *  `gaps` below, which is the reason this dashboard can be trusted at all.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE THREE MEASURES, AND WHY THESE THREE ────────────────────────────────
 * Turnout answers "are people still voting". Volatility answers "are they
 * voting for the same parties". Alternation answers "do places ever change
 * hands". A room planning an election needs all three and they disagree with
 * each other constantly: the most volatile election of the seven produced the
 * fewest states changing hands, and the calmest produced the most.
 */

/* ── WHAT THE RECORD DOES NOT CONTAIN ──────────────────────────────────────
   Stated once, here, and carried onto the screen by every panel that would
   otherwise be quietly drawing a straight line through a hole.

   Both gaps are the same kind: a national result exists and was published, a
   state-by-state breakdown was not. That makes 2007 and 2011 fully usable for
   turnout and party share and unusable for anything geographic, which is why
   the map skips them and the charts do not. */
export const GAPS = [
  {
    year: 2007,
    has: "national totals, register and turnout",
    missing: "the state-by-state breakdown",
    why: "No by-state table for the 2007 presidential result is published in the source this record is built from.",
  },
  {
    year: 2011,
    has: "national totals for all twenty candidates, register and turnout",
    missing: "the state-by-state breakdown",
    why: "The 2011 article carries a complete national result and nothing beneath it.",
  },
];

/**
 * The seven elections as one series.
 *
 * 2023 lives in lib/election2023.js because that file is the declared record
 * the live board replays, and it is folded in here rather than duplicated, so
 * there is exactly one copy of the 2023 result in this product.
 */
export const ELECTIONS = (() => {
  const older = HISTORY.map((election) => {
    /* Valid votes are the sum of the parties; `cast` is what the commission
       published as total votes, which includes the rejected ballots. Turnout
       is conventionally the second over the register, and using the first
       would understate every election here by two to six points. */
    const valid = election.stateLevel
      ? election.rows.reduce((sum, row) => sum + row.total, 0)
      : Object.values(election.national).reduce((sum, value) => sum + value, 0);

    return {
      year: election.year,
      held: election.held,
      parties: election.parties,
      national: election.national,
      registered: election.electorate,
      cast: election.cast,
      valid,
      rejected: Math.max(0, election.cast - valid),
      turnout: (election.cast / election.electorate) * 100,
      stateLevel: election.stateLevel,
      rows: election.rows,
    };
  });

  /* 2023, in the same shape. Its vote arrays are positional over the four
     named parties and a bucket, so they are turned into the same
     party-keyed form the parsed elections use. */
  const ballot2023 = [...parties2023, others2023];
  const rows2023 = states2023.map((state) => ({
    code: state.code,
    votes: Object.fromEntries(ballot2023.map((party, index) => [party.id, state.votes[index] ?? 0])),
    total: state.total,
  }));

  const national2023 = {};
  for (const row of rows2023) {
    for (const [id, value] of Object.entries(row.votes)) {
      national2023[id] = (national2023[id] ?? 0) + value;
    }
  }

  const registered2023 = states2023.reduce((sum, row) => sum + row.registered, 0);
  const valid2023 = rows2023.reduce((sum, row) => sum + row.total, 0);

  return [
    ...older,
    {
      year: 2023,
      held: "2023-02-25",
      parties: ballot2023.map((party) => ({
        id: party.id,
        name: party.name,
        candidate: party.candidate,
      })),
      national: national2023,
      registered: registered2023,
      /* ── THE ONE ELECTION WITH NO REJECTED-BALLOT FIGURE HERE ──────────
         The 2023 record carries valid votes per state and no rejected column,
         so `cast` is the valid vote rather than valid plus rejected. Turnout
         for 2023 is therefore computed on the same basis the other six use
         for their valid votes, and is a fraction of a point lower than a
         figure that included rejected ballots would be. Said here rather than
         smoothed, because it is the most recent point on every line. */
      cast: valid2023,
      valid: valid2023,
      rejected: null,
      turnout: (valid2023 / registered2023) * 100,
      stateLevel: true,
      rows: rows2023,
    },
  ];
})();

const YEARS = ELECTIONS.map((election) => election.year);

/** One election by year. */
export const electionOf = (year) => ELECTIONS.find((election) => election.year === year) ?? null;

/** Only the ones a map can draw. */
export const MAPPABLE = ELECTIONS.filter((election) => election.stateLevel);

/* -------------------------------------------------------------------------- */

/** Each party's share of the valid vote in one election. */
export function sharesOf(election) {
  const total = Object.values(election.national).reduce((sum, value) => sum + value, 0) || 1;
  return Object.entries(election.national)
    .map(([id, votes]) => ({ id, votes, share: (votes / total) * 100 }))
    .sort((a, b) => b.votes - a.votes);
}

/**
 * The turnout series, and the two lines underneath it that explain it.
 *
 * ── THE SCISSORS ───────────────────────────────────────────────────────────
 * Turnout is a ratio, and a falling ratio has two possible causes that call
 * for opposite responses: fewer people voting, or more people registered. In
 * Nigeria it is emphatically both, and they are pulling apart — which is why
 * the register and the votes are returned as their own series rather than
 * folded into the percentage that hides them.
 */
export function turnoutSeries() {
  return ELECTIONS.map((election) => ({
    year: election.year,
    turnout: election.turnout,
    registered: election.registered,
    cast: election.cast,
    /* Everybody on the register who did not vote. The pool every campaign
       claims it is going to reach, and the largest number on this screen. */
    stayedHome: election.registered - election.cast,
  }));
}

/**
 * How much of the vote moved between parties from one election to the next.
 *
 * ── THE PEDERSEN INDEX, AND ITS ONE HONEST DIFFICULTY HERE ─────────────────
 * Volatility is half the sum of the absolute changes in every party's share,
 * which gives the percentage of the electorate that switched. It assumes a
 * party is the same party in both elections, and Nigeria's party system does
 * not co-operate: the APC was formed in 2013 out of the ACN, the CPC and most
 * of the ANPP, so 2011 to 2015 counts three parties dying and one being born,
 * and scores as near-total upheaval.
 *
 * That is not a flaw to be corrected by mapping predecessors onto successors,
 * because the merger genuinely was the largest realignment of the period. It
 * is a caveat to be printed, so `merged` marks the pairs where a party in one
 * election is a legal ancestor of a party in the next, and the screen says so
 * next to the number rather than quietly explaining a spike away.
 */
export function volatilitySeries() {
  const MERGERS = {
    2015: "The APC was formed in 2013 from the ACN, the CPC and most of the ANPP. Three of 2011's parties do not exist in 2015 and one new one holds their voters, so this is a merger as much as a switch.",
  };

  const out = [];
  for (let index = 1; index < ELECTIONS.length; index += 1) {
    const before = sharesOf(ELECTIONS[index - 1]);
    const after = sharesOf(ELECTIONS[index]);
    const ids = new Set([...before, ...after].map((party) => party.id));

    let sum = 0;
    for (const id of ids) {
      const was = before.find((party) => party.id === id)?.share ?? 0;
      const now = after.find((party) => party.id === id)?.share ?? 0;
      sum += Math.abs(now - was);
    }

    out.push({
      from: ELECTIONS[index - 1].year,
      to: ELECTIONS[index].year,
      volatility: sum / 2,
      merged: MERGERS[ELECTIONS[index].year] ?? null,
    });
  }
  return out;
}

/**
 * How many parties the vote is really split between.
 *
 * Laakso–Taagepera: one over the sum of squared shares. Two evenly matched
 * parties score 2.0; a dominant party with a scattering of others scores
 * closer to 1. It is the number that shows 2023 as the genuine four-way race
 * it was, against six elections that were two-horse.
 */
export function effectiveParties(election) {
  const total = Object.values(election.national).reduce((sum, value) => sum + value, 0) || 1;
  const sumOfSquares = Object.values(election.national).reduce(
    (sum, votes) => sum + (votes / total) ** 2,
    0
  );
  return sumOfSquares ? 1 / sumOfSquares : 0;
}

/** Who carried a state in one election. */
function winnerIn(row) {
  let best = null;
  for (const [id, votes] of Object.entries(row.votes)) {
    /* The bucket is not a candidate and cannot carry a place. */
    if (id === "OTH") continue;
    if (!best || votes > best.votes) best = { id, votes };
  }
  return best;
}

/**
 * Every state's history: who carried it, when it changed hands, and how its
 * turnout moved.
 *
 * Only the five elections with a state-level breakdown appear in a state's
 * run, and `gaps` names the two that cannot. A state that voted one way in
 * 2003 and another in 2015 changed hands at some point between them, and this
 * says exactly that rather than pretending the change happened in 2015.
 */
export function stateHistories() {
  const zoneOf = {};
  for (const [zone, codes] of Object.entries(ZONES)) for (const code of codes) zoneOf[code] = zone;

  return states2023.map((state) => {
    const run = MAPPABLE.map((election) => {
      const row = election.rows.find((item) => item.code === state.code);
      if (!row) return null;
      const winner = winnerIn(row);
      const total = row.total || 1;
      return {
        year: election.year,
        winner: winner?.id ?? null,
        share: winner ? (winner.votes / total) * 100 : 0,
        votes: row.total,
        /* Second place, because the margin is the fact a planner acts on. */
        margin: (() => {
          const ranked = Object.entries(row.votes)
            .filter(([id]) => id !== "OTH")
            .sort((a, b) => b[1] - a[1]);
          return ranked.length > 1 ? ((ranked[0][1] - ranked[1][1]) / total) * 100 : 100;
        })(),
      };
    }).filter(Boolean);

    /* A change of hands between two *consecutive recorded* elections. With
       2007 and 2011 absent, a switch between 2003 and 2015 is real and its
       date is unknown, so the pair is reported rather than a year. */
    const changes = [];
    for (let index = 1; index < run.length; index += 1) {
      if (run[index].winner && run[index].winner !== run[index - 1].winner) {
        changes.push({ from: run[index - 1].year, to: run[index].year, party: run[index].winner });
      }
    }

    return {
      code: state.code,
      name: state.name,
      zone: zoneOf[state.code] ?? null,
      run,
      changes,
      /* Never changed hands across everything recorded. */
      loyal: changes.length === 0 && run.length > 1,
    };
  });
}

/**
 * The zones, over time.
 *
 * Nigeria's politics is regional in a way a national average hides entirely,
 * and the six geopolitical zones are the unit every campaign actually plans
 * in. This is each zone's turnout and its winning party per election, which
 * is where the North-West's collapse and the South-East's 2023 realignment
 * both become visible.
 */
export function zoneSeries() {
  const zoneOf = {};
  for (const [zone, codes] of Object.entries(ZONES)) for (const code of codes) zoneOf[code] = zone;

  return Object.keys(ZONES).map((zone) => ({
    zone,
    run: MAPPABLE.map((election) => {
      const rows = election.rows.filter((row) => zoneOf[row.code] === zone);
      if (!rows.length) return null;

      const votes = {};
      let total = 0;
      for (const row of rows) {
        total += row.total;
        for (const [id, value] of Object.entries(row.votes)) {
          votes[id] = (votes[id] ?? 0) + value;
        }
      }

      const ranked = Object.entries(votes)
        .filter(([id]) => id !== "OTH")
        .sort((a, b) => b[1] - a[1]);

      return {
        year: election.year,
        winner: ranked[0]?.[0] ?? null,
        share: ranked[0] ? (ranked[0][1] / (total || 1)) * 100 : 0,
        votes: total,
        states: rows.length,
      };
    }).filter(Boolean),
  }));
}

/**
 * The governorships held since the 2023 presidential election.
 *
 * ── WHY THEY BELONG ON A BEHAVIOUR SCREEN ──────────────────────────────────
 * They are the only evidence of how people have voted *since* 2023, and they
 * are the reason this dashboard runs to 2026 rather than stopping three years
 * ago. They are also a different kind of contest — one state, its own
 * ballot, its own turnout — so they are kept in their own series and never
 * plotted on the presidential line.
 */
export function recentContests() {
  return OFF_CYCLE.map((row) => {
    const total = Object.values(row.votes).reduce((sum, value) => sum + value, 0);
    const ranked = Object.entries(row.votes)
      .filter(([id]) => id !== "OTH")
      .sort((a, b) => b[1] - a[1]);

    return {
      state: row.state,
      code: row.code,
      on: row.votesOn,
      winner: row.winner,
      candidate: row.candidate,
      votes: total,
      share: ranked[0] ? (ranked[0][1] / (total || 1)) * 100 : 0,
      margin: ranked.length > 1 ? ((ranked[0][1] - ranked[1][1]) / (total || 1)) * 100 : null,
      /* Some rows name only the candidates who mattered, so their total is not
         the state's valid vote and every share from it is approximate. The
         flag travels with the row. See lib/offcycle.js. */
      partialBallot: !("OTH" in row.votes),
      unverified: Boolean(row.unverified),
      source: row.source,
    };
  }).sort((a, b) => a.on.localeCompare(b.on));
}

/**
 * The headline findings, computed rather than written down.
 *
 * A dashboard that states a conclusion has to be able to show its working, so
 * each of these carries the figures it was derived from. If the record
 * changes, the sentence changes with it.
 */
export function findings() {
  const series = turnoutSeries();
  const first = series[0];
  const last = series[series.length - 1];
  const peak = series.reduce((best, row) => (row.turnout > best.turnout ? row : best), series[0]);

  return {
    span: { from: YEARS[0], to: YEARS[YEARS.length - 1] },
    turnoutFall: {
      from: peak,
      to: last,
      points: peak.turnout - last.turnout,
      /* The share of the peak that has been lost, which is the figure that
         makes the scale of it land: not "38 points down" but "well over half
         of the turnout this country had in 2003 is gone". */
      share: ((peak.turnout - last.turnout) / peak.turnout) * 100,
    },
    registerGrowth: {
      from: first,
      to: last,
      share: ((last.registered - first.registered) / first.registered) * 100,
    },
    votesFall: {
      from: peak,
      to: last,
      share: ((peak.cast - last.cast) / peak.cast) * 100,
    },
    stayedHome: last.stayedHome,
    effective: ELECTIONS.map((election) => ({
      year: election.year,
      value: effectiveParties(election),
    })),
  };
}
