import { ELECTIONS, CANDIDATES } from "../strongholds.js";
import { TIMELINE } from "../record.js";
import { DECLARED } from "../election2023.js";
import { STATE_LIST, nameOf, partyIn } from "./ground.js";
import { count, fmtInt, fmtPct } from "./format.js";

/**
 * Research on an aspirant: everything the record holds about their runs.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ANY CANDIDATE, ANY PARTY, 1999 TO THE LAST ELECTION HELD
 *
 *  Type a name and the record is read for every presidential election they
 *  stood in — the party they stood for, their votes, their share, their
 *  place, the states they carried and where they reached a quarter — and for
 *  every off-cycle governorship they won since 2023. A party is researched
 *  the same way, across every candidate it put up.
 *
 *  What the record cannot say is said plainly. 2007 and 2011 published
 *  national totals only, so a run in either has no state table; governorship
 *  results since 2023 name the winner only. And an aspirant who has never
 *  stood is told so rather than handed somebody else's history.
 * ══════════════════════════════════════════════════════════════════════════
 */

const STATE_NAME = new Map(STATE_LIST.map((state) => [state.code, state]));

/** The national figure for an election: INEC's declared totals, as printed. */
function nationalOf(election) {
  if (election.year === 2023) {
    return {
      APC: DECLARED.apc,
      PDP: DECLARED.pdp,
      LP: DECLARED.lp,
      NNPP: DECLARED.nnpp,
      OTH: DECLARED.validVotes - DECLARED.apc - DECLARED.pdp - DECLARED.lp - DECLARED.nnpp,
    };
  }
  return election.national ?? {};
}

const squash = (text) => String(text ?? "").toLowerCase().replace(/[^a-z]/g, "");

/**
 * A name as typed, to a candidate in the record: full name, surname, first
 * name, or a spelling close enough ("Kwankwanso", "Yaradua").
 */
export function findAspirant(typed) {
  const want = squash(typed);
  if (want.length < 3) return null;
  const names = CANDIDATES.map((entry) => entry.name);
  const exact = names.find((name) => squash(name) === want);
  if (exact) return exact;
  const byPart = names.filter((name) => name.split(/[\s']+/).some((part) => squash(part) === want));
  if (byPart.length === 1) return byPart[0];
  const within = names.filter((name) => squash(name).includes(want) || want.includes(squash(name)));
  if (within.length === 1) return within[0];
  /* A near spelling of one part of one name — a letter added, dropped or
     changed: "Kwankwanso", "Yaradua", "Tinubbu". */
  const near = names.filter((name) =>
    [squash(name), ...name.split(/[\s']+/).map(squash)].some((part) => part.length >= 4 && distance(part, want) <= (part.length >= 8 ? 2 : 1))
  );
  return near.length === 1 ? near[0] : null;
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const held = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = held;
    }
  }
  return row[b.length];
}

/** Every run in the record for a candidate or a party, oldest first. */
function runsFor(who) {
  const runs = [];
  for (const election of [...ELECTIONS].sort((a, b) => a.year - b.year)) {
    const party = partyIn(who, election.year);
    if (!party) continue;
    const national = nationalOf(election);
    const total = Object.values(national).reduce((sum, n) => sum + n, 0);
    const ranked = Object.entries(national).filter(([id]) => id !== "OTH").sort((a, b) => b[1] - a[1]);
    const place = ranked.findIndex(([id]) => id === party.id) + 1;
    const winner = election.parties.find((entry) => entry.id === ranked[0]?.[0]);
    const run = {
      year: election.year,
      party: party.id,
      partyName: party.name,
      candidate: party.candidate,
      votes: national[party.id] ?? 0,
      share: total ? ((national[party.id] ?? 0) / total) * 100 : null,
      place: place || null,
      won: place === 1,
      winner: winner ? `${winner.candidate} (${winner.id})` : null,
      stateLevel: election.stateLevel,
      carried: null,
      quarter: null,
      shares: {},
      carriedStates: [],
    };
    if (election.stateLevel) {
      let carried = 0;
      let quarter = 0;
      for (const row of election.rows) {
        const all = row.total ?? Object.values(row.votes).reduce((sum, n) => sum + n, 0);
        const mine = row.votes[party.id] ?? 0;
        const best = Object.entries(row.votes).filter(([id]) => id !== "OTH").sort((a, b) => b[1] - a[1])[0];
        run.shares[row.code] = all ? (mine / all) * 100 : null;
        if (best?.[0] === party.id) {
          carried += 1;
          run.carriedStates.push(row.code);
        }
        if (row.code !== "FCT" && all && mine / all >= 0.25) quarter += 1;
      }
      run.carried = carried;
      run.quarter = quarter;
    }
    runs.push(run);
  }
  return runs;
}

/**
 * @returns {{ sections: object[], notes: string[], facts: object }}
 */
export function researchSections(who, { states: scopeStates = null } = {}) {
  const runs = runsFor(who);
  const long = nameOf(who, { long: true });
  const short = nameOf(who);
  const governorships = TIMELINE.filter(
    (row) => row.kind === "GOVERNORSHIP" && who.kind === "candidate" && squash(row.candidate) === squash(who.name)
  );

  if (!runs.length) {
    return { sections: [], notes: [`${long} has no presidential run in the record, 1999 to 2023.`], facts: { kind: "research", runs: [], long, short } };
  }

  /* ── THE RUNS ─────────────────────────────────────────────────────────── */
  const runRows = runs.map((run, index) => ({
    rank: index + 1,
    key: String(run.year),
    name: String(run.year),
    party: who.kind === "party" ? run.candidate : `${run.partyName} (${run.party})`,
    votes: run.votes,
    share: run.share,
    place: run.place ? ordinal(run.place) : "—",
    carried: run.carried,
    quarter: run.quarter,
    winner: run.won ? "Won" : run.winner,
  }));
  const runSection = {
    level: "state",
    title: `${long}: every presidential run, ${runs[0].year} to ${runs[runs.length - 1].year}`,
    provenance: "counted",
    columns: [
      { key: "name", label: "Year", kind: "text", main: true },
      { key: "party", label: who.kind === "party" ? "Candidate" : "Party", kind: "text" },
      { key: "votes", label: "Votes", kind: "int" },
      { key: "share", label: "Share", kind: "bar", threshold: 25 },
      { key: "place", label: "Place", kind: "text" },
      { key: "carried", label: "States carried", kind: "int" },
      { key: "quarter", label: "States at 25%+", kind: "int" },
      { key: "winner", label: "Result", kind: "text" },
    ],
    rows: runRows,
    total: runRows.length,
    read: runRows.length,
    tiles: [],
    facts: null,
  };

  /* ── STATE BY STATE, ACROSS THE RUNS THAT PUBLISHED A TABLE ───────────── */
  const mapped = runs.filter((run) => run.stateLevel);
  const stateRows = STATE_LIST.filter((state) => !scopeStates || scopeStates.includes(state.code)).map((state) => {
    const row = { key: state.code, code: state.code, name: state.name, zone: state.zone, state: state.name, stateCode: state.code };
    for (const run of mapped) row[`y${run.year}`] = run.shares[state.code] ?? null;
    row.carriedRuns = mapped.filter((run) => run.carriedStates.includes(state.code)).length;
    const shares = mapped.map((run) => run.shares[state.code]).filter((value) => value !== null && value !== undefined);
    row.average = shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : null;
    row.latest = mapped.length ? mapped[mapped.length - 1].shares[state.code] ?? null : null;
    row.first = mapped.length > 1 ? mapped[0].shares[state.code] ?? null : null;
    return row;
  });
  stateRows.sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  stateRows.forEach((row, index) => (row.rank = index + 1));

  const stateSection = mapped.length
    ? {
        level: "state",
        title: `${short}'s share, state by state, in every run with a state table`,
        provenance: "counted",
        columns: [
          { key: "rank", label: "#", kind: "int" },
          { key: "name", label: "State", kind: "text", main: true },
          { key: "zone", label: "Zone", kind: "text" },
          ...mapped.map((run) => ({ key: `y${run.year}`, label: `${run.year}${who.kind === "candidate" ? ` (${run.party})` : ""}`, kind: run === mapped[mapped.length - 1] ? "bar" : "pct", threshold: 25 })),
          { key: "average", label: "Average", kind: "pct" },
          { key: "carriedRuns", label: `Carried (of ${mapped.length})`, kind: "int" },
        ],
        rows: stateRows,
        total: stateRows.length,
        read: stateRows.length,
        tiles: [],
        facts: null,
      }
    : null;

  /* ── GOVERNORSHIPS SINCE 2023 ─────────────────────────────────────────── */
  const governorshipSection = governorships.length
    ? {
        level: "state",
        title: `${short}'s governorship wins in the record`,
        provenance: "counted",
        columns: [
          { key: "name", label: "Election", kind: "text", main: true },
          { key: "party", label: "Party", kind: "text" },
          { key: "votes", label: "Votes", kind: "int" },
        ],
        rows: governorships.map((row, index) => ({ rank: index + 1, key: row.id, name: row.label, party: row.winner, votes: row.votes?.[row.winner] ?? null })),
        total: governorships.length,
        read: governorships.length,
        tiles: [],
        facts: null,
      }
    : null;

  /* ── WHAT THE RECORD ADDS UP TO ───────────────────────────────────────── */
  const best = [...runs].sort((a, b) => (b.share ?? 0) - (a.share ?? 0))[0];
  const latest = runs[runs.length - 1];
  const parties = [...new Set(runs.map((run) => run.party))];
  const always = mapped.length >= 2 ? stateRows.filter((row) => row.carriedRuns === mapped.length) : [];
  const never = mapped.length ? stateRows.filter((row) => row.carriedRuns === 0 && (row.average ?? 0) < 10) : [];
  const latestMapped = mapped[mapped.length - 1] ?? null;
  const firstMapped = mapped.length > 1 ? mapped[0] : null;
  const moved = firstMapped
    ? stateRows
        .filter((row) => row.first !== null && row.latest !== null)
        .map((row) => ({ name: row.name, change: row.latest - row.first, from: row.first, to: row.latest }))
        .sort((a, b) => b.change - a.change)
    : [];

  runSection.tiles = [
    { label: "Presidential runs", value: fmtInt(runs.length), sub: runs.map((run) => run.year).join(", ") },
    { label: "Best run", value: fmtPct(best.share), sub: `${best.year}, ${fmtInt(best.votes)} votes` },
    { label: who.kind === "party" ? "Candidates" : "Parties", value: fmtInt(who.kind === "party" ? new Set(runs.map((run) => run.candidate)).size : parties.length), sub: who.kind === "party" ? "put up" : parties.join(", ") },
    { label: "Won", value: fmtInt(runs.filter((run) => run.won).length), sub: `of ${fmtInt(runs.length)}` },
  ];
  runSection.facts = {
    kind: "research",
    long,
    short,
    candidate: who.kind === "candidate",
    runs,
    parties,
    best,
    latest,
    mappedYears: mapped.map((run) => run.year),
    always: always.map((row) => ({ name: row.name, average: row.average })),
    never: never.map((row) => ({ name: row.name, average: row.average })),
    /* Only where there is a state table to read; a run in 2007 or 2011 has none. */
    strongest: mapped.length ? stateRows.filter((row) => row.average !== null).slice(0, 6).map((row) => ({ name: row.name, average: row.average, carriedRuns: row.carriedRuns })) : [],
    weakest: mapped.length ? [...stateRows].filter((row) => row.average !== null).sort((a, b) => a.average - b.average).slice(0, 5).map((row) => ({ name: row.name, average: row.average })) : [],
    gained: moved.slice(0, 5),
    lost: moved.slice(-5).reverse(),
    firstMapped: firstMapped?.year ?? null,
    latestMapped: latestMapped?.year ?? null,
    governorships: governorships.map((row) => ({ label: row.label, party: row.winner })),
    national: latest ? { share: latest.share } : null,
  };

  const notes = [];
  if (runs.some((run) => !run.stateLevel)) {
    notes.push(`${runs.filter((run) => !run.stateLevel).map((run) => run.year).join(" and ")} published national totals only, so ${runs.filter((run) => !run.stateLevel).length === 1 ? "that run has" : "those runs have"} no state table.`);
  }
  return {
    sections: [runSection, ...(stateSection ? [stateSection] : []), ...(governorshipSection ? [governorshipSection] : [])],
    notes,
  };
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export const countStates = (n) => count(n, "state");
export { STATE_NAME };
