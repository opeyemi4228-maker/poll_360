import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";

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
   the same job, but this needs no dependency and — unlike that package — still
   works when the module is imported by a plain node script such as
   scripts/create-account.mjs. */
if (typeof window !== "undefined") {
  throw new Error(
    "lib/db.js is server-only. Importing it into a client component would ship the schema, " +
      "the queries and an attempt to open the database to the browser."
  );
}

/** `file:./data/poll360.db` — a Prisma-style URL, so DATABASE_URL stays portable. */
function databasePath() {
  const url = process.env.DATABASE_URL ?? "file:./data/poll360.db";
  const path = url.startsWith("file:") ? url.slice(5) : url;
  return resolve(process.cwd(), path);
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
     monotonic — two rows written in the same millisecond must still have an
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
     scan a whole evening's feed without dragging images through every query —
     the same reason result sheets are held apart from result rows. The hash is
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
 * `UNIQUE constraint failed: _migrations.n` — taking the build with it.
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
   * Only ever called with bytes the server has already re-encoded — never with
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

  /** Metadata only — never the bytes, so a feed query stays cheap. */
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
   * by remembering to check first — a correction updates the row it belongs to,
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
        existing.id
      );
      return { id: existing.id, amended: true };
    }

    const id = randomUUID();
    db.prepare(
      `INSERT INTO results
         (id, unit_code, state_code, registered, accredited, rejected, votes, note,
          lat, lon, accuracy, distance_m, submitted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      values.submittedBy
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
