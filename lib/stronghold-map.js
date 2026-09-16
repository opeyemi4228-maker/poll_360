import { ZONES } from "./zones.js";

/**
 * The stronghold map: what a place is to Atiku Abubakar, at every depth from a
 * zone to a polling unit.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THREE LEVELS OF STRENGTH, AND WHY THE PDP'S OLDER RECORD IS IN THEM
 *
 *  Atiku has stood three times. Two of those — 2019 and 2023 — published a
 *  table by state; 2007 did not, so nothing below the country can be read for
 *  it. With two readable runs "won twice" and "always won" are the same set,
 *  and a middle level built from his runs alone is always empty.
 *
 *  So the middle level reads the ground he inherited as well:
 *
 *    PRIMARY    carried in both of his readable runs, 2019 and 2023.
 *    SECONDARY  carried in one of them, on ground the PDP carried at least
 *               twice across 1999, 2003 and 2015 — a base he has held before
 *               and can hold again.
 *    TERTIARY   carried in one of them, without that base behind it.
 *
 *  A place he carried in neither run is not a stronghold at any level. The
 *  PDP's earlier record never makes a stronghold on its own: it only decides
 *  which of his single wins sits on older ground.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT IS COUNTED AND WHAT IS ESTIMATED ─────────────────────────────────
 * States are the declared results. Everything below a state is the declared
 * state total spread across its real local governments, wards and polling
 * units by the model in lib/strongholds.js — right about the state, and an
 * estimate about any one named place. Anambra 2023 is the exception: 3,679 of
 * its booths carry the figures transcribed from their result sheets, and a
 * booth with no readable sheet is unknown rather than a loss.
 *
 * The figures are rolled up once, at build time, by
 * scripts/model-strongholds.mjs. This module is what both that script and the
 * screen read, so the two cannot disagree about what a level means.
 */

/* ══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════════ */

/** Atiku's readable runs, newest first — the year dropdown's options. */
export const YEARS = [2023, 2019];

/** The PDP's earlier record, read only to split his single wins. */
export const BASE_YEARS = [1999, 2003, 2015];

/** Every election the build reads. */
export const ALL_YEARS = [...BASE_YEARS, 2019, 2023];

/** How many of the largest polling units, nationally, count as "the biggest". */
export const TOP_UNITS = 60_000;

/** The three levels, strongest first. */
export const TIERS = [
  {
    id: "PRIMARY",
    label: "Primary",
    short: "Won every time",
    why: "Atiku carried it in both 2019 and 2023.",
  },
  {
    id: "SECONDARY",
    label: "Secondary",
    short: "Won before, on PDP ground",
    why: "Atiku carried it once, and the PDP carried it at least twice in 1999, 2003 and 2015.",
  },
  {
    id: "TERTIARY",
    label: "Tertiary",
    short: "Won once",
    why: "Atiku carried it once, without an older PDP base behind it.",
  },
];

export const TIER_OF = Object.fromEntries(TIERS.map((tier) => [tier.id, tier]));

/** The six zones, in the order the buttons are laid out. */
export const ZONE_ORDER = [
  "North West",
  "North East",
  "North Central",
  "South West",
  "South East",
  "South South",
];

const ZONE_BY_CODE = new Map(
  Object.entries(ZONES).flatMap(([zone, codes]) => codes.map((code) => [code, zone]))
);

export const zoneOf = (code) => ZONE_BY_CODE.get(code) ?? null;
export const statesOfZone = (zone) => ZONES[zone] ?? [];

/* ══════════════════════════════════════════════════════════════════════════
   THE CONTEST ON SCREEN
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The seats a contest is fought over, where they are whole local governments.
 *
 * Senate and House of Representatives seats are built from local governments,
 * so the index carries each one's figures. A governorship is the state itself,
 * and an assembly seat is cut along ward lines nobody publishes — so neither
 * has a level of its own here.
 */
export const SEAT_LEVELS = {
  SENATE: { race: "SENATE", label: "Districts", one: "district", many: "districts", long: "senatorial district" },
  REPRESENTATIVES: {
    race: "REPRESENTATIVES",
    label: "Constituencies",
    one: "constituency",
    many: "constituencies",
    long: "federal constituency",
  },
};

export const seatLevelOf = (race) => SEAT_LEVELS[String(race ?? "").toUpperCase()] ?? null;

/**
 * What vote the stronghold map is reading, in the words the screen prints.
 *
 * ── ONE RECORD, SAID OUT LOUD FOR EVERY CONTEST ──────────────────────────
 * The presidential vote is the only vote published below a state for any
 * contest. Under any other contest the map still reads it — it is the best
 * picture there is of where the vote is — and says in plain words that it is
 * the presidential vote, so nobody takes it for that contest's own result.
 */
export function readingFor(race) {
  const contest = String(race ?? "PRESIDENTIAL").toUpperCase();
  if (contest === "PRESIDENTIAL") return null;
  const office = {
    GOVERNORSHIP: "governorship",
    SENATE: "Senate",
    REPRESENTATIVES: "House of Representatives",
    ASSEMBLY: "House of Assembly",
    LGA: "local government",
  }[contest] ?? "this";
  return contest === "GOVERNORSHIP"
    ? `Governorship results are declared for a whole state and nothing below it, so this map reads the presidential vote on the same ground.`
    : `No ${office} vote is published for these places, so this map reads the presidential vote on the same ground.`;
}

/**
 * The part of the map an account is allowed to stand in, as index positions.
 *
 * `territory` is the room's resolved ground: a state, a district or
 * constituency, or a local government, carrying the codes of the local
 * governments inside it. Returns null for a room that holds the whole
 * country. A territory that names places the index does not hold returns
 * null too — the map then opens on the country rather than on a guess.
 */
export function groundIn(states, territory) {
  if (!territory?.stateCode) return null;
  const state = states.find((entry) => entry.code === territory.stateCode);
  if (!state) return null;

  const level = String(territory.level ?? "").toUpperCase();
  if (level === "STATE") return { state: state.code, seat: null, lga: null, name: state.name };

  const indexes = (territory.lgas ?? [])
    .map((code) => state.lgas.findIndex((lga) => `${state.number}/${lga.n}` === code))
    .filter((at) => at >= 0);
  if (!indexes.length) return null;

  if (level === "LGA") {
    return { state: state.code, seat: null, lga: indexes[0], name: state.lgas[indexes[0]].name };
  }

  const race = level === "SENATORIAL" ? "SENATE" : level === "FEDERAL" ? "REPRESENTATIVES" : null;
  const seat = race ? (state.seats?.[race] ?? []).find((entry) => entry.key === territory.key) : null;
  return {
    state: state.code,
    seat: seat ? { race, key: seat.key } : null,
    lgas: indexes,
    lga: null,
    name: seat?.name ?? territory.name ?? state.name,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   STRENGTH
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Which level a place sits at, or null.
 *
 * `won` holds a boolean per readable run, or null where the run cannot be
 * read for this place — an Anambra booth with no sheet. A place with an
 * unreadable run has no level: calling it Tertiary would be reporting a loss
 * nobody can see.
 */
export function tierOf({ won, base }) {
  if (won[2019] === null || won[2023] === null) return null;
  const carried = Number(Boolean(won[2019])) + Number(Boolean(won[2023]));
  if (carried === 2) return "PRIMARY";
  if (carried === 1) return base >= 2 ? "SECONDARY" : "TERTIARY";
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE COMPACT FORM
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ── WHY TUPLES ────────────────────────────────────────────────────────────
 * 176,623 polling units. As objects with named keys the per-state files were
 * several times the size of the unit tree they sit beside; as positional
 * arrays they are a fraction of it. The positions are written once, here, and
 * both the script that writes them and the screen that reads them go through
 * these functions — nothing else indexes a tuple by hand.
 *
 * Shares and leads are tenths of a percentage point, as integers. Null is
 * "cannot be read", never zero.
 */

const FLAG_WON_2019 = 1;
const FLAG_WON_2023 = 2;
const BASE_SHIFT = 2; // two bits, 0 to 3
const FLAG_TOP = 16;
const FLAG_UNKNOWN_2023 = 32;

const tenths = (value) => (value === null || !Number.isFinite(value) ? null : Math.round(value * 10));
const fromTenths = (value) => (value === null || value === undefined ? null : value / 10);

function flagsOf({ won, base, top = false }) {
  return (
    (won[2019] ? FLAG_WON_2019 : 0) |
    (won[2023] ? FLAG_WON_2023 : 0) |
    ((base & 3) << BASE_SHIFT) |
    (top ? FLAG_TOP : 0) |
    (won[2023] === null ? FLAG_UNKNOWN_2023 : 0)
  );
}

/**
 * One polling unit: [registered, cast23, share23, lead23, share19, lead19, flags].
 */
export function encodeUnit({ registered, cast, share, lead, won, base, top }) {
  return [
    registered ?? 0,
    cast === null ? null : cast,
    tenths(share[2023]),
    tenths(lead[2023]),
    tenths(share[2019]),
    tenths(lead[2019]),
    flagsOf({ won, base, top }),
  ];
}

/**
 * Any place above a unit: [registered, cast23, booths, share23, lead23,
 * share19, lead19, flags, top, won19Booths, won23Booths, primary, secondary,
 * tertiary].
 */
export function encodePlace({ registered, cast, booths, share, lead, won, base, top, wonBooths, tierBooths }) {
  return [
    registered ?? 0,
    cast ?? 0,
    booths,
    tenths(share[2023]),
    tenths(lead[2023]),
    tenths(share[2019]),
    tenths(lead[2019]),
    flagsOf({ won, base }),
    top,
    wonBooths[2019],
    wonBooths[2023],
    tierBooths.PRIMARY,
    tierBooths.SECONDARY,
    tierBooths.TERTIARY,
  ];
}

function readFlags(flags, cast) {
  const unknown = Boolean(flags & FLAG_UNKNOWN_2023) || cast === null;
  return {
    won: {
      2019: Boolean(flags & FLAG_WON_2019),
      2023: unknown ? null : Boolean(flags & FLAG_WON_2023),
    },
    base: (flags >> BASE_SHIFT) & 3,
  };
}

/** A decoded unit, in the same shape as a decoded place so lists treat both alike. */
export function decodeUnit(tuple) {
  const [registered, cast, s23, l23, s19, l19, flags] = tuple;
  const { won, base } = readFlags(flags, cast);
  const tier = tierOf({ won, base });
  const top = flags & FLAG_TOP ? 1 : 0;

  return {
    registered,
    cast,
    booths: 1,
    share: { 2023: fromTenths(s23), 2019: fromTenths(s19) },
    lead: { 2023: fromTenths(l23), 2019: fromTenths(l19) },
    won,
    base,
    tier,
    top,
    wonBooths: { 2019: won[2019] ? 1 : 0, 2023: won[2023] ? 1 : 0 },
    tierBooths: {
      PRIMARY: tier === "PRIMARY" ? 1 : 0,
      SECONDARY: tier === "SECONDARY" ? 1 : 0,
      TERTIARY: tier === "TERTIARY" ? 1 : 0,
    },
    turnout: cast !== null && registered > 0 ? (cast / registered) * 100 : null,
    density: registered,
  };
}

export function decodePlace(tuple) {
  const [registered, cast, booths, s23, l23, s19, l19, flags, top, w19, w23, p, s, t] = tuple;
  const { won, base } = readFlags(flags, cast);

  return {
    registered,
    cast,
    booths,
    share: { 2023: fromTenths(s23), 2019: fromTenths(s19) },
    lead: { 2023: fromTenths(l23), 2019: fromTenths(l19) },
    won,
    base,
    tier: tierOf({ won, base }),
    top,
    wonBooths: { 2019: w19, 2023: w23 },
    tierBooths: { PRIMARY: p, SECONDARY: s, TERTIARY: t },
    turnout: registered > 0 && cast > 0 ? (cast / registered) * 100 : null,
    density: booths > 0 ? registered / booths : 0,
  };
}

/** Several decoded places added together — a zone is its states. */
export function sumPlaces(places) {
  const out = {
    registered: 0,
    cast: 0,
    booths: 0,
    top: 0,
    wonBooths: { 2019: 0, 2023: 0 },
    tierBooths: { PRIMARY: 0, SECONDARY: 0, TERTIARY: 0 },
  };
  for (const place of places) {
    out.registered += place.registered ?? 0;
    out.cast += place.cast ?? 0;
    out.booths += place.booths ?? 0;
    out.top += place.top ?? 0;
    for (const year of YEARS) out.wonBooths[year] += place.wonBooths[year] ?? 0;
    for (const tier of TIERS) out.tierBooths[tier.id] += place.tierBooths[tier.id] ?? 0;
  }
  out.turnout = out.registered > 0 ? (out.cast / out.registered) * 100 : null;
  out.density = out.booths > 0 ? out.registered / out.booths : 0;
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   PLANNING
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * What makes a place worth targeting.
 *
 * ── RANKED, NOT SCALED ─────────────────────────────────────────────────────
 * Each factor is turned into a percentile among the places being compared
 * before any are combined. Registered voters run into the millions and a
 * margin runs to a hundred; adding them raw would let the register decide
 * everything. A percentile puts all four on the same footing, and it means
 * "top of the list" always means "top of the places on screen", whatever
 * depth the map is at.
 */
export const FACTORS = [
  {
    id: "voters",
    label: "Registered voters",
    why: "Most people to reach",
    value: (place) => place.registered ?? null,
  },
  {
    id: "clusters",
    label: "Voter clusters",
    why: "Voters packed into few polling units, so each agent covers more",
    value: (place) => place.density ?? null,
  },
  {
    id: "turnout",
    label: "Turnout gap",
    why: "Many registered voters stayed home last time",
    value: (place) => (place.turnout === null || place.turnout === undefined ? null : 100 - place.turnout),
  },
  {
    id: "close",
    label: "Close contest",
    why: "Won or lost narrowly, so a few votes change who carries it",
    value: (place, year) => {
      const lead = place.lead?.[year];
      return lead === null || lead === undefined ? null : -Math.abs(lead);
    },
  },
];

/**
 * Score every row out of a hundred on the chosen factors.
 *
 * Returns new objects carrying `score`, `parts` (factor id → 0..1) and `why`
 * (the labels of the strongest one or two factors), leaving the input alone.
 * A row with no reading on a factor gets the bottom of that factor rather than
 * the middle: a place we cannot measure should not rise on a guess.
 */
export function scorePlaces(rows, { factors = FACTORS.map((factor) => factor.id), year = 2023 } = {}) {
  const chosen = FACTORS.filter((factor) => factors.includes(factor.id));
  if (!rows.length || !chosen.length) return rows.map((row) => ({ ...row, score: 0, parts: {}, why: [] }));

  const ranks = chosen.map((factor) => {
    const values = rows.map((row) => factor.value(row, year));
    const known = values.filter((value) => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
    return values.map((value) => {
      if (value === null || !Number.isFinite(value) || known.length === 0) return 0;
      if (known.length === 1) return 1;
      return lowerBound(known, value) / (known.length - 1);
    });
  });

  return rows.map((row, index) => {
    const parts = {};
    let sum = 0;
    chosen.forEach((factor, at) => {
      parts[factor.id] = ranks[at][index];
      sum += ranks[at][index];
    });
    const why = chosen
      .map((factor) => ({ label: factor.label, value: parts[factor.id] }))
      .filter((entry) => entry.value >= 0.75)
      .sort((a, b) => b.value - a.value)
      .slice(0, 2)
      .map((entry) => entry.label);

    return { ...row, score: Math.round((sum / chosen.length) * 100), parts, why };
  });
}

/** Index of the first element not less than `value` in a sorted list. */
function lowerBound(sorted, value) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

/* ══════════════════════════════════════════════════════════════════════════
   LOCAL GOVERNMENT NAMES
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Pair INEC's local government names with the boundary file's.
 *
 * ── TWO SPELLINGS OF ONE COUNTRY ──────────────────────────────────────────
 * The polling unit tree is INEC's and the outlines are geoBoundaries', and
 * they disagree on 139 of 774 names: "Ikeduru (Iho)" against "Ikeduru",
 * "Dawaki Kudu" against "Dawakin Kudu", "Egbado North" against its newer name
 * "Yewa North". A drill that joined on the exact name would open a local
 * government with no outline for one in six of them.
 *
 * Every state has the same count in both files, so this is an assignment, not
 * a search: exact names first, then names with punctuation, bracketed seats
 * and "municipal" stripped, and the few left over paired closest-first by
 * edit distance. Returns tree name → boundary name.
 */
export function matchLgaNames(treeNames, shapeNames) {
  const out = new Map();
  let left = [...treeNames];
  let free = [...shapeNames];

  for (const key of [(name) => name, normaliseName]) {
    for (const name of [...left]) {
      const found = free.find((shape) => key(shape) === key(name));
      if (found === undefined) continue;
      out.set(name, found);
      left = left.filter((entry) => entry !== name);
      free = free.filter((entry) => entry !== found);
    }
  }

  const pairs = [];
  for (const name of left) {
    for (const shape of free) {
      const a = normaliseName(name);
      const b = normaliseName(shape);
      pairs.push({ name, shape, cost: editDistance(a, b) / Math.max(a.length, b.length, 1) });
    }
  }
  pairs.sort((a, b) => a.cost - b.cost);
  const taken = new Set();
  for (const pair of pairs) {
    if (out.has(pair.name) || taken.has(pair.shape)) continue;
    out.set(pair.name, pair.shape);
    taken.add(pair.shape);
  }
  return out;
}

export function normaliseName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/municipal(ity)?|\bm\.?\s*c\.?$/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const held = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = held;
    }
  }
  return row[b.length];
}
