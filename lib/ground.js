import { STATES } from "./units.js";
import { ZONES } from "./zones.js";

/**
 * A room account's ground: the places it was assigned, and nothing else.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  This is not lib/territory.js, and the difference is the point. A territory
 *  is one contest's constituency, held by a campaign. A ground is a list a
 *  super administrator hands an observer at 9pm and changes at 11: two
 *  states, or the first twenty-two local governments of one, or three wards.
 *
 *  It is stored as the INEC code prefixes it covers, because a polling unit's
 *  code already says where it is: `19` is a state, `19/04` a local
 *  government, `19/04/11` a ward. So "is this unit on my ground" is "does its
 *  code start with one of my prefixes", in the database and out of it, and
 *  the answer cannot differ between the two.
 *
 *  Null is the whole project. An empty list is nowhere, and reads as nowhere:
 *  an observer nobody has assigned yet sees an empty screen, not the country.
 * ══════════════════════════════════════════════════════════════════════════
 */

const NUMBER_BY_CODE = new Map(STATES.map((state) => [state.code, state.number]));
const STATE_BY_NUMBER = new Map(STATES.map((state) => [state.number, state]));

export const ZONE_NAMES = Object.keys(ZONES);

/** The state numbers in a geopolitical zone. */
export function statesOfZone(zone) {
  return (ZONES[zone] ?? []).map((code) => NUMBER_BY_CODE.get(code)).filter(Boolean);
}

/** Which zone a state number belongs to. */
export function zoneOfState(number) {
  const code = STATE_BY_NUMBER.get(String(number))?.code;
  return ZONE_NAMES.find((zone) => ZONES[zone].includes(code)) ?? null;
}

/** `19`, `19/04`, `19/04/11` or `19/04/11/003`, or null if it is none of those. */
export function tidyCode(input) {
  const parts = String(input ?? "").trim().split(/[^0-9]+/).filter(Boolean);
  if (!parts.length || parts.length > 4) return null;
  const widths = [2, 2, 2, 3];
  const padded = parts.map((part, index) => part.padStart(widths[index], "0"));
  if (padded.some((part, index) => part.length !== widths[index])) return null;
  if (!STATE_BY_NUMBER.has(padded[0])) return null;
  return padded.join("/");
}

export const LEVEL_NAMES = ["national", "state", "lga", "ward", "pu"];

/** national, state, lga, ward or pu, read off the code's own length. */
export function levelOf(code) {
  if (!code) return "national";
  return LEVEL_NAMES[String(code).split("/").length] ?? "pu";
}

/** The level directly under one. */
export const childLevel = (level) => LEVEL_NAMES[LEVEL_NAMES.indexOf(level) + 1] ?? null;

/** The code one level up, or "" for a state's parent, the country. */
export function parentOf(code) {
  const parts = String(code ?? "").split("/");
  return parts.slice(0, -1).join("/");
}

/** How many characters of a unit code name a place at this level. */
export const WIDTH = { state: 2, lga: 5, ward: 8, pu: 12 };

/**
 * Read a stored ground. Accepts the JSON written by `writeGround`, or null.
 * Returns null for the whole project, or `{ zones, codes }`.
 */
export function readGround(stored) {
  if (stored == null || stored === "") return null;
  let value = stored;
  if (typeof stored === "string") {
    try {
      value = JSON.parse(stored);
    } catch {
      return { zones: [], codes: [] };
    }
  }
  if (value === "ALL") return null;
  const zones = [...new Set((value?.zones ?? []).filter((zone) => ZONES[zone]))];
  const codes = [...new Set((value?.codes ?? []).map(tidyCode).filter(Boolean))];
  return { zones, codes };
}

export function writeGround(ground) {
  if (ground == null) return null;
  return JSON.stringify({ zones: ground.zones ?? [], codes: ground.codes ?? [] });
}

/**
 * Every prefix a ground covers, zones spelt out as their states, with any
 * prefix already inside another dropped. Null for the whole project.
 */
export function prefixesOf(ground) {
  if (ground == null) return null;
  const all = [...ground.zones.flatMap(statesOfZone), ...ground.codes];
  const unique = [...new Set(all)].sort((a, b) => a.length - b.length);
  return unique.filter((code, index) => !unique.slice(0, index).some((other) => inside(code, other)));
}

const inside = (code, prefix) => code === prefix || code.startsWith(`${prefix}/`);

/** Is this place (any level) on the ground? */
export function covers(ground, code) {
  const prefixes = prefixesOf(ground);
  if (prefixes == null) return true;
  if (!code) return false;
  return prefixes.some((prefix) => inside(String(code), prefix));
}

/**
 * May this ground look at a place, including one it only holds part of?
 *
 * An observer given three wards of a local government may open that local
 * government and its state to reach them. They see only their wards inside.
 */
export function touches(ground, code) {
  const prefixes = prefixesOf(ground);
  if (prefixes == null) return true;
  if (!code) return prefixes.length > 0;
  return prefixes.some((prefix) => inside(String(code), prefix) || inside(prefix, String(code)));
}

/** The state numbers a ground reaches into, in order. Null means all of them. */
export function statesOf(ground) {
  const prefixes = prefixesOf(ground);
  if (prefixes == null) return null;
  return [...new Set(prefixes.map((prefix) => prefix.slice(0, 2)))].sort();
}

/**
 * The ground as a WHERE fragment over a column of unit or place codes.
 *
 * Built from the same prefixes `covers` reads, so the database and the
 * application cannot disagree about whose ground a unit is on.
 */
export function whereGround(ground, column = "unit_code") {
  const prefixes = prefixesOf(ground);
  if (prefixes == null) return { sql: "", params: [] };
  if (!prefixes.length) return { sql: " AND 1 = 0", params: [] };
  const each = prefixes.map(() => `(${column} = ? OR ${column} LIKE ?)`).join(" OR ");
  return { sql: ` AND (${each})`, params: prefixes.flatMap((prefix) => [prefix, `${prefix}/%`]) };
}

/** Narrow a ground to what lies under one place. Used when drilling down. */
export function under(ground, code) {
  if (!code) return ground;
  const prefixes = prefixesOf(ground);
  if (prefixes == null) return { zones: [], codes: [code] };
  const kept = prefixes
    .map((prefix) => (inside(prefix, code) ? prefix : inside(code, prefix) ? code : null))
    .filter(Boolean);
  return { zones: [], codes: [...new Set(kept)] };
}

/** The ground in words, for the chip in the top bar. */
export function describeGround(ground, nameOf = (code) => STATE_BY_NUMBER.get(code)?.name ?? code) {
  if (ground == null) return "Whole project";
  const parts = [
    ...ground.zones,
    ...ground.codes
      .filter((code) => !ground.zones.some((zone) => statesOfZone(zone).includes(code.slice(0, 2)) && code.length === 2))
      .map((code) => (code.length === 2 ? nameOf(code) : `${nameOf(code.slice(0, 2))} ${code.slice(3)}`)),
  ];
  if (!parts.length) return "No ground assigned yet";
  return parts.length > 4 ? `${parts.slice(0, 4).join(", ")} and ${parts.length - 4} more` : parts.join(", ");
}

export const stateName = (number) => STATE_BY_NUMBER.get(String(number))?.name ?? null;
