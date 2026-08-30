/**
 * Four Adamawa campaigns, and the ground each of them stands on.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT IT MAKES
 *
 *  One election project scoped to Adamawa, the declared results this
 *  repository actually holds for that state, and four accounts — one for a
 *  governorship campaign, one for a senatorial campaign, one for a House of
 *  Representatives campaign and one for a local government campaign.
 *
 *  Each account is pinned to its own contest and its own territory, so four
 *  people sign in to the same project and each of them sees exactly their own
 *  ground: the whole state, one of three senatorial districts, one of eight
 *  federal constituencies, one of 21 local governments. Nothing outside it,
 *  and the coverage percentage on each screen is measured against that
 *  ground's booths rather than the country's.
 *
 *    node --env-file=.env.local scripts/seed-adamawa.mjs            # dry run
 *    node --env-file=.env.local scripts/seed-adamawa.mjs --commit
 *
 *  ── WHY THE PROJECT IS NAMED 2023 ───────────────────────────────────────
 *  The figures loaded are the last declared results, and the divergence room
 *  holds our returns against the declared figures of the same project. A 2027
 *  return measured against a 2023 declaration is a divergence manufactured by
 *  the filing rather than found by it. So the year on the project is the year
 *  the figures belong to; a campaign fighting the next one starts a new
 *  project and these stay where they are, one switch away.
 *
 *  ── AND WHY THE PASSWORDS ARE PRINTED AND NOT STORED ────────────────────
 *  Generated here, hashed immediately, shown once. Nothing in this file is a
 *  default — a seed script with a password in it is how a product ends up
 *  with the same credential working a year later. Losing one means running
 *  this again for that account.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { elections } from "../lib/elections.js";
import { declared, users } from "../lib/db.js";
import { hashPassword, passphrase } from "../lib/password.js";
import { resolveTerritory, lgasOf } from "../lib/constituencies.js";
import { describeTerritory, levelForRace } from "../lib/territory.js";
import { raceLabel } from "../lib/races.js";
import { ADAMAWA, DECLARED, SEATS, LOCAL_GOVERNMENT } from "../lib/adamawa.js";

const commit = process.argv.includes("--commit");

const TITLE = `Adamawa State, 2023`;

/* ── THE FOUR CAMPAIGNS ────────────────────────────────────────────────────
   A campaign is a situation room: it runs its own agents, reads its own
   incident feed in full, and holds its count against what is declared. That
   is the role, not "broadcaster", which reads and never files.

   The district, constituency and local government named here are the ones a
   Yola-based campaign would most likely want to look at first, and they are
   the easiest thing in this file to change: every one is a key from
   public/geo/constituencies.json and any of the 3, 8 or 21 will work. ────── */
const CAMPAIGNS = [
  {
    slug: "governorship",
    name: "Adamawa governorship campaign",
    email: "governorship@adamawa.poll360.ng",
    race: "GOVERNORSHIP",
    territory: `STATE:${ADAMAWA.number}`,
  },
  {
    slug: "senate",
    name: "Adamawa Central senatorial campaign",
    email: "senate.central@adamawa.poll360.ng",
    race: "SENATE",
    territory: "SENATORIAL:02/adamawa-central",
  },
  {
    slug: "reps",
    name: "Yola North/Yola South/Girei campaign",
    email: "reps.yola@adamawa.poll360.ng",
    race: "REPRESENTATIVES",
    territory: "FEDERAL:02/yola-north-yola-south-girei",
  },
  {
    slug: "local",
    name: "Yola North chairmanship campaign",
    email: "chairman.yolanorth@adamawa.poll360.ng",
    race: "LGA",
    /* Yola North, the state capital's own council. 02/20 in the register:
       twentieth local government of the second state. */
    territory: "LGA:02/20",
  },
];

/* ------------------------------------------------------------------ checks */

/**
 * Nothing is written until every place named resolves and every pairing holds.
 *
 * ── WHY A SCRIPT CHECKS WHAT THE FORM ALREADY CHECKS ───────────────────────
 * The approval screen refuses a contest and a territory that do not go
 * together. A script bypasses the screen, and an account seeded with a
 * senatorial district against a governorship would hold a third of the state
 * it was meant to hold, silently, with every figure on its dashboard
 * correctly formatted. So the same rule is applied here rather than assumed.
 */
const problems = [];

for (const campaign of CAMPAIGNS) {
  const place = resolveTerritory(campaign.territory);
  if (!place) {
    problems.push(`${campaign.slug}: ${campaign.territory} names no place we hold`);
    continue;
  }
  if (place.level !== levelForRace(campaign.race)) {
    problems.push(
      `${campaign.slug}: a ${raceLabel(campaign.race)} is not counted over ${describeTerritory(place)}`
    );
  }
  if (place.stateNumber && place.stateNumber !== ADAMAWA.number) {
    problems.push(`${campaign.slug}: ${describeTerritory(place)} is not in Adamawa`);
  }
  campaign.place = place;
}

for (const seat of SEATS) {
  if (!resolveTerritory(seat.territory)) {
    problems.push(`seat "${seat.place}": ${seat.territory} names no place we hold`);
  }
}

if (problems.length) {
  console.error("\nNothing was written. What is wrong:\n");
  for (const line of problems) console.error(`  · ${line}`);
  process.exit(1);
}

/* ------------------------------------------------------------- the dry run */

console.log(`\n${ADAMAWA.name} — ${ADAMAWA.lgas} local governments, ` +
  `${ADAMAWA.senatorialDistricts} senatorial districts, ` +
  `${ADAMAWA.federalConstituencies} federal constituencies, ${ADAMAWA.wards} wards.\n`);

console.log("Declared figures to load:");
for (const row of DECLARED) {
  const total = Object.values(row.votes).reduce((a, b) => a + b, 0);
  console.log(
    `  ${raceLabel(row.race).padEnd(14)} ${row.declaredOn}  ${row.winner.padEnd(4)} ` +
      `${total.toLocaleString().padStart(9)} votes  (${row.candidate})`
  );
}

console.log("\nSeats held, for the ground under a count that has not started:");
for (const seat of SEATS) {
  console.log(`  ${seat.party.padEnd(4)} ${seat.place.padEnd(30)} ${seat.holder}`);
}
console.log(
  `  ${LOCAL_GOVERNMENT.chairmanships.PDP === LOCAL_GOVERNMENT.chairmanships.total ? "PDP " : "    "}` +
    `all ${LOCAL_GOVERNMENT.chairmanships.total} chairmanships and ` +
    `${LOCAL_GOVERNMENT.wards.total} wards, ${LOCAL_GOVERNMENT.votesOn} ` +
    `(no vote totals published)`
);

console.log("\nAccounts to issue:");
for (const campaign of CAMPAIGNS) {
  const lgas = lgasOf(campaign.place);
  console.log(
    `  ${raceLabel(campaign.race).padEnd(18)} ${describeTerritory(campaign.place).padEnd(34)} ` +
      `${String(lgas.length).padStart(2)} local government${lgas.length === 1 ? "" : "s"}`
  );
  console.log(`    ${lgas.map((row) => row.name).join(", ")}`);
}

if (!commit) {
  console.log("\nNothing written. Re-run with --commit.\n");
  process.exit(0);
}

/* -------------------------------------------------------------- the commit */

/* Found by title rather than created blindly, so running this twice does not
   leave two Adamawas. */
const existing = (await elections.list()).find((row) => row.title === TITLE);

const project =
  existing ??
  (await elections.create({
    title: TITLE,
    /* The headline contest of the day this project is named for. Every account
       below names its own, and the accounts win: see lib/viewing.js. */
    kind: "GOVERNORSHIP",
    votesOn: new Date("2023-03-18T00:00:00Z"),
    note:
      "Adamawa State. Declared results transcribed from INEC and, for the local government " +
      "elections, from ADSIEC. Not a live feed. Verify before broadcast. " +
      "Senate and House of Representatives seats are recorded by holder and party only: no vote " +
      "totals for those contests were published in a form this repository could reach.",
    scopeStates: [ADAMAWA.code],
  }));

console.log(`\n${existing ? "Using existing" : "Created"} project ${project.id} — ${TITLE}`);

/* Every contest goes in on its own call, because `declared.save` takes one
   position per batch — a night is several counts and they are never summed. */
let written = 0;
for (const row of DECLARED) {
  const total = Object.values(row.votes).reduce((a, b) => a + b, 0);
  const result = await declared.save({
    electionId: project.id,
    race: row.race,
    source: "SEED",
    rows: [
      {
        level: row.level,
        key: row.key,
        stateNumber: ADAMAWA.number,
        votes: row.votes,
        total,
        /* The same figure, because what was stated is the sum of the parties
           we hold. Where that is short of the declared turnout, the note says
           so rather than the difference being spread across parties. */
        statedTotal: total,
        registered: row.registered,
        accredited: row.accredited,
        rejected: row.rejected,
        note: `${row.candidate} (${row.winner}) declared ${row.declaredOn}. ${row.note} ${row.source}`,
      },
    ],
  });
  written += result.written;
}

console.log(`Loaded ${written} declared figures.`);

/* ── THE ACCOUNTS ─────────────────────────────────────────────────────────
   `users.upsert` finds by email, so re-running this resets the password of an
   existing campaign account rather than creating a second one — which is also
   how a lost credential is replaced. */
const issued = [];
for (const campaign of CAMPAIGNS) {
  const password = passphrase();
  const user = await users.upsert({
    name: campaign.name,
    email: campaign.email,
    phone: null,
    role: "SITUATION_ROOM",
    race: campaign.race,
    territory: campaign.territory,
    passwordHash: await hashPassword(password),
  });
  issued.push({ campaign, user, password });
}

console.log("\n══ FOUR LOGINS, SHOWN ONCE ═══════════════════════════════════════════\n");
for (const { campaign, password } of issued) {
  console.log(`  ${raceLabel(campaign.race)} — ${describeTerritory(campaign.place)}`);
  console.log(`    ${campaign.email}`);
  console.log(`    ${password}`);
  console.log("");
}
console.log("  Sign in at /login. Each lands in its own situation room, pinned to its");
console.log("  own contest and its own ground.\n");
console.log("  Passwords are hashed and cannot be shown again. Re-run this script for");
console.log("  one that is lost; it resets rather than duplicating.\n");
