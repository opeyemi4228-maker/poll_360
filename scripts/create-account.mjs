/**
 * Create the first account.
 *
 * Poll360 has no public sign-up, accounts are issued to named people by the
 * room they work for, so the first one is made here. The password comes from
 * the environment rather than from a default in this file, because a seed
 * script with a password in it is how products end up with `admin/admin` still
 * working in production a year later.
 *
 *   ADMIN_EMAIL=you@poll360.ng ADMIN_PASSWORD='a long one' npm run account:create
 *
 * Run it again with the same email to reset that account's password.
 */

import { users } from "../lib/db.js";
import { hashPassword } from "../lib/password.js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || "Poll360 Administrator";
const phone = process.env.ADMIN_PHONE?.replace(/[^\d]/g, "") || null;
const role = process.env.ADMIN_ROLE?.trim().toUpperCase() || "ADMIN";

if (!email || !password) {
  console.error(
    "\nSet ADMIN_EMAIL and ADMIN_PASSWORD:\n\n" +
      "  ADMIN_EMAIL=you@poll360.ng ADMIN_PASSWORD='a long one' npm run account:create\n"
  );
  process.exit(1);
}

if (password.length < 12) {
  console.error("\nADMIN_PASSWORD must be at least 12 characters.\n");
  process.exit(1);
}

const user = users.upsert({
  name,
  email,
  phone,
  role,
  passwordHash: await hashPassword(password),
});

console.log(`\nAccount ready: ${user.name} <${user.email}>, ${user.role}`);
console.log("Sign in at /login\n");
