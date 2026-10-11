import { readFileSync } from "node:fs";
import path from "node:path";

import { STATES } from "../units.js";
import { levelOf, prefixesOf } from "../ground.js";

/**
 * INEC's own list of places, by code: names, and how many polling units lie
 * under each.
 *
 * Read from the per-state files `npm run units:import` writes, one state at a
 * time and once per process. Every light is shown against "of N polling
 * units", and N has to come from the commission's list and not from the rows
 * that happen to have arrived, or silence would shrink the denominator.
 */
const loaded = new Map();

function stateFile(number) {
  if (loaded.has(number)) return loaded.get(number);
  let index = null;
  try {
    const file = JSON.parse(readFileSync(path.join(process.cwd(), "public/geo/units", `${number}.json`), "utf8"));
    index = new Map();
    let stateUnits = 0;
    const lgas = [];
    for (const lga of file.lgas ?? []) {
      const lgaCode = `${number}/${lga.n}`;
      let lgaUnits = 0;
      const wards = [];
      for (const ward of lga.wards ?? []) {
        const wardCode = `${lgaCode}/${ward.n}`;
        const units = (ward.units ?? []).map((unit) => ({ code: `${wardCode}/${unit.n}`, name: unit.name, units: 1 }));
        for (const unit of units) index.set(unit.code, { ...unit, children: [] });
        index.set(wardCode, { code: wardCode, name: ward.name, units: units.length, children: units });
        wards.push({ code: wardCode, name: ward.name, units: units.length });
        lgaUnits += units.length;
      }
      index.set(lgaCode, { code: lgaCode, name: lga.name, units: lgaUnits, children: wards });
      lgas.push({ code: lgaCode, name: lga.name, units: lgaUnits });
      stateUnits += lgaUnits;
    }
    index.set(number, { code: number, name: file.name, units: stateUnits, children: lgas });
  } catch {
    index = null;
  }
  loaded.set(number, index);
  return index;
}

/** One place: `{ code, name, units, children }`, or null if INEC lists none. */
export function place(code) {
  if (!code) {
    const children = STATES.map((state) => ({ code: state.number, name: state.name, units: stateFile(state.number)?.get(state.number)?.units ?? 0 }));
    return { code: "", name: "Nigeria", units: children.reduce((sum, child) => sum + child.units, 0), children };
  }
  return stateFile(String(code).slice(0, 2))?.get(code) ?? null;
}

export const placeName = (code) => place(code)?.name ?? code;

/** Does INEC list this place? Used to refuse a code nobody can stand at. */
export const exists = (code) => Boolean(place(code));

/** "Kano › Dala › Gwammaja › Open Space I", for a row that has to say where. */
export function pathName(code) {
  const parts = String(code ?? "").split("/");
  return parts.map((_, index) => placeName(parts.slice(0, index + 1).join("/"))).join(" › ");
}

/**
 * How many polling units of a place lie on a ground.
 *
 * The whole place when the ground holds it, and only the held part when the
 * ground reaches inside it: an observer with three wards of a local
 * government is shown that local government as "of 41 polling units", the
 * forty-one in their wards.
 */
export function unitsOn(code, ground) {
  const prefixes = prefixesOf(ground);
  const whole = place(code)?.units ?? 0;
  if (prefixes == null) return whole;
  const inside = (a, b) => a === b || a.startsWith(`${b}/`);
  if (!code) return prefixes.reduce((sum, prefix) => sum + (place(prefix)?.units ?? 0), 0);
  if (prefixes.some((prefix) => inside(code, prefix))) return whole;
  return prefixes.filter((prefix) => inside(prefix, code)).reduce((sum, prefix) => sum + (place(prefix)?.units ?? 0), 0);
}

/** The places directly under one that a ground reaches, with their unit counts. */
export function childrenOn(code, ground) {
  const parent = place(code);
  if (!parent) return [];
  return parent.children
    .map((child) => ({ ...child, units: unitsOn(child.code, ground) }))
    .filter((child) => child.units > 0 || (levelOf(child.code) === "pu" && unitsOn(child.code, ground) > 0));
}
