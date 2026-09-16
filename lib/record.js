import { ELECTIONS, MAPPABLE, electionOf, sharesOf } from "./behaviour.js";
import { OFF_CYCLE, NOT_LOADED, coverage as offCycleCoverage } from "./offcycle.js";
import { states2023 } from "./election2023.js";
import { ZONES } from "./zones.js";

/**
 * The whole record: 1999 to the last election held.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE TWO SERIES ARE JOINED HERE AND NOT ON A SCREEN
 *
 *  This product holds two different kinds of election and, until now, kept
 *  them on two different screens. Seven presidential elections, 1999 to 2023,
 *  with a table per state for five of them. And the off-cycle governorships,
 *  Kogi in November 2023 through to Osun in August 2026, as declared state
 *  totals.
 *
 *  A reader does not have two histories. They have one, and the question they
 *  ask of it — "what has this state done since 1999" — spans both. Answering
 *  it from two screens means holding a presidential swing in your head while
 *  you go and look up a governorship, which is how somebody ends up comparing
 *  a 2023 presidential share against a 2026 governorship share and calling the
 *  difference a swing. It is not a swing. It is two different elections.
 *
 *  So they are joined once, here, and every row carries `kind` — and every
 *  function below refuses to compare across it.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT THIS RECORD DOES NOT HOLD, STATED PLAINLY ─────────────────────────
 *  · No figures below a state, for any election, ever. Not for the
 *    presidentials — no by-local-government table is published in the source
 *    this was parsed from — and not for the governorships, whose totals are
 *    the declared state figure and nothing else. Every screen that reads this
 *    must say so rather than drawing an empty ward.
 *  · No state rows for 2007 or 2011. Both are here with their national
 *    figures and `stateLevel: false`, because leaving two elections out would
 *    draw a different country's history. Anything per-state skips them, and
 *    says it skipped them.
 *  · The governorships cover the states that held one off-cycle. That is
 *    seven or eight states, not thirty-seven, and a map of them is a map with
 *    most of the country legitimately blank.
 */

/* ------------------------------------------------------------------- shape */

/** What kind of contest a row is. The one thing no comparison may cross. */
export const KINDS = {
  PRESIDENTIAL: {
    id: "PRESIDENTIAL",
    label: "Presidential",
    why: "One national contest. Every state votes on the same day for the same office.",
  },
  GOVERNORSHIP: {
    id: "GOVERNORSHIP",
    label: "Governorship",
    why: "One state at a time, on its own cycle, for its own office.",
  },
};

const zoneOf = (() => {
  const index = {};
  for (const [zone, codes] of Object.entries(ZONES)) for (const code of codes) index[code] = zone;
  return index;
})();

const share = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

/** Everyone but the bucket, biggest first. "Other" is not a candidate. */
function ranked(votes) {
  return Object.entries(votes ?? {})
    .filter(([id]) => id !== "OTH")
    .map(([id, count]) => ({ id, votes: count }))
    .sort((a, b) => b.votes - a.votes);
}

/**
 * Every election in the record, oldest first.
 *
 * One row per contest, presidential and governorship alike, in the one shape
 * a timeline can draw. `states` is how many places the row actually carries
 * figures for — 37 for a mappable presidential, 0 for 2007 and 2011, and 1
 * for a governorship — because a caption that says "37 states" over a row
 * holding one is the sort of thing nobody notices until it is quoted.
 */
export const TIMELINE = [
  ...ELECTIONS.map((election) => ({
    id: `PRES-${election.year}`,
    kind: "PRESIDENTIAL",
    year: election.year,
    held: election.held,
    label: `${election.year} presidential`,
    winner: ranked(election.national)[0]?.id ?? null,
    votes: election.national,
    cast: election.cast,
    registered: election.registered,
    turnout: election.turnout,
    states: election.rows?.length ?? 0,
    stateLevel: election.stateLevel,
    code: null,
    place: "Nigeria",
  })),
  ...OFF_CYCLE.map((row) => {
    const cast = Object.values(row.votes).reduce((sum, value) => sum + value, 0);
    return {
      id: `GOV-${row.code}-${row.votesOn.slice(0, 4)}`,
      kind: "GOVERNORSHIP",
      year: Number(row.votesOn.slice(0, 4)),
      held: row.votesOn,
      label: `${row.state} ${row.votesOn.slice(0, 4)}`,
      winner: row.winner,
      candidate: row.candidate,
      votes: row.votes,
      cast,
      /* The declared totals carry no register, so turnout is genuinely not
         known for these rather than zero. A governorship row on a turnout
         chart is therefore absent, not a point at the bottom of the axis. */
      registered: null,
      turnout: null,
      states: 1,
      stateLevel: true,
      code: row.code,
      place: row.state,
      source: row.source,
    };
  }),
].sort((a, b) => String(a.held).localeCompare(String(b.held)));

/**
 * The last governorship held in each state we have figures for, shaped like a
 * presidential election so the strategic brief can compare against it.
 *
 * ── THE SAME KIND OF CONTEST, OR NOTHING ──────────────────────────────────
 * A governorship count is compared with the last governorship in that state,
 * never with a presidential year. States with no figures on record are simply
 * absent, so they show no swing rather than a swing against zero. A total
 * nobody has checked is left out rather than compared against.
 *
 * `extra` takes rows transcribed state by state — lib/adamawa.js's, today —
 * as `{ code, state, votes, votesOn }`, so this module keeps reading only the
 * national tables and the caller decides which state files to add.
 */
export function lastGovernorships({ extra = [] } = {}) {
  const byCode = new Map();
  const take = (row) => {
    const total = Object.values(row.votes ?? {}).reduce((sum, value) => sum + value, 0);
    if (!row.code || !total || Object.keys(row.votes).length < 2) return;
    const was = byCode.get(row.code);
    if (was && String(was.held) >= String(row.votesOn)) return;
    byCode.set(row.code, { code: row.code, votes: row.votes, total, held: row.votesOn, place: row.state });
  };

  for (const row of OFF_CYCLE) if (!row.unverified) take(row);
  for (const row of extra) take(row);

  const rows = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  return { id: "GOVERNORSHIP", label: "last governorship", stateLevel: true, rows };
}

/** What the record covers, for a caption that has to be exactly true. */
export function span(now = new Date()) {
  const first = TIMELINE[0];
  const last = TIMELINE[TIMELINE.length - 1];
  const off = offCycleCoverage(now);

  return {
    from: first.year,
    to: last.year,
    firstLabel: first.label,
    lastLabel: last.label,
    lastHeld: last.held,
    elections: TIMELINE.length,
    presidential: TIMELINE.filter((row) => row.kind === "PRESIDENTIAL").length,
    governorship: TIMELINE.filter((row) => row.kind === "GOVERNORSHIP").length,
    /* Named rather than counted: a set with a known gap and a set that is
       quietly wrong look identical from a total. */
    missingStateTables: TIMELINE.filter(
      (row) => row.kind === "PRESIDENTIAL" && !row.stateLevel
    ).map((row) => row.year),
    notLoaded: NOT_LOADED,
    offCycleTo: off.to,
  };
}

/* -------------------------------------------------------------- comparison */

/**
 * Two elections, state by state, with the change between them.
 *
 * ── THE ONE COMPARISON THIS FILE REFUSES TO MAKE ───────────────────────────
 * Both elections must be the same kind. A 2023 presidential share against a
 * 2026 Osun governorship share is a real subtraction between two real numbers
 * and it means nothing at all: different office, different ballot, different
 * electorate turning out for different reasons. Accord did not "gain 50
 * points in Osun"; Accord was not on the presidential ballot.
 *
 * Refused rather than warned about, because a warning above a table is read
 * by nobody and the table is screenshotted without it.
 *
 * @param a       the earlier election's year
 * @param b       the later one
 * @param party   whose share to compare. Null compares the winner's share,
 *                which answers "how safe is this place" rather than "how are
 *                we doing".
 */
export function compare(a, b, party = null) {
  const from = electionOf(a);
  const to = electionOf(b);

  if (!from || !to) return { ok: false, why: "One of those elections is not in the record." };
  if (!from.stateLevel || !to.stateLevel) {
    const which = !from.stateLevel ? a : b;
    return {
      ok: false,
      why: `No by-state table is published for ${which}, so there is nothing to compare state by state. Its national figures are on the timeline.`,
    };
  }

  const rows = states2023
    .map((state) => {
      const before = from.rows.find((row) => row.code === state.code);
      const after = to.rows.find((row) => row.code === state.code);
      if (!before || !after) return null;

      const pick = (row) => {
        if (party) return { id: party, votes: row.votes[party] ?? 0 };
        return ranked(row.votes)[0] ?? { id: null, votes: 0 };
      };

      const was = pick(before);
      const now = pick(after);
      const wasShare = share(was.votes, before.total);
      const nowShare = share(now.votes, after.total);

      return {
        code: state.code,
        name: state.name,
        zone: zoneOf[state.code] ?? null,
        was: { party: was.id, votes: was.votes, share: wasShare, cast: before.total },
        now: { party: now.id, votes: now.votes, share: nowShare, cast: after.total },
        change: nowShare - wasShare,
        /* Held or changed hands. Only meaningful when comparing winners; with
           a party fixed, both sides are that party by construction. */
        flipped: party ? null : was.id !== now.id,
      };
    })
    .filter(Boolean);

  return {
    ok: true,
    from: { year: a, label: `${a} presidential` },
    to: { year: b, label: `${b} presidential` },
    party,
    rows,
    /* Summed, never averaged: an average of 37 percentages weights Bayelsa
       like Kano and is not the national change. */
    national: (() => {
      const wasVotes = rows.reduce((sum, row) => sum + row.was.votes, 0);
      const wasCast = rows.reduce((sum, row) => sum + row.was.cast, 0);
      const nowVotes = rows.reduce((sum, row) => sum + row.now.votes, 0);
      const nowCast = rows.reduce((sum, row) => sum + row.now.cast, 0);
      const wasShare = share(wasVotes, wasCast);
      const nowShare = share(nowVotes, nowCast);
      return { was: wasShare, now: nowShare, change: nowShare - wasShare };
    })(),
  };
}

/* ------------------------------------------------------------------ trends */

/**
 * What each state has been doing, over the whole presidential record.
 *
 * ── THE FIVE ANSWERS, AND WHY "SWING" IS NOT "CHANGED ONCE" ────────────────
 * A state that changed hands in 2015 and has not moved since is not a swing
 * state; it is a state that realigned eleven years ago and has been safe ever
 * since. Treating the two alike sends a campaign to defend somewhere that
 * needs no defending and ignore somewhere that does.
 *
 * So a swing state is one that has changed hands more than once, or that is
 * currently held by less than the competitive margin. The rest are graded by
 * where the trend is going, not by where it has been.
 */
export const TRENDS = {
  STRONGHOLD: { id: "STRONGHOLD", label: "Settled", why: "Held by the same party, comfortably, throughout." },
  GROWING: { id: "GROWING", label: "Growing", why: "The winner's margin has widened across the record." },
  DECLINING: { id: "DECLINING", label: "Declining", why: "The winner's margin has narrowed across the record." },
  SWING: { id: "SWING", label: "Swing", why: "Changed hands more than once, or held on a knife edge now." },
  EMERGING: { id: "EMERGING", label: "Newly taken", why: "Changed hands at the most recent election." },
};

/** How close a state has to be, now, to count as a swing whatever its past. */
export const COMPETITIVE = 10;

export function stateTrends() {
  const mappable = MAPPABLE;
  const latest = mappable[mappable.length - 1];

  return states2023
    .map((state) => {
      const run = mappable
        .map((election) => {
          const row = election.rows.find((item) => item.code === state.code);
          if (!row) return null;
          const order = ranked(row.votes);
          const first = order[0];
          const second = order[1];
          return {
            year: election.year,
            winner: first?.id ?? null,
            share: share(first?.votes ?? 0, row.total),
            margin: share((first?.votes ?? 0) - (second?.votes ?? 0), row.total),
            cast: row.total,
          };
        })
        .filter(Boolean);

      if (run.length < 2) return null;

      const now = run[run.length - 1];
      const before = run[run.length - 2];

      /* Every time the holder changed, across the whole run. */
      let changes = 0;
      for (let index = 1; index < run.length; index += 1) {
        if (run[index].winner !== run[index - 1].winner) changes += 1;
      }

      const trend =
        changes > 1 || now.margin < COMPETITIVE
          ? "SWING"
          : now.winner !== before.winner
            ? "EMERGING"
            : changes === 0 && run.every((step) => step.margin >= COMPETITIVE)
              ? "STRONGHOLD"
              : now.margin > before.margin
                ? "GROWING"
                : "DECLINING";

      return {
        code: state.code,
        name: state.name,
        zone: zoneOf[state.code] ?? null,
        run,
        changes,
        holder: now.winner,
        margin: now.margin,
        /* Where the margin has gone since the previous election. The figure a
           planner acts on: a widening lead is somewhere to stop spending. */
        drift: now.margin - before.margin,
        trend,
        since: latest.year,
      };
    })
    .filter(Boolean);
}

/* ----------------------------------------------------------------- turnout */

/**
 * Turnout, over the record.
 *
 * Governorships are absent rather than zero: the declared totals this product
 * holds for them carry no register, so their turnout is not known. A point at
 * the bottom of the axis would read as an election nobody voted in.
 */
export function turnoutRecord() {
  const points = TIMELINE.filter((row) => row.turnout !== null).map((row) => ({
    id: row.id,
    year: row.year,
    label: row.label,
    kind: row.kind,
    turnout: row.turnout,
    registered: row.registered,
    cast: row.cast,
    stayedHome: row.registered - row.cast,
  }));

  const peak = points.reduce((best, row) => (row.turnout > best.turnout ? row : best), points[0]);
  const last = points[points.length - 1];

  return {
    points,
    peak,
    last,
    fall: { points: peak.turnout - last.turnout, share: share(peak.turnout - last.turnout, peak.turnout) },
    /* Named, because a chart that silently drops two of seven elections is a
       chart that is lying by omission. */
    withoutTurnout: TIMELINE.filter((row) => row.turnout === null).map((row) => row.label),
  };
}

/**
 * Turnout by state at the most recent presidential election, with the gap
 * against what that state did the time before.
 *
 * The gap is the useful half. A state at 24% is not a story on its own —
 * national turnout was 27% — but a state at 24% that was at 40% last time is
 * fifteen thousand people who stopped voting, and that is a story and a
 * target.
 */
export function turnoutByState() {
  const mappable = MAPPABLE;
  const now = mappable[mappable.length - 1];
  const before = mappable[mappable.length - 2];

  return states2023
    .map((state) => {
      const nowRow = now.rows.find((row) => row.code === state.code);
      const beforeRow = before?.rows.find((row) => row.code === state.code);
      if (!nowRow) return null;

      /* Against the register we hold, which is the current one. The earlier
         election's register is not published per state in this source, so the
         earlier turnout is computed on the same denominator and the
         comparison is of votes cast rather than of two true turnouts. Said
         here because a screen must say it. */
      const turnout = share(nowRow.total, state.registered);
      const was = beforeRow ? share(beforeRow.total, state.registered) : null;

      return {
        code: state.code,
        name: state.name,
        zone: zoneOf[state.code] ?? null,
        registered: state.registered,
        cast: nowRow.total,
        turnout,
        was,
        change: was === null ? null : turnout - was,
        stayedHome: Math.max(0, state.registered - nowRow.total),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.stayedHome - a.stayedHome);
}

/* ------------------------------------------------------------- candidates */

/**
 * Every party's run across the presidential record, and what it holds now.
 *
 * Off-cycle governorships are counted separately and never added in: a party
 * with one governorship and no presidential vote — Accord, since August 2026
 * — must not appear as a party with a national share, and a party's
 * presidential share must not be inflated by a state contest.
 */
export function partyRecord() {
  const byParty = new Map();

  for (const election of ELECTIONS) {
    for (const party of sharesOf(election)) {
      if (party.id === "OTH") continue;
      const held = byParty.get(party.id) ?? { id: party.id, name: party.name, run: [], governorships: [] };
      held.run.push({ year: election.year, share: party.share, votes: party.votes });
      byParty.set(party.id, held);
    }
  }

  for (const row of OFF_CYCLE) {
    const cast = Object.values(row.votes).reduce((sum, value) => sum + value, 0);
    const held = byParty.get(row.winner) ?? { id: row.winner, name: row.winner, run: [], governorships: [] };
    held.governorships.push({
      state: row.state,
      code: row.code,
      year: Number(row.votesOn.slice(0, 4)),
      candidate: row.candidate,
      votes: row.votes[row.winner],
      share: share(row.votes[row.winner], cast),
    });
    byParty.set(row.winner, held);
  }

  return [...byParty.values()]
    .map((party) => {
      const last = party.run[party.run.length - 1] ?? null;
      const first = party.run[0] ?? null;
      return {
        ...party,
        /* Null, not zero, for a party that has never stood a presidential
           candidate. Accord's national share is not nought per cent; it is
           not a number that exists. */
        latest: last?.share ?? null,
        peak: party.run.length ? Math.max(...party.run.map((step) => step.share)) : null,
        drift: last && first && party.run.length > 1 ? last.share - first.share : null,
        elections: party.run.length,
      };
    })
    .sort((a, b) => (b.latest ?? -1) - (a.latest ?? -1));
}
