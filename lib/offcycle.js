/**
 * Nigeria's off-cycle governorship elections, as declared.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THESE ARE REAL RESULTS, AND THEY ARE STILL NOT A LIVE FEED.
 *
 *  Every figure here is a state-level total declared by INEC and reported
 *  at the time. None of it is generated, and nothing in this file is
 *  synthetic. What it is NOT is a connection to INEC: there is no public
 *  results API. Results are published on IReV as scanned EC8A forms, one
 *  image per polling unit, which is deliberately not a machine-readable
 *  aggregate. Any product claiming a live INEC feed is either reading those
 *  images or inventing the numbers.
 *
 *  So this is a transcription with its provenance attached, and the product
 *  treats it exactly as it treats any other declared figure: as the thing
 *  our own count is held against, never as our own count.
 *
 *  VERIFY BEFORE BROADCAST. A transcribed total is one typo away from being
 *  wrong, and the whole value of this product is refusing to pass off an
 *  unchecked number as a checked one.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY LOCAL GOVERNMENT FIGURES ARE ABSENT ────────────────────────────────
 * Because I do not have them and will not invent them. Colouring 774 local
 * governments from guesswork would look magnificent and be a lie of exactly
 * the kind this product exists to catch. The importer takes them the moment
 * you have the real ones, and until then the map says the honest thing:
 * the state is coloured, its local governments are not loaded.
 */

/** Parties that appear here and not in the presidential four. */
export const EXTRA_PARTIES = [
  { id: "APGA", name: "All Progressives Grand Alliance", token: "var(--color-apga)" },
  { id: "SDP", name: "Social Democratic Party", token: "var(--color-sdp)" },
];

/**
 * One row per contest. `votes` are the declared totals for the candidates who
 * mattered; `others` gathers the rest so a share never quietly exceeds 100%.
 */
export const OFF_CYCLE = [
  {
    state: "Kogi",
    code: "KOG",
    votesOn: "2023-11-11",
    winner: "APC",
    candidate: "Ahmed Usman Ododo",
    votes: { APC: 446_237, SDP: 259_052, PDP: 46_362 },
    source: "INEC declaration, 12 November 2023",
  },
  {
    state: "Imo",
    code: "IMO",
    votesOn: "2023-11-11",
    winner: "APC",
    candidate: "Hope Uzodinma",
    votes: { APC: 540_308, PDP: 71_503, LP: 64_081 },
    source: "INEC declaration, 12 November 2023",
  },
  {
    state: "Bayelsa",
    code: "BAY",
    votesOn: "2023-11-11",
    winner: "PDP",
    candidate: "Douye Diri",
    votes: { PDP: 175_196, APC: 110_108 },
    source: "INEC declaration, 12 November 2023",
  },
  {
    state: "Edo",
    code: "EDO",
    votesOn: "2024-09-21",
    winner: "APC",
    candidate: "Monday Okpebholo",
    votes: { APC: 291_667, PDP: 247_274, LP: 22_763 },
    source: "INEC declaration, 22 September 2024",
  },
  {
    state: "Ondo",
    code: "OND",
    votesOn: "2024-11-16",
    winner: "APC",
    candidate: "Lucky Aiyedatiwa",
    votes: { APC: 366_781, PDP: 117_845 },
    source: "INEC declaration, 17 November 2024",
  },
  {
    state: "Anambra",
    code: "ANA",
    votesOn: "2025-11-08",
    winner: "APGA",
    candidate: "Charles Soludo",
    /* The winner and the party are beyond doubt; these totals are the ones
       reported at declaration and are the least certain figures in this file.
       Flagged rather than quietly included, because a number nobody has
       checked should not look like one that has been. */
    votes: { APGA: 422_664 },
    source: "INEC declaration, 9 November 2025",
    unverified: true,
  },
];

/** Every party that appears in the set, so the legend can be built from it. */
export function partiesInPlay() {
  const seen = new Set();
  for (const row of OFF_CYCLE) for (const id of Object.keys(row.votes)) seen.add(id);
  return [...seen];
}

/** Winner per state code, which is all the map needs to colour itself. */
export function winnersByState() {
  return Object.fromEntries(OFF_CYCLE.map((row) => [row.code, row.winner]));
}

/**
 * Contests that fall inside the window and are NOT in the set above.
 *
 * ── WHY AN ABSENCE IS WORTH RECORDING ──────────────────────────────────────
 * A set of six governorships looks complete, and somebody reading it will
 * assume it is every off-cycle election since 2023. It is not: Ekiti voted in
 * June 2026 and Osun in July 2026, both inside the window, and I do not hold
 * verified figures for either. Naming them is the difference between a
 * dataset with a known gap and a dataset that is quietly wrong, and the second
 * kind is how a room ends up briefing on a state nobody noticed was missing.
 */
export const NOT_LOADED = [
  { state: "Ekiti", code: "EKI", votesOn: "2026-06-20", why: "No verified declaration held." },
  { state: "Osun", code: "OSU", votesOn: "2026-07-16", why: "No verified declaration held." },
];

/**
 * The window this set covers, phrased for a caption.
 *
 * `to` is the end of the window rather than the date of the last contest in
 * it. The two differ, because the window runs to now and the last loaded
 * result is from November 2025, and a caption reading "2023 to 2025" over a
 * set that is supposed to cover three years invites the reader to think
 * nothing has happened since.
 */
export function coverage(now = new Date()) {
  const days = OFF_CYCLE.map((row) => row.votesOn).sort();
  return {
    from: days[0],
    lastLoaded: days[days.length - 1],
    to: now.toISOString().slice(0, 10),
    fromYear: Number(days[0].slice(0, 4)),
    toYear: now.getUTCFullYear(),
    states: OFF_CYCLE.length,
    missing: NOT_LOADED.length,
  };
}
