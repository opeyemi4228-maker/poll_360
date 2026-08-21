/**
 * Disable the demonstration accounts.
 *
 * ── WHY DISABLE AND NOT DELETE ─────────────────────────────────────────────
 * Every result and every incident carries the id of whoever filed it, as a
 * foreign key. Deleting the account that filed four hundred returns would
 * either fail on that constraint or, worse, take the returns with it. The
 * point of an audit trail is that it survives the person leaving.
 *
 * So the account is disabled and its password is replaced with a random one
 * nobody holds: it can no longer be signed into, every row it wrote still says
 * who wrote it, and the history stays readable.
 *
 *   node --env-file=.env.local scripts/retire-demo-accounts.mjs [--dry-run]
 */

import { randomBytes } from "node:crypto";

import { hashPassword } from "../lib/password.js";
import { prepare } from "../lib/sql.js";

const DRY = process.argv.includes("--dry-run");

/* The published ones: the four in .env.example, and the generated field agents
   the demonstration seed creates. */
const PATTERNS = ["%@poll360.ng", "%@example.ng"];

const rows = [];
for (const pattern of PATTERNS) {
  const found = await prepare(
    "SELECT id, name, email, role FROM users WHERE email LIKE ? AND disabled_at IS NULL"
  ).all(pattern);
  rows.push(...found);
}

if (!rows.length) {
  console.log("No enabled demonstration accounts found. Nothing to do.");
  process.exit(0);
}

console.log(`${DRY ? "Would disable" : "Disabling"} ${rows.length} demonstration account(s):\n`);
for (const row of rows) {
  console.log(`  ${String(row.role).padEnd(16)} ${row.email}`);
}

if (DRY) {
  console.log("\nDry run — nothing changed.");
  process.exit(0);
}

for (const row of rows) {
  /* A password nobody has, rather than an empty one: an account with no usable
     hash is an account somebody's next migration might treat as passwordless. */
  const dead = await hashPassword(randomBytes(32).toString("base64"));
  await prepare(
    "UPDATE users SET disabled_at = now(), password_hash = ? WHERE id = ?"
  ).run(dead, row.id);
}

console.log(`\nDisabled ${rows.length} account(s). Their filed rows are untouched.`);
console.log("Create a real administrator with: npm run account:create");
