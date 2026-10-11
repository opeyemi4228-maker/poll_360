import { holdersOf } from "../seats.js";
import { resolveTerritory } from "../constituencies.js";
import { deepRows, partyIn, nameOf, stateByCode } from "./ground.js";
import { lgaField } from "./field.js";
import { CONTESTS } from "./seat-names.js";
import { coverage, holdRateFor, holdRates, lineOf, movesOnRecord, recordOf } from "./seat-record.js";
import { simulate } from "./simulate.js";
import { fmtInt } from "./format.js";
import { turnoutRecord, unitFocus } from "./focus.js";

/**
 * Winning a senate seat or a governorship, from that seat's own elections.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  NOTHING HERE IS THE PRESIDENTIAL VOTE
 *
 *  Every figure of who won, by how much and how often comes from the seat's
 *  own contest: senate elections for a senatorial district, governorship
 *  elections for a state. The only things read from elsewhere are facts about
 *  the ground itself — how many people are registered there, and how many
 *  polling units, wards and local governments it has.
 *
 *  ── TWO KINDS OF EVIDENCE, AND EACH SAID FOR WHAT IT IS ─────────────────
 *    WHO HELD IT     on record for nearly every election since 1999. From it:
 *                    how long the holder has held the seat, how often it has
 *                    changed hands, and — counted over every seat of the same
 *                    kind — how often a party in that position kept it.
 *    THE COUNT       on record where the result was published with figures.
 *                    From it: the votes to aim for, where a party stands, and
 *                    — where the last election itself was counted and enough
 *                    swings are on record — the contest run 10,000 times.
 *
 *  Where the count is not held, the answer says so and gives what the record
 *  of holders supports. It never fills the gap from another election.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** How many recorded swings a contest needs before its votes are simulated. */
const ENOUGH_MOVES = 60;

function holderToday(contest, ground) {
  try {
    const territory = ground.seat
      ? resolveTerritory({ level: "SENATORIAL", key: ground.seat.key })
      : resolveTerritory({ level: "STATE", key: stateByCode(ground.states[0])?.number });
    const [holder] = territory ? holdersOf({ race: contest, territory }) ?? [] : [];
    return holder ?? null;
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<null | { sections: object[], notes: string[], facts: object }>}
 *          Null where Poll360 holds no election of this seat at all.
 */
export async function seatSections({ plan, who, scope, contest, seat }) {
  const ground = { states: scope.states, lgas: scope.lgas, seat, name: scope.name };
  const record = recordOf(contest, contest === "SENATE" ? seat.key : scope.states[0]);
  if (!record) return null;

  const notes = [];
  const office = CONTESTS[contest];
  const what = contest === "SENATE" ? "senate" : "governorship";
  const { latest, counted } = record;
  const scenario = plan.scenario ?? null;

  /* ── WHO THE PLAN IS FOR ──────────────────────────────────────────────── */
  let subject = null;
  if (who) {
    /* A candidate is read as the party they last stood for as President —
       the only party the record can put a presidential candidate under. */
    const id = who.kind === "party" ? who.id : partyIn(who, 2023)?.id ?? [2019, 2015, 2003, 1999].map((year) => partyIn(who, year)?.id).find(Boolean) ?? null;
    if (id) {
      const mine = counted?.votes.find((entry) => entry.party === id) ?? null;
      subject = {
        id,
        short: `the ${id}`,
        holds: lineOf(latest.winner.party) === lineOf(id),
        won: record.wonBy[lineOf(id)] ?? 0,
        stood: Boolean(mine),
        votes: mine?.votes ?? null,
        share: mine && counted.total ? (mine.votes / counted.total) * 100 : null,
      };
      if (who.kind === "candidate") {
        notes.push(`${nameOf(who, { long: true })} is read here as the ${id}, the party of that candidate's last presidential run. This is the ${what} record, not a presidential one.`);
      }
    }
  }

  /* ── THE NUMBER, FROM THE LAST COUNT OF THIS SEAT ─────────────────────── */
  const turnoutBy = scenario?.turnout ?? 1;
  const leaderVotes = counted ? counted.votes.filter((entry) => entry.party !== "OTH")[0].votes : null;
  const beat = leaderVotes !== null ? Math.round(leaderVotes * turnoutBy) + 1 : null;

  /* ── THE GOAL FOLLOWS THE SEAT'S OWN TURNOUT ───────────────────────────
     How many people vote in this seat's elections, and how much of that vote
     its winners have needed, are both on record wherever the count is. The
     goal is the two together: the turnout to expect, from the last three
     counted elections, times the share winners here have taken — and never
     less than what beat the last count. */
  const countedAll = record.elections.filter((election) => election.votes && election.total);
  const recent = countedAll.slice(-3);
  const expected = recent.length ? Math.round((recent.reduce((sum, election) => sum + election.total, 0) / recent.length) * turnoutBy) : null;
  const shares = recent.map((election) => (Math.max(...election.votes.filter((entry) => entry.party !== "OTH").map((entry) => entry.votes)) / election.total) * 100);
  const winShare = shares.length ? shares.reduce((sum, share) => sum + share, 0) / shares.length : null;
  const byTurnout = expected !== null ? Math.ceil((expected * winShare) / 100) : null;
  const goal = leaderVotes !== null ? Math.max(beat, byTurnout) : null;
  if (subject && counted) {
    const top = counted.votes.filter((entry) => entry.party !== "OTH")[0];
    subject.leader = subject.stood && top.party === subject.id;
    subject.behind = subject.stood && !subject.leader ? top.votes - subject.votes : null;
    subject.ahead = subject.leader ? counted.marginVotes : null;
    subject.fromLeader = subject.behind !== null ? Math.floor(subject.behind / 2) + 1 : null;
    subject.gap = goal - Math.round((subject.votes ?? 0) * turnoutBy);
  }

  /* ── HOW OFTEN A SEAT IN THIS POSITION IS KEPT ────────────────────────── */
  const hold = holdRateFor(contest, record.streak);
  const general = holdRates(contest).all;

  /* ── THE CONTEST RUN AGAIN, WHERE THE LAST ONE WAS COUNTED ────────────── */
  const moves = movesOnRecord(contest);
  let sim = null;
  if (latest.votes && latest.total && moves.length >= ENOUGH_MOVES) {
    const parties = latest.votes.filter((entry) => entry.party !== "OTH");
    const shares = Object.fromEntries(parties.map((entry) => [entry.party, (entry.votes / latest.total) * 100]));
    const run = simulate({
      states: [{ code: scope.states[0], places: [{ key: record.key, cast: latest.total, shares }] }],
      ids: parties.map((entry) => entry.party),
      rule: "plurality",
      shift: scenario?.swing ?? {},
      seed: `${contest}|${record.key}`,
      moves,
    });
    sim = {
      runs: run.runs,
      year: latest.year,
      moves: moves.length,
      favourite: { id: run.favourite.id, win: run.favourite.win },
      challenger: run.parties[1] ? { id: run.parties[1].id, win: run.parties[1].win } : null,
      parties: run.parties.map((party) => ({ id: party.id, win: party.win, low: party.low, high: party.high })),
    };
    if (subject) subject.sim = sim.parties.find((party) => party.id === subject.id) ?? null;
  } else if (scenario && Object.keys(scenario.swing ?? {}).length) {
    notes.push(`A swing cannot be run on this seat: ${latest.votes ? `too few ${what} swings are on record to draw from` : `the ${latest.year} ${what} count is not on record`}.`);
  }

  /* ── THE GROUND ITSELF: REGISTER AND PLACES, NO VOTE ──────────────────── */
  const lgas = lgaField({ states: ground.states, lgas: ground.lgas });
  const registered = lgas.reduce((sum, row) => sum + (row.registered ?? 0), 0);
  const booths = lgas.reduce((sum, row) => sum + (row.booths ?? 0), 0);
  const placeRows = lgas
    .map((row) => ({
      key: row.key,
      code: row.code,
      name: row.name,
      state: row.state,
      stateCode: row.stateCode,
      lga: row.lga,
      lgaKey: row.lgaKey,
      level: "lga",
      registered: row.registered,
      booths: row.booths,
      part: registered ? ((row.registered ?? 0) / registered) * 100 : null,
      /* The goal, shared by where the voters are registered. */
      goal: goal !== null && registered ? Math.round((goal * (row.registered ?? 0)) / registered) : null,
    }))
    .sort((a, b) => (b.registered ?? 0) - (a.registered ?? 0))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const wards = await deepRows("ward", { states: ground.states, lgaKeys: ground.lgas });
  const wardRows = wards
    .map((row) => ({
      key: row.key,
      code: row.code,
      name: row.name,
      lga: row.lga,
      lgaKey: row.lgaKey,
      state: row.state,
      stateCode: row.stateCode,
      level: "ward",
      registered: row.registered,
      booths: row.booths,
      goal: goal !== null && registered ? Math.round((goal * (row.registered ?? 0)) / registered) : null,
    }))
    .sort((a, b) => (b.registered ?? 0) - (a.registered ?? 0))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  /* ── THE POLLING UNITS, AND TURNOUT AT EVERY ELECTION ─────────────────── */
  const units = await unitFocus(ground, { goal, registered });
  const turnoutAll = turnoutRecord(ground, registered, { what, elections: countedAll });

  const holder = holderToday(contest, ground);
  const cover = coverage(contest);
  /* A seat the courts gave to somebody else after the declaration: the
     record of elections names who was declared, the record of holders names
     who sits. Both are said, and the seat is held by whoever sits. */
  const unseated =
    holder?.holder && !holder.wonAs && latest.winner.name && lineOf(holder.party) !== lineOf(latest.winner.party) ? { name: holder.holder, party: holder.party } : null;
  if (subject && unseated) subject.holds = lineOf(unseated.party) === lineOf(subject.id);

  /* ══════════════════════════════════════════════════════════ the tables */

  const history = [...record.elections].reverse().map((election) => {
    const mine = subject ? election.votes?.find((entry) => lineOf(entry.party) === lineOf(subject.id)) ?? null : null;
    return {
      key: String(election.year),
      name: String(election.year),
      year: election.year,
      winner: election.winner.name ?? "—",
      party: election.winner.party,
      votes: election.winnerVotes,
      share: election.winnerShare,
      second: election.second ? `${election.second.party}${election.second.name ? ` — ${election.second.name}` : ""}` : "—",
      second_votes: election.second?.votes ?? null,
      margin_votes: election.overturned ? null : election.marginVotes,
      cast: election.total,
      mine: mine?.votes ?? null,
      status: election.votes ? "held" : "beyond",
      status_label: election.overturned ? "Counted — seat decided after the count" : election.votes ? "Counted" : "Winner only",
    };
  });

  const facts = {
    kind: "seat",
    intent: plan.intent,
    contest,
    what,
    office: office.office,
    seat: office.seat,
    ground: ground.name,
    level: "lga",
    elections: record.elections.length,
    countedElections: record.elections.filter((election) => election.votes).length,
    from: record.elections[0].year,
    to: latest.year,
    latest: {
      year: latest.year,
      winner: latest.winner.name,
      party: latest.winner.party,
      counted: Boolean(latest.votes),
      votes: latest.winnerVotes,
      share: latest.winnerShare,
      second: latest.second ? { party: latest.second.party, name: latest.second.name, votes: latest.second.votes } : null,
      marginVotes: latest.marginVotes,
      total: latest.total,
      overturned: latest.overturned,
    },
    counted: counted
      ? {
          year: counted.year,
          isLatest: counted.year === latest.year,
          total: counted.total,
          parties: counted.votes.map((entry) => ({ party: entry.party, name: entry.name, votes: entry.votes, share: counted.total ? (entry.votes / counted.total) * 100 : null })),
          leaderVotes,
          marginVotes: counted.marginVotes,
          overturned: counted.overturned,
        }
      : null,
    state: stateByCode(scope.states[0])?.name ?? null,
    seatNoun: contest === "SENATE" ? "senate seat" : "governorship",
    unseated,
    streak: record.streak,
    changed: record.changed,
    wonBy: record.wonBy,
    holders: record.elections.map((election) => ({ year: election.year, party: election.winner.party, name: election.winner.name })),
    hold: { rate: hold.rate, n: hold.n, held: hold.held, streak: hold.streak, allRate: general.n ? (general.held / general.n) * 100 : null, allN: general.n },
    sim,
    beat,
    goal,
    /* What the goal was worked out from: this seat's own turnout. */
    turnout: expected !== null
      ? {
          elections: countedAll.map((election) => ({ year: election.year, cast: election.total })),
          used: recent.map((election) => election.year),
          expected,
          winShare,
          byTurnout,
          /* The floor took over: the last winner polled more than that. */
          floored: byTurnout < beat,
        }
      : null,
    perBooth: goal !== null && booths ? Math.ceil(goal / booths) : null,
    registered,
    booths,
    lgas: placeRows.length,
    wards: wardRows.length,
    subject,
    scenario: scenario ? { swing: scenario.swing ?? {}, turnout: scenario.turnout ?? null } : null,
    holder: holder ? { office: holder.office, name: holder.holder, party: holder.party, wonAs: holder.wonAs ?? null, since: holder.since ?? null, note: holder.note ?? null } : null,
    cover,
    places: {
      top: placeRows.slice(0, 5).map((row) => ({ name: row.name, registered: row.registered, goal: row.goal })),
    },
    wardsTop: wardRows.slice(0, 6).map((row) => ({ name: row.name, lga: row.lga, registered: row.registered })),
    focus: { units: units?.facts ?? null, turnout: turnoutAll.facts },
  };

  const historySection = {
    level: "lga",
    title: `Every ${what} election in ${ground.name} on record, ${facts.from} to ${facts.to}`,
    provenance: "seat",
    columns: [
      { key: "name", label: "Election", kind: "text", main: true },
      { key: "winner", label: "Won by", kind: "text" },
      { key: "party", label: "Party", kind: "text" },
      { key: "status", label: "On record", kind: "status" },
      { key: "votes", label: "Winner's votes", kind: "int" },
      { key: "share", label: "Share", kind: "pct" },
      { key: "second", label: "Nearest rival", kind: "text" },
      { key: "second_votes", label: "Its votes", kind: "int" },
      { key: "margin_votes", label: "Margin (votes)", kind: "int" },
      { key: "cast", label: "Votes counted", kind: "int" },
      ...(subject ? [{ key: "mine", label: `${subject.id} votes`, kind: "int" }] : []),
    ],
    rows: history,
    total: history.length,
    read: history.length,
    tiles: [
      { label: `Holds it, ${latest.year}`, value: latest.winner.party, sub: latest.winner.name ?? "" },
      { label: "Won it running", value: `${record.streak} ${record.streak === 1 ? "election" : "elections"}`, sub: record.changed ? `changed hands ${record.changed} ${record.changed === 1 ? "time" : "times"} since ${facts.from}` : `never changed hands since ${facts.from}` },
      goal !== null ? { label: "Votes to aim for", value: fmtInt(goal), sub: `${fmtInt(expected)} expected to vote` } : { label: "Votes to aim for", value: "—", sub: "no count on record for this seat", tone: "warn" },
      hold.rate !== null ? { label: "Seats like it were kept", value: `${Math.round(hold.rate)}%`, sub: `of ${fmtInt(hold.n)} ${what} elections` } : null,
    ].filter(Boolean),
    facts,
  };

  const fieldSection = counted
    ? {
        level: "lga",
        title: `The ${counted.year} ${what} election in ${ground.name}: the count${sim ? `, and ${fmtInt(sim.runs)} runs of the next one` : ""}`,
        provenance: sim ? "seat-runs" : "seat",
        columns: [
          { key: "rank", label: "#", kind: "int" },
          { key: "name", label: "Candidate", kind: "text", main: true },
          { key: "party", label: "Party", kind: "text" },
          { key: "votes", label: `Votes, ${counted.year}`, kind: "int" },
          { key: "share", label: "Share", kind: "bar" },
          ...(sim ? [{ key: "first", label: "Came first, of the runs", kind: "pct" }] : []),
        ],
        rows: counted.votes.map((entry, index) => ({
          key: `${entry.party}-${index}`,
          rank: index + 1,
          name: entry.party === "OTH" ? "Other candidates" : entry.name ?? "—",
          party: entry.party === "OTH" ? "—" : entry.party,
          votes: entry.votes,
          share: counted.total ? (entry.votes / counted.total) * 100 : null,
          first: sim?.parties.find((party) => party.id === entry.party)?.win ?? null,
        })),
        total: counted.votes.length,
        read: counted.votes.length,
        tiles: [],
        facts: { kind: "seat-field" },
      }
    : null;

  const placeSection = {
    level: "lga",
    title: `${ground.name}: where the voters are registered${goal !== null ? `, and each local government's part of the ${fmtInt(goal)}` : ""}`,
    provenance: "ground",
    columns: [
      { key: "rank", label: "#", kind: "int" },
      { key: "name", label: "Local government", kind: "text", main: true },
      { key: "registered", label: "Registered", kind: "int" },
      { key: "part", label: "Part of the register", kind: "pct" },
      { key: "booths", label: "Polling units", kind: "int" },
      ...(goal !== null ? [{ key: "goal", label: "Vote goal", kind: "int" }] : []),
    ],
    rows: placeRows,
    total: placeRows.length,
    read: placeRows.length,
    tiles: [],
    facts: { kind: "seat-places" },
  };

  const wardSection = {
    level: "ward",
    title: `Wards of ${ground.name}, biggest register first`,
    provenance: "ground",
    columns: [
      { key: "rank", label: "#", kind: "int" },
      { key: "name", label: "Ward", kind: "text", main: true },
      { key: "lga", label: "Local government", kind: "text" },
      { key: "registered", label: "Registered", kind: "int" },
      { key: "booths", label: "Polling units", kind: "int" },
      ...(goal !== null ? [{ key: "goal", label: "Vote goal", kind: "int" }] : []),
    ],
    rows: wardRows,
    total: wardRows.length,
    read: wardRows.length,
    tiles: [],
    facts: { kind: "seat-wards" },
  };

  const operation = [
    { key: "units", name: "Polling units to cover on the day", number: booths, note: "One agent at each" },
    { key: "wards", name: "Wards", number: wardRows.length, note: "One supervisor each" },
    { key: "lgas", name: "Local governments", number: placeRows.length, note: "One coordinator each" },
    { key: "registered", name: "Registered voters", number: registered, note: "The 2023 register" },
    ...(expected !== null ? [{ key: "expected", name: "Expected to vote", number: expected, note: `The average of the ${what} elections of ${recent.map((election) => election.year).join(", ")} here` }] : []),
    ...(goal !== null
      ? [
          { key: "goal", name: "Vote goal", number: goal, note: `From the turnout of this seat's own ${what} elections` },
          ...(booths ? [{ key: "per", name: "Votes to find at each polling unit", number: Math.ceil(goal / booths), note: "The goal, divided by the polling units" }] : []),
        ]
      : []),
  ];
  const operationSection = {
    level: "lga",
    title: `What the plan asks of the ground in ${ground.name}`,
    provenance: "ground",
    columns: [
      { key: "name", label: "On the ground", kind: "text", main: true },
      { key: "number", label: "Number", kind: "int" },
      { key: "note", label: "What it means", kind: "text" },
    ],
    rows: operation,
    total: operation.length,
    read: operation.length,
    tiles: [],
    facts: { kind: "seat-operation" },
  };

  return {
    sections: [historySection, fieldSection, placeSection, wardSection, units?.section ?? null, turnoutAll.section, plan.intent === "predict" ? null : operationSection].filter(Boolean),
    notes,
    facts,
  };
}
