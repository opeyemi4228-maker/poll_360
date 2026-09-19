import { parseUnitCode } from "./units.js";

/**
 * The figures a post draws, for any place from the country down to one booth.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FIVE LEVELS, ONE SUM
 *
 *  A results night is reported at every level at once: the country, a state,
 *  a local government's collation, a ward, a single polling unit. Each is the
 *  same sum over a different set of returns, so it is one function with a
 *  scope rather than five with five chances to disagree about what "reporting"
 *  means.
 *
 *  Scopes are written the way lib/broadcast.js writes them, extended down:
 *
 *    NATION                   everything
 *    STATE:19                 Kano
 *    LGA:19/03                a local government in Kano
 *    WARD:19/03/07            a ward in it
 *    UNIT:19/03/07/012        one polling unit
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pure: rows in, figures out. Used by the server when a post is saved and by
 * the tests.
 */

export const LEVELS = ["nation", "state", "lga", "ward", "unit"];

/** The level a scope names. */
export function levelOf(scope) {
  if (!scope || scope === "NATION") return "nation";
  const head = String(scope).split(":")[0];
  return { STATE: "state", LGA: "lga", WARD: "ward", UNIT: "unit" }[head] ?? "nation";
}

/** Does this booth's code sit inside this scope? */
export function within(unitCode, scope) {
  if (!scope || scope === "NATION") return true;
  const parsed = parseUnitCode(unitCode);
  if (!parsed) return false;
  const [head, rest = ""] = String(scope).split(":");
  const parts = rest.split("/").map((part, index) => part.padStart(index === 3 ? 3 : 2, "0"));
  if (head === "STATE") return parsed.stateNumber === parts[0];
  if (head === "LGA") return parsed.lgaCode === parts.slice(0, 2).join("/");
  if (head === "WARD") return parsed.wardCode === parts.slice(0, 3).join("/");
  if (head === "UNIT") return parsed.code === parts.slice(0, 4).join("/");
  return false;
}

/** The scope one level down that a booth falls in, below a given level. */
export function childScope(unitCode, level) {
  const parsed = parseUnitCode(unitCode);
  if (!parsed) return null;
  if (level === "nation") return `STATE:${parsed.stateNumber}`;
  if (level === "state") return `LGA:${parsed.lgaCode}`;
  if (level === "lga") return `WARD:${parsed.wardCode}`;
  if (level === "ward") return `UNIT:${parsed.code}`;
  return null;
}

/**
 * Add a set of returns up.
 *
 * @param rows      returns, each { unitCode, status, registered, accredited, rejected, votes }
 * @param expected  how many booths this place should produce, or 0 if unknown
 */
export function sumRows(rows = [], expected = 0) {
  const votes = {};
  let verified = 0;
  let registered = 0;
  let accredited = 0;
  let rejected = 0;
  for (const row of rows) {
    if (row.status === "VERIFIED") verified += 1;
    registered += row.registered ?? 0;
    accredited += row.accredited ?? 0;
    rejected += row.rejected ?? 0;
    for (const [party, count] of Object.entries(row.votes ?? {})) {
      votes[party] = (votes[party] ?? 0) + (Number(count) || 0);
    }
  }
  const cast = Object.values(votes).reduce((sum, value) => sum + value, 0);
  return {
    filed: rows.length,
    expected,
    verified,
    registered,
    accredited,
    rejected,
    cast,
    reporting: expected > 0 ? Math.min(100, (rows.length / expected) * 100) : null,
    turnout: registered > 0 ? (accredited > 0 ? (accredited / registered) * 100 : (cast / registered) * 100) : null,
    parties: Object.entries(votes)
      .map(([id, count]) => ({ id, votes: count, share: cast > 0 ? (count / cast) * 100 : 0 }))
      .sort((a, b) => b.votes - a.votes),
  };
}

/**
 * The places one level down, each with its leader — what a map colours in.
 *
 * @returns [{ scope, filed, leader, share, margin, cast }]
 */
export function cellsBelow(rows = [], scope) {
  const level = levelOf(scope);
  const groups = new Map();
  for (const row of rows) {
    if (!within(row.unitCode, scope)) continue;
    const child = childScope(row.unitCode, level);
    if (!child) continue;
    if (!groups.has(child)) groups.set(child, []);
    groups.get(child).push(row);
  }
  return [...groups.entries()].map(([child, members]) => {
    const sum = sumRows(members);
    const [first, second] = sum.parties;
    return {
      scope: child,
      filed: sum.filed,
      cast: sum.cast,
      leader: first?.id ?? null,
      share: first ? Math.round(first.share * 10) / 10 : null,
      margin: first ? Math.round((first.share - (second?.share ?? 0)) * 10) / 10 : null,
    };
  });
}

const POSTERS = new Set(["breaking-card", "incident", "situation", "quote"]);

/**
 * Which layout a post draws in.
 *
 * "Result card" chooses for the place: a map for a state and for a local
 * government's collation, the wall of faces for the country, bars for a ward
 * and a booth. The explicit formats override it.
 */
export function layoutFor(payload) {
  const format = payload?.format ?? "result-card";
  if (POSTERS.has(format)) return "poster";
  if (format === "turnout") return "turnout";
  if (format === "faces") return "faces";
  if (format === "bars") return "bars";
  if (format === "map") return payload.map ? "map" : "bars";
  const level = payload?.level ?? "nation";
  if (level === "state" || level === "lga") return payload.map ? "map" : "faces";
  if (level === "ward" || level === "unit") return "bars";
  return "faces";
}

