import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { portraitFor } from "./principal.js";
import { standingFor } from "./standing.js";

export { standingFor };

/**
 * Who is standing for each party, and their photograph, where the desk has
 * not said.
 *
 * ── A CARD WITH A FACE ON IT, FROM THE FIRST ONE ───────────────────────────
 * The broadcast cards draw a candidate's face when the desk's Candidates
 * screen holds one, and the party's mark when it does not. Nobody fills that
 * screen in before the first card of the night, so the first cards went out
 * as four logos — the weakest version of the product, at the moment it is
 * most watched.
 *
 * So a card now falls back to the photographs the room already holds in
 * public/people, for the presidential contest only, where who is standing is
 * known: the 2023 candidates on a replay of 2023, and the room's own
 * candidates (ROOM_CHOICES) on a live project. Anything the desk enters on the
 * Candidates screen wins over this, face and name alike.
 *
 * ── NEVER A GUESS BELOW THE PRESIDENCY ─────────────────────────────────────
 * A governorship, Senate or House card gets nothing from here. Who stands for
 * a party in a given seat is not something this file knows, and a wrong face
 * on a published card is far worse than a party mark.
 */

/* Read once per server process: a photograph on file does not change while
   the server is up, and a card is drawn many times a night. */
const held = new Map();

/** A candidate's photograph as a data address, or null where there is none. */
export function photoOnFile(name) {
  if (!name) return null;
  if (held.has(name)) return held.get(name);
  const file = join(process.cwd(), "public", portraitFor(name));
  const photo = existsSync(file) ? `data:image/jpeg;base64,${readFileSync(file).toString("base64")}` : null;
  held.set(name, photo);
  return photo;
}

/**
 * The desk's own candidates, with the gaps filled from the photographs on
 * file. `people` is { [party]: contestant } from the contestants table.
 */
export function withFacesOnFile(people = {}, { race, isDemo = false } = {}) {
  const out = { ...people };
  for (const [party, name] of Object.entries(standingFor({ race, isDemo }))) {
    const entered = out[party];
    if (entered?.photo) continue;
    /* The desk named somebody else for this party: keep their name, and do
       not put a different person's face above it. */
    if (entered?.name && entered.name !== name) continue;
    out[party] = { ...entered, party, name: entered?.name ?? name, photo: photoOnFile(name) };
  }
  return out;
}
