import { readFileSync } from "node:fs";
import path from "node:path";

import nation from "@/public/geo/map/nation.json";
import LiveMap from "./LiveMap";
import { hrefWith } from "./Panels";
import { LIGHTS } from "@/lib/lights";
import { STATES } from "@/lib/units";
import { formatNumber } from "@/lib/utils";

/**
 * The server's half of the room's map.
 *
 * It decides what is drawn and never how it is handled: which shapes (the
 * country's states, or one state's local governments), where pressing each
 * one goes, and every way the map can be coloured, worked out in full for
 * every place before anything is sent. The browser's half, LiveMap, only
 * switches between answers it was already given, so changing what the map
 * shows costs no round trip and can show nothing the reader may not see.
 *
 * `layers` is this desk's own questions, asked first. Each is
 * `{ id, name, tone(row), label(row), says(row), legend }`. The four every
 * desk gets follow: the light, how much is in, turnout, and what is open.
 */
const NUMBER_BY_CODE = new Map(STATES.map((state) => [state.code, state.number]));
const CODE_BY_NUMBER = new Map(STATES.map((state) => [state.number, state.code]));

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
    out = shapes.map((shape, index) => ({ code: `${stateNumber}/${String(index + 1).padStart(2, "0")}`, name: shape.name, d: shape.d }));
  } catch {
    out = null;
  }
  held.set(code, out);
  return out;
}

/** A board of tiles, one per place, for the levels that have no boundaries. */
function tilesFor(rows) {
  const [w, h, gap] = [168, 92, 12];
  const cols = Math.max(1, Math.ceil(Math.sqrt(rows.length * 1.9)));
  return [...rows].sort((a, b) => a.code.localeCompare(b.code)).map((row, index) => {
    const x = (index % cols) * (w + gap);
    const y = Math.floor(index / cols) * (h + gap);
    return { code: row.code, name: row.name, d: `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`, centre: [x + w / 2, y + h / 2] };
  });
}

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

const pct = (value) => `${value.toFixed(value < 10 ? 1 : 0)}%`;

/** The four questions every desk's map can answer. */
export const COMMON_LAYERS = [
  {
    id: "light",
    name: "Lights",
    tone: (row) => row.light,
    label: (row) => (row.level === "pu" ? (row.reported ? "result in" : "no returns") : row.reported ? pct(row.coveragePct) : "0%"),
    says: (row) => LIGHTS[row.light].label,
    legend: { RED: LIGHTS.RED.label, YELLOW: LIGHTS.YELLOW.label, GREEN: LIGHTS.GREEN.label, GREY: LIGHTS.GREY.label },
  },
  {
    id: "coverage",
    name: "Reported",
    tone: (row) => (!row.reported ? "GREY" : row.coveragePct >= 75 ? "GREEN" : row.coveragePct >= 25 ? "YELLOW" : "RED"),
    label: (row) => pct(row.coveragePct),
    says: (row) => (row.reported ? `${pct(row.coveragePct)} of polling units reported` : "No returns yet"),
    show: (row) => row.reported > 0,
    legend: { GREEN: "75% or more in", YELLOW: "25% to 75% in", RED: "Under 25% in", GREY: "No returns yet" },
  },
  {
    id: "turnout",
    name: "Turnout",
    tone: (row) => (row.bvas.turnout == null ? "GREY" : row.bvas.turnout >= 95 ? "RED" : row.bvas.turnout >= 60 ? "YELLOW" : "GREEN"),
    label: (row) => (row.bvas.turnout == null ? "none" : pct(row.bvas.turnout)),
    says: (row) => (row.bvas.turnout == null ? "No BVAS figure yet" : `${pct(row.bvas.turnout)} BVAS turnout`),
    show: (row) => row.bvas.turnout != null,
    legend: { GREEN: "Under 60% turnout", YELLOW: "60% to 95%", RED: "95% or more: implausible", GREY: "No BVAS figure yet" },
  },
  {
    id: "open",
    name: "Open items",
    tone: (row) => (row.counts.red + row.areaItems.red ? "RED" : row.counts.yellow + row.areaItems.yellow ? "YELLOW" : row.reported ? "GREEN" : "GREY"),
    label: (row) => String(row.counts.red + row.counts.yellow + row.areaItems.red + row.areaItems.yellow),
    says: (row) => `${row.counts.red + row.areaItems.red} red and ${row.counts.yellow + row.areaItems.yellow} yellow polling units`,
    legend: { RED: "Red open", YELLOW: "Yellow open", GREEN: "Nothing open", GREY: "No returns yet" },
  },
];

const facts = (row) => [
  ["Polling units", `${formatNumber(row.reported)} of ${formatNumber(row.total)}`],
  ["Reported", row.reported ? pct(row.coveragePct) : "No returns yet"],
  ["Red · yellow · cleared", `${formatNumber(row.counts.red)} · ${formatNumber(row.counts.yellow)} · ${formatNumber(row.counts.green)}`],
  ["BVAS accredited", row.bvas.accredited == null ? "No figure yet" : formatNumber(row.bvas.accredited)],
  ...(row.bvas.turnout != null ? [["Turnout", pct(row.bvas.turnout)]] : []),
];

export default function BigMap({ rows, base, query = {}, at = "", title = "Nigeria", hint = null, still = false, wall = false, layers = [], only = false, plain = false, measure = null, paint = null, legend = null }) {
  const state = at ? at.slice(0, 2) : "";
  /* Below a state's local governments there are no boundaries we hold, so
     wards and polling units are laid out as tiles and worked the same way. */
  const tiled = at.length > 2;
  const inside = tiled ? tilesFor(rows) : state ? lgaShapes(state) : null;
  const byCode = new Map(rows.map((row) => [row.code, row]));
  const fixed = still || wall;

  const drawn = (inside ?? nation.states.map((shape) => ({ code: NUMBER_BY_CODE.get(shape.code), name: shape.name, d: shape.d, centre: shape.at, short: shape.code }))).map((shape) => {
    const box = shape.centre ? null : boxOf([shape]);
    return {
      code: shape.code,
      name: shape.name,
      short: shape.short ?? null,
      d: shape.d,
      centre: shape.centre ?? [box.x + box.w / 2, box.y + box.h / 2],
      href: byCode.has(shape.code) && !fixed ? hrefWith(base, query, shape.code.split("/").length === 4 ? { unit: shape.code } : { at: shape.code, unit: null }) : null,
    };
  });
  const box = inside ? boxOf(inside) : { x: 0, y: 0, w: nation.width, h: nation.height };

  /* The older way a desk asked its own question of the map, kept working. */
  const legacy = measure || paint ? [{ id: "desk", name: "This desk", tone: paint ?? ((row) => row.light), label: measure ?? COMMON_LAYERS[0].label, says: (row) => (legend?.[(paint ?? ((r) => r.light))(row)] ?? LIGHTS[row.light].label), show: measure ? (row) => row.reported > 0 : null, legend: legend ?? COMMON_LAYERS[0].legend }] : [];
  const asked = [...layers, ...legacy, ...(only ? [] : COMMON_LAYERS)];
  const built = asked.map((layer) => ({
    id: layer.id,
    name: layer.name,
    legend: layer.legend,
    paint: Object.fromEntries(
      rows.filter((row) => drawn.some((shape) => shape.code === row.code)).map((row) => [
        row.code,
        { tone: layer.tone(row), label: layer.label(row), says: layer.says(row), show: layer.show ? Boolean(layer.show(row)) : false, facts: [...(layer.facts ? layer.facts(row) : []), ...facts(row).filter(([name]) => !plain || (name !== "BVAS accredited" && name !== "Turnout"))].slice(0, 6) },
      ])
    ),
  }));

  return (
    <LiveMap
      shapes={drawn}
      box={box}
      layers={built}
      title={title}
      hint={hint ?? (tiled ? (at.length > 5 ? "Press a polling unit" : "Press a ward") : inside ? "Press a local government" : "Press a state")}
      up={at ? { name: at.length === 2 ? "The whole country" : at.length === 5 ? "The state" : "The local government", href: hrefWith(base, query, { at: at.split("/").slice(0, -1).join("/") || null, unit: null }) } : null}
      tiles={tiled}
      still={fixed}
      inside={Boolean(inside)}
      tall={wall}
      footnote={tiled ? (at.length > 5 ? "Each tile is one polling unit. Press one to open everything known about it." : "Each tile is one ward. Press one to see its polling units.") : inside ? "Press a local government to see its wards, then a ward to see its polling units." : "Double press or pinch to zoom. Drag when zoomed."}
    />
  );
}
