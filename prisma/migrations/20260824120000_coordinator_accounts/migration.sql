-- Polling unit coordinators: a separate population, held separately.
--
-- ── WHY NOT A ROW IN `users` ──────────────────────────────────────────────
-- Everything about them differs from a Poll360 staff account. There are
-- thousands of them to a newsroom's handful, they are recruited in the
-- fortnight before polling day and finished the morning after, they sign
-- themselves up rather than being issued a credential down a phone line, and
-- they hold exactly one power — file the returns from one booth — where a
-- staff account holds a room. Sharing a table meant one sign-in page trying to
-- address both audiences and serving neither, and one code path where a
-- mistake made for the four thousand could reach the four.

CREATE TABLE IF NOT EXISTS "coordinators" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "email"         TEXT,
    "phone"         TEXT,
    "password_hash" TEXT NOT NULL,
    "unit_code"     TEXT,
    "state_code"    TEXT,
    "status"        TEXT NOT NULL DEFAULT 'PENDING',
    "note"          TEXT,
    "approved_by"   TEXT,
    "approved_at"   TIMESTAMPTZ(3),
    "disabled_at"   TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinators_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "coordinators_email_key" ON "coordinators"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "coordinators_phone_key" ON "coordinators"("phone");
CREATE INDEX IF NOT EXISTS "coordinators_status" ON "coordinators"("status", "created_at");
CREATE INDEX IF NOT EXISTS "coordinators_unit" ON "coordinators"("unit_code");

-- Approving is a staff act, which is the one direction these tables reference
-- each other.
ALTER TABLE "coordinators"
    ADD CONSTRAINT "coordinators_approved_by_fkey"
    FOREIGN KEY ("approved_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Their own sessions, on their own cookie. A twin of `sessions`, deliberately
-- not a shared table: a coordinator's token is then meaningless to the staff
-- lookup and vice versa. Parameterising one over the other would have saved a
-- few lines and turned a mistyped argument into a privilege escalation.
CREATE TABLE IF NOT EXISTS "coordinator_sessions" (
    "id"             TEXT NOT NULL,
    "coordinator_id" TEXT NOT NULL,
    "expires_at"     TIMESTAMPTZ(3) NOT NULL,
    "user_agent"     TEXT,
    "created_at"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "coordinator_sessions_owner" ON "coordinator_sessions"("coordinator_id");
CREATE INDEX IF NOT EXISTS "coordinator_sessions_expiry" ON "coordinator_sessions"("expires_at");

ALTER TABLE "coordinator_sessions"
    ADD CONSTRAINT "coordinator_sessions_coordinator_id_fkey"
    FOREIGN KEY ("coordinator_id") REFERENCES "coordinators"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── THE BRIDGE, AND WHY IT IS A SECOND COLUMN RATHER THAN A REPLACEMENT ───
-- `results.submitted_by` is NOT NULL and references users(id). Hundreds of
-- rows already point through it and the ledger and audit trail read it.
-- Repointing that column at a table those rows have no entry in is a migration
-- that loses the authorship of every return ever filed.
--
-- So a filing carries one of two authors and never both. The CHECK is what
-- stops the pair drifting into a row claiming two authors or none: a result
-- nobody filed is not a result, and one filed by two people is a bug that
-- would surface for the first time in a tribunal.
ALTER TABLE "results" ADD COLUMN IF NOT EXISTS "coordinator_id" TEXT;
ALTER TABLE "results" ALTER COLUMN "submitted_by" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "results_coordinator" ON "results"("coordinator_id");

ALTER TABLE "results"
    ADD CONSTRAINT "results_coordinator_id_fkey"
    FOREIGN KEY ("coordinator_id") REFERENCES "coordinators"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "results" DROP CONSTRAINT IF EXISTS "results_one_author";
ALTER TABLE "results"
    ADD CONSTRAINT "results_one_author"
    CHECK (("submitted_by" IS NULL) <> ("coordinator_id" IS NULL));

-- Incidents come from the same people and need the same bridge.
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "coordinator_id" TEXT;
ALTER TABLE "incidents" ALTER COLUMN "reported_by" DROP NOT NULL;

ALTER TABLE "incidents"
    ADD CONSTRAINT "incidents_coordinator_id_fkey"
    FOREIGN KEY ("coordinator_id") REFERENCES "coordinators"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
