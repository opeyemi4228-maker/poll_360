import { SOKOTO_ADC } from "./data/members-sokoto-adc.js";
import { states2023, allParties } from "./election2023.js";
import { apportion } from "./drill.js";

/**
 * Party strength on the ground: how many members, where.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  MEMBERSHIP IS NOT VOTES, AND THIS FILE WILL NOT LET THEM BE ADDED UP
 *
 *  A party's register and a party's vote are two different measurements of
 *  two different things, and the temptation to treat one as a forecast of the
 *  other is the single most expensive mistake available on this screen.
 *
 *    A member is somebody who filled in a form. They may not vote. They may
 *    vote for somebody else. Nineteen hundred of the sixty-six thousand in
 *    the Sokoto register are under eighteen and cannot lawfully vote at all.
 *
 *    A vote is a mark on a ballot, counted. It says nothing about whether the
 *    person who made it belongs to anything.
 *
 *  So the two are carried side by side, never summed, never divided into one
 *  another without the result being named for what it is, and every screen
 *  reading this is handed both figures separately with their own labels.
 *  `strengthAt` returns `members` and `votes` as two fields and there is no
 *  third field combining them.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT IS ACTUALLY HELD, STATED PLAINLY ──────────────────────────────────
 *   MEMBERS   ADC, Sokoto only, to polling-unit level. One real register.
 *             No other party and no other state has been imported, and this
 *             module says so rather than drawing them at nought.
 *   VOTES     Every party, every state, 1999 to 2026 — but by STATE only.
 *             No by-local-government vote table is published for any Nigerian
 *             election in the sources this product holds. Below a state, the
 *             only votes that exist are the ones our own agents have filed
 *             tonight, and those come from the room rather than from here.
 *
 * A screen that drew a ward's historical vote would be inventing it. This
 * module returns null for it, which is a fact, and the screen says so.
 */

/* Every register imported so far, keyed by party then state code. Adding one
   is adding a line here and running scripts/import-register.py. */
const REGISTERS = {
  ADC: { SOK: SOKOTO_ADC },
};

/** The parties this product can draw at all, whether or not it has a register. */
export const PARTIES = allParties.map((party) => ({
  id: party.id,
  name: party.name,
  /* Whether anybody has imported a membership register for them. Not a
     judgement about the party — a fact about this deployment's data. */
  registers: Object.keys(REGISTERS[party.id] ?? {}),
}));

/** The four tiers, outermost first. The one ordering every caller must use. */
export const TIERS = ["state", "lga", "ward", "unit"];

export const TIER_LABEL = {
  state: "State",
  lga: "Local government",
  ward: "Ward",
  unit: "Polling unit",
};

/** Which register, if any, covers a party in a state. */
export function registerFor(party, stateCode) {
  return REGISTERS[party]?.[stateCode] ?? null;
}

/** Every state code any register covers, for a map that must not colour the rest. */
export function coveredStates(party) {
  return Object.keys(REGISTERS[party] ?? {});
}

/**
 * The membership figure for one place.
 *
 * ── WHY NULL AND NOT ZERO, EVERY TIME ──────────────────────────────────────
 * "No register has been imported for the APC" and "the APC has no members in
 * Tambuwal" are completely different statements, and a zero says the second
 * when only the first is true. On a screen a campaign plans against, that is
 * the difference between ignoring a rival who is not there and ignoring a
 * rival nobody has counted. Null means unknown, and every screen reading this
 * prints a dash rather than a figure.
 *
 * @param path  [] for the state, [lga], [lga, ward] or [lga, ward, unit]
 */
export function membersAt(party, stateCode, path = []) {
  const register = registerFor(party, stateCode);
  if (!register) return null;

  const [lga, ward, unit] = path;
  if (!lga) return register.members;

  const inLga = register.lgas[lga];
  if (!inLga) return null;
  if (!ward) return sum(Object.values(inLga.wards).map((held) => sum(Object.values(held.units))));

  const inWard = inLga.wards[ward];
  if (!inWard) return null;
  if (!unit) return sum(Object.values(inWard.units));

  return inWard.units[unit] ?? null;
}

/**
 * The places one level below a path, with a member count each.
 *
 * Sorted biggest first, because the question asked of this list is always
 * "where are we strongest" and never "which is alphabetically first".
 */
export function childrenOf(party, stateCode, path = []) {
  const register = registerFor(party, stateCode);
  if (!register) return [];

  const [lga, ward] = path;

  let entries;
  if (!lga) {
    entries = Object.entries(register.lgas).map(([name, held]) => [
      name,
      sum(Object.values(held.wards).map((row) => sum(Object.values(row.units)))),
    ]);
  } else if (!ward) {
    const inLga = register.lgas[lga];
    if (!inLga) return [];
    entries = Object.entries(inLga.wards).map(([name, row]) => [name, sum(Object.values(row.units))]);
  } else {
    const inWard = register.lgas[lga]?.wards[ward];
    if (!inWard) return [];
    entries = Object.entries(inWard.units);
  }

  const whole = sum(entries.map(([, count]) => count)) || 1;

  return entries
    .map(([name, members]) => ({
      name,
      members,
      /* Share of the tier above, so a ward's 4% is 4% of its own local
         government and not of the state. A percentage whose denominator moves
         as you drill is the commonest way one of these screens misleads. */
      share: (members / whole) * 100,
    }))
    .sort((a, b) => b.members - a.members);
}

/** The tier a path is standing on. */
export function tierOf(path = []) {
  return TIERS[Math.min(path.length, TIERS.length - 1)];
}

/** What the children of a path are called, for a heading. */
export function childTier(path = []) {
  return TIERS[Math.min(path.length + 1, TIERS.length - 1)];
}

/**
 * The vote for one party in one state, from the published record.
 *
 * ── AND NOTHING BELOW A STATE, EVER, FROM THIS FUNCTION ────────────────────
 * No by-local-government vote table is published for any Nigerian
 * presidential or governorship election in the sources this product holds.
 * A ward's historical vote does not exist to be looked up, so this refuses to
 * return one rather than dividing a state's total by its wards — which would
 * produce a number that looks precise, is entirely invented, and would be
 * planned against.
 *
 * Votes below a state exist only where our own agents have filed them
 * tonight, and those come from the room's live rows, not from here.
 */
export function votesAt(party, stateCode, path = []) {
  if (path.length > 0) {
    return { known: false, why: "below-state" };
  }

  const state = states2023.find((row) => row.code === stateCode);
  if (!state) return { known: false, why: "no-state" };

  const index = allParties.findIndex((item) => item.id === party);

  /* ── NOT BROKEN OUT IS NOT THE SAME AS NOT KNOWN ────────────────────────
     The 2023 state table carries five columns: the four parties that mattered
     nationally, and everybody else in one bucket. The ADC contested that
     election and its vote is inside that bucket, undivided.

     "We do not have the ADC's vote in Sokoto" and "the ADC's vote in Sokoto
     is in the other column with fourteen other parties" are different
     statements, and only the second one is true. A screen that showed a dash
     for both would let a reader conclude the party did not stand. */
  if (index < 0) {
    const other = allParties.findIndex((item) => item.id === "OTH");
    const bucket = other >= 0 ? (state.votes[other] ?? 0) : 0;
    return {
      known: false,
      why: "in-other",
      bucket,
      of: state.total,
      share: state.total ? (bucket / state.total) * 100 : 0,
    };
  }

  const votes = state.votes[index] ?? 0;
  return {
    known: true,
    votes,
    of: state.total,
    share: state.total ? (votes / state.total) * 100 : 0,
  };
}


/**
 * Everything one place is worth, for one party, at once.
 *
 * The two measures side by side and never combined — see the head of this
 * file. `votes` is null below a state and the screen says why.
 */
export function strengthAt(party, stateCode, path = []) {
  return {
    tier: tierOf(path),
    path,
    members: membersAt(party, stateCode, path),
    votes: votesAt(party, stateCode, path),
    children: childrenOf(party, stateCode, path),
  };
}

/**
 * What is wrong with a register, in the words a campaign needs.
 *
 * ── A REGISTER IS EVIDENCE, AND EVIDENCE HAS DEFECTS ───────────────────────
 * Sixty-six thousand names look authoritative, and a campaign will plan
 * against the total. It should know first that nineteen hundred of those
 * people cannot lawfully vote, and that three hundred and sixty-four national
 * identification numbers appear on more than one row.
 *
 * None of these is an accusation. A repeated NIN is far more often a data
 * entry mistake than anything else, and the wording says so. But a figure
 * quoted to a director should arrive with its defects attached rather than
 * having them discovered by a journalist.
 */
export function qualityOf(party, stateCode) {
  const register = registerFor(party, stateCode);
  if (!register) return null;

  const found = register.quality ?? {};
  const outside = Object.entries(found.outsideState ?? {});

  const notes = [];

  if (found.underEighteen > 0) {
    notes.push({
      id: "under-18",
      count: found.underEighteen,
      severity: "SERIOUS",
      says: `${found.underEighteen.toLocaleString("en-NG")} members are recorded as under eighteen`,
      why: "They cannot lawfully vote, so they are members and are not votes. Counting the register as a vote target counts them twice over.",
    });
  }

  if (found.wardSpellingsMerged > 0) {
    notes.push({
      id: "ward-spellings",
      count: found.wardSpellingsMerged,
      severity: "SERIOUS",
      says: `${found.wardSpellingsMerged} ward names were the same ward written differently`,
      why: 'The ward field is free text and one ward arrives many ways — GAGI A, Gagi \'A\', GaGi A. Case and quotation marks have been folded so those count as one place; anything else is left alone, because "Gagi" and "Gagi A" may or may not be the same ward and guessing would move real people. The ward tier is still coarser than INEC\'s, which is why no vote estimate is offered below a local government.',
    });
  }

  if (found.repeatedNin > 0) {
    notes.push({
      id: "repeat-nin",
      count: found.repeatedNin,
      severity: "SERIOUS",
      says: `${found.repeatedNin} rows repeat a National Identification Number already used`,
      why: "One person cannot hold two. Usually a typing error at registration; it means the total is at most this much too high.",
    });
  }

  if (found.repeatedPhone > 0) {
    notes.push({
      id: "repeat-phone",
      count: found.repeatedPhone,
      severity: "INFO",
      says: `${found.repeatedPhone} rows share a telephone number with another row`,
      why: "Ordinary in a household or where one person registers a family. Worth knowing before the register is used as a contact list.",
    });
  }

  if (outside.length) {
    notes.push({
      id: "outside-state",
      count: outside.reduce((total, [, count]) => total + count, 0),
      severity: "INFO",
      says: `${outside.length} local government${outside.length === 1 ? "" : "s"} in this register are not in ${register.state}: ${outside.map(([name]) => name).join(", ")}`,
      why: "Filed under the wrong heading. They are excluded from every figure on this screen rather than reassigned to a guess.",
    });
  }

  if (found.noPollingUnit > 0) {
    notes.push({
      id: "no-unit",
      count: found.noPollingUnit,
      severity: "INFO",
      says: `${found.noPollingUnit} members have no polling unit recorded`,
      why: "They count towards their ward and cannot be drilled into. A member with no booth cannot be mobilised on the day.",
    });
  }

  return {
    party: register.party,
    state: register.state,
    members: register.members,
    notes,
    /* The one figure a planner should use instead of the headline, and the
       reason it is lower. Not presented as a correction of the register —
       only as what is left once the rows that cannot vote are set aside. */
    votingAge: register.members - (found.underEighteen ?? 0),
  };
}

/**
 * The age bands, in the order they are always drawn.
 *
 * `u18` is first and is not an age band like the others: it is the count of
 * people on the register who cannot lawfully vote. Every screen that draws
 * these says so, because a bar chart that puts it beside "26 to 35" invites a
 * reader to treat it as just another slice of the electorate.
 */
export const AGE_BANDS = [
  { id: "u18", label: "Under 18", short: "<18", canVote: false },
  { id: "18_25", label: "18 to 25", short: "18–25", canVote: true },
  { id: "26_35", label: "26 to 35", short: "26–35", canVote: true },
  { id: "36_50", label: "36 to 50", short: "36–50", canVote: true },
  { id: "o50", label: "Over 50", short: "50+", canVote: true },
];

/**
 * Who the members in one place are: the gender split and the age bands.
 *
 * ── HELD AT TWO TIERS, AND NULL AT THE THIRD ───────────────────────────────
 * The importer counts these for every local government and every ward, and
 * deliberately not for a polling unit: seven counters across 7,433 booths is a
 * large file to answer a question nobody asks of one booth, whose own total is
 * on the map already.
 *
 * So this returns null below a ward rather than a row of zeroes, and the card
 * that draws it says the register holds a count and no breakdown there. An
 * empty chart and an absent one look the same to a reader unless one of them
 * says which it is.
 */
export function demographicsAt(party, stateCode, path = []) {
  const register = registerFor(party, stateCode);
  if (!register) return null;

  const [lga, ward, unit] = path;

  /* A polling unit has a count and nothing else. */
  if (unit) return null;

  const held = ward ? register.lgas[lga]?.wards[ward] : lga ? register.lgas[lga] : null;

  /* The whole state is the sum of its local governments, computed here rather
     than stored, so the state and its parts can never disagree. */
  const source = held ?? (lga ? null : rollUp(register));
  if (!source?.gender || !source?.ages) return null;

  const men = source.gender.male ?? 0;
  const women = source.gender.female ?? 0;
  const total = men + women;
  if (!total) return null;

  const bands = AGE_BANDS.map((band) => ({
    ...band,
    count: source.ages[band.id] ?? 0,
    share: ((source.ages[band.id] ?? 0) / total) * 100,
  }));

  const under = bands.find((band) => band.id === "u18")?.count ?? 0;
  const over50 = bands.find((band) => band.id === "o50")?.count ?? 0;

  return {
    total,
    men,
    women,
    /* Shares of the people counted here, so the two always reach 100. */
    menShare: (men / total) * 100,
    womenShare: (women / total) * 100,
    bands,
    /* The two figures a campaign asks for by name. Under 18 is the one that
       cannot vote; over 50 is the one that reliably does. */
    cannotVote: under,
    over50,
    over50Share: (over50 / total) * 100,
    votingAge: total - under,
  };
}

/** The state's own totals, summed from its local governments. */
function rollUp(register) {
  const gender = {};
  const ages = {};
  for (const held of Object.values(register.lgas)) {
    for (const [key, value] of Object.entries(held.gender ?? {})) gender[key] = (gender[key] ?? 0) + value;
    for (const [key, value] of Object.entries(held.ages ?? {})) ages[key] = (ages[key] ?? 0) + value;
  }
  return { gender, ages };
}

/* ══════════════════════════════════════════════════════════════════════════
   HOW STRONG IS STRONG

   ── WHY A FIXED PERCENTAGE WOULD BE WRONG AT EVERY TIER BUT ONE ───────────
   "Under 10% is weak" is the obvious rule and it is only true somewhere. A
   state has 23 local governments, so an even split is 4.3% each and nothing
   ever reaches 10%: every local government in Nigeria would be drawn weak. A
   ward with four polling units splits 25% each, so on the same rule every
   booth in it is strong. The same number means opposite things one tier apart.

   So a place is measured against the even split of its own tier — 100 divided
   by however many siblings it has. Twice the even share is a real
   concentration whether that is 8.6% of a state or 50% of a ward, and half of
   it is genuinely thin in both. The rule travels.

   ── AND ONE ABSOLUTE FLOOR, BECAUSE A SHARE CAN FLATTER ───────────────────
   Eight members out of twenty in a ward is 40% and reads as a stronghold. It
   is eight people. Below ten members a place is drawn as bare however large
   its share, because a share of almost nothing is still almost nothing — and
   this is the band a campaign asked to see, by name.
   ══════════════════════════════════════════════════════════════════════════ */

/** The floor below which a share stops meaning anything. */
export const BARE_MEMBERS = 10;

/**
 * The bands, weakest first. `fill` is the colour every surface draws them in,
 * so the map, the list and the legend cannot disagree about what amber means.
 */
export const STRENGTH = [
  {
    id: "BARE",
    label: "Under ten",
    fill: "var(--color-strength-bare)",
    why: `Fewer than ${BARE_MEMBERS} members. Whatever share that is of the place, it is not an organisation.`,
  },
  {
    id: "THIN",
    label: "Thin",
    fill: "var(--color-strength-thin)",
    why: "Less than half the even share of its tier. Somewhere the party is present and not established.",
  },
  {
    id: "BELOW",
    label: "Below average",
    fill: "var(--color-strength-below)",
    why: "Between half and one even share.",
  },
  {
    id: "ABOVE",
    label: "Above average",
    fill: "var(--color-strength-above)",
    why: "Between one and twice the even share.",
  },
  {
    id: "HEAVY",
    label: "Concentration",
    fill: "var(--color-strength-heavy)",
    why: "More than twice the even share of its tier. The party's weight here is real.",
  },
];

export const STRENGTH_OF = Object.fromEntries(STRENGTH.map((band) => [band.id, band]));

/**
 * Which band a place falls in.
 *
 * @param members  how many are there
 * @param share    its share of the tier above, as a percentage
 * @param siblings how many places share that tier, which sets the even split
 */
export function strengthBand(members, share, siblings) {
  if (members === null || members === undefined) return null;
  if (members < BARE_MEMBERS) return "BARE";

  const even = siblings > 0 ? 100 / siblings : 100;
  const times = share / even;

  if (times < 0.5) return "THIN";
  if (times < 1) return "BELOW";
  if (times < 2) return "ABOVE";
  return "HEAVY";
}

/* ══════════════════════════════════════════════════════════════════════════
   THE REGISTER AGAINST THE RESULT

   ── WHAT THIS RATIO IS, AND WHAT IT IS NOT ───────────────────────────────
   Members over votes. If a party holds 66,474 members in a state where a
   candidate took 288,679 votes, the register is 23% the size of that vote.

   It is a measure of organisation against demonstrated support, and it is
   emphatically not a forecast. A register of 66,474 does not become 66,474
   votes: 1,900 of those people cannot lawfully vote, and the rest may not
   turn out or may vote for somebody else. The number is useful for exactly
   one thing — telling a campaign where its organisation is heavy or light
   relative to where the votes actually were.

   ── THE DENOMINATOR IS COUNTED AT ONE TIER AND MODELLED BELOW IT ─────────
   Members go down to a polling unit; published votes stop at the state,
   because no Nigerian election publishes one below it. So the ratio is a
   measurement at the state and an estimate under it, built by apportioning
   the declared state total down through the register's own real places — the
   same thing every map in this room does, under the doctrine at the head of
   lib/drill.js: it sums back to the declared figure at every tier, it is
   seeded by place name so it never moves between refreshes, and it is
   labelled an estimate wherever it is drawn.

   `estimated` is on every result for that reason, and no screen may draw one
   without saying which of the two it is.
   ══════════════════════════════════════════════════════════════════════════ */

/** Every candidate a ratio can be measured against, with their party. */
export const CANDIDATES = allParties
  .filter((party) => party.id !== "OTH")
  .map((party) => ({ id: party.id, party: party.id, name: party.candidate, partyName: party.name }));

/**
 * The register measured against one candidate's vote.
 *
 * @param against  a party id whose candidate's vote is the denominator
 */
/**
 * That candidate's vote in one place, real at the state and estimated below it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS ALLOWED TO GO BELOW A STATE WHEN `votesAt` IS NOT
 *
 *  `votesAt` answers "what was published", and nothing was published below a
 *  state. This answers a different question — "what would this place have
 *  given him" — and it answers it by apportioning the state's real declared
 *  total down through its real places, which is what this product already does
 *  on every map in the room. See the head of lib/drill.js for the doctrine:
 *  the split always sums back to the declared figure, it is seeded from each
 *  place's own name so it never changes between refreshes or machines, and it
 *  is labelled an estimate everywhere it is drawn.
 *
 *  The two functions are kept apart rather than merged because the difference
 *  between them is the difference between a fact and a model, and a caller has
 *  to choose which one it is asking for. Everything returned here carries
 *  `estimated: true` below the state line, and every screen prints it.
 * ══════════════════════════════════════════════════════════════════════════
 */
export function candidateVoteAt(party, stateCode, against, path = []) {
  const published = votesAt(against, stateCode, []);
  if (!published.known) return { known: false, why: published.why };

  if (path.length === 0) {
    return { known: true, estimated: false, votes: published.votes, of: published.of };
  }

  const register = registerFor(party, stateCode);
  if (!register) return { known: false, why: "no-register" };

  /* ── AND IT STOPS AT THE LOCAL GOVERNMENT ─────────────────────────────
     Apportioning is only honest while the places being split across are the
     real ones. A state's 23 local governments are real and their names match
     INEC's, so a split across them is the estimate lib/drill.js describes.

     A ward is not. The register's ward field is a free-text box: Sokoto South
     has eleven wards and the register writes them ninety-five ways, and even
     folded to their tidy form the party's wards do not map one-to-one onto
     INEC's. Splitting a state's votes across them produces a denominator with
     no relationship to any ward that exists — which is how a ward came out at
     eleven hundred per cent before this guard existed.

     Members are still real all the way down; it is the vote half that stops
     here, and the screen shows the half it has. */
  if (path.length > 1) return { known: false, why: "below-lga" };

  /* Walk down one tier at a time, splitting the tier above across its real
     children. The names are the register's own, so a place that exists in the
     register is a place this can reach — and the sum at every tier is the
     figure the tier above holds. */
  let votes = published.votes;
  let cast = published.of;
  let walked = [];

  for (const step of path) {
    const siblings = childrenOf(party, stateCode, walked).map((row) => row.name);
    if (!siblings.length) return { known: false, why: "no-children" };

    const index = siblings.indexOf(step);
    if (index < 0) return { known: false, why: "not-here" };

    /* `apportion` splits several parties at once; this needs one, so the
       candidate's vote and the rest of the cast go in as two columns. Both
       sum back, which is what keeps the estimate consistent with its parent. */
    const parts = apportion({
      names: siblings,
      votes: [votes, Math.max(0, cast - votes)],
      booths: siblings.length,
      registered: 0,
      parentKey: `${stateCode}:${against}:${walked.join("/")}`,
    });

    votes = parts[index].votes[0];
    cast = parts[index].votes[0] + parts[index].votes[1];
    walked = [...walked, step];
  }

  return { known: true, estimated: true, votes, of: cast };
}

/**
 * The register measured against one candidate's vote.
 *
 * @param against  a party id whose candidate's vote is the denominator
 */
export function ratioAt(party, stateCode, against, path = []) {
  const members = membersAt(party, stateCode, path);
  if (members === null) return { known: false, why: "no-register" };

  const vote = candidateVoteAt(party, stateCode, against, path);
  if (!vote.known) return { known: false, why: vote.why, members };

  const candidate = CANDIDATES.find((row) => row.id === against) ?? null;

  /* The voting-age numerator is only known where the register carries a
     breakdown — a local government and a ward, never a booth. */
  const seen = demographicsAt(party, stateCode, path);
  const votingAge = seen ? seen.votingAge : null;

  return {
    known: true,
    /* True below the state line: the denominator is apportioned from the
       declared state total, not counted here. Every screen prints this. */
    estimated: vote.estimated,
    members,
    votingAge,
    votes: vote.votes,
    of: vote.of,
    share: vote.of ? (vote.votes / vote.of) * 100 : 0,
    candidate,
    /* Members per hundred of that candidate's vote. */
    ratio: vote.votes ? (members / vote.votes) * 100 : null,
    votingAgeRatio: vote.votes && votingAge !== null ? (votingAge / vote.votes) * 100 : null,
  };
}


/** What the whole set covers, for a caption that has to be exactly true. */
export function coverage() {
  const rows = [];
  for (const [party, states] of Object.entries(REGISTERS)) {
    for (const [code, register] of Object.entries(states)) {
      rows.push({
        party,
        stateCode: code,
        state: register.state,
        members: register.members,
        lgas: Object.keys(register.lgas).length,
        wards: sum(Object.values(register.lgas).map((held) => Object.keys(held.wards).length)),
        units: sum(
          Object.values(register.lgas).map((held) =>
            sum(Object.values(held.wards).map((row) => Object.keys(row.units).length))
          )
        ),
      });
    }
  }
  return rows;
}

const sum = (values) => values.reduce((total, value) => total + value, 0);
