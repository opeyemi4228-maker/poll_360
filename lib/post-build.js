import { readFileSync } from "node:fs";
import { join } from "node:path";

import { states2023 } from "./election2023.js";
import { lgasForState } from "./lga-names.js";
import { cellsBelow, levelOf, sumRows, within } from "./post-figures.js";
import { raceLabel } from "./races.js";
import { STATE_POINTS, freezeFigures, stampFor } from "./stamp.js";
import { STATES } from "./units.js";

/**
 * Everything a post freezes when it is saved, worked out on the server.
 *
 * ── WHY HERE AND NOT IN THE BROWSER ────────────────────────────────────────
 * The figures on a card are what an editor clears and what goes out in the
 * organisation's name. Taking them from the screen that wrote the post would
 * let any screen send any numbers; building them here, from the stored
 * returns, means the only thing a writer chooses is *which place*. The same
 * builder draws the live preview, so the preview cannot show a card the
 * server would not make.
 */

if (typeof window !== "undefined") throw new Error("lib/post-build.js is server only");

const books = new Map();
function bookFor(stateNumber) {
  if (books.has(stateNumber)) return books.get(stateNumber);
  let book = null;
  try {
    book = JSON.parse(readFileSync(join(process.cwd(), "public", "geo", "units", `${stateNumber}.json`), "utf8"));
  } catch {
    book = null;
  }
  books.set(stateNumber, book);
  return book;
}

const stateName = (number) => {
  const name = STATE_POINTS[number]?.name;
  return name === "Federal Capital Territory" ? "FCT" : name ? `${name} State` : "Unknown state";
};

/**
 * The place a scope names, in words, and how many booths it should produce.
 */
export function describe(scope) {
  const level = levelOf(scope);
  if (level === "nation") {
    return {
      level,
      name: "Nigeria",
      short: "Nigeria",
      parent: null,
      expected: states2023.reduce((sum, row) => sum + (row.booths ?? 0), 0),
    };
  }
  const parts = String(scope).split(":")[1].split("/");
  const number = parts[0].padStart(2, "0");
  const state = STATES.find((row) => row.number === number);
  const booths = states2023.find((row) => row.code === state?.code)?.booths ?? 0;
  if (level === "state") {
    return { level, name: stateName(number), short: STATE_POINTS[number]?.name ?? number, parent: "Nigeria", expected: booths };
  }

  const book = bookFor(number);
  const lgaNo = parts[1].padStart(2, "0");
  const lga = book?.lgas?.find((row) => row.n === lgaNo);
  const lgaName = lga?.name ?? lgasForState(number).find((row) => row.code === `${number}/${lgaNo}`)?.name ?? `LGA ${lgaNo}`;
  const unitsIn = (wards) => (wards ?? []).reduce((sum, ward) => sum + (ward.units?.length ?? 0), 0);

  if (level === "lga") {
    return { level, name: `${lgaName} LGA`, short: lgaName, parent: stateName(number), expected: unitsIn(lga?.wards) };
  }
  const wardNo = parts[2].padStart(2, "0");
  const ward = lga?.wards?.find((row) => row.n === wardNo);
  const wardName = ward?.name ?? `Ward ${wardNo}`;
  if (level === "ward") {
    return { level, name: `${wardName} Ward`, short: `${wardName} Ward`, parent: `${lgaName} LGA, ${stateName(number)}`, expected: ward?.units?.length ?? 0 };
  }
  const unitNo = parts[3].padStart(3, "0");
  const unit = ward?.units?.find((row) => row.n === unitNo);
  const unitName = unit?.name?.replace(/\s+/g, " ").trim() || `Polling unit ${unitNo}`;
  return {
    level,
    name: unitName,
    short: unitName,
    parent: `PU ${number}/${lgaNo}/${wardNo}/${unitNo} · ${wardName} Ward, ${lgaName} LGA, ${stateName(number)}`,
    expected: 1,
  };
}

/** The name of a map cell's place, for labels. */
function cellName(scope) {
  const described = describe(scope);
  return described.short;
}

/**
 * Build a post's frozen payload.
 *
 * @param rows   the returns the writer's room can read, for this contest
 * @param scope  which place
 * @param race   which contest
 * @param at     when the figures were read
 */
export function buildPost({ rows = [], scope = "NATION", race = null, at = Date.now() }) {
  const place = describe(scope);
  const inside = rows.filter((row) => within(row.unitCode, scope));
  const sum = sumRows(inside, place.expected);
  const figures = freezeFigures({ ...sum, name: place.name, scope });

  /* The map one level down — states for the country, local governments for
     a state. A local government's own card shows its state with it lit, so
     it carries its siblings too. Wards and booths have no boundaries we hold,
     and draw as bars instead. */
  let map = null;
  if (place.level === "nation" || place.level === "state") {
    map = { level: place.level, focus: scope, cells: cellsBelow(rows, scope).map((cell) => ({ ...cell, name: cellName(cell.scope) })) };
  } else if (place.level === "lga") {
    const state = `STATE:${String(scope).split(":")[1].split("/")[0]}`;
    map = { level: "state", focus: scope, cells: cellsBelow(rows, state).map((cell) => ({ ...cell, name: cellName(cell.scope) })) };
  }

  /* The booth's own position, where one return in it carried a fix. */
  const point = place.level === "unit" ? inside.find((row) => row.position?.lat != null)?.position ?? null : null;
  const stamp = stampFor({
    scope,
    at,
    name: place.parent ? `${place.name}, ${place.parent}` : place.name,
    point,
  });

  /* Below a local government the share of wards reporting is not the story;
     the breakdown per ward or per booth is. */
  const breakdown =
    place.level === "lga" || place.level === "ward"
      ? cellsBelow(rows, scope)
          .map((cell) => ({ ...cell, name: cellName(cell.scope) }))
          .sort((a, b) => b.cast - a.cast)
          .slice(0, 12)
      : null;

  return {
    level: place.level,
    place: { name: place.name, short: place.short, parent: place.parent },
    contest: race ? raceLabel(race) : null,
    figures,
    map,
    breakdown,
    stamp,
  };
}
