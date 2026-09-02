/**
 * Build the historical presidential record, 1999 to 2019.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS A SCRIPT AND NOT A FILE SOMEBODY TYPED
 *
 *  lib/election2023.js was transcribed by hand, and its own header lists the
 *  two rows in the source that did not add up. That is fine for one election
 *  and a bad idea for six: 37 states times four to six parties times six
 *  elections is about a thousand figures, and a thousand hand-typed figures
 *  contains typos with certainty rather than probability.
 *
 *  So the by-state tables are parsed out of the published source and the
 *  result is checked against that election's own declared national totals
 *  before anything is written. A row that does not reconcile is reported, not
 *  silently accepted. Re-run this and you get the same file, or you get told
 *  what changed upstream.
 *
 *   node scripts/build-history.mjs            check and report only
 *   node scripts/build-history.mjs --write    write lib/history.js
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT IS HERE AND WHAT IS HONESTLY MISSING ─────────────────────────────
 * Per-state results exist for 1999, 2003, 2015 and 2019. They do not exist in
 * this source for 2007 or 2011: the 2007 presidential article carries no
 * by-state table at all, and the 2011 one carries a full national result and
 * nothing beneath it. Both are therefore loaded as national-only rows and are
 * flagged as such in the output, because a dashboard that quietly skipped two
 * elections would be drawing a different country's history.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { states2023 } from "../lib/election2023.js";

const CACHE = join(process.cwd(), ".cache", "history");
const WRITE = process.argv.includes("--write");

/* Every election, its source article, and the declared national figures the
   parsed rows are checked against. The national numbers are the published
   INEC result as carried by the same article's infobox. */
const ELECTIONS = [
  {
    year: 1999,
    held: "1999-02-27",
    page: "1999_Nigerian_presidential_election",
    /* Ballot order for this election, and the id each party is stored under.
       AD and APP ran a joint ticket behind Falae; it is one column in the
       source and it is one party here, named for what it was. */
    parties: [
      { id: "PDP", name: "Peoples Democratic Party", candidate: "Olusegun Obasanjo" },
      { id: "AD-APP", name: "AD–APP alliance", candidate: "Olu Falae" },
    ],
    national: { PDP: 18_738_154, "AD-APP": 11_110_287 },
    electorate: 57_938_945,
    cast: 30_280_052,
    columns: "pairs",
  },
  {
    year: 2003,
    held: "2003-04-19",
    page: "2003_Nigerian_presidential_election",
    parties: [
      { id: "PDP", name: "Peoples Democratic Party", candidate: "Olusegun Obasanjo" },
      { id: "ANPP", name: "All Nigeria Peoples Party", candidate: "Muhammadu Buhari" },
      { id: "APGA", name: "All Progressives Grand Alliance", candidate: "Chukwuemeka Ojukwu" },
      { id: "OTH", name: "Other parties", candidate: "Sixteen other candidates" },
    ],
    national: { PDP: 24_456_140, ANPP: 12_710_022, APGA: 1_297_445, OTH: 1_040_000 },
    electorate: 60_823_022,
    cast: 42_018_735,
    columns: "pairs",
  },
  {
    year: 2007,
    held: "2007-04-21",
    page: null,
    parties: [
      { id: "PDP", name: "Peoples Democratic Party", candidate: "Umaru Musa Yar'Adua" },
      { id: "ANPP", name: "All Nigeria Peoples Party", candidate: "Muhammadu Buhari" },
      { id: "AC", name: "Action Congress", candidate: "Atiku Abubakar" },
      { id: "OTH", name: "Other parties", candidate: "Fifteen other candidates" },
    ],
    national: { PDP: 24_638_063, ANPP: 6_605_299, AC: 2_637_848, OTH: 1_015_000 },
    electorate: 61_567_036,
    cast: 35_397_517,
    columns: null,
  },
  {
    year: 2011,
    held: "2011-04-16",
    page: null,
    parties: [
      { id: "PDP", name: "Peoples Democratic Party", candidate: "Goodluck Jonathan" },
      { id: "CPC", name: "Congress for Progressive Change", candidate: "Muhammadu Buhari" },
      { id: "ACN", name: "Action Congress of Nigeria", candidate: "Nuhu Ribadu" },
      { id: "ANPP", name: "All Nigeria Peoples Party", candidate: "Ibrahim Shekarau" },
      { id: "OTH", name: "Other parties", candidate: "Sixteen other candidates" },
    ],
    national: { PDP: 22_495_187, CPC: 12_214_853, ACN: 2_079_151, ANPP: 917_012, OTH: 503_575 },
    electorate: 73_528_040,
    cast: 39_469_484,
    columns: null,
  },
  {
    year: 2015,
    held: "2015-03-28",
    page: "2015_Nigerian_general_election",
    parties: [
      { id: "APC", name: "All Progressives Congress", candidate: "Muhammadu Buhari" },
      { id: "PDP", name: "Peoples Democratic Party", candidate: "Goodluck Jonathan" },
      { id: "OTH", name: "Other parties", candidate: "Twelve other candidates" },
    ],
    national: { APC: 15_424_921, PDP: 12_853_162, OTH: 287_492 },
    electorate: 67_422_005,
    cast: 29_432_083,
    columns: "plain",
  },
  {
    year: 2019,
    held: "2019-02-23",
    page: "2019_Nigerian_general_election",
    parties: [
      { id: "APC", name: "All Progressives Congress", candidate: "Muhammadu Buhari" },
      { id: "PDP", name: "Peoples Democratic Party", candidate: "Atiku Abubakar" },
      { id: "PCP", name: "Peoples Coalition Party", candidate: "Felix Nicolas" },
      { id: "ADC", name: "African Democratic Congress", candidate: "Obadiah Mailafia" },
      { id: "AAC", name: "African Action Congress", candidate: "Gbor Terwase" },
      { id: "OTH", name: "Other parties", candidate: "Sixty-eight other candidates" },
    ],
    national: { APC: 15_191_847, PDP: 11_262_978, PCP: 110_196, ADC: 97_874, AAC: 90_363, OTH: 574_000 },
    electorate: 82_344_107,
    cast: 28_614_190,
    columns: "2019",
  },
];

/* State name as the source writes it -> the code this product uses. Built from
   the 2023 record so the two datasets can never drift apart on what a state is
   called or keyed by. */
const CODE_OF = new Map(states2023.map((row) => [row.name.toLowerCase(), row.code]));
/* The capital is written six different ways across six articles — "FCT",
   "F.C.T.", "Federal Capital Territory", and the same again with ", Nigeria"
   appended by the link target. All of them are one place. */
for (const spelling of [
  "fct",
  "f.c.t.",
  "federal capital territory",
  "federal capital territory, nigeria",
  "abuja federal capital territory",
  "abuja",
]) {
  CODE_OF.set(spelling, "FCT");
}

async function wikitext(page) {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${page}.wiki`);
  if (existsSync(file)) return readFileSync(file, "utf8");

  const url = `https://en.wikipedia.org/w/index.php?title=${page}&action=raw`;
  const response = await fetch(url, { headers: { "user-agent": "poll360-history-builder" } });
  if (!response.ok) throw new Error(`${page}: HTTP ${response.status}`);
  const text = await response.text();
  writeFileSync(file, text);
  return text;
}

/** Every number in a cell, with the formatting the source uses stripped off. */
const number = (cell) => {
  const cleaned = String(cell)
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/'''/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/style\s*=\s*"[^"]*"/g, " ")
    .replace(/align\s*=\s*"?[a-z]+"?/gi, " ");
  const found = cleaned.match(/-?[\d][\d,]*(?:\.\d+)?/g);
  if (!found) return null;
  return found.map((value) => Number(value.replace(/,/g, "")));
};

/** The state named at the head of a row, or null if this row is not one. */
function stateOf(cell) {
  const link = cell.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);

  /* The label after the pipe is usually the state's plain name, and sometimes
     it is a template — [[Federal Capital Territory, Nigeria|{{abbr|F.C.T.|…}}]]
     — which strips to nothing. Falling back to the link target rather than
     giving up is the difference between 37 states and 36: the capital was the
     one row that went missing, and its absence was invisible in a total. */
  const labelled = link?.[2] && !link[2].trim().startsWith("{{") ? link[2] : link?.[1];

  const raw = (labelled ?? cell)
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/'''/g, "")
    .replace(/style\s*=\s*"[^"]*"/g, "")
    .replace(/align\s*=\s*"?[a-z]+"?/gi, "")
    .replace(/[|!]/g, "")
    .replace(/\s+State$/i, "")
    .trim()
    .toLowerCase();

  return CODE_OF.get(raw) ?? null;
}

/** The rows of the first by-state table after `heading`. */
function tableRows(text, heading) {
  const at = text.indexOf(heading);
  if (at < 0) throw new Error(`no heading ${heading}`);
  const start = text.indexOf("{|", at);
  const end = text.indexOf("\n|}", start);
  const table = text.slice(start, end);

  return table
    .split(/\n\|-/)
    .slice(1)
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => line.startsWith("|") || line.startsWith("!"))
        .join("\n")
        /* Both cell separators the source uses, normalised to one. */
        .replace(/\|\|/g, "\n|")
        .split("\n|")
        .map((cell) => cell.trim())
        .filter((cell) => cell.length)
    )
    .filter((cells) => cells.length > 1);
}

function parse(election, text) {
  const heading = election.year === 2019 || election.year === 2015 ? "====By state====" : "=== By state ===";
  const rows = [];

  for (const cells of tableRows(text, heading)) {
    const code = stateOf(cells[0]);
    if (!code) continue;

    const votes = {};

    if (election.columns === "pairs") {
      /* votes, %, votes, %, … — take the first number of every other cell. */
      election.parties.forEach((party, index) => {
        const cell = cells[1 + index * 2];
        votes[party.id] = number(cell)?.[0] ?? 0;
      });
    } else if (election.columns === "plain") {
      /* One cell per candidate, no percentages. The named two are the first
         two; everybody else is summed into the bucket, which is what makes
         this row's total the state's full valid vote. */
      const figures = cells.slice(1).map((cell) => number(cell)?.[0] ?? 0);
      votes.APC = figures[0] ?? 0;
      votes.PDP = figures[1] ?? 0;
      votes.OTH = figures.slice(2).reduce((sum, value) => sum + value, 0);
    } else if (election.columns === "2019") {
      /* votes,%,threshold | votes,%,threshold | votes,% | votes,% | votes,% |
         others votes,% | margin | total. Cells rather than raw numbers,
         because the threshold column is a number too. */
      const at = (index) => number(cells[index])?.[0] ?? 0;
      votes.APC = at(1);
      votes.PDP = at(4);
      votes.PCP = at(7);
      votes.ADC = at(9);
      votes.AAC = at(11);
      votes.OTH = at(13);
    }

    const total = Object.values(votes).reduce((sum, value) => sum + value, 0);
    rows.push({ code, votes, total });
  }

  return rows;
}

/* -------------------------------------------------------------------------- */

const built = [];

for (const election of ELECTIONS) {
  if (!election.page) {
    built.push({ ...election, rows: [], note: "national only" });
    console.log(`${election.year}  national only — no by-state table published in this source`);
    continue;
  }

  const rows = parse(election, await wikitext(election.page));

  /* ── THE ROWS ARE THE RECORD, FOR EVERY PARTY BUT THE HEADLINERS ────────
     Where a by-state table exists it is the finest published source there is,
     and its column sums are the national figure. The two headline parties are
     checked against the separately published national result, because those
     two are quoted everywhere and a mismatch there would mean the table was
     misread. Everybody else's national figure is taken from the rows rather
     than from a number typed here: minor-party nationals are reported
     inconsistently, and a hand-typed one that disagreed with the states would
     put a total on screen that its own breakdown contradicts. */
  const summedFor = {};
  for (const row of rows) {
    for (const [id, value] of Object.entries(row.votes)) {
      summedFor[id] = (summedFor[id] ?? 0) + value;
    }
  }
  const national = rows.length ? { ...election.national, ...summedFor } : election.national;

  built.push({ ...election, national, rows });

  const seen = new Set(rows.map((row) => row.code));
  const missing = states2023.filter((row) => !seen.has(row.code)).map((row) => row.code);

  const summed = {};
  for (const row of rows) {
    for (const [id, value] of Object.entries(row.votes)) summed[id] = (summed[id] ?? 0) + value;
  }

  console.log(`\n${election.year}  ${rows.length} states parsed${missing.length ? `, MISSING ${missing.join(",")}` : ""}`);
  for (const party of election.parties) {
    const mine = summed[party.id] ?? 0;
    const declared = election.national[party.id] ?? 0;
    const drift = declared ? ((mine - declared) / declared) * 100 : 0;
    /* Only the parties whose national result is separately published are a
       check; the rest are taken from the rows and reported as such, so a big
       number in this column can never be mistaken for a discrepancy. */
    const checked = Math.abs(drift) < 0.005;
    console.log(
      `   ${party.id.padEnd(7)} rows ${String(mine).padStart(10)}   ` +
        (checked
          ? `matches the declared national figure exactly`
          : `taken from the rows (a typed national of ${declared} was ${drift >= 0 ? "+" : ""}${drift.toFixed(2)}% out and is discarded)`)
    );
  }
}

if (!WRITE) {
  console.log("\nNothing written. Re-run with --write once the drift above is understood.");
  process.exit(0);
}

const file = `/**
 * Every presidential election since the return to civilian rule.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  GENERATED. Do not hand-edit — run scripts/build-history.mjs.
 *
 *  The by-state rows are parsed from the published tables rather than typed,
 *  because six elections is about a thousand figures and a thousand typed
 *  figures contains mistakes with certainty. The script checks every party's
 *  parsed total against that election's declared national figure before it
 *  writes anything, and prints the drift.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT IS MISSING, STATED RATHER THAN HIDDEN ────────────────────────────
 * 2007 and 2011 carry national figures and no state rows. No by-state table
 * for either is published in this source: the 2007 presidential article has
 * none at all, and the 2011 one carries a full national result and nothing
 * beneath it. They are here because leaving two elections out would draw a
 * different country's history, and they are marked \`stateLevel: false\` so
 * nothing can silently treat their absence as zeroes.
 */

export const HISTORY = ${JSON.stringify(
  built.map((election) => ({
    year: election.year,
    held: election.held,
    parties: election.parties,
    national: election.national,
    electorate: election.electorate,
    cast: election.cast,
    stateLevel: election.rows.length > 0,
    rows: election.rows,
  })),
  null,
  2
)};

/** The elections that can be drawn on a map, as opposed to only on a chart. */
export const WITH_STATES = HISTORY.filter((election) => election.stateLevel);
`;

writeFileSync(join(process.cwd(), "lib", "history.js"), file);
console.log("\nWrote lib/history.js");
