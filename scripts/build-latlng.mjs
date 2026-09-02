/**
 * State boundaries in real degrees, for drawing on somebody else's basemap.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS EXISTS WHEN public/geo/map/states.json ALREADY HAS THE SHAPES
 *
 *  It does not have the shapes. It has a *picture* of them: paths projected
 *  into a 1000×812 canvas at build time, with the projection parameters
 *  thrown away. lib/geo.js recovers an approximation of that transform, and
 *  its own header is explicit that the approximation is good to about ten
 *  canvas units — a couple of kilometres — and is therefore fit for placing a
 *  marker and unfit for drawing a boundary.
 *
 *  On our own dark map that does not matter: nothing else on screen is
 *  geographic, so a state drawn two kilometres out is a state drawn two
 *  kilometres out from nothing. On a satellite image it matters enormously.
 *  A border that runs visibly through the wrong side of a river, over real
 *  imagery, is a claim about where a boundary is, and it is wrong.
 *
 *  So the polygons Google draws come from the boundary data itself, in the
 *  degrees it was published in, from the same source the SVG map was built
 *  from — geoBoundaries gbOpen, CC BY 4.0, which this repository already
 *  credits.
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/build-latlng.mjs          report only
 *   node scripts/build-latlng.mjs --write  write public/geo/map/states-latlng.json
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { states2023 } from "../lib/election2023.js";

const WRITE = process.argv.includes("--write");
const CACHE = join(process.cwd(), ".cache", "geo");
const SOURCE =
  "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/NGA/ADM1/geoBoundaries-NGA-ADM1_simplified.geojson";

/**
 * How much detail to keep, in degrees.
 *
 * ── CHOSEN AGAINST WHAT IT IS FOR, NOT AGAINST A FILE SIZE ────────────────
 * These outlines are drawn over a whole country on a phone or a wall display,
 * where one screen pixel is between one and four kilometres. 0.01° is about a
 * kilometre at this latitude, so a point dropped by this tolerance cannot
 * move the drawn edge by a visible amount at any zoom the layer is used at.
 * Zoom past that and the polygons are hidden anyway — see GoogleLayer, which
 * fades them out once the imagery is worth looking at on its own.
 */
const TOLERANCE = 0.01;

/* geoBoundaries writes the capital's name in full; this product calls it FCT,
   and every other name matches the 2023 record exactly. */
const RENAME = { "Abuja Federal Capital Territory": "Federal Capital Territory" };

const CODE_OF = new Map(states2023.map((row) => [row.name.toLowerCase(), row.code]));

async function geojson() {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, "nga-adm1.geojson");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));

  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`geoBoundaries: HTTP ${response.status}`);
  const text = await response.text();
  writeFileSync(file, text);
  return JSON.parse(text);
}

/** Perpendicular distance from a point to the line through a and b. */
function distance(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(point[0] - (a[0] + clamped * dx), point[1] - (a[1] + clamped * dy));
}

/** Ramer–Douglas–Peucker: drop the points that do not change the shape. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;

  let worst = 0;
  let at = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const gap = distance(points[index], points[0], points[points.length - 1]);
    if (gap > worst) {
      worst = gap;
      at = index;
    }
  }

  if (worst <= tolerance) return [points[0], points[points.length - 1]];

  return [
    ...simplify(points.slice(0, at + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(at), tolerance),
  ];
}

/**
 * The area centroid of a ring, which is where a pin belongs.
 *
 * Not the average of the vertices, which is pulled towards whichever coast has
 * the most detail in it, and not the centre of the bounding box, which for a
 * curved state sits outside the state. This is the centre of mass of the
 * polygon, and for every one of these it lands inside its own shape.
 */
function centroid(ring) {
  let twiceArea = 0;
  let x = 0;
  let y = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x0, y0] = ring[index];
    const [x1, y1] = ring[index + 1];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }

  if (!twiceArea) return ring[0];
  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

const ringsOf = (geometry) =>
  geometry.type === "Polygon"
    ? geometry.coordinates
    : geometry.coordinates.flatMap((polygon) => polygon);

/* -------------------------------------------------------------------------- */

const source = await geojson();
const states = [];
let before = 0;
let after = 0;

for (const feature of source.features) {
  const raw = feature.properties.shapeName;
  const name = RENAME[raw] ?? raw;
  const code = CODE_OF.get(name.toLowerCase());

  if (!code) {
    console.log(`  ! ${raw} does not match any state in the 2023 record`);
    continue;
  }

  const rings = ringsOf(feature.geometry)
    .map((ring) => {
      before += ring.length;
      const kept = simplify(ring, TOLERANCE);
      after += kept.length;
      /* [lng, lat] in GeoJSON; every mapping library here wants [lat, lng],
         and getting that backwards puts Nigeria in the Indian Ocean. */
      return kept.map(([lng, lat]) => [Number(lat.toFixed(4)), Number(lng.toFixed(4))]);
    })
    /* A ring of two points is a line and draws nothing; islands and sandbars
       simplified out of existence are dropped rather than kept as slivers. */
    .filter((ring) => ring.length > 3);

  /* The biggest ring is the mainland: the pin goes in that, not in an island
     off the coast. */
  const main = [...rings].sort((a, b) => b.length - a.length)[0];

  states.push({
    code,
    name,
    at: centroid(main.map(([lat, lng]) => [lng, lat]))
      .reverse()
      .map((value) => Number(value.toFixed(4))),
    rings,
  });
}

const missing = states2023.filter((row) => !states.some((item) => item.code === row.code));

console.log(`${states.length} of ${states2023.length} states matched`);
if (missing.length) console.log(`  MISSING: ${missing.map((row) => row.code).join(", ")}`);
console.log(`points ${before} -> ${after} (${((after / before) * 100).toFixed(1)}%)`);

const file = {
  source: source.features[0]?.properties?.shapeGroup
    ? "geoBoundaries gbOpen (CC BY 4.0), geoboundaries.org — ADM1, simplified"
    : "geoBoundaries gbOpen (CC BY 4.0), geoboundaries.org",
  note: "Real degrees, [lat, lng]. For drawing on a basemap that is itself geographic. The SVG paths in states.json are a projection of the same data and are not interchangeable with these.",
  tolerance: TOLERANCE,
  states,
};

const json = JSON.stringify(file);
console.log(`${(json.length / 1024).toFixed(0)}KB`);

if (!WRITE) {
  console.log("Nothing written. Re-run with --write.");
  process.exit(0);
}

writeFileSync(join(process.cwd(), "public", "geo", "map", "states-latlng.json"), json);
console.log("Wrote public/geo/map/states-latlng.json");
