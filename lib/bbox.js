/**
 * The extent of a set of SVG paths.
 *
 * ── WHY THIS IS NEEDED AT ALL ──────────────────────────────────────────────
 * Every state's LGA file is drawn in the *national* projection and carries the
 * national canvas with it: 1000×812, whatever the state. Render one straight
 * and Lagos is a thumbnail in the bottom-left corner of an empty rectangle,
 * with the other 90% of the frame given over to the parts of Nigeria that are
 * not in the file.
 *
 * Keeping the national projection is right, it means every state is drawn at
 * a consistent angle and shape rather than re-projected per state, but the
 * *window* has to be cropped to what is actually being drawn. That is what
 * this computes: the box the state occupies, which becomes the viewBox, so a
 * state fills its frame.
 * ───────────────────────────────────────────────────────────────────────────
 */

/** Every coordinate pair in an SVG path of M/L/Z commands. */
function* points(d) {
  const number = /-?\d+(?:\.\d+)?/g;
  const found = d.match(number);
  if (!found) return;
  for (let index = 0; index + 1 < found.length; index += 2) {
    yield [Number(found[index]), Number(found[index + 1])];
  }
}

/**
 * @returns {{ x, y, width, height, viewBox }} the box, padded a little so the
 * outermost coastline is not flush against the edge of the frame.
 */
export function boundsOf(paths, padding = 0.04) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const d of paths) {
    for (const [x, y] of points(d)) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 1000, height: 812, viewBox: "0 0 1000 812" };

  const width = maxX - minX;
  const height = maxY - minY;
  const padX = width * padding;
  const padY = height * padding;

  const box = {
    x: minX - padX,
    y: minY - padY,
    width: width + padX * 2,
    height: height + padY * 2,
  };

  return {
    ...box,
    viewBox: `${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.width.toFixed(1)} ${box.height.toFixed(1)}`,
  };
}

/**
 * How big one shape is inside that box, as a share of it.
 *
 * Used to decide whether a label fits: a 3-character party code needs roughly
 * 4% of the frame's width to sit inside a shape without spilling over its
 * neighbours.
 */
export function extentOf(d) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of points(d)) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return { width: maxX - minX, height: maxY - minY };
}
