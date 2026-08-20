import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";

/* Sealing lives in its own module and knows nothing about storage, so importing
   it here creates no cycle. Used only by the WhatsApp tables, where the phone
   number and the message body are both sensitive at rest. */
import { blindIndex, seal, unseal } from "./crypto.js";
import { parseUnitCode } from "./units.js";
import { parties, others } from "./election2023.js";

/**
 * Storage.
 *
 * ── WHY node:sqlite AND NOT AN ORM ─────────────────────────────────────────
 * This layer holds three tables and about a dozen queries. SQLite is built
 * into Node 22+, so it costs nothing to install, has no engine binaries to
 * download into a deployment image, no client to generate before the app can
 * build, and no version of itself to keep in step with the runtime. For an
 * account layer this size, an ORM would be more moving parts than the thing
 * it is moving.
 *
 * ── AND WHY EVERY QUERY IS IN THIS ONE FILE ────────────────────────────────
 * SQLite on a single machine is right for today and wrong for a serverless
 * deployment, where the filesystem does not survive between invocations. So
 * nothing outside this file writes SQL: callers use `users`, `sessions` and
 * `accessRequests` below. Moving to Postgres is then a rewrite of one file
 * against the same six function signatures, rather than a search through the
 * whole application for queries.
 * ───────────────────────────────────────────────────────────────────────────
 */

/* Server-only, enforced rather than documented. The `server-only` package does
   the same job, but this needs no dependency and, unlike that package, still
   works when the module is imported by a plain node script such as
   scripts/create-account.mjs. */
if (typeof window !== "undefined") {
  throw new Error(
    "lib/db.js is server-only. Importing it into a client component would ship the schema, " +
      "the queries and an attempt to open the database to the browser."
  );
}

/** `file:./data/poll360.db`, a Prisma-style URL, so DATABASE_URL stays portable. */
const LOCAL_DEFAULT = "./data/poll360.db";

/**
 * Where the local database file lives.
 *
 * ── DATABASE_URL IS NOT ALWAYS A FILE ──────────────────────────────────────
 * This used to take DATABASE_URL and treat whatever it found as a path. The
 * moment that variable was pointed at Postgres, sqlite obligingly created a
 * directory literally named after the connection string, password and all,
 * and left it sitting in the working tree waiting to be committed. A path is
 * only a path when it says so, so anything carrying a scheme that is not
 * `file:` is ignored here and the local default is used instead.
 */
function databasePath() {
  const url = process.env.DATABASE_URL ?? `file:${LOCAL_DEFAULT}`;

  if (url.startsWith("file:")) return resolve(process.cwd(), url.slice(5));
  /* postgres://, postgresql://, anything else with a scheme: not ours. */
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return resolve(process.cwd(), LOCAL_DEFAULT);

  return resolve(process.cwd(), url);
}

/* One connection per process. Next's dev server re-evaluates modules on every
   change; without the global each reload would open another handle to the same
   file and they would fight over the write lock. */
const globalForDb = globalThis;

function connect() {
  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);

  /* WAL lets a reader and a writer work at once, which matters the moment two
     people are signing in while a third submits the access form. */
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");

  migrate(db);
  return db;
}

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
     disabled_at   TEXT,
     last_login_at TEXT,
     created_at    TEXT NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS sessions (
     id         TEXT PRIMARY KEY,
     user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at TEXT NOT NULL,
     user_agent TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
     created_at   TEXT NOT NULL DEFAULT (datetime('now'))
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
     lat           REAL,
     lon           REAL,
     accuracy      REAL,
     distance_m    REAL,
     submitted_by  TEXT NOT NULL REFERENCES users(id),
     submitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
     verified_by   TEXT REFERENCES users(id),
     verified_at   TEXT,
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
     created_at    TEXT NOT NULL DEFAULT (datetime('now'))
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
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE INDEX IF NOT EXISTS audit_time ON audit(created_at)`,

  /* The agent payment ledger. `seq` is the chain order, and the reason it is an
     INTEGER PRIMARY KEY rather than a timestamp: every entry's hash depends on
     the entry before it, so the ordering has to be storage-level and strictly
     monotonic, two rows written in the same millisecond must still have an
     unambiguous predecessor. There is deliberately no UPDATE or DELETE path to
     this table anywhere in the codebase. See lib/ledger.js. */
  `CREATE TABLE IF NOT EXISTS ledger (
     seq           INTEGER PRIMARY KEY AUTOINCREMENT,
     id            TEXT NOT NULL UNIQUE,
     user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
     kind          TEXT NOT NULL,
     amount        INTEGER NOT NULL,
     reference     TEXT NOT NULL,
     note          TEXT,
     created_at    TEXT NOT NULL,
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
     created_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
     first_seen    TEXT NOT NULL DEFAULT (datetime('now')),
     last_seen     TEXT NOT NULL DEFAULT (datetime('now')),
     message_count INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS wa_contacts_seen ON wa_contacts(last_seen DESC)`,

  /* Every message either way. Bodies are sealed: a booth reporting that armed
     men are at the gate is exactly the traffic that must not sit in clear in a
     backup. `wa_id` is the provider's own id, unique so a webhook redelivery
     writes nothing twice. */
  `CREATE TABLE IF NOT EXISTS wa_messages (
     id            TEXT PRIMARY KEY,
     wa_id         TEXT UNIQUE,
     contact_id    TEXT NOT NULL REFERENCES wa_contacts(id),
     direction     TEXT NOT NULL,
     kind          TEXT NOT NULL DEFAULT 'text',
     body_sealed   TEXT,
     media_id      TEXT REFERENCES media(id),
     step          TEXT,
     status        TEXT NOT NULL DEFAULT 'RECEIVED',
     created_at    TEXT NOT NULL DEFAULT (datetime('now'))
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
     started_at    TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
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
     lat           REAL,
     lon           REAL,
     source        TEXT NOT NULL DEFAULT 'WHATSAPP',
     first_seen    TEXT NOT NULL DEFAULT (datetime('now')),
     last_seen     TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE INDEX IF NOT EXISTS pu_state ON polling_units(state_code, lga_code, ward_code)`,

  /* Where a coordinator is, over time, not merely where they last were. A
     single current position answers "are they there"; the trail answers "did
     they arrive, when, and have they moved since", which is the question a
     watch officer actually has at 2am. */
  `CREATE TABLE IF NOT EXISTS wa_positions (
     id            TEXT PRIMARY KEY,
     contact_id    TEXT NOT NULL REFERENCES wa_contacts(id),
     unit_code     TEXT,
     lat           REAL NOT NULL,
     lon           REAL NOT NULL,
     accuracy      REAL,
     label         TEXT,
     distance_m    REAL,
     created_at    TEXT NOT NULL DEFAULT (datetime('now'))
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
     confidence    REAL,
     accepted      INTEGER NOT NULL DEFAULT 0,
     corrected     TEXT,
     created_at    TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE INDEX IF NOT EXISTS sheet_reads_recent ON sheet_reads(created_at DESC)`,

  /* How a return reached us, so the results board can say so. */
  `ALTER TABLE results ADD COLUMN source TEXT NOT NULL DEFAULT 'APP'`,
  `ALTER TABLE results ADD COLUMN rep_name TEXT`,

];

/**
 * Bring the schema up to date, once, however many processes try at once.
 *
 * ── WHY THE TRANSACTION IS NOT OPTIONAL ────────────────────────────────────
 * More than one process opens this file at the same time, and not only on
 * election night: `next build` collects page data in seven parallel workers,
 * each of which evaluates this module. Reading the done-set and then writing to
 * it is two steps, and without a lock held across both, two workers both see
 * migration 0 as pending, both run it, and the second one dies on
 * `UNIQUE constraint failed: _migrations.n`, taking the build with it.
 *
 * `BEGIN IMMEDIATE` takes the write lock before the first read, so the second
 * process waits (up to the busy_timeout set in `connect`) and then reads a
 * done-set that already includes everything the first one did. `INSERT OR
 * IGNORE` is the belt to that braces: every statement below is written
 * `IF NOT EXISTS` and is safe to run twice, so a duplicate bookkeeping row is
 * not worth throwing over.
 * ───────────────────────────────────────────────────────────────────────────
 */
function migrate(db) {
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (n INTEGER PRIMARY KEY, run_at TEXT NOT NULL)");

  db.exec("BEGIN IMMEDIATE");
  try {
    const done = new Set(db.prepare("SELECT n FROM _migrations").all().map((row) => row.n));

    for (const [index, statement] of MIGRATIONS.entries()) {
      if (done.has(index)) continue;
      db.exec(statement);
      db.prepare(
        "INSERT OR IGNORE INTO _migrations (n, run_at) VALUES (?, datetime('now'))"
      ).run(index);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export const db = globalForDb.poll360Db ?? connect();
if (process.env.NODE_ENV !== "production") globalForDb.poll360Db = db;

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
    disabledAt: row.disabled_at ? new Date(`${row.disabled_at}Z`) : null,
    lastLoginAt: row.last_login_at ? new Date(`${row.last_login_at}Z`) : null,
    createdAt: new Date(`${row.created_at}Z`),
  };
}

/* ------------------------------------------------------------------- users */

export const users = {
  findByEmail(email) {
    return toUser(db.prepare("SELECT * FROM users WHERE email = ?").get(email));
  },

  findByPhone(phone) {
    return toUser(db.prepare("SELECT * FROM users WHERE phone = ?").get(phone));
  },

  findById(id) {
    return toUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
  },

  markSignedIn(id) {
    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(id);
  },

  /** Used by the seed script, which is the only way an account is created. */
  upsert({ name, email, phone, passwordHash, role = "VIEWER", scope = null }) {
    const existing = email ? users.findByEmail(email) : null;

    if (existing) {
      db.prepare(
        "UPDATE users SET name = ?, phone = ?, password_hash = ?, role = ?, scope = ?, disabled_at = NULL WHERE id = ?"
      ).run(name, phone, passwordHash, role, scope, existing.id);
      return users.findById(existing.id);
    }

    const id = randomUUID();
    db.prepare(
      `INSERT INTO users (id, name, email, phone, password_hash, role, scope)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, email ?? null, phone ?? null, passwordHash, role, scope);
    return users.findById(id);
  },
};

/* ---------------------------------------------------------------- sessions */

export const sessions = {
  create({ id, userId, expiresAt, userAgent }) {
    db.prepare(
      "INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)"
    ).run(id, userId, expiresAt.toISOString(), userAgent ?? null);
  },

  /**
   * The session and its account in one statement.
   *
   * Joined rather than fetched separately so a disabled account and a missing
   * session cannot be answered by two code paths that drift apart.
   */
  findWithUser(id) {
    const row = db
      .prepare(
        `SELECT s.expires_at, u.id, u.name, u.email, u.phone, u.role, u.scope, u.disabled_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.id = ?`
      )
      .get(id);

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
    };
  },

  destroy(id) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  },

  sweepExpired() {
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
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
  attach({ incidentId, mime, bytes, width, height }) {
    const id = randomUUID();
    const hash = createHash("sha256").update(bytes).digest("hex");
    db.prepare(
      `INSERT INTO media (id, incident_id, mime, bytes, width, height, hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, incidentId, mime, bytes, width ?? null, height ?? null, hash);
    return { id, hash };
  },

  /** Metadata only, never the bytes, so a feed query stays cheap. */
  forIncidents(ids) {
    if (!ids.length) return new Map();
    const marks = ids.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT id, incident_id, mime, width, height, hash
           FROM media WHERE incident_id IN (${marks}) ORDER BY created_at ASC`
      )
      .all(...ids);

    const grouped = new Map();
    for (const row of rows) {
      const list = grouped.get(row.incident_id) ?? [];
      list.push({ id: row.id, mime: row.mime, width: row.width, height: row.height, hash: row.hash });
      grouped.set(row.incident_id, list);
    }
    return grouped;
  },

  /** The bytes, for the authenticated route that serves them. */
  bytes(id) {
    return db.prepare("SELECT mime, bytes, hash FROM media WHERE id = ?").get(id) ?? null;
  },
};

/* --------------------------------------------------------- access requests */

export const accessRequests = {
  create(values) {
    const id = randomUUID();
    db.prepare(
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
    );
    return id;
  },

  recent(take = 20) {
    return db
      .prepare("SELECT * FROM access_requests ORDER BY created_at DESC LIMIT ?")
      .all(take)
      .map((row) => ({ ...row, createdAt: new Date(`${row.created_at}Z`) }));
  },
};

/* ----------------------------------------------------------------- results */

const toResult = (row) =>
  row && {
    id: row.id,
    unitCode: row.unit_code,
    stateCode: row.state_code,
    registered: row.registered,
    accredited: row.accredited,
    rejected: row.rejected,
    votes: JSON.parse(row.votes),
    status: row.status,
    note: row.note,
    position:
      row.lat == null
        ? null
        : { lat: row.lat, lon: row.lon, accuracy: row.accuracy, distance: row.distance_m },
    submittedBy: row.submitted_by,
    submittedAt: new Date(`${row.submitted_at}Z`),
    verifiedAt: row.verified_at ? new Date(`${row.verified_at}Z`) : null,
  };

export const results = {
  /**
   * File or amend. One row per booth, enforced by the unique index rather than
   * by remembering to check first, a correction updates the row it belongs to,
   * and amending a verified return drops it back to unverified because the
   * check it passed was against different numbers.
   */
  file(values) {
    const existing = results.forUnit(values.unitCode);
    const votes = JSON.stringify(values.votes);

    if (existing) {
      db.prepare(
        `UPDATE results SET registered = ?, accredited = ?, rejected = ?, votes = ?,
           note = ?, lat = ?, lon = ?, accuracy = ?, distance_m = ?,
           submitted_by = ?, submitted_at = datetime('now'),
           source = ?, rep_name = COALESCE(?, rep_name),
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
        values.submittedBy,
        values.source ?? "APP",
        values.repName ?? null,
        existing.id
      );
      return { id: existing.id, amended: true };
    }

    const id = randomUUID();
    db.prepare(
      `INSERT INTO results
         (id, unit_code, state_code, registered, accredited, rejected, votes, note,
          lat, lon, accuracy, distance_m, submitted_by, source, rep_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
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
      values.submittedBy,
      /* How it reached us, so the board can say so, and who presided, which
         until now had nowhere to live at all. */
      values.source ?? "APP",
      values.repName ?? null
    );
    return { id, amended: false };
  },

  forUnit(unitCode) {
    return toResult(db.prepare("SELECT * FROM results WHERE unit_code = ?").get(unitCode));
  },

  recent(take = 25) {
    return db
      .prepare("SELECT * FROM results ORDER BY submitted_at DESC LIMIT ?")
      .all(take)
      .map(toResult);
  },

  /** Disputed rows stay in the table and out of every sum. */
  counted() {
    return db
      .prepare("SELECT * FROM results WHERE status IN ('SUBMITTED','VERIFIED')")
      .all()
      .map(toResult);
  },

  setStatus(id, status, verifierId) {
    db.prepare(
      `UPDATE results SET status = ?,
         verified_by = CASE WHEN ? = 'VERIFIED' THEN ? ELSE NULL END,
         verified_at = CASE WHEN ? = 'VERIFIED' THEN datetime('now') ELSE NULL END
       WHERE id = ?`
    ).run(status, status, verifierId, status, id);
  },

  tally() {
    const rows = results.counted();
    const totals = {};
    let registered = 0;
    let accredited = 0;

    for (const row of rows) {
      registered += row.registered;
      accredited += row.accredited;
      for (const [party, count] of Object.entries(row.votes)) {
        totals[party] = (totals[party] ?? 0) + count;
      }
    }

    return { units: rows.length, registered, accredited, totals };
  },
};

/* --------------------------------------------------------------- incidents */

export const incidents = {
  create(values) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO incidents (id, unit_code, state_code, kind, severity, detail_sealed, reported_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      values.unitCode,
      values.stateCode,
      values.kind,
      values.severity,
      values.detailSealed ?? null,
      values.reportedBy
    );
    return id;
  },

  recent(take = 40) {
    return db
      .prepare(
        `SELECT i.*, u.name AS reporter
           FROM incidents i LEFT JOIN users u ON u.id = i.reported_by
          ORDER BY i.created_at DESC LIMIT ?`
      )
      .all(take)
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
  record({ actorId, actorName, action, subject, meta, ip }) {
    db.prepare(
      "INSERT INTO audit (id, actor_id, actor_name, action, subject, meta, ip) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      randomUUID(),
      actorId ?? null,
      actorName ?? null,
      action,
      subject ?? null,
      meta ? JSON.stringify(meta) : null,
      ip ?? null
    );
  },

  recent(take = 50) {
    return db
      .prepare("SELECT * FROM audit ORDER BY created_at DESC LIMIT ?")
      .all(take)
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
  contactFor(phone, displayName = null) {
    const index = blindIndex(phone);
    const found = db.prepare("SELECT * FROM wa_contacts WHERE phone_index = ?").get(index);

    if (found) {
      db.prepare(
        `UPDATE wa_contacts SET last_seen = datetime('now'),
           message_count = message_count + 1,
           display_name = COALESCE(?, display_name)
         WHERE id = ?`
      ).run(displayName, found.id);
      return shapeContact({ ...found, message_count: found.message_count + 1 });
    }

    const id = randomUUID();
    db.prepare(
      `INSERT INTO wa_contacts (id, phone_sealed, phone_index, phone_tail, display_name, message_count)
       VALUES (?, ?, ?, ?, ?, 1)`
    ).run(id, seal(phone), index, String(phone).slice(-4), displayName);

    return shapeContact(db.prepare("SELECT * FROM wa_contacts WHERE id = ?").get(id));
  },

  /** Tie a chat identity to a real account and its booth. */
  claim(contactId, { userId, unitCode, stateCode }) {
    db.prepare(
      `UPDATE wa_contacts SET user_id = ?, unit_code = ?, state_code = ?, status = 'VERIFIED'
       WHERE id = ?`
    ).run(userId ?? null, unitCode ?? null, stateCode ?? null, contactId);
  },

  block(contactId) {
    db.prepare("UPDATE wa_contacts SET status = 'BLOCKED' WHERE id = ?").run(contactId);
  },

  contacts(take = 100) {
    return db
      .prepare("SELECT * FROM wa_contacts ORDER BY last_seen DESC LIMIT ?")
      .all(take)
      .map(shapeContact);
  },

  contact(id) {
    const row = db.prepare("SELECT * FROM wa_contacts WHERE id = ?").get(id);
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
        `INSERT OR IGNORE INTO wa_messages (id, wa_id, contact_id, direction, kind, body_sealed, media_id, step, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, waId, contactId, direction, kind, seal(body), mediaId, step, status);

    return done.changes ? id : null;
  },

  thread(contactId, take = 60) {
    return db
      .prepare("SELECT * FROM wa_messages WHERE contact_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(contactId, take)
      .map(shapeMessage)
      .reverse();
  },

  recent(take = 60) {
    return db
      .prepare(
        `SELECT m.*, c.phone_tail, c.display_name, c.unit_code, c.status AS contact_status
         FROM wa_messages m JOIN wa_contacts c ON c.id = m.contact_id
         ORDER BY m.created_at DESC, m.rowid DESC LIMIT ?`
      )
      .all(take)
      .map((row) => ({
        ...shapeMessage(row),
        tail: row.phone_tail,
        name: row.display_name,
        unitCode: row.unit_code,
        contactStatus: row.contact_status,
      }));
  },

  /* ------------------------------------------------------- conversations */
  session(contactId) {
    const row = db.prepare("SELECT * FROM wa_sessions WHERE contact_id = ?").get(contactId);
    if (!row) return null;
    return { ...row, draft: JSON.parse(row.draft), contactId: row.contact_id };
  },

  saveSession(contactId, step, draft, attempts = 0) {
    db.prepare(
      `INSERT INTO wa_sessions (contact_id, step, draft, attempts)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(contact_id) DO UPDATE SET
         step = excluded.step, draft = excluded.draft,
         attempts = excluded.attempts, updated_at = datetime('now')`
    ).run(contactId, step, JSON.stringify(draft), attempts);
  },

  endSession(contactId) {
    db.prepare("DELETE FROM wa_sessions WHERE contact_id = ?").run(contactId);
  },

  openSessions() {
    return db
      .prepare(
        `SELECT s.*, c.phone_tail, c.display_name, c.unit_code
         FROM wa_sessions s JOIN wa_contacts c ON c.id = s.contact_id
         ORDER BY s.updated_at DESC`
      )
      .all()
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
  summary() {
    const row = db
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
      .get();
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
export function revealPhone(contactId) {
  const row = db.prepare("SELECT phone_sealed FROM wa_contacts WHERE id = ?").get(contactId);
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
  register({ code, name, wardName, lgaName, stateName, registered, repName, lat, lon, source = "WHATSAPP" }) {
    /* The address is read off the code rather than taken from the caller. A
       later update that carries only a position must not have to restate the
       hierarchy, and an upsert evaluates its INSERT values before it ever
       reaches the conflict clause, so a partial call with no state would fail
       the NOT NULL on the way in. Deriving it here means every call is
       complete by construction. */
    const at = parseUnitCode(code);
    if (!at) return false;

    db.prepare(
      `INSERT INTO polling_units
         (code, state_code, lga_code, ward_code, unit_no, name, ward_name, lga_name, state_name,
          registered, rep_name, lat, lon, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         last_seen  = datetime('now'),
         name       = COALESCE(excluded.name, polling_units.name),
         ward_name  = COALESCE(excluded.ward_name, polling_units.ward_name),
         lga_name   = COALESCE(excluded.lga_name, polling_units.lga_name),
         state_name = COALESCE(excluded.state_name, polling_units.state_name),
         registered = COALESCE(excluded.registered, polling_units.registered),
         rep_name   = COALESCE(excluded.rep_name, polling_units.rep_name),
         lat        = COALESCE(excluded.lat, polling_units.lat),
         lon        = COALESCE(excluded.lon, polling_units.lon)`
    ).run(
      at.code, at.stateCode ?? at.stateNumber, at.lgaCode, at.wardCode, at.unitNo,
      name ?? null, wardName ?? null, lgaName ?? null, stateName ?? at.stateName ?? null,
      registered ?? null, repName ?? null, lat ?? null, lon ?? null, source
    );

    return true;
  },

  /**
   * Every registered unit with whatever has been filed against it.
   *
   * One query with a join rather than a query per unit: the tree is built in
   * one pass over this, and a per-unit lookup at 176,623 units is the kind of
   * thing that works perfectly in a demo and falls over on the night.
   */
  all() {
    return db
      .prepare(
        `SELECT p.*, r.registered AS r_registered, r.accredited, r.rejected, r.votes,
                r.status, r.submitted_at, r.source AS r_source, r.rep_name AS r_rep
           FROM polling_units p
           LEFT JOIN results r ON r.unit_code = p.code
          ORDER BY p.code`
      )
      .all()
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
  at(code) {
    const row = db.prepare("SELECT * FROM polling_units WHERE code = ?").get(code);
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

  count() {
    return db.prepare("SELECT COUNT(*) AS n FROM polling_units").get()?.n ?? 0;
  },

  reported() {
    return (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM polling_units p JOIN results r ON r.unit_code = p.code"
        )
        .get()?.n ?? 0
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
  return [...parties, others].map((party) => parsed[party.id] ?? 0);
}

/** Where coordinators are, over time. */
export const positions = {
  record({ contactId, unitCode = null, lat, lon, accuracy = null, label = null, distance = null }) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO wa_positions (id, contact_id, unit_code, lat, lon, accuracy, label, distance_m)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, contactId, unitCode, lat, lon, accuracy, label, distance);
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
  latest() {
    return db
      .prepare(
        `SELECT * FROM (
           SELECT p.*, c.display_name, c.phone_tail, c.unit_code AS contact_unit,
                  ROW_NUMBER() OVER (PARTITION BY p.contact_id ORDER BY p.created_at DESC, p.rowid DESC) AS rn
             FROM wa_positions p JOIN wa_contacts c ON c.id = p.contact_id
         ) WHERE rn = 1`
      )
      .all()
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
  latestFor(contactId) {
    const row = db
      .prepare(
        "SELECT * FROM wa_positions WHERE contact_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1"
      )
      .get(contactId);
    if (!row) return null;
    return {
      lat: row.lat,
      lon: row.lon,
      accuracy: row.accuracy,
      distance: row.distance_m,
      at: new Date(row.created_at),
    };
  },

  trail(contactId, take = 40) {
    return db
      .prepare("SELECT * FROM wa_positions WHERE contact_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(contactId, take)
      .map((row) => ({ lat: row.lat, lon: row.lon, at: new Date(row.created_at) }));
  },
};

/** What the reader made of a sheet, kept beside what the agent confirmed. */
export const sheetReads = {
  record({ contactId, unitCode, mediaId, rawText, parsed, confidence }) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO sheet_reads (id, contact_id, unit_code, media_id, raw_text, parsed, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, contactId ?? null, unitCode ?? null, mediaId ?? null, seal(rawText), JSON.stringify(parsed), confidence ?? null);
    return id;
  },

  /** Marked when the agent accepts, with whatever they changed. */
  accept(id, corrected = null) {
    db.prepare("UPDATE sheet_reads SET accepted = 1, corrected = ? WHERE id = ?").run(
      corrected ? JSON.stringify(corrected) : null,
      id
    );
  },

  recent(take = 40) {
    return db
      .prepare("SELECT * FROM sheet_reads ORDER BY created_at DESC LIMIT ?")
      .all(take)
      .map((row) => ({
        id: row.id,
        unitCode: row.unit_code,
        parsed: JSON.parse(row.parsed),
        corrected: row.corrected ? JSON.parse(row.corrected) : null,
        confidence: row.confidence,
        accepted: Boolean(row.accepted),
        at: new Date(row.created_at),
      }));
  },

  summary() {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(accepted) AS accepted,
                AVG(confidence) AS confidence
           FROM sheet_reads`
      )
      .get();
    return { total: row?.total ?? 0, accepted: row?.accepted ?? 0, confidence: row?.confidence ?? null };
  },
};
