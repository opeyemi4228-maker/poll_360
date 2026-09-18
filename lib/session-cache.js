/**
 * Recognising somebody without asking the database every single time.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE QUERY PER REQUEST FROM EVERY SIGNED-IN PERSON IS THE BUSIEST QUERY
 *  IN THE PRODUCT, BY A LONG WAY
 *
 *  lib/session.js reads who is asking from the database on every request. It
 *  does that on purpose, and the reason is good: it is what makes "revoke
 *  this session" and "disable this account" take effect on the next click
 *  rather than whenever a token happens to expire. Nothing about that
 *  reasoning is wrong.
 *
 *  What it also means is one query per request. A hundred thousand people
 *  with a dashboard open, refreshing every twenty seconds, is five thousand
 *  session lookups a second before a single figure has been counted. A
 *  million is fifty thousand a second. No amount of caching further up helps,
 *  because this is the query that decides whether the rest of the page may be
 *  drawn at all — and it is different for every person, so it cannot be
 *  shared the way the board's figures are.
 *
 *  So this holds the answer for a few seconds.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT IT COSTS, SAID PLAINLY ────────────────────────────────────────────
 * The guarantee changes from "on the next click" to "within a few seconds".
 * That is a real change to a stated design decision and it is worth being
 * exact about which cases it touches:
 *
 *   SIGNING OUT          Unaffected. The cookie is deleted from the browser,
 *                        so the token is not presented again. There is
 *                        nothing for a cached entry to answer.
 *
 *   DISABLING AN ACCOUNT Delayed by the window. Somebody an administrator
 *                        has just switched off can load pages for a few more
 *                        seconds if their browser still holds the cookie.
 *
 *   REVOKING A SESSION   The same.
 *
 *   CHANGING A ROLE      The same: they keep the old one for a few seconds.
 *
 * Five seconds is the default, and it is short enough that the honest
 * description of the product is still "takes effect immediately". An
 * administrator who has switched somebody off and wants to be certain waits
 * as long as it takes to say the sentence.
 *
 * ── AND IT IS KEYED ON THE CREDENTIAL ITSELF ───────────────────────────────
 * The key is the hash of the session token, which is the same value the
 * database row is keyed by. Nothing can read an entry without already holding
 * the token that entry belongs to, so this cannot serve one person's session
 * to another — the failure that would matter most. That is a stronger
 * property than "we were careful": there is no key an attacker could
 * construct without the credential.
 *
 * ── AND A MISS IS NEVER CACHED ─────────────────────────────────────────────
 * Only a successful lookup is held. A token that did not match anything is
 * asked about again every time, because the alternative is a window in which
 * a session that has just been created is still remembered as invalid — which
 * would mean signing in and being told you are not signed in.
 */

/**
 * How long an answer is good for, in seconds.
 *
 * Zero switches this off entirely and restores the original behaviour: every
 * request asks the database. That is the default in development, so that
 * testing "disable this account and watch them lose access" behaves the way
 * the feature is described.
 */
function windowMs() {
  const asked = process.env.SESSION_CACHE_SECONDS;

  if (asked !== undefined) {
    const seconds = Number(asked);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, 60) * 1000;
  }

  return process.env.NODE_ENV === "production" ? 5000 : 0;
}

const entries = new Map();

/**
 * Bounded, and bounded by something an attacker cannot inflate.
 *
 * The key is a session token hash, so an entry can only be created by
 * presenting a token that actually matched a row — which means the size of
 * this map is bounded by the number of real sessions in flight on this
 * instance, not by how many requests somebody chooses to send.
 */
const CEILING = 20_000;

function makeRoom(now) {
  if (entries.size <= CEILING) return;
  for (const [key, entry] of entries) if (entry.until <= now) entries.delete(key);

  let drop = entries.size - CEILING;
  for (const key of entries.keys()) {
    if (drop-- <= 0) break;
    entries.delete(key);
  }
}

/**
 * Look somebody up, sharing a recent answer where there is one.
 *
 * @param key      the session token's hash — the same value the row is keyed by
 * @param lookUp   how to ask the database, called on a miss
 */
export async function recogniseWith(key, lookUp) {
  const live = windowMs();
  if (!live || !key) return lookUp();

  const now = Date.now();
  const entry = entries.get(key);

  if (entry && entry.until > now) return entry.who;

  const who = await lookUp();

  /* Only a real person is remembered. See the note at the top: caching a miss
     would mean a session that has just been created is remembered as invalid,
     which is signing in and being told you are not signed in. */
  if (who) {
    entries.set(key, { who, until: now + live });
    makeRoom(now);
  } else {
    entries.delete(key);
  }

  return who;
}

/**
 * Forget one session, now.
 *
 * Called on sign-out. Strictly it is unnecessary — the browser no longer has
 * the cookie, so the entry will never be asked for again and will expire on
 * its own — and it is done anyway, because leaving a signed-out person's
 * details sitting in memory for five seconds is the kind of thing that is
 * fine until somebody asks about it.
 */
export function forgetSession(key) {
  if (key) entries.delete(key);
}

/** Everything, for tests and for a deployment that wants to be certain. */
export function forgetAllSessions() {
  entries.clear();
}

/** What the health screen prints: whether this is on, and how wide. */
export function sessionCacheStats() {
  return { seconds: windowMs() / 1000, held: entries.size };
}
