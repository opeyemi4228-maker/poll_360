/**
 * Every party's vote in every local government and ward, once, at build time.
 *
 *   npm run build:parties
 *
 * Writes two things:
 *
 *   lib/data/party-ground.js       every local government, every party, each
 *                                  of the five elections that published a
 *                                  table by state. Small enough to import.
 *   public/geo/parties/NN.json     one state's wards, every party, for the
 *                                  last two elections. Read when a question
 *                                  reaches that state's wards.
 *
 * ── WHY THIS IS A SECOND BUILD AND NOT A WIDER FIRST ONE ───────────────────
 * scripts/model-strongholds.mjs runs the same model and keeps one party's
 * reading of it, packed into the tuples the Strongholds map draws from. Ask
 * Poll360 is asked about every party in every seat — "how does the APC win
 * Kano Central" — and needs the rest of what that model already works out.
 * Widening the map's tuples would change a file the map ships to the browser
 * for figures it never draws; a file of its own costs the map nothing.
 *
 * ── THE TWO MUST AGREE, AND DO ────────────────────────────────────────────
 * Same model, same order, same sums: a local government here is its polling
 * units added up, exactly as there, so the PDP's share of a district read
 * from this file is the share the Strongholds map prints. The script checks
 * that against the index before it writes, and refuses to write on a drift.
 *
 * ── WHAT THE FIGURES ARE ──────────────────────────────────────────────────
 * The declared state totals of the presidential election, spread across the
 * real wards and polling units inside each state. Right about the state, an
 * estimate about any one named place — for every party alike.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

import { electionOf, modelState, unitsOfWard } from "../lib/strongholds.js";
import { ALL_YEARS, decodePlace } from "../lib/stronghold-map.js";
import { STRONGHOLDS } from "../lib/data/strongholds-index.js";

const UNIT_DIR = "public/geo/units";
const OUT_DIR = "public/geo/parties";
const INDEX_FILE = "lib/data/party-ground.js";

/** The years a ward keeps: the two the rest of the product reads below a state. */
const WARD_YEARS = [2019, 2023];

const SLOTS = Object.fromEntries(ALL_YEARS.map((year) => [year, electionOf(year).parties.map((party) => party.id)]));

const add = (into, votes) => {
  if (!votes) return into;
  const out = into ?? votes.map(() => 0);
  votes.forEach((count, index) => {
    out[index] += count;
  });
  return out;
};

mkdirSync(OUT_DIR, { recursive: true });
const states = {};
let drift = 0;

for (const file of readdirSync(UNIT_DIR).filter((name) => name.endsWith(".json")).sort()) {
  const book = JSON.parse(readFileSync(`${UNIT_DIR}/${file}`, "utf8"));
  const models = Object.fromEntries(ALL_YEARS.map((year) => [year, modelState({ book, year })]));
  const held = STRONGHOLDS.states.find((state) => state.number === book.state);
  if (!held) throw new Error(`${book.name} is not in the strongholds index`);

  const lgaRows = [];
  const wardFile = [];

  book.lgas.forEach((lga, li) => {
    const lgaVotes = Object.fromEntries(ALL_YEARS.map((year) => [year, null]));
    const wards = [];

    for (const ward of lga.wards ?? []) {
      const wardKey = `${book.state}/${lga.n}/${ward.n}`;
      const wardVotes = Object.fromEntries(ALL_YEARS.map((year) => [year, null]));
      for (const year of ALL_YEARS) {
        for (const row of unitsOfWard({ model: models[year], wardKey })) {
          if (row && row.total !== null) wardVotes[year] = add(wardVotes[year], row.votes);
        }
        lgaVotes[year] = add(lgaVotes[year], wardVotes[year]);
      }
      wards.push({ n: ward.n, v: WARD_YEARS.map((year) => wardVotes[year]) });
    }

    /* ── AGAINST THE MAP'S OWN FIGURE ───────────────────────────────────── */
    const place = decodePlace(held.lgas[li].f);
    const pdp = SLOTS[2023].indexOf("PDP");
    const cast = lgaVotes[2023]?.reduce((sum, count) => sum + count, 0) ?? 0;
    const share = cast ? (lgaVotes[2023][pdp] / cast) * 100 : null;
    if (share !== null && place.share[2023] !== null && Math.abs(share - place.share[2023]) > 0.06) drift += 1;

    lgaRows.push(ALL_YEARS.map((year) => lgaVotes[year]));
    wardFile.push({ n: lga.n, w: wards });
  });

  states[book.state] = lgaRows;
  writeFileSync(`${OUT_DIR}/${book.state}.json`, JSON.stringify({ state: book.state, code: book.code, years: WARD_YEARS, lgas: wardFile }));
  process.stderr.write(`${book.name}: ${lgaRows.length} local governments\n`);
}

if (drift) {
  throw new Error(`${drift} local governments disagree with the strongholds index. Run npm run build:strongholds first, then this.`);
}

writeFileSync(
  INDEX_FILE,
  `/**
 * Every party's presidential vote in every local government, 1999 to 2023.
 *
 * Below a state these are estimates: the declared state totals spread across
 * the real local governments inside it, by the same model the Strongholds map
 * reads. \`states[number][lga][year][slot]\` — local governments in the order
 * of lib/data/strongholds-index.js, years in the order of \`years\`, and each
 * year's parties in the order of \`slots\`. Null where nothing can be read.
 *
 * Generated by scripts/model-party-ground.mjs. Do not edit by hand.
 */
export const PARTY_GROUND = ${JSON.stringify({ years: ALL_YEARS, slots: SLOTS, wardYears: WARD_YEARS, states })};
`
);

process.stderr.write(`\n${Object.values(states).reduce((sum, lgas) => sum + lgas.length, 0)} local governments, ${ALL_YEARS.length} elections.\n`);
