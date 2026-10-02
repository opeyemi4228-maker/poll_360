import { matchLgaNames } from "../stronghold-map.js";

/**
 * The outlines under an Ask Poll360 map, each with the colour the answer gave
 * it — worked out the same way wherever the file is being drawn.
 *
 * The server reads the outline files from disk (lib/ask/geometry.js); the
 * screen fetches the same files from public/geo. Both hand them here, so the
 * brief a browser draws and the brief a server draws cannot disagree.
 */

const NONE = "#edeef1";
/* The country behind a regional answer: lighter than any colour in a legend. */
const BACKDROP = "#f3f4f6";

function boxOf(paths) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of paths) {
    const numbers = d.match(/-?\d+(\.\d+)?/g) ?? [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      const x = Number(numbers[i]);
      const y = Number(numbers[i + 1]);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const pad = Math.max(maxX - minX, maxY - minY) * 0.03;
  return [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2];
}

/** The file a map's outlines live in, under public/geo. */
export const outlineFile = (map) => (map.level === "lga" ? `lga/${map.state}.json` : "map/nation.json");

/**
 * @param map      the spec from lib/ask/visual.js
 * @param outlines the parsed outline file
 * @returns {{ box: number[], regions: { d, color }[] }}
 */
export function regionsFor(map, outlines) {
  if (map.level === "state") {
    /* The whole country, the question's states lit and the rest faint —
       never a crop. Faint states first so the lit ones' borders sit on top. */
    const regions = outlines.states
      .map((state) => ({ d: state.d, color: map.fills[state.code]?.color ?? BACKDROP, filled: Boolean(map.fills[state.code]) }))
      .sort((a, b) => Number(a.filled) - Number(b.filled));
    return { box: [0, 0, outlines.width ?? 1000, outlines.height ?? 812], regions };
  }
  const pairs = matchLgaNames(Object.keys(map.fills), outlines.lgas.map((lga) => lga.name));
  const byShape = new Map([...pairs.entries()].map(([ours, theirs]) => [theirs, ours]));
  const regions = outlines.lgas.map((lga) => {
    const ours = byShape.get(lga.name);
    return { d: lga.d, color: ours ? map.fills[ours]?.color ?? NONE : NONE };
  });
  return { box: boxOf(regions.map((region) => region.d)), regions };
}
