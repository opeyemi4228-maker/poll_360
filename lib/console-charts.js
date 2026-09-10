/**
 * The arithmetic behind the console's pictures.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE GEOMETRY LIVES IN lib/ AND NOT IN THE COMPONENT
 *
 *  A chart is a claim about a number, made in pixels. If the mapping from the
 *  number to the pixel is wrong, the chart is not ugly — it is false, and it
 *  is false in the one way nobody checks, because a plausible-looking bar is
 *  indistinguishable from a correct one. The whole product's argument is that
 *  a figure carries its own qualification; a picture that quietly misplaces
 *  the figure is worse than the sentence it replaced.
 *
 *  Everything here is a pure function of numbers, so it can be pinned by a
 *  test that needs no browser, no database and no rendering. That is the same
 *  reason lib/alerts.js exports its thresholds rather than burying them: a
 *  line a test cannot pin is a line that drifts.
 * ══════════════════════════════════════════════════════════════════════════
 */

/**
 * Where a reading sits on a meter, as a fraction from the left.
 *
 * Pinned to the ends rather than allowed off the track, and the caller is
 * told separately whether it was pinned — see `beyondScale`. A bar that
 * silently maxes out hides the difference between a slow query and a dead
 * one, which is the difference the meter exists to show.
 */
export function meterPosition(value, ceiling) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  if (ceiling <= 0) return 0;
  return Math.min(1, Math.max(0, value / ceiling));
}

/** Whether a reading ran off the top of its scale. */
export function beyondScale(value, ceiling) {
  if (value === null || value === undefined || !Number.isFinite(value)) return false;
  return value > ceiling;
}

/**
 * Which named band a reading falls in.
 *
 * Bands are given in order, each with the value it extends *to*, so the first
 * one whose ceiling the reading has not exceeded is the one it is in. A
 * reading past the last band returns that last band, and the caller pairs
 * that with `beyondScale` to say so out loud.
 */
export function bandFor(value, bands) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return bands.find((band) => value <= band.to) ?? bands.at(-1) ?? null;
}

/**
 * How long ago something happened, placed on a logarithmic scale.
 *
 * ── WHY LOG, AND WHY THE TICKS MUST BE LABELLED ────────────────────────────
 * Linear over a week, a minute and an hour occupy the same pixel and the
 * entire live end of the scale collapses into the right-hand edge — which is
 * exactly the end somebody is reading. Log spreads it.
 *
 * The cost is that equal distances are not equal times, so the component
 * draws its gridlines at real, named intervals (a minute, an hour, a day, a
 * week) rather than at even spacing. An unlabelled log axis is a lie by
 * omission, and this is the function that makes it one if the labels are ever
 * dropped.
 *
 * Returns a fraction from the left: 1 is "now", 0 is the horizon and older.
 */
export function recencyPosition(minutesAgo, horizonMinutes) {
  if (minutesAgo === null || minutesAgo === undefined || !Number.isFinite(minutesAgo)) return null;
  if (horizonMinutes <= 1) return 1;
  /* Anything inside the last minute is "now". Below one minute the logarithm
     turns negative and would push a fresh event off the right-hand end. */
  if (minutesAgo <= 1) return 1;
  if (minutesAgo >= horizonMinutes) return 0;
  return 1 - Math.log(minutesAgo) / Math.log(horizonMinutes);
}

/** Minutes between an instant and now, or null where there is no instant. */
export function minutesSince(at, now) {
  if (!at) return null;
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, (now - date.getTime()) / 60000);
}

/**
 * A bar's length as a percentage, with a floor.
 *
 * ── THE FLOOR IS NOT COSMETIC ──────────────────────────────────────────────
 * A table with three rows in it beside a table with three million would draw
 * as an empty track, and an empty track means "none" everywhere else in this
 * product. "A few" and "none" are the two states these screens exist to tell
 * apart, so a real value always gets visible ink and only a true zero gets
 * none.
 */
export function barPercent(value, top, floor = 1.5) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(top) || top <= 0) return floor;
  return Math.max(floor, Math.min(100, (value / top) * 100));
}

/**
 * The share each segment of a split takes, as percentages that sum to 100.
 *
 * Zero-valued segments are dropped rather than drawn as slivers: a category
 * with nothing in it is not a thin slice, it is absent, and the list beneath
 * the bar is where its absence is legible.
 */
export function splitShares(segments) {
  const shown = segments.filter((row) => row.value > 0);
  const total = shown.reduce((sum, row) => sum + row.value, 0);
  if (total === 0) return [];
  return shown.map((row) => ({ ...row, share: (row.value / total) * 100 }));
}
