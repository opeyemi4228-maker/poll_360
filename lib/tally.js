/**
 * Adding vote arrays up, and the one rule that makes it safe.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS ITS OWN MODULE
 *
 *  This is four lines of arithmetic that lived inside `snapshot` in
 *  lib/replay.js, and it produced the worst-presenting bug this product has
 *  had: the accumulators were sized from the board's party list while the loop
 *  ran to the *event's* vote length, so an event carrying more positions than
 *  the board named wrote past the end of the array. `undefined + n` is NaN,
 *  and that NaN then propagated into the national total, every state total,
 *  every share and every bar width on the command dashboard.
 *
 *  It did not look like an error. A bar width of `NaN%` is discarded by the
 *  browser, the element falls back to `width: auto`, and a block element fills
 *  its whole track — so the screen showed "VOTES COUNTED NaN" above four bars
 *  that each looked like a landslide.
 *
 *  It could not be caught by a test either, because lib/replay.js imports a
 *  map file through the `@/` alias and cannot be loaded by the test runner.
 *  Four lines of arithmetic that decide every figure on a dashboard have to be
 *  checkable, so they live here, importing nothing.
 * ══════════════════════════════════════════════════════════════════════════
 */

/**
 * Add one event's votes into a running tally.
 *
 * ── WHERE A POSITION GOES THAT THE BALLOT DOES NOT NAME ────────────────────
 * Neither dropping it nor overflowing the array is right. A vote is a vote, so
 * anything past the named positions folds into the "others" bucket, which
 * exists for exactly this and is already counted in every total.
 *
 * A board with no such bucket has nowhere honest to put it: an unnamed figure
 * added to the total would inflate every share computed against it. So the
 * surplus is left out of the count rather than allowed to distort it, and
 * returned separately so a caller can say so rather than let it pass unseen.
 *
 * @param into   the running tally, one entry per named position. Mutated.
 * @param votes  the event's figures, which may be longer or shorter than it.
 * @param fold   index of the "others" bucket, or -1 where there is none.
 * @returns      how much was counted, and how much had nowhere to go.
 */
export function addVotes(into, votes = [], fold = -1) {
  const width = into.length;
  let counted = 0;
  let unnamed = 0;

  for (let party = 0; party < votes.length; party += 1) {
    const value = votes[party];
    /* A hole in the array, or a figure that is not one. Skipped rather than
       added: this whole module exists because of one `undefined + n`. */
    if (!Number.isFinite(value)) continue;

    const at = party < width ? party : fold;
    if (at < 0) {
      unnamed += value;
      continue;
    }

    into[at] += value;
    counted += value;
  }

  return { counted, unnamed };
}

/** Which position holds the votes nobody named, or -1 where none does. */
export function foldIndex(slots = []) {
  return slots.findIndex((party) => party?.id === "OTH");
}
