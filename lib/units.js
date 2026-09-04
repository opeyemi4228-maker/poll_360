import { states2023 } from "./election2023.js";

/**
 * The polling unit registry.
 *
 * ── THE HIERARCHY IS IN THE CODE, NOT IN A TABLE ───────────────────────────
 * An INEC polling unit code carries its own address: SS-LL-WW-UUU is state,
 * local government, ward, unit. So ward, local government and state are read
 * off the code rather than stored beside it. Storing both would let the two
 * disagree, and on the night they disagree the code wins, because the code is
 * what is printed on the sheet in the agent's hand.
 *
 * ── STATE NUMBERS, AND WHAT WE ACTUALLY KNOW ───────────────────────────────
 * INEC numbers the states alphabetically, 01 to 36, with the Federal Capital
 * Territory last at 37. That ordering is stated here in one table so it can be
 * checked and corrected in one place. Where an agent's account already carries
 * a state, the account wins: it was set by a human who knew, and a code can be
 * mistyped.
 * ───────────────────────────────────────────────────────────────────────────
 */

/* Alphabetical, with the FCT last, which is INEC's own ordering. */
const ORDERED = [
  ...states2023
    .filter((state) => state.code !== "FCT")
    .map((state) => state.name)
    .sort((a, b) => a.localeCompare(b)),
  "Federal Capital Territory",
];

const STATE_BY_NUMBER = new Map(
  ORDERED.map((name, index) => [String(index + 1).padStart(2, "0"), name])
);

const CODE_BY_NAME = new Map(states2023.map((state) => [state.name, state.code]));
CODE_BY_NAME.set("Federal Capital Territory", "FCT");

/**
 * The 37 states and the number each one carries inside a unit code.
 *
 * ── WHY THIS IS EXPORTED AND NOT REBUILT ───────────────────────────────────
 * A sign-up form asks somebody to pick their state, and the number it has to
 * send is this table's. Anywhere else that ordering is written down a second
 * time is somewhere it can be written down differently, and the failure is
 * silent: a picker one place out files every return from Kaduna against Jigawa
 * and nothing in the system objects, because 19/… is a perfectly valid code.
 *
 * `code` is the three-letter short form the boundary files are named by, so a
 * caller holding a state number can reach that state's local governments
 * without a second lookup table.
 */
export const STATES = ORDERED.map((name, index) => ({
  number: String(index + 1).padStart(2, "0"),
  name,
  code: CODE_BY_NAME.get(name) ?? null,
}));

/**
 * Split a unit code into the places it names.
 *
 * Tolerant about punctuation and spacing because it is typed on a phone, at a
 * booth, at night, by somebody copying it off a form. Strict about shape,
 * because a code that is not four parts is not a code and guessing at it would
 * file a result against the wrong place.
 */
export function parseUnitCode(input) {
  const cleaned = String(input ?? "").toUpperCase().replace(/[^0-9]/g, "");
  const parts = String(input ?? "").trim().split(/[^0-9A-Za-z]+/).filter(Boolean);

  /* Either 08-03-07-012 or the same digits run together. */
  const [state, lga, ward, unit] =
    parts.length === 4
      ? parts
      : cleaned.length === 9
        ? [cleaned.slice(0, 2), cleaned.slice(2, 4), cleaned.slice(4, 6), cleaned.slice(6, 9)]
        : [];

  if (!state || !lga || !ward || !unit) return null;

  const stateNumber = state.padStart(2, "0");
  const stateName = STATE_BY_NUMBER.get(stateNumber) ?? null;

  const lgaPart = lga.padStart(2, "0");
  const wardPart = ward.padStart(2, "0");

  /* ── THE SEPARATOR IS A SLASH, BECAUSE THE PRODUCT ALREADY SAYS SO ───────
     INEC prints these with slashes and the 487 returns already on file use
     them. This module normalised to dashes at first, which quietly produced a
     second key for the same booth: the registry held 01-01-04-006 while the
     result sat under 01/01/04/006, they never joined, and a tree of 488 units
     reported two. A new module does not get to redefine the primary key of a
     system that already has one. */
  return {
    code: `${stateNumber}/${lgaPart}/${wardPart}/${unit.padStart(3, "0")}`,
    stateNumber,
    stateName,
    stateCode: stateName ? (CODE_BY_NAME.get(stateName) ?? null) : null,
    lgaCode: `${stateNumber}/${lgaPart}`,
    wardCode: `${stateNumber}/${lgaPart}/${wardPart}`,
    unitNo: unit.padStart(3, "0"),
  };
}

/**
 * Build a code out of the four things somebody chose on a form.
 *
 * ── THE OTHER DIRECTION, AND WHY IT NEEDED ITS OWN FUNCTION ────────────────
 * `parseUnitCode` is tolerant because it reads what a human typed. This is the
 * reverse trip — four separate answers going back into one key — and it is
 * strict on purpose, because a form that quietly accepts an empty ward and
 * fills it with 00 produces a code that parses perfectly and names nowhere.
 *
 * So every part has to be present, has to fit its width, and has to be a real
 * number rather than a zero: INEC counts local governments, wards and units
 * from one. A state number outside 01–37 is refused for the same reason — it
 * would otherwise pass through as a code naming a state that does not exist.
 *
 * Returns the canonical code, or null. There is no partial answer: a caller
 * that got null has nothing it can safely file against.
 */
export function unitCodeFromParts({ state, lga, ward, unit }) {
  const digits = (value, width) => {
    const cleaned = String(value ?? "").replace(/\D/g, "");
    if (!cleaned || cleaned.length > width) return null;
    /* Ward 00 and unit 000 are not places. They are an empty box. */
    if (Number(cleaned) === 0) return null;
    return cleaned.padStart(width, "0");
  };

  const parts = [digits(state, 2), digits(lga, 2), digits(ward, 2), digits(unit, 3)];
  if (parts.some((part) => part === null)) return null;

  const at = parseUnitCode(parts.join("/"));
  /* `stateName` is null when the first two digits name no state. Read here
     rather than range-checked separately, so this function and the parser
     always agree about which numbers are states. */
  return at?.stateName ? at.code : null;
}

/** Is this a code we can place? Used before anything is filed against it. */
export function isUnitCode(input) {
  return parseUnitCode(input) !== null;
}

/**
 * Fold a flat list of registered units into nation, state, local government,
 * ward, unit.
 *
 * Built as a fold rather than four queries because every level has to agree
 * with the one below it by construction. A per-level query can drift the
 * moment one of them is written differently, and a room comparing a state
 * total against the sum of its wards is exactly the room that will notice.
 */
export function groupUnits(rows) {
  const nation = { level: "nation", key: "NG", name: "Nigeria", units: 0, reported: 0, registered: 0, accredited: 0, votes: [], children: new Map() };

  const add = (node, row) => {
    node.units += 1;
    if (row.reported) {
      node.reported += 1;
      node.registered += row.registered ?? 0;
      node.accredited += row.accredited ?? 0;
      const votes = Array.isArray(row.votes) ? row.votes : [];
      for (const [index, value] of votes.entries()) {
        node.votes[index] = (node.votes[index] ?? 0) + value;
      }
    }
  };

  const child = (parent, level, key, name) => {
    if (!parent.children.has(key)) {
      parent.children.set(key, {
        level,
        key,
        name,
        units: 0,
        reported: 0,
        registered: 0,
        accredited: 0,
        votes: [],
        children: new Map(),
      });
    }
    return parent.children.get(key);
  };

  for (const row of rows) {
    const at = parseUnitCode(row.code);
    if (!at) continue;

    const state = child(nation, "state", at.stateNumber, row.stateName ?? at.stateName ?? at.stateNumber);
    const lga = child(state, "lga", at.lgaCode, row.lgaName ?? `Local government ${at.lgaCode.split("/")[1]}`);
    const ward = child(lga, "ward", at.wardCode, row.wardName ?? `Ward ${at.wardCode.split("/")[2]}`);
    const unit = child(ward, "unit", row.code, row.name ?? `Unit ${at.unitNo}`);

    /* Only a booth has a position, and only if one was reported with the
       return. Nothing above it gets one: the centre of a ward is not a place
       anybody stood, and a map that drew one would be drawing an average as
       though it were an address. */
    if (row.position) unit.position = row.position;

    for (const node of [nation, state, lga, ward, unit]) add(node, row);
  }

  return toPlain(nation);
}

/** Maps are convenient to build and useless to render, so they come out as arrays. */
function toPlain(node) {
  const children = [...node.children.values()]
    .map(toPlain)
    .sort((a, b) => b.reported - a.reported || a.name.localeCompare(b.name));

  return {
    level: node.level,
    key: node.key,
    name: node.name,
    units: node.units,
    reported: node.reported,
    registered: node.registered,
    accredited: node.accredited,
    votes: node.votes,
    total: node.votes.reduce((sum, value) => sum + (value ?? 0), 0),
    position: node.position ?? null,
    children,
  };
}

export { STATE_BY_NUMBER };
