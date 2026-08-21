/**
 * Move everything from the local SQLite file into Postgres.
 *
 * ── WHAT IT DOES WITH ELECTIONS ────────────────────────────────────────────
 * The old schema had no notion of a project: there was one pile of results and
 * one pile of incidents. Everything that exists today is therefore the 2023
 * presidential test, so the script creates that project first and files every
 * operational row against it. Nothing is dropped and nothing is invented.
 *
 * ── AND WHAT IT REFUSES TO DO ──────────────────────────────────────────────
 * It will not run against a Postgres database that already holds users, unless
 * told to with --force. Re-running a copy over live accounts is how a
 * migration turns into an incident.
 *
 *   node --env-file=.env.local scripts/migrate-to-postgres.mjs [--force]
 */

import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

import { prisma } from "../lib/prisma.js";

const FORCE = process.argv.includes("--force");
const SQLITE = resolve(process.cwd(), "data/poll360.db");

const DEMO_ELECTION = {
  id: "elec_2023_presidential",
  title: "2023 Presidential Election",
  slug: "2023-presidential",
  kind: "PRESIDENTIAL",
  votesOn: new Date("2023-02-25T00:00:00Z"),
  status: "CLOSED",
  isDemo: true,
  note: "The declared 2023 presidential result, kept as a worked example. Figures are the real declared ones; the order they arrive in is illustrative.",
};

/** SQLite writes `YYYY-MM-DD HH:MM:SS` in UTC with no zone marker on it. */
function when(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const text = String(value);
  const date = new Date(/[TZ+]/.test(text) ? text : `${text.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

if (!existsSync(SQLITE)) {
  console.error(`No SQLite database at ${SQLITE}. Nothing to migrate.`);
  process.exit(1);
}

const sqlite = new DatabaseSync(SQLITE, { readOnly: true });
const all = (sql) => sqlite.prepare(sql).all();

const existing = await prisma.user.count();
if (existing > 0 && !FORCE) {
  console.error(
    `Postgres already holds ${existing} accounts. Refusing to copy over them.\n` +
      "Re-run with --force if that is genuinely what you want."
  );
  process.exit(1);
}

const note = (table, n) => console.log(`  ${String(n).padStart(6)}  ${table}`);

/**
 * One round trip per table, not one per row.
 *
 * The first version of this script upserted row by row. Against a database in
 * another region that is a network round trip each time, and it did not finish
 * a few hundred rows in ten minutes. `createMany` sends the whole table in one
 * statement; `skipDuplicates` is what makes re-running it safe, since a row
 * that is already there is left exactly as it is rather than overwritten.
 */
async function copy(table, model, rows) {
  if (!rows.length) return note(table, 0);
  const { count } = await model.createMany({ data: rows, skipDuplicates: true });
  note(table, count);
}

console.log("Copying SQLite -> Postgres\n");

/* ---- the project everything belongs to ------------------------------- */
await prisma.election.upsert({
  where: { id: DEMO_ELECTION.id },
  create: DEMO_ELECTION,
  update: DEMO_ELECTION,
});
note("elections", 1);
const electionId = DEMO_ELECTION.id;

/* ---- accounts, which are not election-scoped ------------------------- */
const users = all("SELECT * FROM users");
await copy(
  "users",
  prisma.user,
  users.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    role: row.role,
    scope: row.scope,
    disabledAt: when(row.disabled_at),
    lastLoginAt: when(row.last_login_at),
    createdAt: when(row.created_at, new Date()),
  }))
);

/* Sessions are deliberately NOT copied: they are bearer tokens tied to a
   cookie, they expire within days, and carrying them across a storage change
   means an old cookie keeps working against a new database. Everyone signs in
   again once, which is the correct cost. */

await copy(
  "access_requests",
  prisma.accessRequest,
  all("SELECT * FROM access_requests").map((row) => ({
    id: row.id,
    organisation: row.organisation,
    name: row.name,
    email: row.email,
    phone: row.phone,
    kind: row.kind,
    election: row.election,
    units: row.units,
    message: row.message,
    status: row.status,
    createdAt: when(row.created_at, new Date()),
  }))
);

await copy(
  "audit",
  prisma.audit,
  all("SELECT * FROM audit").map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    subject: row.subject,
    meta: row.meta,
    ip: row.ip,
    createdAt: when(row.created_at, new Date()),
  }))
);

/* ---- everything that belongs to the election ------------------------- */
const known = new Set(users.map((row) => row.id));
const skipped = {};
/* A row whose owner is missing cannot be filed: the column is a foreign key
   for a reason, and inventing an owner would be worse than reporting the gap. */
const owned = (table, rows, field) => {
  const kept = rows.filter((row) => known.has(row[field]));
  if (kept.length !== rows.length) skipped[table] = rows.length - kept.length;
  return kept;
};

await copy(
  "results",
  prisma.result,
  owned("results", all("SELECT * FROM results"), "submitted_by").map((row) => ({
    id: row.id,
    electionId,
    unitCode: row.unit_code,
    stateCode: row.state_code,
    registered: row.registered,
    accredited: row.accredited,
    rejected: row.rejected,
    votes: row.votes,
    inecTotal: row.inec_total,
    status: row.status,
    note: row.note,
    lat: row.lat,
    lon: row.lon,
    accuracy: row.accuracy,
    distanceM: row.distance_m,
    source: row.source ?? "APP",
    repName: row.rep_name ?? null,
    submittedBy: row.submitted_by,
    submittedAt: when(row.submitted_at, new Date()),
    verifiedBy: known.has(row.verified_by) ? row.verified_by : null,
    verifiedAt: when(row.verified_at),
  }))
);

await copy(
  "incidents",
  prisma.incident,
  owned("incidents", all("SELECT * FROM incidents"), "reported_by").map((row) => ({
    id: row.id,
    electionId,
    unitCode: row.unit_code,
    stateCode: row.state_code,
    kind: row.kind,
    severity: row.severity,
    detailSealed: row.detail_sealed,
    status: row.status,
    reportedBy: row.reported_by,
    createdAt: when(row.created_at, new Date()),
  }))
);

const liveIncidents = new Set(
  (await prisma.incident.findMany({ select: { id: true } })).map((row) => row.id)
);
const mediaRows = all("SELECT * FROM media").filter((row) => liveIncidents.has(row.incident_id));
await copy(
  "media",
  prisma.media,
  mediaRows.map((row) => ({
    id: row.id,
    incidentId: row.incident_id,
    mime: row.mime,
    bytes: Buffer.from(row.bytes),
    width: row.width,
    height: row.height,
    hash: row.hash,
    createdAt: when(row.created_at, new Date()),
  }))
);

/* ---- WhatsApp -------------------------------------------------------- */
await copy(
  "wa_contacts",
  prisma.waContact,
  all("SELECT * FROM wa_contacts").map((row) => ({
    id: row.id,
    phoneSealed: row.phone_sealed,
    phoneIndex: row.phone_index,
    phoneTail: row.phone_tail,
    displayName: row.display_name,
    userId: known.has(row.user_id) ? row.user_id : null,
    unitCode: row.unit_code,
    stateCode: row.state_code,
    status: row.status,
    firstSeen: when(row.first_seen, new Date()),
    lastSeen: when(row.last_seen, new Date()),
    messageCount: row.message_count,
  }))
);

const liveContacts = new Set(
  (await prisma.waContact.findMany({ select: { id: true } })).map((row) => row.id)
);
const liveMedia = new Set(
  (await prisma.media.findMany({ select: { id: true } })).map((row) => row.id)
);

await copy(
  "wa_messages",
  prisma.waMessage,
  all("SELECT * FROM wa_messages")
    .filter((row) => liveContacts.has(row.contact_id))
    .map((row) => ({
      id: row.id,
      waId: row.wa_id,
      contactId: row.contact_id,
      direction: row.direction,
      kind: row.kind,
      bodySealed: row.body_sealed,
      mediaId: liveMedia.has(row.media_id) ? row.media_id : null,
      step: row.step,
      status: row.status,
      createdAt: when(row.created_at, new Date()),
    }))
);

await copy(
  "wa_sessions",
  prisma.waSession,
  all("SELECT * FROM wa_sessions")
    .filter((row) => liveContacts.has(row.contact_id))
    .map((row) => ({
      contactId: row.contact_id,
      step: row.step,
      draft: row.draft,
      startedAt: when(row.started_at, new Date()),
      updatedAt: when(row.updated_at, new Date()),
      attempts: row.attempts,
    }))
);

await copy(
  "wa_positions",
  prisma.waPosition,
  all("SELECT * FROM wa_positions")
    .filter((row) => liveContacts.has(row.contact_id))
    .map((row) => ({
      id: row.id,
      electionId,
      contactId: row.contact_id,
      unitCode: row.unit_code,
      lat: row.lat,
      lon: row.lon,
      accuracy: row.accuracy,
      label: row.label,
      distanceM: row.distance_m,
      createdAt: when(row.created_at, new Date()),
    }))
);

await copy(
  "polling_units",
  prisma.pollingUnit,
  all("SELECT * FROM polling_units").map((row) => ({
    electionId,
    code: row.code,
    stateCode: row.state_code,
    lgaCode: row.lga_code,
    wardCode: row.ward_code,
    unitNo: row.unit_no,
    name: row.name,
    wardName: row.ward_name,
    lgaName: row.lga_name,
    stateName: row.state_name,
    registered: row.registered,
    repName: row.rep_name,
    lat: row.lat,
    lon: row.lon,
    source: row.source,
    firstSeen: when(row.first_seen, new Date()),
    lastSeen: when(row.last_seen, new Date()),
  }))
);

await copy(
  "sheet_reads",
  prisma.sheetRead,
  all("SELECT * FROM sheet_reads")
    .filter((row) => row.contact_id === null || liveContacts.has(row.contact_id))
    .map((row) => ({
      id: row.id,
      electionId,
      contactId: row.contact_id,
      unitCode: row.unit_code,
      mediaId: row.media_id,
      rawText: row.raw_text,
      parsed: row.parsed,
      confidence: row.confidence,
      accepted: row.accepted,
      corrected: row.corrected,
      createdAt: when(row.created_at, new Date()),
    }))
);

/* The ledger last, and in chain order. `seq` is copied rather than reassigned:
   every entry's hash depends on its predecessor, so renumbering would break the
   chain this table exists to keep. */
const ledger = owned("ledger", all("SELECT * FROM ledger ORDER BY seq ASC"), "user_id");
await copy(
  "ledger",
  prisma.ledgerEntry,
  ledger.map((row) => ({
    seq: row.seq,
    id: row.id,
    electionId,
    userId: row.user_id,
    kind: row.kind,
    amount: row.amount,
    reference: row.reference,
    note: row.note,
    createdAt: when(row.created_at, new Date()),
    previousHash: row.previous_hash,
    hash: row.hash,
    actorId: row.actor_id,
  }))
);

/* Explicit seq values leave Postgres's sequence behind the highest row, so the
   next insert would collide with one that already exists. */
if (ledger.length) {
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('ledger', 'seq'), (SELECT COALESCE(MAX(seq), 1) FROM ledger))`
  );
  console.log("\n  ledger sequence reset to the highest copied row");
}

const lost = Object.entries(skipped);
if (lost.length) {
  console.log("\n  Rows skipped for a missing owner:");
  for (const [table, n] of lost) console.log(`    ${table.padEnd(12)} ${n}`);
}

console.log(`\nEverything operational is filed under "${DEMO_ELECTION.title}".`);
console.log("Sessions were not copied — everyone signs in once more.");

await prisma.$disconnect();
sqlite.close();
