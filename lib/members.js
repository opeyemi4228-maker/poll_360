import { SOKOTO_ADC } from "./data/members-sokoto-adc.js";
import { states2023, allParties } from "./election2023.js";

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
  if (!ward) return sum(Object.values(inLga.wards).map((units) => sum(Object.values(units))));

  const inWard = inLga.wards[ward];
  if (!inWard) return null;
  if (!unit) return sum(Object.values(inWard));

  return inWard[unit] ?? null;
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
      sum(Object.values(held.wards).map((units) => sum(Object.values(units)))),
    ]);
  } else if (!ward) {
    const inLga = register.lgas[lga];
    if (!inLga) return [];
    entries = Object.entries(inLga.wards).map(([name, units]) => [name, sum(Object.values(units))]);
  } else {
    const inWard = register.lgas[lga]?.wards[ward];
    if (!inWard) return [];
    entries = Object.entries(inWard);
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
            sum(Object.values(held.wards).map((units) => Object.keys(units).length))
          )
        ),
      });
    }
  }
  return rows;
}

const sum = (values) => values.reduce((total, value) => total + value, 0);
