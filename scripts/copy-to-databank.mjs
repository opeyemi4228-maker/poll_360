/**
 * Copies every Poll360 table into Data Bank's database, so Poll360 can read
 * and save there once DATABANK_DATABASE_URL is set.
 *
 *     node --env-file=.env.local scripts/copy-to-databank.mjs
 *
 * ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────
 * It only reads from the original database (DATABASE_URL) and removes nothing
 * from it. In Data Bank's database it only creates Poll360's tables in the
 * `public` schema, which Data Bank itself does not use, and it stops before
 * writing anything if any of those tables already exists there.
 *
 * Data Bank's connection is read from DATABANK_DATABASE_URL if set, otherwise
 * from DATABASE_URL in ../DumpSite/.env.local (or DATABANK_ENV_FILE).
 *
 * ── ORDER ──────────────────────────────────────────────────────────────────
 * Run this first; only then add DATABANK_DATABASE_URL to .env.local. Pointing
 * Poll360 at Data Bank's database before the copy finds no tables.
 */
import { readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";

function databankUrl() {
  if (process.env.DATABANK_DATABASE_URL) return process.env.DATABANK_DATABASE_URL.trim();
  const file = process.env.DATABANK_ENV_FILE ?? "../DumpSite/.env.local";
  const line = readFileSync(file, "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error(`No DATABASE_URL in ${file}`);
  return line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
}

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = databankUrl();
const host = (url) => new URL(url).host;
if (!sourceUrl) throw new Error("DATABASE_URL is not set");
if (host(sourceUrl) === host(targetUrl)) throw new Error("The original and Data Bank's database are the same one");

const src = neon(sourceUrl);
const dst = neon(targetUrl);
const q = (name) => `"${name.replace(/"/g, '""')}"`;

/* A dropped connection is retried; an error from Postgres itself is not. */
async function retry(fn) {
  for (let n = 1; ; n += 1) {
    try {
      return await fn();
    } catch (error) {
      if (n >= 5 || /^[0-9A-Z]{5}$/.test(String(error.code ?? ""))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800 * n));
    }
  }
}

console.log(`from ${host(sourceUrl)}\n  to ${host(targetUrl)}`);

const tables = await src`
  SELECT c.oid::int AS oid, c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
   ORDER BY c.relname`;

const clash = await dst`
  SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = ANY(${tables.map((t) => t.name)})`;
if (clash.length) {
  console.log("Stopped, nothing written. Already in Data Bank's database:", clash.map((c) => c.table_name).join(", "));
  process.exit(1);
}

const sequences = await src`
  SELECT sequencename AS name, data_type::text AS type, last_value
    FROM pg_sequences WHERE schemaname = 'public'`;
for (const s of sequences) await dst.query(`CREATE SEQUENCE IF NOT EXISTS public.${q(s.name)} AS ${s.type}`);

/* Tables and their own constraints first; links between tables and plain
   indexes once the rows are in, so load order does not matter. */
const links = [];
const indexes = [];
for (const t of tables) {
  t.columns = await src`
    SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS notnull,
           a.attgenerated AS generated, pg_get_expr(d.adbin, d.adrelid) AS def
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = ${t.oid} AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`;

  const body = t.columns
    .map((c) =>
      c.generated === "s"
        ? `${q(c.name)} ${c.type} GENERATED ALWAYS AS (${c.def}) STORED`
        : `${q(c.name)} ${c.type}${c.def ? ` DEFAULT ${c.def}` : ""}${c.notnull ? " NOT NULL" : ""}`
    )
    .join(", ");
  await dst.query(`CREATE TABLE public.${q(t.name)} (${body})`);

  const constraints = await src`
    SELECT conname, contype, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE conrelid = ${t.oid} AND contype IN ('p', 'u', 'c', 'x', 'f')`;
  for (const c of constraints) {
    const statement = `ALTER TABLE public.${q(t.name)} ADD CONSTRAINT ${q(c.conname)} ${c.def}`;
    if (c.contype === "f") links.push(statement);
    else await dst.query(statement);
  }

  const own = await src`
    SELECT pg_get_indexdef(i.indexrelid) AS def FROM pg_index i
     WHERE i.indrelid = ${t.oid}
       AND i.indexrelid NOT IN (SELECT conindid FROM pg_constraint WHERE conrelid = ${t.oid})`;
  indexes.push(...own.map((i) => i.def));
}
console.log(`created ${tables.length} tables and ${sequences.length} sequences`);

/* Rows travel as jsonb, which carries bytea as hex and timestamps as text, so
   nothing is reinterpreted by the driver on the way through. The original
   cannot take writes, so ctid order is stable across pages. */
for (const t of tables) {
  const names = t.columns.filter((c) => c.generated !== "s").map((c) => q(c.name)).join(", ");
  const size = ["media", "dumpsite_outbox"].includes(t.name) ? 10 : 500;
  for (let offset = 0; ; ) {
    const rows = await retry(() =>
      src.query(`SELECT to_jsonb(x) AS j FROM public.${q(t.name)} x ORDER BY ctid LIMIT ${size} OFFSET ${offset}`)
    );
    if (!rows.length) break;
    await retry(() =>
      dst.query(
        `INSERT INTO public.${q(t.name)} (${names})
         SELECT ${names} FROM jsonb_populate_recordset(NULL::public.${q(t.name)}, $1::jsonb)`,
        [JSON.stringify(rows.map((r) => r.j))]
      )
    );
    offset += rows.length;
  }
}

for (const def of indexes) await dst.query(def);
for (const statement of links) await dst.query(statement);
for (const s of sequences) {
  if (s.last_value !== null) await dst.query(`SELECT setval('public.${q(s.name)}', $1, true)`, [s.last_value]);
}
console.log(`${indexes.length} indexes, ${links.length} links, sequences carried over`);

const report = [];
for (const t of tables) {
  const [{ n: original }] = await src.query(`SELECT count(*)::int AS n FROM public.${q(t.name)}`);
  const [{ n: databank }] = await dst.query(`SELECT count(*)::int AS n FROM public.${q(t.name)}`);
  report.push({ table: t.name, original, databank, match: original === databank });
}
console.table(report);

const [size] = await dst`SELECT pg_size_pretty(pg_database_size(current_database())) AS s`;
const ok = report.every((r) => r.match);
console.log(`Data Bank's database is now ${size.s}. ${ok ? "Every table matches." : "SOME TABLES DO NOT MATCH — do not switch."}`);
if (ok) console.log("Now add DATABANK_DATABASE_URL to .env.local (the same value as DumpSite's DATABASE_URL).");
process.exit(ok ? 0 : 1);
