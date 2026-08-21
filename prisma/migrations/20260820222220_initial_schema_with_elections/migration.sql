-- CreateTable
CREATE TABLE "elections" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PRESIDENTIAL',
    "votes_on" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "elections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "scope" TEXT,
    "disabled_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_requests" (
    "id" TEXT NOT NULL,
    "organisation" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "kind" TEXT NOT NULL,
    "election" TEXT,
    "units" INTEGER,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" TEXT NOT NULL,
    "election_id" TEXT NOT NULL,
    "unit_code" TEXT NOT NULL,
    "state_code" TEXT NOT NULL,
    "registered" INTEGER NOT NULL,
    "accredited" INTEGER NOT NULL,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "votes" TEXT NOT NULL,
    "inec_total" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "note" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "distance_m" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'APP',
    "rep_name" TEXT,
    "submitted_by" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_by" TEXT,
    "verified_at" TIMESTAMPTZ(3),

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "election_id" TEXT NOT NULL,
    "unit_code" TEXT NOT NULL,
    "state_code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "detail_sealed" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reported_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_name" TEXT,
    "action" TEXT NOT NULL,
    "subject" TEXT,
    "meta" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger" (
    "seq" SERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "election_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "previous_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "actor_id" TEXT,

    CONSTRAINT "ledger_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "wa_contacts" (
    "id" TEXT NOT NULL,
    "phone_sealed" TEXT NOT NULL,
    "phone_index" TEXT NOT NULL,
    "phone_tail" TEXT NOT NULL,
    "display_name" TEXT,
    "user_id" TEXT,
    "unit_code" TEXT,
    "state_code" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "first_seen" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "wa_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_messages" (
    "id" TEXT NOT NULL,
    "wa_id" TEXT,
    "contact_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "body_sealed" TEXT,
    "media_id" TEXT,
    "step" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_sessions" (
    "contact_id" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "draft" TEXT NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "wa_sessions_pkey" PRIMARY KEY ("contact_id")
);

-- CreateTable
CREATE TABLE "polling_units" (
    "election_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "state_code" TEXT NOT NULL,
    "lga_code" TEXT NOT NULL,
    "ward_code" TEXT NOT NULL,
    "unit_no" TEXT NOT NULL,
    "name" TEXT,
    "ward_name" TEXT,
    "lga_name" TEXT,
    "state_name" TEXT,
    "registered" INTEGER,
    "rep_name" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "first_seen" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "polling_units_pkey" PRIMARY KEY ("election_id","code")
);

-- CreateTable
CREATE TABLE "wa_positions" (
    "id" TEXT NOT NULL,
    "election_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "unit_code" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "label" TEXT,
    "distance_m" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_reads" (
    "id" TEXT NOT NULL,
    "election_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "unit_code" TEXT,
    "media_id" TEXT,
    "raw_text" TEXT,
    "parsed" TEXT,
    "confidence" DOUBLE PRECISION,
    "accepted" INTEGER NOT NULL DEFAULT 0,
    "corrected" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sheet_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "elections_slug_key" ON "elections"("slug");

-- CreateIndex
CREATE INDEX "elections_status_created_at_idx" ON "elections"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "access_requests_status_created_at_idx" ON "access_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "results_election_id_state_code_submitted_at_idx" ON "results"("election_id", "state_code", "submitted_at");

-- CreateIndex
CREATE INDEX "results_election_id_status_idx" ON "results"("election_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "results_election_id_unit_code_key" ON "results"("election_id", "unit_code");

-- CreateIndex
CREATE INDEX "incidents_election_id_created_at_idx" ON "incidents"("election_id", "created_at");

-- CreateIndex
CREATE INDEX "incidents_election_id_state_code_idx" ON "incidents"("election_id", "state_code");

-- CreateIndex
CREATE INDEX "media_incident_id_idx" ON "media"("incident_id");

-- CreateIndex
CREATE INDEX "audit_created_at_idx" ON "audit"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_id_key" ON "ledger"("id");

-- CreateIndex
CREATE INDEX "ledger_election_id_user_id_seq_idx" ON "ledger"("election_id", "user_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "wa_contacts_phone_index_key" ON "wa_contacts"("phone_index");

-- CreateIndex
CREATE INDEX "wa_contacts_last_seen_idx" ON "wa_contacts"("last_seen");

-- CreateIndex
CREATE UNIQUE INDEX "wa_messages_wa_id_key" ON "wa_messages"("wa_id");

-- CreateIndex
CREATE INDEX "wa_messages_contact_id_created_at_idx" ON "wa_messages"("contact_id", "created_at");

-- CreateIndex
CREATE INDEX "wa_messages_created_at_idx" ON "wa_messages"("created_at");

-- CreateIndex
CREATE INDEX "polling_units_election_id_state_code_lga_code_ward_code_idx" ON "polling_units"("election_id", "state_code", "lga_code", "ward_code");

-- CreateIndex
CREATE INDEX "wa_positions_contact_id_created_at_idx" ON "wa_positions"("contact_id", "created_at");

-- CreateIndex
CREATE INDEX "sheet_reads_election_id_created_at_idx" ON "sheet_reads"("election_id", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_contacts" ADD CONSTRAINT "wa_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "wa_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_sessions" ADD CONSTRAINT "wa_sessions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "wa_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polling_units" ADD CONSTRAINT "polling_units_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_positions" ADD CONSTRAINT "wa_positions_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_positions" ADD CONSTRAINT "wa_positions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "wa_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_reads" ADD CONSTRAINT "sheet_reads_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_reads" ADD CONSTRAINT "sheet_reads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "wa_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
