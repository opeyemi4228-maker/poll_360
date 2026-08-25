/**
 * Who governs each state, and under which party.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO ANSWERS, BECAUSE THERE ARE TWO QUESTIONS.
 *
 *  "Which party holds this state" and "which party won it" stopped being the
 *  same question in 2025. Governors defect, and in Nigeria they defect in
 *  numbers: a state can be PDP on every published election map and APC in
 *  the chamber. A product that shows one figure and calls it the ruling party
 *  is wrong for half the states it draws, and wrong in the direction that
 *  flatters whoever is currently in office.
 *
 *  So every row carries the party the governor was ELECTED under and the
 *  party they SIT under, with the date they moved and how well attested the
 *  move is. The map can then answer either question and say which it is
 *  answering.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── HOW SURE THIS IS ───────────────────────────────────────────────────────
 * Election results are matters of record and are held with confidence.
 * Defections are political events reported in the press, sometimes announced
 * and later walked back, and they are dated and graded rather than asserted
 * flatly. A move graded `reported` is NOT applied to the colour: it is listed
 * separately, because turning a state a different colour on the strength of a
 * headline is exactly how a wall chart becomes an argument.
 *
 * Verify before broadcast. This is a transcription of public record and
 * reporting, not a feed from anybody's registry.
 */

/** Governors, by state, as elected. */
export const GOVERNORS = [
  /* ── North Central ─────────────────────────────────────────────────────── */
  { code: "BEN", state: "Benue", governor: "Hyacinth Alia", elected: "APC", votedOn: "2023-03-18" },
  { code: "KOG", state: "Kogi", governor: "Ahmed Usman Ododo", elected: "APC", votedOn: "2023-11-11" },
  { code: "KWA", state: "Kwara", governor: "AbdulRahman AbdulRazaq", elected: "APC", votedOn: "2023-03-18" },
  { code: "NAS", state: "Nasarawa", governor: "Abdullahi Sule", elected: "APC", votedOn: "2023-03-18" },
  { code: "NIG", state: "Niger", governor: "Mohammed Umaru Bago", elected: "APC", votedOn: "2023-03-18" },
  { code: "PLA", state: "Plateau", governor: "Caleb Mutfwang", elected: "PDP", votedOn: "2023-03-18" },

  /* ── North East ────────────────────────────────────────────────────────── */
  { code: "ADA", state: "Adamawa", governor: "Ahmadu Umaru Fintiri", elected: "PDP", votedOn: "2023-03-18" },
  { code: "BAU", state: "Bauchi", governor: "Bala Mohammed", elected: "PDP", votedOn: "2023-03-18" },
  { code: "BOR", state: "Borno", governor: "Babagana Umara Zulum", elected: "APC", votedOn: "2023-03-18" },
  { code: "GOM", state: "Gombe", governor: "Muhammadu Inuwa Yahaya", elected: "APC", votedOn: "2023-03-18" },
  { code: "TAR", state: "Taraba", governor: "Agbu Kefas", elected: "PDP", votedOn: "2023-03-18" },
  { code: "YOB", state: "Yobe", governor: "Mai Mala Buni", elected: "APC", votedOn: "2023-03-18" },

  /* ── North West ────────────────────────────────────────────────────────── */
  { code: "JIG", state: "Jigawa", governor: "Umar Namadi", elected: "APC", votedOn: "2023-03-18" },
  { code: "KAD", state: "Kaduna", governor: "Uba Sani", elected: "APC", votedOn: "2023-03-18" },
  { code: "KAN", state: "Kano", governor: "Abba Kabir Yusuf", elected: "NNPP", votedOn: "2023-03-18" },
  { code: "KAT", state: "Katsina", governor: "Dikko Umaru Radda", elected: "APC", votedOn: "2023-03-18" },
  { code: "KEB", state: "Kebbi", governor: "Nasir Idris", elected: "APC", votedOn: "2023-03-18" },
  { code: "SOK", state: "Sokoto", governor: "Ahmed Aliyu", elected: "APC", votedOn: "2023-03-18" },
  { code: "ZAM", state: "Zamfara", governor: "Dauda Lawal", elected: "PDP", votedOn: "2023-03-18" },

  /* ── South East ────────────────────────────────────────────────────────── */
  { code: "ABI", state: "Abia", governor: "Alex Otti", elected: "LP", votedOn: "2023-03-18" },
  { code: "ANA", state: "Anambra", governor: "Charles Soludo", elected: "APGA", votedOn: "2025-11-08" },
  { code: "EBO", state: "Ebonyi", governor: "Francis Nwifuru", elected: "APC", votedOn: "2023-03-18" },
  { code: "ENU", state: "Enugu", governor: "Peter Mbah", elected: "PDP", votedOn: "2023-03-18" },
  { code: "IMO", state: "Imo", governor: "Hope Uzodinma", elected: "APC", votedOn: "2023-11-11" },

  /* ── South South ───────────────────────────────────────────────────────── */
  { code: "AKW", state: "Akwa Ibom", governor: "Umo Eno", elected: "PDP", votedOn: "2023-03-18" },
  { code: "BAY", state: "Bayelsa", governor: "Douye Diri", elected: "PDP", votedOn: "2023-11-11" },
  { code: "CRO", state: "Cross River", governor: "Bassey Otu", elected: "APC", votedOn: "2023-03-18" },
  { code: "DEL", state: "Delta", governor: "Sheriff Oborevwori", elected: "PDP", votedOn: "2023-03-18" },
  { code: "EDO", state: "Edo", governor: "Monday Okpebholo", elected: "APC", votedOn: "2024-09-21" },
  { code: "RIV", state: "Rivers", governor: "Siminalayi Fubara", elected: "PDP", votedOn: "2023-03-18" },

  /* ── South West ────────────────────────────────────────────────────────── */
  { code: "EKI", state: "Ekiti", governor: "Biodun Oyebanji", elected: "APC", votedOn: "2026-06-20" },
  { code: "LAG", state: "Lagos", governor: "Babajide Sanwo-Olu", elected: "APC", votedOn: "2023-03-18" },
  { code: "OGU", state: "Ogun", governor: "Dapo Abiodun", elected: "APC", votedOn: "2023-03-18" },
  { code: "OND", state: "Ondo", governor: "Lucky Aiyedatiwa", elected: "APC", votedOn: "2024-11-16" },
  /* Re-elected 15 August 2026 on the Accord platform, having first won in
     2022 on the PDP. Not a defection: he faced the electorate under the new
     party and won, 511,067 to the APC's 444,815. So Osun is Accord on BOTH
     answers, which is why it carries no move below. */
  { code: "OSU", state: "Osun", governor: "Ademola Adeleke", elected: "ACCORD", votedOn: "2026-08-15" },
  { code: "OYO", state: "Oyo", governor: "Seyi Makinde", elected: "PDP", votedOn: "2023-03-18" },
];

/**
 * The Federal Capital Territory has no governor and never has.
 *
 * It is administered by a minister appointed by the president, so "ruling
 * party" is a category error there. Drawn as its own thing rather than
 * coloured in with the states, because filling it in with the federal
 * governing party would be inventing an office that does not exist.
 */
export const FCT = {
  code: "FCT",
  state: "Federal Capital Territory",
  administrator: "Minister of the Federal Capital Territory",
  note: "No governor. Administered by a federal minister, so it has no ruling party in the sense the rest of this map uses.",
};

/**
 * Defections since the elections above.
 *
 * `settled` moves are applied to the map. `reported` ones are not: they are
 * listed so a room can see them coming, and a colour is not changed on the
 * strength of a headline.
 */
export const DEFECTIONS = [
  /* All eight moved in the same direction, to the party in power federally,
     and all eight were verified against a dated report naming the ceremony or
     the broadcast rather than against a claim about a total. Where a governor
     was formally received by the President or Vice President that is recorded,
     because a national reception is the strongest attestation on offer. */
  {
    code: "DEL",
    to: "APC",
    on: "2025-04-23",
    grade: "settled",
    note: "Announced with the state party structure, deputy and senior officials.",
    source: "Widely reported, April 2025.",
  },
  {
    code: "AKW",
    to: "APC",
    on: "2025-06-06",
    grade: "settled",
    note: "Announced at a public reception in Uyo after months of speculation.",
    source: "Widely reported, June 2025.",
  },
  {
    code: "ENU",
    to: "APC",
    on: "2025-10-01",
    grade: "settled",
    note: "Moved with the commissioners and the elected chairmen of all 17 local governments.",
    source: "Premium Times, October 2025.",
  },
  {
    code: "BAY",
    to: "APC",
    on: "2025-11-03",
    grade: "settled",
    note: "Resigned from the PDP on 15 October and was received in Yenagoa. Welcomed publicly by the President.",
    source: "Channels Television, 3 November 2025.",
  },
  {
    code: "RIV",
    to: "APC",
    on: "2025-12-09",
    grade: "settled",
    /* The one asterisk in this list. He declared it himself, repeatedly and on
       the record, and took a membership card from the state chairman, but he
       was never formally received nationally the way the other seven were. It
       is settled on his own word, which is enough to colour a state, and the
       gap is recorded rather than smoothed over. */
    note: "Declared on the record and given a state membership card, but never formally received by the national leadership as the others were.",
    source: "Channels Television and Vanguard, 9 December 2025.",
  },
  {
    code: "PLA",
    to: "APC",
    on: "2026-01-02",
    grade: "settled",
    note: "Membership card presented by the state chairman.",
    source: "The Authority, 2 January 2026.",
  },
  {
    code: "TAR",
    to: "APC",
    on: "2026-01-31",
    grade: "settled",
    note: "Twice postponed from November 2025. Formally received by the Vice President in Jalingo.",
    source: "The Telegraph Nigeria, 31 January 2026.",
  },
  {
    code: "ADA",
    to: "APC",
    on: "2026-02-27",
    grade: "settled",
    note: "Announced in a statewide broadcast from Yola, with the cabinet and structures across 14 local governments.",
    source: "Guardian Nigeria and TheCable, 27 February 2026.",
  },

  {
    /* The state that had been the clearest counter-example to the drift: won
       by the NNPP in 2023 against the party in power federally, and the only
       NNPP governorship in the country. Its councils are still NNPP, elected
       in October 2024 and not up again until 2028 — see lib/lga-control.js,
       where Kano is now the sharpest case against reading a state's councils
       off its governor. */
    code: "KAN",
    to: "APC",
    on: "2026-02-17",
    grade: "settled",
    note: "Resigned from the NNPP on 23 January with 21 lawmakers, then received at a ceremony in Kano on 17 February. The NNPP called it a betrayal.",
    source: "Sahara Reporters, 23 January 2026; Kano State Government and APC, 17 February 2026.",
  },
  {
    /* The last PDP governor. With this one the party that came second in the
       2023 presidential election holds no state at all. */
    code: "ZAM",
    to: "APC",
    on: "2026-03-09",
    grade: "settled",
    note: "Announced from the government house in Gusau, citing the PDP's leadership litigation. Received by the Vice President and ten governors the following day.",
    source: "Vanguard and The Telegraph Nigeria, 9 March 2026.",
  },

  /* ── AND TWO THAT DID NOT GO TO THE APC ──────────────────────────────────
     Worth stating plainly, because "governors are defecting" had until May
     2026 meant one thing only. These two left the PDP for the APM, which is
     a different fact with a different colour, and a map that had quietly
     assumed every move ran one way would have drawn both of them blue. */
  {
    code: "BAU",
    to: "APM",
    on: "2026-05-02",
    grade: "settled",
    note: "Left the PDP citing its leadership crisis, with the Turaki-aligned state executive. Four Bauchi federal lawmakers followed.",
    source: "Channels Television, Vanguard and Sahara Reporters, 2 May 2026.",
  },
  {
    code: "OYO",
    to: "APM",
    on: "2026-05-02",
    grade: "settled",
    note: "Moved to the APM in the same realignment as Bauchi. The APM confirmed both receptions.",
    source: "Vanguard and Blueprint, May 2026.",
  },
];

const SETTLED = new Map(
  DEFECTIONS.filter((row) => row.grade === "settled").map((row) => [row.code, row])
);

/** Every state with both answers, and the move between them if there was one. */
export function ruling() {
  return GOVERNORS.map((row) => {
    const moved = SETTLED.get(row.code) ?? null;
    return {
      ...row,
      current: moved ? moved.to : row.elected,
      moved,
      /* Reported but not applied, so a panel can flag it without colouring it. */
      rumoured: DEFECTIONS.find((d) => d.code === row.code && d.grade === "reported") ?? null,
    };
  });
}

/** Seats per party, on either question. */
export function seatsBy(which = "current") {
  const tally = {};
  for (const row of ruling()) {
    const party = row[which];
    tally[party] = (tally[party] ?? 0) + 1;
  }
  return Object.entries(tally)
    .map(([party, seats]) => ({ party, seats }))
    .sort((a, b) => b.seats - a.seats);
}

/** What changed hands without an election. */
export function crossedFloor() {
  return ruling().filter((row) => row.moved);
}
