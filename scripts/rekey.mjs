/**
 * Re-seal every encrypted column under a new key.
 *
 * ── THE TRAP THIS EXISTS TO DEFUSE ─────────────────────────────────────────
 * Without ENCRYPTION_KEY set, the product runs on a key derived from a string
 * written in lib/crypto.js. That is the right default: a fresh checkout works
 * with no setup, and it says loudly on every boot that sealed fields are not
 * secret. What it also means is that everything sealed before somebody sets a
 * real key is sealed with a key anybody can read off GitHub.
 *
 * Setting ENCRYPTION_KEY then does something worse than nothing: the old rows
 * do not error, they come back as "[unreadable: this record failed its
 * integrity check]". Phone numbers, message bodies, incident details. Silently,
 * and only for the records that already existed, so it looks like corruption
 * rather than a key change.
 *
 * So the key is changed here, deliberately, in one pass: read with the old
 * key, write with the new one, and rebuild the blind index, which is keyed too
 * and would otherwise stop matching the numbers it indexes.
 *
 *   node scripts/rekey.mjs --from-dev --to "<base64 key>" [--commit]
 *
 * Without --commit it reports what it would do and changes nothing.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

import { sql } from "../lib/sql.js";

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const toArg = args[args.indexOf("--to") + 1];

if (!args.includes("--from-dev") || !toArg || toArg.startsWith("--")) {
  console.log("usage: node scripts/rekey.mjs --from-dev --to \"<base64 key>\" [--commit]");
  process.exit(1);
}

const VERSION = "v1";

const oldKey = scryptSync("poll360-development-key", "poll360", 32);
const rawNew = Buffer.from(toArg, "base64");
const newKey = rawNew.length === 32 ? rawNew : scryptSync(toArg, "poll360", 32);

if (oldKey.equals(newKey)) {
  console.log("The new key is the development key. Nothing to do.");
  process.exit(0);
}

const open = (sealed, k) => {
  if (!sealed) return null;
  const [version, iv, tag, ciphertext] = String(sealed).split(".");
  if (version !== VERSION) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ciphertext, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
};

const close = (plain, k) => {
  if (plain === null || plain === undefined || plain === "") return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return [VERSION, iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
};

const index = (value, k) =>
  value ? createHash("sha256").update(k).update(String(value).trim().toLowerCase()).digest("hex") : null;

/* table, primary key, and the sealed columns on it */
const TARGETS = [
  { table: "wa_contacts", id: "id", columns: ["phone_sealed"], reindex: "phone_index" },
  { table: "wa_messages", id: "id", columns: ["body_sealed"] },
  { table: "incidents", id: "id", columns: ["detail_sealed"] },
  { table: "sheet_reads", id: "id", columns: ["raw_text"] },
];

let moved = 0;
let unreadable = 0;

for (const target of TARGETS) {
  const cols = [target.id, ...target.columns].join(", ");
  const rows = await sql.query(`SELECT ${cols} FROM ${target.table}`);

  for (const row of rows) {
    const updates = {};

    for (const column of target.columns) {
      const sealed = row[column];
      if (!sealed) continue;

      const plain = open(sealed, oldKey);
      if (plain === null) {
        /* Already under the new key, or genuinely damaged. Either way it is
           left exactly as it is: a re-seal that cannot read the original can
           only destroy it. */
        if (open(sealed, newKey) === null) unreadable += 1;
        continue;
      }

      updates[column] = close(plain, newKey);
      if (target.reindex && column === "phone_sealed") {
        updates[target.reindex] = index(plain, newKey);
      }
    }

    const fields = Object.keys(updates);
    if (!fields.length) continue;

    if (commit) {
      const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
      await sql.query(
        `UPDATE ${target.table} SET ${sets} WHERE ${target.id} = $${fields.length + 1}`,
        [...fields.map((f) => updates[f]), row[target.id]]
      );
    }
    moved += 1;
  }

  console.log(`${target.table.padEnd(14)} ${rows.length} rows read`);
}

console.log("");
console.log(`${moved} rows ${commit ? "re-sealed under the new key" : "would be re-sealed"}`);
if (unreadable) console.log(`${unreadable} sealed values could be read with neither key and were left untouched`);
if (!commit) console.log("\nNothing was changed. Re-run with --commit to apply.");

/* ── AND WHILE THE INDEX IS BEING REBUILT ──────────────────────────────────
   Numbers were indexed exactly as they arrived, so the same coordinator could
   exist twice: once as WhatsApp sent them and once as somebody typed them.
   Re-indexing under one canonical shape makes the duplicates collide, so they
   are merged here rather than left to violate the unique index. The oldest row
   survives, because it is the one everything else already points at. */
if (commit) {
  const { normalisePhone, phoneTail } = await import("../lib/phone.js");
  const contacts = await sql.query("SELECT id, phone_sealed, first_seen FROM wa_contacts ORDER BY first_seen ASC");
  const byNumber = new Map();
  let merged = 0;

  for (const row of contacts) {
    const number = open(row.phone_sealed, newKey);
    if (!number) continue;
    const canonical = normalisePhone(number);
    if (!canonical) continue;

    const keeper = byNumber.get(canonical);
    if (!keeper) {
      byNumber.set(canonical, row.id);
      await sql.query(
        "UPDATE wa_contacts SET phone_sealed = $1, phone_index = $2, phone_tail = $3 WHERE id = $4",
        [close(canonical, newKey), index(canonical, newKey), phoneTail(canonical), row.id]
      );
      continue;
    }

    await sql.query("UPDATE wa_messages SET contact_id = $1 WHERE contact_id = $2", [keeper, row.id]);
    await sql.query("UPDATE wa_positions SET contact_id = $1 WHERE contact_id = $2", [keeper, row.id]);
    await sql.query("UPDATE sheet_reads SET contact_id = $1 WHERE contact_id = $2", [keeper, row.id]);
    await sql.query("DELETE FROM wa_sessions WHERE contact_id = $1", [row.id]);
    await sql.query("DELETE FROM wa_contacts WHERE id = $1", [row.id]);
    merged += 1;
  }

  console.log(`${byNumber.size} distinct numbers, ${merged} duplicate contact${merged === 1 ? "" : "s"} merged`);
}
