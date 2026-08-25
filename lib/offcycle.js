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
  /* Accord took Osun in August 2026, the first governorship it has ever won.
     A party that holds a state cannot be allowed to fall into "other" on a
     map of governorship results, where it is the story. */
  { id: "ACCORD", name: "Accord", token: "var(--color-accord)" },
  { id: "ADC", name: "African Democratic Congress", token: "var(--color-adc)" },
  /* ── NDC ────────────────────────────────────────────────────────────────
     Here for the same reason as the rest: a party with votes in the count
     and no entry here is drawn as "other", and "other" on a map of who won
     a place is the one answer that is never useful.

     Its violet is provisional — see the token in app/globals.css — and it
     is the one party in this file that carries a pattern as well as a
     colour, because an eleventh fill cannot be separated from APC under
     red-green colour blindness by any hue left in the gamut. */
  { id: "NDC", name: "National Democratic Congress", token: "var(--color-ndc)", pattern: "dots" },
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
  {
    /* ── THE FIRST ROW HERE WITH A COMPLETE BALLOT ───────────────────────
       The rows above name only the candidates who mattered, so their totals
       are the sum of those candidates and not the state's valid vote. Both
       2026 contests carry `OTH`, so their totals ARE the full valid vote and
       every share computed from them is exact. Where the figure was
       published, it is used. */
    state: "Ekiti",
    code: "EKI",
    votesOn: "2026-06-20",
    winner: "APC",
    candidate: "Biodun Oyebanji",
    /* 375,777 valid votes. The named three come to 372,639, so OTH carries
       the remaining eleven candidates. APC's 84.95% matches the "nearly 85%"
       reported at declaration. */
    votes: { APC: 319_224, PDP: 40_543, ADC: 12_872, OTH: 3_138 },
    source: "INEC declaration, 21 June 2026",
  },
  {
    /* ── A GOVERNORSHIP CHANGING PARTY WITHOUT CHANGING HANDS ────────────
       Adeleke won Osun in 2022 on the PDP and held it in 2026 on Accord. He
       is the same governor; the state's party is different, and he was not a
       defector — he faced the electorate under the new party and won. That is
       why Osun carries no move in lib/governors.js despite changing colour. */
    state: "Osun",
    code: "OSU",
    votesOn: "2026-08-15",
    winner: "ACCORD",
    candidate: "Ademola Adeleke",
    /* 1,005,800 cast. Accord 50.81%, APC 44.22%, and OTH carries the other
       thirteen candidates at 4.96%. The margin these give, 66,252, is the
       margin that was reported, which is the check that matters. */
    votes: { ACCORD: 511_067, APC: 444_815, OTH: 49_918 },
    source: "INEC declaration, 16 August 2026",
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
 * A set of governorships looks complete, and somebody reading it will assume
 * it is every off-cycle election since 2023. Naming what is missing is the
 * difference between a dataset with a known gap and a dataset that is quietly
 * wrong, and the second kind is how a room ends up briefing on a state nobody
 * noticed was missing.
 *
 * This list is currently empty, and that is a claim, not an oversight: every
 * off-cycle governorship from Kogi in November 2023 to Osun in August 2026 is
 * loaded above. It held Ekiti and Osun until their declarations were
 * transcribed. The next contest to fall due goes here first, then moves up.
 */
export const NOT_LOADED = [];

/**
 * The window this set covers, phrased for a caption.
 *
 * `to` is the end of the window rather than the date of the last contest in
 * it, and `lastLoaded` is read off the rows rather than written down here.
 * The two differ whenever a contest is due but not yet transcribed, and a
 * caption that quietly used the last row's date would then claim the set ran
 * to today when it did not. Both are returned so a caption can say which it
 * means.
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
