import { readFileSync } from "node:fs";
import path from "node:path";

import nation from "@/public/geo/map/nation.json";
import { hrefWith } from "./Panels";
import { LIGHTS } from "@/lib/lights";
import { STATES } from "@/lib/units";
import { formatNumber } from "@/lib/utils";

/**
 * The room's map: the big dark panel every desk works from.
 *
 * The same look as the existing situation room's map, so a person who moves
 * between desks is looking at one instrument: a near-black field, each place
 * drawn in dots of its light's colour, and a label on every place that has
 * something open. The country shows states; a state shows its local
 * governments. Below that there are no boundaries we hold, and the list
 * beside the map takes over.
 *
 * Colour is never the only clue: each light is a different dot pattern
 * (solid, ringed, sparse, hollow), each labelled place carries the light's
 * own mark, and the legend names all four.
 */
const NUMBER_BY_CODE = new Map(STATES.map((state) => [state.code, state.number]));
const CODE_BY_NUMBER = new Map(STATES.map((state) => [state.number, state.code]));
const INK = { RED: "#ff4d4d", YELLOW: "#ffd21f", GREEN: "#2fd67b", GREY: "#3a4160" };
const MARK = { RED: "✖", YELLOW: "▲", GREEN: "✔", GREY: "○" };

const held = new Map();
/** A state's local governments, in INEC's order: alphabetical, numbered from 01. */
function lgaShapes(stateNumber) {
  const code = CODE_BY_NUMBER.get(stateNumber);
  if (!code) return null;
  if (held.has(code)) return held.get(code);
  let out = null;
  try {
    const file = JSON.parse(readFileSync(path.join(process.cwd(), "public", "geo", "lga", `${code}.json`), "utf8"));
    const shapes = [...(file.lgas ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    out = { width: file.width, height: file.height, shapes: shapes.map((shape, index) => ({ code: `${stateNumber}/${String(index + 1).padStart(2, "0")}`, name: shape.name, d: shape.d })) };
  } catch {
    out = null;
  }
  held.set(code, out);
  return out;
}

/** The box a set of path strings sits in, so a state fills the panel. */
function boxOf(shapes) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const shape of shapes) {
    for (const match of shape.d.matchAll(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)) {
      const [x, y] = [Number(match[1]), Number(match[2])];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const pad = Math.max(x1 - x0, y1 - y0) * 0.06;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

function centreOf(d) {
  const box = boxOf([{ d }]);
  return [box.x + box.w / 2, box.y + box.h / 2];
}

/**
 * `paint` lets a desk colour the map by something other than the light (the
 * technical desk paints by how long a state has been silent) and `legend`
 * then says what each colour means there. `still` draws it with nothing to
 * tap.
 */
export default function BigMap({ rows, base, query = {}, at = "", title = "Nigeria", hint = null, wall = false, still = false, measure = null, paint = null, legend = null, className = "" }) {
  const fixed = wall || still;
  const state = at ? at.slice(0, 2) : "";
  const inside = state ? lgaShapes(state) : null;
  const byCode = new Map(rows.map((row) => [row.code, row]));

  const shapes = inside
    ? inside.shapes.map((shape) => ({ ...shape, row: byCode.get(shape.code), centre: centreOf(shape.d) }))
    : nation.states.map((shape) => ({ code: NUMBER_BY_CODE.get(shape.code), name: shape.name, d: shape.d, row: byCode.get(NUMBER_BY_CODE.get(shape.code)), centre: shape.at, short: shape.code }));
  const box = inside ? boxOf(inside.shapes) : { x: 0, y: 0, w: nation.width, h: nation.height };
  const unit = box.w / 1000;
  const lightOf = (shape) => (shape.row ? (paint ? paint(shape.row) : shape.row.light) : null);
  const labelled = shapes
    .filter((shape) => shape.row && (lightOf(shape) === "RED" || lightOf(shape) === "YELLOW" || (measure && shape.row.reported)))
    .sort((a, b) => (b.row.counts?.red ?? 0) - (a.row.counts?.red ?? 0))
    .slice(0, inside ? 30 : 14);
  const tally = { RED: 0, YELLOW: 0, GREEN: 0, GREY: 0 };
  for (const shape of shapes) if (shape.row) tally[lightOf(shape)] += 1;

  return (
    <section className={`overflow-hidden rounded-dash bg-[#090c17] text-white ${className}`} aria-label={`Map of ${title}`}>
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <h2 className="text-[0.9375rem] font-bold">{title}</h2>
        <p className="flex items-center gap-4 text-[0.8125rem] text-white/50">
          {at && !fixed && <a href={hrefWith(base, query, { at: null, unit: null })} className="font-semibold text-white/80 underline-offset-2 hover:underline">← The whole country</a>}
          {hint ?? (inside ? "Tap a local government" : "Tap a state")}
        </p>
      </header>

      <div className="relative">
        <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className={wall ? "h-auto w-full" : "h-auto max-h-[46rem] min-h-[26rem] w-full"} role="img" aria-label={`Map of ${title}, each place drawn in the colour and pattern of its light`}>
          <defs>
            <pattern id="room-grid" width={40 * unit} height={40 * unit} patternUnits="userSpaceOnUse">
              <path d={`M ${40 * unit} 0 L 0 0 0 ${40 * unit}`} fill="none" stroke="#ffffff" strokeOpacity="0.035" strokeWidth={unit} />
            </pattern>
            {Object.entries(INK).map(([light, ink]) => {
              const size = (light === "GREY" ? 9 : 7) * unit;
              return (
                <pattern key={light} id={`room-dots-${light}`} width={size} height={size} patternUnits="userSpaceOnUse">
                  <rect width={size} height={size} fill="#090c17" />
                  {light === "YELLOW" ? (
                    <circle cx={size / 2} cy={size / 2} r={size * 0.3} fill="none" stroke={ink} strokeWidth={size * 0.2} />
                  ) : light === "GREY" ? (
                    <circle cx={size / 2} cy={size / 2} r={size * 0.16} fill={ink} />
                  ) : light === "GREEN" ? (
                    <circle cx={size / 2} cy={size / 2} r={size * 0.3} fill={ink} />
                  ) : (
                    <rect x={size * 0.12} y={size * 0.12} width={size * 0.76} height={size * 0.76} rx={size * 0.2} fill={ink} />
                  )}
                </pattern>
              );
            })}
          </defs>
          <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="url(#room-grid)" />

          {shapes.map((shape) => {
            const light = lightOf(shape);
            const label = shape.row
              ? `${shape.name}: ${legend?.[light] ?? LIGHTS[light].label}. ${shape.row.reported ? `${shape.row.coveragePct.toFixed(1)}% reported, ${formatNumber(shape.row.reported)} of ${formatNumber(shape.row.total)} polling units` : "No returns yet"}`
              : `${shape.name}: not on your ground`;
            const drawn = (
              <path d={shape.d} fill={light ? `url(#room-dots-${light})` : "#0e1220"} stroke={light ? "#090c17" : "#1b2136"} strokeWidth={(inside ? 1.2 : 2) * unit} strokeLinejoin="round" opacity={light ? 1 : 0.6}>
                <title>{label}</title>
              </path>
            );
            return shape.row && !fixed ? (
              <a key={shape.code ?? shape.name} href={hrefWith(base, query, { at: shape.code, unit: null })} aria-label={label} className="outline-none [&:focus-visible>path]:stroke-white [&:hover>path]:stroke-white">
                {drawn}
              </a>
            ) : (
              <g key={shape.code ?? shape.name}>{drawn}</g>
            );
          })}

          {/* A chip on every place with something open, so the map can be read
              from across a room and without its colours. */}
          {labelled.map((shape) => {
            /* A state is drawn smaller than the country in the same panel,
               so its labels are drawn larger to come out the same size. */
            const k = unit * (inside ? 1.9 : 1);
            const w = (inside ? Math.max(86, shape.name.length * 8.4 + 18) : 96) * k;
            const h = 38 * k;
            const [x, y] = shape.centre;
            const line = measure ? measure(shape.row) : shape.row.reported ? `${shape.row.coveragePct.toFixed(shape.row.coveragePct < 10 ? 1 : 0)}%` : "0%";
            return (
              <g key={`label-${shape.code}`} pointerEvents="none">
                <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={5 * k} fill="#11131c" fillOpacity="0.92" stroke={INK[lightOf(shape)]} strokeWidth={1.2 * k} />
                <text x={x} y={y - 3 * k} textAnchor="middle" fontSize={10.5 * k} fontWeight="600" fill="#ffffff" fillOpacity="0.75" style={{ textTransform: "uppercase", letterSpacing: `${0.4 * k}px` }}>
                  {inside ? shape.name : (shape.short ?? shape.name)}
                </text>
                <text x={x} y={y + 12 * k} textAnchor="middle" fontSize={13 * k} fontWeight="800" fill={INK[lightOf(shape)]}>
                  {MARK[lightOf(shape)]} {line}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-white/10 px-6 py-3 text-[0.8125rem] font-semibold">
        {["RED", "YELLOW", "GREEN", "GREY"].map((light) => (
          <span key={light} className="inline-flex items-center gap-1.5" style={{ color: light === "GREY" ? "#9aa3c0" : INK[light] }}>
            {MARK[light]} {legend?.[light] ?? LIGHTS[light].label}
            <span className="tabular-nums text-white/60">{tally[light]}</span>
          </span>
        ))}
        {at.length > 2 && <span className="text-white/50">Showing {title}. Below a local government there are no boundaries to draw; use the list.</span>}
      </footer>
    </section>
  );
}
