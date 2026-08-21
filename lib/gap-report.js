import { results, declared } from "./db.js";
import { divergenceOf, alarming } from "./divergence.js";
import { LEVELS } from "./declared.js";

/**
 * Everything the divergence room shows, assembled once.
 *
 * ── WHY THE TWO SCREENS SHARE THIS ─────────────────────────────────────────
 * The situation room carries a summary of the gap and /gap carries the whole
 * thing. If each assembled its own, the headline count on one could disagree
 * with the list on the other — and the first time a room reads "3 impossible"
 * on the wall and finds four on the drill-down is the last time anybody
 * believes either number. One function, two renderings.
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * How many polling units each declared place says it contains.
 *
 * ── TAKEN ONLY FROM WHAT WAS DECLARED ──────────────────────────────────────
 * Never from our own polling-unit registry. That table is written as returns
 * arrive, so it records what has reported rather than what exists: a ward with
 * twenty booths and nine returns appears in it as a ward with nine booths.
 * Feeding that in would mark our coverage complete the moment it was anything
 * at all, and every unreported booth's votes would be reported as a
 * divergence — the precise false alarm the comparison is built to refuse.
 *
 * A place that did not state its unit count simply is not in this map, and
 * lib/divergence.js treats absence as "cannot establish completeness".
 */
function expectedUnits(rows) {
  const map = new Map();
  for (const row of rows) {
    if (row.units) map.set(row.key, row.units);
  }
  return map;
}

/**
 * Build the report for one election project.
 *
 * Returns everything both screens need, including the plain-language state of
 * "we have not been given anything to compare against yet", which is the
 * commonest state this screen will be in and the one an empty dashboard
 * explains worst.
 */
export async function gapReport(electionId) {
  if (!electionId) return empty();

  const [ours, theirs] = await Promise.all([
    results.counted(electionId),
    declared.all(electionId),
  ]);

  if (!theirs.length) return empty({ ours: ours.length });

  const expected = expectedUnits(theirs);
  const report = divergenceOf(ours, theirs, expected);

  /* What the alarm is allowed to make a noise about, worked out here so the
     room and the drill-down agree on what counts as urgent. */
  const urgent = alarming(report.flags);

  return {
    ...report,
    ready: true,
    ourReturns: ours.length,
    urgent,
    /* Which levels were actually declared at, so the filters offer only what
       exists rather than four tabs of which three are always empty. */
    levels: [...new Set(theirs.map((row) => row.level))].sort(
      (a, b) => LEVELS[a].rank - LEVELS[b].rank
    ),
    /* Places declared without a unit count, which is the single commonest
       reason a comparison comes back "too thin" and is worth naming rather
       than leaving somebody to wonder why their ward will not compare. */
    withoutUnitCount: theirs.filter((row) => !row.units).length,
    at: await declared.lastEntry(electionId),
  };
}

function empty(extra = {}) {
  return {
    ready: false,
    flags: [],
    urgent: [],
    impossible: 0,
    flipped: 0,
    divergent: 0,
    unmatched: 0,
    places: 0,
    declared: 0,
    compared: 0,
    tooThin: 0,
    agreeing: 0,
    ourReturns: 0,
    levels: [],
    withoutUnitCount: 0,
    at: null,
    ...extra,
  };
}
