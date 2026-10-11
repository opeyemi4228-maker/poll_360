import { holdersOf, lastResultFor } from "../seats.js";
import { resolveTerritory } from "../constituencies.js";
import { nameOf, partyIn, stateByCode } from "./ground.js";
import { BEFORE, FIELD_YEARS, LATEST, fieldOf, lgaField, partyLine, stateField, wardField } from "./field.js";
import { BASIS, simulate } from "./simulate.js";
import { CONTESTS } from "./seat-names.js";
import { fmtInt, fmtPct } from "./format.js";
import { turnoutRecord, unitFocus } from "./focus.js";

/**
 * Winning a contest on any ground, for anybody: the number it takes, who
 * stands where, how the same contest comes out run ten thousand times, and
 * the places to work in the order to work them.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE ANSWER, ABOUT ONE GROUND
 *
 *  "How can I win my senatorial district" is a question about that district.
 *  Everything this returns — the register, the field, the simulation, the
 *  local governments, the wards, the history — is read inside it and nothing
 *  is read outside it. A question about Kano Central never prints a figure
 *  for Kano State, let alone the country.
 *
 *  It is asked by, and of, anybody:
 *
 *    A NAMED PARTY OR CANDIDATE   the plan is theirs: where they stand, how
 *                                 far behind or ahead, what closes it.
 *    NOBODY NAMED ("how do I      the plan is for whoever is asking: the
 *    win", "who will win")        number that wins here and where it is.
 *
 *  ── THE VOTE THIS IS BUILT ON, SAID ONCE AND EVERYWHERE ─────────────────
 *  The presidential vote, 1999 to 2023 — the only vote on record party by
 *  party for every place in the country. A senate or House seat is fought by
 *  other people and can go another way; where Poll360 holds the seat's own
 *  last result or its holder (lib/seats.js) that is printed beside it, and
 *  where it does not, the answer says the seat's own figures are not held.
 * ══════════════════════════════════════════════════════════════════════════
 */

const ROLE = {
  base: { status: "held", label: "Base — hold" },
  defend: { status: "cleared", label: "Defend" },
  contest: { status: "reach", label: "Contest" },
  build: { status: "beyond", label: "Build" },
  close: { status: "reach", label: "Close" },
  settled: { status: "beyond", label: "One-sided" },
};

const median = (list) => {
  const sorted = list.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** The rule a contest is decided by, and the sentence that says it. */
function ruleOf(contest, ground) {
  if (contest === "PRESIDENTIAL" && ground.national) {
    return { id: "president", words: "the most votes, and at least 25% of the vote in 24 of the 36 states (Section 134)" };
  }
  if (contest === "GOVERNORSHIP" && ground.wholeState) {
    return { id: "governor", words: "the most votes, and at least 25% of the vote in two-thirds of the state's local governments (Section 179)" };
  }
  if (contest === "LGA") return { id: "plurality", words: "the most votes, under the state's own electoral law" };
  return { id: "plurality", words: "the most votes — there is no second test" };
}

/** Who holds the seat today and what its own last election said, where Poll360 holds either. */
function seatRecord(contest, ground) {
  if (!contest || !CONTESTS[contest]) return { holders: [], last: null };
  let territory = null;
  if (ground.national) territory = { level: "NATION", key: null };
  else if (ground.seat) territory = resolveTerritory({ level: ground.seat.race === "SENATE" ? "SENATORIAL" : "FEDERAL", key: ground.seat.key });
  else if (ground.wholeState) territory = resolveTerritory({ level: "STATE", key: stateByCode(ground.states[0])?.number });
  else if (ground.lgas?.length === 1) territory = resolveTerritory({ level: "LGA", key: ground.lgas[0] });
  if (!territory) return { holders: [], last: null };
  try {
    const holders = holdersOf({ race: contest, territory }) ?? [];
    const last = contest === "PRESIDENTIAL" ? null : lastResultFor({ race: contest, territory });
    return { holders, last };
  } catch {
    return { holders: [], last: null };
  }
}

/**
 * @param {object} args
 * @param {object} args.plan     The validated plan: intent, scenario, limit.
 * @param {object|null} args.who The subject, or null where nobody was named.
 * @param {object} args.scope    The engine's scope: states, lgas, name, national.
 * @param {string|null} args.contest
 * @param {object|null} args.seat
 * @returns {Promise<{ sections: object[], notes: string[], facts: object }>}
 */
export async function winSections({ plan, who, scope, contest = null, seat = null }) {
  const notes = [];
  const ground = {
    states: scope.states,
    lgas: scope.lgas,
    national: Boolean(scope.national),
    wholeState: !scope.lgas && scope.states?.length === 1,
    seat,
    name: scope.name,
  };
  const field = fieldOf(ground);
  const latest = field.by[LATEST];
  if (!latest) return { sections: [], notes: [`Poll360 holds no ${LATEST} vote for ${ground.name}.`], facts: null };

  /* One state is read by its local governments, the way a district is: a
     plan for a governorship that listed one row, the state, would be no plan. */
  const level = ground.lgas || ground.wholeState ? "lga" : "state";
  const provenance = level === "lga" ? "estimated" : "counted";
  const rule = ruleOf(contest, ground);
  const office = contest ? CONTESTS[contest] : null;
  const scenario = plan.scenario ?? null;
  const shift = scenario?.swing ?? {};
  const turnoutBy = scenario?.turnout ?? 1;

  /* ── WHO THE PLAN IS FOR ──────────────────────────────────────────────
     A party is read as itself. A candidate is read as the party they stood
     for in the last election — and where they did not stand in it, as the
     party of their last run, said out loud. */
  let subject = null;
  if (who) {
    let id = partyIn(who, LATEST)?.id ?? null;
    if (!id && who.kind === "candidate") {
      const lastRun = [...FIELD_YEARS].reverse().map((year) => partyIn(who, year)).find(Boolean);
      if (lastRun) {
        id = lastRun.id;
        notes.push(`${nameOf(who, { long: true })} did not stand in ${LATEST}, so the ${id} — the party of that candidate's last run — is read in ${ground.name}.`);
      }
    }
    if (!id && who.kind === "party") id = who.id;
    if (id) {
      const mine = latest.parties.find((party) => party.id === id && party.id !== "OTH") ?? null;
      subject = {
        id,
        short: who.kind === "candidate" && partyIn(who, LATEST) ? nameOf(who) : `the ${id}`,
        long: who.kind === "candidate" && partyIn(who, LATEST) ? nameOf(who, { long: true }) : `the ${id}`,
        measured: Boolean(mine),
        votes: mine?.votes ?? 0,
        share: mine?.share ?? null,
      };
      if (!mine) {
        notes.push(
          `The ${id} has no ${LATEST} presidential vote of its own on record here — it sits inside "other parties" — so this is the plan for a party starting from the number that wins rather than from a vote it already holds.`
        );
      }
    }
  }

  /* ── THE NUMBER THAT WINS ─────────────────────────────────────────────── */
  const leader = latest.leader;
  const second = latest.second;
  const expected = Math.round(field.cast * turnoutBy);
  const beat = Math.round(leader.votes * turnoutBy) + 1;
  const half = Math.floor(expected / 2) + 1;
  /* A tenth above what led last time. Not half the vote: votes found among
     people who stayed at home leave the leader's own vote where it was, so
     the only number that is safe to aim at is one clear of it. */
  /* The goal follows the ground's own turnout: the votes cast there in the
     last three elections on record, times the share that led in them — and
     never less than what beat the last one. */
  const recentYears = FIELD_YEARS.filter((year) => field.by[year]).slice(-3);
  const turnoutExpected = Math.round((recentYears.reduce((sum, year) => sum + field.by[year].total, 0) / recentYears.length) * turnoutBy);
  const winShare = recentYears.reduce((sum, year) => sum + field.by[year].leader.share, 0) / recentYears.length;
  const byTurnout = Math.ceil((turnoutExpected * winShare) / 100);
  const goal = Math.max(beat, byTurnout);
  const goalWhy = `From this ground's turnout in ${recentYears.join(", ")}`;
  const winnerShares = FIELD_YEARS.map((year) => field.by[year]?.leader?.share ?? null);

  const ids = latest.parties.filter((party) => party.id !== "OTH").map((party) => party.id);
  const isLeader = subject?.measured && subject.id === leader.id;
  if (subject) {
    const rank = latest.parties.findIndex((party) => party.id === subject.id);
    subject.rank = subject.measured ? rank + 1 : null;
    subject.leader = Boolean(isLeader);
    subject.behind = isLeader ? 0 : leader.votes - subject.votes;
    subject.ahead = isLeader && second ? leader.votes - second.votes : 0;
    subject.lead = subject.measured ? subject.share - (isLeader ? second?.share ?? 0 : leader.share) : null;
    subject.sharePrev = field.by[BEFORE]?.parties.find((party) => party.id === subject.id && party.id !== "OTH")?.share ?? null;
    subject.change = subject.measured && subject.sharePrev !== null ? subject.share - subject.sharePrev : null;
    subject.goal = goal;
    subject.gap = Math.max(0, goal - Math.round(subject.votes * turnoutBy));
    /* Two ways to close a gap, and they are different sums. Votes taken from
       the leader count twice — one off theirs, one on yours — so it takes
       half as many. Votes from people who stayed at home count once. */
    subject.fromLeader = isLeader ? 0 : Math.floor(subject.behind / 2) + 1;
    subject.fromHome = isLeader ? 0 : subject.behind + 1;
    subject.swing = subject.measured && !isLeader ? (leader.share - subject.share) / 2 : null;
  }

  /* ── THE PLACES ───────────────────────────────────────────────────────── */
  const places = level === "lga" ? lgaField(ground) : stateField(ground);
  const stayedAll = places.reduce((sum, row) => sum + (row.stayed ?? 0), 0);
  const castAll = places.reduce((sum, row) => sum + (row.cast ?? 0), 0);

  const placeRows = places
    .map((row) => {
      const share = subject?.measured ? row.shares[subject.id] ?? 0 : null;
      const votes = subject?.measured ? row.votes[subject.id] ?? 0 : null;
      const best = subject?.measured
        ? Math.max(0, ...Object.entries(row.shares).filter(([id]) => id !== subject.id && id !== "OTH").map(([, value]) => value))
        : null;
      const lead = share !== null ? share - best : null;
      const role = subject?.measured
        ? lead > 0
          ? lead >= 10
            ? "base"
            : "defend"
          : lead > -15
            ? "contest"
            : "build"
        : (row.margin ?? 100) < 10
          ? "close"
          : "settled";
      /* The vote goal, shared out. For a party with a vote here: what it has,
         plus its part of the gap in proportion to the voters who stayed at
         home in each place — the largest pool there is. For anybody else:
         the goal, in proportion to where the vote is cast. */
      const target = subject?.measured
        ? Math.round((votes ?? 0) * turnoutBy + (stayedAll ? (subject.gap * (row.stayed ?? 0)) / stayedAll : 0))
        : Math.round(castAll ? (goal * (row.cast ?? 0)) / castAll : 0);
      return {
        key: row.key,
        code: row.code,
        name: row.name,
        state: row.state,
        stateCode: row.stateCode,
        zone: row.zone,
        lga: row.lga ?? null,
        lgaKey: row.lgaKey ?? null,
        level: row.level,
        registered: row.registered,
        booths: row.booths,
        cast: row.cast,
        turnout: row.turnout,
        stayed: row.stayed,
        leader: row.leader,
        leader_share: row.leader_share,
        second: row.second ?? "—",
        margin: row.margin,
        share,
        share_prev: subject?.measured ? row.sharesBefore[subject.id] ?? null : null,
        votes,
        lead,
        behind: subject?.measured && lead < 0 ? Math.max(0, (row.leader_votes ?? 0) - (votes ?? 0)) : 0,
        goal: target,
        need: subject?.measured ? Math.max(0, target - Math.round((votes ?? 0) * turnoutBy)) : target,
        role,
        status: ROLE[role].status,
        status_label: ROLE[role].label,
        was: row.leaderBefore,
      };
    })
    .sort((a, b) => b.need - a.need || (b.registered ?? 0) - (a.registered ?? 0))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  /* ── THE SAME CONTEST, TEN THOUSAND TIMES ─────────────────────────────── */
  const byState = new Map();
  if (level === "lga") {
    for (const row of places) {
      if (!row.cast) continue;
      if (!byState.has(row.stateCode)) byState.set(row.stateCode, { code: row.stateCode, places: [] });
      byState.get(row.stateCode).places.push({ key: row.key, cast: row.cast, shares: row.shares });
    }
  } else {
    for (const row of places) {
      if (!row.cast) continue;
      byState.set(row.stateCode, { code: row.stateCode, places: [{ key: row.key, cast: row.cast, shares: row.shares }] });
    }
  }
  const sim = simulate({
    states: [...byState.values()],
    ids,
    rule: rule.id,
    shift,
    seed: `${contest ?? "ground"}|${(ground.states ?? ["NG"]).join(",")}|${(ground.lgas ?? []).join(",")}`,
  });
  const simOf = (id) => sim.parties.find((party) => party.id === id) ?? null;
  if (subject?.measured) subject.sim = simOf(subject.id);

  /* ── THE FIELD ────────────────────────────────────────────────────────── */
  const before = field.by[BEFORE];
  const fieldRows = latest.parties.map((party, index) => {
    const run = simOf(party.id);
    const prev = party.id === "OTH" ? null : before?.parties.find((entry) => entry.id === party.id && entry.id !== "OTH")?.share ?? null;
    return {
      key: party.id,
      rank: index + 1,
      name: partyLine(LATEST, party.id),
      party: party.id,
      votes: party.votes,
      share: party.share,
      share_prev: prev,
      change: prev !== null ? party.share - prev : null,
      first: run?.win ?? null,
      range: run ? `${fmtPct(run.low, 0)} to ${fmtPct(run.high, 0)}` : "—",
      status: !run ? "beyond" : run.win >= 50 ? "held" : run.win >= 20 ? "reach" : "beyond",
      status_label: !run ? "Not run" : run.win >= 50 ? "Favoured" : run.win >= 20 ? "In it" : "Outside chance",
      mine: Boolean(subject && subject.id === party.id),
    };
  });

  /* ── THE WARDS, WHERE THE GROUND IS SMALL ENOUGH TO WALK ──────────────── */
  let wardRows = [];
  if (!ground.national && (ground.lgas || ground.wholeState)) {
    const wards = await wardField(ground);
    wardRows = wards
      .map((row) => {
        const share = subject?.measured ? row.shares[subject.id] ?? 0 : row.leader_share ?? 0;
        const best = subject?.measured
          ? Math.max(0, ...Object.entries(row.shares).filter(([id]) => id !== subject.id && id !== "OTH").map(([, value]) => value))
          : null;
        return {
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
          turnout: row.turnout,
          stayed: row.stayed,
          leader: row.leader ?? "—",
          leader_share: row.leader_share,
          share: subject?.measured ? share : null,
          lead: subject?.measured ? share - best : null,
          margin: row.margin,
          /* What ten more points of turnout is worth here, if the new voters
             split the way the ward did. For nobody in particular, it is the
             whole of those ten points. */
          gain: Math.round((row.registered ?? 0) * 0.1 * (subject?.measured ? share / 100 : 1)),
        };
      })
      .sort((a, b) => b.gain - a.gain || (b.registered ?? 0) - (a.registered ?? 0))
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  /* ── HOW THIS GROUND HAS VOTED ────────────────────────────────────────── */
  const history = [...FIELD_YEARS]
    .reverse()
    .map((year) => {
      const read = field.by[year];
      if (!read) return null;
      const mine = subject ? read.parties.find((party) => party.id === subject.id && party.id !== "OTH") ?? null : null;
      return {
        key: String(year),
        name: String(year),
        year,
        leader: partyLine(year, read.leader.id),
        leader_id: read.leader.id,
        leader_share: read.leader.share,
        second: read.second ? read.second.id : "—",
        second_share: read.second?.share ?? null,
        margin: read.margin,
        cast: read.total,
        share: mine?.share ?? null,
      };
    })
    .filter(Boolean);
  const ledBy = {};
  for (const row of history) ledBy[row.leader_id] = (ledBy[row.leader_id] ?? 0) + 1;
  let changed = 0;
  for (let i = 1; i < history.length; i += 1) if (history[i].leader_id !== history[i - 1].leader_id) changed += 1;

  const units = await unitFocus(ground, { goal, registered: field.registered });
  const turnoutAll = turnoutRecord(ground, field.registered);

  const record = seatRecord(contest, ground);
  const holder = record.holders.length === 1 ? record.holders[0] : null;
  if (seat?.shared) {
    notes.push(`${seat.name} shares its local government with another constituency. Poll360 cannot split a local government, so every figure here is the whole of it.`);
  }

  const wardCount = wardRows.length || null;
  const many = level === "lga" ? "local governments" : "states";
  const placeTitle = level === "lga" ? "Local government" : "State";
  const who2023 = subject?.measured ? subject.short : null;

  const facts = {
    kind: "win",
    intent: plan.intent,
    ground: ground.name,
    national: ground.national,
    level,
    counted: field.counted,
    contest: contest ?? null,
    office: office?.office ?? null,
    seat: office?.seat ?? null,
    seatName: seat?.name ?? null,
    rule: rule.id,
    ruleWords: rule.words,
    year: LATEST,
    before: BEFORE,
    registered: field.registered,
    cast: field.cast,
    turnout: field.turnout,
    stayed: Math.max(0, field.registered - field.cast),
    booths: field.booths,
    lgas: field.lgas,
    wards: wardCount,
    states: ground.national ? 37 : ground.states?.length ?? null,
    expected,
    beat,
    half,
    goal,
    turnoutPast: { elections: recentYears.map((year) => ({ year, cast: field.by[year].total })), expected: turnoutExpected, winShare, byTurnout, floored: byTurnout < beat },
    perBooth: field.booths ? Math.ceil(goal / field.booths) : null,
    typicalWinner: median(winnerShares),
    leader: { id: leader.id, candidate: leader.candidate, votes: leader.votes, share: leader.share },
    second: second ? { id: second.id, candidate: second.candidate, votes: second.votes, share: second.share } : null,
    margin: latest.margin,
    marginVotes: second ? leader.votes - second.votes : leader.votes,
    parties: fieldRows.filter((row) => row.party !== "OTH").map((row) => ({ id: row.party, votes: row.votes, share: row.share, sharePrev: row.share_prev, first: row.first, range: row.range })),
    subject,
    sim: {
      runs: sim.runs,
      rule: sim.rule,
      quota: sim.quota,
      places: sim.places,
      undecided: sim.undecided,
      call: sim.call,
      favourite: sim.favourite ? { id: sim.favourite.id, win: sim.favourite.win, first: sim.favourite.first, median: sim.favourite.median, low: sim.favourite.low, high: sim.favourite.high } : null,
      challenger: sim.parties[1] ? { id: sim.parties[1].id, win: sim.parties[1].win } : null,
      parties: sim.parties.map((party) => ({ id: party.id, win: party.win, first: party.first, median: party.median, low: party.low, high: party.high, spread: party.spread })),
    },
    basis: BASIS,
    scenario: scenario ? { swing: shift, turnout: scenario.turnout ?? null } : null,
    history: history.map((row) => ({ year: row.year, leader: row.leader_id, share: row.leader_share, second: row.second, margin: row.margin, mine: row.share })),
    ledBy,
    changed,
    places: {
      many,
      n: placeRows.length,
      top: placeRows.slice(0, 5).map((row) => ({ name: row.name, need: row.need, goal: row.goal, stayed: row.stayed, leader: row.leader, share: row.share, turnout: row.turnout })),
      bases: placeRows.filter((row) => row.role === "base").map((row) => row.name),
      defend: placeRows.filter((row) => row.role === "defend").map((row) => row.name),
      contest: placeRows.filter((row) => row.role === "contest").map((row) => row.name),
      build: placeRows.filter((row) => row.role === "build").map((row) => row.name),
      close: placeRows.filter((row) => row.role === "close").map((row) => ({ name: row.name, margin: row.margin, leader: row.leader })),
      biggest: [...placeRows].sort((a, b) => (b.registered ?? 0) - (a.registered ?? 0)).slice(0, 3).map((row) => ({ name: row.name, registered: row.registered })),
      lowestTurnout: [...placeRows].filter((row) => row.turnout !== null).sort((a, b) => a.turnout - b.turnout).slice(0, 3).map((row) => ({ name: row.name, turnout: row.turnout, stayed: row.stayed })),
      ledBy: placeRows.reduce((acc, row) => ({ ...acc, [row.leader]: (acc[row.leader] ?? 0) + 1 }), {}),
    },
    focus: { units: units?.facts ?? null, turnout: turnoutAll.facts },
    wardsTop: wardRows.slice(0, 6).map((row) => ({ name: row.name, lga: row.lga, registered: row.registered, gain: row.gain, turnout: row.turnout, leader: row.leader })),
    /* The seat's own holder and last result, where Poll360 does not hold them. */
    noSeatRecord: Boolean(office && contest !== "PRESIDENTIAL" && !record.holders.length),
    holder: holder ? { office: holder.office, name: holder.holder, party: holder.party, wonAs: holder.wonAs ?? null, since: holder.since ?? null, note: holder.note ?? null } : null,
    holders: record.holders.length > 1 ? record.holders.map((entry) => ({ place: entry.place, name: entry.holder, party: entry.party })) : null,
    lastResult: record.last?.votes
      ? { candidate: record.last.candidate, party: record.last.party, votes: record.last.votes, total: record.last.total, on: record.last.votesOn }
      : null,
  };

  /* ══════════════════════════════════════════════════════════ the tables */

  const fieldSection = {
    level,
    title: `Who stands where in ${ground.name}: the ${LATEST} vote, and ${fmtInt(sim.runs)} runs of the next one`,
    provenance: "scenario",
    columns: [
      { key: "rank", label: "#", kind: "int" },
      { key: "name", label: "Party", kind: "text", main: true },
      { key: "status", label: "Standing", kind: "status" },
      { key: "votes", label: `Votes, ${LATEST}`, kind: "int" },
      { key: "share", label: `Share, ${LATEST}`, kind: "bar" },
      { key: "share_prev", label: `Share, ${BEFORE}`, kind: "pct" },
      { key: "change", label: "Change", kind: "pts" },
      { key: "first", label: rule.id === "plurality" ? "Came first, of the runs" : "Won outright, of the runs", kind: "pct" },
      { key: "range", label: "Share in the middle half of runs", kind: "text" },
    ],
    rows: fieldRows,
    total: fieldRows.length,
    read: fieldRows.length,
    tiles: [
      { label: "Registered voters", value: fmtInt(field.registered), sub: `${fmtInt(field.booths)} polling units` },
      { label: `Voted in ${LATEST}`, value: fmtInt(field.cast), sub: `${fmtPct(field.turnout)} turnout` },
      { label: "Votes to aim for", value: fmtInt(goal), sub: `${fmtInt(turnoutExpected)} expected to vote` },
      sim.favourite
        ? { label: "Came first most often", value: sim.favourite.id, sub: `${fmtPct(sim.favourite.win, 0)} of ${fmtInt(sim.runs)} runs`, tone: sim.favourite.win >= 65 ? "good" : "warn" }
        : null,
    ].filter(Boolean),
    facts,
  };

  const placeSection = {
    level,
    title: subject?.measured
      ? `${ground.name}'s ${many} for ${who2023}: where the ${fmtInt(goal)} votes come from`
      : `${ground.name}'s ${many}: where the ${fmtInt(goal)} votes are`,
    provenance,
    columns: [
      { key: "rank", label: "#", kind: "int" },
      { key: "name", label: placeTitle, kind: "text", main: true },
      ...(level === "lga" && (ground.states?.length ?? 2) > 1 ? [{ key: "state", label: "State", kind: "text" }] : []),
      { key: "status", label: subject?.measured ? "Role" : "Contest", kind: "status" },
      { key: "registered", label: "Registered", kind: "int" },
      { key: "turnout", label: "Turnout", kind: "pct" },
      { key: "stayed", label: "Did not vote", kind: "int" },
      { key: "leader", label: `Led by, ${LATEST}`, kind: "text" },
      { key: "leader_share", label: "Its share", kind: "pct" },
      ...(subject?.measured
        ? [
            { key: "share", label: `${subject.id} share`, kind: "bar" },
            { key: "behind", label: "Behind by", kind: "int" },
          ]
        : [{ key: "margin", label: "Margin", kind: "pts" }]),
      { key: "goal", label: "Vote goal", kind: "int" },
      ...(subject?.measured ? [{ key: "need", label: "Still to find", kind: "int" }] : []),
    ],
    rows: placeRows,
    total: placeRows.length,
    read: placeRows.length,
    tiles: [],
    facts: { kind: "win-places", level, subject: subject?.id ?? null, measured: Boolean(subject?.measured) },
  };

  const wardSection = wardRows.length
    ? {
        level: "ward",
        title: subject?.measured
          ? `Wards to work first for ${who2023}: where ten more points of turnout is worth most`
          : `Wards to work first: the biggest unused vote in ${ground.name}`,
        provenance: "estimated",
        columns: [
          { key: "rank", label: "#", kind: "int" },
          { key: "name", label: "Ward", kind: "text", main: true },
          { key: "lga", label: "Local government", kind: "text" },
          { key: "registered", label: "Registered", kind: "int" },
          { key: "booths", label: "Polling units", kind: "int" },
          { key: "turnout", label: "Turnout", kind: "pct" },
          { key: "stayed", label: "Did not vote", kind: "int" },
          { key: "leader", label: `Led by, ${LATEST}`, kind: "text" },
          ...(subject?.measured
            ? [
                { key: "share", label: `${subject.id} share`, kind: "bar" },
                { key: "lead", label: "Lead", kind: "pts" },
              ]
            : [{ key: "margin", label: "Margin", kind: "pts" }]),
          { key: "gain", label: "Votes in 10 points of turnout", kind: "int" },
        ],
        rows: wardRows,
        total: wardRows.length,
        read: wardRows.length,
        tiles: [],
        group: null,
        facts: { kind: "win-wards" },
      }
    : null;

  const historySection = {
    level,
    title: `How ${ground.name} has voted for President, ${FIELD_YEARS[0]} to ${LATEST}`,
    provenance,
    columns: [
      { key: "name", label: "Election", kind: "text", main: true },
      { key: "leader", label: "Led by", kind: "text" },
      { key: "leader_share", label: "Share", kind: "pct" },
      { key: "second", label: "Second", kind: "text" },
      { key: "second_share", label: "Its share", kind: "pct" },
      { key: "margin", label: "Margin", kind: "pts" },
      { key: "cast", label: "Votes cast", kind: "int" },
      ...(subject ? [{ key: "share", label: `${subject.id} share`, kind: "pct" }] : []),
    ],
    rows: history,
    total: history.length,
    read: history.length,
    tiles: [],
    facts: { kind: "win-history" },
  };

  const operation = [
    { key: "units", name: "Polling units to cover on the day", number: field.booths, note: "One agent at each" },
    ...(wardCount ? [{ key: "wards", name: "Wards", number: wardCount, note: "One supervisor each" }] : []),
    ...(level === "lga" ? [{ key: "lgas", name: "Local governments", number: field.lgas, note: "One coordinator each" }] : [{ key: "states", name: "States", number: placeRows.length, note: "One coordinator each" }]),
    { key: "registered", name: "Registered voters", number: field.registered, note: `${fmtInt(field.cast)} voted in ${LATEST}` },
    { key: "stayed", name: "Registered and did not vote", number: Math.max(0, field.registered - field.cast), note: "The largest pool on this ground" },
    { key: "goal", name: "Vote goal", number: goal, note: goalWhy },
    ...(field.booths ? [{ key: "per", name: "Votes to find at each polling unit", number: Math.ceil(goal / field.booths), note: "The goal, divided by the polling units" }] : []),
  ];
  const operationSection = {
    level,
    title: `What the plan asks of the ground in ${ground.name}`,
    provenance,
    columns: [
      { key: "name", label: "On the ground", kind: "text", main: true },
      { key: "number", label: "Number", kind: "int" },
      { key: "note", label: "What it means", kind: "text" },
    ],
    rows: operation,
    total: operation.length,
    read: operation.length,
    tiles: [],
    facts: { kind: "win-operation" },
  };

  return {
    sections: [fieldSection, placeSection, wardSection, units?.section ?? null, historySection, turnoutAll.section, operationSection].filter(Boolean),
    notes,
    facts,
  };
}
