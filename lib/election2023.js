/**
 * The 2023 Nigerian presidential election, as declared.
 *
 * ── WHY REAL RESULTS AND NOT A SIMULATION ──────────────────────────────────
 * The board on the home page replays an election that actually happened. Every
 * vote figure below is a published, declared result — not a generated one — so
 * a visitor can check any state against the record, and nothing on this site
 * is a number we made up and dressed as a count.
 *
 * What is *not* real is the order and timing of arrival. INEC does not publish
 * a per-booth arrival log, so the replay distributes each state's declared
 * total across a sequence of batches. The evening's shape is illustrative; its
 * destination is the true result. The board says exactly this, on its face.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * ── SOURCE AND ITS DISCREPANCIES ───────────────────────────────────────────
 * Compiled from Wikipedia's state-by-state table of INEC's declared results
 * (2023 Nigerian presidential election, "Results — By state").
 *
 * Reproduced unchanged, including two rows that do not sum to their own stated
 * totals: Kwara (parties sum to 470,011 against a stated 469,971) and Yobe
 * (376,397 against a stated 378,397). Summing all 37 rows gives totals within
 * 0.13% of INEC's declared national figures — see DECLARED below for both.
 *
 * Correcting them silently would be the single most inappropriate thing this
 * file could do. A results system's demonstration data does not get to tidy
 * away the discrepancies in its own source.
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * The parties, in ballot order, with the colours they are actually known by.
 *
 * ── THE COLOUR PROBLEM, STATED PLAINLY ─────────────────────────────────────
 * These are the parties' own hues — APC blue, PDP green, LP red, NNPP green —
 * re-stepped in lightness for the near-black board surface so each clears 3:1
 * against it. The hues themselves are untouched, because a chart that invents
 * a party's colour is a chart nobody in Nigerian politics will trust at a
 * glance, and trust is the entire product.
 *
 * Measured against the colour-blindness gates (OKLab ΔE ×100, Machado 2009
 * severity 1.0), the set is good except for one pair:
 *
 *     APC / PDP    normal 24.9   cvd 23.7    pass
 *     APC / LP     normal 31.7   cvd 23.9    pass
 *     APC / NNPP   normal 25.7   cvd 24.8    pass
 *     PDP / NNPP   normal 22.0   cvd 21.9    pass  (two greens, split by lightness)
 *     LP  / NNPP   normal 32.4   cvd 10.8    pass
 *     PDP / LP     normal 29.1   cvd  3.5    FAIL
 *
 * PDP green against LP red is invisible to the commonest forms of colour
 * blindness — roughly one man in twelve sees one muddy tone. No choice of hex
 * fixes it: separating that pair by lightness immediately collapses LP against
 * NNPP, because LP sits between the two greens. It is a property of the
 * Nigerian party palette, not of this implementation.
 *
 * So colour is not load-bearing anywhere on this board:
 *   · every state carries its leading party's code in type across it;
 *   · LP additionally carries a diagonal hatch, so the failing pair is
 *     separable by pattern for every reader, in print, and under forced
 *     colours;
 *   · the tooltip names the party in words;
 *   · the table beside the map is the same data with no colour in it at all.
 * ───────────────────────────────────────────────────────────────────────────
 */
export const parties = [
  {
    id: "APC",
    name: "All Progressives Congress",
    candidate: "Bola Tinubu",
    token: "var(--color-apc)",
    brand: "#87BEEB",
  },
  {
    id: "PDP",
    name: "Peoples Democratic Party",
    candidate: "Atiku Abubakar",
    token: "var(--color-pdp)",
    brand: "#006903",
  },
  {
    id: "LP",
    name: "Labour Party",
    candidate: "Peter Obi",
    token: "var(--color-lp)",
    brand: "#DA251C",
    /* The one pair that cannot be separated by hue. See above. */
    hatch: true,
  },
  {
    id: "NNPP",
    name: "New Nigeria Peoples Party",
    candidate: "Rabiu Kwankwaso",
    token: "var(--color-nnpp)",
    brand: "#049603",
  },
];

/** Everyone else on the ballot, counted in every total and never given a hue. */
export const others = {
  id: "OTH",
  name: "Other parties",
  candidate: "14 other candidates",
  token: "var(--color-party-other)",
};

export const allParties = [...parties, others];

/** Grey. Not a pale party colour, not a low number — an absence. */
export const SILENT = "var(--color-silent)";

/** INEC's declared national totals, for checking the sum of the rows against. */
export const DECLARED = {
  apc: 8794726,
  pdp: 6984520,
  lp: 6101533,
  nnpp: 1496687,
  validVotes: 24025940,
  registered: 93469008,
  /* Summing the 37 state rows below gives 24,026,730 valid votes: 790 more
     than the declared national figure, from the two inconsistent rows noted
     above. 0.003%. Disclosed rather than reconciled. */
  rowSum: 24026730,
};

export const SOURCE =
  "INEC declared results, 2023 presidential election, compiled by Wikipedia";

/**
 * [code, name, [APC, PDP, LP, NNPP, others], validVotes, turnout%, registered, pollingUnits]
 *
 * `registered` is implied by the published turnout column rather than taken
 * from a register table, and `pollingUnits` apportions the national 176,623
 * across states by that register — INEC's per-state unit counts are not part
 * of this dataset. Both are marked as derived wherever they are displayed.
 */
export const RESULTS = [
  ["ABI", "Abia", [8914, 22676, 327095, 1239, 10113], 370037, 18, 2055761, 4067],
  ["ADA", "Adamawa", [182881, 417611, 105648, 8006, 16994], 731140, 34.67, 2108855, 4172],
  ["AKW", "Akwa Ibom", [160620, 214012, 132683, 7796, 39978], 555089, 24.92, 2227484, 4406],
  ["ANA", "Anambra", [5111, 9036, 584621, 1967, 13126], 613861, 24.63, 2492330, 4930],
  ["BAU", "Bauchi", [316694, 426607, 27373, 72103, 10739], 853516, 31.1, 2744424, 5429],
  ["BAY", "Bayelsa", [42572, 68818, 49975, 540, 3420], 165325, 16.38, 1009310, 1997],
  ["BEN", "Benue", [310468, 130081, 308372, 4740, 16414], 770075, 28.72, 2681320, 5304],
  ["BOR", "Borno", [252282, 190921, 7205, 4626, 10253], 465287, 19.94, 2333435, 4616],
  ["CRO", "Cross River", [130520, 95425, 179917, 1644, 9462], 416968, 26.1, 1597579, 3160],
  ["DEL", "Delta", [90183, 161600, 341866, 3122, 18570], 615341, 20.32, 3028253, 5991],
  ["EBO", "Ebonyi", [42402, 13503, 259738, 1661, 8047], 325351, 21.58, 1507651, 2982],
  ["EDO", "Edo", [144471, 89585, 331163, 2743, 13304], 581266, 24.01, 2420933, 4789],
  ["EKI", "Ekiti", [201494, 89554, 11397, 264, 5462], 308171, 31.84, 967874, 1915],
  ["ENU", "Enugu", [4772, 15749, 428640, 1808, 5455], 456424, 22.19, 2056890, 4069],
  ["FCT", "Federal Capital Territory", [90902, 74194, 281717, 4517, 8741], 460071, 30.48, 1509419, 2986],
  ["GOM", "Gombe", [146977, 317123, 26160, 10520, 9263], 510043, 33.87, 1505884, 2979],
  ["IMO", "Imo", [66171, 30004, 352904, 1536, 8646], 459261, 22.1, 2078104, 4111],
  ["JIG", "Jigawa", [421390, 386587, 1889, 98234, 12431], 920531, 40.78, 2257310, 4465],
  ["KAD", "Kaduna", [399293, 554360, 294494, 92969, 19037], 1360153, 32.33, 4207092, 8323],
  ["KAN", "Kano", [517341, 131716, 28513, 997279, 27156], 1702005, 30.15, 5645124, 11167],
  ["KAT", "Katsina", [482283, 489045, 6376, 69386, 11583], 1058673, 31.03, 3411772, 6749],
  ["KEB", "Kebbi", [248088, 285175, 10682, 5038, 10539], 559522, 29.81, 1876961, 3713],
  ["KOG", "Kogi", [240751, 145104, 56217, 4238, 10480], 456790, 24.63, 1854608, 3669],
  ["KWA", "Kwara", [263572, 136909, 31186, 3141, 35203], 469971, 29.29, 1604544, 3174],
  ["LAG", "Lagos", [572606, 75750, 582454, 8442, 32199], 1271451, 18.92, 6720143, 13295],
  ["NAS", "Nasarawa", [172922, 147093, 191361, 12715, 16475], 540566, 21.82, 2477388, 4901],
  ["NIG", "Niger", [375183, 284898, 80452, 21836, 16299], 778668, 30.49, 2553847, 5052],
  ["OGU", "Ogun", [341554, 123831, 85829, 2200, 26710], 580124, 22.75, 2549996, 5044],
  ["OND", "Ondo", [369924, 115463, 44405, 930, 20286], 551008, 28.62, 1925255, 3809],
  ["OSU", "Osun", [343945, 354366, 23283, 713, 10896], 733203, 38.71, 1894092, 3747],
  ["OYO", "Oyo", [449884, 182977, 99110, 4095, 73419], 809485, 26.32, 3075551, 6084],
  ["PLA", "Plateau", [307195, 243808, 466272, 8869, 62026], 1088170, 40.33, 2698165, 5338],
  ["RIV", "Rivers", [231591, 88468, 175071, 1322, 27199], 523651, 16.71, 3133758, 6199],
  ["SOK", "Sokoto", [285444, 288679, 6568, 1300, 4824], 586815, 29.84, 1966538, 3890],
  ["TAR", "Taraba", [135165, 189017, 146315, 12818, 16043], 499358, 26.67, 1872358, 3704],
  ["YOB", "Yobe", [151459, 196567, 2406, 18270, 7695], 378397, 26.75, 1414568, 2798],
  ["ZAM", "Zamfara", [298396, 193978, 1660, 4044, 4845], 502923, 27.64, 1819548, 3599],
];

/** The rows above, as objects. */
export const states2023 = RESULTS.map(
  ([code, name, votes, total, turnout, registered, booths]) => ({
    code,
    name,
    votes,
    total,
    turnout,
    registered,
    booths,
  })
);
