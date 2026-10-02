import { STATE_LIST, nameOf, stateByCode } from "./ground.js";
import { ELECTIONS } from "../strongholds.js";
import { DECLARED } from "../election2023.js";
import { FCT, ruling } from "../governors.js";
import { fmtInt } from "./format.js";
import { OFF_CYCLE } from "../offcycle.js";

/**
 * The questions about contests themselves rather than about one candidate:
 * how every state voted, who governs each state, what a coalition would have
 * added up to, and what the Constitution asks of a winner.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SAME RULE AS THE REST OF THE ENGINE
 *
 *  Every figure here comes from the declared record — lib/strongholds.js for
 *  the presidential elections, lib/governors.js and lib/offcycle.js for the
 *  governorships. A coalition is arithmetic on declared votes and says so: it
 *  is what the partners' votes add up to, never a claim that voters would
 *  follow their candidates into it.
 * ══════════════════════════════════════════════════════════════════════════
 */

const MAPPED_YEARS = ELECTIONS.filter((election) => election.stateLevel).map((election) => election.year);

export function electionFor(year) {
  return ELECTIONS.find((entry) => entry.year === year) ?? ELECTIONS[ELECTIONS.length - 1];
}

/** A state's parties, largest first, with the bundle of small parties left out. */
function ranked(row) {
  return Object.entries(row.votes)
    .filter(([id]) => id !== "OTH")
    .sort((a, b) => b[1] - a[1]);
}

const totalOf = (row) => row.total || Object.values(row.votes).reduce((sum, n) => sum + n, 0);

/* ══════════════════════════════════════════════════════ every state's result */

/**
 * One election, state by state: who carried each, by how much, and every main
 * party's share beside it. The table a results desk prints.
 */
export function resultsByState(year, scope = null) {
  const election = electionFor(year);
  if (!election.stateLevel) return null;
  /* The parties with a column: the four largest nationally that year. */
  const national = election.year === 2023 ? { APC: DECLARED.apc, PDP: DECLARED.pdp, LP: DECLARED.lp, NNPP: DECLARED.nnpp } : election.national ?? {};
  const main = election.parties
    .filter((party) => party.id !== "OTH")
    .sort((a, b) => (national[b.id] ?? 0) - (national[a.id] ?? 0))
    .slice(0, 4);

  const rows = election.rows
    .filter((row) => !scope?.states?.length || scope.states.includes(row.code))
    .map((row) => {
      const state = stateByCode(row.code);
      const order = ranked(row);
      const total = totalOf(row);
      const [first, second] = order;
      const shareOf = (id) => (total ? ((row.votes[id] ?? 0) / total) * 100 : null);
      const out = {
        key: row.code,
        code: row.code,
        stateCode: row.code,
        name: state?.name ?? row.code,
        state: state?.name ?? row.code,
        zone: state?.zone ?? null,
        winner: first?.[0] ?? null,
        winner_share: first ? shareOf(first[0]) : null,
        runner_up: second?.[0] ?? null,
        margin: first && second ? shareOf(first[0]) - shareOf(second[0]) : null,
        margin_votes: first && second ? first[1] - second[1] : null,
        cast: total,
        registered: row.registered ?? null,
        turnout: row.registered ? (total / row.registered) * 100 : null,
      };
      for (const party of main) out[`p_${party.id}`] = shareOf(party.id);
      return out;
    })
    .sort((a, b) => STATE_LIST.findIndex((s) => s.code === a.code) - STATE_LIST.findIndex((s) => s.code === b.code))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const carried = {};
  for (const row of rows) carried[row.winner] = (carried[row.winner] ?? 0) + 1;
  const closest = [...rows].filter((row) => row.margin !== null).sort((a, b) => a.margin - b.margin).slice(0, 5);
  const widest = [...rows].filter((row) => row.margin !== null).sort((a, b) => b.margin - a.margin).slice(0, 5);

  return {
    level: "state",
    title: `The ${election.year} presidential election, state by state${scope?.name && !scope.national ? ` — ${scope.name}` : ""}`,
    provenance: "counted",
    columns: [
      { key: "rank", label: "#", kind: "int" },
      { key: "name", label: "State", kind: "text", main: true },
      { key: "zone", label: "Zone", kind: "text" },
      { key: "winner", label: "Carried by", kind: "text" },
      { key: "winner_share", label: "Winner's share", kind: "pct" },
      { key: "runner_up", label: "Second", kind: "text" },
      { key: "margin", label: "Margin", kind: "pts" },
      ...main.map((party) => ({ key: `p_${party.id}`, label: party.id, kind: "pct" })),
      { key: "cast", label: "Votes cast", kind: "int" },
      ...(rows.some((row) => row.turnout !== null) ? [{ key: "turnout", label: "Turnout", kind: "pct" }] : []),
    ],
    rows,
    total: rows.length,
    read: rows.length,
    tiles: [],
    facts: {
      kind: "results",
      year: election.year,
      standalone: false,
      carried: Object.entries(carried)
        .sort((a, b) => b[1] - a[1])
        .map(([party, states]) => ({ party, states })),
      closest: closest.map((row) => ({ name: row.name, winner: row.winner, runnerUp: row.runner_up, margin: row.margin, votes: row.margin_votes })),
      widest: widest.map((row) => ({ name: row.name, winner: row.winner, margin: row.margin })),
      main: main.map((party) => party.id),
    },
  };
}

/* ══════════════════════════════════════════════════════════════ governors */

/**
 * Who governs each state: elected under which party, sitting under which now,
 * and the governorship results the record holds for the state.
 */
export function governorSections(scope = null, askedParty = null) {
  const inScope = (code) => !scope?.states?.length || scope.states.includes(code);
  const rows = ruling()
    .filter((row) => inScope(row.code))
    .map((row) => ({
      key: row.code,
      code: row.code,
      stateCode: row.code,
      name: row.state,
      state: row.state,
      zone: stateByCode(row.code)?.zone ?? null,
      governor: row.governor,
      elected: row.elected,
      current: row.current,
      moved: row.moved ? `${row.elected} to ${row.moved.to}, ${row.moved.on}` : "—",
      moved_on: row.moved?.on ?? null,
      reported: row.rumoured ? `Reported: to ${row.rumoured.to}` : "—",
      voted_on: row.votedOn,
      winner: row.current,
    }))
    .sort((a, b) => STATE_LIST.findIndex((s) => s.code === a.code) - STATE_LIST.findIndex((s) => s.code === b.code))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const seats = (field) => {
    const tally = {};
    for (const row of rows) tally[row[field]] = (tally[row[field]] ?? 0) + 1;
    return Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([party, count]) => ({ party, count }));
  };

  const races = OFF_CYCLE.filter((race) => inScope(race.code) && !race.unverified)
    .map((race) => {
      const cast = Object.values(race.votes).reduce((sum, n) => sum + n, 0);
      const order = Object.entries(race.votes).sort((a, b) => b[1] - a[1]);
      return {
        key: `${race.code}-${race.votesOn}`,
        name: `${race.state}, ${race.votesOn}`,
        state: race.state,
        stateCode: race.code,
        winner: race.winner,
        candidate: race.candidate,
        votes: race.votes[race.winner] ?? null,
        share: cast ? ((race.votes[race.winner] ?? 0) / cast) * 100 : null,
        runner_up: order[1]?.[0] ?? null,
        margin_votes: order[1] ? order[0][1] - order[1][1] : null,
        source: race.source ?? "—",
      };
    })
    .sort((a, b) => String(b.name.split(", ")[1]).localeCompare(String(a.name.split(", ")[1])));

  const governorSection = {
    level: "state",
    title: rows.length === 1 ? `The governor of ${rows[0].name}` : `Who governs each state${scope?.name && !scope.national ? ` — ${scope.name}` : ""}`,
    provenance: "counted",
    columns: [
      { key: "rank", label: "#", kind: "int" },
      { key: "name", label: "State", kind: "text", main: true },
      { key: "governor", label: "Governor", kind: "text" },
      { key: "elected", label: "Elected under", kind: "text" },
      { key: "current", label: "Sits under", kind: "text" },
      { key: "moved", label: "Changed party", kind: "text" },
      { key: "voted_on", label: "Elected on", kind: "text" },
      ...(rows.some((row) => row.reported !== "—") ? [{ key: "reported", label: "Reported move", kind: "text" }] : []),
    ],
    rows,
    total: rows.length,
    read: rows.length,
    tiles: [],
    facts: {
      kind: "governors",
      one: rows.length === 1 ? rows[0] : null,
      /* "PDP governors": the party's own governors, now and as elected. */
      party: askedParty
        ? {
            id: askedParty,
            now: rows.filter((row) => row.current === askedParty).map((row) => ({ name: row.name, governor: row.governor })),
            elected: rows.filter((row) => row.elected === askedParty).map((row) => ({ name: row.name, governor: row.governor, now: row.current })),
          }
        : null,
      states: rows.length,
      seatsNow: seats("current"),
      seatsElected: seats("elected"),
      moved: rows.filter((row) => row.moved_on).map((row) => ({ name: row.name, governor: row.governor, from: row.elected, to: row.current, on: row.moved_on })),
      races: races.slice(0, 12),
      fctAsked: Boolean(scope?.states?.includes("FCT")),
      fctNote: FCT.note,
    },
  };

  const raceSection = races.length
    ? {
        level: "state",
        title: "Governorship elections since the 2023 general election",
        provenance: "counted",
        columns: [
          { key: "name", label: "Election", kind: "text", main: true },
          { key: "winner", label: "Won by", kind: "text" },
          { key: "candidate", label: "Candidate", kind: "text" },
          { key: "votes", label: "Votes", kind: "int" },
          { key: "share", label: "Share", kind: "pct" },
          { key: "runner_up", label: "Second", kind: "text" },
          { key: "margin_votes", label: "Margin (votes)", kind: "int" },
        ],
        rows: races.map((row, index) => ({ ...row, rank: index + 1 })),
        total: races.length,
        read: races.length,
        tiles: [],
        facts: null,
      }
    : null;

  return [governorSection, raceSection].filter(Boolean);
}

/* ══════════════════════════════════════════════════════════════ coalition */

/**
 * What two or more candidates' declared votes add up to, state by state and
 * nationally, against the strongest party left outside — and how much of the
 * pooled vote the coalition could lose and still lead.
 */
export function coalitionSection(partners, year, scope = null) {
  const election = electionFor(MAPPED_YEARS.includes(year) ? year : 2023);
  const ids = partners.filter((id) => election.parties.some((party) => party.id === id));
  if (ids.length < 2) return null;
  const candidateOf = (id) => election.parties.find((party) => party.id === id)?.candidate ?? id;

  const national = election.year === 2023 ? { APC: DECLARED.apc, PDP: DECLARED.pdp, LP: DECLARED.lp, NNPP: DECLARED.nnpp } : { ...(election.national ?? {}) };
  if (election.year !== 2023 && !Object.keys(national).length) {
    for (const row of election.rows) for (const [id, n] of Object.entries(row.votes)) national[id] = (national[id] ?? 0) + n;
  }
  const validVotes = election.year === 2023 ? DECLARED.validVotes : election.rows.reduce((sum, row) => sum + totalOf(row), 0);
  const pooled = ids.reduce((sum, id) => sum + (national[id] ?? 0), 0);
  const outside = Object.entries(national)
    .filter(([id]) => id !== "OTH" && !ids.includes(id))
    .sort((a, b) => b[1] - a[1])[0] ?? null;
  const biggest = [...ids].sort((a, b) => (national[b] ?? 0) - (national[a] ?? 0))[0];

  const all = election.rows.map((row) => {
    const total = totalOf(row);
    const votes = ids.reduce((sum, id) => sum + (row.votes[id] ?? 0), 0);
    const rival = ranked(row).filter(([id]) => !ids.includes(id))[0] ?? null;
    const share = total ? (votes / total) * 100 : null;
    const lead = rival && total ? share - (rival[1] / total) * 100 : share;
    const alone = total ? ((row.votes[biggest] ?? 0) / total) * 100 : null;
    const winner2023 = ranked(row)[0]?.[0] ?? null;
    const state = stateByCode(row.code);
    return {
      key: row.code,
      code: row.code,
      stateCode: row.code,
      name: state?.name ?? row.code,
      state: state?.name ?? row.code,
      zone: state?.zone ?? null,
      share_prev: alone,
      share,
      votes,
      rival: rival?.[0] ?? "—",
      rival_share: rival && total ? (rival[1] / total) * 100 : null,
      lead,
      won: rival ? votes > rival[1] : votes > 0,
      clears: share !== null && share >= 25,
      was: winner2023,
      gained: rival ? votes > rival[1] && !ids.includes(winner2023) : false,
      status: rival && votes > rival[1] ? "held" : share !== null && share >= 25 ? "cleared" : "beyond",
      status_label: rival && votes > rival[1] ? "Carried" : share !== null && share >= 25 ? "25% or more" : "Under 25%",
    };
  });
  const rows = all
    .filter((row) => !scope?.states?.length || scope.states.includes(row.code))
    .sort((a, b) => (b.share ?? 0) - (a.share ?? 0))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const quarter = all.filter((row) => row.code !== "FCT" && row.clears).length;
  const fct = all.find((row) => row.code === "FCT");
  const carried = all.filter((row) => row.won).length;
  /* The share of the pooled vote a coalition can lose and still lead. */
  const keepToLead = outside ? outside[1] / pooled : null;
  /* And to keep 25% in 24 states: the retention at which the 24th-best state
     still clears 25%. */
  const quarterShares = all
    .filter((row) => row.code !== "FCT" && row.share !== null)
    .map((row) => row.share)
    .sort((a, b) => b - a);
  const keepToSpread = quarterShares.length >= 24 && quarterShares[23] > 0 ? 25 / quarterShares[23] : null;

  return {
    level: "state",
    title: `${ids.join(" + ")} pooled, ${election.year}: state by state`,
    provenance: "scenario",
    columns: [
      { key: "rank", label: "#", kind: "int" },
      { key: "name", label: "State", kind: "text", main: true },
      { key: "zone", label: "Zone", kind: "text" },
      { key: "status", label: "Pooled", kind: "status" },
      { key: "share_prev", label: `${biggest} alone`, kind: "pct" },
      { key: "share", label: "Pooled share", kind: "bar", threshold: 25 },
      { key: "votes", label: "Pooled votes", kind: "int" },
      { key: "rival", label: "Strongest outside", kind: "text" },
      { key: "rival_share", label: "Its share", kind: "pct" },
      { key: "lead", label: "Lead", kind: "pts" },
      { key: "was", label: `Carried by, ${election.year}`, kind: "text" },
    ],
    rows,
    total: rows.length,
    read: rows.length,
    tiles: [
      { label: "Pooled votes", value: fmtInt(pooled), sub: ids.join(" + ") },
      outside
        ? {
            label: pooled > outside[1] ? "Ahead of" : "Behind",
            value: fmtInt(Math.abs(pooled - outside[1])),
            sub: `the ${outside[0]}'s ${fmtInt(outside[1])}`,
            tone: pooled > outside[1] ? "good" : "warn",
          }
        : null,
      { label: "States at 25%+", value: `${quarter} of 36`, sub: quarter >= 24 ? "24 needed, met" : `${24 - quarter} short of 24`, tone: quarter >= 24 ? "good" : "warn" },
      { label: "States carried", value: `${carried} of ${all.length}`, sub: "on the pooled vote" },
    ].filter(Boolean),
    facts: {
      kind: "coalition",
      year: election.year,
      partners: ids.map((id) => ({ id, candidate: candidateOf(id), short: nameOf({ kind: "candidate", name: candidateOf(id) }), votes: national[id] ?? 0 })),
      biggest,
      pooled,
      pooledShare: validVotes ? (pooled / validVotes) * 100 : null,
      outside: outside ? { id: outside[0], candidate: candidateOf(outside[0]), votes: outside[1], share: validVotes ? (outside[1] / validVotes) * 100 : null } : null,
      quarter,
      fctQuarter: Boolean(fct?.clears),
      carried,
      states: all.length,
      gained: all.filter((row) => row.gained).map((row) => row.name),
      keepToLead,
      keepToSpread,
      regional: scope?.states?.length && !scope.national
        ? { place: scope.name, states: rows.length, carried: rows.filter((row) => row.won).length, quarter: rows.filter((row) => row.code !== "FCT" && row.clears).length }
        : null,
      weakest: [...all].filter((row) => row.code !== "FCT").sort((a, b) => (a.share ?? 0) - (b.share ?? 0)).slice(0, 5).map((row) => ({ name: row.name, share: row.share, rival: row.rival })),
      closestLost: all.filter((row) => !row.won).sort((a, b) => b.lead - a.lead).slice(0, 5).map((row) => ({ name: row.name, lead: row.lead, rival: row.rival })),
    },
  };
}

/* ══════════════════════════════════════════════════════════════ the rules */

/**
 * What the Constitution asks of a president-elect, measured on an election:
 * who met the count, who met the spread, and by how much.
 */
export function rulesSection(year) {
  const election = electionFor(MAPPED_YEARS.includes(year) ? year : 2023);
  const national = election.year === 2023 ? { APC: DECLARED.apc, PDP: DECLARED.pdp, LP: DECLARED.lp, NNPP: DECLARED.nnpp } : { ...(election.national ?? {}) };
  if (!Object.keys(national).length) for (const row of election.rows) for (const [id, n] of Object.entries(row.votes)) national[id] = (national[id] ?? 0) + n;
  const validVotes = election.year === 2023 ? DECLARED.validVotes : election.rows.reduce((sum, row) => sum + totalOf(row), 0);
  const leaderVotes = Math.max(...Object.entries(national).filter(([id]) => id !== "OTH").map(([, n]) => n));

  const rows = election.parties
    .filter((party) => party.id !== "OTH")
    .map((party) => {
      const votes = national[party.id] ?? 0;
      const quarter = election.rows.filter((row) => row.code !== "FCT" && (row.votes[party.id] ?? 0) / (totalOf(row) || 1) >= 0.25).length;
      const fctRow = election.rows.find((row) => row.code === "FCT");
      const fct = fctRow ? (fctRow.votes[party.id] ?? 0) / (totalOf(fctRow) || 1) >= 0.25 : null;
      const first = votes === leaderVotes;
      return {
        key: party.id,
        name: `${party.candidate} (${party.id})`,
        candidate: party.candidate,
        party: party.id,
        votes,
        share: validVotes ? (votes / validVotes) * 100 : null,
        first,
        quarter,
        fct,
        both: first && quarter >= 24,
        status: first && quarter >= 24 ? "held" : first || quarter >= 24 ? "reach" : "beyond",
        status_label: first && quarter >= 24 ? "Both tests met" : first ? "Count only" : quarter >= 24 ? "Spread only" : "Neither",
      };
    })
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 6)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    level: "state",
    title: `The two tests, measured on ${election.year}`,
    provenance: "counted",
    columns: [
      { key: "rank", label: "#", kind: "int" },
      { key: "name", label: "Candidate", kind: "text", main: true },
      { key: "votes", label: "Votes", kind: "int" },
      { key: "share", label: "Share", kind: "pct" },
      { key: "first", label: "Most votes", kind: "bool" },
      { key: "quarter", label: "States at 25%+ (of 36)", kind: "int" },
      { key: "fct", label: "25% in the FCT", kind: "bool" },
      { key: "status", label: "Verdict", kind: "status" },
    ],
    rows,
    total: rows.length,
    read: rows.length,
    tiles: [],
    facts: {
      kind: "rules",
      year: election.year,
      winner: rows[0],
      runnerUp: rows[1] ?? null,
      validVotes,
      rows: rows.map((row) => ({ candidate: row.candidate, party: row.party, votes: row.votes, share: row.share, quarter: row.quarter, fct: row.fct, both: row.both })),
      minimumWins: MAPPED_YEARS.map((y) => {
        const e = electionFor(y);
        const n = y === 2023 ? { APC: DECLARED.apc } : e.national ?? {};
        const best = Object.entries(n).filter(([id]) => id !== "OTH").sort((a, b) => b[1] - a[1])[0];
        return best ? { year: y, party: best[0], votes: best[1] } : null;
      }).filter(Boolean),
    },
  };
}

