import { readFile } from "node:fs/promises";
import path from "node:path";

import { project } from "./geo.js";

/**
 * Which state and local government a point on the ground is in.
 *
 * A picture's own file can carry the spot it was taken from as two numbers.
 * Two numbers mean nothing to somebody at a verification desk; "Shira, Bauchi"
 * does, and "Abuja Municipal, FCT" on a sheet from an Anambra polling unit
 * means a great deal. This answers from the same boundary files the maps are
 * drawn from, so a place named here is the place the map would colour.
 *
 * The boundaries are simplified for drawing. A point within a few hundred
 * metres of a border can land on the wrong side of it, which is why callers
 * treat a different *state* as worth a look and a different local government
 * next door as a note.
 */

const root = path.join(process.cwd(), "public", "geo");
const kept = new Map();

async function file(name) {
  if (!kept.has(name)) {
    kept.set(
      name,
      readFile(path.join(root, name), "utf8")
        .then((text) => JSON.parse(text))
        .catch(() => null)
    );
  }
  return kept.get(name);
}

/** The rings of a drawn outline: "M x yL x y…Z" one or more times over. */
export function rings(d) {
  return String(d ?? "")
    .split("M")
    .filter(Boolean)
    .map((ring) => (ring.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number))
    .filter((numbers) => numbers.length >= 6);
}

/** Is the point inside the outline? Even-odd, so a hole in a shape is outside it. */
export function inside(x, y, d) {
  let within = false;
  for (const ring of rings(d)) {
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const [xi, yi, xj, yj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) within = !within;
    }
  }
  return within;
}

/** `{ state, stateCode, lga }` for a point, or null where it is outside Nigeria. */
export async function whereIs(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const [x, y] = project(longitude, latitude);

  const nation = await file("map/states.json");
  /* Missing boundaries must not read as "this picture has no place". */
  if (!nation?.states?.length) throw new Error("The map's boundary files are missing from this deployment.");
  const state = nation.states.find((entry) => inside(x, y, entry.d));
  if (!state) return null;

  const within = await file(`lga/${state.code}.json`);
  const lga = within?.lgas?.find((entry) => inside(x, y, entry.d));
  return { state: state.name, stateCode: state.code, lga: lga?.name ?? null };
}

/** Two spellings of one place name, compared as the letters they share. */
export function samePlace(a, b) {
  const plain = (value) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/\b(federal capital territory|fct)\b/g, "fct")
      .replace(/[^a-z]/g, "");
  const [left, right] = [plain(a), plain(b)];
  return Boolean(left) && Boolean(right) && (left === right || left.includes(right) || right.includes(left));
}

/**
 * Everything needed to draw the spot: the state it is in, cut into its local
 * governments, and where on that drawing the point falls.
 *
 * Drawn from the product's own boundary files and not from a map service, for
 * two reasons. This site loads nothing from a host it does not own, and a map
 * that only appears when somebody else's server is up is a map that is missing
 * on the night. `others` are further points to mark faintly — the other sheets
 * of the same election — because one sheet's spot means most beside the rest.
 */
export async function spotMap(latitude, longitude, { others = [] } = {}) {
  const where = await whereIs(latitude, longitude);
  if (!where) return null;

  const within = await file(`lga/${where.stateCode}.json`);
  if (!within?.lgas?.length) return null;

  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const lga of within.lgas) {
    for (const ring of rings(lga.d)) {
      for (let i = 0; i < ring.length; i += 2) {
        left = Math.min(left, ring[i]);
        right = Math.max(right, ring[i]);
        top = Math.min(top, ring[i + 1]);
        bottom = Math.max(bottom, ring[i + 1]);
      }
    }
  }

  const pad = Math.max(right - left, bottom - top) * 0.06;
  const box = [left - pad, top - pad, right - left + pad * 2, bottom - top + pad * 2];
  const onMap = ([x, y]) => x >= box[0] && x <= box[0] + box[2] && y >= box[1] && y <= box[1] + box[3];
  const tidy = ([x, y]) => [Number(x.toFixed(2)), Number(y.toFixed(2))];

  return {
    state: where.state,
    lga: where.lga,
    box: box.map((value) => Number(value.toFixed(2))),
    shapes: within.lgas.map((lga) => ({ name: lga.name, d: lga.d, at: lga.at ?? null, here: lga.name === where.lga })),
    pin: tidy(project(longitude, latitude)),
    others: others
      .filter((point) => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude))
      .map((point) => project(point.longitude, point.latitude))
      .filter(onMap)
      .map(tidy),
  };
}

/**
 * A state drawn with one named local government marked: where a polling unit
 * is, for a sheet whose own file does not say where it was photographed.
 *
 * Not the same claim as `spotMap` and never drawn as though it were. That one
 * marks where a device was standing. This marks an area from a register, and
 * carries no pin, because there is no point to put one on.
 */
export async function areaMap(stateName, lgaName) {
  const nation = await file("map/states.json");
  const state = nation?.states?.find((entry) => samePlace(entry.name, stateName));
  if (!state) return null;

  const within = await file(`lga/${state.code}.json`);
  if (!within?.lgas?.length) return null;

  const exact = within.lgas.find((lga) => lga.name.toLowerCase().replace(/[^a-z]/g, "") === String(lgaName ?? "").toLowerCase().replace(/[^a-z]/g, ""));
  const here = exact ?? within.lgas.find((lga) => samePlace(lga.name, lgaName)) ?? null;

  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const lga of within.lgas) {
    for (const ring of rings(lga.d)) {
      for (let i = 0; i < ring.length; i += 2) {
        left = Math.min(left, ring[i]);
        right = Math.max(right, ring[i]);
        top = Math.min(top, ring[i + 1]);
        bottom = Math.max(bottom, ring[i + 1]);
      }
    }
  }
  const pad = Math.max(right - left, bottom - top) * 0.06;

  return {
    state: state.name,
    lga: here?.name ?? null,
    box: [left - pad, top - pad, right - left + pad * 2, bottom - top + pad * 2].map((value) => Number(value.toFixed(2))),
    shapes: within.lgas.map((lga) => ({ name: lga.name, d: lga.d, at: lga.at ?? null, here: lga === here })),
    pin: null,
    others: [],
  };
}
