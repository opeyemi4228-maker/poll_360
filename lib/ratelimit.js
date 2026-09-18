import { increment, forget } from "./shared-counter.js";

/**
 * A small fixed-window rate limiter.
 *
 * In memory, and therefore per-process: two server instances have two counters,
 * and a restart forgets everything. That is a real limitation and it is stated
 * rather than hidden, but it still closes the case this exists for, which is
 * one machine hammering a sign-in form with a password list.
 *
 * Sign-in is limited by IP *and* by the identifier being tried, so a botnet
 * spread across addresses cannot quietly grind one known account.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  AND THE PER-PROCESS LIMITATION IS NOW COVERED, NOT MERELY STATED
 *
 *  Everything above is still true of the Map below, and the Map is still
 *  worth having: it is free, it answers without a round trip, and it catches
 *  the common case before anything else is asked. What it cannot do is hold a
 *  count across the many instances a platform runs under load, and "the
 *  limiter is per-process" written in a comment does not stop anybody.
 *
 *  So `attempt` and `spend` below do both: the Map first, because it is free,
 *  and then a counter every instance can see — see lib/shared-counter.js.
 *  Only the paths where somebody types a credential pay for the second one.
 *  Nothing on a page-view path does.
 * ══════════════════════════════════════════════════════════════════════════
 */
const buckets = new Map();

/** Keep the map from growing without bound on a long-lived process. */
function sweep(now) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Is this caller currently allowed? Reads the bucket without spending from it.
 *
 * ── WHY CHECKING AND SPENDING ARE SEPARATE ─────────────────────────────────
 * The first version of this counted every attempt, including the successful
 * ones. Two consequences, both bad on the one morning this has to work: an
 * agent who mistypes twice and then gets it right had still spent three of
 * their eight, and a newsroom where six people sign in from one office address
 * burned the shared budget by simply arriving.
 *
 * So a *successful* sign-in costs nothing. Only failures are spent, via
 * `consume` below. That is the behaviour the limiter was always meant to have:
 * it exists to stop somebody working through a password list, not to ration
 * legitimate arrivals.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * @returns {{ ok: boolean, remaining: number, retryAfter: number }}
 */
export function rateLimit(key, { limit = 8, windowMs = 10 * 60 * 1000 } = {}) {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) return { ok: true, remaining: limit, retryAfter: 0 };

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  return { ok: true, remaining: limit - bucket.count, retryAfter: 0 };
}

/** Spend one attempt. Called only when an attempt actually failed. */
export function consume(key, { windowMs = 10 * 60 * 1000 } = {}) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;
}

/** Called after a success, so a legitimate sign-in clears the failures before it. */
export function clearLimit(key) {
  buckets.delete(key);
}

/* ────────────────────────────────── the same limit, across every instance */

/**
 * Is this caller allowed, counting everything every instance has seen?
 *
 * ── WHY THIS READS BY SPENDING ─────────────────────────────────────────────
 * The in-process limiter above separates checking from spending, so a
 * successful sign-in costs nothing and a newsroom where six people arrive at
 * once does not burn a shared budget by turning up. That is the right
 * behaviour and it is kept: `spend` below is still called only on a failure.
 *
 * The shared counter cannot be read without a round trip either way, so this
 * takes the one round trip it was always going to take and uses it to *ask*
 * rather than to count — the caller's own failures are what `spend` adds.
 * A read-only probe key is used, so asking whether you are allowed never
 * makes you less allowed.
 *
 * @returns {Promise<{ ok: boolean, retryAfter: number, shared: boolean }>}
 */
export async function attempt(key, { limit = 8, windowMs = 10 * 60 * 1000 } = {}) {
  /* Free, and already correct for the single-instance case. */
  const near = rateLimit(key, { limit, windowMs });
  if (!near.ok) return { ok: false, retryAfter: near.retryAfter, shared: false };

  /* The shared count is stored under the window it belongs to, so a new window
     is a new key and nothing has to be reset. */
  const window = Math.floor(Date.now() / windowMs);
  const seen = await increment(`probe:${key}:${window}`, windowMs);

  /* The probe itself increments, so the caller's own check is one of the
     counts. Subtracting it keeps "eight attempts" meaning eight attempts
     rather than seven. */
  const failures = Math.max(0, seen - 1);

  if (failures >= limit) {
    const endsAt = (window + 1) * windowMs;
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((endsAt - Date.now()) / 1000)),
      shared: true,
    };
  }

  return { ok: true, retryAfter: 0, shared: true };
}

/**
 * Spend one attempt, everywhere. Called only when an attempt actually failed.
 *
 * Deliberately not awaited by every caller: a failed sign-in has already been
 * decided by the time this runs, and making the person wait for a counter to
 * be written adds latency to the one answer that should be immediate. Callers
 * that want the count settled before they answer may await it.
 */
export async function spend(key, { windowMs = 10 * 60 * 1000 } = {}) {
  consume(key, { windowMs });
  const window = Math.floor(Date.now() / windowMs);
  await increment(`probe:${key}:${window}`, windowMs);
}

/** A success wipes the failures before it, here and in the shared count. */
export async function clear(key, { windowMs = 10 * 60 * 1000 } = {}) {
  clearLimit(key);
  const window = Math.floor(Date.now() / windowMs);
  await forget(`probe:${key}:${window}`);
}
