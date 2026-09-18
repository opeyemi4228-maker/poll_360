/**
 * One answer, shared by everybody asking the same question.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ROOMS ASK THE DATABASE THE SAME QUESTION ONCE PER VIEWER PER MINUTE
 *
 *  Every dashboard in this product refreshes itself every twenty seconds
 *  (components/dash/LiveRefresh.jsx), and a refresh re-runs the whole server
 *  component — which asks the database for the counted returns, the recent
 *  feed, the declared figures and the incident list.
 *
 *  That is correct and it is also the thing that decides whether this
 *  survives an election night. The figures on the board do not depend on
 *  *who* is looking: two people watching the same contest over the same
 *  ground get the same numbers, by definition. So a thousand viewers
 *  refreshing every twenty seconds is three thousand identical queries a
 *  minute for one answer, and a hundred thousand viewers is three hundred
 *  thousand — for an answer that changes when a return lands, not when
 *  somebody looks.
 *
 *  With this, the first person through the door pays for the query and
 *  everybody arriving in the next few seconds is handed what they got. The
 *  load stops following the number of viewers and starts following the
 *  number of *distinct questions*, which is a few dozen and does not grow.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 * It is not a cache of anything belonging to a person. Nothing keyed by a
 * session, an account or a coordinator goes in here, ever: this store is
 * shared by every request the instance handles, and one viewer being served
 * another's page is the worst bug this product could have. The key builders
 * below take a contest and a ground and nothing else, and `personal()` exists
 * to make a caller say out loud when they are about to break that rule.
 *
 * ── AND IT IS PER INSTANCE, WHICH IS THE POINT ─────────────────────────────
 * A shared cache across instances would need a network round trip to answer,
 * and the whole value here is answering without one. Each instance keeping
 * its own copy for a few seconds means the database sees, at worst, one query
 * per instance per window instead of one per viewer — which is the difference
 * between a few dozen queries a minute and a few hundred thousand.
 */

/**
 * ── SINGLE FLIGHT: THE PART THAT MATTERS MOST UNDER LOAD ───────────────────
 * A plain time-to-live cache has one bad moment, and it is exactly the moment
 * this product cannot afford: the instant an entry expires, every request that
 * arrives at once sees a miss, and all of them run the query. That is a
 * stampede, and on a slow query it is self-sustaining — the queries pile up,
 * each takes longer because of the others, and the entry stays expired.
 *
 * So a miss records the *promise* rather than waiting for the value. The
 * second caller finds the promise and awaits the same one. One query, however
 * many people asked.
 */

/** The store. Key to { value, until, stale, promise }. */
const entries = new Map();

/**
 * ── WHY THERE IS A VERSION NUMBER ON THE WHOLE STORE ───────────────────────
 * A query that is already in flight when something is invalidated will finish
 * after the invalidation and write its answer in — an answer fetched *before*
 * the change existed. The board would then hold figures that are already known
 * to be wrong, and hold them for the whole window, with nothing to say so.
 * Clearing the cache would not help: the clearing happened first.
 *
 * So every refresh notes the version it started under, and declines to store
 * its result if anything has been invalidated since. The cost is that a
 * filed return discards a query that was nearly finished. The alternative is
 * a board that is quietly, invisibly stale, which is the one failure this
 * product cannot have.
 */
let version = 0;

/**
 * How many distinct answers to keep.
 *
 * Bounded because the key includes a ground, and a ground can be any of
 * 176,846 polling units. An unbounded map keyed on something a reader chooses
 * is a way to exhaust an instance's memory by clicking around a map.
 */
const CEILING = 500;

const counters = { hits: 0, misses: 0, stale: 0, evictions: 0 };

/** What the health screen prints. Reading it must never be able to throw. */
export function cacheStats() {
  return { ...counters, size: entries.size };
}

/**
 * Evict, oldest-written first.
 *
 * Insertion order is Map's own order, so the first key is the least recently
 * *written*. That is not least-recently-used and it does not need to be: with
 * a few seconds' lifetime, "written longest ago" and "least useful" are the
 * same entry, and keeping a true recency list costs more than it saves.
 */
function makeRoom() {
  if (entries.size <= CEILING) return;

  const now = Date.now();
  for (const [key, entry] of entries) {
    if (entry.stale <= now && !entry.promise) entries.delete(key);
  }

  let drop = entries.size - CEILING;
  if (drop <= 0) return;

  for (const [key, entry] of entries) {
    if (entry.promise) continue;
    entries.delete(key);
    counters.evictions += 1;
    if (--drop <= 0) return;
  }
}

/**
 * Ask for something, and get whatever answer is already going spare.
 *
 * @param key       what is being asked. Two callers with the same key must be
 *                  asking the same question — see `boardKey` below.
 * @param produce   how to find out, called at most once per window.
 * @param ttlMs     how long the answer counts as current.
 * @param staleMs   how much longer it may be served while a fresh one is
 *                  fetched behind it. Zero to never serve a stale answer.
 */
export async function cached(key, produce, { ttlMs = 5000, staleMs = 0 } = {}) {
  const now = Date.now();
  const entry = entries.get(key);

  /* Current. The common case, and it costs a Map lookup. */
  if (entry && entry.until > now && "value" in entry) {
    counters.hits += 1;
    return entry.value;
  }

  /* Somebody is already finding out. Wait for theirs rather than starting a
     second identical query — this is the whole stampede defence. */
  if (entry?.promise) {
    counters.hits += 1;
    return entry.promise;
  }

  /* ── STALE WHILE A FRESH ONE IS FETCHED ────────────────────────────────
     Expired, but not by much, and a refresh is already worth starting. The
     reader is handed the slightly old figures immediately rather than made to
     wait for the database — which on a board that says how old its figures
     are is exactly the right trade, because the page tells them.

     The refresh is deliberately not awaited and its failure is swallowed: a
     background refresh that throws must not reject the answer somebody is
     already holding. */
  if (entry && staleMs > 0 && entry.stale > now && "value" in entry) {
    counters.stale += 1;
    /* Deliberately not awaited, and its failure deliberately swallowed here
       rather than only inside `refresh`: a promise nobody awaits that rejects
       takes the whole process down in Node, and a background refresh failing
       must never be able to do that. */
    void refresh(key, produce, ttlMs, staleMs).catch(() => {});
    return entry.value;
  }

  counters.misses += 1;
  return refresh(key, produce, ttlMs, staleMs);
}

function refresh(key, produce, ttlMs, staleMs) {
  const existing = entries.get(key);
  if (existing?.promise) return existing.promise;

  /* The version this query is being asked under. If anything is invalidated
     while it is in flight, the answer below is already out of date before it
     arrives and must not be stored. See the note over `version`. */
  const asked = version;

  const promise = (async () => {
    const value = await produce();

    if (asked === version) {
      entries.set(key, {
        value,
        until: Date.now() + ttlMs,
        stale: Date.now() + ttlMs + staleMs,
      });
      makeRoom();
    } else {
      /* Superseded. The entry is removed rather than left holding a promise
         that has now settled, so the next caller asks again. */
      const held = entries.get(key);
      if (held?.promise === promise) entries.delete(key);
    }

    return value;
  })().catch((error) => {
    /* ── A FAILURE IS NEVER CACHED ──────────────────────────────────────
       A cached error would turn one bad query into a window of bad answers
       for everybody. The entry is removed so the next caller tries again —
       except that a stale value, if there is one, is kept and its life
       extended a little, because slightly old figures beat an error page on
       a board somebody is reading numbers off. */
    const held = entries.get(key);
    if (held && "value" in held) {
      entries.set(key, { value: held.value, until: Date.now() + 1000, stale: held.stale });
    } else {
      entries.delete(key);
    }
    throw error;
  });

  entries.set(key, { ...(existing ?? {}), promise });
  return promise;
}

/**
 * Throw an answer away, because something changed it.
 *
 * Takes a prefix, so one change can clear every ground that contains it
 * without the caller having to know which grounds are being watched.
 *
 * ── AND IT IS FOR RARE CHANGES, NOT FOR EVERY ONE ──────────────────────────
 * Every call discards whatever is in flight as well as whatever is stored —
 * see the version note above — so calling it at the rate returns arrive on an
 * election night means nothing ever finishes being cached. `boardChanged` in
 * lib/db.js sets out which changes are worth this and which rely on the
 * window instead; the short version is that a desk disputing a return is, and
 * a booth filing one is not.
 */
export function invalidate(prefix) {
  version += 1;
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}

/** Everything. For tests, and for the administrator's "reload" button. */
export function clearCache() {
  version += 1;
  entries.clear();
}

/* ─────────────────────────────────────────────────────────────────── keys */

/**
 * The key for something everybody looking at the same board would get.
 *
 * ── WHY THE KEY IS BUILT HERE AND NOT AT THE CALL SITE ─────────────────────
 * Because a cache is only as safe as its worst key, and a key assembled by
 * hand in eleven places is a key that is missing the race in one of them.
 * The first symptom would be a presidential total on a governorship board,
 * which is the kind of wrong that gets read out loud before anybody checks.
 *
 * Everything that narrows the answer has to be in here. Nothing that
 * identifies a person may be.
 */
export function boardKey(what, { electionId, race, territory } = {}) {
  return [
    /* The project comes first so that one filed return can clear every answer
       about that project with a prefix, without knowing which grounds or
       contests anybody happens to be watching. See `boardPrefix`. */
    "board",
    electionId ?? "none",
    what,
    race ?? "none",
    /* A territory is a unit-code prefix or null for the whole federation. */
    territory ?? "all",
  ].join("|");
}

/** The prefix that covers every board answer for one project. */
export function boardPrefix(electionId) {
  return `board|${electionId ?? "none"}|`;
}

/**
 * A deliberate obstacle.
 *
 * Nothing belonging to one person may be cached in a store the whole instance
 * shares. If a caller ever genuinely needs to, they have to write this word,
 * and the word is searchable — so the rule is enforced by a grep rather than
 * by everybody remembering it.
 */
export function personal() {
  throw new Error(
    "Nothing belonging to one person may go in the shared cache. " +
      "Use React's own per-request cache() instead — see lib/session.js."
  );
}
