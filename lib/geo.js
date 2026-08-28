/**
 * Points on the map, and how to place them.
 *
 * ── THE PROJECTION, RECOVERED RATHER THAN GUESSED ──────────────────────────
 * The boundary file was projected at build time and the parameters were not
 * kept, so placing a city on it means recovering the transform. Nigeria is
 * small enough, and near enough the equator, that the projection behaves
 * linearly across it: fitting a straight line through two widely separated
 * known label points, Lagos in the south-west, Maiduguri in the north-east, * reproduces every other state's label position to within about ten SVG units,
 * which is a couple of kilometres at this scale and invisible at the size a
 * city dot is drawn.
 *
 * It is an approximation and is used only for markers. Nothing is measured
 * from it, and no boundary is drawn with it.
 * ───────────────────────────────────────────────────────────────────────────
 */
const LON_SCALE = 83.47;
const LON_OFFSET = -212.6;
const LAT_SCALE = 85.8;
const LAT_OFFSET = 1178.7;

/** [longitude, latitude] -> [x, y] in the map's 1000×812 grid. */
export function project(lon, lat) {
  return [LON_OFFSET + lon * LON_SCALE, LAT_OFFSET - lat * LAT_SCALE];
}

/**
 * And back again: [x, y] on the map -> [longitude, latitude].
 *
 * The transform above is linear, so it inverts exactly, and the inverse is
 * what lets the map answer "where is this" for a place that has no reported
 * position of its own. What comes back is the coordinate of a *point on the
 * map* — the anchor a place's label is drawn at, which is inside its real
 * boundary and is not a survey of anything. A booth's own reported fix is a
 * different kind of fact and is never derived from this; see lib/db.js.
 */
export function unproject(x, y) {
  return [(x - LON_OFFSET) / LON_SCALE, (LAT_OFFSET - y) / LAT_SCALE];
}

/**
 * A coordinate as a room reads one out: five decimals, north/east implied.
 *
 * Five is about a metre, which is finer than any phone's fix and coarser than
 * the false precision of printing what a float happens to hold.
 */
export function coordinate(lon, lat) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return `${lat.toFixed(5)}°N  ${lon.toFixed(5)}°E`;
}

/**
 * Nigeria's commercial centres.
 *
 * `tier` is trade weight, not population: Lagos, Kano, Onitsha, Aba and Port
 * Harcourt are the country's principal markets, and they matter to a situation
 * room for a specific reason, they are where turnout is densest, where a
 * queue at close affects the most people, and where a disruption moves the
 * most votes per square kilometre.
 *
 * Coordinates are the cities' own, to two decimal places. No population
 * figures are attached: this repository has no census dataset, and inventing
 * 37 of them to colour a map would break the same rule the rest of the product
 * is built on. Density here is derived from the register, and labelled as such.
 */
export const COMMERCIAL_CENTRES = [
  { name: "Lagos", lon: 3.39, lat: 6.45, tier: 1, note: "Principal port and market" },
  { name: "Kano", lon: 8.52, lat: 12.0, tier: 1, note: "Northern commercial hub" },
  { name: "Onitsha", lon: 6.79, lat: 6.15, tier: 1, note: "Largest market in West Africa" },
  { name: "Aba", lon: 7.37, lat: 5.12, tier: 1, note: "Manufacturing and trade" },
  { name: "Port Harcourt", lon: 7.03, lat: 4.82, tier: 1, note: "Oil and shipping" },
  { name: "Abuja", lon: 7.49, lat: 9.06, tier: 1, note: "Federal capital" },
  { name: "Ibadan", lon: 3.9, lat: 7.38, tier: 2, note: "South-western trade" },
  { name: "Kaduna", lon: 7.44, lat: 10.52, tier: 2, note: "Northern industry" },
  { name: "Benin City", lon: 5.62, lat: 6.34, tier: 2, note: "Mid-west trade" },
  { name: "Warri", lon: 5.75, lat: 5.52, tier: 2, note: "Oil servicing" },
  { name: "Enugu", lon: 7.5, lat: 6.44, tier: 2, note: "South-eastern hub" },
  { name: "Jos", lon: 8.89, lat: 9.9, tier: 2, note: "Middle-belt trade" },
  { name: "Maiduguri", lon: 13.15, lat: 11.83, tier: 2, note: "North-eastern hub" },
  { name: "Ilorin", lon: 4.55, lat: 8.5, tier: 3, note: "North-central trade" },
  { name: "Abeokuta", lon: 3.35, lat: 7.15, tier: 3, note: "South-western trade" },
  { name: "Owerri", lon: 7.03, lat: 5.48, tier: 3, note: "South-eastern trade" },
  { name: "Calabar", lon: 8.33, lat: 4.96, tier: 3, note: "Port and free zone" },
  { name: "Sokoto", lon: 5.24, lat: 13.06, tier: 3, note: "North-western trade" },
  { name: "Uyo", lon: 7.93, lat: 5.04, tier: 3, note: "South-south trade" },
  { name: "Zaria", lon: 7.72, lat: 11.07, tier: 3, note: "Northern trade" },
].map((city) => {
  const [x, y] = project(city.lon, city.lat);
  return { ...city, x, y };
});
