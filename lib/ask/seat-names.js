import { STRONGHOLDS } from "../data/strongholds-index.js";

/**
 * Every seat a question can name: 109 senatorial districts and 360 federal
 * constituencies, each as the local governments it is made of.
 *
 * ── WHY NAMES NEED A MODULE OF THEIR OWN ───────────────────────────────────
 * A district is easy to hear — "Kano Central", "Lagos West" are said nowhere
 * else. A constituency is not: "Ikeja" is a constituency, a local government
 * and a place people live, and "Aba North/Aba South" is two local governments
 * that are one seat. So a district is recognised wherever it is said, and a
 * constituency only where the question says it is asking about one.
 */

const squash = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1");

export const RACE_OF_LEVEL = { district: "SENATE", constituency: "REPRESENTATIVES" };

/** What each contest is called, and the level of ground it is fought on. */
export const CONTESTS = {
  PRESIDENTIAL: { id: "PRESIDENTIAL", office: "President", seat: "the presidency", level: "nation" },
  GOVERNORSHIP: { id: "GOVERNORSHIP", office: "Governor", seat: "the governorship", level: "state" },
  SENATE: { id: "SENATE", office: "Senator", seat: "the senate seat", level: "district" },
  REPRESENTATIVES: { id: "REPRESENTATIVES", office: "Member of the House of Representatives", seat: "the House of Representatives seat", level: "constituency" },
  ASSEMBLY: { id: "ASSEMBLY", office: "Member of the House of Assembly", seat: "the House of Assembly seat", level: "lga" },
  LGA: { id: "LGA", office: "Chairman", seat: "the chairmanship", level: "lga" },
};

export const SEATS = STRONGHOLDS.states.flatMap((state) =>
  Object.entries(state.seats ?? {}).flatMap(([race, seats]) =>
    seats.map((seat) => ({
      race,
      key: seat.key,
      name: seat.name,
      stateCode: state.code,
      stateName: state.name,
      stateNumber: state.number,
      zone: state.zone,
      shared: Boolean(seat.shared),
      lgas: (seat.lgas ?? []).map((at) => `${state.number}/${state.lgas[at]?.n}`),
      lgaNames: (seat.lgas ?? []).map((at) => state.lgas[at]?.name),
    }))
  )
);

const BY_KEY = new Map(SEATS.map((seat) => [`${seat.race}:${seat.key}`, seat]));

export const seatByKey = (race, key) => BY_KEY.get(`${String(race).toUpperCase()}:${key}`) ?? null;

/**
 * The seat a set of local governments is, where it is exactly one — so a
 * ground that is Kano Central is called Kano Central, not fifteen names.
 */
export function seatOfLgas(keys) {
  if (!keys?.length) return null;
  const wanted = [...keys].sort().join("|");
  return (
    SEATS.find((seat) => seat.race === "SENATE" && [...seat.lgas].sort().join("|") === wanted) ??
    SEATS.find((seat) => seat.race === "REPRESENTATIVES" && !seat.shared && seat.lgas.length > 1 && [...seat.lgas].sort().join("|") === wanted) ??
    null
  );
}

export const seatTitle = (seat) => `${seat.name} ${seat.race === "SENATE" ? "senatorial district" : "federal constituency"}`;

/** The seats of one kind inside a state, in name order. */
export const seatsOfState = (race, stateCode) => SEATS.filter((seat) => seat.race === race && seat.stateCode === stateCode);

const push = (map, key, seat) => {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  if (!map.get(key).includes(seat)) map.get(key).push(seat);
};

const DISTRICT_NAMES = new Map();
const CONSTITUENCY_NAMES = new Map();
for (const seat of SEATS) {
  if (seat.race === "SENATE") {
    push(DISTRICT_NAMES, squash(seat.name), seat);
    /* "FCT senatorial district", "Abuja senate seat". */
    if (seat.stateCode === "FCT") for (const alias of ["fct", "federalcapitalterritory"]) push(DISTRICT_NAMES, squash(alias), seat);
    continue;
  }
  push(CONSTITUENCY_NAMES, squash(seat.name), seat);
  /* Any one of the local governments a constituency is named for:
     "Mubi North federal constituency" is Mubi North/Mubi South/Maiha. */
  for (const part of seat.name.split("/")) push(CONSTITUENCY_NAMES, squash(part), seat);
}

/* Roman numerals as people type them: "Surulere 1", "Mushin II". */
const numerals = (text) => text.replace(/\b1\b/g, "i").replace(/\b2\b/g, "ii").replace(/\b3\b/g, "iii");

/**
 * The seats named in a question, already normalised to lower case.
 *
 * `kind` is what the question says it is about — "district", "constituency"
 * or null. A district name is taken wherever it appears; a constituency name
 * only when `kind` is "constituency". Where a name fits seats in more than
 * one state, the state the question names decides.
 *
 * @returns {{ seat: object, at: number, span: number, words: string }[]}
 */
export function seatsIn(q, { kind = null, states = [] } = {}) {
  const tokens = numerals(q).split(" ");
  const found = [];
  let i = 0;
  while (i < tokens.length) {
    let taken = 0;
    for (let span = Math.min(8, tokens.length - i); span >= 1; span -= 1) {
      const words = tokens.slice(i, i + span).join(" ");
      const key = squash(words);
      if (key.length < 3) continue;
      /* A bare "FCT" or "Abuja" is the territory unless a seat is asked for. */
      const bare = span === 1 && ["fct", "abuja"].includes(key);
      let options = kind !== "constituency" && !(bare && kind !== "district") ? DISTRICT_NAMES.get(key) : null;
      if (!options && kind === "constituency") options = CONSTITUENCY_NAMES.get(key);
      if (!options) continue;
      const inNamed = options.filter((seat) => states.includes(seat.stateCode));
      const chosen = inNamed.length ? inNamed : options;
      /* One name, several states and none of them named: not a seat anybody
         can be sure of, so it is left to be read as a local government. */
      if (chosen.length > 1 && new Set(chosen.map((seat) => seat.stateCode)).size > 1) continue;
      found.push({ seat: chosen[0], at: i, span, words });
      taken = span;
      break;
    }
    i += taken || 1;
  }
  return found.filter((hit, index) => found.findIndex((other) => other.seat === hit.seat) === index);
}
