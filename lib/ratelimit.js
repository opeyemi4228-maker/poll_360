/**
 * A small fixed-window rate limiter.
 *
 * In memory, and therefore per-process: two server instances have two counters,
 * and a restart forgets everything. That is a real limitation and it is stated
 * rather than hidden — but it still closes the case this exists for, which is
 * one machine hammering a sign-in form with a password list. A distributed
 * limiter belongs with the application tier and its shared store, not here.
 *
 * Sign-in is limited by IP *and* by the identifier being tried, so a botnet
 * spread across addresses cannot quietly grind one known account.
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
