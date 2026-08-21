import { neon } from "@neondatabase/serverless";

if (typeof window !== "undefined") {
  throw new Error("lib/sql.js talks to the database and is server only");
}

/**
 * The Postgres connection, and a thin shim over it.
 *
 * ── WHY THERE IS A SHIM AT ALL ─────────────────────────────────────────────
 * Every query in this product was written against `node:sqlite`, whose API is
 * `prepare(text).get(...args)`. Rewriting sixty of them into tagged templates
 * would have meant retyping every WHERE clause in the codebase for no gain and
 * with every retyping a chance to introduce a bug nobody would find until an
 * election night. So the SQL stays exactly as it was, and this converts the
 * calling convention instead: `?` placeholders become `$1`, `$2`, and the
 * three methods return promises.
 *
 * The one thing the shim cannot hide is that Postgres is asynchronous and
 * sqlite was not. Every accessor is `async` now and every caller awaits, which
 * is the real cost of the move and is paid once.
 *
 * ── WHY NEON, AND WHY OVER HTTP ────────────────────────────────────────────
 * The product has to survive being deployed somewhere with no disk, which is
 * where a file-backed database quietly loses every result filed since the last
 * deploy. Neon's driver speaks Postgres over HTTP, so it needs no connection
 * pool held open between requests and no socket a serverless platform will
 * close underneath it.
 * ───────────────────────────────────────────────────────────────────────────
 */

function connectionString() {
  const url = process.env.DATABASE_URL;

  if (!url || url.startsWith("file:")) {
    throw new Error(
      "DATABASE_URL must be a Postgres connection string. Set it in .env.local, and never commit it."
    );
  }

  return url;
}

/* One client per process. It holds no socket, so this is about not rebuilding
   the parser on every request rather than about connection limits. */
const globalForSql = globalThis;
const client = globalForSql.poll360Sql ?? neon(connectionString());
if (process.env.NODE_ENV !== "production") globalForSql.poll360Sql = client;

/**
 * ── WHY QUERIES ARE RETRIED, AND WHICH ONES ARE NOT ────────────────────────
 * The database is now across a network, and a managed Postgres that scales its
 * compute down will take a few seconds to answer the first query after a quiet
 * spell. Occasionally it will not answer at all: the connection times out and
 * the driver throws before the query is ever seen. On a normal product that is
 * a page somebody reloads. On election night it is a return that did not file.
 *
 * So a failure to *reach* the database is retried, briefly and with a growing
 * gap. A failure *from* the database is not: a syntax error, a constraint
 * violation or a missing column will fail identically every time, and retrying
 * it turns one honest error into three and delays it by a second.
 *
 * Everything here is safe to retry because the driver throws before the
 * statement executes when it cannot connect. A statement that reached the
 * server and then failed carries a Postgres error code, which is exactly the
 * case this refuses to repeat.
 */
const ATTEMPTS = 3;

function reachability(error) {
  /* A Postgres error has a SQLSTATE. Anything without one never arrived. */
  if (error?.code && /^[0-9A-Z]{5}$/.test(String(error.code))) return false;
  const text = `${error?.message ?? ""} ${error?.cause?.message ?? ""}`.toLowerCase();
  return /fetch failed|timeout|econnreset|enotfound|socket|network|502|503|504/.test(text);
}

async function attempt(issue) {
  let last;

  for (let n = 1; n <= ATTEMPTS; n += 1) {
    try {
      return await issue();
    } catch (error) {
      last = error;
      if (!reachability(error) || n === ATTEMPTS) break;
      /* 150ms, then 450ms. Long enough for a compute to finish waking, short
         enough that a person waiting on a page does not give up first. */
      await new Promise((resolve) => setTimeout(resolve, 150 * 3 ** (n - 1)));
    }
  }

  throw last;
}

const run = (text, params) => attempt(() => client.query(text, params));

/**
 * The tagged-template client, for callers that want it, with `query` replaced
 * by the retrying version so nothing can reach the database without it.
 */
/**
 * Both call shapes retry, which took two goes to get right.
 *
 * The first version wrapped only `.query`, and the tagged-template form went
 * straight to the driver. Every caller writing sql`SELECT ...` had no retry at
 * all, which is most of them, and the gap was invisible because the two look
 * identical at the call site. Whatever a caller reaches for has to be the
 * protected path, or the protection is decoration.
 */
export const sql = Object.assign(
  (strings, ...values) => attempt(() => client(strings, ...values)),
  client,
  { query: run }
);

/**
 * `?` is sqlite's placeholder and `$1` is Postgres's.
 *
 * Question marks inside string literals would be rewritten by a naive
 * replace, so the text is walked rather than regexed: anything between quotes
 * is copied through untouched. There are no such literals in this codebase
 * today, and this is here so that the day somebody writes one, it does not
 * silently corrupt their query.
 */
function positional(text) {
  let out = "";
  let index = 0;
  let quote = null;

  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];

    if (quote) {
      out += char;
      if (char === quote) quote = null;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      out += char;
      continue;
    }

    out += char === "?" ? `$${(index += 1)}` : char;
  }

  return out;
}

/**
 * The sqlite calling convention, backed by Postgres.
 *
 * `get` returns one row or undefined, `all` returns rows, `run` returns
 * nothing, exactly as before.
 */
export function prepare(text) {
  const query = positional(text);

  return {
    async get(...args) {
      const rows = await run(query, args);
      return rows[0];
    },
    async all(...args) {
      return run(query, args);
    },
    async run(...args) {
      await run(query, args);
    },
  };
}

/**
 * Statements with no parameters, run in order.
 *
 * Postgres over HTTP takes one statement per round trip, so a semicolon
 * separated script is split rather than sent whole. Splitting is done on
 * semicolons outside quotes and outside dollar-quoted blocks, for the same
 * reason the placeholder walk above exists.
 */
export async function exec(script) {
  for (const statement of splitStatements(script)) {
    await run(statement);
  }
}

function splitStatements(script) {
  const out = [];
  let current = "";
  let quote = null;
  let dollar = null;

  for (let at = 0; at < script.length; at += 1) {
    const char = script[at];

    /* Dollar-quoted bodies. A DO block or a function body is full of
       semicolons that are not statement ends, and splitting inside one
       produces two halves that are each a syntax error. */
    if (dollar) {
      current += char;
      if (script.startsWith(dollar, at)) {
        current += script.slice(at + 1, at + dollar.length);
        at += dollar.length - 1;
        dollar = null;
      }
      continue;
    }
    if (!quote && char === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(script.slice(at));
      if (tag) {
        dollar = tag[0];
        current += dollar;
        at += dollar.length - 1;
        continue;
      }
    }

    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ";") {
      if (current.trim()) out.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) out.push(current.trim());
  return out;
}

/**
 * Run several statements as one transaction.
 *
 * Takes builders rather than promises: a promise starts the moment it is
 * created, so an array of already-running queries is not a transaction, it is
 * a race that happens to be written on consecutive lines.
 */
export async function transaction(build) {
  const statements = build((text, ...args) => client.query(positional(text), args));
  return client.transaction(statements);
}
