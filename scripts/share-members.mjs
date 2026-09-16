/**
 * Send the party's membership counts to Data Bank.
 *
 *   node scripts/share-members.mjs --party ADC
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT CROSSES, AND WHAT CANNOT
 *
 *  Counts against places. A number of members at a polling unit, a ward, a
 *  local government and a state, with the gender and age splits the register
 *  carried.
 *
 *  No names, no telephone numbers, no identity numbers — not because they are
 *  filtered here, but because this product has never held them. The importer
 *  that read the party's registers refuses to write its output if anything
 *  resembling one appears in it, so what is in lib/data was counts before it
 *  was a file. There is nothing here to strip, and the assertion below proves
 *  it again on the way out rather than taking that on faith.
 *
 *  ── AND IT REPLACES RATHER THAN APPENDS ─────────────────────────────────
 *  One import is one party's whole dataset. The hub swaps it atomically, so a
 *  re-run after a fresh register is safe and there is no moment at which the
 *  board shows half of each.
 * ══════════════════════════════════════════════════════════════════════════
 */
import { coverage, loadDetail, registerFor } from "../lib/members.js";
import { STATES } from "../lib/units.js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
    return pairs;
  }, [])
);

const PARTY = String(args.party ?? "ADC").toUpperCase();
const URL_BASE = (process.env.DATABANK_URL ?? process.env.DUMPSITE_URL)?.replace(/\/+$/, "");
const KEY = (process.env.DATABANK_MEMBERS_KEY ?? process.env.DUMPSITE_MEMBERS_KEY) ?? (process.env.DATABANK_API_KEY ?? process.env.DUMPSITE_API_KEY);

if (!URL_BASE || !KEY) {
  console.error(
    "DATABANK_URL and DATABANK_MEMBERS_KEY (or DATABANK_API_KEY) must both be set.\n" +
      "The key needs the members:write scope, which nothing else in this product uses."
  );
  process.exit(1);
}

const nameOf = new Map(STATES.filter((s) => s.code).map((s) => [s.code, s.name]));

const places = [];
let states = 0;

for (const row of coverage().filter((entry) => entry.party === PARTY)) {
  /* The ward and booth detail lives in a per-state file that is fetched on
     demand — see the head of lib/members.js. A share that skipped this would
     send thirty-seven state totals and call it a national dataset. */
  await loadDetail(PARTY, row.stateCode);
  const register = registerFor(PARTY, row.stateCode);
  if (!register) {
    console.error(`  ${row.stateCode}: detail would not load; refusing a partial share.`);
    process.exit(1);
  }

  const stateName = nameOf.get(row.stateCode) ?? register.state ?? row.stateCode;
  states += 1;

  /* ── THE STATE'S SPLIT IS ROLLED UP, NOT READ ──────────────────────────
     The registers carry a gender and age split against every local government
     and against most wards, and none against the state itself. Sending the
     state row with `split(register)` therefore sent nulls — and a board drawing
     an empty Male column for all thirty-seven states, with the figures sitting
     one level down, hides information it holds.

     So it is summed from the local governments. Null only where every one of
     them was null, which keeps "the source never said" distinguishable from
     "the source said nought". */
  places.push({
    stateCode: row.stateCode,
    stateName,
    tier: "STATE",
    members: register.members ?? 0,
    ...rollUp(Object.values(register.lgas ?? {})),
  });

  for (const [lgaName, lga] of Object.entries(register.lgas ?? {})) {
    places.push({
      stateCode: row.stateCode,
      stateName,
      lga: lgaName,
      tier: "LGA",
      members: lga.members ?? 0,
      ...split(lga),
    });

    for (const [wardName, ward] of Object.entries(lga.wards ?? {})) {
      places.push({
        stateCode: row.stateCode,
        stateName,
        lga: lgaName,
        ward: wardName,
        tier: "WARD",
        members: ward.members ?? 0,
        ...split(ward),
      });

      for (const [unitName, count] of Object.entries(ward.units ?? {})) {
        places.push({
          stateCode: row.stateCode,
          stateName,
          lga: lgaName,
          ward: wardName,
          unit: unitName,
          tier: "UNIT",
          members: count ?? 0,
        });
      }
    }
  }

  process.stderr.write(`  ${row.stateCode} ${stateName}\n`);
}

/**
 * The split a place does not carry, summed from the places inside it.
 *
 * Returns null for a field where no child carried it, rather than nought: a
 * state whose registers never recorded gender has not recorded nought women.
 */
function rollUp(children) {
  const fields = ["male", "female", "ageU18", "age18to25", "age26to35", "age36to50", "ageOver50"];
  const total = Object.fromEntries(fields.map((field) => [field, null]));

  for (const child of children) {
    const parts = split(child);
    for (const field of fields) {
      if (parts[field] === null || parts[field] === undefined) continue;
      total[field] = (total[field] ?? 0) + parts[field];
    }
  }
  return total;
}

/** The gender and age split, where the tier carried one. */
function split(place) {
  const gender = place.gender ?? {};
  const ages = place.ages ?? {};
  return {
    male: gender.male ?? null,
    female: gender.female ?? null,
    ageU18: ages.u18 ?? null,
    age18to25: ages["18_25"] ?? null,
    age26to35: ages["26_35"] ?? null,
    age36to50: ages["36_50"] ?? null,
    ageOver50: ages.o50 ?? null,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE ASSERTION THAT RUNS BEFORE ANYTHING LEAVES THE BUILDING

   The importer already guarantees this and the guarantee is worth re-checking
   at the boundary, because this is the last moment the data is ours. A name or
   a telephone number reaching the wire cannot be recalled from the other side.

   Every value is a count or a place name. An eleven-digit number is a NIN or a
   Nigerian mobile; either one here means something upstream changed and this
   run stops rather than publishing it.
   ══════════════════════════════════════════════════════════════════════════ */
const suspect = [];
for (const place of places) {
  for (const [field, value] of Object.entries(place)) {
    if (typeof value !== "string") continue;
    if (/\b\d{10,11}\b/.test(value)) suspect.push(`${place.stateCode} ${field}: ${value}`);
  }
}

if (suspect.length) {
  console.error(
    `REFUSED. ${suspect.length} value(s) look like a telephone number or a NIN:\n  ` +
      suspect.slice(0, 5).join("\n  ")
  );
  process.exit(1);
}

const members = places
  .filter((place) => place.tier === "STATE")
  .reduce((sum, place) => sum + place.members, 0);

console.error(
  `\n${places.length.toLocaleString("en-NG")} places · ${members.toLocaleString("en-NG")} members · ` +
    `${states} states\nSending to ${URL_BASE} …`
);

const response = await fetch(`${URL_BASE}/api/v1/members`, {
  method: "POST",
  headers: { "x-databank-key": KEY, "x-dumpsite-key": KEY, "content-type": "application/json" },
  body: JSON.stringify({
    party: PARTY,
    source: `Poll360 · ${states} state registers`,
    places,
  }),
});

const text = await response.text();
let parsed = null;
try {
  parsed = JSON.parse(text);
} catch {
  /* Left null: a proxy serving an HTML error page should read as "the hub said
     something we could not parse", not as a JSON syntax error. */
}

if (!response.ok) {
  console.error(`\nThe hub refused it (${response.status}): ${parsed?.message ?? text.slice(0, 300)}`);
  process.exit(1);
}

console.log(
  `\nStored. batch ${parsed?.batch ?? "?"} · ${parsed?.places?.toLocaleString("en-NG") ?? "?"} places\n` +
    `It replaced ${parsed?.replaced ?? "the previous import"}.`
);
