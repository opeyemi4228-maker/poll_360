import { parties, others } from "./election2023.js";
import { EXTRA_PARTIES } from "./offcycle.js";

/**
 * The positions on the ballot.
 *
 * ── WHY A NIGHT IS SEVERAL COUNTS, NOT ONE ─────────────────────────────────
 * A voter at a polling unit is handed more than one ballot paper, and each one
 * is counted, collated and declared separately. The presidential figures from
 * booth 25/07/04/019 and the senate figures from the same booth on the same
 * evening are two different returns about two different contests, and adding
 * them together produces a number that describes nothing at all.
 *
 * So every return carries the position it is a return for, the results table
 * holds one row per position per booth, and every screen in this product reads
 * one position at a time. That is what makes "62% counted" a sentence with a
 * meaning: 62% of booths have reported *this* contest.
 *
 * ── WHY THIS IS A LIST AND NOT FIVE PROJECTS ───────────────────────────────
 * A project is an election day. Five projects for one day would mean five
 * switches to look at one booth's evening, five places for an incident to be
 * filed against, and five coverage figures nobody could reconcile. The day is
 * the project; the position is a dimension inside it.
 *
 * ── THE BALLOT IS SIX PARTIES AND THE BUCKET ───────────────────────────────
 * It was four, and four was the 2023 presidential field frozen into the one
 * place it does the most damage: the form an agent fills in at a booth. A
 * party without a box on that form has its votes added into "Other parties"
 * by hand, in the dark, at two in the morning — which is not a count of that
 * party at all. It cannot lead a state on any map, cannot appear in an export
 * column, and cannot be told apart from the fourteen other parties in the
 * bucket by anybody reading the result afterwards.
 *
 * ADC and NDC now have boxes of their own, so a vote for either is stored as
 * a vote for either. Both were already parties this product can draw: they
 * have entries in lib/offcycle.js and colours in globals.css, which is what
 * "the parties this product can draw" has always meant.
 *
 * "Other parties" stays exactly what it was, and stays last. A Nigerian
 * ballot paper runs to eighteen rows; six boxes plus a bucket is not a claim
 * that six parties exist, it is a claim that these six are worth counting
 * separately and the rest are worth counting together. The bucket is part of
 * the ballot rather than a derived remainder, so a total is never only
 * correct when somebody remembers to subtract.
 *
 * ── WHY THIS IS STILL ONE LIST AND NOT ONE PER POSITION ────────────────────
 * `ballotFor` takes the position because a per-position ballot is where this
 * has to end up — an LGA chairmanship in one state is fought by parties that
 * are on no other paper in the country. It returns the same list for every
 * position today. The seam is here, it is the only one, and nothing outside
 * this file decides what an agent may type a number into.
 * ───────────────────────────────────────────────────────────────────────────
 */

export const RACES = [
  {
    id: "PRESIDENTIAL",
    label: "Presidential",
    short: "President",
    elects: "President of the Federal Republic",
    /* Where the winner is decided, which is not where the votes are counted.
       Every one of these is counted at the polling unit; they differ in what
       the unit totals are collated into. */
    collatedInto: "the federation",
    blurb: "One contest, 37 states, declared nationally.",
  },
  {
    id: "GOVERNORSHIP",
    label: "Governorship",
    short: "Governor",
    elects: "Governor of the state",
    collatedInto: "one state",
    blurb: "One contest per state, declared at the state collation centre.",
  },
  {
    id: "SENATE",
    label: "Senate",
    short: "Senator",
    elects: "Senator for the district",
    collatedInto: "a senatorial district",
    blurb: "Three districts to a state, 109 seats in all.",
  },
  {
    id: "REPRESENTATIVES",
    label: "Representatives",
    short: "Rep",
    elects: "Member of the House of Representatives",
    collatedInto: "a federal constituency",
    blurb: "360 federal constituencies, each several wards wide.",
  },
  {
    id: "LGA",
    label: "Local government",
    short: "Chairman",
    elects: "Chairman of the local government",
    /* Run by the state electoral commission rather than INEC, on its own day.
       The count works identically, which is why it belongs on this list. */
    collatedInto: "one local government",
    blurb: "Chairmanship, run by the state commission on its own day.",
  },
];

export const RACE_IDS = RACES.map((race) => race.id);

const BY_ID = new Map(RACES.map((race) => [race.id, race]));

/** One position, or null. Never a guess: an unknown id is a bug upstream. */
export function raceFor(id) {
  return BY_ID.get(String(id ?? "").toUpperCase()) ?? null;
}

/** Its name in a sentence, falling back to the raw id rather than to nothing. */
export function raceLabel(id) {
  return BY_ID.get(String(id ?? "").toUpperCase())?.label ?? String(id ?? "—");
}

/** Is this a position this product knows how to count? */
export function isRace(id) {
  return BY_ID.has(String(id ?? "").toUpperCase());
}

/**
 * The position a project defaults to.
 *
 * A project's `kind` is the headline contest of the day — the one it is named
 * after. It is the right thing to open on and the wrong thing to assume: every
 * accessor that reads returns takes the position explicitly, and this is only
 * consulted where nobody has said which one they are looking at.
 */
export function defaultRace(project) {
  const kind = String(project?.kind ?? "").toUpperCase();
  return BY_ID.has(kind) ? kind : "PRESIDENTIAL";
}

/**
 * Parties that have a box of their own beyond the presidential four.
 *
 * Read out of lib/offcycle.js by id rather than redeclared, so a party's name
 * and colour are defined once. A missing id is a crash at import time, which
 * is the right moment to find out: the alternative is a ballot that silently
 * drops a party and a night spent wondering where its votes went.
 */
const CONTESTING = ["ADC", "NDC"].map((id) => {
  const party = EXTRA_PARTIES.find((item) => item.id === id);
  if (!party) throw new Error(`Ballot names ${id}, which lib/offcycle.js does not define`);

  /* ── OPTIONAL ON A SHEET, NOT OPTIONAL IN THE COUNT ────────────────────
     Every Nigerian result sheet prints a row for the presidential four, so
     a reader that cannot find one of them has failed and must say so. That
     is not true of a party added to the ballot: a paper from a contest it
     did not stand in has no row for it, and treating that as a failed
     reading refuses the whole sheet.

     This flag is what keeps those two apart. It changes nothing about how
     the votes are counted; it only decides whether a row that is not on the
     page is a hole in the return or simply not on the page. */
  return { ...party, optional: true };
});

/**
 * The parties on the ballot for a position.
 *
 * The bucket is last, always, and it is part of the ballot rather than a
 * derived remainder: a total that is only correct when somebody remembers to
 * subtract is a total that will one day be wrong.
 */
export function ballotFor(_race) {
  return [...parties, ...CONTESTING, others];
}

/**
 * The ballot without the bucket: the parties that are counted by name.
 *
 * Named because several things need exactly this and none of them should be
 * spelling it as "the ballot minus the last one". A sheet reader looks for
 * these on the page; the bucket is not printed on any result sheet, it is the
 * sum of the rows nobody has a box for.
 */
export function countedParties(race) {
  return ballotFor(race).filter((party) => party.id !== others.id);
}

/** Every party with a box, the bucket included. Handy for a Set of ids. */
export const BALLOT_IDS = ballotFor().map((party) => party.id);

export { parties, others };
