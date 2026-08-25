/**
 * Every party this product can name.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY A REGISTER, AND WHY NOW
 *
 *  The parties lived in two places: the presidential four in
 *  lib/election2023.js, because that file is the 2023 declared record, and a
 *  handful more in lib/offcycle.js, because a party that wins a governorship
 *  cannot be allowed to fall into "other". Both were lists of the parties a
 *  particular *dataset* happened to contain.
 *
 *  A real INEC Form EC8A settles the question. The 2026 Osun governorship
 *  sheet carries fifteen parties, in alphabetical order, and neither PDP nor
 *  LP is among them. A product whose party list comes from a dataset will
 *  meet that sheet and have nowhere to put eleven of its rows.
 *
 *  So this file is the register: who exists, what INEC prints against them,
 *  and what colour they are drawn in if they have one. It is not a ballot.
 *  Which of these appear on a given paper is lib/races.js's question.
 *
 * ── A PARTY DOES NOT NEED A COLOUR TO BE COUNTED ──────────────────────────
 *  Eight of the fifteen below have a fill; the rest are drawn in the "other"
 *  grey. That is deliberate and it is not a shortfall. A colour is only
 *  load-bearing for a party that can lead a place and therefore paint one on
 *  a map, and the palette is measurably full at eleven — see
 *  components/ui/PartyPatterns.jsx for what the eleventh cost.
 *
 *  Having no fill costs a party nothing that matters: it still has a box on
 *  the filing form, its own slot in the stored return, its own column in an
 *  export and its own row in every table. It is counted by name. It is only
 *  not *painted* by name, and a party polling zero in every booth has nothing
 *  to paint.
 *
 *  Give one a colour the day it starts winning places. That is one line here
 *  plus a token in globals.css, and the measurement rules in that file apply.
 * ══════════════════════════════════════════════════════════════════════════
 */

/**
 * `id`     what this product calls the party, everywhere, forever.
 * `sheet`  what INEC prints in the "POLITICAL PARTY" column, where it differs.
 * `token`  the fill, or absent for the parties drawn in the "other" grey.
 */
const REGISTER = [
  /* ── THE PRESIDENTIAL FOUR ──────────────────────────────────────────────
     lib/election2023.js also defines these, because that file is the 2023
     declared record and its vote arrays are positional over them — it carries
     each one's candidate and brand hex, which belong to that election.

     Their *colours* are repeated here deliberately, and the two copies are
     asserted equal in tests/ballot.test.js. Without a token here `partyById`
     fell back to the "other" grey, so anything resolving APC through the
     register drew the largest party in the country as an unknown. */
  { id: "APC", name: "All Progressives Congress", token: "var(--color-apc)" },
  { id: "PDP", name: "Peoples Democratic Party", token: "var(--color-pdp)" },
  /* LP carries a hatch as well as a colour: its red and PDP's green are the
     same tone to a protanope. See lib/party-pattern.js. */
  { id: "LP", name: "Labour Party", token: "var(--color-lp)", pattern: "diagonal" },
  { id: "NNPP", name: "New Nigeria Peoples Party", token: "var(--color-nnpp)" },

  /* ── ON THE OSUN 2026 GOVERNORSHIP PAPER ────────────────────────────────
     Transcribed from Form EC8A, S/N 0000611, Idiomo Apena Compd.,
     29/07/04/010, 15 August 2026. Fifteen rows, alphabetical, exactly as the
     commission prints them. */

  /* Accord is printed as a bare "A". That is a problem for a reader that
     matches initials in OCR text, where a lone "A" appears in every other
     word on the page, so the id stays ACCORD and `sheet` carries what is
     actually on the paper. See lib/sheet-vision.js for how the match is
     anchored. */
  { id: "ACCORD", name: "Accord", sheet: "A", token: "var(--color-accord)" },
  { id: "AA", name: "Action Alliance" },
  { id: "AAC", name: "African Action Congress" },
  { id: "ADC", name: "African Democratic Congress", token: "var(--color-adc)" },
  { id: "ADP", name: "Action Democratic Party" },
  { id: "APGA", name: "All Progressives Grand Alliance", token: "var(--color-apga)" },
  { id: "APM", name: "Allied Peoples Movement", token: "var(--color-apm)" },
  { id: "APP", name: "Action Peoples Party" },
  { id: "BP", name: "Boot Party" },
  { id: "PRP", name: "Peoples Redemption Party" },
  { id: "SDP", name: "Social Democratic Party", token: "var(--color-sdp)" },
  { id: "YPP", name: "Young Progressives Party" },
  { id: "ZLP", name: "Zenith Labour Party" },

  /* Not on the Osun paper, and on the ballot elsewhere. */
  { id: "NDC", name: "National Democratic Congress", token: "var(--color-ndc)", pattern: "dots" },
];

const BY_ID = new Map(REGISTER.map((party) => [party.id, party]));

/** Grey, and never a pale party colour: "other" is a bucket, not a party. */
const OTHER_TOKEN = "var(--color-party-other)";

/**
 * A party by id, with a fill guaranteed.
 *
 * Everything that draws needs *some* colour, and a party without one is drawn
 * in the "other" grey rather than in nothing at all — an undefined fill is a
 * black shape on a black board, which reads as a party nobody has heard of
 * winning a state.
 */
export function partyById(id) {
  const found = BY_ID.get(String(id ?? "").toUpperCase());
  if (!found) return null;
  return { token: OTHER_TOKEN, ...found };
}

/** What INEC prints for this party, which is not always its id. */
export function printedAs(id) {
  return partyById(id)?.sheet ?? partyById(id)?.id ?? id;
}

/** Every id the register knows, for a reader matching initials off a page. */
export const REGISTERED_IDS = REGISTER.map((party) => party.id);

/**
 * Printed on every result sheet in the country, whatever the contest.
 *
 * This is the only group a reader may treat as "must be here". Everyone else
 * may legitimately be absent from a given paper — the Osun governorship sheet
 * carries neither PDP nor LP — and a reader that calls an absent row a failed
 * reading refuses the sheet. See lib/sheet-vision.js.
 */
const ALWAYS_PRINTED = new Set(["APC", "PDP", "LP", "NNPP"]);

/**
 * What a sheet reader scans for.
 *
 * The whole register, not one position's ballot, because a photograph does not
 * say which paper it is. The reader finds every party it can; `figuresForBallot`
 * then keeps the ones that belong on the ballot being filed and drops the rest.
 */
export function scanList() {
  return REGISTER.map((party) => ({
    token: OTHER_TOKEN,
    ...party,
    optional: !ALWAYS_PRINTED.has(party.id),
  }));
}

export { REGISTER };
