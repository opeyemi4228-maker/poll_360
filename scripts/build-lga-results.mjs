/**
 * Build the counted record of the 2023 presidential election by local
 * government.
 *
 *   node scripts/build-lga-results.mjs            check and report only
 *   node scripts/build-lga-results.mjs --write    write lib/data/lga-2023.js
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS EXISTS
 *
 *  Below a state, Poll360 spread the state's declared total across its real
 *  wards and polling units and called the result an estimate, which it was.
 *  But for some local governments the collated figure was published, and an
 *  estimate standing where a counted figure exists is a worse answer than the
 *  product is able to give. This loads the ones that were published.
 *
 *  ── WHERE IT COMES FROM ─────────────────────────────────────────────────
 *  The same published source as scripts/build-history.mjs: one article per
 *  state, each with a table of the result by local government. Parsed, never
 *  typed. The source is uneven — whole states are filled in, others carry a
 *  handful of rows, most carry none — and this does not smooth it over: a
 *  local government with no published row is simply not in the output.
 *
 *  ── WHAT IS CHECKED BEFORE A ROW IS KEPT ────────────────────────────────
 *    · the name matches exactly one local government in INEC's own list;
 *    · every party column holds a figure ("others" may be the stated total
 *      less the named parties, and nothing else is worked out);
 *    · the parties add to the row's own stated total, where it states one;
 *    · the state's kept rows together do not exceed what INEC declared for
 *      the state for any party — and where every local government is held,
 *      they must equal it to within one vote in a hundred.
 *  A state that fails the last check is left out whole and reported: rows
 *  that contradict the declared result are not a better record than none.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { states2023 } from "../lib/election2023.js";

const CACHE = join(process.cwd(), ".cache", "pres");
const WRITE = process.argv.includes("--write");
const OUT = "lib/data/lga-2023.js";
const SLOTS = ["APC", "PDP", "LP", "NNPP", "OTH"];

mkdirSync(CACHE, { recursive: true });

const BOOKS = readdirSync("public/geo/units")
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(`public/geo/units/${name}`, "utf8")));

async function page(book) {
  const file = join(CACHE, `2023_${book.code}.txt`);
  if (existsSync(file)) return readFileSync(file, "utf8");
  const place = book.code === "FCT" ? "the_Federal_Capital_Territory" : `${book.name.replace(/ /g, "_")}_State`;
  const url = `https://en.wikipedia.org/w/index.php?title=2023_Nigerian_presidential_election_in_${encodeURIComponent(place)}&action=raw`;
  const response = await fetch(url, { headers: { "user-agent": "poll360-history-builder" } });
  const text = response.ok ? await response.text() : "";
  writeFileSync(file, text);
  await new Promise((done) => setTimeout(done, 150));
  return text;
}

/** Wiki markup down to the words a reader sees. */
function plain(text) {
  return String(text ?? "")
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const letters = (text) =>
  plain(text)
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/local government( area)?|lga|area council/g, "")
    .replace(/[^a-z]/g, "");

/* The handful of places the source and INEC's list spell differently. Each is
   the same local government under another spelling, and nothing else is ever
   matched by guesswork. */
const ALIASES = {
  ADA: { girei: "gire" },
  EKI: { ijeroekiti: "ijero", ikereekiti: "ikere" },
  KAN: { dawakinkudu: "dawakikudu", dawakintofa: "dawakitofa", garunmallam: "garunmalam" },
  LAG: { ifakoijaiye: "ifakoijaye" },
  FCT: { abuja: "municipal", abujamunicipal: "municipal", amac: "municipal" },
};

const figure = (cell) => {
  const digits = plain(cell).replace(/[,\s]/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : null;
};

/** Which party each pair of columns belongs to, read off the table's own heading. */
function columnsOf(table) {
  const head = table.split(/\n\|-/)[0];
  const order = [];
  for (const cell of head.split(/\n!/)) {
    const small = cell.match(/<small>\s*([A-Za-z]+)\s*<\/small>/);
    if (small) order.push(small[1].toUpperCase());
    else if (/\|\s*Others\s*$/i.test(cell.trim()) || /^\s*[^|]*\|\s*Others/i.test(cell)) order.push("OTH");
  }
  return order;
}

function rowsOf(text) {
  const at = text.search(/=+\s*By local government area\s*=+/i);
  if (at < 0) return { order: [], rows: [] };
  const table = text.slice(at).split(/\n\|\}/)[0];
  const order = columnsOf(table);
  const rows = [];
  for (const raw of table.split(/\n\|-/).slice(1)) {
    if (!/text-align:\s*left/.test(raw)) continue;
    const body = raw.replace(/<ref[^>]*\/>/g, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
    const cells = body
      .split("\n")
      .filter((line) => line.startsWith("|"))
      .flatMap((line) => line.slice(1).split("||"));
    const name = plain(cells[0].replace(/^\s*style="[^"]*"\s*\|/, ""));
    /* After the name: votes and a share for each party, then the total. */
    const votes = order.map((_, index) => figure(cells[1 + index * 2]));
    const total = figure(cells[1 + order.length * 2]);
    rows.push({ name, votes, total });
  }
  return { order, rows };
}

const out = {};
const report = [];
let kept = 0;
let places = 0;

for (const book of BOOKS) {
  places += book.lgas.length;
  const { order, rows } = rowsOf(await page(book));
  if (!rows.length) continue;

  if (SLOTS.some((slot) => !order.includes(slot)) || order.length !== SLOTS.length) {
    report.push(`${book.code}: the table's columns are ${order.join(", ") || "unreadable"}; left out.`);
    continue;
  }

  const byName = new Map();
  for (const lga of book.lgas) {
    const key = letters(lga.name);
    byName.set(key, byName.has(key) ? null : lga);
  }

  const lgas = {};
  for (const row of rows) {
    /* A row that names its four parties and its total but leaves "others"
       blank still says what others polled: the rest. Nothing else is ever
       worked out, and a row missing a named party is not kept. */
    const blank = row.votes.map((value, index) => (value === null ? index : -1)).filter((index) => index >= 0);
    if (blank.length === 1 && order[blank[0]] === "OTH" && row.total !== null) {
      const rest = row.total - row.votes.reduce((all, value) => all + (value ?? 0), 0);
      if (rest >= 0) row.votes[blank[0]] = rest;
    }
    if (row.votes.some((value) => value === null)) continue;
    const said = letters(row.name);
    const lga = byName.get(ALIASES[book.code]?.[said] ?? said);
    if (!lga) {
      report.push(`${book.code}: "${row.name}" matches no local government in INEC's list; left out.`);
      continue;
    }
    const sum = row.votes.reduce((all, value) => all + value, 0);
    if (row.total !== null && row.total !== sum) {
      report.push(`${book.code}: ${row.name} states ${row.total} and its parties add to ${sum}; left out.`);
      continue;
    }
    if (lgas[lga.n]) {
      report.push(`${book.code}: ${row.name} appears twice; left out.`);
      delete lgas[lga.n];
      continue;
    }
    lgas[lga.n] = SLOTS.map((slot) => row.votes[order.indexOf(slot)]);
  }

  const held = Object.keys(lgas).length;
  if (!held) continue;

  /* Against what INEC declared for the state. */
  const declared = states2023.find((state) => state.code === book.code);
  /* The declared record carries its votes in this same order. */
  const stated = SLOTS.map((_, index) => declared?.votes?.[index] ?? null);
  if (stated.some((value) => value === null)) {
    report.push(`${book.code}: no declared state result to check against; left out.`);
    continue;
  }
  const sums = SLOTS.map((_, index) => Object.values(lgas).reduce((all, votes) => all + votes[index], 0));
  const complete = held === book.lgas.length;
  const over = SLOTS.filter((_, index) => sums[index] > stated[index] * 1.01 + 5);
  const short = complete ? SLOTS.filter((_, index) => Math.abs(sums[index] - stated[index]) > stated[index] * 0.01 + 5) : [];
  if (over.length || short.length) {
    report.push(
      `${book.code}: ${held} local governments add to ${sums.join("/")} against a declared ${stated.join("/")} (${SLOTS.join("/")}); left out whole.`
    );
    continue;
  }

  out[book.state] = { code: book.code, complete, lgas };
  kept += held;
  report.push(`${book.code}: ${held} of ${book.lgas.length} held${complete ? ", the whole state" : ""}.`);
}

console.log(report.join("\n"));
console.log(`\n${kept} of ${places} local governments held, in ${Object.keys(out).length} states.`);

if (WRITE) {
  writeFileSync(
    OUT,
    `/**
 * The 2023 presidential election by local government, where the collated
 * figure was published. Counted, not estimated.
 *
 * \`LGA_2023[stateNumber].lgas[lgaNumber]\` is the votes in SLOTS order.
 * \`complete\` says every local government of the state is held. A local
 * government with no row here had no published figure: it is not zero, and
 * what is shown for it elsewhere is an estimate that says so.
 *
 * ${kept} of ${places} local governments, in ${Object.keys(out).length} states.
 *
 * Generated by scripts/build-lga-results.mjs. Do not edit by hand.
 */
export const SLOTS = ${JSON.stringify(SLOTS)};

export const LGA_2023 = ${JSON.stringify(out)};
`
  );
  console.log(`wrote ${OUT}`);
}
