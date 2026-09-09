#!/usr/bin/env node
/**
 * Fetch INEC's wards and polling units, and write one file per state.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS PRODUCT DID NOT HAVE THEM, AND WHY THAT WAS THE RIGHT CALL
 *
 *  The sign-up form asked an agent to pick a state and a local government from
 *  lists, then to *type* their ward and unit numbers off the sheet in their
 *  hand. components/agent/UnitPicker.jsx says why: this repository held no
 *  ward or unit list, and filling two more dropdowns with invented names would
 *  have been worse than leaving them out — a wrong ward name printed beside a
 *  right ward number reads as confirmation.
 *
 *  A wrong unit code is this product's worst failure because it does not fail.
 *  It files a real return against a booth in the wrong ward and the map looks
 *  entirely normal.
 *
 *  So the answer was never to invent the list. It was to go and get it.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHERE THIS COMES FROM ──────────────────────────────────────────────────
 * INEC publishes states, local governments, wards and polling units through
 * the API behind inecnigeria.org/polling-units. This reads a scrape of that
 * API published at github.com/JayCodist/inec-polling-units-scraper (ISC), one
 * file per state, which carries INEC's own `delimitation` on every unit —
 * "06/01/01/001" — in exactly the shape lib/units.js already parses.
 *
 * Read rather than trusted: every file is checked against INEC's own published
 * totals before anything is written, and the run fails rather than shipping a
 * short list. A dropdown missing a third of a state's booths is worse than no
 * dropdown, because an agent whose unit is absent will pick a neighbouring one.
 *
 *   node scripts/import-units.mjs
 *   node scripts/import-units.mjs --state BAY      # one state, for a check
 *
 * ── AND WHY ONE FILE PER STATE ─────────────────────────────────────────────
 * 176,846 polling units is about 87MB as published and roughly 6MB once it is
 * cut down to codes and names. Neither belongs in a page's JavaScript. The
 * form fetches one state at a time, the same way the map already fetches one
 * state's local government boundaries from /geo/lga/, so a phone on a rural
 * network downloads about a hundred kilobytes rather than a country.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { STATES } from "../lib/units.js";

const SOURCE =
  "https://raw.githubusercontent.com/JayCodist/inec-polling-units-scraper/main/results";

const OUT = new URL("../public/geo/units/", import.meta.url);

/**
 * INEC's own published totals, as of the 2023 register.
 *
 * The run is checked against these rather than against itself. A scrape that
 * silently returned half a state would otherwise produce a perfectly
 * well-formed file that is missing four thousand booths.
 */
const EXPECTED = { lgas: 774, wards: 8809, units: 176_846 };

/* How far a total may drift before the run stops. INEC creates and merges
   polling units between elections, so an exact match is the wrong test — but
   a percent is a revision and ten percent is a broken scrape. */
const TOLERANCE = 0.02;

const only = process.argv.includes("--state")
  ? process.argv[process.argv.indexOf("--state") + 1]?.toUpperCase()
  : null;

/**
 * The scrape names its files in kebab-case off the state's own name.
 *
 * Including the Federal Capital Territory, which is written out in full there
 * rather than abbreviated — this shortened it to "fct" and got a 404 for the
 * one place in the country that is not a state.
 */
const fileFor = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-|-$/g, "");

await mkdir(OUT, { recursive: true });

let lgas = 0;
let wards = 0;
let units = 0;
const written = [];

for (const state of STATES) {
  if (only && state.code !== only) continue;

  const url = `${SOURCE}/${fileFor(state.name)}.json`;
  process.stdout.write(`${state.number} ${state.name.padEnd(26)}`);

  let source;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    source = await response.json();
  } catch (error) {
    console.error(`\n  could not fetch ${url}: ${error.message}`);
    process.exit(1);
  }

  const held = source.state;

  /* ── THE STATE NUMBER IS CHECKED, NEVER ASSUMED ───────────────────────
     This product's state numbering and INEC's are the same ordering, and
     that is a fact worth verifying once per state rather than trusting: a
     file read into the wrong slot files every return from one state against
     another, and nothing downstream can tell, because the code is valid. */
  const seen = held.lgas?.[0]?.wards?.[0]?.pollingUnits?.[0]?.state;
  if (seen && seen !== state.number) {
    console.error(
      `\n  ${state.name} is ${state.number} here and ${seen} in the source. Stopping.`
    );
    process.exit(1);
  }

  /* ══════════════════════════════════════════════════════════════════════
     BUILT FROM THE CODES, NOT FROM THE NESTING

     ── WHY, AND HOW THIS WAS FOUND ──────────────────────────────────────
     The obvious reading of the source is its shape: a state holds local
     governments, which hold wards, which hold polling units. Taking that at
     face value puts four booths in Abia into the wrong ward.

     Isiala Ngwa North has wards 01 to 10. Nested under ward 01 are four units
     whose own INEC code says ward 010 — and they are named Nbawsi Post
     Office, Umuomainta Women's Hall, Customary Court Nbawsi and Amogwe
     Village Square. Ward 10 is called "Mbawsi / Umuomainta". They are ward
     10's booths, filed under ward 01 by the API, and the giveaway is that
     ward 01 then appears to hold units 012 to 015 twice over.

     Nobody would have noticed. Every code is well formed, the counts are
     plausible, and an agent from Nbawsi picking their booth would have been
     handed a code for a ward on the other side of the local government —
     which is this product's worst failure, because it does not fail. It
     files a real return against a real booth in the wrong place.

     So the tree is assembled from `delimitation`, which is INEC's own
     canonical address for a booth, and the nesting is used only for names.
     Where the two disagree the code wins, and the run says how often.
     ══════════════════════════════════════════════════════════════════════ */
  const lgaNames = new Map();
  const wardNames = new Map();
  for (const lga of held.lgas ?? []) {
    const ln = String(lga.abbreviation ?? "").padStart(2, "0");
    lgaNames.set(ln, titleCase(lga.name));
    for (const ward of lga.wards ?? []) {
      const wn = String(ward.abbreviation ?? "").padStart(2, "0");
      wardNames.set(`${ln}/${wn}`, titleCase(ward.name));
    }
  }

  const tree = new Map();
  let rehomed = 0;

  for (const lga of held.lgas ?? []) {
    for (const ward of lga.wards ?? []) {
      for (const unit of ward.pollingUnits ?? []) {
        /* ── A UNIT WITHOUT A CODE IS NOT A UNIT ──────────────────────────
           The scrape carries empty objects — 245 in Lagos alone, 8,586 across
           the country, which is precisely the amount by which a naive count
           overshoots INEC's published 176,846. They have no name, no code and
           no ward: an artefact of the source API paginating, not booths
           anybody can vote at. */
        if (!unit?.delimitation) continue;

        const parts = String(unit.delimitation).split("/");
        if (parts.length !== 4) continue;

        const [sn, rawLga, rawWard, un] = parts;
        if (sn !== state.number) continue;

        const ln = rawLga.padStart(2, "0");
        /* INEC writes a ward two digits wide almost everywhere and three in a
           handful of rows. No local government in Nigeria has a hundred
           wards — the most is around twenty — so a three-digit ward is a
           two-digit one with a leading zero, and trimming it is safe. */
        const wn = rawWard.length === 3 ? rawWard.slice(1) : rawWard.padStart(2, "0");

        const nestedWard = String(ward.abbreviation ?? "").padStart(2, "0");
        if (wn !== nestedWard) rehomed += 1;

        if (!tree.has(ln)) tree.set(ln, new Map());
        const wards = tree.get(ln);
        if (!wards.has(wn)) wards.set(wn, []);
        wards.get(wn).push({ n: un.padStart(3, "0"), name: titleCase(unit.name) });
      }
    }
  }

  const shaped = {
    state: state.number,
    name: state.name,
    code: state.code,
    lgas: [...tree.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ln, wards]) => ({
        n: ln,
        name: lgaNames.get(ln) ?? `Local government ${ln}`,
        wards: [...wards.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([wn, units]) => ({
            n: wn,
            name: wardNames.get(`${ln}/${wn}`) ?? `Ward ${wn}`,
            units: units.sort((a, b) => a.n.localeCompare(b.n)),
          })),
      })),
  };

  if (rehomed) {
    console.log(
      `\n  ${rehomed} unit${rehomed === 1 ? "" : "s"} filed under a ward their own code disagrees with; the code won.`
    );
    process.stdout.write(" ".repeat(29));
  }

  const countLgas = shaped.lgas.length;
  const countWards = shaped.lgas.reduce((sum, lga) => sum + lga.wards.length, 0);
  const countUnits = shaped.lgas.reduce(
    (sum, lga) => sum + lga.wards.reduce((inner, ward) => inner + ward.units.length, 0),
    0
  );

  if (!countUnits) {
    console.error(`\n  ${state.name} came back with no polling units at all. Stopping.`);
    process.exit(1);
  }

  lgas += countLgas;
  wards += countWards;
  units += countUnits;

  await writeFile(new URL(`${state.number}.json`, OUT), JSON.stringify(shaped));
  written.push(state.number);

  console.log(
    `${String(countLgas).padStart(3)} LGAs  ${String(countWards).padStart(4)} wards  ${String(
      countUnits
    ).padStart(6)} units`
  );
}

console.log(`\n${written.length} states written to public/geo/units/`);
console.log(`${lgas} local governments, ${wards} wards, ${units.toLocaleString("en-NG")} units`);

if (!only) {
  /* ── CHECKED AGAINST INEC, NOT AGAINST ITSELF ─────────────────────────
     A scrape that lost a state is internally consistent and completely
     wrong. These are the commission's own published totals. */
  let bad = false;
  for (const [what, expected] of Object.entries(EXPECTED)) {
    const got = { lgas, wards, units }[what];
    const drift = Math.abs(got - expected) / expected;
    const line = `${what}: ${got.toLocaleString("en-NG")} against INEC's ${expected.toLocaleString("en-NG")}`;
    if (drift > TOLERANCE) {
      console.error(`  ✗ ${line} — ${(drift * 100).toFixed(1)}% out`);
      bad = true;
    } else {
      console.log(`  ✓ ${line}`);
    }
  }
  if (bad) {
    console.error("\nTotals are too far from INEC's. Nothing downstream should use this.");
    process.exit(1);
  }
}

/**
 * INEC publishes every name in capitals.
 *
 * Left as they arrive, a dropdown is thirty rows of SHOUTING and a form that
 * reads like a demand. Title case is applied for display only; the codes,
 * which are the part that matters, are untouched.
 */
function titleCase(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    /* Roman numerals and the compass points INEC uses read wrong in title
       case: "Brass Ii" and "Ikeja North East" are both worse than the
       original. */
    .replace(/\b(I{1,3}|Iv|Vi{0,3}|Ix|Xi{0,2})\b/g, (roman) => roman.toUpperCase());
}
