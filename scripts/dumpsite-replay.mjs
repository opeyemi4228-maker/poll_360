#!/usr/bin/env node
/**
 * Send the hub what it missed.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS SCRIPT IS THE OTHER HALF OF FIRE-AND-FORGET
 *
 *  Poll360 delivers every registration, sheet and figure to DumpSite, and it
 *  does so without ever putting that delivery on the path between an agent and
 *  a saved return — a hub having a bad night must not cost a polling unit its
 *  count. See lib/dumpsite.js.
 *
 *  That is only honest because of this. Anything that does not land is kept in
 *  `dumpsite_outbox` with the reason, and this sends it again. Without a
 *  replay, "fire and forget" is just "forget", and a hub that quietly missed
 *  four thousand returns on the one night that mattered is worse than no hub
 *  at all.
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   node --env-file=.env.local scripts/dumpsite-replay.mjs
 *   node --env-file=.env.local scripts/dumpsite-replay.mjs --limit 500
 *
 * ── IT IS SAFE TO RUN TWICE ────────────────────────────────────────────────
 * Every item carries the external id Poll360 gave it, and DumpSite dedupes on
 * that, so a row sent twice is recorded once and marked DUPLICATE. Which means
 * the honest failure mode of this script is doing nothing, never doubling a
 * return — and it can be put on a timer without anybody watching it.
 */

import { sql } from "../lib/sql.js";
import { configured } from "../lib/dumpsite.js";

const limit = Number(process.argv[process.argv.indexOf("--limit") + 1]) || 200;

if (!configured()) {
  console.error(
    "No hub is configured. Set DUMPSITE_URL and DUMPSITE_API_KEY, then run this again."
  );
  process.exit(1);
}

const endpoint = `${process.env.DUMPSITE_URL.replace(/\/$/, "")}/api/intake`;
const key = process.env.DUMPSITE_API_KEY;

const waiting = await sql`
  SELECT id, kind, external_id, body, tries
  FROM dumpsite_outbox
  WHERE delivered_at IS NULL
  ORDER BY created_at ASC
  LIMIT ${limit}
`;

if (!waiting.length) {
  console.log("Nothing waiting. The hub has everything.");
  process.exit(0);
}

console.log(`${waiting.length} waiting.`);

let sent = 0;
let failed = 0;

for (const row of waiting) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-dumpsite-key": key },
      body: row.body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      failed += 1;
      await sql`
        UPDATE dumpsite_outbox
        SET tries = tries + 1, why = ${`http-${response.status}`}
        WHERE id = ${row.id}
      `;
      continue;
    }

    /* Marked delivered rather than deleted. "We received this and forwarded
       it" is itself a fact somebody may need to prove, and the row is the
       only place it is written down. */
    await sql`
      UPDATE dumpsite_outbox
      SET delivered_at = now(), tries = tries + 1, why = NULL
      WHERE id = ${row.id}
    `;
    sent += 1;
  } catch (error) {
    failed += 1;
    await sql`
      UPDATE dumpsite_outbox
      SET tries = tries + 1, why = ${error?.name ?? "failed"}
      WHERE id = ${row.id}
    `;
    /* Stop on the first unreachable rather than grinding through two hundred
       identical timeouts: the hub is down, and the rows are safe where they
       are until it is not. */
    if (error?.name === "TypeError" || error?.name === "TimeoutError") {
      console.error(`The hub is not answering (${error.name}). Stopping; nothing is lost.`);
      break;
    }
  }
}

console.log(`${sent} delivered, ${failed} still waiting.`);
process.exit(0);
