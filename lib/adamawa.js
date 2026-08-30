/**
 * Adamawa State, as far as this repository can honestly claim to know it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS IS
 *
 *  A hand-transcribed reference table for one state: the declared results we
 *  hold figures for, and who currently holds every seat in it. It exists
 *  because four accounts are issued against Adamawa — a governorship
 *  campaign, a senatorial campaign, a House of Representatives campaign and a
 *  local government campaign — and each of them opens a room that should say
 *  something true before their own first agent files anything.
 *
 *  ── THE RULE THIS FILE IS WRITTEN UNDER ─────────────────────────────────
 *  A figure is here only if it was published and can be pointed at. Where a
 *  result is known to have happened and its numbers are not in any source
 *  this repository could reach, the seat is listed with `votes: null` and
 *  said so. Null reads as "not loaded" everywhere in this product; a zero
 *  would read as a fact, and a plausible invented number would read as a
 *  result.
 *
 *  That distinction is the whole point of a parallel count. A room that
 *  cannot tell a figure it holds from a figure it guessed is a room whose
 *  divergence report means nothing.
 *
 *  ── AND WHY THE 2023 FIGURES SIT IN A 2023 PROJECT ──────────────────────
 *  These are the last declared results, not a forecast of the next election.
 *  scripts/seed-adamawa.mjs loads them into a project named for the year they
 *  belong to, because the gap room holds our returns against the declared
 *  figures of the *same* project — and a 2027 return measured against a 2023
 *  declaration is a divergence manufactured by the filing, not found by it.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** The state itself, as this product keys it. */
export const ADAMAWA = {
  code: "ADA",
  /* INEC numbers the states alphabetically; Adamawa is the second. Every unit
     code in the state begins 02, which is what every territory below is built
     on. See lib/units.js. */
  number: "02",
  name: "Adamawa",
  lgas: 21,
  senatorialDistricts: 3,
  federalConstituencies: 8,
  stateConstituencies: 25,
  wards: 226,
};

/* ──────────────────────────────────────────────────────── declared results */

/**
 * The two contests we hold real figures for, at the level they were declared.
 *
 * ── WHY BOTH ARE STATE-LEVEL AND NOT BROKEN DOWN ───────────────────────────
 * INEC declares a governorship at the state collation centre and publishes
 * the local-government breakdown on the result sheets rather than as data.
 * What is reachable in machine-readable form is the state total. Two
 * newspaper reports carry partial local-government figures from the
 * supplementary poll, with the place names mangled — "Gante", "Muhia" — and
 * a breakdown transcribed from those would be a set of invented places
 * carrying real-looking numbers. It is not here.
 *
 * ── AND WHY THE MINOR PARTIES ARE ABSENT RATHER THAN ZERO ──────────────────
 * Twelve parties contested the governorship besides these two and their
 * totals are not published in any source reached here. The declared turnout
 * (39.90% of 2,196,566 registered, about 876,000 votes) is some 46,000 above
 * the two figures below, and that difference is those twelve plus the
 * rejected ballots. It is stated in the note rather than distributed across
 * parties, because a total that is only correct when somebody remembers to
 * subtract is a total that will one day be wrong.
 */
export const DECLARED = [
  {
    race: "GOVERNORSHIP",
    level: "STATE",
    key: ADAMAWA.number,
    votesOn: "2023-03-18",
    /* The March election was declared inconclusive; the supplementary poll on
       15 April settled it and the return was made on 18 April. The Court of
       Appeal affirmed it on 18 December 2023. */
    declaredOn: "2023-04-18",
    winner: "PDP",
    candidate: "Ahmadu Umaru Fintiri",
    votes: { PDP: 430_861, APC: 398_788 },
    registered: 2_196_566,
    /* Published as a percentage rather than a count, so the count is not
       stated here. 39.90% of the register is about 876,000. */
    accredited: null,
    rejected: null,
    source:
      "INEC declaration, 18 April 2023, after the 15 April supplementary poll. " +
      "Affirmed by the Court of Appeal, 18 December 2023.",
    note:
      "Fintiri (PDP) 430,861 to Binani (APC) 398,788. Twelve other parties contested and their " +
      "totals are not held: declared turnout was 39.90% of 2,196,566 registered, roughly 46,000 " +
      "votes above the two figures shown.",
  },
  {
    race: "PRESIDENTIAL",
    level: "STATE",
    key: ADAMAWA.number,
    votesOn: "2023-02-25",
    declaredOn: "2023-03-01",
    winner: "PDP",
    candidate: "Atiku Abubakar",
    /* Taken from lib/election2023.js rather than retyped, so the state board
       and this table can never disagree about the same election. The bucket
       is the file's own "others" column and is carried as OTH, which is what
       the ballot calls it. */
    votes: { APC: 182_881, PDP: 417_611, LP: 105_648, NNPP: 8_006, OTH: 16_994 },
    registered: 2_108_855,
    accredited: null,
    rejected: null,
    source: "INEC declared results, 2023 presidential election. Same figures as lib/election2023.js.",
    note: "Atiku Abubakar (PDP) carried Adamawa, his home state, with 417,611 of 731,140 valid votes.",
  },
];

/* ───────────────────────────────────────────────────────── who holds what */

/**
 * Every seat in the state and who currently sits in it.
 *
 * ── WHAT THIS IS FOR ───────────────────────────────────────────────────────
 * It is the same job lib/governors.js does for the country: the ground under
 * a count that has not started. A campaign opening its room the week before
 * polling day should see whose seat is being defended where, rather than a
 * grey map that says only "nobody has reported", which is a thing they
 * already know.
 *
 * ── NO VOTE COUNTS, AND THAT IS DELIBERATE ─────────────────────────────────
 * Who holds a seat is a matter of record and is checkable. What they won it
 * by, for the National Assembly seats, is published by INEC on result sheets
 * and in a viewer that does not serve data — Wikipedia's own tables for these
 * districts still read "TBD". So every seat below carries a holder and a
 * party and no figure at all, which is exactly what we know.
 *
 * `territory` is the key this product stores, so every row here can be
 * resolved against the real district tables and a mistyped constituency fails
 * a test rather than reaching a screen. See tests/adamawa.test.js.
 */
export const SEATS = [
  {
    office: "Governor",
    race: "GOVERNORSHIP",
    territory: `STATE:${ADAMAWA.number}`,
    place: "Adamawa",
    holder: "Ahmadu Umaru Fintiri",
    party: "PDP",
    since: "2019-05-29",
    note: "Re-elected 2023. Second term.",
    source: "INEC declaration, 18 April 2023.",
  },

  /* ── THE SENATE ────────────────────────────────────────────────────────
     Three districts, all three held by the PDP, and one of them only after a
     court said so: INEC declared Elisha Ishaku Abbo (APC) for Adamawa North
     in February 2023, the Court of Appeal sacked him on 16 October 2023 and
     declared Amos Yohanna (PDP) the winner on lawful votes, and Yohanna was
     sworn in on 25 October. Both facts are recorded, because "who won" and
     "who was declared" are different questions and a room that conflates them
     is a room that cannot read a tribunal. */
  {
    office: "Senator",
    race: "SENATE",
    territory: "SENATORIAL:02/adamawa-north",
    place: "Adamawa North",
    holder: "Amos Yohanna",
    party: "PDP",
    since: "2023-10-25",
    note:
      "INEC declared Elisha Ishaku Abbo (APC) in February 2023. The Court of Appeal sacked him on " +
      "16 October 2023, declared Yohanna the winner on lawful votes and ordered the certificate of " +
      "return withdrawn. Sworn in 25 October 2023.",
    source: "Court of Appeal, Abuja, 16 October 2023.",
  },
  {
    office: "Senator",
    race: "SENATE",
    territory: "SENATORIAL:02/adamawa-central",
    place: "Adamawa Central",
    holder: "Aminu Iya Abbas",
    party: "PDP",
    since: "2023-06-13",
    note: "Defeated the former incumbent Abdul-Aziz Nyako.",
    source: "INEC declaration, February 2023.",
  },
  {
    office: "Senator",
    race: "SENATE",
    territory: "SENATORIAL:02/adamawa-south",
    place: "Adamawa South",
    holder: "Binos Dauda Yaroe",
    party: "PDP",
    since: "2019-06-11",
    note: "Re-elected 2023.",
    source: "INEC declaration, February 2023.",
  },

  /* ── THE HOUSE OF REPRESENTATIVES ──────────────────────────────────────
     Eight constituencies, five PDP and three APC. The constituency names here
     are this product's own — read from public/geo/constituencies.json — and
     the holders are matched onto them by their local governments rather than
     by the order a list happened to be published in. */
  {
    office: "Member, House of Representatives",
    race: "REPRESENTATIVES",
    territory: "FEDERAL:02/demsa-numan-lamurde",
    place: "Demsa/Numan/Lamurde",
    holder: "Kwamoti Laori",
    party: "PDP",
    since: "2019-06-11",
    note: "Second term.",
    source: "10th National Assembly, elected February 2023.",
  },
  {
    office: "Member, House of Representatives",
    race: "REPRESENTATIVES",
    territory: "FEDERAL:02/fufore-song",
    place: "Fufore/Song",
    holder: "Aliyu Wakili Boya",
    party: "APC",
    since: "2023-06-13",
    source: "10th National Assembly, elected February 2023.",
  },
  {
    office: "Member, House of Representatives",
    race: "REPRESENTATIVES",
    territory: "FEDERAL:02/jada-ganye-mayo-belwa-toungo",
    place: "Jada/Ganye/Mayo Belwa/Toungo",
    holder: "Mohammed Inuwa Bassi",
    party: "PDP",
    since: "2023-06-13",
    source: "10th National Assembly, elected February 2023.",
  },
  {
    office: "Member, House of Representatives",
    race: "REPRESENTATIVES",
    territory: "FEDERAL:02/hong-gombi",
    place: "Hong/Gombi",
    holder: "James Shuaibu Barka",
    party: "PDP",
    since: "2023-06-13",
    source: "10th National Assembly, elected February 2023.",
  },
  {
    office: "Member, House of Representatives",
    race: "REPRESENTATIVES",
    territory: "FEDERAL:02/guyuk-shelleng",
    place: "Guyuk/Shelleng",
    holder: "Kobis Ari Thimnu",
    party: "PDP",
    since: "2023-06-13",
    source: "10th National Assembly, elected February 2023.",
  },
  {
    office: "Member, House of Representatives",
    race: "REPRESENTATIVES",
    territory: "FEDERAL:02/michika-madagali",
    place: "Michika/Madagali",
    holder: "Zakaria Dauda Nyampa",
    party: "PDP",
    since: "2019-06-11",
    note: "Second term.",
    source: "10th National Assembly, elected February 2023.",
  },
  {
    office: "Member, House of Representatives",
    race: "REPRESENTATIVES",
    territory: "FEDERAL:02/mubi-north-mubi-south-maiha",
    place: "Mubi North/Mubi South/Maiha",
    holder: "Ja'afar Abubakar Magaji",
    party: "APC",
    since: "2023-06-13",
    source: "10th National Assembly, elected February 2023.",
  },
  {
    office: "Member, House of Representatives",
    race: "REPRESENTATIVES",
    territory: "FEDERAL:02/yola-north-yola-south-girei",
    place: "Yola North/Yola South/Girei",
    holder: "Abubakar Baba Zango",
    party: "APC",
    since: "2023-06-13",
    source: "10th National Assembly, elected February 2023.",
  },
];

/**
 * The most recent local government election in the state.
 *
 * ── A CLEAN SWEEP IS A FACT, NOT A FIGURE ──────────────────────────────────
 * The PDP took all 21 chairmanships and all 226 wards. That is what was
 * announced and it is what is recorded. No per-council vote totals were
 * published by ADSIEC in any form reached here, so none are here — and a
 * sweep is precisely the result where inventing a breakdown would be most
 * tempting and least detectable, since any set of numbers with the PDP ahead
 * in all 21 would look right.
 */
export const LOCAL_GOVERNMENT = {
  race: "LGA",
  votesOn: "2026-06-13",
  declaredOn: "2026-06-15",
  by: "Adamawa State Independent Electoral Commission",
  returningOfficer: "Mohammed Umar, ADSIEC chairman",
  contested: ["PDP", "APC", "SDP", "ADC"],
  chairmanships: { total: 21, PDP: 21 },
  wards: { total: 226, PDP: 226 },
  votes: null,
  source: "ADSIEC declaration, Yola, 15 June 2026.",
  note:
    "PDP won all 21 chairmanships and all 226 councillorship seats. 21 men elected chairman and " +
    "21 women vice-chairman. No per-council vote totals were published.",
};

/**
 * Everything above that has a party attached, as one list.
 *
 * Used by the seeding script to print what it is about to load, and by the
 * tests to check that every place named in this file is a place the product
 * can actually resolve.
 */
export const HELD = SEATS.map((seat) => ({
  territory: seat.territory,
  place: seat.place,
  party: seat.party,
  holder: seat.holder,
}));
