import { defineConfig } from "prisma/config";

/**
 * Prisma's configuration.
 *
 * ── WHY THIS FILE EXISTS AT ALL ────────────────────────────────────────────
 * Prisma 7 removed `url` from the datasource block in schema.prisma. The
 * connection string now lives here for the CLI (migrate, db push, studio) and
 * is handed to the client separately through a driver adapter. See lib/db.js.
 *
 * ── AND WHY IT READS .env.local ITSELF ─────────────────────────────────────
 * Prisma reads `.env`. Next.js reads `.env.local`. This project keeps its
 * secrets in the latter, so without this the CLI would sit there claiming
 * DATABASE_URL is unset while the application right next to it connects fine.
 * `process.loadEnvFile` is built into Node, so this costs no dependency.
 *
 * ── MIGRATIONS USE THE DIRECT CONNECTION ───────────────────────────────────
 * Neon gives two hosts: a pooled one for the application, and a direct one.
 * Migrations take advisory locks and run long statements, neither of which
 * survives a connection pooler, so they get the unpooled host and the app
 * keeps the pooled one.
 * ───────────────────────────────────────────────────────────────────────────
 */
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* Not every environment has a file on disk — a deployment supplies these
       as real environment variables, and there is nothing to load. */
  }
}

/**
 * ⚠ DO NOT RUN `prisma migrate dev` WHILE lib/db.js STILL SELF-MIGRATES.
 *
 * Two things currently own this schema: the migrations in prisma/migrations,
 * and the MIGRATIONS array inside lib/db.js, which runs CREATE TABLE IF NOT
 * EXISTS and ALTER TABLE against the same database every time the application
 * starts. Prisma sees the columns the other one added, calls it drift, and
 * offers to reset the database — which on this project means deleting every
 * result an election night has produced. It offered exactly that once already
 * and was refused.
 *
 * Until one owner is chosen, use `prisma migrate diff` and `migrate resolve`
 * to record changes that were applied by hand. `db push` and `migrate dev` are
 * not safe here.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  },
});
