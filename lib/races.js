import { parties, others } from "./election2023.js";

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
 * ── AND WHY THE BALLOT IS THE SAME FOUR PARTIES EVERYWHERE, FOR NOW ────────
 * The four here are the parties this product can draw: they have colours, a
 * hatch for the pair that cannot be told apart by hue, and a place in every
 * map, chart and export. A governorship in one state is genuinely fought
 * between a different four, and that is what "Other parties" is for — it is a
 * real field an agent types into, counted in every total, never given a hue,
 * and never quietly dropped. A per-position ballot is the honest next step and
 * `ballotFor` below is the one seam it has to come through; what must not
 * happen in the meantime is a vote being typed into a box that has nowhere to
 * be stored.
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
 * The parties on the ballot for a position.
 *
 * The bucket is last, always, and it is part of the ballot rather than a
 * derived remainder: a total that is only correct when somebody remembers to
 * subtract is a total that will one day be wrong.
 */
export function ballotFor(_race) {
  return [...parties, others];
}

export { parties, others };
