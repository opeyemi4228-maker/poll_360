/**
 * Reading the reporting board, in a browser.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THESE TWO FUNCTIONS LIVE APART FROM THE THING THAT BUILDS THEM
 *
 *  lib/reporting.js assembles the board, and to do that it has to turn a
 *  local government code into a name — which means lib/lga-names.js, which
 *  reads the name tables off disk with `node:fs`.
 *
 *  An import is not a conversation about intent. A client component importing
 *  one function from that module pulls the whole module, and the whole module
 *  pulls `node:fs`, and the build stops with "the chunking context does not
 *  support external modules". It is the same trap lib/watch.js documents at
 *  its foot, and the same one lib/db.js keeps its shapes away from.
 *
 *  So the two functions the room actually calls in the browser are here,
 *  where they depend on nothing at all. They are lookups on a plain object —
 *  the board has already been assembled and serialised by the time anybody
 *  calls these — and the seam is exactly the server/browser boundary the
 *  board was flattened to cross in the first place.
 * ══════════════════════════════════════════════════════════════════════════
 */

/**
 * The children of one path, out of a flattened board.
 *
 * `path` is place *names*, in the order the map drilled through them —
 * ["Borno", "Askira/Uba"] — which is exactly the trail the room already
 * holds. Missing is an empty list rather than a throw: a ward the roster has
 * never heard of is a ward with nothing to report, not an error.
 */
export function under(board, path = []) {
  return board?.places?.[path.filter(Boolean).join("|")] ?? [];
}

/** One place, by the same name path. Null where nothing was rolled up for it. */
export function placeIn(board, path = []) {
  if (path.length === 0) return board?.total ?? null;
  const parent = under(board, path.slice(0, -1));
  return parent.find((row) => row.name === path.at(-1)) ?? null;
}
