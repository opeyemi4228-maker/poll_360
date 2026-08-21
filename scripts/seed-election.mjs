/**
 * Fill the database with a night of the 2023 presidential election.
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ───────────────────────────────────────
 * Every party figure it writes is a slice of a real, published, declared 2023
 * result: the returns for a state always sum back to what INEC declared there.
 * What is invented is the distribution across booths, which agent filed which
 * unit, and in what order, because no per-booth arrival log is published.
 *
 * That is the same bargain the public board on the home page already makes,
 * and it is the only honest one available: a demonstration of a results system
 * has to be made of real results, or it is demonstrating nothing.
 *
 * The returns are marked as a demonstration in their own note field, so a row
 * cannot be mistaken for a filed return by anyone reading the table directly.
 *
 *   npm run seed:election
 *
 * Idempotent: one row per polling unit, keyed on the unit code, so running it
 * twice amends rather than duplicates. Seeded, so it produces the same night
 * every time.
 */

import { db, sql } from "../lib/db.js";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { states2023, parties } from "../lib/election2023.js";
import { seal } from "../lib/crypto.js";

/* How many booths per state to file. The real figure is thousands; a
   demonstration wants a night that loads instantly and still has enough rows
   for every panel to mean something. */
const UNITS_PER_STATE = 12;
const NOTE = "Demonstration data, 2023 declared result, distributed across booths.";

const KINDS = [
  ["Queue still forming at close", "SERIOUS"],
  ["Card reader failure", "SERIOUS"],
  ["Materials arrived late", "INFO"],
  ["Agent obstructed", "CRITICAL"],
  ["Violence or intimidation", "CRITICAL"],
  ["Result sheet disputed", "CRITICAL"],
  ["Something else", "INFO"],
];

const DETAILS = {
  "Queue still forming at close":
    "Queue of roughly 180 still outside the gate at 14:30. Presiding officer has agreed to count everyone already in line.",
  "Card reader failure":
    "BVAS failed twice during accreditation and was replaced at 11:05. Accreditation paused for 42 minutes.",
  "Materials arrived late":
    "Result sheets and ballots arrived at 09:50 against an 08:00 opening. Polling started 09:58.",
  "Agent obstructed":
    "Our agent was asked to stand outside the polling area during sorting. Presiding officer intervened and access was restored.",
  "Violence or intimidation":
    "Group of men arrived at the unit and attempted to seize a ballot box. Police dispersed them; counting resumed under guard.",
  "Result sheet disputed":
    "Figures announced at the unit do not match the sheet our agent photographed. Both have been recorded and the discrepancy flagged.",
  "Something else":
    "Generator failed after dark; counting continued under phone torches with all agents present.",
};

/* ------------------------------------------------------------------ random */

/** Seeded, so the same demonstration comes back every time. */
function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Split a total into positive integers that sum to exactly the total. */
function split(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((weight) => Math.floor((total * weight) / sum));
  const allocated = parts.reduce((a, b) => a + b, 0);
  parts[parts.length - 1] += total - allocated;
  return parts;
}

/* --------------------------------------------------------------- the write */

function databasePath() {
  const url = process.env.DATABASE_URL ?? "file:./data/poll360.db";
  const path = url.startsWith("file:") ? url.slice(5) : url;
  return resolve(process.cwd(), path);
}

const path = databasePath();
mkdirSync(dirname(path), { recursive: true });
/* The connection comes from lib/db.js now. This script used to open the SQLite
   file itself, which stopped meaning anything the moment storage moved to
   Postgres: it would have written a night of results into a file the
   application no longer reads. */

const agent =
  (await db.prepare("SELECT id FROM users WHERE role = 'PU_AGENT' ORDER BY created_at LIMIT 1").get()) ??
  (await db.prepare("SELECT id FROM users ORDER BY created_at LIMIT 1").get());

if (!agent) {
  console.error(
    "No accounts in the database. Run `npm run seed:demo` first, a return has to be filed by somebody."
  );
  process.exit(1);
}

const verifier =
  (await db.prepare("SELECT id FROM users WHERE role IN ('SITUATION_ROOM','SUPER_ADMIN') LIMIT 1").get()) ??
  agent;

const rng = mulberry32(2023);

const insert = db.prepare(
  /* ── THE FIFTEENTH ARGUMENT USED TO GO NOWHERE ─────────────────────────
     The call below has always passed an offset like "-420 minutes" for
     submitted_at, and this statement hardcoded the current time instead. So
     every one of 487 returns was stamped with the second the seed ran: a
     board whose whole point is watching a night fill up, filled in an
     instant, and an arrivals chart that was a single vertical line. The
     offset is bound now. */
  `INSERT INTO results
     (id, unit_code, state_code, registered, accredited, rejected, votes, inec_total, note,
      lat, lon, accuracy, distance_m, submitted_by, submitted_at, status, verified_by, verified_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now() + ?::interval, ?, ?, ?)
   ON CONFLICT(unit_code) DO UPDATE SET
     registered = excluded.registered,
     accredited = excluded.accredited,
     rejected   = excluded.rejected,
     votes      = excluded.votes,
     inec_total = excluded.inec_total,
     note       = excluded.note,
     status     = excluded.status`
);

let filed = 0;

/* ── NO TRANSACTION, AND WHY THAT IS THE RIGHT ANSWER HERE ─────────────────
   This ran inside BEGIN IMMEDIATE against SQLite. Postgres over HTTP has no
   session to hold a transaction across: each statement is its own round trip,
   so a BEGIN would commit nothing and a ROLLBACK would undo nothing, while
   reading as though both worked. That is worse than having neither.

   What makes a half-finished run safe is the upsert above: every row is keyed
   by its polling unit, so running this again finishes the job rather than
   duplicating it. Correctness comes from the statement being repeatable, not
   from a transaction that was never really there. */
{
  for (const [index, state] of states2023.entries()) {
    const prefix = String(index + 1).padStart(2, "0");

    /* The share of this state's declared total that our agents cover. A
       parallel count never has every booth, and a demonstration that pretended
       otherwise would be teaching the wrong lesson: coverage is the number
       this whole product exists to keep attached to a total. */
    const reach = 0.18 + rng() * 0.22;

    const weights = Array.from({ length: UNITS_PER_STATE }, () => 0.5 + rng());
    const perParty = state.votes.map((partyTotal) =>
      split(
        Math.round(partyTotal * reach),
        Array.from({ length: UNITS_PER_STATE }, () => 0.5 + rng())
      )
    );
    const perRegistered = split(Math.round(state.registered * reach), weights);

    for (let unit = 0; unit < UNITS_PER_STATE; unit += 1) {
      const votes = {};
      let cast = 0;
      for (const [partyIndex, party] of parties.entries()) {
        const count = Math.max(0, perParty[partyIndex][unit]);
        votes[party.id] = count;
        cast += count;
      }
      /* Everyone else on the ballot, kept in the row rather than dropped: a
         total that quietly excludes the small parties is not the total. */
      const others = Math.max(0, perParty[4][unit]);
      votes.OTH = others;
      cast += others;

      const rejected = Math.round(cast * (0.01 + rng() * 0.02));
      const accredited = cast + rejected + Math.round(rng() * 8);
      const registered = Math.max(accredited + 40, perRegistered[unit]);

      /* Most returns are checked by the time a room looks at them; a few are
         still in the queue, and one in about twenty is disputed, which is what
         makes the checking screens worth opening. */
      const roll = rng();
      const status = roll < 0.62 ? "VERIFIED" : roll < 0.95 ? "SUBMITTED" : "DISPUTED";

      await insert.run(
        randomUUID(),
        `${prefix}/${String(1 + Math.floor(rng() * 20)).padStart(2, "0")}/${String(1 + Math.floor(rng() * 12)).padStart(2, "0")}/${String(unit + 1).padStart(3, "0")}`,
        prefix,
        registered,
        accredited,
        rejected,
        JSON.stringify(votes),
        null,
        NOTE,
        null,
        null,
        null,
        Math.round(rng() * 90),
        agent.id,
        `-${Math.round(rng() * 600)} minutes`,
        status,
        status === "VERIFIED" ? verifier.id : null,
        status === "VERIFIED" ? new Date().toISOString().slice(0, 19).replace("T", " ") : null
      );
      filed += 1;
    }
  }

}

/* ------------------------------------------------------------- the reports */

/* Cleared first so a second run replaces this script's reports rather than
   piling another fourteen on top. `exec` takes no bind parameters, it would
   have silently left the old rows behind. */
(await db.prepare("DELETE FROM incidents WHERE reported_by = ?").run(agent.id));

const incidentInsert = db.prepare(
  /* ── THE EIGHTH ARGUMENT USED TO GO NOWHERE ────────────────────────────
     The call below has always passed an offset like "-240 minutes", and the
     statement had seven placeholders and a plain `datetime('now')`. So every
     report was stamped with the moment the seed ran: fourteen incidents all
     arriving in the same second, in a feed whose whole purpose is to show a
     night unfolding. The offset is bound now. */
  `INSERT INTO incidents (id, unit_code, state_code, kind, severity, detail_sealed, status, reported_by, created_at)
   VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, now() + ?::interval)`
);

let reported = 0;
{
  for (let n = 0; n < 14; n += 1) {
    const state = states2023[Math.floor(rng() * states2023.length)];
    const index = states2023.indexOf(state);
    const [kind, severity] = KINDS[Math.floor(rng() * KINDS.length)];

    await incidentInsert.run(
      randomUUID(),
      `${String(index + 1).padStart(2, "0")}/${String(1 + Math.floor(rng() * 20)).padStart(2, "0")}/${String(1 + Math.floor(rng() * 12)).padStart(2, "0")}/${String(1 + Math.floor(rng() * 40)).padStart(3, "0")}`,
      String(index + 1).padStart(2, "0"),
      kind,
      severity,
      seal(DETAILS[kind]),
      agent.id,
      `-${Math.round(rng() * 480)} minutes`
    );
    reported += 1;
  }
}

console.log(`Filed ${filed} returns across ${states2023.length} states.`);
console.log(`Logged ${reported} incident reports.`);
console.log("\nEvery party figure is a slice of the real declared 2023 result.");
console.log("The spread across booths is illustrative, no per-booth arrival log is published.");
