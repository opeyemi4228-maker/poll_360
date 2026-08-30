import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseUnitCode, STATES } from "./units.js";

if (typeof window !== "undefined") {
  throw new Error("lib/lga-names.js reads from disk and is server only");
}

/**
 * Turning "07" into "Aba North".
 *
 * ── WHERE THE NAMES COME FROM ──────────────────────────────────────────────
 * A polling unit code carries numbers, not names: 01/07/05/010 is the seventh
 * local government of the first state. The boundary files we already ship
 * carry the names for all 774, so nothing new is fetched or invented, the two
 * are simply joined.
 *
 * ── THE ASSUMPTION, STATED ─────────────────────────────────────────────────
 * INEC numbers local governments alphabetically within their state, so the
 * nth name in sorted order is local government n. That is the assumption this
 * module rests on, it is stated here rather than buried, and it is checked:
 * a state whose boundary file has fewer local governments than the code asks
 * for returns nothing rather than the wrong name. A tree that says "Local
 * government 07" is honest. A tree that says the wrong town is not.
 * ───────────────────────────────────────────────────────────────────────────
 */

const cache = new Map();

function namesFor(stateCode) {
  if (!stateCode) return null;
  if (cache.has(stateCode)) return cache.get(stateCode);

  let names = null;
  try {
    const file = join(process.cwd(), "public", "geo", "lga", `${stateCode}.json`);
    const data = JSON.parse(readFileSync(file, "utf8"));
    names = (data.lgas ?? [])
      .map((row) => row.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    /* A state we hold no boundaries for keeps its numbers. */
    names = null;
  }

  cache.set(stateCode, names);
  return names;
}

/** The local government named by a unit code, or null if we cannot be sure. */
export function lgaNameFor(unitCode) {
  const at = parseUnitCode(unitCode);
  if (!at) return null;

  const names = namesFor(at.stateCode);
  if (!names?.length) return null;

  const index = Number(at.lgaCode.split("/")[1]) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= names.length) return null;

  return names[index];
}

/** Attach real names to registry rows, leaving the number where we cannot. */
export function nameUnits(rows) {
  return rows.map((row) => ({ ...row, lgaName: row.lgaName ?? lgaNameFor(row.code) }));
}

/**
 * Every place this product can name, as a picker needs it.
 *
 * ── WHAT IS REAL HERE, AND WHAT IS HONESTLY MISSING ────────────────────────
 * States and local governments are real: 37 and 774 of them, the numbering
 * from lib/units.js and the names from the boundary files this repository
 * already ships. So a sign-up form can offer them by name, and an agent picks
 * "Lagos" and "Ikeja" rather than typing 25 and 13.
 *
 * Wards and polling units are not here, because we do not hold them. INEC has
 * roughly 8,800 wards and 176,000 units and this repository carries a list of
 * neither. Inventing them to fill two more dropdowns would be the exact thing
 * the rest of this product refuses to do, and it would be worse than useless:
 * a wrong ward name beside a right ward number reads as confirmation.
 *
 * So the form asks for those two as the numbers printed on the agent's own
 * sheet, and offers a box for the name if they want to write it down. What
 * they write is a claim, is stored as a claim, and is shown to the person
 * approving them as one more thing to check against the appointment list.
 *
 * Server-only, like the rest of this module: it reads from disk. Pages call it
 * and pass the result down.
 * ───────────────────────────────────────────────────────────────────────────
 */
export function inecPlaces() {
  return STATES.map((state) => ({
    number: state.number,
    name: state.name,
    lgas: namesFor(state.code) ?? [],
  }));
}

/**
 * How many local governments a state actually has, or null where we hold no
 * boundaries for it.
 *
 * The one check that catches a mistyped local government: Lagos has 20, so
 * 25/27/… is not a booth anybody could have been appointed to, however well
 * the code parses.
 */
export function lgaCountForState(stateNumber) {
  const wanted = String(stateNumber ?? "").padStart(2, "0");
  const state = STATES.find((row) => row.number === wanted);
  return state ? (namesFor(state.code)?.length ?? null) : null;
}

/**
 * Every local government in a state, with the code each one carries.
 *
 * ── THE SAME ASSUMPTION, THE OTHER WAY ROUND ───────────────────────────────
 * `lgaNameFor` turns "01/07" into a name by taking the seventh name in sorted
 * order. This hands back the whole list with the numbers attached, which is
 * the same assumption stated once more rather than a second one: a picker
 * offering these and a code parsed back out of a return have to agree, and
 * they agree because they are the same sort.
 *
 * Empty for a state we hold no boundaries for. Not "numbers with no names" —
 * a picker with nothing to show is honest, and a picker offering "Local
 * government 07" is asking somebody to choose a number they cannot check.
 */
export function lgasForState(stateNumber) {
  const wanted = String(stateNumber ?? "").padStart(2, "0");
  const state = STATES.find((row) => row.number === wanted);
  const names = state ? namesFor(state.code) : null;
  if (!names?.length) return [];

  return names.map((name, index) => ({
    code: `${wanted}/${String(index + 1).padStart(2, "0")}`,
    name,
  }));
}

/** One local government, by its own "SS/LL" code rather than by a unit code. */
export function lgaNameForCode(lgaCode) {
  const [state, lga] = String(lgaCode ?? "").split("/");
  if (!state || !lga) return null;
  return lgasForState(state).find((row) => row.code === `${state.padStart(2, "0")}/${lga.padStart(2, "0")}`)?.name ?? null;
}
