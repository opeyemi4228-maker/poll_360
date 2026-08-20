import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseUnitCode } from "./units.js";

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
