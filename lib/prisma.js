import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";

/**
 * The database client.
 *
 * ── ONE CLIENT PER PROCESS, AND WHY THE GLOBAL ─────────────────────────────
 * Next's dev server re-evaluates modules on every change. Without pinning the
 * client to a global, each reload would open another connection pool against
 * Neon and they would sit there holding connections until the plan's limit was
 * reached and sign-in started failing for no visible reason.
 *
 * ── THE POOLED HOST, NOT THE DIRECT ONE ────────────────────────────────────
 * The application uses Neon's pooled endpoint: a serverless function is a
 * short-lived process, and a hundred of them opening direct connections is how
 * a Postgres instance falls over. Migrations use the direct host instead, for
 * the opposite reason — see prisma.config.ts.
 * ───────────────────────────────────────────────────────────────────────────
 */
if (typeof window !== "undefined") {
  throw new Error(
    "lib/prisma.js is server-only. Importing it into a client component would ship the " +
      "schema, the queries and a database connection string to the browser."
  );
}

const globalForPrisma = globalThis;

function create() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and put your Postgres " +
        "connection string in it — the application has no local fallback any more."
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    /* Warnings and errors only. Logging every query would put unit codes and
       phone-number indexes into whatever collects stdout in production. */
    log: ["warn", "error"],
  });
}

export const prisma = globalForPrisma.poll360Prisma ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.poll360Prisma = prisma;
