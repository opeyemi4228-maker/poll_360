/**
 * A counter every instance of this application can see.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A LIMITER HELD IN ONE PROCESS'S MEMORY IS NOT A LIMIT
 *
 *  lib/ratelimit.js counts sign-in failures in a Map. On one machine that is
 *  exactly right. This deploys to a platform that runs the application in as
 *  many instances as the traffic asks for, and each one starts that Map
 *  empty — so "eight attempts" is eight attempts *per instance*, and a caller
 *  working through a password list is handed a fresh budget every time the
 *  platform routes them somewhere new. On a quiet night there is one
 *  instance and the limiter works. On the night somebody is actually
 *  attacking it, there are forty, and it does not.
 *
 *  The same is true of a restart, and a deploy is a restart.
 *
 *  So the count has to live somewhere every instance can reach.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THREE PLACES IT CAN LIVE, IN ORDER ─────────────────────────────────────
 *
 *   REDIS      If UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are
 *              set. One HTTP round trip, no connection to hold open, which is
 *              the only shape that works on serverless hosting. This is the
 *              right answer at the scale this product is built for and it is
 *              the one to reach for first.
 *
 *   POSTGRES   Otherwise. The database is already there, already reachable,
 *              and one upsert is one round trip — the same cost as Redis, on
 *              a connection this product already pays for. Slower per call
 *              and entirely adequate for the paths this actually guards,
 *              which are sign-in, sign-up and the other places a person
 *              types a credential. It is deliberately *not* used for
 *              anything that runs on every page view.
 *
 *   MEMORY     If neither is configured, and in tests. Honest about being
 *              per-process, which is what the fallback below says out loud
 *              rather than pretending otherwise.
 *
 * ── AND IT FAILS OPEN, ON PURPOSE ──────────────────────────────────────────
 * If the shared store cannot be reached, this returns a count of 1 — as
 * though the caller were the first — and the in-process limiter still applies
 * underneath it. The alternative is that a Redis hiccup at nine o'clock on
 * election night locks four thousand agents out of the product. A limiter is
 * a defence against a nuisance; it must never become the outage.
 */

/* ────────────────────────────────────────────────────────────── the drivers */

/**
 * ── READ WHEN ASKED, NOT WHEN THIS FILE LOADS ──────────────────────────────
 * These were constants evaluated as the module loaded, which is the ordinary
 * way to write it and has one consequence that is not ordinary: nothing that
 * imports this file, directly or through something else, can ever see a
 * configuration change without the whole process restarting. That bit the
 * check in lib/environment.js, which exists precisely to report on this
 * setting and was reporting on whatever the environment held the first time
 * anything imported this.
 *
 * Reading them on each call costs a property lookup.
 */
const redisUrl = () => process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/$/, "") ?? "";
const redisToken = () => process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";

/** How long to wait on the shared store before giving up and failing open. */
const TIMEOUT_MS = 1500;

/** Which one this deployment is using, for the health screen to print. */
export function counterBacking() {
  if (redisUrl() && redisToken()) return "redis";
  if (process.env.DATABASE_URL || process.env.DATABANK_DATABASE_URL) return "postgres";
  return "memory";
}

/**
 * Redis, over its REST interface.
 *
 * INCR then EXPIRE, pipelined into one request so the window cannot be lost
 * between two round trips. EXPIRE is set unconditionally rather than only on
 * the first increment: a key whose expiry was somehow never applied would
 * otherwise count forever, and re-setting it costs nothing.
 *
 * ── WHY NOT A SLIDING WINDOW ───────────────────────────────────────────────
 * A fixed window lets a caller spend their whole budget at the end of one
 * window and again at the start of the next, so the true worst case is twice
 * the limit over a moment. For "eight wrong passwords in ten minutes" that is
 * sixteen, which changes nothing about whether a password list gets anywhere,
 * and it costs one key instead of a sorted set per caller.
 */
async function redisIncrement(key, windowMs) {
  const seconds = Math.max(1, Math.ceil(windowMs / 1000));
  const response = await fetch(`${redisUrl()}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${redisToken()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, String(seconds)],
    ]),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    /* Nothing here is cacheable and a cached counter is not a counter. */
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`redis http ${response.status}`);

  const answers = await response.json();
  const count = Number(answers?.[0]?.result);
  if (!Number.isFinite(count)) throw new Error("redis returned no count");
  return count;
}

/**
 * Postgres.
 *
 * One statement: insert the counter for this key and this window, or add one
 * to it if the row is already there, and hand back the total. Two callers
 * racing produce two increments rather than one lost update, because the
 * database resolves the conflict rather than the application reading and then
 * writing.
 *
 * The window start is part of the key, so a new window is a new row rather
 * than an update that has to reset a count — which means there is no moment
 * where a reset and an increment can cross.
 */
async function postgresIncrement(key, windowMs) {
  const { sql } = await import("./sql.js");
  const startedAt = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const rows = await sql`
    INSERT INTO rate_counters (bucket, window_start, n)
    VALUES (${key}, ${startedAt.toISOString()}, 1)
    ON CONFLICT (bucket, window_start) DO UPDATE SET n = rate_counters.n + 1
    RETURNING n
  `;

  return Number(rows?.[0]?.n ?? 1);
}

/**
 * Memory, for a single process and for the test suite.
 *
 * Bounded, because an unbounded map keyed by something a caller influences is
 * a way to exhaust a server's memory without sending anything that looks like
 * an attack.
 */
const local = new Map();
const LOCAL_CEILING = 20_000;

function memoryIncrement(key, windowMs) {
  const now = Date.now();

  if (local.size > LOCAL_CEILING) {
    for (const [at, entry] of local) if (entry.until <= now) local.delete(at);
    /* Still full: the window is long and the traffic is wide. Drop the oldest
       half rather than grow, since the alternative is the process dying. */
    if (local.size > LOCAL_CEILING) {
      let drop = Math.floor(local.size / 2);
      for (const at of local.keys()) {
        local.delete(at);
        if (--drop <= 0) break;
      }
    }
  }

  const entry = local.get(key);
  if (!entry || entry.until <= now) {
    local.set(key, { n: 1, until: now + windowMs });
    return 1;
  }

  entry.n += 1;
  return entry.n;
}

/* ───────────────────────────────────────────────────────────────── the door */

/**
 * Add one to a counter and say what it now reads.
 *
 * Never throws, and never rejects. A caller on a user's path can await this
 * without wrapping it, because the one thing this must not do is turn a
 * degraded dependency into a failed sign-in.
 *
 * @param {string} key       what is being counted — include the window in it
 * @param {number} windowMs  how long the count lives
 * @returns {Promise<number>} the count after this call, or 1 if unreachable
 */
export async function increment(key, windowMs) {
  const backing = counterBacking();

  try {
    if (backing === "redis") return await redisIncrement(key, windowMs);
    if (backing === "postgres") return await postgresIncrement(key, windowMs);
    return memoryIncrement(key, windowMs);
  } catch {
    /* Fail open. See the note at the top: the in-process limiter is still
       underneath this, so a caller is slowed even when the shared count is
       unavailable — they are simply not slowed across instances. */
    return 1;
  }
}

/**
 * Forget a counter, because whatever it was guarding has now succeeded.
 *
 * A correct sign-in clears the failures before it, for exactly the reason the
 * in-process limiter does: this exists to stop somebody grinding a password
 * list, not to ration people who mistyped once.
 */
export async function forget(key) {
  const backing = counterBacking();

  try {
    if (backing === "redis") {
      await fetch(`${redisUrl()}/del/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { authorization: `Bearer ${redisToken()}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      return;
    }

    if (backing === "postgres") {
      const { sql } = await import("./sql.js");
      await sql`DELETE FROM rate_counters WHERE bucket = ${key}`;
      return;
    }

    local.delete(key);
  } catch {
    /* A counter that could not be cleared expires on its own. Nothing here is
       worth failing a successful sign-in over. */
  }
}

/** For the test suite, which needs a clean slate between cases. */
export function resetMemoryCounters() {
  local.clear();
}
