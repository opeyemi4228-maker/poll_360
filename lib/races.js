import { parties, others } from "./election2023.js";
import { partyById, REGISTERED_IDS } from "./party-register.js";

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
    id: "ASSEMBLY",
    label: "House of Assembly",
    short: "Assembly",
    elects: "Member of the State House of Assembly",
    /* ── THE ONE SEAT THIS PRODUCT CANNOT DRAW THE EDGE OF ─────────────────
       990 state constituencies are carved out of 774 local governments along
       ward lines, and no ward boundary is published in any form this
       repository holds. So an assembly account is scoped to the local
       government its constituency sits inside — a container, never the seat
       itself — and every screen that offers one says which of the two it is
       showing. See LEVEL_FOR_RACE in lib/territory.js. */
    collatedInto: "a state constituency",
    blurb: "990 seats, carved out of the local governments along ward lines.",
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
 * The paper, as the commission prints it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Form EC8A lists every party contesting that position, in alphabetical
 *  order, one row each, and the agent writes a figure against all of them —
 *  ZERO included. The Osun 2026 governorship paper carries fifteen rows and
 *  neither PDP nor LP is among them.
 *
 *  That is why this is a list per position and not one list with a bucket
 *  bolted on the end. A form offering six boxes against a paper with fifteen
 *  rows asks an agent to add nine numbers up in their head, in the dark, and
 *  type the total into "other" — and nine of the fifteen parties then have no
 *  figure anybody can ever read back.
 *
 *  The bucket stays, and stays last, because a paper can always carry a row
 *  this product has never heard of. It should now almost always be zero.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ── ONE PAPER, EVERY POSITION ──────────────────────────────────────────────
   These are the parties, full stop. A presidential paper and a governorship
   paper carry the same register — the contest changes who is standing in a
   given place, not who exists — so the ballot is one list and every position
   gets all of it. A party that did not contest a booth is written ZERO on the
   sheet and typed as 0 here, which is exactly what the paper does.

   Alphabetical by the code the commission prints, so an agent reads down the
   paper and down the screen in step. That ordering is not cosmetic: a
   mis-ordered form is how a figure lands one row from where it belongs.

   Accord sorts as "A" because that is what is printed against it, not as
   "ACCORD", which would put it after APP. */
const NATIONAL = [
  "ACCORD", "AA", "AAC", "ADC", "ADP", "APC", "APGA", "APM", "APP",
  "BP", "LP", "NDC", "NNPP", "PDP", "PRP", "SDP", "YPP", "ZLP",
];

/** Resolved against the register, so a party is defined in exactly one place. */
function paperFor(_race) {
  return NATIONAL.map((id) => {
    /* The presidential four keep the definitions the 2023 record gave them,
       colours and all; everyone else comes from the register. */
    const canonical = parties.find((party) => party.id === id) ?? partyById(id);
    if (!canonical) throw new Error(`A ballot names ${id}, which the party register does not`);

    return canonical;
  });
}

/**
 * The parties on the ballot for a position.
 *
 * The bucket is last, always, and it is part of the ballot rather than a
 * derived remainder: a total that is only correct when somebody remembers to
 * subtract is a total that will one day be wrong.
 */
export function ballotFor(race) {
  return [...paperFor(race), others];
}

/**
 * The ballot without the bucket: the parties that are counted by name.
 *
 * Named because several things need exactly this and none of them should be
 * spelling it as "the ballot minus the last one". The bucket is not printed on
 * any result sheet; it is the sum of the rows nobody has a box for.
 */
export function countedParties(race) {
  return paperFor(race);
}

/** Every party the product can name, for a reader matching initials on a page. */
export const KNOWN_PARTY_IDS = REGISTERED_IDS;

/** Every party with a box on a given paper, the bucket included. */
export const ballotIds = (race) => ballotFor(race).map((party) => party.id);

export { parties, others };
