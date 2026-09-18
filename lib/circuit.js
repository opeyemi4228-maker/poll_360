/**
 * Keeping one slow dependency from taking this product down with it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FIRE-AND-FORGET IS NOT FREE, AND ON ELECTION NIGHT IT IS THE EXPENSIVE
 *  KIND OF FREE
 *
 *  Every return this product takes in is also forwarded to Data Bank, and
 *  that forward is deliberately never awaited — a hub having a bad night must
 *  not become a polling unit that could not file. See lib/databank.js.
 *
 *  What "not awaited" does not mean is "costs nothing". Each forward holds a
 *  socket, a TLS session and a chunk of memory for as long as the hub takes
 *  to answer, and the hub's own measured tail is ten seconds. On a quiet
 *  evening that is four connections. On the hour when 176,846 booths finish
 *  counting at once, with the hub slow because everybody is posting to it at
 *  once, it is however many returns arrive in ten seconds — all of them open
 *  simultaneously, none of them awaited, none of them bounded by anything.
 *
 *  That is how a product falls over because of a dependency it was careful
 *  not to depend on. The unawaited work is still work, and it is competing
 *  with the agent's own request for the same file descriptors and the same
 *  memory.
 *
 *  Two things fix it, and both are here:
 *
 *    A GATE      only so many forwards in flight at once. The rest wait, and
 *                if the queue grows past what a backlog could ever drain,
 *                the oldest are turned away — into the outbox, which is what
 *                the outbox is for.
 *
 *    A BREAKER   when the hub has failed enough times in a row that it is
 *                plainly down, stop calling it for a minute. Every call made
 *                to a dead endpoint costs a ten-second timeout and buys
 *                nothing, and a thousand of them is a thousand sockets held
 *                for ten seconds each to learn something already known.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This module imports nothing. It can be tested without a network.
 */

/**
 * Only so many at once, and a bounded queue behind them.
 *
 * ── WHY THE QUEUE HAS A CEILING ────────────────────────────────────────────
 * An unbounded queue is a memory leak that presents as a working system: the
 * work is accepted, held, and never done, and the first symptom is the
 * process being killed for using too much memory — at which point everything
 * in the queue is lost with no record. A bounded queue turns that into a
 * refusal, which the caller writes to the outbox and can replay. Losing the
 * queue silently and refusing loudly are not close to the same thing.
 */
export function gate({ limit = 8, queueLimit = 500 } = {}) {
  let running = 0;
  const waiting = [];
  const counters = { accepted: 0, shed: 0, peak: 0 };

  function pump() {
    while (running < limit && waiting.length) {
      const next = waiting.shift();
      running += 1;
      next.start();
    }
  }

  return {
    /**
     * Run something, when there is room.
     *
     * Rejects with a `shed` error rather than queueing forever when the queue
     * is full, so the caller can record what did not happen.
     */
    run(work) {
      if (running < limit) {
        running += 1;
        counters.accepted += 1;
        return settle(work, () => {
          running -= 1;
          pump();
        });
      }

      if (waiting.length >= queueLimit) {
        counters.shed += 1;
        const refusal = new Error("Too much already waiting to be sent.");
        refusal.name = "Shed";
        refusal.shed = true;
        return Promise.reject(refusal);
      }

      counters.accepted += 1;
      counters.peak = Math.max(counters.peak, waiting.length + 1);

      return new Promise((resolve, reject) => {
        waiting.push({
          start: () =>
            settle(work, () => {
              running -= 1;
              pump();
            }).then(resolve, reject),
        });
      });
    },

    stats: () => ({ ...counters, running, waiting: waiting.length }),
  };
}

/** Run, and release the slot whatever happens. */
function settle(work, release) {
  let result;
  try {
    result = Promise.resolve(work());
  } catch (error) {
    release();
    return Promise.reject(error);
  }
  return result.then(
    (value) => {
      release();
      return value;
    },
    (error) => {
      release();
      throw error;
    }
  );
}

/**
 * Stop calling something that is plainly down.
 *
 * Three states, and the third is the one that matters:
 *
 *   CLOSED  normal. Failures are counted; a success resets the count.
 *   OPEN    enough failures in a row that it is down. Calls are refused
 *           immediately, at no cost, for the cool-off.
 *   TESTING the cool-off has passed. Exactly one call is let through to find
 *           out. If it works, closed; if it does not, open again, for longer.
 *
 * ── WHY "EXACTLY ONE" IS THE WHOLE TRICK ───────────────────────────────────
 * Without it, the moment the cool-off expires every waiting caller tries at
 * once — against an endpoint that is very likely still down — and the breaker
 * has arranged a thundering herd rather than prevented one. Letting a single
 * request answer the question costs one timeout instead of a thousand.
 */
export function breaker({ failures = 5, coolOffMs = 30_000, maxCoolOffMs = 5 * 60_000 } = {}) {
  let consecutive = 0;
  let openedAt = 0;
  let cooling = coolOffMs;
  let testing = false;
  const counters = { opened: 0, refused: 0 };

  function state(now = Date.now()) {
    if (!openedAt) return "closed";
    if (now - openedAt < cooling) return "open";
    return "testing";
  }

  return {
    /** May a call be made right now? */
    ready(now = Date.now()) {
      const at = state(now);
      if (at === "closed") return true;
      if (at === "open") {
        counters.refused += 1;
        return false;
      }
      /* Testing: one through, and only one. */
      if (testing) {
        counters.refused += 1;
        return false;
      }
      testing = true;
      return true;
    },

    /** It worked. Back to normal, and the cool-off resets with it. */
    succeeded() {
      consecutive = 0;
      openedAt = 0;
      cooling = coolOffMs;
      testing = false;
    },

    /**
     * It did not. Count it, and open if that was enough.
     *
     * The cool-off doubles each time it re-opens, up to a ceiling: something
     * that has been down for an hour should be asked about once a minute, not
     * twice a second, and something that flickered once should be asked about
     * again promptly.
     */
    failed() {
      testing = false;
      consecutive += 1;

      if (openedAt) {
        /* Failed its test. Open again, and wait longer this time. */
        openedAt = Date.now();
        cooling = Math.min(cooling * 2, maxCoolOffMs);
        counters.opened += 1;
        return;
      }

      if (consecutive >= failures) {
        openedAt = Date.now();
        counters.opened += 1;
      }
    },

    stats: (now = Date.now()) => ({
      ...counters,
      state: state(now),
      consecutive,
      coolOffMs: cooling,
    }),
  };
}

/**
 * Wait a bit, and not the same bit as everybody else.
 *
 * ── WHY THE JITTER IS NOT DECORATION ───────────────────────────────────────
 * Four thousand agents file within the same minute, four hundred forwards
 * fail against a hub that briefly went away, and every one of them retries at
 * exactly 200ms, then exactly 800ms. The retry is a second wave shaped
 * exactly like the first, arriving all at once, which is how a dependency
 * that was recovering is knocked over again by the recovery.
 *
 * Spreading each wait across a range breaks the wave into a slope. It is two
 * lines of arithmetic and it is the difference between a hub that comes back
 * and one that does not.
 */
export function backoff(attempt, { base = 200, ceiling = 30_000 } = {}) {
  /* ── A COUNT THAT IS NOT A NUMBER MUST NOT BECOME NO WAIT AT ALL ─────────
     `tries` comes out of a database column, and a null or an unparsed value
     arrives here as NaN. Every arithmetic step below carries NaN through,
     and `setTimeout(NaN)` does not wait — it fires on the next turn of the
     loop. So the one input this function cannot make sense of would turn a
     patient, spreading retry into a spin against a hub that is already
     struggling. Treated as the first attempt, which is the safe reading. */
  const step = Number.isFinite(attempt) ? Math.max(0, attempt - 1) : 0;
  const span = Math.min(base * 2 ** step, ceiling);
  /* Full jitter: anywhere from nothing to the whole span. Half-jitter keeps a
     floor under the wave and is measurably worse at exactly this. */
  return Math.floor(Math.random() * span);
}
