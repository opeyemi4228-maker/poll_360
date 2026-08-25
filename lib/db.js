import { randomUUID, createHash } from "node:crypto";

/* Sealing lives in its own module and knows nothing about storage, so importing
   it here creates no cycle. Used only by the WhatsApp tables, where the phone
   number and the message body are both sensitive at rest. */
import { blindIndex, seal, unseal } from "./crypto.js";
import { parseUnitCode } from "./units.js";
import { parties, others } from "./election2023.js";
import { isRace, RACE_IDS } from "./races.js";
import { normalisePhone, phoneTail } from "./phone.js";
import { exec, prepare, sql } from "./sql.js";

/**
 * Storage.
 *
 * ── IT WAS SQLITE, AND THAT WAS ALWAYS GOING TO END ────────────────────────
 * A file-backed database is right on one machine and wrong the moment this is
 * deployed anywhere serverless, where the filesystem does not survive between
 * invocations. That is not a performance footnote: it means every result filed
 * since the last deploy is gone, silently, and the first anyone knows is when
 * a room asks why the board reset. So this now speaks Postgres, hosted on
 * Neon, over HTTP.
 *
 * ── WHY THE QUERIES DID NOT HAVE TO CHANGE ─────────────────────────────────
 * Because nothing outside this file has ever written SQL. Callers use `users`,
 * `results`, `whatsapp` and the rest, so moving engines was a rewrite of one
 * file against the same function signatures rather than a search through the
 * whole application. `lib/sql.js` keeps sqlite's `prepare(text).get(...)`
 * shape, so the WHERE clauses below are the ones that were tested against the
 * old engine, character for character.
 *
 * The one thing that could not be hidden is that Postgres is asynchronous.
 * Every accessor here returns a promise now, and every caller awaits it.
 * ───────────────────────────────────────────────────────────────────────────
 */

/* Server-only, enforced rather than documented. The `server-only` package does
   the same job, but this needs no dependency and, unlike that package, still
   works when the module is imported by a plain node script such as
   scripts/create-account.mjs. */
if (typeof window !== "undefined") {
  throw new Error(
    "lib/db.js is server-only. Importing it into a client component would ship the schema, " +
      "the queries and the database credentials to the browser."
  );
}

/**
 * Kept so the many `db.prepare(...)` call sites read as they always did.
 *
 * ── AND IT WAITS FOR THE SCHEMA ────────────────────────────────────────────
 * Under sqlite the migrations ran while the connection was being opened, so
 * by the time any query existed the tables did too. Postgres is reached over
 * the network and cannot be opened synchronously, so that guarantee had to be
 * rebuilt: every query awaits `ready` first. It resolves once per process and
 * costs nothing after that, and it means no caller anywhere has to remember to
 * migrate before it reads.
 *
 * Exported because two modules that predate this file's "no SQL outside here"
 * rule still write their own: `lib/ledger.js`, whose hash chain has to control
 * its own ordering, and `lib/watch.js`, whose join across users and results
 * belongs with the map it feeds. Both go through the same shim, so there is
 * one dialect, one place to change engines, and the same wait for the schema.
 */
let ready = null;

/**
 * Whether the application may alter its own schema at boot.
 *
 * ── OFF IN PRODUCTION, ON BY DEFAULT EVERYWHERE ELSE ───────────────────────
 * Creating tables on first query is exactly right on a laptop: clone, set a
 * connection string, run it, and the schema is there. It is exactly wrong in
 * production, for three reasons.
 *
 * A serverless deployment is not one process. It is a new one per cold start,
 * each arriving at an empty module scope, each deciding it should check the
 * schema — so a deploy that lands during traffic has a dozen processes issuing
 * DDL at the same database at the same moment.
 *
 * Second, prisma/migrations owns this schema too. Two owners means Prisma reads
 * the columns this one added as drift and offers to reset the database, which
 * it did once during this work with 487 results in the table.
 *
 * Third, and simplest: a schema change should happen when somebody decides it
 * should, in a step that can be watched and rolled back — not as a side effect
 * of the first person to load a page after a deploy.
 *
 * So production applies migrations deliberately and this stays out of the way,
 * unless somebody knowingly sets POLL360_AUTO_MIGRATE=1.
 */
const AUTO_MIGRATE =
  process.env.NODE_ENV !== "production" || process.env.POLL360_AUTO_MIGRATE === "1";

function schemaReady() {
  if (!AUTO_MIGRATE) return Promise.resolve();
  if (!ready) ready = migrate();
  return ready;
}

export const db = {
  prepare(text) {
    const statement = prepare(text);
    return {
      async get(...args) {
        await schemaReady();
        return statement.get(...args);
      },
      async all(...args) {
        await schemaReady();
        return statement.all(...args);
      },
      async run(...args) {
        await schemaReady();
        return statement.run(...args);
      },
    };
  },
  async exec(text) {
    await schemaReady();
    return exec(text);
  },
};

export { sql };

/**
 * Migrations, in order, run once each.
 *
 * A numbered list rather than a folder of files: with three tables the whole
 * schema fits on a screen, and being able to read it top to bottom is worth
 * more than the ceremony.
 */
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users (
     id            TEXT PRIMARY KEY,
     name          TEXT NOT NULL,
     email         TEXT UNIQUE,
     phone         TEXT UNIQUE,
     password_hash TEXT NOT NULL,
     role          TEXT NOT NULL DEFAULT 'VIEWER',
     scope         TEXT,
     disabled_at   TIMESTAMPTZ,
     last_login_at TIMESTAMPTZ,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS sessions (
     id         TEXT PRIMARY KEY,
     user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at TIMESTAMPTZ NOT NULL,
     user_agent TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)`,

  `CREATE TABLE IF NOT EXISTS access_requests (
     id           TEXT PRIMARY KEY,
     organisation TEXT NOT NULL,
     name         TEXT NOT NULL,
     email        TEXT NOT NULL,
     phone        TEXT,
     kind         TEXT NOT NULL,
     election     TEXT,
     units        INTEGER,
     message      TEXT,
     status       TEXT NOT NULL DEFAULT 'NEW',
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS access_requests_status ON access_requests(status, created_at)`,

  /* One row per booth per election. UNIQUE is the whole point: a booth reports
     once, and a correction updates this row rather than adding a second. */
  `CREATE TABLE IF NOT EXISTS results (
     id            TEXT PRIMARY KEY,
     unit_code     TEXT NOT NULL,
     state_code    TEXT NOT NULL,
     registered    INTEGER NOT NULL,
     accredited    INTEGER NOT NULL,
     rejected      INTEGER NOT NULL DEFAULT 0,
     votes         TEXT NOT NULL,
     inec_total    INTEGER,
     status        TEXT NOT NULL DEFAULT 'SUBMITTED',
     note          TEXT,
     lat           DOUBLE PRECISION,
     lon           DOUBLE PRECISION,
     accuracy      DOUBLE PRECISION,
     distance_m    DOUBLE PRECISION,
     submitted_by  TEXT NOT NULL REFERENCES users(id),
     submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     verified_by   TEXT REFERENCES users(id),
     verified_at   TIMESTAMPTZ,
     UNIQUE (unit_code)
   )`,
  `CREATE INDEX IF NOT EXISTS results_state ON results(state_code, submitted_at)`,
  `CREATE INDEX IF NOT EXISTS results_status ON results(status)`,

  /* What is happening at the booth that is not a number. The narrative is
     sealed: it names people, and an incident log is the most sensitive thing
     this system holds. */
  `CREATE TABLE IF NOT EXISTS incidents (
     id            TEXT PRIMARY KEY,
     unit_code     TEXT NOT NULL,
     state_code    TEXT NOT NULL,
     kind          TEXT NOT NULL,
     severity      TEXT NOT NULL DEFAULT 'INFO',
     detail_sealed TEXT,
     status        TEXT NOT NULL DEFAULT 'OPEN',
     reported_by   TEXT NOT NULL REFERENCES users(id),
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS incidents_feed ON incidents(created_at)`,
  `CREATE INDEX IF NOT EXISTS incidents_state ON incidents(state_code)`,

  /* Every privileged action, appended and never updated. The point of an audit
     log is that it is boring until the night somebody disputes what happened. */
  `CREATE TABLE IF NOT EXISTS audit (
     id         TEXT PRIMARY KEY,
     actor_id   TEXT,
     actor_name TEXT,
     action     TEXT NOT NULL,
     subject    TEXT,
     meta       TEXT,
     ip         TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS audit_time ON audit(created_at)`,

  /* The agent payment ledger. `seq` is the chain order, and the reason it is an
     INTEGER PRIMARY KEY rather than a timestamp: every entry's hash depends on
     the entry before it, so the ordering has to be storage-level and strictly
     monotonic, two rows written in the same millisecond must still have an
     unambiguous predecessor. There is deliberately no UPDATE or DELETE path to
     this table anywhere in the codebase. See lib/ledger.js. */
  `CREATE TABLE IF NOT EXISTS ledger (
     seq           BIGSERIAL PRIMARY KEY,
     id            TEXT NOT NULL UNIQUE,
     user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
     kind          TEXT NOT NULL,
     amount        INTEGER NOT NULL,
     reference     TEXT NOT NULL,
     note          TEXT,
     created_at    TIMESTAMPTZ NOT NULL,
     previous_hash TEXT NOT NULL,
     hash          TEXT NOT NULL,
     actor_id      TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, seq)`,

  /* Photographs attached to an incident.
     Bytes live in their own table so the incident row stays small enough to
     scan a whole evening's feed without dragging images through every query, the same reason result sheets are held apart from result rows. The hash is
     the version: it is the ETag, and it is the proof that the image served
     next year is the image filed tonight. */
  `CREATE TABLE IF NOT EXISTS media (
     id          TEXT PRIMARY KEY,
     incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
     mime        TEXT NOT NULL,
     bytes       BLOB NOT NULL,
     width       INTEGER,
     height      INTEGER,
     hash        TEXT NOT NULL,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS media_incident ON media(incident_id)`,
  /* ── WHATSAPP ──────────────────────────────────────────────────────────────
     Agents file from the phone they already own, over the app they already
     use, on the data plan they already have. Three tables, because a chat
     system has three separate lifetimes: who is talking to us, what was said,
     and where a half-finished return has got to.

     Phone numbers are the most sensitive column in this database. In a
     Nigerian election a list of who is filing results from where is a list of
     people to go and find, so numbers are sealed at rest and carried
     alongside a blind index so a lookup by number never needs to decrypt the
     column. The last four digits are kept in clear, because a desk has to be
     able to recognise a caller without unsealing anything. */
  `CREATE TABLE IF NOT EXISTS wa_contacts (
     id            TEXT PRIMARY KEY,
     phone_sealed  TEXT NOT NULL,
     phone_index   TEXT NOT NULL UNIQUE,
     phone_tail    TEXT NOT NULL,
     display_name  TEXT,
     user_id       TEXT REFERENCES users(id),
     unit_code     TEXT,
     state_code    TEXT,
     status        TEXT NOT NULL DEFAULT 'UNVERIFIED',
     first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
     message_count INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS wa_contacts_seen ON wa_contacts(last_seen DESC)`,

  /* Every message either way. Bodies are sealed: a booth reporting that armed
     men are at the gate is exactly the traffic that must not sit in clear in a
     backup. `wa_id` is the provider's own id, unique so a webhook redelivery
     writes nothing twice. */
  /* `seq` replaces sqlite's seq, which two queries used to break ties
     between messages written in the same second. Postgres has no such
     implicit column, and without one the ordering of a burst of traffic is
     whatever the planner feels like, which on a busy desk means the thread
     reads out of order. */
  `CREATE TABLE IF NOT EXISTS wa_messages (
     seq           BIGSERIAL,
     id            TEXT PRIMARY KEY,
     wa_id         TEXT UNIQUE,
     contact_id    TEXT NOT NULL REFERENCES wa_contacts(id),
     direction     TEXT NOT NULL,
     kind          TEXT NOT NULL DEFAULT 'text',
     body_sealed   TEXT,
     media_id      TEXT REFERENCES media(id),
     step          TEXT,
     status        TEXT NOT NULL DEFAULT 'RECEIVED',
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS wa_messages_thread ON wa_messages(contact_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS wa_messages_recent ON wa_messages(created_at DESC)`,

  /* A return being filled in over several messages. One open conversation per
     contact: a second one would let the same agent file twice down two paths
     and have both look complete. */
  `CREATE TABLE IF NOT EXISTS wa_sessions (
     contact_id    TEXT PRIMARY KEY REFERENCES wa_contacts(id),
     step          TEXT NOT NULL,
     draft         TEXT NOT NULL DEFAULT '{}',
     started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
     attempts      INTEGER NOT NULL DEFAULT 0
   )`,

  /* ── THE POLLING UNIT REGISTRY ─────────────────────────────────────────────
     Units register themselves as their returns arrive rather than being
     preloaded. 176,623 rows of mostly-empty scaffolding tells a room nothing;
     a registry that fills up as the night goes on tells it exactly how far the
     count has got, and every row in it is a place somebody has actually
     reported from.

     The hierarchy is not stored as a tree. It is derived from the unit code,
     which already carries it: SS-LL-WW-UUU is state, local government, ward,
     unit. Storing the parents separately would let the two disagree, and when
     they disagree the code is right, because it is what is printed on the
     sheet in the agent's hand. */
  `CREATE TABLE IF NOT EXISTS polling_units (
     code          TEXT PRIMARY KEY,
     state_code    TEXT NOT NULL,
     lga_code      TEXT NOT NULL,
     ward_code     TEXT NOT NULL,
     unit_no       TEXT NOT NULL,
     name          TEXT,
     ward_name     TEXT,
     lga_name      TEXT,
     state_name    TEXT,
     registered    INTEGER,
     rep_name      TEXT,
     lat           DOUBLE PRECISION,
     lon           DOUBLE PRECISION,
     source        TEXT NOT NULL DEFAULT 'WHATSAPP',
     first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_seen     TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS pu_state ON polling_units(state_code, lga_code, ward_code)`,

  /* Where a coordinator is, over time, not merely where they last were. A
     single current position answers "are they there"; the trail answers "did
     they arrive, when, and have they moved since", which is the question a
     watch officer actually has at 2am. */
  `CREATE TABLE IF NOT EXISTS wa_positions (
     seq           BIGSERIAL,
     id            TEXT PRIMARY KEY,
     contact_id    TEXT NOT NULL REFERENCES wa_contacts(id),
     unit_code     TEXT,
     lat           DOUBLE PRECISION NOT NULL,
     lon           DOUBLE PRECISION NOT NULL,
     accuracy      DOUBLE PRECISION,
     label         TEXT,
     distance_m    DOUBLE PRECISION,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS wa_positions_recent ON wa_positions(contact_id, created_at DESC)`,

  /* What the reader made of a photographed sheet, kept beside what the agent
     confirmed. Both are needed: the first is evidence about the machine, the
     second is the return. When they differ, that difference is the most
     interesting row in the database. */
  `CREATE TABLE IF NOT EXISTS sheet_reads (
     id            TEXT PRIMARY KEY,
     contact_id    TEXT REFERENCES wa_contacts(id),
     unit_code     TEXT,
     media_id      TEXT,
     raw_text      TEXT,
     parsed        TEXT,
     confidence    DOUBLE PRECISION,
     accepted      INTEGER NOT NULL DEFAULT 0,
     corrected     TEXT,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS sheet_reads_recent ON sheet_reads(created_at DESC)`,

  /* ── WHAT A READING NOW HAS TO SAY ABOUT ITSELF ──────────────────────────
     The table was written when there was one reader and one way in: an
     optical reader, reached from WhatsApp. There are now three readers of
     very different quality and two ways in, and a row that does not say which
     produced it cannot answer the only question worth asking of this table —
     whether the reader is getting better. Added rather than defaulted into
     the CREATE above, because the table already exists everywhere. */
  /* ── THE COLUMN THIS TABLE WAS MISSING ───────────────────────────────────
     Every operational table in this product carries the project its rows
     belong to. This one did not — the Prisma model declared `election_id`
     with a default and the raw writer here never set it, so every reading
     taken since projects existed landed in the 2023 project no matter which
     one was actually running. Nothing was lost, but nothing was findable
     either: a rehearsal read a sheet and its own dashboard stayed empty,
     because the row was filed against a different election.

     Existing rows are backfilled to 2023, which is where they have been all
     along and is the only honest thing to say about them. */
  `ALTER TABLE sheet_reads ADD COLUMN IF NOT EXISTS election_id TEXT`,
  `UPDATE sheet_reads SET election_id = 'elec_2023_presidential' WHERE election_id IS NULL`,
  `CREATE INDEX IF NOT EXISTS sheet_reads_by_election ON sheet_reads(election_id, created_at DESC)`,
  `ALTER TABLE sheet_reads ADD COLUMN IF NOT EXISTS reader TEXT`,
  `ALTER TABLE sheet_reads ADD COLUMN IF NOT EXISTS user_id TEXT`,
  `ALTER TABLE sheet_reads ADD COLUMN IF NOT EXISTS race TEXT`,
  `ALTER TABLE sheet_reads ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'WHATSAPP'`,
  `CREATE INDEX IF NOT EXISTS sheet_reads_unit ON sheet_reads(election_id, unit_code)`,

  /* How a return reached us, so the results board can say so. */
  `ALTER TABLE results ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'APP'`,
  `ALTER TABLE results ADD COLUMN IF NOT EXISTS rep_name TEXT`,

  /* ── ELECTIONS, WHICH THIS CODE DID NOT MODEL AND SHOULD HAVE ─────────────
     The database was already carrying an `elections` table and a NOT NULL
     `election_id` on every return, from an earlier pass at the schema. It is
     the better shape: a product that can only ever hold one election is a
     product that has to be wiped to run a second, and a governorship race the
     week after a presidential one is the ordinary case, not the exotic one.

     Rather than strip it out to match code that had not caught up, the column
     is given a default. Existing queries carry on saying nothing about which
     election they mean and land on the current one, and the day this grows a
     real election switcher, the storage is already waiting for it. */
  `CREATE TABLE IF NOT EXISTS elections (
     id         TEXT PRIMARY KEY,
     title      TEXT NOT NULL,
     slug       TEXT NOT NULL UNIQUE,
     kind       TEXT NOT NULL,
     votes_on   TIMESTAMPTZ,
     status     TEXT NOT NULL DEFAULT 'OPEN',
     is_demo    BOOLEAN NOT NULL DEFAULT false,
     note       TEXT,
     created_by TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     closed_at  TIMESTAMPTZ
   )`,
  `INSERT INTO elections (id, title, slug, kind, votes_on, status, is_demo)
   VALUES ('elec_2023_presidential', '2023 Presidential Election', '2023-presidential',
           'PRESIDENTIAL', '2023-02-25T00:00:00.000Z', 'CLOSED', true)
   ON CONFLICT (id) DO NOTHING`,
  /* Which states an election actually covers.
     ── A GOVERNORSHIP IS NOT A FEDERATION ────────────────────────────────
     Every project drew the whole country, so an Ekiti governorship showed 36
     states it has no candidates in, all of them grey and all of them wrong:
     grey means "nobody has reported yet", and nobody is ever going to report
     from Kano in an Ekiti election. Empty is not the same as not applicable,
     and a map that cannot tell them apart is lying quietly.

     A comma-separated list of state codes, or NULL for a national contest.
     Text rather than a join table because it is read on every page load,
     never queried across, and never more than 37 short codes. */
  `ALTER TABLE elections ADD COLUMN IF NOT EXISTS scope_states TEXT`,
  `ALTER TABLE results ADD COLUMN IF NOT EXISTS election_id TEXT`,
  `ALTER TABLE results ALTER COLUMN election_id SET DEFAULT 'elec_2023_presidential'`,
  `UPDATE results SET election_id = 'elec_2023_presidential' WHERE election_id IS NULL`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS election_id TEXT`,
  `ALTER TABLE incidents ALTER COLUMN election_id SET DEFAULT 'elec_2023_presidential'`,
  `UPDATE incidents SET election_id = 'elec_2023_presidential' WHERE election_id IS NULL`,

  /* ══════════════════════════════════════════════════════════════════════════
     APPEND ONLY, BELOW THIS LINE AND ABOVE THE CLOSING BRACKET.

     These are keyed by their position in this array. Inserting a statement in
     the middle renumbers every statement after it, so migrations that have
     already run get marked as pending and, worse, statements that have never
     run inherit an index that is already recorded as done and are skipped
     forever. That is not hypothetical: the two ALTERs below were first written
     in the middle of this list, and the column they add existed in the schema
     everybody read and in no database anybody ran.
     ══════════════════════════════════════════════════════════════════════════ */

  /* Two queries order by `seq` to break ties between rows written in the same
     second. It was originally added to the CREATE TABLE, which does nothing
     when the table is already there. A column is added with ALTER, or it is
     not added. */
  `ALTER TABLE wa_messages ADD COLUMN IF NOT EXISTS seq BIGSERIAL`,
  `ALTER TABLE wa_positions ADD COLUMN IF NOT EXISTS seq BIGSERIAL`,

  /* ── A BOOTH REPORTS ONCE ─────────────────────────────────────────────────
     The whole design says a correction updates a unit's row rather than adding
     a second one, and the original CREATE TABLE said UNIQUE (unit_code) to
     enforce it. That table already existed when this schema first ran, so the
     constraint was never created, and for a while nothing stopped two agents
     filing the same booth and the national total quietly counting it twice.

     Scoped by election rather than by unit alone, because the same polling
     unit reports in the governorship race the week after the presidential
     one, and those are two legitimate rows. */
  `CREATE UNIQUE INDEX IF NOT EXISTS results_one_per_unit ON results(election_id, unit_code)`,

  /* ── WHAT THE COMMISSION SAID, KEPT APART FROM WHAT WE COUNTED ────────────
     `results.inec_total` has been on the results table since the beginning and
     holds a single integer. One integer cannot say which party's figure moved,
     and it cannot hold a ward figure at all — but collation announces wards
     hours before any unit sheet is published, and a ward is where a count is
     actually altered.

     So declared figures get their own table, one row per place per election,
     carrying the level they were announced at. Nothing in here is ever written
     into a result and no result is ever written into here: two independently
     sourced numbers for the same booths is the whole product, and a schema
     that let one correct the other would quietly destroy it. `inec_total` is
     left exactly where it is — the seeder writes it and dropping a column is
     how a migration loses data nobody knew was being read. */
  `CREATE TABLE IF NOT EXISTS declared (
     id           TEXT PRIMARY KEY,
     election_id  TEXT NOT NULL,
     level        TEXT NOT NULL,
     place_key    TEXT NOT NULL,
     state_code   TEXT,
     /* How many polling units this place contains, where the sheet said so.
        Null means nobody told us, and the comparison stays partial rather
        than assuming complete coverage — see lib/divergence.js. */
     units        INTEGER,
     registered   INTEGER,
     accredited   INTEGER,
     rejected     INTEGER,
     votes        TEXT NOT NULL,
     stated_total INTEGER,
     total        INTEGER NOT NULL,
     source       TEXT NOT NULL DEFAULT 'UPLOAD',
     note         TEXT,
     entered_by   TEXT REFERENCES users(id),
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  /* A place is declared once per election. A correction updates that row, the
     same rule the results table already lives by, and for the same reason: two
     rows for one ward is a total counted twice. */
  `CREATE UNIQUE INDEX IF NOT EXISTS declared_one_per_place ON declared(election_id, level, place_key)`,
  `CREATE INDEX IF NOT EXISTS declared_by_state ON declared(election_id, state_code)`,

  /* ── DID THE PICTURE AGREE WITH THE FIGURES? ──────────────────────────────
     Null means no sheet was compared, which is not the same as a sheet that
     agreed and must never look like one. Anything else is the JSON record
     from lib/sheet-match.js: which fields were checked, and which differed.

     Kept on the return rather than only on sheet_reads because the question
     "is this figure corroborated by its own photograph" is asked of a return,
     by somebody looking at a return, and a join to answer it is a join
     somebody will forget. */
  `ALTER TABLE results ADD COLUMN IF NOT EXISTS sheet_match TEXT`,

  /* ── AND THE LESSON ABOVE, LEARNED AGAIN, IMMEDIATELY ────────────────────
     `units` was added to the CREATE TABLE a few statements up after that
     statement had already run once. Editing it gave it a new hash, so it ran
     again — and `CREATE TABLE IF NOT EXISTS` against a table that already
     exists does nothing at all. The column was in the schema everybody read
     and in no database anybody ran, which is word for word the failure this
     file warns about a hundred lines above, and it took about ten minutes to
     reproduce it.

     A column is added with ALTER, or it is not added. It stays in the CREATE
     TABLE as well, so a fresh database gets it in one step. */
  `ALTER TABLE declared ADD COLUMN IF NOT EXISTS units INTEGER`,

  /* ── ONE BOOTH, ONE EVENING, SEVERAL CONTESTS ────────────────────────────
     A voter at a polling unit is handed more than one ballot paper. The
     presidential figures from booth 25/07/04/019 and the senate figures from
     the same booth are two returns about two different contests, and the
     table had nowhere to say which was which — so the second one filed would
     have overwritten the first through the unique index below, silently, and
     the only symptom would have been a count that was missing a race.

     Existing rows are presidential because that is the only contest anything
     has ever been filed for. The default says so rather than leaving the
     column null and making every reader decide what null means. */
  `ALTER TABLE results ADD COLUMN IF NOT EXISTS race TEXT NOT NULL DEFAULT 'PRESIDENTIAL'`,

  /* Rows that predate the column belong to whatever their project is about.
     Written as a join rather than a blanket update: the off-cycle
     governorship project's returns are governorship returns, and marking
     them presidential would have put them in a contest that was not held.

     Safe to run twice — it only ever moves a row from the column default to
     its own project's kind, and running it again finds nothing to move. */
  `UPDATE results SET race = elections.kind
     FROM elections
    WHERE elections.id = results.election_id
      AND results.race = 'PRESIDENTIAL'
      AND elections.kind <> 'PRESIDENTIAL'
      /* Only a kind that is a real position may be copied onto a row. A
         project created as "OTHER" or "ASSEMBLY" — both of which the switcher
         offered before it read its list from lib/races.js — would otherwise
         put a value into this column that every accessor rejects, and the
         rows would become unreadable rather than merely mislabelled. */
      AND elections.kind IN ('GOVERNORSHIP', 'SENATE', 'REPRESENTATIVES', 'LGA')`,

  /* The old index is (election_id, unit_code) and has to go, or a booth can
     still only report once per project however many ballots it counted.
     Dropped and rebuilt with the position in it, in that order, because
     Postgres will not let the narrower one linger while the wider one is
     created. */
  `DROP INDEX IF EXISTS results_one_per_unit`,

  /* ── AND THE SAME RULE AGAIN, UNDER PRISMA'S NAME FOR IT ─────────────────
     This schema has two owners: the statements in this file and
     prisma/migrations. Both had created the one-return-per-booth rule, under
     different names — `results_one_per_unit` here and
     `results_election_id_unit_code_key` there — and dropping only the one this
     file knew about left the other standing. The symptom was precise and
     baffling: the presidential return filed, the governorship return from the
     same booth was rejected by a constraint that appears nowhere in this file.

     Prisma declares it as a UNIQUE constraint rather than a bare index, so it
     has to come off with ALTER TABLE; DROP INDEX cannot touch a constraint.
     Guarded, because a database built only from this file never had it. */
  `ALTER TABLE results DROP CONSTRAINT IF EXISTS results_election_id_unit_code_key`,
  `DROP INDEX IF EXISTS results_election_id_unit_code_key`,
  `CREATE UNIQUE INDEX IF NOT EXISTS results_one_per_unit_race
     ON results(election_id, race, unit_code)`,
  `CREATE INDEX IF NOT EXISTS results_by_race ON results(election_id, race, submitted_at)`,

  /* ── AN ACCOUNT THAT EXISTS AND MAY NOT YET COUNT ────────────────────────
     Coordinators sign themselves up, and an administrator approves them
     before anything they file enters the count. That is three states, not
     two, and `disabled_at` could only express one of them: an account that
     was never approved and an account that was approved and later shut off
     are different facts, and only one of them belongs in an approval queue.

     The column defaults to ACTIVE, so every account that already exists —
     issued by an administrator, which was the only way in until now — stays
     exactly as it was without a backfill that could sweep a pending signup
     into approval by accident. */
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS users_pending ON users(status, created_at)`,

  /* ══ A SEPARATE POPULATION, WITH ITS OWN FRONT DOOR ═══════════════════════
     Polling unit coordinators are not staff. There are four thousand of them
     to a newsroom's four, they are recruited in the fortnight before polling
     day, they sign themselves up, and an administrator lets them in. Holding
     them in `users` beside the administrator, the broadcast desk and the
     situation room meant one table where a mistake on the coordinator path
     could reach a staff account, and one sign-in page trying to speak to both
     audiences at once and serving neither well.

     So they get their own table, their own sessions and their own cookie.
     Nothing here can open a Poll360 room and no Poll360 account can sign in
     there: two systems that meet in exactly one place, the bridge column on
     `results` below.

     ── WHAT THIS COSTS, SAID PLAINLY ────────────────────────────────────────
     Two of everything: two password stores, two session tables, two sweepers,
     two guards. That duplication is the real risk of this design — a fix made
     on one side and forgotten on the other — so every function with a twin in
     lib/session.js names its twin in its own comment. */
  `CREATE TABLE IF NOT EXISTS coordinators (
     id            TEXT PRIMARY KEY,
     name          TEXT NOT NULL,
     email         TEXT UNIQUE,
     phone         TEXT UNIQUE,
     password_hash TEXT NOT NULL,
     unit_code     TEXT,
     state_code    TEXT,
     status        TEXT NOT NULL DEFAULT 'PENDING',
     note          TEXT,
     approved_by   TEXT REFERENCES users(id),
     approved_at   TIMESTAMPTZ,
     disabled_at   TIMESTAMPTZ,
     last_login_at TIMESTAMPTZ,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  /* The queue reads oldest-first on every load of the approvals page and the
     roster filters by status. Both are this index. */
  `CREATE INDEX IF NOT EXISTS coordinators_status ON coordinators(status, created_at)`,
  `CREATE INDEX IF NOT EXISTS coordinators_unit ON coordinators(unit_code)`,

  /* Their own sessions, on their own cookie. The token is stored hashed for
     the same reason it is in `sessions`: a leaked backup then carries no
     usable credentials. */
  `CREATE TABLE IF NOT EXISTS coordinator_sessions (
     id             TEXT PRIMARY KEY,
     coordinator_id TEXT NOT NULL REFERENCES coordinators(id) ON DELETE CASCADE,
     expires_at     TIMESTAMPTZ NOT NULL,
     user_agent     TEXT,
     created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS coordinator_sessions_owner ON coordinator_sessions(coordinator_id)`,
  `CREATE INDEX IF NOT EXISTS coordinator_sessions_expiry ON coordinator_sessions(expires_at)`,

  /* ══ THE BRIDGE, AND WHY IT IS A SECOND COLUMN, NOT A REPLACEMENT ═════════
     `results.submitted_by` is NOT NULL and references users(id). Hundreds of
     rows already point through it, and the ledger and the audit trail read it.
     Repointing that column at a table those rows have no entry in is a
     migration that loses the authorship of every return ever filed.

     So a filing carries one of two authors and never both: a staff account in
     `submitted_by`, or a coordinator in `coordinator_id`. Existing rows keep
     the first and are not touched. The check below is what stops the pair
     drifting into a row claiming two authors or none — a result nobody filed
     is not a result, and one filed by two people is a bug that would surface
     for the first time in a tribunal. */
  `ALTER TABLE results ADD COLUMN IF NOT EXISTS coordinator_id TEXT REFERENCES coordinators(id)`,
  `ALTER TABLE results ALTER COLUMN submitted_by DROP NOT NULL`,
  `CREATE INDEX IF NOT EXISTS results_coordinator ON results(coordinator_id)`,
  `ALTER TABLE results DROP CONSTRAINT IF EXISTS results_one_author`,
  `ALTER TABLE results ADD CONSTRAINT results_one_author
     CHECK ((submitted_by IS NULL) <> (coordinator_id IS NULL))`,

  /* Incidents come from the same people and need the same bridge. */
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS coordinator_id TEXT REFERENCES coordinators(id)`,
  `ALTER TABLE incidents ALTER COLUMN reported_by DROP NOT NULL`,

  /* ── TWO NAMES FOR ONE BALLOT PAPER ──────────────────────────────────────
     The project switcher offered HOUSE and LOCAL; lib/races.js calls the same
     two contests REPRESENTATIVES and LGA. A project created under the old
     names would be opened by a reader that has never heard of its kind, and
     the backfills above copy a project's kind onto its rows — so the old names
     could reach the `race` column, where every accessor would then reject
     them. Both lists are read from lib/races.js now; these are the projects
     created before they were.

     Safe to run twice: the second pass finds nothing left to rename. */
  `UPDATE elections SET kind = 'REPRESENTATIVES' WHERE kind = 'HOUSE'`,
  `UPDATE elections SET kind = 'LGA' WHERE kind = 'LOCAL'`,

  /* ── AND THE DECLARED FIGURES ARE PER CONTEST TOO ────────────────────────
     The whole point of this table is to be the thing our count is held
     against, and holding a presidential count against a governorship
     declaration compares two different elections and calls the difference a
     divergence. A ward announces a figure for each contest on the ballot, and
     those are separate announcements about separate counts.

     The default matches the results table's, and for the same reason: every
     row that predates the column belongs to whatever its project is about. */
  `ALTER TABLE declared ADD COLUMN IF NOT EXISTS race TEXT NOT NULL DEFAULT 'PRESIDENTIAL'`,

  `UPDATE declared SET race = elections.kind
     FROM elections
    WHERE elections.id = declared.election_id
      AND declared.race = 'PRESIDENTIAL'
      AND elections.kind <> 'PRESIDENTIAL'
      /* Guarded exactly as the results backfill above, and for the same
         reason: a kind that is not a position must never reach this column. */
      AND elections.kind IN ('GOVERNORSHIP', 'SENATE', 'REPRESENTATIVES', 'LGA')`,

  /* One place is declared once per contest, not once ever. Dropped and rebuilt
     in that order, and any constraint Prisma created under its own name goes
     with it — the results table taught that lesson at some cost: a rule this
     file thought it had removed was still being enforced under a name that
     appears nowhere in it. */
  `DROP INDEX IF EXISTS declared_one_per_place`,
  `ALTER TABLE declared DROP CONSTRAINT IF EXISTS declared_election_id_level_place_key_key`,
  `DROP INDEX IF EXISTS declared_election_id_level_place_key_key`,
  `CREATE UNIQUE INDEX IF NOT EXISTS declared_one_per_place_race
     ON declared(election_id, race, level, place_key)`,

];

/**
 * Bring the schema up to date, once, however many processes try at once.
 *
 * ── KEYED BY WHAT THE STATEMENT SAYS, NOT WHERE IT SITS ────────────────────
 * This used to record migrations by their index in the array, which is fine
 * until somebody adds one in the middle. Then every statement after it
 * renumbers: ones that have already run look pending, and ones that have
 * never run inherit an index already marked done and are skipped forever.
 * That is not a theoretical failure. A column was added to a CREATE TABLE
 * that had already run, then moved into an ALTER, and the ALTER inherited a
 * finished index. The column existed in the schema everybody read and in no
 * database anybody ran, and the only symptom was a query failing in
 * production against a table that looked correct in the source.
 *
 * So the key is a hash of the statement itself. Position stops mattering,
 * reordering stops mattering, and a statement that has genuinely never run is
 * identified by what it does rather than by where it happens to be. Editing
 * an existing statement gives it a new hash and runs it again, which is why
 * every statement here must stay safe to run twice: `IF NOT EXISTS`,
 * `ON CONFLICT DO NOTHING`, or a `WHERE` that matches nothing the second time.
 *
 * ── AND WHY THE LOCK IS NOT OPTIONAL ───────────────────────────────────────
 * More than one process runs this, and not only on election night: `next
 * build` collects page data in parallel workers, each of which evaluates this
 * module. Reading the done-set and writing to it are two steps, and without a
 * lock across both, two workers both see a statement as pending and both run
 * it. A Postgres advisory lock does what `BEGIN IMMEDIATE` did for sqlite: the
 * second waits at the door rather than racing through it. It is released in a
 * `finally`, because a lock held by a crashed migration hangs every later boot.
 */
const LOCK = 360_360;

let migrated = null;

export async function migrate() {
  /* Once per process, and concurrent callers share the one attempt rather
     than each starting their own. */
  if (migrated) return migrated;

  migrated = (async () => {
    await exec(
      `CREATE TABLE IF NOT EXISTS _migrations (
         hash   TEXT PRIMARY KEY,
         note   TEXT,
         run_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`
    );

    /* The original table was keyed by an integer, and that column was NOT
       NULL, so a hash-only row could not be written beside the old ones. The
       column is dropped rather than worked around: the numbers recorded in it
       are a record of a scheme that did not work, and keeping them would only
       preserve the constraint that broke the new one. */
    await exec("ALTER TABLE _migrations DROP COLUMN IF EXISTS n");
    await exec("ALTER TABLE _migrations ADD COLUMN IF NOT EXISTS hash TEXT");
    await exec("ALTER TABLE _migrations ADD COLUMN IF NOT EXISTS note TEXT");
    /* The uniqueness the conflict clause below depends on, declared here
       rather than assumed from whatever the table used to be keyed by. A
       database that has lived through a scheme change is exactly the one that
       will not have the constraint you expect. */
    await exec("CREATE UNIQUE INDEX IF NOT EXISTS _migrations_hash ON _migrations(hash)");

    await sql.query("SELECT pg_advisory_lock($1)", [LOCK]);
    try {
      const rows = await sql.query("SELECT hash FROM _migrations WHERE hash IS NOT NULL");
      const done = new Set(rows.map((row) => row.hash));

      for (const statement of MIGRATIONS) {
        const hash = createHash("sha256").update(statement).digest("hex").slice(0, 32);
        if (done.has(hash)) continue;

        await exec(statement);
        await sql.query(
          "INSERT INTO _migrations (hash, note) VALUES ($1, $2) ON CONFLICT (hash) DO NOTHING",
          [hash, statement.replace(/\s+/g, " ").trim().slice(0, 120)]
        );
      }
    } finally {
      await sql.query("SELECT pg_advisory_unlock($1)", [LOCK]);
    }
  })();

  return migrated;
}

/* ------------------------------------------------------------------ shapes */

/** SQLite has no boolean and no Date; the seams are converted here, once. */
function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    role: row.role,
    scope: row.scope,
    /* ACTIVE, PENDING or DECLINED. A signup is a real account from the moment
       it is made — it can sign in, and it is told plainly that it is waiting —
       but nothing it files enters the count until somebody approves it. */
    status: row.status ?? "ACTIVE",
    approvedAt: row.approved_at ? new Date(`${row.approved_at}Z`) : null,
    approvedBy: row.approved_by ?? null,
    disabledAt: row.disabled_at ? new Date(`${row.disabled_at}Z`) : null,
    lastLoginAt: row.last_login_at ? new Date(`${row.last_login_at}Z`) : null,
    createdAt: new Date(`${row.created_at}Z`),
  };
}

/* ------------------------------------------------------------------- users */

export const users = {
  async findByEmail(email) {
    return toUser((await db.prepare("SELECT * FROM users WHERE email = ?").get(email)));
  },

  async findByPhone(phone) {
    return toUser((await db.prepare("SELECT * FROM users WHERE phone = ?").get(phone)));
  },

  async findById(id) {
    return toUser((await db.prepare("SELECT * FROM users WHERE id = ?").get(id)));
  },

  async markSignedIn(id) {
    (await db.prepare("UPDATE users SET last_login_at = now() WHERE id = ?").run(id));
  },

  /** Used by the seed script, which is the only way an account is created. */
  async upsert({ name, email, phone, passwordHash, role = "VIEWER", scope = null }) {
    const existing = email ? await users.findByEmail(email) : null;

    if (existing) {
      (await db.prepare(
        "UPDATE users SET name = ?, phone = ?, password_hash = ?, role = ?, scope = ?, disabled_at = NULL WHERE id = ?"
      ).run(name, phone, passwordHash, role, scope, existing.id));
      return users.findById(existing.id);
    }

    const id = randomUUID();
    (await db.prepare(
      `INSERT INTO users (id, name, email, phone, password_hash, role, scope)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, email ?? null, phone ?? null, passwordHash, role, scope));
    return users.findById(id);
  },

  /**
   * A coordinator asking to be let in.
   *
   * ── WHY THIS IS NOT `upsert` WITH A FLAG ───────────────────────────────
   * `upsert` is the administrator's tool: it takes an existing account and
   * makes it whatever was asked for, including re-enabling a disabled one.
   * Pointing a public form at that is how somebody signs up with the email of
   * an account that was shut off last month and gets it back. This only ever
   * inserts, it can only ever produce a PENDING coordinator tied to the booth
   * they named, and a clash is refused by the caller before it reaches here.
   */
  async request({ name, email, phone, passwordHash, scope }) {
    const id = randomUUID();
    (await db.prepare(
      `INSERT INTO users (id, name, email, phone, password_hash, role, scope, status)
       VALUES (?, ?, ?, ?, ?, 'PU_AGENT', ?, 'PENDING')`
    ).run(id, name, email ?? null, phone ?? null, passwordHash, scope ?? null));
    return users.findById(id);
  },

  /** The approval queue, oldest first: whoever has waited longest is at the top. */
  async pending(take = 60) {
    return (await db
      .prepare(
        "SELECT * FROM users WHERE status = 'PENDING' ORDER BY created_at LIMIT ?"
      )
      .all(take))
      .map(toUser);
  },

  async pendingCount() {
    return Number(
      (await db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'PENDING'").get())?.n ?? 0
    );
  },

  /**
   * Let them in, and record who did.
   *
   * The booth may be corrected on the way through: an agent typing their own
   * unit code on a phone is the single likeliest thing on this form to be
   * wrong, and the administrator approving them is usually the person who
   * knows what it should have been.
   */
  async approve(id, { by, scope = null }) {
    (await db.prepare(
      `UPDATE users
          SET status = 'ACTIVE', approved_by = ?, approved_at = now(),
              scope = COALESCE(?, scope), disabled_at = NULL
        WHERE id = ? AND status <> 'ACTIVE'`
    ).run(by ?? null, scope, id));
    return users.findById(id);
  },

  /**
   * Turn them down.
   *
   * The row stays. A declined signup that was deleted is one somebody can make
   * again five minutes later with the same details, and nobody reviewing it
   * the second time would know it had been refused the first.
   */
  async decline(id, { by }) {
    (await db.prepare(
      `UPDATE users
          SET status = 'DECLINED', approved_by = ?, approved_at = now(), disabled_at = now()
        WHERE id = ?`
    ).run(by ?? null, id));
    return users.findById(id);
  },
};

/* ---------------------------------------------------------------- sessions */

export const sessions = {
  async create({ id, userId, expiresAt, userAgent }) {
    (await db.prepare(
      "INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)"
    ).run(id, userId, expiresAt.toISOString(), userAgent ?? null));
  },

  /**
   * The session and its account in one statement.
   *
   * Joined rather than fetched separately so a disabled account and a missing
   * session cannot be answered by two code paths that drift apart.
   */
  async findWithUser(id) {
    const row = (await db
      .prepare(
        `SELECT s.expires_at, u.id, u.name, u.email, u.phone, u.role, u.scope,
                u.status, u.disabled_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.id = ?`
      )
      .get(id));

    if (!row) return null;
    if (new Date(`${row.expires_at}Z`) < new Date()) return null;
    if (row.disabled_at) return null;

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      scope: row.scope,
      /* Carried on the session so the guard can tell a coordinator waiting for
         approval from one who has it, without a second query on every request
         of every page. A pending account signs in and is told where it stands;
         it does not get a dashboard and it cannot file. */
      status: row.status ?? "ACTIVE",
    };
  },

  async destroy(id) {
    (await db.prepare("DELETE FROM sessions WHERE id = ?").run(id));
  },

  async sweepExpired() {
    (await db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString()));
  },
};

/* ------------------------------------------------------------------ media */

export const media = {
  /**
   * Store one photograph against an incident.
   *
   * Only ever called with bytes the server has already re-encoded, never with
   * whatever arrived from the browser. See app/field/actions.js.
   */
  async attach({ incidentId, mime, bytes, width, height }) {
    const id = randomUUID();
    const hash = createHash("sha256").update(bytes).digest("hex");
    (await db.prepare(
      `INSERT INTO media (id, incident_id, mime, bytes, width, height, hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, incidentId, mime, bytes, width ?? null, height ?? null, hash));
    return { id, hash };
  },

  /** Metadata only, never the bytes, so a feed query stays cheap. */
  async forIncidents(ids) {
    if (!ids.length) return new Map();
    const marks = ids.map(() => "?").join(",");
    const rows = (await db
      .prepare(
        `SELECT id, incident_id, mime, width, height, hash
           FROM media WHERE incident_id IN (${marks}) ORDER BY created_at ASC`
      )
      .all(...ids));

    const grouped = new Map();
    for (const row of rows) {
      const list = grouped.get(row.incident_id) ?? [];
      list.push({ id: row.id, mime: row.mime, width: row.width, height: row.height, hash: row.hash });
      grouped.set(row.incident_id, list);
    }
    return grouped;
  },

  /** The bytes, for the authenticated route that serves them. */
  async bytes(id) {
    const row = await db.prepare("SELECT mime, bytes, hash FROM media WHERE id = ?").get(id);
    if (!row) return null;

    /* ── bytea COMES BACK AS TEXT ──────────────────────────────────────────
       sqlite handed back a Buffer. Postgres over HTTP hands back the hex
       string Postgres prints for a bytea, "\x89504e47...", and a Response
       built from that serves the literal characters with an image
       Content-Type: a broken picture on every incident, and nothing in the
       logs, because as far as the stack is concerned it worked. Converted
       here so no caller has to know which engine is underneath. */
    const bytes =
      typeof row.bytes === "string" && row.bytes.startsWith("\\x")
        ? Buffer.from(row.bytes.slice(2), "hex")
        : Buffer.from(row.bytes);

    return { ...row, bytes };
  },
};

/* --------------------------------------------------------- access requests */

export const accessRequests = {
  async create(values) {
    const id = randomUUID();
    (await db.prepare(
      `INSERT INTO access_requests
         (id, organisation, name, email, phone, kind, election, units, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      values.organisation,
      values.name,
      values.email,
      values.phone,
      values.kind,
      values.election,
      values.units,
      values.message
    ));
    return id;
  },

  async recent(take = 20) {
    return (await db
      .prepare("SELECT * FROM access_requests ORDER BY created_at DESC LIMIT ?")
      .all(take))
      .map((row) => ({ ...row, createdAt: new Date(`${row.created_at}Z`) }));
  },
};

/* ----------------------------------------------------------------- results */

const toResult = (row) =>
  row && {
    id: row.id,
    unitCode: row.unit_code,
    stateCode: row.state_code,
    /* Which ballot paper these figures came off. Never inferred from the
       project: a project holds several contests and they are not the same
       count. */
    race: row.race ?? "PRESIDENTIAL",
    registered: row.registered,
    accredited: row.accredited,
    rejected: row.rejected,
    votes: JSON.parse(row.votes),
    /* Declared figures now live in their own table. This column predates it,
       the seeder still writes it, and a reader that silently dropped it left
       every consumer thinking there was no declared figure when there was. */
    inecTotal: row.inec_total ?? null,
    /* Three states, and they must stay distinguishable: null is no sheet at
       all, `compared: false` is a sheet that was attached and could not be
       read, and `compared: true` carries what the comparison found. Only the
       last is corroboration. */
    sheetMatch: row.sheet_match ? JSON.parse(row.sheet_match) : null,
    status: row.status,
    note: row.note,
    /* How the return reached the count: from the app at the booth, over
       WhatsApp, or typed into the filing screen by a desk. Stored since the
       column was added and never shaped out, so every screen that asked read
       undefined and fell back to "from the booth" — which is exactly the claim
       a return typed at a desk must not make. */
    source: row.source ?? "APP",
    repName: row.rep_name ?? null,

    /* ── FORM EC8A, BACK OUT AGAIN ──────────────────────────────────────────
       `?? null` and never `?? 0`. A box nobody captured and a box written 0
       are different facts, and the audit in lib/results.js checks an identity
       only when every box in it is a real figure — a null quietly withdraws
       that check instead of failing it against a number nobody wrote. */
    formSerial: row.form_serial ?? null,
    ballotsIssued: row.ballots_issued ?? null,
    unusedBallots: row.unused_ballots ?? null,
    spoiled: row.spoiled ?? null,
    statedValid: row.stated_valid ?? null,
    usedBallots: row.used_ballots ?? null,
    /* Three states: disputed, certified uncontested, and an officer who
       struck out neither. `?? null` keeps the third from reading as the
       second, which would record a certification nobody made. */
    contested: row.contested ?? null,
    sheetDate: row.sheet_date ?? null,
    agents: row.agents ? JSON.parse(row.agents) : null,
    position:
      row.lat == null
        ? null
        : { lat: row.lat, lon: row.lon, accuracy: row.accuracy, distance: row.distance_m },
    submittedBy: row.submitted_by,
    /* Set instead of `submittedBy` when the return came from a coordinator's
       own account rather than from a staff one. Exactly one of the pair is
       ever populated. */
    coordinatorId: row.coordinator_id ?? null,
    submittedAt: new Date(`${row.submitted_at}Z`),
    verifiedAt: row.verified_at ? new Date(`${row.verified_at}Z`) : null,
  };

/**
 * A scope that must be named.
 *
 * ── WHY THIS THROWS RATHER THAN DEFAULTING ─────────────────────────────────
 * Every one of these accessors reads or writes rows belonging to one election.
 * A default would make forgetting silent: a query would quietly read across all
 * projects, or a return would land in whichever one happened to be first, and
 * neither shows up as an error — only as figures that are subtly wrong on the
 * night. Loud and immediate beats plausible and wrong.
 */
function required(electionId, where) {
  if (!electionId) {
    throw new Error(
      `${where} needs an election. Pass the current project's id — see lib/election-scope.js.`
    );
  }
  return electionId;
}

/**
 * A position that must be named, for the same reason and with more force.
 *
 * ── WHY THERE IS NO DEFAULT HERE EITHER ────────────────────────────────────
 * A missing election reads the wrong project, which somebody notices. A
 * missing position sums a presidential return, a senate return and a
 * governorship return from the same booth into one figure, and that figure
 * looks entirely plausible. It is three counts added together and it is
 * nobody's result. Defaulting to the project's headline contest would have
 * been the tempting kindness; it would have made every unlabelled caller
 * quietly presidential, including the ones filing a governorship.
 */
function requiredRace(race, where) {
  const id = String(race ?? "").toUpperCase();
  if (!isRace(id)) {
    throw new Error(
      `${where} needs a position — one of ${RACE_IDS.join(", ")}. See lib/races.js.`
    );
  }
  return id;
}

export const results = {
  /**
   * File or amend. One row per booth, enforced by the unique index rather than
   * by remembering to check first, a correction updates the row it belongs to,
   * and amending a verified return drops it back to unverified because the
   * check it passed was against different numbers.
   */
  async file(values) {
    const electionId = required(values.electionId, "results.file");
    const race = requiredRace(values.race, "results.file");
    const existing = await results.forUnit(values.unitCode, electionId, race);
    const votes = JSON.stringify(values.votes);

    if (existing) {
      (await db.prepare(
        `UPDATE results SET registered = ?, accredited = ?, rejected = ?, votes = ?,
           note = ?, lat = ?, lon = ?, accuracy = ?, distance_m = ?,
           /* ── EXACTLY ONE AUTHOR, RE-STATED ON EVERY AMENDMENT ────────
              Both columns are written every time, because an amendment can
              change who filed: a desk correcting a coordinator's return has to
              clear the coordinator, and setting only the column you have would
              leave a row claiming two authors. The database refuses that —
              see results_one_author — so getting this wrong fails loudly here
              rather than quietly producing a return nobody can attribute. */
           submitted_by = ?, coordinator_id = ?, submitted_at = now(),
           source = ?, rep_name = COALESCE(?, rep_name),
           /* Overwritten rather than kept: an amendment is new figures, and
              the old figures' agreement with a photograph says nothing about
              these. Carrying it forward would leave a corrected return
              wearing the corroboration of the one it replaced. */
           sheet_match = ?,
           /* ── FORM EC8A, IN FULL ────────────────────────────────────────
              The eight numbered boxes and the parts of the sheet that are
              not figures. COALESCE on none of them: an amendment that
              corrected box #8 downwards would otherwise keep the old figure,
              and the whole reason these are stored is that they are checked
              against each other. A blank is a real answer here — it means
              the agent did not capture that box — and it must be able to
              overwrite a figure that turned out to be wrong. */
           form_serial = ?, ballots_issued = ?, unused_ballots = ?, spoiled = ?,
           stated_valid = ?, used_ballots = ?, contested = ?, sheet_date = ?,
           agents = ?,
           status = 'SUBMITTED', verified_by = NULL, verified_at = NULL
         WHERE id = ?`
      ).run(
        values.registered,
        values.accredited,
        values.rejected,
        votes,
        values.note ?? null,
        values.position?.lat ?? null,
        values.position?.lon ?? null,
        values.position?.accuracy ?? null,
        values.position?.distance ?? null,
        values.submittedBy ?? null,
        values.coordinatorId ?? null,
        values.source ?? "APP",
        values.repName ?? null,
        values.sheetMatch ? JSON.stringify(values.sheetMatch) : null,
        values.formSerial ?? null,
        values.ballotsIssued ?? null,
        values.unusedBallots ?? null,
        values.spoiled ?? null,
        values.statedValid ?? null,
        values.usedBallots ?? null,
        values.contested ?? null,
        values.sheetDate ?? null,
        values.agents ? JSON.stringify(values.agents) : null,
        existing.id
      ));
      return { id: existing.id, amended: true };
    }

    const id = randomUUID();
    (await db.prepare(
      `INSERT INTO results
         (id, election_id, race, unit_code, state_code, registered, accredited, rejected, votes, note,
          lat, lon, accuracy, distance_m, submitted_by, coordinator_id, source, rep_name, sheet_match,
          form_serial, ballots_issued, unused_ballots, spoiled, stated_valid, used_ballots,
          contested, sheet_date, agents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      electionId,
      race,
      values.unitCode,
      values.stateCode,
      values.registered,
      values.accredited,
      values.rejected,
      votes,
      values.note ?? null,
      values.position?.lat ?? null,
      values.position?.lon ?? null,
      values.position?.accuracy ?? null,
      values.position?.distance ?? null,
      /* One of these two is null and the other is not; the database enforces
         it. A staff account files through `submittedBy`, a polling unit
         coordinator through `coordinatorId`, and they are separate tables. */
      values.submittedBy ?? null,
      values.coordinatorId ?? null,
      /* How it reached us, so the board can say so, and who presided, which
         until now had nowhere to live at all. */
      values.source ?? "APP",
      values.repName ?? null,
      values.sheetMatch ? JSON.stringify(values.sheetMatch) : null,
      /* Everything else the sheet carries. Nullable throughout: a photograph
         may not show a box, and a null here means "not captured", which is
         not the same fact as a zero and is never rendered as one. */
      values.formSerial ?? null,
      values.ballotsIssued ?? null,
      values.unusedBallots ?? null,
      values.spoiled ?? null,
      values.statedValid ?? null,
      values.usedBallots ?? null,
      values.contested ?? null,
      values.sheetDate ?? null,
      values.agents ? JSON.stringify(values.agents) : null
    ));
    return { id, amended: false };
  },

  /**
   * One booth's return, in one election.
   *
   * ── THE ELECTION IS NOT OPTIONAL HERE ──────────────────────────────────
   * The unique index is (election_id, unit_code): a booth reports once per
   * election, not once ever. Looking a unit up without naming the election
   * returns whichever project happened to file it first — and `file` below
   * uses this to decide between an insert and an update, so an agent filing
   * booth 25/07/04/019 in a new project would have overwritten the 2023
   * result for that booth instead of creating a new row.
   */
  async forUnit(unitCode, electionId, race) {
    return toResult(
      await db
        .prepare("SELECT * FROM results WHERE unit_code = ? AND election_id = ? AND race = ?")
        .get(
          unitCode,
          required(electionId, "results.forUnit"),
          requiredRace(race, "results.forUnit")
        )
    );
  },

  /**
   * Every position this booth has reported, keyed by position.
   *
   * One query rather than five, because the form that asks the question is
   * asking it about all five at once: an agent opening their screen wants to
   * see which ballots they have already sent and which are still to come.
   */
  async forUnitAcrossRaces(unitCode, electionId) {
    const rows = await db
      .prepare("SELECT * FROM results WHERE unit_code = ? AND election_id = ?")
      .all(unitCode, required(electionId, "results.forUnitAcrossRaces"));

    return Object.fromEntries(rows.map((row) => [row.race ?? "PRESIDENTIAL", toResult(row)]));
  },

  async recent(take = 25, electionId, race) {
    return (await db
      .prepare(
        `SELECT * FROM results WHERE election_id = ? AND race = ?
          ORDER BY submitted_at DESC LIMIT ?`
      )
      .all(required(electionId, "results.recent"), requiredRace(race, "results.recent"), take))
      .map(toResult);
  },

  /** Disputed rows stay in the table and out of every sum. */
  async counted(electionId, race) {
    return (await db
      .prepare(
        `SELECT * FROM results
          WHERE election_id = ? AND race = ? AND status IN ('SUBMITTED','VERIFIED')
          ORDER BY submitted_at`
      )
      .all(required(electionId, "results.counted"), requiredRace(race, "results.counted")))
      .map(toResult);
  },

  /**
   * How many booths have reported each position, in one pass.
   *
   * What the filing screen and the position picker both need: not the figures,
   * only whether a contest has anything in it yet. Asked of the database as one
   * grouped count rather than five round trips, because it is drawn on every
   * render of the room's position selector.
   */
  async countByRace(electionId) {
    const rows = await db
      .prepare(
        `SELECT race, COUNT(*) AS n FROM results
          WHERE election_id = ? AND status IN ('SUBMITTED','VERIFIED')
          GROUP BY race`
      )
      .all(required(electionId, "results.countByRace"));

    return Object.fromEntries(rows.map((row) => [row.race, Number(row.n)]));
  },

  /**
   * What one account has uploaded into this project, newest first.
   *
   * ── WHY A DESK NEEDS A DIFFERENT QUESTION FROM AN AGENT ──────────────────
   * An agent files for one booth, so "which of my five ballots are in?" is the
   * whole of what they need, and `forUnitAcrossRaces` answers it. A desk with
   * the upload power files for booths it is not standing at, dozens of them,
   * across positions — and that question has no answer for them at all. The
   * filing screen asked it anyway, got an empty object because the account has
   * no booth of its own, and told somebody who had just uploaded twenty
   * returns that nothing had been sent.
   *
   * Across every position on purpose: an upload desk works down a stack of
   * sheets, not across one booth's evening, and filtering to the position the
   * screen happens to be showing would hide most of its own work.
   */
  async uploadedBy(electionId, userId, take = 20) {
    return (await db
      .prepare(
        `SELECT * FROM results
          WHERE election_id = ? AND submitted_by = ?
          ORDER BY submitted_at DESC LIMIT ?`
      )
      .all(required(electionId, "results.uploadedBy"), userId, take))
      .map(toResult);
  },

  async setStatus(id, status, verifierId) {
    (await db.prepare(
      `UPDATE results SET status = ?,
         verified_by = CASE WHEN ? = 'VERIFIED' THEN ? ELSE NULL END,
         verified_at = CASE WHEN ? = 'VERIFIED' THEN now() ELSE NULL END
       WHERE id = ?`
    ).run(status, status, verifierId, status, id));
  },

  async tally(electionId, race) {
    const rows = await results.counted(electionId, race);
    const totals = {};
    let registered = 0;
    let accredited = 0;

    for (const row of rows) {
      registered += row.registered;
      accredited += row.accredited;
      /* ── ONE COLUMN, TWO SHAPES, AND WHY THIS GUARDS AGAINST IT ────────
         Returns are stored keyed by party. A handful were written as bare
         arrays before that was settled, and Object.entries over an array
         yields "0", "1", "2", so the tally grew phantom parties named after
         their own positions and quietly under-counted the real ones. Reading
         through voteName means either shape adds up to the same thing. */
      for (const [key, count] of Object.entries(row.votes ?? {})) {
        const party = voteName(key);
        totals[party] = (totals[party] ?? 0) + count;
      }
    }

    return { units: rows.length, registered, accredited, totals };
  },
};

/** A party id, whether the record was keyed by name or by position. */
function voteName(key) {
  if (!/^\d+$/.test(key)) return key;
  return [...parties, others][Number(key)]?.id ?? key;
}

/* --------------------------------------------------------------- incidents */

export const incidents = {
  async create(values) {
    const id = randomUUID();
    (await db.prepare(
      `INSERT INTO incidents (id, election_id, unit_code, state_code, kind, severity, detail_sealed, reported_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      required(values.electionId, "incidents.create"),
      values.unitCode,
      values.stateCode,
      values.kind,
      values.severity,
      values.detailSealed ?? null,
      values.reportedBy
    ));
    return id;
  },

  async recent(take = 40, electionId) {
    return (await db
      .prepare(
        `SELECT i.*, u.name AS reporter
           FROM incidents i LEFT JOIN users u ON u.id = i.reported_by
          WHERE i.election_id = ?
          ORDER BY i.created_at DESC LIMIT ?`
      )
      .all(required(electionId, "incidents.recent"), take))
      .map((row) => ({
        id: row.id,
        unitCode: row.unit_code,
        stateCode: row.state_code,
        kind: row.kind,
        severity: row.severity,
        detailSealed: row.detail_sealed,
        status: row.status,
        reporter: row.reporter,
        createdAt: new Date(`${row.created_at}Z`),
      }));
  },
};

/* ------------------------------------------------------------------- audit */

export const audit = {
  /**
   * Append-only. There is no update and no delete, deliberately: a log that
   * can be edited is not a log.
   */
  async record({ actorId, actorName, action, subject, meta, ip }) {
    (await db.prepare(
      "INSERT INTO audit (id, actor_id, actor_name, action, subject, meta, ip) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      randomUUID(),
      actorId ?? null,
      actorName ?? null,
      action,
      subject ?? null,
      meta ? JSON.stringify(meta) : null,
      ip ?? null
    ));
  },

  async recent(take = 50) {
    return (await db
      .prepare("SELECT * FROM audit ORDER BY created_at DESC LIMIT ?")
      .all(take))
      .map((row) => ({
        ...row,
        meta: row.meta ? JSON.parse(row.meta) : null,
        createdAt: new Date(`${row.created_at}Z`),
      }));
  },
};

/**
 * WhatsApp.
 *
 * ── WHY THE PHONE NUMBER IS THE HARD PART ──────────────────────────────────
 * Everything else here is ordinary chat storage. The number is not. A table
 * of who filed a result from which booth, in the clear, is a targeting list,
 * and the people on it are agents standing in schoolyards. So the number is
 * sealed at rest and looked up by blind index, and the desk sees the last
 * four digits, which is enough to recognise somebody and useless to anyone
 * who steals the file.
 * ───────────────────────────────────────────────────────────────────────────
 */
export const whatsapp = {
  /** Find by number, or create on first contact. Never decrypts to search. */
  async contactFor(phone, displayName = null) {
    /* ── ONE NUMBER, ONE SHAPE ────────────────────────────────────────────
       The index is a keyed hash, so it only finds anything if the number
       hashed is always written the same way. WhatsApp sends 2348031234567,
       a person types +234 803 123 4567, a spreadsheet exports 08031234567.
       Hashing those raw produced three contacts for one coordinator, three
       message threads, and a desk with no way of knowing they were one
       person. */
    const number = normalisePhone(phone) ?? String(phone ?? "");
    const index = blindIndex(number);
    const found = (await db.prepare("SELECT * FROM wa_contacts WHERE phone_index = ?").get(index));

    if (found) {
      (await db.prepare(
        `UPDATE wa_contacts SET last_seen = now(),
           message_count = message_count + 1,
           display_name = COALESCE(?, display_name)
         WHERE id = ?`
      ).run(displayName, found.id));
      return shapeContact({ ...found, message_count: found.message_count + 1 });
    }

    const id = randomUUID();
    (await db.prepare(
      `INSERT INTO wa_contacts (id, phone_sealed, phone_index, phone_tail, display_name, message_count)
       VALUES (?, ?, ?, ?, ?, 1)`
    ).run(id, seal(number), index, phoneTail(number), displayName));

    return shapeContact((await db.prepare("SELECT * FROM wa_contacts WHERE id = ?").get(id)));
  },

  /** Tie a chat identity to a real account and its booth. */
  async claim(contactId, { userId, unitCode, stateCode }) {
    (await db.prepare(
      `UPDATE wa_contacts SET user_id = ?, unit_code = ?, state_code = ?, status = 'VERIFIED'
       WHERE id = ?`
    ).run(userId ?? null, unitCode ?? null, stateCode ?? null, contactId));
  },

  async block(contactId) {
    (await db.prepare("UPDATE wa_contacts SET status = 'BLOCKED' WHERE id = ?").run(contactId));
  },

  async contacts(take = 100) {
    return (await db
      .prepare("SELECT * FROM wa_contacts ORDER BY last_seen DESC LIMIT ?")
      .all(take))
      .map(shapeContact);
  },

  async contact(id) {
    const row = (await db.prepare("SELECT * FROM wa_contacts WHERE id = ?").get(id));
    return row ? shapeContact(row) : null;
  },

  /**
   * Record a message. `waId` is the provider's own identifier and is unique,
   * so a webhook redelivery, which Meta does routinely, writes nothing twice
   * rather than doubling a booth's traffic on the desk.
   */
  record({ waId = null, contactId, direction, kind = "text", body = null, mediaId = null, step = null, status = "RECEIVED" }) {
    const id = randomUUID();
    const done = db
      .prepare(
        /* A webhook redelivery must write nothing twice. `wa_id` is the
           provider's own id and is unique, so the conflict clause is what
           makes a repeat delivery a no-op rather than a duplicate message in
           the thread. */
        `INSERT INTO wa_messages (id, wa_id, contact_id, direction, kind, body_sealed, media_id, step, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (wa_id) DO NOTHING`
      )
      .run(id, waId, contactId, direction, kind, seal(body), mediaId, step, status);

    return done.changes ? id : null;
  },

  async thread(contactId, take = 60) {
    return (await db
      .prepare("SELECT * FROM wa_messages WHERE contact_id = ? ORDER BY created_at DESC, seq DESC LIMIT ?")
      .all(contactId, take))
      .map(shapeMessage)
      .reverse();
  },

  async recent(take = 60) {
    return (await db
      .prepare(
        `SELECT m.*, c.phone_tail, c.display_name, c.unit_code, c.status AS contact_status
         FROM wa_messages m JOIN wa_contacts c ON c.id = m.contact_id
         ORDER BY m.created_at DESC, m.seq DESC LIMIT ?`
      )
      .all(take))
      .map((row) => ({
        ...shapeMessage(row),
        tail: row.phone_tail,
        name: row.display_name,
        unitCode: row.unit_code,
        contactStatus: row.contact_status,
      }));
  },

  /* ------------------------------------------------------- conversations */
  async session(contactId) {
    const row = (await db.prepare("SELECT * FROM wa_sessions WHERE contact_id = ?").get(contactId));
    if (!row) return null;
    return { ...row, draft: JSON.parse(row.draft), contactId: row.contact_id };
  },

  async saveSession(contactId, step, draft, attempts = 0) {
    (await db.prepare(
      `INSERT INTO wa_sessions (contact_id, step, draft, attempts)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(contact_id) DO UPDATE SET
         step = excluded.step, draft = excluded.draft,
         attempts = excluded.attempts, updated_at = now()`
    ).run(contactId, step, JSON.stringify(draft), attempts));
  },

  async endSession(contactId) {
    (await db.prepare("DELETE FROM wa_sessions WHERE contact_id = ?").run(contactId));
  },

  async openSessions() {
    return (await db
      .prepare(
        `SELECT s.*, c.phone_tail, c.display_name, c.unit_code
         FROM wa_sessions s JOIN wa_contacts c ON c.id = s.contact_id
         ORDER BY s.updated_at DESC`
      )
      .all())
      .map((row) => ({
        contactId: row.contact_id,
        step: row.step,
        draft: JSON.parse(row.draft),
        updatedAt: new Date(row.updated_at),
        tail: row.phone_tail,
        name: row.display_name,
        unitCode: row.unit_code,
      }));
  },

  /** Counts for the desk header. One query rather than five round trips. */
  async summary() {
    const row = (await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM wa_contacts) AS contacts,
           (SELECT COUNT(*) FROM wa_contacts WHERE status = 'VERIFIED') AS verified,
           (SELECT COUNT(*) FROM wa_contacts WHERE status = 'BLOCKED') AS blocked,
           (SELECT COUNT(*) FROM wa_messages) AS messages,
           (SELECT COUNT(*) FROM wa_messages WHERE direction = 'IN') AS inbound,
           (SELECT COUNT(*) FROM wa_messages WHERE kind = 'image') AS images,
           (SELECT COUNT(*) FROM wa_sessions) AS open,
           (SELECT COUNT(*) FROM wa_messages WHERE step = 'DONE') AS filed`
      )
      .get());
    return row ?? {};
  },
};

function shapeContact(row) {
  return {
    id: row.id,
    /* The number itself is never shaped out. A caller that genuinely needs it,
       and there is exactly one, unseals it deliberately. */
    tail: row.phone_tail,
    name: row.display_name,
    userId: row.user_id,
    unitCode: row.unit_code,
    stateCode: row.state_code,
    status: row.status,
    firstSeen: new Date(row.first_seen),
    lastSeen: new Date(row.last_seen),
    messageCount: row.message_count,
  };
}

/** The one place a number is deliberately revealed, for an operator who asked. */
export async function revealPhone(contactId) {
  const row = (await db.prepare("SELECT phone_sealed FROM wa_contacts WHERE id = ?").get(contactId));
  return row ? unseal(row.phone_sealed) : null;
}

function shapeMessage(row) {
  return {
    id: row.id,
    contactId: row.contact_id,
    direction: row.direction,
    kind: row.kind,
    body: unseal(row.body_sealed),
    mediaId: row.media_id,
    step: row.step,
    status: row.status,
    createdAt: new Date(row.created_at),
  };
}

/**
 * The polling unit registry, and where coordinators are.
 *
 * Units are written as their first return arrives, so the registry is a record
 * of what has actually reported rather than a preloaded list of everywhere
 * that might. `INSERT ... ON CONFLICT` because a unit reporting twice is an
 * amendment, not a second unit.
 */
export const units = {
  /**
   * Record a polling unit, or update what we know about one.
   *
   * ── THE KEY IS (ELECTION, CODE), AND IT ALWAYS WAS ─────────────────────
   * This upsert named `ON CONFLICT(code)` for a table whose primary key is
   * the pair. Postgres does not fall back and does not warn: it refuses the
   * statement outright with "no unique or exclusion constraint matching the
   * ON CONFLICT specification", which is why registering a unit failed every
   * single time it was attempted, from every channel.
   *
   * The mismatch came from this file's own CREATE TABLE declaring `code TEXT
   * PRIMARY KEY` while prisma/migrations built the same table keyed by the
   * pair — two owners of one schema, and the application believing the half
   * it wrote. The conflict target now names what the database actually has.
   */
  async register({ electionId, code, name, wardName, lgaName, stateName, registered, repName, lat, lon, source = "WHATSAPP" }) {
    /* The address is read off the code rather than taken from the caller. A
       later update that carries only a position must not have to restate the
       hierarchy, and an upsert evaluates its INSERT values before it ever
       reaches the conflict clause, so a partial call with no state would fail
       the NOT NULL on the way in. Deriving it here means every call is
       complete by construction. */
    const at = parseUnitCode(code);
    if (!at) return false;

    (await db.prepare(
      `INSERT INTO polling_units
         (election_id, code, state_code, lga_code, ward_code, unit_no, name, ward_name, lga_name,
          state_name, registered, rep_name, lat, lon, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(election_id, code) DO UPDATE SET
         last_seen  = now(),
         name       = COALESCE(excluded.name, polling_units.name),
         ward_name  = COALESCE(excluded.ward_name, polling_units.ward_name),
         lga_name   = COALESCE(excluded.lga_name, polling_units.lga_name),
         state_name = COALESCE(excluded.state_name, polling_units.state_name),
         registered = COALESCE(excluded.registered, polling_units.registered),
         rep_name   = COALESCE(excluded.rep_name, polling_units.rep_name),
         lat        = COALESCE(excluded.lat, polling_units.lat),
         lon        = COALESCE(excluded.lon, polling_units.lon)`
    ).run(
      /* The column is NOT NULL with a default pointing at the 2023 project, a
         bridge left for the writers that predate elections. Naming it here is
         what stops a booth discovered during one contest being filed under
         another; the default stays for whatever still has not been updated. */
      required(electionId, "units.register"),
      at.code, at.stateCode ?? at.stateNumber, at.lgaCode, at.wardCode, at.unitNo,
      name ?? null, wardName ?? null, lgaName ?? null, stateName ?? at.stateName ?? null,
      registered ?? null, repName ?? null, lat ?? null, lon ?? null, source
    ));

    return true;
  },

  /**
   * Every registered unit with whatever has been filed against it.
   *
   * One query with a join rather than a query per unit: the tree is built in
   * one pass over this, and a per-unit lookup at 176,623 units is the kind of
   * thing that works perfectly in a demo and falls over on the night.
   */
  async all(electionId, race) {
    /* ── THE JOIN IS SCOPED, AND IT HAS TO BE ─────────────────────────────
       This used to join on the unit code alone. With one project and one
       contest that was merely lucky; with a project holding five contests it
       returns five rows per booth and the tree counts each of them as a booth
       that has reported, so coverage passes 100% and keeps going. The
       registry itself stays unscoped on purpose — a polling unit is a place,
       and a place does not belong to an election — but what has been *filed*
       against it always belongs to exactly one contest in one project. */
    return (await db
      .prepare(
        `SELECT p.*, r.registered AS r_registered, r.accredited, r.rejected, r.votes,
                r.status, r.submitted_at, r.source AS r_source, r.rep_name AS r_rep
           FROM polling_units p
           LEFT JOIN results r
             ON r.unit_code = p.code AND r.election_id = ? AND r.race = ?
          ORDER BY p.code`
      )
      .all(required(electionId, "units.all"), requiredRace(race, "units.all")))
      .map((row) => ({
        code: row.code,
        name: row.name,
        wardName: row.ward_name,
        lgaName: row.lga_name,
        stateName: row.state_name,
        repName: row.r_rep ?? row.rep_name,
        lat: row.lat,
        lon: row.lon,
        source: row.r_source ?? row.source,
        reported: Boolean(row.submitted_at),
        status: row.status ?? null,
        registered: row.r_registered ?? row.registered ?? 0,
        accredited: row.accredited ?? 0,
        rejected: row.rejected ?? 0,
        votes: voteArray(row.votes),
        at: row.submitted_at ? new Date(row.submitted_at) : null,
      }));
  },

  /** One unit, or null. Used to work out how far a coordinator is from theirs. */
  async at(code) {
    const row = (await db.prepare("SELECT * FROM polling_units WHERE code = ?").get(code));
    if (!row) return null;
    return {
      code: row.code,
      name: row.name,
      stateName: row.state_name,
      registered: row.registered,
      repName: row.rep_name,
      lat: row.lat,
      lon: row.lon,
    };
  },

  async count(electionId) {
    /* Scoped when a project is named, because the registry is keyed by the
       pair: the 2023 project's 176,623 units are not this project's, and a
       coverage figure built by dividing this project's returns by that count
       would be wrong by three orders of magnitude. */
    return electionId
      ? (await db.prepare("SELECT COUNT(*) AS n FROM polling_units WHERE election_id = ?").get(electionId))?.n ?? 0
      : (await db.prepare("SELECT COUNT(*) AS n FROM polling_units").get())?.n ?? 0;
  },

  async reported(electionId, race) {
    return (
      (await db
        .prepare(
          `SELECT COUNT(*) AS n FROM polling_units p
             JOIN results r ON r.unit_code = p.code
            WHERE r.election_id = ? AND r.race = ?`
        )
        .get(required(electionId, "units.reported"), requiredRace(race, "units.reported")))?.n ?? 0
    );
  },
};

/**
 * A return's votes as an array in party order.
 *
 * Rows are stored keyed by party. Anything summing them needs a positional
 * array, and doing that conversion in one place means a row written in either
 * shape reads the same way everywhere, rather than each caller inventing its
 * own guess.
 */
function voteArray(stored) {
  if (!stored) return [];
  let parsed;
  try {
    parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return parsed;

  /* ── A VOTE FOR A PARTY WITH NO COLOUR IS STILL A VOTE ──────────────────
     The four drawn parties are read off by name; everything else lands in the
     bucket at the end rather than being dropped on the floor. This mattered
     the moment a return could carry a party outside the national four — a
     governorship fought between APC, PDP and SDP would have had its third
     candidate silently deleted from every map and every total, and the only
     visible symptom would have been shares that did not add up. */
  const drawn = [...parties, others];
  const row = drawn.map((party) => parsed[party.id] ?? 0);
  const known = new Set(drawn.map((party) => party.id));

  for (const [id, count] of Object.entries(parsed)) {
    if (!known.has(id)) row[drawn.length - 1] += Number(count) || 0;
  }

  return row;
}

/** Where coordinators are, over time. */
export const positions = {
  async record({ contactId, unitCode = null, lat, lon, accuracy = null, label = null, distance = null }) {
    const id = randomUUID();
    (await db.prepare(
      `INSERT INTO wa_positions (id, contact_id, unit_code, lat, lon, accuracy, label, distance_m)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, contactId, unitCode, lat, lon, accuracy, label, distance));
    return id;
  },

  /**
   * The newest fix per contact.
   *
   * A window function rather than a group-by-max: grouping by contact and
   * taking max(created_at) gives the right timestamp attached to an arbitrary
   * row's coordinates, which is a bug that only shows up once somebody has
   * moved, and then puts them in the wrong place.
   */
  async latest() {
    return (await db
      .prepare(
        `SELECT * FROM (
           SELECT p.*, c.display_name, c.phone_tail, c.unit_code AS contact_unit,
                  ROW_NUMBER() OVER (PARTITION BY p.contact_id ORDER BY p.created_at DESC, p.seq DESC) AS rn
             FROM wa_positions p JOIN wa_contacts c ON c.id = p.contact_id
         ) WHERE rn = 1`
      )
      .all())
      .map((row) => ({
        contactId: row.contact_id,
        unitCode: row.unit_code ?? row.contact_unit,
        name: row.display_name,
        tail: row.phone_tail,
        lat: row.lat,
        lon: row.lon,
        accuracy: row.accuracy,
        label: row.label,
        at: new Date(row.created_at),
      }));
  },

  /** The newest fix from one contact, or null if they have never sent one. */
  async latestFor(contactId) {
    const row = (await db
      .prepare(
        "SELECT * FROM wa_positions WHERE contact_id = ? ORDER BY created_at DESC, seq DESC LIMIT 1"
      )
      .get(contactId));
    if (!row) return null;
    return {
      lat: row.lat,
      lon: row.lon,
      accuracy: row.accuracy,
      distance: row.distance_m,
      at: new Date(row.created_at),
    };
  },

  async trail(contactId, take = 40) {
    return (await db
      .prepare("SELECT * FROM wa_positions WHERE contact_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(contactId, take))
      .map((row) => ({ lat: row.lat, lon: row.lon, at: new Date(row.created_at) }));
  },
};

/** What the reader made of a sheet, kept beside what the agent confirmed. */
export const sheetReads = {
  async record({
    electionId,
    contactId = null,
    userId = null,
    unitCode,
    mediaId = null,
    rawText = null,
    parsed,
    confidence = null,
    reader = null,
    race = null,
    source = "WHATSAPP",
  }) {
    const id = randomUUID();
    /* Throws rather than defaults. A reading that quietly picks a project is
       a reading nobody will ever find again, and it looks exactly like the
       reader not working — which is precisely how this was discovered. */
    const election = required(electionId, "sheetReads.record");

    (await db.prepare(
      `INSERT INTO sheet_reads
         (id, election_id, contact_id, user_id, unit_code, media_id, raw_text, parsed, confidence, reader, race, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      election,
      contactId ?? null,
      userId ?? null,
      unitCode ?? null,
      mediaId ?? null,
      /* Sealed like every other free text: a page of optical output carries
         the whole sheet, names included. Null where a model read it. */
      seal(rawText),
      JSON.stringify(parsed),
      confidence ?? null,
      reader ?? null,
      race ?? null,
      source,
    ));
    return id;
  },

  /** Marked when the agent accepts, with whatever they changed. */
  async accept(id, corrected = null) {
    (await db.prepare("UPDATE sheet_reads SET accepted = 1, corrected = ? WHERE id = ?").run(
      corrected ? JSON.stringify(corrected) : null,
      id
    ));
  },

  async recent(electionId, take = 40) {
    return (await db
      .prepare(
        `SELECT * FROM sheet_reads
          WHERE election_id = ?
          ORDER BY created_at DESC
          LIMIT ?`
      )
      .all(required(electionId, "sheetReads.recent"), take))
      .map(shapeRead);
  },

  /**
   * One reading by id, for holding a filing against what was actually read.
   *
   * Not scoped, deliberately: the caller has an id it was handed moments ago
   * and needs to know whose it is. The election comes back on the row so the
   * caller can refuse a reading from another project — see checkAgainstSheet
   * in app/field/actions.js, which refuses on the account as well.
   */
  async get(id) {
    const row = (await db.prepare("SELECT * FROM sheet_reads WHERE id = ?").get(id));
    return row
      ? {
          ...shapeRead(row),
          electionId: row.election_id ?? null,
          userId: row.user_id ?? null,
          contactId: row.contact_id ?? null,
        }
      : null;
  },

  /** Every reading taken of one booth in one project, newest first. */
  async forUnit(electionId, unitCode, take = 20) {
    return (await db
      .prepare(
        `SELECT * FROM sheet_reads
          WHERE election_id = ? AND unit_code = ?
          ORDER BY created_at DESC
          LIMIT ?`
      )
      .all(required(electionId, "sheetReads.forUnit"), unitCode, take))
      .map(shapeRead);
  },

  async summary(electionId) {
    const election = required(electionId, "sheetReads.summary");

    const row = (await db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(accepted) AS accepted,
                AVG(confidence) AS confidence
           FROM sheet_reads
          WHERE election_id = ?`
      )
      .get(election));
    /* Broken out by reader, because "the reader is at 61%" is meaningless
       when three of them with very different eyesight are pooled into it. */
    const byReader = (await db
      .prepare(
        `SELECT COALESCE(reader, 'unknown') AS reader,
                COUNT(*) AS total,
                SUM(accepted) AS accepted,
                AVG(confidence) AS confidence
           FROM sheet_reads
          WHERE election_id = ?
          GROUP BY COALESCE(reader, 'unknown')
          ORDER BY COUNT(*) DESC`
      )
      .all(election)).map((entry) => ({
        reader: entry.reader,
        total: Number(entry.total ?? 0),
        accepted: Number(entry.accepted ?? 0),
        confidence: entry.confidence,
      }));

    return {
      total: row?.total ?? 0,
      accepted: row?.accepted ?? 0,
      confidence: row?.confidence ?? null,
      byReader,
    };
  },
};

/** One stored reading, in the shape every screen reads it in. */
function shapeRead(row) {
  return {
    id: row.id,
    electionId: row.election_id ?? null,
    unitCode: row.unit_code,
    parsed: row.parsed ? JSON.parse(row.parsed) : null,
    corrected: row.corrected ? JSON.parse(row.corrected) : null,
    confidence: row.confidence,
    reader: row.reader ?? null,
    race: row.race ?? null,
    source: row.source ?? "WHATSAPP",
    accepted: Boolean(row.accepted),
    at: new Date(row.created_at),
  };
}

/* ------------------------------------------------------------- declared */

/**
 * What the commission announced, per place, per election.
 *
 * ── IT IS A SEPARATE STORE ON PURPOSE ──────────────────────────────────────
 * Nothing here is ever written into a result and no result is ever written
 * into here. Two independently sourced figures for the same booths is the only
 * thing a parallel count is for; a writer that let one correct the other would
 * destroy it silently, and the symptom would be a dashboard that always agrees.
 */
export const declared = {
  /**
   * Save an upload.
   *
   * ── ONE PLACE, ONE ROW, AND A RE-UPLOAD REPLACES IT ───────────────────────
   * Collation corrects itself: a ward is announced, disputed, and announced
   * again with different figures. The second announcement is the declared
   * figure, not a second declared figure, so it updates the row rather than
   * adding one. The same rule the results table lives by, for the same reason —
   * two rows for one ward is a total counted twice, and nobody spots it in an
   * aggregate.
   */
  async save({ electionId, race, rows, enteredBy, note = null, source = "UPLOAD" }) {
    const id = required(electionId, "declared.save");
    const contest = requiredRace(race, "declared.save");
    let written = 0;

    for (const row of rows) {
      (await db.prepare(
        `INSERT INTO declared
           (id, election_id, race, level, place_key, state_code, units, registered, accredited,
            rejected, votes, stated_total, total, source, note, entered_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (election_id, race, level, place_key) DO UPDATE SET
           state_code   = excluded.state_code,
           units        = excluded.units,
           registered   = excluded.registered,
           accredited   = excluded.accredited,
           rejected     = excluded.rejected,
           votes        = excluded.votes,
           stated_total = excluded.stated_total,
           total        = excluded.total,
           source       = excluded.source,
           note         = excluded.note,
           entered_by   = excluded.entered_by,
           /* Stamped again, because the useful question about a declared
              figure is when it was last announced, not when the place first
              appeared in somebody's spreadsheet. */
           created_at   = now()`
      ).run(
        randomUUID(),
        id,
        contest,
        row.level,
        row.key,
        row.stateNumber ?? null,
        row.units ?? null,
        row.registered ?? null,
        row.accredited ?? null,
        row.rejected ?? null,
        JSON.stringify(row.votes),
        row.statedTotal ?? null,
        row.total,
        source,
        /* A per-row note wins over the batch's. A CSV upload has one note for
           the whole file and every row shares it; a loader that knows
           something specific about each place — who was declared, on what
           date, whether the figure is unverified — sets it per row, and that
           was being dropped on the floor here in favour of the batch note the
           loader never passed. The batch note stays as the fallback, so every
           existing caller behaves exactly as before. */
        row.note ?? note ?? null,
        enteredBy ?? null
      ));
      written += 1;
    }

    return { written };
  },

  /** Everything declared for one contest in a project, ordered by level. */
  async all(electionId, race) {
    return (await db
      .prepare(
        `SELECT * FROM declared WHERE election_id = ? AND race = ?
          ORDER BY level, place_key`
      )
      .all(required(electionId, "declared.all"), requiredRace(race, "declared.all")))
      .map(toDeclared);
  },

  async count(electionId, race) {
    const row = (await db
      .prepare("SELECT COUNT(*) AS n FROM declared WHERE election_id = ? AND race = ?")
      .get(required(electionId, "declared.count"), requiredRace(race, "declared.count")));
    return Number(row?.n ?? 0);
  },

  /** When the last figure was entered, for "as at" on the dashboard. */
  async lastEntry(electionId, race) {
    const row = (await db
      .prepare(
        `SELECT created_at FROM declared WHERE election_id = ? AND race = ?
          ORDER BY created_at DESC LIMIT 1`
      )
      .get(required(electionId, "declared.lastEntry"), requiredRace(race, "declared.lastEntry")));
    return row?.created_at ? new Date(`${row.created_at}Z`) : null;
  },

  /** Remove one place's declared figure, for an entry made against the wrong code. */
  async remove({ electionId, race, level, key }) {
    (await db
      .prepare(
        `DELETE FROM declared
          WHERE election_id = ? AND race = ? AND level = ? AND place_key = ?`
      )
      .run(
        required(electionId, "declared.remove"),
        requiredRace(race, "declared.remove"),
        level,
        key
      ));
  },
};

const toDeclared = (row) =>
  row && {
    id: row.id,
    level: row.level,
    key: row.place_key,
    stateNumber: row.state_code,
    units: row.units,
    registered: row.registered,
    accredited: row.accredited,
    rejected: row.rejected,
    votes: JSON.parse(row.votes),
    statedTotal: row.stated_total,
    total: row.total,
    source: row.source,
    note: row.note,
    enteredBy: row.entered_by,
    at: row.created_at ? new Date(`${row.created_at}Z`) : null,
  };
