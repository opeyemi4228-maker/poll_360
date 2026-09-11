/**
 * Real polling unit results, joined to INEC's own unit tree.
 *
 *   node scripts/import-unit-results.mjs <csv> <state-number> > lib/data/units-<state>-2023.js
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THERE IS SO LITTLE OF THIS
 *
 *  No machine-readable record of Nigerian presidential results at polling unit
 *  level has ever been published — not for 2007, 2011, 2015, 2019 or 2023.
 *  What INEC published for 2023 was photographs: 167,443 scans of Form EC8A on
 *  the IReV portal, one per unit, which nothing upstream tabulated.
 *
 *  A few analysts transcribed single states. Those transcriptions are the only
 *  counted unit-level figures that exist, and this reads them.
 *
 *  ── AND WHY IT IS WORTH DOING NOW RATHER THAN LATER ──────────────────────
 *  The sheets themselves are going. Every one of those datasets cites result
 *  files under docs.inecelectionresults.net, and that domain has lapsed — it
 *  now serves a parking page that says it may be for sale. A row transcribed
 *  from a sheet nobody can fetch any more is the whole record of that sheet.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── EVERY ROW IS JOINED, OR THE IMPORT FAILS ───────────────────────────────
 * A unit code that matches nothing in the tree is not dropped and not passed
 * through. It stops the run, because a partial join is the failure that looks
 * like success: the file is written, the dashboard draws, and a tenth of a
 * state is quietly missing with nothing to notice it by.
 */
import { readFileSync } from "node:fs";

const [, , csvPath, stateNumber] = process.argv;
if (!csvPath || !stateNumber) {
  console.error("usage: import-unit-results.mjs <csv> <state-number>");
  process.exit(1);
}

const tree = JSON.parse(readFileSync(`public/geo/units/${stateNumber}.json`, "utf8"));

/** Every unit code the tree knows, so a transcription can be checked. */
const known = new Map();
for (const lga of tree.lgas) {
  for (const ward of lga.wards) {
    for (const unit of ward.units) {
      known.set(`${tree.state}/${lga.n}/${ward.n}/${unit.n}`, {
        lga: lga.name,
        ward: ward.name,
        name: unit.name,
      });
    }
  }
}

/* A small CSV reader rather than a dependency: these files are plain, the
   fields that matter are numbers and codes, and a quoted comma in a unit name
   is the only case worth handling. */
function parse(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length);
  const head = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    return Object.fromEntries(head.map((key, index) => [key, cells[index] ?? ""]));
  });
}

function split(line) {
  const out = [];
  let cell = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      out.push(cell);
      cell = "";
    } else cell += char;
  }
  out.push(cell);
  return out.map((value) => value.trim());
}

const number = (value) => {
  const parsed = Number(String(value ?? "").replace(/[^0-9-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const rows = parse(readFileSync(csvPath, "utf8"));

/* The slot order this product uses for 2023, everywhere. The bucket is last
   and stays last — lib/drill.js's `leaderOf` depends on it. */
const SLOTS = ["APC", "PDP", "LP", "NNPP", "OTH"];

const units = [];
const unmatched = [];
const seen = new Set();
let blank = 0;

for (const row of rows) {
  const code = String(row["PU-Code"] ?? "").replace(/-/g, "/");
  /* A row with no code at all is a blank line the reader kept, not a unit that
     failed to join. Counted separately so the refusal below stays meaningful —
     "1 code matched nothing" listing an empty string is a message that sends
     somebody looking for a unit that was never there. */
  if (!code) {
    blank += 1;
    continue;
  }
  if (!known.has(code)) {
    unmatched.push(code);
    continue;
  }
  if (seen.has(code)) continue;
  seen.add(code);

  const votes = SLOTS.map((party) => (party === "OTH" ? 0 : number(row[party])));

  units.push([
    code,
    number(row.Registered_Voters),
    number(row.Accredited_Voters),
    ...votes.slice(0, 4),
  ]);
}

if (unmatched.length) {
  console.error(
    `${unmatched.length} unit codes match nothing in public/geo/units/${stateNumber}.json.\n` +
      `First few: ${unmatched.slice(0, 5).join(", ")}\n` +
      `Refusing to write a partial join.`
  );
  process.exit(1);
}

units.sort((a, b) => a[0].localeCompare(b[0]));

const cast = units.reduce((sum, unit) => sum + unit[3] + unit[4] + unit[5] + unit[6], 0);
const registered = units.reduce((sum, unit) => sum + unit[1], 0);

const meta = {
  state: tree.state,
  code: tree.code,
  name: tree.name,
  year: 2023,
  units: units.length,
  /* How much of the state this is. The transcriptions are partial — a unit
     whose sheet was never uploaded, or was uploaded unreadable, has no row —
     and a screen drawing them must be able to say what fraction it is holding
     rather than implying a complete state. */
  unitsInState: known.size,
  registered,
  cast,
};

process.stdout.write(`/**
 * ${meta.name} 2023, by polling unit. Counted, transcribed from Form EC8A.
 *
 * ── WHAT THIS IS ───────────────────────────────────────────────────────────
 * ${meta.units.toLocaleString("en-NG")} of ${meta.unitsInState.toLocaleString("en-NG")} units in the state, every one joined to INEC's own
 * delimitation code. Transcribed from the result sheets INEC published on
 * IReV, which are no longer fetchable from the address they were published at.
 *
 * ── AND WHAT IT IS NOT ─────────────────────────────────────────────────────
 * Not the whole state. A unit with no row here is a unit whose sheet was never
 * uploaded or could not be read, and it must be drawn as unknown rather than
 * as nothing — a booth with no transcription did not cast no votes.
 *
 * Generated by scripts/import-unit-results.mjs. Do not edit by hand.
 */

/** [code, registered, accredited, APC, PDP, LP, NNPP] */
export const SLOTS = ${JSON.stringify(SLOTS)};

export const META = ${JSON.stringify(meta, null, 2)};

export const UNITS = ${JSON.stringify(units)};
`);

console.error(
  `${meta.units} units, ${meta.cast.toLocaleString("en-NG")} votes, ` +
    `${((meta.units / meta.unitsInState) * 100).toFixed(1)}% of the state's booths` +
    (blank ? ` (${blank} blank row${blank === 1 ? "" : "s"} skipped)` : "")
);
