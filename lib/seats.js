import { ruling } from "./governors.js";
import { OFF_CYCLE } from "./offcycle.js";
import { RESULTS, DECLARED as NATIONAL, parties } from "./election2023.js";
import { STATES } from "./units.js";
import { lgaNameForCode } from "./lga-names.js";
import { ADAMAWA, DECLARED as ADAMAWA_DECLARED, LOCAL_GOVERNMENT as ADAMAWA_LG, SEATS as ADAMAWA_SEATS } from "./adamawa.js";

/**
 * The seat this room is about, and the last election for it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY A ROOM NEEDS THIS BEFORE IT NEEDS ANYTHING ELSE
 *
 *  Every panel in a situation room was national. The ruling-party map drew 37
 *  states, the party-strength map drew the federation, the analytics screen
 *  projected the presidential vote. For an account covering Adamawa Central
 *  that is a room full of true statements about somewhere else — and the one
 *  thing a senatorial campaign opens a screen to find out, who holds this
 *  district and by how much, was on none of them.
 *
 *  This answers exactly that, for whichever of the six contests the account is
 *  pinned to and whichever ground it holds:
 *
 *    Presidency          the national result, and this state's share of it
 *    Governorship        the last governorship declared in this state
 *    Senate              who holds this senatorial district
 *    Representatives     who holds this federal constituency
 *    House of Assembly   who holds the council this seat sits inside
 *    Local government    who holds this council
 *
 *  ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────
 *  Answer for a contest and a place it has no record of. There is no fallback
 *  to the state's governorship when a senatorial district is asked for, and no
 *  fallback to the presidential result when a council is. Those would be a
 *  different election dressed as this one, which is worse than an empty panel:
 *  an empty panel says we do not hold it, and a substituted one says something
 *  false about the seat somebody is contesting.
 *
 *  ── AND WHAT IT ACTUALLY HOLDS TODAY ────────────────────────────────────
 *  Governors for all 37 states, with figures for the eight off-cycle contests
 *  and the presidential result in every state. Below that — senate, House,
 *  councils — one state: Adamawa, transcribed in lib/adamawa.js. Everywhere
 *  else those return null and say so. Adding a state is adding a file and one
 *  line to BY_STATE, not editing anything here.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* The seat tables we hold, by state number. One entry today, and the shape is
   the point: a second state is a second import and a second line. */
const BY_STATE = {
  [ADAMAWA.number]: {
    seats: ADAMAWA_SEATS,
    declared: ADAMAWA_DECLARED,
    localGovernment: ADAMAWA_LG,
  },
};

const STATE_BY_CODE = new Map(STATES.map((state) => [state.code, state]));
const CODE_BY_NUMBER = new Map(STATES.map((state) => [state.number, state.code]));

/**
 * Who holds this ground, in this contest.
 *
 * Returns a list, because a ground can contain more than one seat of the same
 * kind: an account holding the whole state and reading the senate race holds
 * three districts, not one. A governorship account reading the governorship
 * holds exactly one. The caller renders whatever comes back and the count is
 * itself information — "three seats, two of them ours" is the sentence a state
 * campaign wants and a district campaign does not have.
 */
export function holdersOf({ race, territory }) {
  const contest = String(race ?? "").toUpperCase();
  if (!territory || territory.level === "NATION") return nationalHolders(contest);

  const table = BY_STATE[territory.stateNumber];

  if (contest === "GOVERNORSHIP") {
    const code = CODE_BY_NUMBER.get(territory.stateNumber);
    /* `ruling()` rather than the raw table, because it is the one that
       resolves a defection: `current` is the party the governor sits under
       today and `elected` is the one they won under. */
    const row = ruling().find((one) => one.code === code);
    if (!row) return [];
    return [
      {
        office: "Governor",
        place: row.state,
        holder: row.governor,
        /* ── TWO PARTIES, AND THEY ARE NOT THE SAME FACT ──────────────────
           `elected` is the party a governor won under; `party` is the one
           they sit under now, which since 2025 is frequently a different
           one. lib/governors.js keeps both because the gap between them is
           governorships no voter was asked about. A room reading a return
           from a state needs the second; a room asking what the last
           election said needs the first. */
        party: row.current ?? row.elected,
        wonAs: row.elected,
        defected: Boolean(row.current && row.current !== row.elected),
        moved: row.moved ?? null,
        since: row.votedOn,
        source: "lib/governors.js",
      },
    ];
  }

  /* Everything below a governorship needs a transcribed table for the state,
     and there is one state. */
  if (!table) return [];

  if (contest === "SENATE" || contest === "REPRESENTATIVES") {
    return table.seats
      .filter((seat) => seat.race === contest && insideTerritory(seat.territory, territory))
      .map(shapeSeat);
  }

  if (contest === "LGA" || contest === "ASSEMBLY") {
    const councils = table.localGovernment;
    if (!councils) return [];

    /* A sweep is one fact about every council, so it is expanded across the
       ground rather than stored 21 times. Where a future table lists councils
       one by one this reads them instead. */
    const swept = councils.chairmanships?.total === Object.values(councils.chairmanships ?? {})
      .filter((value, index) => index > 0)
      .reduce((a, b) => Math.max(a, b), 0);

    const party = swept
      ? Object.keys(councils.chairmanships).find((key) => key !== "total")
      : null;

    if (!party) return [];

    return (territory.lgas ?? []).map((code) => ({
      office: contest === "ASSEMBLY" ? "Council containing this seat" : "Chairman",
      /* Named, because "02/20" is a key and not a place. The name comes from
         the boundary files, the way every other local government name in this
         product does. */
      place: lgaNameForCode(code) ?? code,
      /* The 21 chairmen's own names were not published in any release reached
         here, only the party that took every seat. A blank is what we know. */
      holder: null,
      party,
      since: councils.votesOn,
      note: councils.note,
      source: councils.source,
    }));
  }

  return [];
}

/**
 * The last election for this contest on this ground, with figures where any
 * were published.
 *
 * ── `votes` NULL IS THE INTERESTING CASE, NOT THE EMPTY ONE ────────────────
 * A senate seat comes back with a winner, a party and no numbers, because INEC
 * publishes National Assembly results on sheets and in a viewer that serves no
 * data. That is a real answer and the panel prints it as one. What it must not
 * do is come back with the state's governorship figures attached to a
 * senatorial district, which would be a number from a different election
 * sitting under the right heading.
 */
export function lastResultFor({ race, territory }) {
  const contest = String(race ?? "").toUpperCase();

  if (contest === "PRESIDENTIAL") return presidential(territory);

  if (!territory || territory.level === "NATION") return null;

  const table = BY_STATE[territory.stateNumber];

  if (contest === "GOVERNORSHIP") {
    /* A transcribed row for this state wins, because it carries the register
       and the note. Otherwise the off-cycle table, which is figures for the
       eight contests held outside the general cycle. Otherwise the holder
       alone, from the governors table. */
    const own = table?.declared?.find((row) => row.race === "GOVERNORSHIP");
    if (own) return shapeDeclared(own, territory);

    const code = CODE_BY_NUMBER.get(territory.stateNumber);
    const cycle = OFF_CYCLE.find((row) => row.code === code);
    if (cycle) {
      const total = Object.values(cycle.votes).reduce((a, b) => a + b, 0);
      return {
        race: contest,
        place: cycle.state,
        candidate: cycle.candidate,
        party: cycle.winner,
        votes: cycle.votes,
        total,
        registered: null,
        votesOn: cycle.votesOn,
        declaredOn: cycle.votesOn,
        source: cycle.source,
        note: cycle.unverified ? "Totals not independently verified." : null,
      };
    }

    const [holder] = holdersOf({ race, territory });
    return holder
      ? {
          race: contest,
          place: holder.place,
          candidate: holder.holder,
          party: holder.wonAs ?? holder.party,
          votes: null,
          total: null,
          registered: null,
          votesOn: holder.since,
          declaredOn: holder.since,
          source: holder.source,
          note: "Who won it is on record. The figures are not loaded for this state.",
        }
      : null;
  }

  const [seat] = holdersOf({ race, territory });
  if (!seat) return null;

  return {
    race: contest,
    place: seat.place,
    candidate: seat.holder,
    party: seat.party,
    votes: null,
    total: null,
    registered: null,
    votesOn: seat.since,
    declaredOn: seat.since,
    source: seat.source,
    note: seat.note ?? "No vote totals were published for this contest in a form we hold.",
  };
}

/* -------------------------------------------------------------------------- */

function nationalHolders(contest) {
  if (contest !== "PRESIDENTIAL") return [];
  return [
    {
      office: "President",
      place: "Federal Republic of Nigeria",
      holder: parties.find((party) => party.id === "APC")?.candidate ?? "Bola Tinubu",
      party: "APC",
      since: "2023-02-25",
      source: "INEC declared results, 2023 presidential election.",
    },
  ];
}

function presidential(territory) {
  if (!territory || territory.level === "NATION") {
    return {
      race: "PRESIDENTIAL",
      place: "Nigeria",
      candidate: parties.find((party) => party.id === "APC")?.candidate ?? "Bola Tinubu",
      party: "APC",
      votes: { APC: NATIONAL.apc, PDP: NATIONAL.pdp, LP: NATIONAL.lp, NNPP: NATIONAL.nnpp },
      total: NATIONAL.validVotes,
      registered: NATIONAL.registered,
      votesOn: "2023-02-25",
      declaredOn: "2023-03-01",
      source: "INEC declared results, 2023 presidential election.",
      note: null,
    };
  }

  /* Below the federation it is this state's share of the national count, which
     is a real declared figure and is labelled as the state's rather than as
     the ground's: we hold no breakdown under a state for this contest, and a
     district's share of it is not something to divide out. */
  const code = CODE_BY_NUMBER.get(territory.stateNumber);
  const row = RESULTS.find((one) => one[0] === code);
  if (!row) return null;

  const [, name, votes, valid, , registered] = row;
  const [apc, pdp, lp, nnpp, others] = votes;

  return {
    race: "PRESIDENTIAL",
    place: name,
    candidate: null,
    party: leaderOf({ APC: apc, PDP: pdp, LP: lp, NNPP: nnpp }),
    votes: { APC: apc, PDP: pdp, LP: lp, NNPP: nnpp, OTH: others },
    total: valid,
    registered,
    votesOn: "2023-02-25",
    declaredOn: "2023-03-01",
    source: "INEC declared results, 2023 presidential election.",
    note:
      territory.level === "STATE"
        ? null
        : `The state's declared figure. Nothing under a state was published for this contest, so this is ${name}'s and not ${territory.name}'s.`,
  };
}

const shapeSeat = (seat) => ({
  office: seat.office,
  place: seat.place,
  holder: seat.holder,
  party: seat.party,
  since: seat.since,
  note: seat.note ?? null,
  source: seat.source,
});

function shapeDeclared(row, territory) {
  const total = Object.values(row.votes).reduce((a, b) => a + b, 0);
  return {
    race: row.race,
    place: STATE_BY_CODE.get(CODE_BY_NUMBER.get(territory.stateNumber))?.name ?? territory.name,
    candidate: row.candidate,
    party: row.winner,
    votes: row.votes,
    total,
    registered: row.registered,
    votesOn: row.votesOn,
    declaredOn: row.declaredOn,
    source: row.source,
    note: row.note,
  };
}

const leaderOf = (votes) =>
  Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

/**
 * Is a seat's own territory inside the ground being asked about?
 *
 * Compared as stored strings rather than resolved, because both sides come
 * from the same tables and a seat either is this district or is not. The one
 * widening case is a state-level ground reading a contest fought below it —
 * all three of Adamawa's senate seats belong to an account holding Adamawa —
 * and that is the prefix test.
 */
function insideTerritory(seatTerritory, territory) {
  if (seatTerritory === `${territory.level}:${territory.key}`) return true;
  if (territory.level !== "STATE") return false;

  const [, key = ""] = String(seatTerritory).split(":");
  return key.startsWith(`${territory.stateNumber}/`);
}
