/**
 * How a quantity becomes a band of colour.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A LINEAR RAMP IS THE WRONG SHAPE FOR A SKEWED FIGURE
 *
 *  Most quantities this product draws on a map are not spread evenly across
 *  the federation. Voters per polling unit is the clearest case: a handful of
 *  places sit far above the rest, and a scale drawn from the lowest value to
 *  the highest spends most of its bands on a range nothing occupies. The map
 *  comes out as one bright state and thirty-six identical dark ones —
 *  technically a correct linear encoding, and useless, because every
 *  difference a reader came to see is inside the bottom band.
 *
 *  Quantiles fix it by construction: the breaks are placed so each band holds
 *  about the same number of places, so every band is occupied however skewed
 *  the figures are.
 *
 *  ── WHAT IT COSTS ───────────────────────────────────────────────────────
 *  Equal steps of colour stop meaning equal steps of quantity. Two adjacent
 *  bands may be forty apart at one end of the scale and four hundred at the
 *  other. That is a real trade, and it is why the legend prints the value at
 *  every break instead of a smooth gradient — the colour ranks a place, and
 *  the figures beside it say what the ranking is worth.
 *
 *  ── AND WHY IT LIVES HERE ───────────────────────────────────────────────
 *  In lib/, where a test can pin it without a browser. A scale that misplaces
 *  a value is not ugly, it is false, and it is false in the way nobody checks:
 *  a plausible map and a correct one look the same.
 * ══════════════════════════════════════════════════════════════════════════
 */

/**
 * The value at each band edge, for `count` bands.
 *
 * Returns `count - 1` breaks: nine edges make ten bands. Computed off whatever
 * is on screen, which is the point — drilling into a state re-ranks that
 * state's local governments against each other rather than against Lagos.
 *
 * Anything that is not a finite number is dropped rather than sorted. A row
 * with no register and no booths yields NaN, and one NaN in a sort corrupts
 * every break after it.
 */
export function breaksFor(values, count) {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0 || count < 2) return [];

  return Array.from({ length: count - 1 }, (_, index) => {
    const at = Math.floor(((index + 1) / count) * sorted.length);
    return sorted[Math.min(sorted.length - 1, at)];
  });
}

/**
 * Which band a value falls in, given the breaks.
 *
 * The first band whose edge the value has not passed. Walked rather than
 * bisected: it is a handful of comparisons once per shape, and a binary search
 * here would be cleverness nobody can check.
 */
export function bandOf(value, breaks, count) {
  let band = 0;
  while (band < breaks.length && value >= breaks[band]) band += 1;
  return Math.min(count - 1, band);
}
