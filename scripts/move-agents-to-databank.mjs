/**
 * Move Poll360's agents onto Data Bank's agent list, and issue their codes.
 *
 *   npm run agents:move                                      counts only, changes nothing
 *   npm run agents:move -- --commit --out ~/agent-codes.csv  moves them
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHO MOVES
 *
 *  Coordinators who signed themselves up, and polling unit agent accounts an
 *  administrator issued — everyone still able to file, with a phone number
 *  and a polling unit. Approved accounts arrive on the list approved, with a
 *  new code; accounts still waiting arrive waiting. Their old passwords stop
 *  mattering: agents sign in with a code and nothing else.
 *
 *  A coordinator's row here is linked to their place on the list, so the
 *  results they have already filed keep the same author when they next sign
 *  in with their code.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE CODES FILE IS THE MOST SENSITIVE THING THIS WRITES ─────────────────
 * Every code is printed once, into the file named by --out, readable only by
 * you. It is the only copy anywhere. Hand the codes out, then delete it.
 * Running this twice is safe: an agent already on the list is left alone and
 * is not given a second code.
 */
import { writeFileSync } from "node:fs";

import { db } from "../lib/db.js";
import { agentListConfigured, moveAgents } from "../lib/databank-agents.js";

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args[outAt + 1] : null;

const coordinatorRows = await db
  .prepare(
    `SELECT id, name, phone, unit_code, status FROM coordinators
      WHERE status IN ('PENDING', 'ACTIVE') AND disabled_at IS NULL
        AND databank_agent_id IS NULL AND unit_code IS NOT NULL`
  )
  .all();

const userRows = await db
  .prepare(
    `SELECT id, name, phone, scope, status FROM users
      WHERE role = 'PU_AGENT' AND disabled_at IS NULL AND scope IS NOT NULL`
  )
  .all();

const candidates = [
  ...coordinatorRows.map((row) => ({
    ref: `coordinator:${row.id}`,
    fullName: row.name,
    phone: row.phone,
    pollingUnitCode: row.unit_code,
    approved: row.status === "ACTIVE",
  })),
  ...userRows.map((row) => ({
    ref: `user:${row.id}`,
    fullName: row.name,
    phone: row.phone,
    pollingUnitCode: row.scope,
    approved: (row.status ?? "ACTIVE") !== "PENDING",
  })),
];

const movable = candidates.filter((agent) => agent.phone);
const noPhone = candidates.length - movable.length;
const approved = movable.filter((agent) => agent.approved);
const waiting = movable.filter((agent) => !agent.approved);

console.log(`
  Agents found        ${candidates.length}
    self sign-ups     ${coordinatorRows.length}
    issued accounts   ${userRows.length}
  Can be moved        ${movable.length}   (${approved.length} approved, ${waiting.length} waiting)
  Left behind         ${noPhone}   (no phone number — add one, then run this again)
`);

if (!commit) {
  console.log("  A dry run. Nothing was sent. Add --commit --out <file> to move them.\n");
  process.exit(0);
}

if (!out) {
  console.error("  --out <file> is required with --commit: it is where the new codes are written, once.\n");
  process.exit(1);
}
if (!agentListConfigured()) {
  console.error("  Set DATABANK_URL and DATABANK_AGENTS_KEY first.\n");
  process.exit(1);
}

const issued = [];
let already = 0;
let refused = 0;

for (const [group, approve] of [
  [approved, true],
  [waiting, false],
]) {
  for (let at = 0; at < group.length; at += 500) {
    const page = group.slice(at, at + 500);
    const results = await moveAgents({
      approve,
      by: "poll360:move",
      agents: page.map(({ ref, fullName, phone, pollingUnitCode }) => ({ ref, fullName, phone, pollingUnitCode })),
    });

    for (const result of results) {
      const agent = page.find((candidate) => candidate.ref === result.ref);
      if (result.outcome === "refused") refused += 1;
      if (result.outcome === "already") already += 1;

      if (result.id && agent?.ref.startsWith("coordinator:")) {
        await db
          .prepare("UPDATE coordinators SET databank_agent_id = ? WHERE id = ? AND databank_agent_id IS NULL")
          .run(result.id, agent.ref.slice("coordinator:".length));
      }
      if (result.code) {
        issued.push([agent?.fullName ?? "", agent?.pollingUnitCode ?? "", result.code]);
      }
    }
  }
}

const cell = (value) => `"${String(value).replace(/"/g, '""')}"`;
writeFileSync(
  out,
  ["Full name,Polling unit code,Code", ...issued.map((row) => row.map(cell).join(","))].join("\n") + "\n",
  { mode: 0o600 }
);

console.log(`  Moved. ${issued.length} codes issued, ${already} already on the list, ${refused} refused.
  The codes are in ${out} and nowhere else. Hand them out, then delete the file.
`);
process.exit(0);
