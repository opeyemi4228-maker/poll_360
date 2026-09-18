/**
 * When a dashboard should ask the server again.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A THOUSAND TABS ON A TWENTY-SECOND TIMER IS NOT A THOUSAND REQUESTS A
 *  MINUTE SPREAD OUT. IT IS THREE SPIKES A MINUTE.
 *
 *  Every room in this product refreshes itself on a fixed interval. That is
 *  the right design — see components/dash/LiveRefresh.jsx for why polling
 *  beats a socket here — and it has one property nobody notices until there
 *  are a lot of viewers: the timers are *synchronised*.
 *
 *  Viewers do not arrive at random. They arrive when a bulletin says the
 *  figures are in, when a shift starts, when a link is shared in a group,
 *  when a broadcast names the site. Everybody who opened the page within the
 *  same second then refreshes within the same second, forever, because a
 *  fixed interval preserves whatever alignment it started with. A thousand
 *  viewers is not 50 requests a second, it is 1000 requests in one second and
 *  nothing for nineteen.
 *
 *  Worse, it is self-reinforcing: the spike makes the server slow, the slow
 *  responses land at the same time, and the next spike is tighter than the
 *  last.
 *
 *  Spreading each interval across a range breaks the alignment apart within a
 *  few cycles. It is a few lines of arithmetic and it is the difference
 *  between a flat load and a sawtooth with the same average.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This module has no imports and touches nothing in the browser, so it can be
 * tested as arithmetic — which is all it is.
 */

/**
 * How far either side of the nominal interval a refresh may land.
 *
 * ── WHY A QUARTER, AND NOT MORE OR LESS ────────────────────────────────────
 * The figures on a board are stamped with their age, and somebody reading a
 * total out loud is entitled to know it is twenty seconds old rather than
 * thirty. A quarter either way keeps the worst case at twenty-five seconds on
 * a twenty-second board, which nobody notices.
 *
 * It is also enough. Alignment decays geometrically: after three cycles a
 * group that started together is spread across most of the window. Going
 * wider buys a little more spread and costs a visibly irregular clock.
 */
const SPREAD = 0.25;

/**
 * The next interval, in milliseconds.
 *
 * @param seconds   the nominal interval the screen asked for
 * @param failures  consecutive refreshes that did not come back. See below.
 * @param random    injectable, so the tests are not a coin toss
 */
export function nextInterval(seconds, { failures = 0, random = Math.random } = {}) {
  const base = Math.max(1, Number(seconds) || 20) * 1000;

  /* ── AND WHEN IT IS GOING WRONG, ASK LESS OFTEN ────────────────────────
     A refresh that failed is usually a server under load or a network that
     has gone, and the worst thing a thousand clients can do to a server that
     is struggling is keep the same schedule. Doubling per failure up to eight
     times the interval turns a crowd into a much smaller crowd within a
     minute, and one success puts it straight back.

     Capped at eight because beyond that a board stops being live, and a board
     that is silently no longer live is worse than one that says it is stale —
     which the ring on the screen does, from across the room. */
  const slowed = base * Math.min(8, 2 ** Math.max(0, failures));

  /* Full spread across the range, rather than a random addition on top, so
     the average interval stays the interval that was asked for. */
  const lowest = slowed * (1 - SPREAD);
  const range = slowed * SPREAD * 2;

  return Math.round(lowest + random() * range);
}

/**
 * Should this screen ask at all right now?
 *
 * ── THREE REASONS NOT TO, AND ONLY ONE OF THEM WAS CHECKED ─────────────────
 * A hidden tab was already skipped, which is right: a room leaves these open
 * all night on machines that are also doing other work.
 *
 * The other two were not. A device with no network refreshes anyway, fails,
 * and — before the backoff above — kept failing on the same schedule, which
 * on a handset at a booth is the battery going for nothing. And a refresh
 * that is still in flight must not have another started on top of it, or a
 * slow server collects a queue of duplicate work per viewer.
 */
export function shouldRefresh({ visible = true, online = true, busy = false } = {}) {
  return Boolean(visible) && Boolean(online) && !busy;
}

/**
 * How old the figures are allowed to get before the screen says so.
 *
 * ── STALE IS NOT A FAILURE, AND IS NOT DRAWN AS ONE ────────────────────────
 * A hidden tab is the usual cause. Status colour on these dashboards means
 * somebody has to look at something, so this returns a plain boolean and the
 * screen draws it in the muted tone.
 *
 * Two and a half intervals: long enough that one slow refresh does not raise
 * it, short enough that a stopped clock is visible within a minute on a
 * twenty-second board.
 */
export function isStale(ageSeconds, seconds) {
  return ageSeconds > Math.max(1, Number(seconds) || 20) * 2.5;
}
