/**
 * Turning a published constituency list into the one this product can use.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS IS FOR
 *
 *  A senator is elected by a senatorial district and a member of the House of
 *  Representatives by a federal constituency. Neither is a place this
 *  repository knew about: it holds 37 states and 774 local governments, and a
 *  district is a named set of local governments that nothing here recorded.
 *
 *  Without that set, "show me Kaduna Central" is a question the product
 *  cannot answer, and an account covering one senatorial district has to be
 *  given the whole state — which is three times the map, three times the
 *  figures, and a coverage percentage measured against booths that account
 *  has no agents in.
 *
 *  So the composition is read from a published source, joined to the local
 *  governments we already draw, and written out as codes. It is generated
 *  rather than typed, and it is checked rather than trusted.
 *
 *  Run it with `npm run build:constituencies`. It writes
 *  public/geo/constituencies.json and refuses to write anything at all if a
 *  single check below fails.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE SOURCE, AND WHY IT IS COMMITTED BESIDE THIS FILE ───────────────────
 * scripts/sources/nigeria-lga-districts.sql is a database dump published at
 * github.com/nuhu-ibrahim/lga-districs. It carries all 774 local governments
 * with the senatorial district and federal constituency each belongs to.
 *
 * It is committed rather than fetched, because a build that reaches the
 * network is a build that fails on the morning it is needed, and because a
 * dataset nobody can diff is a dataset nobody can check. Everything this
 * script corrects is corrected here, in the open, rather than by editing the
 * source into something that no longer matches what was published.
 *
 * ── WHAT WE CHECKED IT AGAINST ─────────────────────────────────────────────
 * Its senatorial compositions agree with the ones Wikipedia states for Kaduna
 * North, Borno Central, Anambra South, Akwa Ibom South, Kano Central, Niger
 * East, Enugu East, Taraba South and the Federal Capital Territory. Its local
 * government names agree with our own boundary files for 723 of 774 outright,
 * and the remaining 51 are spelling variants of a single leftover name in
 * their own state, listed one by one in ALIASES below.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { STATES } from "../lib/units.js";

const ROOT = process.cwd();
const SOURCE = join(ROOT, "scripts", "sources", "nigeria-lga-districts.sql");
const OUT = join(ROOT, "public", "geo", "constituencies.json");

/* ── SPELLINGS ─────────────────────────────────────────────────────────────
   Where the source and our boundary files write the same place differently.
   Left is the source's spelling, right is ours, and ours wins because ours is
   what the rest of the product already draws and names.

   Every one of these was arrived at the same way: within a state, the names
   that failed to match were the same number on both sides, and each leftover
   had exactly one candidate it could be. Two are not misspellings at all —
   Egbado North and South were renamed Yewa North and South in 1995, and the
   FCT's Abuja Municipal is the Municipal Area Council. Several of the
   corrections run the other way, towards the source: our own files carry
   "Obi Nwga" for Obingwa, "Shomgom" for Shongom and "Mbatoli" for Mbaitoli.
   The right-hand column is still ours, because a name has to join to the
   shape it is drawn as. ─────────────────────────────────────────────────── */
const ALIASES = {
  Abia: { Obingwa: "Obi Nwga", Osisioma: "Osisioma Ngwa" },
  "Akwa Ibom": { "Ibeskip Asutan": "Ibesikpo Asutan", "Nsit Ata": "Nsit Atai" },
  Anambra: { Aguta: "Aguata" },
  Bauchi: { Gunjuwa: "Ganjuwa" },
  Bayelsa: { Yenagoa: "Yenegoa" },
  Benue: { Obadigbo: "Ogbadibo", Opkokwu: "Okpokwu", Otukpo: "Oturkpo" },
  Borno: { Mafaf: "Mafa" },
  Delta: { Opke: "Okpe", Ukwani: "Ukwuani" },
  Edo: { Igueben: "Iguegben", Uhunmwode: "Uhunmwonde" },
  Ekiti: { Ilejeme: "Ilejemeje" },
  /* "Oji-Uzo" is the source's only unmatched Enugu name and "Oji River" is
     our only unclaimed one. Isi Uzo matched on both sides already, so this is
     Oji River with a neighbouring name run into it. */
  Enugu: { Agwu: "Awgu", "Oji-Uzo": "Oji-River" },
  Gombe: { Shongom: "Shomgom" },
  Imo: { Mbaitolu: "Mbatoli" },
  Jigawa: {
    Birniwa: "Biriniwa",
    Gagara: "Gagarawa",
    "Kiri-Kasamma": "Kiri Kasama",
    Maigatar: "Maigatari",
    "Mallam Madori": "Malam Madori",
  },
  Kano: { Alabasu: "Albasu", Ikabo: "Kabo", Nasarawa: "Nassarawa" },
  Kebbi: { Aliero: "Aleiro", Bagudo: "Bagudu", Wasagu: "Wasagu-Danko" },
  Kogi: { Igalamela: "Igalamela-Odolu", "Ogori-Magogo": "Ogori/Magongo" },
  Kwara: { Patigi: "Pategi" },
  Lagos: { "Ifako-Ijaiye": "Ifako/Ijaye", Somolu: "Shomolu" },
  Nasarawa: { "Nasarawa Eggon": "Nasarawa Egon" },
  Niger: { Mashe: "Mashegu" },
  Ogun: { "Egbado North": "Yewa North", "Egbado South": "Yewa South" },
  Osun: { Ayedaade: "Ayedade", Illa: "Ila" },
  Oyo: { Atigbo: "Atisbo", Orire: "Ori Ire" },
  Rivers: { Emohua: "Emuoha", Omuma: "Omumma" },
  Sokoto: { Ilella: "Illela", Tambuwa: "Tambuwal" },
  Zamfara: { "Birnin-Magaji": "Birnin Magaji-Kiyaw", "Talata Marafa": "Talata Mafara" },
  "Federal Capital Territory": { "Abuja Municipal": "Municipal Area Council" },
};

/* ── SAID TWICE ────────────────────────────────────────────────────────────
   Three federal constituencies appear in the source under a second name with
   no local governments attached to it. Igede is what the Oju/Obi constituency
   is called after the people who live in it; the other two are the same name
   with the words "Federal Constituency" appended. Dropped, and the drop is
   checked: the totals below only reach 360 if exactly these three go. ────── */
const DUPLICATE_FEDERAL = new Set([
  "Benue:Igede",
  "Gombe:Akko Federal Constituency",
  "Osun:Ife Federal Constituency",
]);

/* ── IN THE WRONG STATE'S DISTRICT ─────────────────────────────────────────
   Three local governments are filed under a senatorial district belonging to
   the state next door. They are the only three, and the check below that
   refuses a district spanning two states is what found them.

   Kabo and Karaye are Kano local governments filed under Kaduna North; both
   are Kano North, which is 12 without them and 14 with them, and 14 + 15 + 15
   is Kano's 44. Zangon Kataf is a Kaduna local government filed under Kano
   South; it is Kaduna South, which is 7 without it and 8 with it, and 7 + 8 +
   8 is Kaduna's 23. Neither state adds up any other way. ─────────────────── */
const REASSIGN_SENATORIAL = {
  "Kano:Ikabo": "Kano North",
  "Kano:Karaye": "Kano North",
  "Kaduna:Zangon Kataf": "Kaduna South",
};

/* ── ONE LOCAL GOVERNMENT, TWO CONSTITUENCIES ──────────────────────────────
   Surulere, Mushin, Oshodi-Isolo, Lagos Island and Port Harcourt each elect
   two members of the House of Representatives. The source gives the local
   government to one of the pair and leaves the other with nothing — and in
   Lagos Island's case leaves the second one out altogether.

   Both halves are real seats and both are named here. What they cannot be is
   told apart: the line between them runs between wards inside the local
   government, and this product holds no ward boundaries. So each of a pair
   covers the whole local government, is marked `shared`, and says so on every
   screen that offers it. ────────────────────────────────────────────────── */
const EXTRA_FEDERAL = [
  { state: "Lagos", name: "Lagos Island II", lgas: ["Lagos Island"] },
  { state: "Lagos", name: "Surulere II", lgas: ["Surulere"] },
  { state: "Lagos", name: "Oshodi-Isolo I", lgas: ["Oshodi-Isolo"] },
  { state: "Lagos", name: "Mushin II", lgas: ["Mushin"] },
  { state: "Rivers", name: "Port Harcourt II", lgas: ["Port Harcourt"] },
];

/* -------------------------------------------------------------------------- */

/**
 * A reader for `(1, 15, 'Abuja'),` tuples.
 *
 * Written out rather than split on commas, because several names in this dump
 * contain one — "Ado/Obadigbo/Opkokwu" does not, but "Abua/Odual, Ahoada East"
 * would have, and a splitter that is right for the rows you looked at is the
 * kind that fails on the one you did not.
 */
function tuples(sql, table) {
  const start = sql.indexOf(`INSERT INTO \`${table}\``);
  if (start < 0) throw new Error(`The source has no ${table}.`);

  const body = sql.slice(sql.indexOf("VALUES", start) + 6, sql.indexOf(";\n", start));
  const out = [];

  let index = 0;
  while (index < body.length) {
    if (body[index] !== "(") {
      index += 1;
      continue;
    }
    index += 1;

    const fields = [];
    let field = "";
    let quoted = false;

    while (index < body.length) {
      const ch = body[index];
      if (quoted) {
        if (ch === "\\") {
          field += body[index + 1];
          index += 2;
          continue;
        }
        if (ch === "'") {
          quoted = false;
          index += 1;
          continue;
        }
        field += ch;
        index += 1;
        continue;
      }
      if (ch === "'") {
        quoted = true;
        index += 1;
        continue;
      }
      if (ch === ",") {
        fields.push(field.trim());
        field = "";
        index += 1;
        continue;
      }
      if (ch === ")") {
        fields.push(field.trim());
        index += 1;
        break;
      }
      field += ch;
      index += 1;
    }

    out.push(fields);
  }

  return out;
}

const norm = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");

const slug = (value) =>
  String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* -------------------------------------------------------------------------- */

const sql = readFileSync(SOURCE, "utf8");

const stateName = new Map(tuples(sql, "state_tbl").map(([id, name]) => [id, name]));
const senRows = tuples(sql, "senatorial_district_tbl");
const fedRows = tuples(sql, "representative_district_tbl");
const lgaRows = tuples(sql, "lga_tbl");

/**
 * Our own local governments, by state, in the order that gives them a number.
 *
 * ── THE ASSUMPTION, RESTATED WHERE IT IS USED AGAIN ────────────────────────
 * INEC numbers local governments alphabetically within their state, so the
 * nth name in sorted order is local government n. lib/lga-names.js rests on
 * exactly this to turn "07" into "Aba North", and this script has to rest on
 * the same one to turn "Aba North" back into "01/07". If the assumption is
 * ever wrong it is wrong in both directions at once, which is the only way
 * two halves of a product stay honest with each other.
 */
function ourLgas(state) {
  const file = join(ROOT, "public", "geo", "lga", `${state.code}.json`);
  const data = JSON.parse(readFileSync(file, "utf8"));
  return (data.lgas ?? [])
    .map((row) => row.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

const failures = [];

/* name -> "SS/LL", per state, with the aliases applied. */
const codeFor = new Map();
for (const state of STATES) {
  const names = ourLgas(state);
  const byNorm = new Map(names.map((name, index) => [norm(name), `${state.number}/${String(index + 1).padStart(2, "0")}`]));
  const aliases = ALIASES[state.name] ?? {};

  codeFor.set(state.name, (sourceName) => {
    const wanted = aliases[sourceName] ?? sourceName;
    const code = byNorm.get(norm(wanted));
    if (!code) failures.push(`${state.name}: the source names "${sourceName}" and we draw no such local government`);
    return code ?? null;
  });
}

/* ── EVERY LOCAL GOVERNMENT, WITH ITS TWO DISTRICTS ────────────────────────
   Read once into a flat list, because both tables below are built from it and
   reading it twice is two chances to read it differently. ───────────────── */
const senIdByName = new Map(senRows.map(([id, , name]) => [name, id]));

const placed = lgaRows.map(([, stateId, senId, fedId, name]) => {
  const state = stateName.get(stateId);
  const resolve = codeFor.get(state);
  if (!resolve) {
    failures.push(`The source names a state we do not hold: ${state}`);
    return null;
  }

  const moved = REASSIGN_SENATORIAL[`${state}:${name}`];
  if (moved && !senIdByName.has(moved)) failures.push(`Nothing to reassign ${name} to: no district called ${moved}`);

  return { state, name, code: resolve(name), senId: moved ? senIdByName.get(moved) : senId, fedId };
}).filter(Boolean);

/**
 * A district's state, taken from its own local governments.
 *
 * ── WHY NOT THE COLUMN THAT SAYS SO ────────────────────────────────────────
 * The source has one: `state_id` on each district row. It is wrong for Cross
 * River, whose three senatorial districts carry Borno's id — which is how
 * Borno appeared to have six senatorial districts and Cross River none.
 *
 * The composition itself is right in both cases, so the state is derived from
 * the places rather than read from the label. That also means the check below
 * ("three districts per state") is testing the data instead of testing a
 * column that could be wrong in the same direction.
 */
function build(rows, idIndex, { kind }) {
  const out = [];

  for (const [id, , name] of rows) {
    const members = placed.filter((row) => row[idIndex] === id);
    if (!members.length) continue;

    const states = [...new Set(members.map((row) => row.state))];
    if (states.length !== 1) {
      failures.push(`${kind} "${name}" spans ${states.length} states: ${states.join(", ")}`);
      continue;
    }

    const state = STATES.find((row) => row.name === states[0]);
    const lgas = members.map((row) => row.code).filter(Boolean).sort();

    out.push({
      key: `${state.number}/${slug(name)}`,
      name,
      state: state.number,
      stateName: state.name,
      stateCode: state.code,
      lgas,
    });
  }

  return out;
}

const senatorial = build(senRows, "senId", { kind: "Senatorial district" });

const federal = build(
  fedRows.filter(([, stateId, name]) => !DUPLICATE_FEDERAL.has(`${stateName.get(stateId)}:${name}`)),
  "fedId",
  { kind: "Federal constituency" }
);

for (const extra of EXTRA_FEDERAL) {
  const state = STATES.find((row) => row.name === extra.state);
  const resolve = codeFor.get(extra.state);
  federal.push({
    key: `${state.number}/${slug(extra.name)}`,
    name: extra.name,
    state: state.number,
    stateName: state.name,
    stateCode: state.code,
    lgas: extra.lgas.map(resolve).filter(Boolean).sort(),
  });
}

/* ── ONE LOCAL GOVERNMENT, TWO CONSTITUENCIES ──────────────────────────────
   Surulere, Mushin, Oshodi-Isolo, Lagos Island and Port Harcourt each elect
   two members of the House of Representatives, and the line between the two
   constituencies runs between wards inside the local government. This product
   holds no ward boundaries, so it cannot draw that line.

   What it can do is say so. Each of these carries `shared`, and every screen
   that offers one prints what it means: the map and the figures are the whole
   local government, which both constituencies sit inside, and they are not
   the constituency on its own. An unmarked half-truth here would have a room
   reporting one constituency's coverage against both constituencies' booths.
   ─────────────────────────────────────────────────────────────────────────*/
const byMembership = new Map();
for (const row of federal) {
  const key = row.lgas.join(",");
  byMembership.set(key, [...(byMembership.get(key) ?? []), row]);
}
for (const group of byMembership.values()) {
  if (group.length > 1) for (const row of group) row.shared = group.map((one) => one.name);
}

/* -------------------------------------------------------------- the checks */

const check = (ok, message) => {
  if (!ok) failures.push(message);
};

check(senatorial.length === 109, `109 senatorial districts expected, built ${senatorial.length}`);
check(federal.length === 360, `360 federal constituencies expected, built ${federal.length}`);

const senPerState = {};
for (const row of senatorial) senPerState[row.stateName] = (senPerState[row.stateName] ?? 0) + 1;
for (const state of STATES) {
  const held = senPerState[state.name] ?? 0;
  const want = state.code === "FCT" ? 1 : 3;
  check(held === want, `${state.name} has ${held} senatorial districts, expected ${want}`);
}

/* Every local government belongs to exactly one senatorial district, and to
   at least one federal constituency. "At least" rather than "exactly" is the
   whole of the split above: five of them belong to two. */
const senSeen = new Map();
for (const row of senatorial) for (const code of row.lgas) senSeen.set(code, (senSeen.get(code) ?? 0) + 1);

const fedSeen = new Map();
for (const row of federal) for (const code of row.lgas) fedSeen.set(code, (fedSeen.get(code) ?? 0) + 1);

let expected = 0;
for (const state of STATES) expected += ourLgas(state).length;

check(senSeen.size === expected, `${expected} local governments expected in the senatorial map, found ${senSeen.size}`);
check(fedSeen.size === expected, `${expected} local governments expected in the federal map, found ${fedSeen.size}`);
for (const [code, times] of senSeen) {
  check(times === 1, `${code} is in ${times} senatorial districts and must be in one`);
}

if (failures.length) {
  console.error("The constituency tables were not written. What is wrong:\n");
  for (const line of failures) console.error(`  · ${line}`);
  process.exit(1);
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      note:
        "Generated by scripts/build-constituencies.mjs from scripts/sources/nigeria-lga-districts.sql. Do not edit by hand.",
      senatorial: senatorial.sort((a, b) => a.key.localeCompare(b.key)),
      federal: federal.sort((a, b) => a.key.localeCompare(b.key)),
    },
    null,
    1
  )}\n`
);

const shared = federal.filter((row) => row.shared).length;
console.log(
  `Wrote ${senatorial.length} senatorial districts and ${federal.length} federal constituencies ` +
    `over ${expected} local governments (${shared} constituencies share a local government with another).`
);
console.log(`  → ${OUT.replace(`${ROOT}/`, "")}`);
