/**
 * Roll Atiku's strongholds down to every polling unit, once, at build time.
 *
 *   npm run build:strongholds
 *
 * Writes two things:
 *
 *   lib/data/strongholds-index.js     every state and local government, small
 *                                     enough to ship with the screen, so a
 *                                     zone draws and lists without a fetch.
 *   public/geo/strongholds/NN.json    one state's wards and polling units,
 *                                     fetched when that state is opened. Its
 *                                     order is the unit tree's order in
 *                                     public/geo/units/NN.json, which is where
 *                                     the names come from.
 *
 * ── WHAT THE FIGURES ARE ──────────────────────────────────────────────────
 * States are the declared results. Below a state they are the declared totals
 * spread across the real wards and booths by lib/strongholds.js — see the note
 * at the head of lib/stronghold-map.js for what that makes them good for and
 * what it does not. The levels, the zones and the tuple layout all live in
 * that module; this script only counts.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

import { bucketOf, electionOf, modelState, unitsOfWard, winnerOf } from "../lib/strongholds.js";
import {
  ALL_YEARS,
  BASE_YEARS,
  TOP_UNITS,
  encodePlace,
  encodeUnit,
  matchLgaNames,
  tierOf,
  zoneOf,
} from "../lib/stronghold-map.js";

const UNIT_DIR = "public/geo/units";
const LGA_DIR = "public/geo/lga";
const OUT_DIR = "public/geo/strongholds";
const INDEX_FILE = "lib/data/strongholds-index.js";

/* ── THE SEATS, AS THE LOCAL GOVERNMENTS THEY ARE MADE OF ──────────────────
   A senatorial district and a federal constituency are both whole local
   governments, so their figures are the units inside those local governments
   added up — real votes, rolled up the same way a state is, never an average
   of shares. The two Lagos constituencies that split one local government
   each carry all of it, and say so with `shared`. */
const DISTRICTS = JSON.parse(readFileSync("public/geo/constituencies.json", "utf8"));
const SEAT_TABLES = { SENATE: DISTRICTS.senatorial, REPRESENTATIVES: DISTRICTS.federal };

/* Each election's slot order, its "other parties" bucket and where the PDP
   sits in it. 1999 has no bucket; bucketOf says so rather than guessing. */
const BALLOT = Object.fromEntries(
  ALL_YEARS.map((year) => {
    const election = electionOf(year);
    const slots = election.parties.map((party) => party.id);
    return [year, { election, slots, bucket: bucketOf(slots), pdp: slots.indexOf("PDP") }];
  })
);

/** What a set of votes says about the PDP, year by year. */
function readingOf(votesByYear) {
  const share = {};
  const lead = {};
  const won = {};

  for (const year of ALL_YEARS) {
    const votes = votesByYear[year];
    if (!votes) {
      share[year] = null;
      lead[year] = null;
      won[year] = null;
      continue;
    }
    const { bucket, pdp } = BALLOT[year];
    const cast = votes.reduce((sum, count) => sum + count, 0);
    let rival = 0;
    votes.forEach((count, index) => {
      if (index !== pdp && index !== bucket && count > rival) rival = count;
    });
    won[year] = cast > 0 && winnerOf(votes, bucket) === pdp;
    share[year] = cast > 0 ? (votes[pdp] / cast) * 100 : null;
    lead[year] = cast > 0 ? ((votes[pdp] - rival) / cast) * 100 : null;
  }

  return { share, lead, won, base: BASE_YEARS.filter((year) => won[year]).length };
}

/** Add up the votes of many units, per year. Null for a year nobody can read. */
function sumVotes(units) {
  const out = {};
  for (const year of ALL_YEARS) {
    let total = null;
    for (const unit of units) {
      const votes = unit.votes[year];
      if (!votes) continue;
      total ??= votes.map(() => 0);
      votes.forEach((count, index) => {
        total[index] += count;
      });
    }
    out[year] = total;
  }
  return out;
}

/** One place's figures from the units inside it. */
function placeOf(units, { votes = sumVotes(units), registered = null, cast = null } = {}) {
  const wonBooths = { 2019: 0, 2023: 0 };
  const tierBooths = { PRIMARY: 0, SECONDARY: 0, TERTIARY: 0 };
  let top = 0;
  let people = 0;
  let voted = 0;

  for (const unit of units) {
    people += unit.registered;
    if (unit.cast !== null) voted += unit.cast;
    if (unit.top) top += 1;
    if (unit.reading.won[2019]) wonBooths[2019] += 1;
    if (unit.reading.won[2023]) wonBooths[2023] += 1;
    if (unit.tier) tierBooths[unit.tier] += 1;
  }

  const reading = readingOf(votes);
  return encodePlace({
    registered: registered ?? people,
    cast: cast ?? voted,
    booths: units.length,
    ...reading,
    top,
    wonBooths,
    tierBooths,
  });
}

/* ═════════════════════════════════════════════════════ every booth, modelled */

const states = [];
const everyUnit = [];

for (const file of readdirSync(UNIT_DIR).filter((name) => name.endsWith(".json")).sort()) {
  const book = JSON.parse(readFileSync(`${UNIT_DIR}/${file}`, "utf8"));
  const models = Object.fromEntries(ALL_YEARS.map((year) => [year, modelState({ book, year })]));
  for (const year of ALL_YEARS) {
    if (!models[year]) throw new Error(`${book.name}: no model for ${year}`);
  }

  /* Anambra 2023 carries transcribed booths, and a booth with no sheet has no
     register either. Its size is read off the ordinary model instead, so it
     can still be ranked among the biggest booths — its result stays unknown. */
  const plain2023 = models[2023].counted ? { ...models[2023], counted: null } : null;

  const lgas = book.lgas.map((lga) => ({
    n: lga.n,
    name: lga.name,
    wards: (lga.wards ?? []).map((ward) => {
      const wardKey = `${book.state}/${lga.n}/${ward.n}`;
      const rows = Object.fromEntries(
        ALL_YEARS.map((year) => [year, unitsOfWard({ model: models[year], wardKey })])
      );
      const plain = plain2023 ? unitsOfWard({ model: plain2023, wardKey }) : null;

      const units = (ward.units ?? []).map((unit, index) => {
        const votes = {};
        for (const year of ALL_YEARS) {
          const row = rows[year][index];
          votes[year] = row && row.total !== null ? row.votes : null;
        }
        const row2023 = rows[2023][index];
        const record = {
          code: `${wardKey}/${unit.n}`,
          registered: row2023?.registered ?? plain?.[index]?.registered ?? 0,
          cast: row2023?.total ?? null,
          votes,
          top: false,
        };
        record.reading = readingOf(votes);
        record.tier = tierOf(record.reading);
        everyUnit.push(record);
        return record;
      });

      return { units };
    }),
  }));

  /* The outlines, paired to INEC's names. */
  const outline = JSON.parse(readFileSync(`${LGA_DIR}/${book.code}.json`, "utf8"));
  const shapes = matchLgaNames(
    lgas.map((lga) => lga.name),
    outline.lgas.map((shape) => shape.name)
  );
  if (shapes.size !== lgas.length) {
    throw new Error(`${book.name}: ${lgas.length - shapes.size} local governments have no outline`);
  }

  states.push({ book, lgas, shapes, counted: models[2023].counted?.meta.units ?? 0 });
  process.stderr.write(`${book.name}: ${lgas.reduce((sum, lga) => sum + lga.wards.length, 0)} wards\n`);
}

/* ═══════════════════════════════════════════════ the biggest booths, nationally */

everyUnit.sort((a, b) => b.registered - a.registered || (a.code < b.code ? -1 : 1));
for (let index = 0; index < Math.min(TOP_UNITS, everyUnit.length); index += 1) {
  everyUnit[index].top = true;
}
const threshold = everyUnit[Math.min(TOP_UNITS, everyUnit.length) - 1]?.registered ?? 0;

/* ═══════════════════════════════════════════════════════════════ the rollup */

mkdirSync(OUT_DIR, { recursive: true });
const index = [];

for (const { book, lgas, shapes, counted } of states) {
  const detail = [];
  const lgaIndex = [];
  const all = [];

  for (const lga of lgas) {
    const units = lga.wards.flatMap((ward) => ward.units);
    all.push(...units);

    detail.push({
      w: lga.wards.map((ward) => ({
        f: placeOf(ward.units),
        u: ward.units.map((unit) =>
          encodeUnit({
            registered: unit.registered,
            cast: unit.cast,
            ...unit.reading,
            top: unit.top,
          })
        ),
      })),
    });
    lgaIndex.push({ n: lga.n, name: lga.name, shape: shapes.get(lga.name), f: placeOf(units) });
  }

  const seats = {};
  for (const [race, table] of Object.entries(SEAT_TABLES)) {
    seats[race] = table
      .filter((seat) => seat.state === book.state)
      .map((seat) => {
        const members = seat.lgas.map((code) => {
          const at = lgas.findIndex((lga) => `${book.state}/${lga.n}` === code);
          if (at < 0) throw new Error(`${seat.name}: local government ${code} is not in ${book.name}'s tree`);
          return at;
        });
        return {
          key: seat.key,
          name: seat.name,
          lgas: members,
          ...(seat.shared ? { shared: true } : {}),
          f: placeOf(members.flatMap((at) => lgas[at].wards.flatMap((ward) => ward.units))),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /* A state is its declared result, not the sum of its estimated parts — the
     two agree everywhere but Anambra 2023, where the parts are transcriptions
     covering two booths in three. */
  const declared = {};
  let registered = null;
  let cast = null;
  for (const year of ALL_YEARS) {
    const { election, slots } = BALLOT[year];
    const row = election.rows.find((entry) => entry.code === book.code);
    declared[year] = row ? slots.map((id) => row.votes[id] ?? 0) : null;
    if (year === 2023 && row) {
      registered = row.registered ?? null;
      cast = row.total ?? null;
    }
  }

  index.push({
    number: book.state,
    code: book.code,
    name: book.name,
    zone: zoneOf(book.code),
    counted,
    f: placeOf(all, { votes: declared, registered, cast }),
    lgas: lgaIndex,
    seats,
  });

  writeFileSync(
    `${OUT_DIR}/${book.state}.json`,
    JSON.stringify({ state: book.state, code: book.code, lgas: detail })
  );
}

writeFileSync(
  INDEX_FILE,
  `/**
 * Atiku's strongholds, every state and local government.
 *
 * Below a state these are estimates: the declared state totals spread across
 * the real local governments, wards and polling units. Tuple layout, levels
 * and zones are in lib/stronghold-map.js; wards and polling units are in
 * public/geo/strongholds/, one file per state.
 *
 * Generated by scripts/model-strongholds.mjs. Do not edit by hand.
 */
export const STRONGHOLDS = ${JSON.stringify({
    top: TOP_UNITS,
    threshold,
    units: everyUnit.length,
    states: index,
  })};
`
);

process.stderr.write(
  `${everyUnit.length} polling units · the largest ${TOP_UNITS} hold ${threshold}+ registered voters\n`
);
