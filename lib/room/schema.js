/**
 * The situation room's tables.
 *
 * Listed here and spread into MIGRATIONS in lib/db.js, so they are created by
 * the same once-per-statement runner as everything else. Additive only: new
 * tables, and new nullable columns on old ones. Nothing here changes what an
 * existing row means.
 *
 * `npm run room:sql` prints these as one file for a database whose schema is
 * applied by hand (production: see AUTO_MIGRATE in lib/db.js).
 */
export const ROOM_MIGRATIONS = [
  /* An account may hold more than one desk, a ground of its own, and
     permissions handed to it by name. All three are JSON and all three are
     null on every account issued before the room had desks. */
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS roles TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS ground TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS grants TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`,

  /* AGENT or WARD_COORDINATOR, and the party's own reference for the person,
     which is what a second import of the party's list matches on. */
  `ALTER TABLE coordinators ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'AGENT'`,
  `ALTER TABLE coordinators ADD COLUMN IF NOT EXISTS party_ref TEXT`,
  `CREATE INDEX IF NOT EXISTS coordinators_party_ref ON coordinators(party_ref)`,

  /* ── WHO FILES FOR WHICH UNIT, AND WHO HOLDS WHICH WARD ─────────────────
     Many to many, and never overwritten: a change ends one row and starts
     another, so the table is its own history. `ended_at IS NULL` is "now". */
  `CREATE TABLE IF NOT EXISTS assignments (
     id          TEXT PRIMARY KEY,
     person_id   TEXT NOT NULL REFERENCES coordinators(id),
     target_type TEXT NOT NULL,
     target_code TEXT NOT NULL,
     role        TEXT NOT NULL,
     source      TEXT NOT NULL DEFAULT 'MANUAL',
     reason      TEXT,
     note        TEXT,
     changed_by  TEXT,
     changed_name TEXT,
     started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     ended_at    TIMESTAMPTZ,
     ended_by    TEXT,
     ended_name  TEXT,
     end_reason  TEXT,
     end_note    TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS assignments_target ON assignments(target_code, ended_at)`,
  `CREATE INDEX IF NOT EXISTS assignments_person ON assignments(person_id, ended_at)`,
  /* One primary agent per polling unit at a time, refused by the database
     and not merely by the screen that would have offered a second. */
  `CREATE UNIQUE INDEX IF NOT EXISTS assignments_one_primary
     ON assignments(target_code) WHERE role = 'PRIMARY' AND ended_at IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS assignments_once
     ON assignments(person_id, target_code) WHERE ended_at IS NULL`,
  /* Every agent already on the roster holds their booth as its primary. The
     roster was the only record of that until now. */
  `INSERT INTO assignments (id, person_id, target_type, target_code, role, source, reason)
   SELECT 'asg_' || c.id, c.id, 'PU', c.unit_code, 'PRIMARY', 'IMPORT', 'On the roster before assignments were kept'
     FROM coordinators c
    WHERE c.unit_code IS NOT NULL AND c.status IN ('ACTIVE', 'PENDING')
      AND c.id = (SELECT c2.id FROM coordinators c2
                   WHERE c2.unit_code = c.unit_code AND c2.status IN ('ACTIVE', 'PENDING')
                   ORDER BY (c2.status = 'ACTIVE') DESC, c2.created_at LIMIT 1)
   ON CONFLICT DO NOTHING`,
  `INSERT INTO assignments (id, person_id, target_type, target_code, role, source, reason)
   SELECT 'asg_' || c.id, c.id, 'PU', c.unit_code, 'BACKUP', 'IMPORT', 'On the roster before assignments were kept'
     FROM coordinators c
    WHERE c.unit_code IS NOT NULL AND c.status IN ('ACTIVE', 'PENDING')
   ON CONFLICT DO NOTHING`,

  `CREATE TABLE IF NOT EXISTS assignment_imports (
     id           TEXT PRIMARY KEY,
     file_name    TEXT,
     preview      TEXT NOT NULL,
     created_by   TEXT,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     committed_at TIMESTAMPTZ
   )`,

  /* The BVAS figure as the agent typed it, kept when a verifier corrects the
     one that counts (`accredited`), and the manual register figure where a
     sheet carries one. The manual figure is shown and never summed. */
  `ALTER TABLE results ADD COLUMN IF NOT EXISTS accredited_agent INTEGER`,
  `ALTER TABLE results ADD COLUMN IF NOT EXISTS accredited_manual INTEGER`,
  `ALTER TABLE results ADD COLUMN IF NOT EXISTS corrected_by TEXT`,
  `ALTER TABLE results ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ`,

  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sos BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_by TEXT`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_name TEXT`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_to TEXT`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS resolved_by TEXT`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS resolved_name TEXT`,
  `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`,

  /* ── OPEN ITEMS: WHAT EVERY LIGHT IS COUNTED FROM ───────────────────────
     One row per thing that is wrong, or unfinished, at one place. Resolved
     rows are kept: the history of a unit is evidence. `raised_by` and
     `filed_by` are who may not resolve it. */
  `CREATE TABLE IF NOT EXISTS room_items (
     id              TEXT PRIMARY KEY,
     election_id     TEXT NOT NULL,
     race            TEXT NOT NULL,
     area_code       TEXT NOT NULL,
     level           TEXT NOT NULL DEFAULT 'pu',
     code            TEXT NOT NULL,
     light           TEXT NOT NULL,
     ref             TEXT NOT NULL DEFAULT '',
     says            TEXT,
     status          TEXT NOT NULL DEFAULT 'OPEN',
     raised_by       TEXT,
     filed_by        TEXT,
     owner_id        TEXT,
     owner_name      TEXT,
     locked_until    TIMESTAMPTZ,
     escalated_to    TEXT,
     escalated_by    TEXT,
     escalated_name  TEXT,
     escalated_at    TIMESTAMPTZ,
     escalation_note TEXT,
     priority        TEXT,
     returned_note   TEXT,
     legal           BOOLEAN NOT NULL DEFAULT false,
     resolution      TEXT,
     resolution_note TEXT,
     resolved_by     TEXT,
     resolved_name   TEXT,
     resolved_at     TIMESTAMPTZ,
     opened_at       TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  /* Which version of the facts an item was raised on. An item a person has
     resolved is not raised again until the facts themselves change. */
  `ALTER TABLE room_items ADD COLUMN IF NOT EXISTS stamp TEXT NOT NULL DEFAULT ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS room_items_one_open
     ON room_items(election_id, race, area_code, code, ref) WHERE status = 'OPEN'`,
  `CREATE INDEX IF NOT EXISTS room_items_open ON room_items(election_id, race, status, light, area_code)`,
  `CREATE INDEX IF NOT EXISTS room_items_area ON room_items(election_id, area_code)`,

  /* ── THE LIGHT ON EACH POLLING UNIT, KEPT AS IT CHANGES ─────────────────
     Written when an item opens or closes or a result arrives, and added up
     by place where it is stored. Reading a light never scans the results. */
  `CREATE TABLE IF NOT EXISTS unit_lights (
     election_id TEXT NOT NULL,
     race        TEXT NOT NULL,
     unit_code   TEXT NOT NULL,
     light       TEXT NOT NULL,
     red         INTEGER NOT NULL DEFAULT 0,
     yellow      INTEGER NOT NULL DEFAULT 0,
     has_result  BOOLEAN NOT NULL DEFAULT false,
     checked     BOOLEAN NOT NULL DEFAULT false,
     counts      BOOLEAN NOT NULL DEFAULT false,
     accredited  INTEGER,
     registered  INTEGER,
     cast_votes  INTEGER,
     rejected    INTEGER,
     malpractice BOOLEAN NOT NULL DEFAULT false,
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (election_id, race, unit_code)
   )`,
  `CREATE INDEX IF NOT EXISTS unit_lights_place ON unit_lights(election_id, race, unit_code text_pattern_ops)`,

  /* A correction changes the one result and keeps what it replaced, until a
     different verifier confirms it or puts the old figures back. */
  `CREATE TABLE IF NOT EXISTS corrections (
     id          TEXT PRIMARY KEY,
     result_id   TEXT NOT NULL,
     election_id TEXT NOT NULL,
     race        TEXT NOT NULL,
     unit_code   TEXT NOT NULL,
     before      TEXT NOT NULL,
     after       TEXT NOT NULL,
     reason      TEXT,
     status      TEXT NOT NULL DEFAULT 'AWAITING_SECOND_CHECK',
     made_by     TEXT NOT NULL,
     made_name   TEXT,
     made_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
     checked_by  TEXT,
     checked_name TEXT,
     checked_at  TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS corrections_result ON corrections(result_id, made_at)`,

  /* What an assigned agent sent that did not become the result: a second
     set of figures, a request to correct, a draft left behind by somebody
     moved off the unit. Kept, shown to a desk, and never counted. */
  `CREATE TABLE IF NOT EXISTS submissions (
     id          TEXT PRIMARY KEY,
     election_id TEXT NOT NULL,
     race        TEXT NOT NULL,
     unit_code   TEXT NOT NULL,
     kind        TEXT NOT NULL,
     person_id   TEXT,
     person_name TEXT,
     figures     TEXT,
     note        TEXT,
     status      TEXT NOT NULL DEFAULT 'OPEN',
     closed_by   TEXT,
     closed_at   TIMESTAMPTZ,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS submissions_unit ON submissions(election_id, unit_code, status)`,

  `CREATE TABLE IF NOT EXISTS room_settings (
     election_id TEXT PRIMARY KEY,
     settings    TEXT NOT NULL,
     updated_by  TEXT,
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  /* What every open screen polls. `area_code` is where it happened, so a
     screen is told only about its own ground; empty is the whole room. */
  `CREATE TABLE IF NOT EXISTS room_events (
     seq         BIGSERIAL PRIMARY KEY,
     election_id TEXT,
     type        TEXT NOT NULL,
     area_code   TEXT NOT NULL DEFAULT '',
     audience    TEXT,
     payload     TEXT,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS room_events_time ON room_events(created_at)`,

  `CREATE TABLE IF NOT EXISTS contact_attempts (
     id          TEXT PRIMARY KEY,
     election_id TEXT NOT NULL,
     unit_code   TEXT NOT NULL,
     person_id   TEXT,
     outcome     TEXT NOT NULL,
     note        TEXT,
     by_id       TEXT,
     by_name     TEXT,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS contact_attempts_unit ON contact_attempts(election_id, unit_code, created_at)`,

  /* Notes on a place, shared by everybody who covers it, and the note a
     person leaves for whoever takes their desk at the end of a shift. */
  `CREATE TABLE IF NOT EXISTS room_notes (
     id          TEXT PRIMARY KEY,
     election_id TEXT NOT NULL,
     kind        TEXT NOT NULL DEFAULT 'NOTE',
     area_code   TEXT NOT NULL DEFAULT '',
     desk        TEXT,
     body        TEXT NOT NULL,
     by_id       TEXT,
     by_name     TEXT,
     to_id       TEXT,
     accepted_by TEXT,
     accepted_at TIMESTAMPTZ,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS room_notes_area ON room_notes(election_id, kind, area_code, created_at)`,

  `CREATE TABLE IF NOT EXISTS tech_incidents (
     id          TEXT PRIMARY KEY,
     title       TEXT NOT NULL,
     detail      TEXT,
     severity    TEXT NOT NULL DEFAULT 'MINOR',
     status      TEXT NOT NULL DEFAULT 'OPEN',
     raised_by   TEXT,
     raised_name TEXT,
     owner_name  TEXT,
     updates     TEXT,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     closed_at   TIMESTAMPTZ
   )`,
  `CREATE TABLE IF NOT EXISTS blocked_addresses (
     ip         TEXT PRIMARY KEY,
     reason     TEXT,
     by_id      TEXT,
     by_name    TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  /* A pack is sealed when it is built: the hash is of its contents, so a
     pack printed next year can be shown to be the one built tonight. */
  `CREATE TABLE IF NOT EXISTS evidence_packs (
     id          TEXT PRIMARY KEY,
     election_id TEXT NOT NULL,
     title       TEXT NOT NULL,
     note        TEXT,
     contents    TEXT NOT NULL,
     hash        TEXT NOT NULL,
     built_by    TEXT,
     built_name  TEXT,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  /* A screen on the wall. It signs in with a key of its own, stored hashed,
     and can do nothing but show what `layout` says. */
  `CREATE TABLE IF NOT EXISTS walls (
     id         TEXT PRIMARY KEY,
     name       TEXT NOT NULL,
     key_hash   TEXT NOT NULL,
     layout     TEXT NOT NULL,
     created_by TEXT,
     seen_at    TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
];
