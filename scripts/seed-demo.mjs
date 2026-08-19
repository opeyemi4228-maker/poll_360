/**
 * Demo data for the coordinator watch and the situation stream.
 *
 * Creates a plausible slice of an election day: forty polling unit
 * coordinators spread across the country, most of whom have filed with a real
 * position, a few who have not reported at all, two whose device reported from
 * well away from their unit, and a stream of incidents of the kinds Nigerian
 * elections actually produce.
 *
 * Everything here is clearly demonstration data, the accounts use example.ng
 * addresses and a shared password, and it is idempotent: run it again and it
 * updates the same rows rather than growing a second set.
 *
 *   node scripts/seed-demo.mjs
 *   node scripts/seed-demo.mjs --clear     remove it again
 */

import { randomUUID } from "node:crypto";

import { db, users, incidents, media } from "../lib/db.js";
import { hashPassword } from "../lib/password.js";
import { seal } from "../lib/crypto.js";

const PASSWORD = "poll360-field-agent";

/* Real states, real approximate coordinates for their principal town, so the
   dots land where those places are. Coordinators are scattered around them. */
const PLACES = [
  ["01", "Abia", 5.53, 7.49], ["09", "Borno", 11.83, 13.15], ["12", "Enugu", 6.44, 7.5],
  ["15", "Jigawa", 12.0, 9.35], ["17", "Kano", 12.0, 8.52], ["19", "Katsina", 12.99, 7.6],
  ["21", "Kogi", 7.8, 6.74], ["23", "Lagos", 6.45, 3.39], ["25", "Nasarawa", 8.54, 7.71],
  ["26", "Niger", 9.62, 6.55], ["28", "Ondo", 7.25, 5.2], ["30", "Oyo", 7.38, 3.9],
  ["32", "Plateau", 9.9, 8.89], ["33", "Rivers", 4.82, 7.03], ["36", "Zamfara", 12.17, 6.66],
  ["37", "FCT", 9.06, 7.49],
];

const NAMES = [
  "Chidinma Okeke", "Ibrahim Sule", "Folasade Adeyinka", "Emeka Nwachukwu", "Aisha Bello",
  "Tunde Bakare", "Ngozi Eze", "Musa Danjuma", "Blessing Ekanem", "Yusuf Aliyu",
  "Adaeze Obi", "Segun Ogundipe", "Halima Yakubu", "Chinedu Aneke", "Bukola Adesina",
  "Sani Mohammed", "Grace Etim", "Kelechi Onu", "Zainab Lawal", "Oluwaseun Balogun",
];

const INCIDENTS = [
  ["BVAS not reading fingerprints", "SERIOUS", "Machine has failed on roughly one voter in four since it opened. Officials are falling back to the register but the queue is not moving."],
  ["Materials arrived late", "SERIOUS", "Ballot papers and the result sheet reached the unit at 10:20, more than two hours after accreditation was meant to start."],
  ["Queue still long at close", "SERIOUS", "Around three hundred people still waiting. Presiding officer has confirmed everyone in the queue at 14:30 will be allowed to vote."],
  ["Party agents denied entry", "CRITICAL", "Two accredited agents were turned away by men who are not INEC staff. Police present but not intervening."],
  ["Ballot box interfered with", "CRITICAL", "A group attempted to remove the box during sorting. Voting suspended, box is secured, awaiting the collation officer."],
  ["Voters being intimidated", "CRITICAL", "Men stationed at the approach road are questioning voters before they reach the unit."],
  ["Power failure during count", "INFO", "Counting continued by phone torch. No dispute over the figures."],
  ["Rain disrupted accreditation", "INFO", "Voting paused for about forty minutes. Materials were kept dry, queue held."],
  ["Result sheet torn", "SERIOUS", "The EC8A tore along the fold during completion. Presiding officer has initialled both parts and photographed them together."],
  ["Overvoting suspected", "CRITICAL", "Ballots in the box appear to exceed the accreditation figure. Recorded and reported before sorting continued."],
  ["Unit relocated without notice", "SERIOUS", "The booth was moved about four hundred metres to a school compound. Voters are still arriving at the old location."],
  ["Agent refused a copy of the sheet", "SERIOUS", "Presiding officer initially declined to issue the EC8A copy. Resolved after the supervisor attended."],
  ["Card reader battery failed", "INFO", "Replaced from the reserve set after roughly twenty minutes."],
  ["Underage voters in the queue", "CRITICAL", "Several people who appear well under eighteen were queuing with cards. Raised with the presiding officer."],
  ["Counting completed peacefully", "INFO", "All party agents present signed the sheet. No objections recorded."],
  ["Vote buying near the unit", "CRITICAL", "Money being handed over about fifty metres from the entrance, in view of the queue."],
  ["Late arrival of security", "INFO", "No police present until 09:40. Nothing occurred in the interim."],
  ["Wrong ballot papers delivered", "SERIOUS", "Papers for a neighbouring constituency were in the pack. Corrected before accreditation began."],
];

const clearing = process.argv.includes("--clear");

if (clearing) {
  const rows = db.prepare("SELECT id FROM users WHERE email LIKE '%@example.ng'").all();
  for (const row of rows) {
    db.prepare("DELETE FROM results WHERE submitted_by = ?").run(row.id);
    db.prepare("DELETE FROM incidents WHERE reported_by = ?").run(row.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.id);
    db.prepare("DELETE FROM users WHERE id = ?").run(row.id);
  }
  console.log(`Removed ${rows.length} demonstration coordinators and their data.`);
  process.exit(0);
}

const hash = await hashPassword(PASSWORD);
let made = 0;
const agents = [];

for (const [stateCode, stateName, lat, lon] of PLACES) {
  for (let n = 1; n <= 3; n += 1) {
    const unit = `${stateCode}/${String(1 + ((n * 7) % 20)).padStart(2, "0")}/${String(1 + ((n * 3) % 11)).padStart(2, "0")}/${String(n * 17).padStart(3, "0")}`;
    const name = NAMES[(made + n) % NAMES.length];
    const email = `${stateCode}${n}@example.ng`;

    const user = users.upsert({ name, email, phone: null, passwordHash: hash, role: "PU_AGENT", scope: unit });
    agents.push({ ...user, stateCode, stateName, lat, lon, n });
    made += 1;
  }
}

/* Most file. Two thirds land at the unit, some nearby, two well away, and a
   handful never report at all, which is the state the watch exists to show. */
let filed = 0;
db.prepare("DELETE FROM results WHERE unit_code LIKE '%/%'").run();

for (const [index, agent] of agents.entries()) {
  if (index % 7 === 3) continue; // never reported

  const far = index % 17 === 5;
  const near = index % 5 === 2;
  const drift = far ? 0.045 : near ? 0.008 : 0.0009;

  const lat = agent.lat + (((index * 37) % 100) / 100 - 0.5) * drift * 2;
  const lon = agent.lon + (((index * 53) % 100) / 100 - 0.5) * drift * 2;
  const distance = Math.round(Math.hypot(lat - agent.lat, lon - agent.lon) * 111_000);

  const registered = 600 + ((index * 47) % 700);
  const accredited = Math.round(registered * (0.28 + ((index * 13) % 30) / 100));
  const votes = {
    APC: Math.round(accredited * (0.2 + ((index * 7) % 25) / 100)),
    PDP: Math.round(accredited * (0.18 + ((index * 11) % 22) / 100)),
    LP: Math.round(accredited * (0.15 + ((index * 5) % 28) / 100)),
    NNPP: Math.round(accredited * (0.03 + ((index * 3) % 9) / 100)),
  };
  /* Cast plus rejected must not exceed accredited, the same rule the filing
     form enforces. The first version of this seed set cast == accredited and
     then added rejected ballots on top, which made every one of these returns
     arithmetically impossible. The integrity screen caught it, which is a
     better advertisement for the screen than for the seed. */
  const rejected = 3 + (index % 9);
  const room = accredited - rejected;
  const cast = Object.values(votes).reduce((a, b) => a + b, 0);
  if (cast > room) {
    const scale = room / cast;
    for (const key of Object.keys(votes)) votes[key] = Math.floor(votes[key] * scale);
  }

  const minutesAgo = 20 + index * 11;
  db.prepare(
    `INSERT INTO results (id, unit_code, state_code, registered, accredited, rejected, votes,
                          status, lat, lon, accuracy, distance_m, submitted_by, submitted_at)
     VALUES (??????????????)`
  ).run(
    randomUUID(), agent.scope, agent.stateCode, registered, accredited, 3 + (index % 9),
    JSON.stringify(votes), index % 6 === 0 ? "VERIFIED" : "SUBMITTED",
    lat, lon, 6 + (index % 14), distance, agent.id,
    new Date(Date.now() - minutesAgo * 60_000).toISOString().replace("T", " ").slice(0, 19)
  );
  filed += 1;
}

/* The stream. Staggered across the last few hours so "12m ago" varies. */
db.prepare("DELETE FROM incidents").run();
for (const [index, [kind, severity, detail]] of INCIDENTS.entries()) {
  const agent = agents[(index * 3) % agents.length];
  const id = randomUUID();
  db.prepare(
    `INSERT INTO incidents (id, unit_code, state_code, kind, severity, detail_sealed, reported_by, created_at)
     VALUES (????????)`
  ).run(
    id, agent.scope, agent.stateCode, kind, severity, seal(detail), agent.id,
    new Date(Date.now() - (8 + index * 17) * 60_000).toISOString().replace("T", " ").slice(0, 19)
  );
}

console.log(`\nDemonstration data ready`);
console.log(`  ${agents.length} coordinators (password: ${PASSWORD})`);
console.log(`  ${filed} have filed with a position, ${agents.length - filed} have not reported`);
console.log(`  ${INCIDENTS.length} incidents in the stream`);
console.log(`\n  Remove with: node scripts/seed-demo.mjs --clear\n`);
