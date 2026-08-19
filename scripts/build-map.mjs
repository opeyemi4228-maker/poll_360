/**
 * Build the national map payload.
 *
 * Input is the projected boundary set: geoBoundaries ADM1 (37 states), already
 * projected to SVG units and rounded to one decimal place. That file is
 * accurate to about a hundred metres, which is right for a state page that
 * fills the frame with one state, and roughly nine times more precision than
 * a national map 1,000 units wide can physically show.
 *
 * So this pass does three things, in order, and nothing else:
 *
 *   1. Round every coordinate to a whole SVG unit (~1.1km at national scale).
 *   2. Drop points that the rounding made identical to their neighbour, *      a coastline sampled every 200m collapses to a great many of these.
 *   3. Drop the middle point of any run of three that is collinear, which is
 *      what step 1 leaves behind along any straight administrative border.
 *
 * The result renders identically at national scale and is roughly half the
 * bytes. It is committed, so the site builds with no network access and the
 * map cannot change under us between deploys.
 *
 *   node scripts/build-map.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "public/geo/map/states.json");
const TARGET = join(root, "public/geo/map/nation.json");

/** "M433.7 692.9L433.3 692.7Z" -> [[["M",433.7,692.9] ...]] per subpath. */
function parse(d) {
  const subpaths = [];
  let current = null;
  const token = /([MLZ])([-\d.]+)?\s?([-\d.]+)?/g;
  let match;
  while ((match = token.exec(d))) {
    const [, command, x, y] = match;
    if (command === "Z") {
      if (current) subpaths.push(current);
      current = null;
      continue;
    }
    if (command === "M") {
      if (current) subpaths.push(current);
      current = [];
    }
    current?.push([Number(x), Number(y)]);
  }
  if (current) subpaths.push(current);
  return subpaths;
}

/** Twice the signed area of the triangle abc. Zero means collinear. */
function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function simplify(points) {
  const rounded = points.map(([x, y]) => [Math.round(x), Math.round(y)]);

  const deduped = rounded.filter(
    (point, index) =>
      index === 0 || point[0] !== rounded[index - 1][0] || point[1] !== rounded[index - 1][1]
  );

  const kept = [];
  for (const point of deduped) {
    while (kept.length >= 2 && cross(kept.at(-2), kept.at(-1), point) === 0) kept.pop();
    kept.push(point);
  }
  return kept;
}

/** The extent of a state in SVG units, decides whether a code fits inside it. */
function bounds(subpaths) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const points of subpaths) {
    for (const [x, y] of points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [Math.round(maxX - minX), Math.round(maxY - minY)];
}

function serialise(subpaths) {
  return subpaths
    .map((points) => {
      const simplified = simplify(points);
      /* A ring that survives simplification with fewer than three points has no
         area, an islet smaller than the rounding grid. Dropping it is the
         honest outcome: we cannot draw it at this scale, so we do not pretend
         to. Nothing at state level is ever lost this way. */
      if (simplified.length < 3) return "";
      return `M${simplified.map(([x, y]) => `${x} ${y}`).join("L")}Z`;
    })
    .join("");
}

const source = JSON.parse(await readFile(SOURCE, "utf8"));

const nation = {
  source: source.source,
  licence: "CC BY 4.0, geoBoundaries (gbOpen). Attribution is printed under the map.",
  built: new Date().toISOString().slice(0, 10),
  width: source.width,
  height: source.height,
  /* The size the party code is drawn at on a state. Lives with the shapes
     because it is a property of the projection, not of the component. */
  labelSize: 13,
  states: source.states.map((state) => {
    const subpaths = parse(state.d);
    const [w, h] = bounds(subpaths);
    return {
      code: state.code,
      name: state.name,
      slug: state.slug,
    /* Where the party code goes: a pole-of-inaccessibility style point already
       computed upstream, kept to one decimal because a label 100m out of place
       is invisible and a label rounded to a whole unit can drift off a
       narrow state. */
      at: state.at.map((n) => Math.round(n * 10) / 10),
      /* Extent, so the board can decide whether a three-letter code fits
         inside the shape. Lagos and Ekiti cannot hold one at national scale;
         the table beneath the map is where their leader is named in words. */
      w,
      h,
      d: serialise(subpaths),
    };
  }),
};

await writeFile(TARGET, JSON.stringify(nation));

const before = JSON.stringify(source).length;
const after = JSON.stringify(nation).length;
console.log(
  `nation.json, ${nation.states.length} states, ${(after / 1024).toFixed(1)}KB ` +
    `(from ${(before / 1024).toFixed(1)}KB, ${Math.round((1 - after / before) * 100)}% smaller)`
);
