import { ADC_INDEX } from "./data/members-adc-index.js";
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
 *   MEMBERS   ADC, all 36 states and the Federal Capital Territory, to
 *             polling-unit level. One real register, imported from the party's
 *             own published state registers. No other party has been imported,
 *             and this module says so rather than drawing them at nought.
 *   VOTES     Every party, every state, 1999 to 2026 — but by STATE only.
 *             No by-local-government vote table is published for any Nigerian
 *             election in the sources this product holds. Below a state, the
 *             only votes that exist are the ones our own agents have filed
 *             tonight, and those come from the room rather than from here.
 *
 * A screen that drew a ward's historical vote would be inventing it. This
 * module returns null for it, which is a fact, and the screen says so.
 */

/* ══════════════════════════════════════════════════════════════════════════
   TWO TIERS SHIPPED, AND WHY THE SPLIT IS NOT AN OPTIMISATION

   The national ADC register is a few million rows. Reduced to counts it is
   still several megabytes of polling-unit detail, and this module is imported
   by a client component, so every byte of it would be downloaded by every
   person who opened the dashboard — including the overwhelming majority who
   look at the map and never open a single ward.

   So it arrives in two pieces:

     THE INDEX     every state and all 774 local governments, with a count, a
                   gender split and an age split each. Loaded eagerly, because
                   it is what the map draws, and it is small.

     THE DETAIL    one file per state, carrying the wards and the polling
                   units. Fetched when somebody opens that state, and kept.

   ── AND THE PART THAT MATTERS FOR CORRECTNESS ────────────────────────────
   A tier that has not been fetched is UNKNOWN, and unknown is null — the same
   null this module already returns for a state nobody has imported, and for
   the same reason. It is never zero. A ward drawn at nought because its file
   is still in flight is a ward a campaign writes off, and it would right
   itself a second later with nobody the wiser about what they just saw.

   `hasDetail` is exported so a screen can tell the two apart and say "still
   loading" rather than "no members", which are different sentences.
   ══════════════════════════════════════════════════════════════════════════ */

/** The eagerly-loaded national index, keyed by party. */
const INDEX = {
  ADC: ADC_INDEX,
};

/* ══════════════════════════════════════════════════════════════════════════
   ONE LINE PER STATE, WRITTEN OUT, AND WHY IT IS NOT A TEMPLATE STRING

   `import(`./data/members-${code}-adc.js`)` would say the same thing in one
   line and is the obvious way to write this. It is not written that way
   because a bundler cannot follow it: a specifier it cannot read at build
   time either fails to resolve or is resolved by bundling every file the
   pattern could match into the page — which is precisely the several
   megabytes this split exists to avoid, arriving silently and only in the
   production build.

   Spelled out, each entry is a specifier every bundler can see, so each one
   becomes its own chunk. A line per state is the cost, and the list is fixed:
   Nigeria's states are not added to often.

   ── AND IT LISTS ONLY THE REGISTERS THAT EXIST ───────────────────────────
   28 of the 37. A specifier for a file that is not on disk is not a
   graceful absence — it is a build failure, which is exactly how this list
   was found wrong: it named all thirty-seven while 9 had never been
   imported, and the module would not compile.

   The 9 missing are ANA, BAU, BOR, EDO, FCT, KAN, KWA, OSU, TAR.
   They are absent from the index too, so `membersAt` answers null for them —
   unknown, which is true. Adding a line here without the file, or a zero
   there without the register, would both draw a state where the ADC has no
   members, and nobody has made that claim.

   Generated alongside lib/data/members-adc-index.js by
   scripts/build-member-index.mjs; re-run it after importing a new state.
   ══════════════════════════════════════════════════════════════════════════ */
const FILES = {
  ADC: {
    ABI: () => import("./data/members-abi-adc.js"),
    ADA: () => import("./data/members-ada-adc.js"),
    AKW: () => import("./data/members-akw-adc.js"),
    BAY: () => import("./data/members-bay-adc.js"),
    BEN: () => import("./data/members-ben-adc.js"),
    CRO: () => import("./data/members-cro-adc.js"),
    DEL: () => import("./data/members-del-adc.js"),
    EBO: () => import("./data/members-ebo-adc.js"),
    EKI: () => import("./data/members-eki-adc.js"),
    ENU: () => import("./data/members-enu-adc.js"),
    GOM: () => import("./data/members-gom-adc.js"),
    IMO: () => import("./data/members-imo-adc.js"),
    JIG: () => import("./data/members-jig-adc.js"),
    KAD: () => import("./data/members-kad-adc.js"),
    KAT: () => import("./data/members-kat-adc.js"),
    KEB: () => import("./data/members-keb-adc.js"),
    KOG: () => import("./data/members-kog-adc.js"),
    LAG: () => import("./data/members-lag-adc.js"),
    NAS: () => import("./data/members-nas-adc.js"),
    NIG: () => import("./data/members-nig-adc.js"),
    OGU: () => import("./data/members-ogu-adc.js"),
    OND: () => import("./data/members-ond-adc.js"),
    OYO: () => import("./data/members-oyo-adc.js"),
    PLA: () => import("./data/members-pla-adc.js"),
    RIV: () => import("./data/members-riv-adc.js"),
    SOK: () => import("./data/members-sok-adc.js"),
    YOB: () => import("./data/members-yob-adc.js"),
    ZAM: () => import("./data/members-zam-adc.js"),
  },
};

/** State files fetched so far, keyed "PARTY:CODE". */
const DETAIL = new Map();
/** Fetches in flight, so two screens asking at once make one request. */
const INFLIGHT = new Map();
/** Callers to tell when a state file lands. */
const WATCHERS = new Set();

const keyOf = (party, stateCode) => `${party}:${stateCode}`;

/**
 * The state summary as it comes from the index, shaped like a register.
 *
 * `detail: false` is the flag every function below checks before reaching for
 * a ward. Without it the shapes are indistinguishable and a ward lookup would
 * read `undefined.wards` on a state that simply has not been fetched yet.
 */
function fromIndex(party, stateCode) {
  const held = INDEX[party]?.states?.[stateCode];
  if (!held) return null;
  return { ...held, party, detail: false };
}

/**
 * Whether the wards and polling units of a state are in hand.
 *
 * A screen drilling below a local government must check this. False does not
 * mean empty — it means not yet fetched.
 */
export function hasDetail(party, stateCode) {
  return DETAIL.has(keyOf(party, stateCode));
}

/**
 * Fetch one state's wards and polling units.
 *
 * Safe to call repeatedly and from several components at once: a state already
 * held resolves immediately, and a fetch already in flight is joined rather
 * than started again.
 *
 * A state that cannot be fetched resolves to null rather than throwing. The
 * screen keeps its index figures and says the detail is unavailable, which is
 * true, instead of collapsing.
 */
export function loadDetail(party, stateCode) {
  if (!party || !stateCode) return Promise.resolve(null);
  const key = keyOf(party, stateCode);

  if (DETAIL.has(key)) return Promise.resolve(DETAIL.get(key));
  if (INFLIGHT.has(key)) return INFLIGHT.get(key);
  if (!INDEX[party]?.states?.[stateCode]) return Promise.resolve(null);

  const open = FILES[party]?.[stateCode];
  if (!open) return Promise.resolve(null);

  const fetching = open()
    .then((module) => {
      const register = module[`${stateCode}_${party}`] ?? Object.values(module)[0] ?? null;
      if (register) {
        DETAIL.set(key, { ...register, party, detail: true });
        for (const tell of WATCHERS) tell(party, stateCode);
      }
      return DETAIL.get(key) ?? null;
    })
    .catch(() => null)
    .finally(() => INFLIGHT.delete(key));

  INFLIGHT.set(key, fetching);
  return fetching;
}

/**
 * Be told when a state file lands, so a screen can re-render.
 *
 * Returns the function that stops watching. React components must call it on
 * unmount or this set grows for the life of the page.
 */
export function watchDetail(tell) {
  WATCHERS.add(tell);
  return () => WATCHERS.delete(tell);
}

/** The parties this product can draw at all, whether or not it has a register. */
export const PARTIES = allParties.map((party) => ({
  id: party.id,
  name: party.name,
  /* Whether anybody has imported a membership register for them. Not a
     judgement about the party — a fact about this deployment's data. */
  registers: Object.keys(INDEX[party.id]?.states ?? {}),
}));

/** The four tiers, outermost first. The one ordering every caller must use. */
export const TIERS = ["state", "lga", "ward", "unit"];

export const TIER_LABEL = {
  state: "State",
  lga: "Local government",
  ward: "Ward",
  unit: "Polling unit",
};

/**
 * Which register, if any, covers a party in a state.
 *
 * The fetched state file when there is one, the national index's summary of
 * that state otherwise. Both carry the state and local government tiers; only
 * the first carries wards and polling units, and `detail` says which is which.
 */
export function registerFor(party, stateCode) {
  return DETAIL.get(keyOf(party, stateCode)) ?? fromIndex(party, stateCode);
}

/** Every state code any register covers, for a map that must not colour the rest. */
export function coveredStates(party) {
  return Object.keys(INDEX[party]?.states ?? {});
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
  if (!ward) return inLga.members ?? null;

  /* ── BELOW A LOCAL GOVERNMENT, THE STATE FILE IS REQUIRED ──────────────
     Null, not nought. A ward whose file has not been fetched is a ward whose
     membership is unknown, which is what null means everywhere else in this
     module. Returning nought would draw it as a place with no members, and a
     campaign reading that would write off somewhere it had simply not
     downloaded yet. `hasDetail` tells a screen which of the two it is. */
  if (!inLga.wards) return null;

  const inWard = inLga.wards[ward];
  if (!inWard) return null;
  if (!unit) return inWard.members ?? null;

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
    entries = Object.entries(register.lgas).map(([name, held]) => [name, held.members ?? 0]);
  } else if (!ward) {
    const inLga = register.lgas[lga];
    /* No wards held means the state file is not in yet. An empty list is the
       honest answer to "what is below here" — the screen shows it is still
       fetching rather than a local government with nothing in it. */
    if (!inLga?.wards) return [];
    entries = Object.entries(inLga.wards).map(([name, row]) => [name, row.members ?? 0]);
  } else {
    const inWard = register.lgas[lga]?.wards?.[ward];
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

  const personal = (found.personalInUnitField ?? 0) + (found.personalInWardField ?? 0);
  if (personal > 0) {
    notes.push({
      id: "personal-in-place",
      count: personal,
      severity: "SERIOUS",
      /* ── A PRIVACY FAILURE, NOT A TIDINESS ONE ─────────────────────────
         A place name is published on a screen. A National Identification
         Number is not. Somebody typing one into the ward box at registration
         puts it on a dashboard, and this is the only note here that is about
         a risk to a member rather than to a figure. */
      says: `${personal} place name${personal === 1 ? " was" : "s were"} an identification or telephone number rather than a place`,
      why: "Typed into the wrong box at registration. The field is dropped rather than published, because a ward name appears on this screen and a National Identification Number must not. The members still count towards the tier above; what is lost is the location the register failed to record.",
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

  const resolved = Object.entries(found.lgaSpellingsResolved ?? {});
  if (resolved.length) {
    notes.push({
      id: "lga-spellings",
      count: resolved.length,
      severity: "INFO",
      /* ── A FOLD NOBODY CAN SEE IS STILL A SILENT FOLD ──────────────────
         Every one of these moved somebody's membership from the heading the
         register wrote to the name the map draws. Most are trivial — a
         hyphen, a doubled letter — but some are a heading that ran into the
         column beside it, and all of them are decisions made by a script
         about where a real person is. They are listed so a human can check
         them rather than discovering one by wondering why a local government
         is empty. */
      says: `${resolved.length} local government heading${resolved.length === 1 ? "" : "s"} in this register are spelled differently from the map: ${resolved
        .slice(0, 4)
        .map(([raw, to]) => `${raw} → ${to}`)
        .join(", ")}${resolved.length > 4 ? ` and ${resolved.length - 4} more` : ""}`,
      why: "Matched to the map's name where exactly one local government in the state was close enough to be certain — a hyphen, a doubled letter, two letters the wrong way round, or a heading that ran into the ward column beside it. Anything that could have been two places was left out instead, and counted above.",
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

  const held = ward ? register.lgas[lga]?.wards?.[ward] : lga ? register.lgas[lga] : null;

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
  for (const [party, held] of Object.entries(INDEX)) {
    for (const [code, state] of Object.entries(held.states ?? {})) {
      rows.push({
        party,
        stateCode: code,
        state: state.state,
        members: state.members,
        /* Counted when the register was imported rather than measured here,
           so the caption is right whether or not that state's wards have been
           fetched into this browser yet. */
        lgas: state.counts?.lgas ?? Object.keys(state.lgas ?? {}).length,
        wards: state.counts?.wards ?? 0,
        units: state.counts?.units ?? 0,
      });
    }
  }
  return rows.sort((a, b) => b.members - a.members);
}

const sum = (values) => values.reduce((total, value) => total + value, 0);
