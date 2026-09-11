import { HISTORY } from "./history.js";
import { states2023 } from "./election2023.js";
import { STATES } from "./units.js";
import { apportion } from "./drill.js";
import { UNITS as ANAMBRA_UNITS, META as ANAMBRA_META, SLOTS as ANAMBRA_SLOTS } from "./data/units-anambra-2023.js";

/**
 * Polling unit strongholds, and the line between what is counted and what is
 * drawn.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  READ THIS BEFORE TRUSTING A NUMBER OFF THIS MODULE
 *
 *  There is no published, machine-readable record of Nigerian presidential
 *  results at polling unit level. Not for 2007, not for 2011, not for 2015,
 *  2019 or 2023. INEC's IReV portal holds scans of the EC8A forms for 2023 —
 *  photographs of paper, one per unit — and nothing upstream of this product
 *  has read 176,846 of them into a table.
 *
 *  So this module does two different things and never blurs them:
 *
 *    COUNTED    Who carried each state, in each election that published state
 *               figures. 1999, 2003, 2015, 2019, 2023. Plus the national
 *               totals for 2007 and 2011, which published no state table.
 *               The geography is counted too — 8,809 wards and 176,623 units
 *               by their real names and codes, out of INEC's own delimitation.
 *
 *    MODELLED   Every vote figure below a state. The published state total is
 *               apportioned across that state's real wards and real units, so
 *               the parts always sum back to the figure INEC declared, the
 *               political character varies between places the way it does in
 *               life, and the same place always gets the same answer.
 *
 *  A modelled stronghold is a planning instrument. It says "this is the shape
 *  a state of this composition has", which is what a scenario needs and is
 *  worth having. It is not evidence about a named booth, and anything drawn
 *  from it must say so on the same screen — never in a footnote.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ══════════════════════════════════════════════════════════════════════════
   THE RECORD  —  counted
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Every presidential election in the record, with what it actually published.
 *
 * 2023 is folded in from its own module, because it arrived after `HISTORY`
 * was written and lives in the shape `states2023` gives it. Joined here rather
 * than at each call site, so no screen can draw six elections and forget the
 * seventh.
 */
export const ELECTIONS = (() => {
  const earlier = HISTORY.map((election) => ({
    year: election.year,
    parties: election.parties ?? [],
    national: election.national,
    /* Whether this election published a table by state. Two did not, and a
       screen that treats their absence as zero draws a different country. */
    stateLevel: Boolean(election.stateLevel),
    rows: election.rows ?? [],
    registered: election.electorate ?? election.registered ?? null,
  }));

  /* ── 2023 ARRIVES POSITIONAL, AND IS KEYED HERE ────────────────────────
     `states2023` stores each state's votes as an array in slot order, not as
     an object keyed by party — the board that reads it works by position. Every
     other election in this record is keyed by party id, and a module that
     handed both shapes to its callers would make every one of them handle two.

     The order below is the file's own and is load-bearing: APC, PDP, LP, NNPP,
     then the bucket. Getting it wrong does not throw, it silently credits one
     candidate with another's votes, so it is stated once, here, beside the
     names it maps to. */
  const SLOTS_2023 = ["APC", "PDP", "LP", "NNPP", "OTH"];
  const keyed = (votes) =>
    Array.isArray(votes)
      ? Object.fromEntries(SLOTS_2023.map((party, index) => [party, votes[index] ?? 0]))
      : votes;

  const votes2023 = {};
  let registered2023 = 0;
  for (const row of states2023) {
    registered2023 += row.registered;
    for (const [party, count] of Object.entries(keyed(row.votes))) {
      votes2023[party] = (votes2023[party] ?? 0) + count;
    }
  }

  return [
    ...earlier,
    {
      year: 2023,
      parties: [
        { id: "APC", name: "All Progressives Congress", candidate: "Bola Ahmed Tinubu" },
        { id: "PDP", name: "Peoples Democratic Party", candidate: "Atiku Abubakar" },
        { id: "LP", name: "Labour Party", candidate: "Peter Obi" },
        { id: "NNPP", name: "New Nigeria Peoples Party", candidate: "Rabiu Kwankwaso" },
        { id: "OTH", name: "Other parties", candidate: "Fourteen other candidates" },
      ],
      national: votes2023,
      stateLevel: true,
      rows: states2023.map((row) => ({
        code: row.code,
        votes: keyed(row.votes),
        total: row.total,
        registered: row.registered,
        /* INEC's own polling unit count for the state. Counted, and the one
           number that makes a per-unit model worth anything. */
        booths: row.booths,
      })),
      registered: registered2023,
    },
  ].sort((a, b) => a.year - b.year);
})();

/** The elections a map by state can be drawn for. */
export const MAPPABLE = ELECTIONS.filter((election) => election.stateLevel);

/** The elections that published a national total and no state table. */
export const NATIONAL_ONLY = ELECTIONS.filter((election) => !election.stateLevel);

export const electionOf = (year) => ELECTIONS.find((election) => election.year === year) ?? null;

/* ══════════════════════════════════════════════════════════════════════════
   WHO WAS ACTUALLY ON THE BALLOT  —  counted
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Every election a named candidate contested, and the party they carried.
 *
 * ── WHY THIS IS NOT "THE PDP SINCE 2007" ───────────────────────────────────
 * A question about a person is not a question about a party, and on this
 * record the two come apart badly. Atiku Abubakar has been on the presidential
 * ballot three times — 2007, 2019 and 2023 — and in 2007 he carried the Action
 * Congress against a PDP that won. Reading his record off the PDP's column
 * would credit him with Yar'Adua's 2007 and Jonathan's 2011 and 2015, three
 * elections he either ran against or did not run in.
 *
 * So a candidate's runs are read off the ballot, which is the only thing that
 * actually decides them.
 */
export function runsOf(candidate) {
  const wanted = String(candidate ?? "").trim().toLowerCase();
  if (!wanted) return [];

  const runs = [];
  for (const election of ELECTIONS) {
    const party = election.parties.find(
      (entry) => String(entry.candidate ?? "").trim().toLowerCase() === wanted
    );
    if (!party) continue;

    runs.push({
      year: election.year,
      party: party.id,
      partyName: party.name,
      votes: election.national?.[party.id] ?? null,
      /* Whether this run can be drawn on a map at all. Two of the seven
         elections published no state table, and a candidate whose run falls in
         one of them has a national figure and nothing below it. */
      mappable: election.stateLevel,
    });
  }
  return runs;
}

/** Everybody who has been on a presidential ballot in this record. */
export const CANDIDATES = (() => {
  const seen = new Map();
  for (const election of ELECTIONS) {
    for (const party of election.parties) {
      if (!party.candidate || party.id === "OTH") continue;
      if (!seen.has(party.candidate)) seen.set(party.candidate, []);
      seen.get(party.candidate).push({ year: election.year, party: party.id });
    }
  }
  return [...seen.entries()]
    .map(([name, runs]) => ({ name, runs: runs.length, years: runs.map((run) => run.year) }))
    .sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name));
})();

/* ══════════════════════════════════════════════════════════════════════════
   WHAT A STATE HAS DONE  —  counted
   ══════════════════════════════════════════════════════════════════════════ */

const CODE_TO_NUMBER = new Map(STATES.filter((s) => s.code).map((s) => [s.code, s.number]));
const NUMBER_TO_STATE = new Map(STATES.map((s) => [s.number, s]));
const CODE_TO_STATE = new Map(STATES.filter((s) => s.code).map((s) => [s.code, s]));

export const stateOf = (code) => CODE_TO_STATE.get(code) ?? null;
export const stateByNumber = (number) => NUMBER_TO_STATE.get(number) ?? null;
export const numberOf = (code) => CODE_TO_NUMBER.get(code) ?? null;

/** Everyone but the bucket, biggest first. "Other parties" is not a winner. */
function ranked(votes) {
  return Object.entries(votes ?? {})
    .filter(([id]) => id !== "OTH")
    .map(([id, count]) => ({ id, votes: count }))
    .sort((a, b) => b.votes - a.votes);
}

/**
 * One state, across every election that published a table.
 *
 * `gap` is the winner's margin over the runner-up in points of the valid vote.
 * Null where there was only one contender, which happens in this record: 1999
 * carried two parties and a state where one of them polled nothing has no
 * runner-up to be ahead of.
 */
export function stateSeries(code) {
  const rows = [];

  for (const election of MAPPABLE) {
    const row = election.rows.find((entry) => entry.code === code);
    if (!row) continue;

    const order = ranked(row.votes);
    const total = row.total ?? Object.values(row.votes).reduce((sum, n) => sum + n, 0);
    const winner = order[0] ?? null;
    const second = order[1] ?? null;

    rows.push({
      year: election.year,
      winner: winner?.id ?? null,
      winnerVotes: winner?.votes ?? 0,
      runnerUp: second?.id ?? null,
      total,
      registered: row.registered ?? null,
      booths: row.booths ?? null,
      shares: Object.fromEntries(
        Object.entries(row.votes).map(([party, count]) => [
          party,
          total > 0 ? (count / total) * 100 : 0,
        ])
      ),
      votes: row.votes,
      gap:
        winner && second && total > 0 ? ((winner.votes - second.votes) / total) * 100 : null,
      turnout: row.registered > 0 ? (total / row.registered) * 100 : null,
    });
  }

  return rows;
}

/**
 * How often a candidate carried a state, across their own runs.
 *
 * ── ONLY THEIR OWN RUNS, AND ONLY THE MAPPABLE ONES ───────────────────────
 * Returned as "N of M", where M is how many of that candidate's runs this
 * state can actually be checked for. Atiku has three runs and 2007 published
 * no state table, so for every state M is two and not three. A screen that
 * printed "1 of 3" would be reporting a loss in an election nobody can read.
 *
 * `streak` is consecutive carries up to and including their most recent
 * checkable run — the honest form of "has been winning it since", because a
 * state carried in 2019 and lost in 2023 is not a stronghold and a count alone
 * cannot tell those apart.
 */
export function carriedBy(code, candidate) {
  const runs = runsOf(candidate).filter((run) => run.mappable);
  const series = stateSeries(code);

  const checked = [];
  for (const run of runs) {
    const row = series.find((entry) => entry.year === run.year);
    if (!row) continue;
    checked.push({
      year: run.year,
      party: run.party,
      carried: row.winner === run.party,
      share: row.shares[run.party] ?? 0,
      gap: row.gap,
    });
  }

  let streak = 0;
  for (let index = checked.length - 1; index >= 0; index -= 1) {
    if (!checked[index].carried) break;
    streak += 1;
  }

  return {
    of: checked.length,
    carried: checked.filter((entry) => entry.carried).length,
    streak,
    /* True only when every checkable run was carried, and there was at least
       one to check. A state with nothing to check is not a stronghold; it is
       unknown, and those are different colours. */
    always: checked.length > 0 && checked.every((entry) => entry.carried),
    runs: checked,
    /* How many of the candidate's runs could not be checked here, so a caption
       can say so instead of implying the record is complete. */
    unreadable: runsOf(candidate).length - checked.length,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   BANDS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * How strongly a place went for one party.
 *
 * ── FIVE BANDS, BECAUSE A GRADIENT HIDES THE INTERESTING END ───────────────
 * The same lesson the party-spread map learned: a continuous ramp makes a
 * place at 51% and a place at 74% look like neighbours, and the difference
 * between those two is the difference between a seat worth defending and a
 * seat worth nothing to campaign in. The bands are named, the name is always
 * printed beside the colour, and `LOST` is its own band rather than the pale
 * end of a ramp.
 */
export const STRONGHOLD = [
  { id: "FORTRESS", from: 70, label: "Fortress", fill: "var(--color-ink-950)", tone: "70% and above" },
  { id: "STRONG", from: 55, label: "Strong", fill: "var(--color-ink-700)", tone: "55 to 70%" },
  { id: "HELD", from: 45, label: "Held", fill: "var(--color-ink-400)", tone: "45 to 55%" },
  { id: "THIN", from: 30, label: "Thin", fill: "var(--color-ink-200)", tone: "30 to 45%" },
  { id: "LOST", from: 0, label: "Lost", fill: "var(--color-ink-050)", tone: "under 30%" },
];

export function bandOf(share) {
  if (!Number.isFinite(share)) return null;
  return STRONGHOLD.find((band) => share >= band.from) ?? STRONGHOLD.at(-1);
}

/* ══════════════════════════════════════════════════════════════════════════
   THE MODEL  —  real places, drawn figures
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Flatten a state's geography file into wards and units.
 *
 * The tree comes from `public/geo/units/NN.json`, built out of INEC's own
 * delimitation codes. Every name and code below is counted; nothing in here
 * invents a place.
 */
export function wardsOf(book) {
  const wards = [];
  /* ── THE STATE NUMBER, NOT THE LETTER CODE ─────────────────────────────
     A geography file carries both: `state` is INEC's two digits and `code` is
     the three-letter one the boundary shapes use. The unit code this product
     joins on is built from the digits — 04/01/01/001 — and building it from
     "ANA" instead produces a key that looks perfectly well-formed and matches
     nothing. Which is exactly what it did: a counted result set for 3,679 real
     Anambra units joined zero of them until this line was fixed. */
  const number = book?.state ?? null;

  for (const lga of book?.lgas ?? []) {
    for (const ward of lga.wards ?? []) {
      wards.push({
        key: `${number}/${lga.n}/${ward.n}`,
        name: ward.name,
        lga: lga.name,
        lgaKey: `${number}/${lga.n}`,
        units: (ward.units ?? []).map((unit) => ({
          code: `${number}/${lga.n}/${ward.n}/${unit.n}`,
          name: unit.name,
          ward: ward.name,
          lga: lga.name,
        })),
      });
    }
  }
  return wards;
}

/**
 * Model one state's election down to its real polling units.
 *
 * ── THE TWO-STEP, AND WHY IT IS NOT ONE ────────────────────────────────────
 * State → wards, then ward → units. Apportioning straight from a state to
 * seven thousand units would give every unit in the state the same political
 * character with noise on top, because there would be no intermediate body for
 * a region to lean as a region. Going through the ward means a ward leans, and
 * its units lean with it — which is how a state actually looks, and the whole
 * reason a stronghold map has patches rather than static.
 *
 * Every level sums back to the figure INEC declared. That is `apportion`'s
 * guarantee and it is the property that makes the model usable: a modelled
 * ward total is wrong about that ward and right about the state.
 *
 * @param {object} args
 * @param {object} args.book   The state's geography file.
 * @param {number} args.year   Which election.
 * @param {string[]} [args.only] Limit to these LGA keys, for a drilled view.
 */
export function modelState({ book, year, only = null }) {
  const election = electionOf(year);
  if (!election?.stateLevel || !book) return null;

  /* Two codes again, for two different jobs: the election tables are keyed by
     the three-letter code, and the unit tree by the two digits. */
  const code = book.code ?? null;
  const row = election.rows.find((entry) => entry.code === code);
  if (!row) return null;

  const slots = election.parties.map((party) => party.id);
  const stateVotes = slots.map((party) => row.votes[party] ?? 0);

  let wards = wardsOf(book);
  if (only?.length) wards = wards.filter((ward) => only.includes(ward.lgaKey));
  if (wards.length === 0) return null;

  /* The state's own published figures, scaled to the slice being drawn. A
     drilled view of three local governments must not apportion the whole
     state's votes across them — it would show three LGAs casting a state's
     ballots. The slice is taken by unit share, which is the only counted
     denominator available below a state. */
  const allUnits = wardsOf(book).reduce((sum, ward) => sum + ward.units.length, 0);
  const sliceUnits = wards.reduce((sum, ward) => sum + ward.units.length, 0);
  const fraction = allUnits > 0 ? sliceUnits / allUnits : 1;

  const scaled = stateVotes.map((count) => Math.round(count * fraction));
  const scaledRegister = Math.round((row.registered ?? 0) * fraction);

  /* ── WARDS ─────────────────────────────────────────────────────────────
     Booths are the real per-ward unit counts, not a drawn number — which is
     the one thing this model has that the earlier LGA drill did not. */
  const wardRows = apportion({
    names: wards.map((ward) => ward.key),
    votes: scaled,
    booths: sliceUnits,
    registered: scaledRegister,
    parentKey: `${code}:${year}`,
  });

  /* `apportion` splits booths on its own weights; the real counts are known,
     so they are put back. The votes and register stay as apportioned. */
  const byKey = new Map(wards.map((ward) => [ward.key, ward]));
  for (const wardRow of wardRows) {
    wardRow.booths = byKey.get(wardRow.name)?.units.length ?? wardRow.booths;
  }

  return {
    code,
    year,
    slots,
    wards,
    wardRows,
    byKey,
    fraction,
    /* Which slot is the bucket, so no caller has to guess. -1 in 1999, which
       fielded two parties and no "other". */
    bucket: bucketOf(slots),
    /* Null for thirty-six states. Where it is present, every unit figure this
       model yields is a transcription rather than an apportionment, and the
       screen says so. */
    counted: countedUnitsOf(book.state, year),
  };
}

/**
 * The units of one ward, modelled.
 *
 * Split out because a state has thousands of units and a screen draws one
 * ward's worth at a time. Called with a ward row from `modelState`, so the
 * units sum back to that ward and therefore to the state.
 */
export function unitsOfWard({ model, wardKey }) {
  if (!model) return [];
  const ward = model.byKey.get(wardKey);
  const wardRow = model.wardRows.find((row) => row.name === wardKey);
  if (!ward || !wardRow || ward.units.length === 0) return [];

  /* ── COUNTED BEATS MODELLED, UNIT BY UNIT ──────────────────────────────
     Where a transcription exists the real figure is used, and where it does
     not the unit comes back with `counted: false` and no votes at all rather
     than a modelled figure standing in beside a real one. Mixing the two in a
     single ward would make a total nobody could describe: part transcription,
     part apportionment, presented as one number.

     So a ward in a counted state is counted throughout, and its un-transcribed
     booths are drawn as unknown. That is what they are. */
  const counted = model.counted;
  if (counted) {
    return ward.units.map((unit) => {
      const row = counted.units.get(unit.code);
      return row
        ? { ...row, booths: 1, label: unit.name, ward: ward.name, lga: ward.lga }
        : {
            code: unit.code,
            label: unit.name,
            ward: ward.name,
            lga: ward.lga,
            booths: 1,
            registered: null,
            votes: model.slots.map(() => 0),
            total: null,
            counted: false,
            /* Said in words rather than left as a null for a screen to guess
               at. "No sheet was published for this booth" and "this booth
               cast no votes" are different facts. */
            why: "No result sheet was published for this booth, or it could not be read.",
          };
    });
  }

  const rows = apportion({
    names: ward.units.map((unit) => unit.code),
    votes: wardRow.votes,
    booths: ward.units.length,
    registered: wardRow.registered,
    parentKey: `${wardKey}:${model.year}`,
  });

  return rows.map((row, index) => ({
    ...row,
    booths: 1,
    code: ward.units[index].code,
    label: ward.units[index].name,
    ward: ward.name,
    lga: ward.lga,
    counted: false,
  }));
}

/* ══════════════════════════════════════════════════════════════════════════
   COUNTED UNITS  —  the few places where the real figures exist
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Transcribed polling unit results, by state number and year.
 *
 * ── ONE STATE, AND THAT IS NOT AN OVERSIGHT ────────────────────────────────
 * This is everything there is. INEC published 167,443 photographs of Form EC8A
 * for 2023 and no table; the transcriptions that exist were made by individual
 * analysts, a state at a time. Anambra is the one with a complete enough
 * transcription to join — 3,679 of its 5,719 booths, every code matching
 * INEC's own delimitation.
 *
 * The registry is a map rather than an import so that adding the next state is
 * one line, and so that every screen asks the same question — "is this place
 * counted or drawn?" — instead of some of them knowing about Anambra.
 */
const COUNTED = new Map([
  [
    "04:2023",
    {
      meta: ANAMBRA_META,
      slots: ANAMBRA_SLOTS,
      rows: ANAMBRA_UNITS,
    },
  ],
]);

/** Which states hold counted unit figures, for a caption that names them. */
export const COUNTED_STATES = [...COUNTED.values()].map((entry) => ({
  state: entry.meta.state,
  code: entry.meta.code,
  name: entry.meta.name,
  year: entry.meta.year,
  units: entry.meta.units,
  unitsInState: entry.meta.unitsInState,
  coverage: (entry.meta.units / entry.meta.unitsInState) * 100,
}));

export const hasCountedUnits = (stateNumber, year) => COUNTED.has(`${stateNumber}:${year}`);

/**
 * The counted units of one state, keyed by unit code.
 *
 * Votes come back in this product's slot order, with the transcription's
 * parties mapped into it and the bucket left at zero — a transcription that
 * carries four parties genuinely does not know what the other candidates
 * polled, and inventing a bucket from the difference would turn a missing
 * figure into a fabricated one.
 */
export function countedUnitsOf(stateNumber, year) {
  const entry = COUNTED.get(`${stateNumber}:${year}`);
  if (!entry) return null;

  const election = electionOf(year);
  const slots = election?.parties.map((party) => party.id) ?? [];
  /* Where each transcribed party sits in this product's slot order. Built once
     rather than looked up per unit, and a party the election does not list is
     dropped rather than written into a slot it does not own. */
  const at = entry.slots.map((party) => slots.indexOf(party));

  const units = new Map();
  for (const row of entry.rows) {
    const [code, registered, accredited, ...counts] = row;
    const votes = slots.map(() => 0);
    counts.forEach((count, index) => {
      const slot = at[index];
      if (slot >= 0) votes[slot] = count;
    });

    units.set(code, {
      code,
      registered,
      accredited,
      votes,
      total: votes.reduce((sum, n) => sum + n, 0),
      /* The word every screen keys its banding off. Never inferred from the
         presence of a number — a modelled row has numbers too. */
      counted: true,
    });
  }

  return { units, meta: entry.meta, slots };
}

/* ══════════════════════════════════════════════════════════════════════════
   SCENARIOS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Move a party by so many points and see what changes hands.
 *
 * ── A SWING HAS TO COME FROM SOMEWHERE ─────────────────────────────────────
 * Adding points to one party and leaving the rest is not a scenario, it is an
 * arithmetic error: the shares stop summing to a hundred and every margin on
 * the screen is then wrong in the same direction. So the points a party gains
 * are taken off the others in proportion to what they hold, which is what a
 * uniform swing means and what a reader assumes they are being shown.
 *
 * `turnout` scales the whole place up or down. It moves no share on its own —
 * a place voting ten percent more heavily elects the same person — and it is
 * here because it changes the *weight* of a place in any total built from
 * these rows, which is exactly what a planner is choosing between.
 *
 * @param {object[]} rows   Modelled rows carrying `votes` and `total`.
 * @param {object} args
 * @param {number} args.slot     Which slot swings.
 * @param {number} args.swing    Points, positive or negative.
 * @param {number} args.turnout  Percent change in votes cast.
 */
export function scenario(rows, { slot, swing = 0, turnout = 0, bucket } = {}) {
  const factor = 1 + turnout / 100;

  return rows.map((row) => {
    const cast = row.total ?? row.votes.reduce((sum, n) => sum + n, 0);
    if (cast <= 0) return { ...row, votes: [...row.votes], total: 0, moved: false };

    const shares = row.votes.map((count) => (count / cast) * 100);
    const mine = shares[slot] ?? 0;

    /* Clamped at both ends. A swing that would take a party below nothing or
       above everything is not a scenario a screen should draw, and silently
       producing a negative vote is worse than refusing the last point. */
    const after = Math.min(100, Math.max(0, mine + swing));
    const delta = after - mine;

    const others = shares.reduce((sum, share, index) => (index === slot ? sum : sum + share), 0);
    const next = shares.map((share, index) => {
      if (index === slot) return after;
      /* Taken off the others in proportion. When they hold nothing between
         them there is nothing to take, and the swing is capped by the clamp
         above rather than invented out of zero. */
      return others > 0 ? share - delta * (share / others) : share;
    });

    const seat = bucket ?? row.votes.length - 1;
    const before = winnerOf(row.votes, seat);
    const scaled = next.map((share) => Math.round((share / 100) * cast * factor));
    const now = winnerOf(scaled, seat);

    return {
      ...row,
      votes: scaled,
      total: scaled.reduce((sum, n) => sum + n, 0),
      /* Whether this place changed hands under the scenario. The single most
         useful column on a scenario screen, and the one a reader cannot work
         out by eye across seven thousand rows. */
      moved: before !== null && now !== null && before !== now,
      was: before,
    };
  });
}

/**
 * Where the "other parties" bucket sits in a slot list, or -1 if there is none.
 *
 * ── NOT "THE LAST ONE", WHICH IS THE BUG THIS EXISTS TO PREVENT ────────────
 * Every slot list in this product ends with the bucket — except 1999's, which
 * is two parties and no bucket at all: Obasanjo's PDP and Olu Falae's AD-APP.
 * A winner test that skips the last position skipped Falae, and the first run
 * of the national model duly reported the PDP carrying 176,598 of 176,623
 * booths. A hundred percent of a country in an election the PDP won with 62.8%
 * of the vote, and nothing anywhere errored.
 *
 * So the bucket is found by its name, and an election that does not have one
 * has every slot contested.
 */
export function bucketOf(slots) {
  return Array.isArray(slots) ? slots.indexOf("OTH") : -1;
}

/**
 * Which slot leads, ignoring the "other parties" bucket.
 *
 * `bucket` is the index to skip, or -1 to contest every slot. It defaults to
 * the last position because most callers hold a five-slot presidential array —
 * but a caller that knows its slot list should pass `bucketOf(slots)`, and
 * every caller in this module does.
 */
export function winnerOf(votes, bucket = votes.length - 1) {
  let best = null;
  let bestCount = -1;
  for (let index = 0; index < votes.length; index += 1) {
    if (index === bucket) continue;
    if (votes[index] > bestCount) {
      bestCount = votes[index];
      best = index;
    }
  }
  return bestCount > 0 ? best : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   TALLIES
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * How many of a set of places one slot carries, and how big they are.
 *
 * `share` is of the places counted, not of the country: a tally over one
 * drilled state must not read as a national figure.
 */
export function tally(rows, slot, bucket) {
  let won = 0;
  let votes = 0;
  let cast = 0;
  let moved = 0;

  for (const row of rows) {
    const winner = winnerOf(row.votes, bucket ?? row.votes.length - 1);
    if (winner === slot) won += 1;
    if (row.moved) moved += 1;
    votes += row.votes[slot] ?? 0;
    cast += row.total ?? 0;
  }

  return {
    places: rows.length,
    won,
    moved,
    votes,
    cast,
    share: rows.length ? (won / rows.length) * 100 : 0,
    voteShare: cast > 0 ? (votes / cast) * 100 : 0,
  };
}

/**
 * The biggest places in a set, by register.
 *
 * ── WHY "BIGGEST" IS A MODELLED WORD HERE ──────────────────────────────────
 * INEC publishes a register per state and a polling unit count per state. It
 * does not publish a register per unit. So a unit's size is the state's
 * register split across the state's units, varying the way `apportion` varies
 * it — which produces a realistic distribution and a ranking that is about the
 * distribution rather than about the named booth at the top of it.
 *
 * That is still worth having: how much of a state sits in its largest tenth of
 * units is a planning question, and the answer is a property of the
 * distribution. It is not a list of addresses to go to.
 */
export function biggest(rows, count = 100) {
  return [...rows].sort((a, b) => (b.registered ?? 0) - (a.registered ?? 0)).slice(0, count);
}

/**
 * What fraction of the vote sits in the largest places.
 *
 * The concentration figure a planner actually asks for: if the top n units
 * hold half the ballots, a campaign has a different shape than if they hold a
 * twentieth.
 */
export function concentration(rows, topFraction = 0.1) {
  const sorted = [...rows].sort((a, b) => (b.registered ?? 0) - (a.registered ?? 0));
  const cut = Math.max(1, Math.round(sorted.length * topFraction));
  const head = sorted.slice(0, cut);

  const sum = (list, key) => list.reduce((total, row) => total + (row[key] ?? 0), 0);
  const allRegister = sum(sorted, "registered");
  const allCast = sum(sorted, "total");

  return {
    places: cut,
    of: sorted.length,
    registerShare: allRegister > 0 ? (sum(head, "registered") / allRegister) * 100 : 0,
    voteShare: allCast > 0 ? (sum(head, "total") / allCast) * 100 : 0,
  };
}
