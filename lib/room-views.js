/**
 * The situation room's views, in a module the server can read.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS NOT SIMPLY READ OFF THE TAB TABLE
 *
 *  The tabs live in components/dash/SituationRoom.jsx, which is a client
 *  component. A server component cannot import values out of one — it gets a
 *  reference to a module that will run in the browser, not the array inside
 *  it — and the server is exactly where this list is needed, because the
 *  remembered view now arrives in a cookie and a cookie is a string somebody
 *  can type.
 *
 *  So the ids live here, in a file that imports nothing and runs anywhere,
 *  and `tests/room-hashes.test.js` asserts this list and the room's own tab
 *  table name the same set. Neither can drift without the build going red,
 *  which is the only kind of hand-kept list worth having.
 * ══════════════════════════════════════════════════════════════════════════
 */

/**
 * Every surface a reader may be returned to.
 *
 * ── THE TABS, AND DELIBERATELY NOTHING ELSE ────────────────────────────────
 * The room has a handful of layers that render but are no longer reachable
 * from anywhere — leftovers mid-way through a rework. Restoring somebody onto
 * one of those on reload would strand them on a surface with no way back into
 * the room, which is worse than the landing screen. So this is the tabs, and
 * a value naming anything else is discarded.
 */
export const VIEWS = [
  "command",
  "results",
  "register",
  "turnout",
  "clusters",
  "situations",
  "timeline",
  "booth",
  "integrity",
  "analytics",
  "planning",
  /* ── THE BROADCAST DESK'S FOUR ────────────────────────────────────────
     The desk was a page of its own and is a head in this room now, so its
     four dashboards are views like any other and a reader may be returned to
     one on reload. Their ids are prefixed `air` rather than named after what
     they show, because "control", "results" and "record" are all words this
     room already uses for other things and a remembered view is matched by
     string. See components/dash/RoomBroadcast.jsx. */
  "aircontrol",
  "airresults",
  "airstudio",
  "airrecord",
];

export const IS_VIEW = new Set(VIEWS);

/**
 * Where the room opens when nothing is remembered.
 *
 * ── AND WHY IT IS DELIBERATELY NOT THE FIRST TAB ───────────────────────────
 * It used to be whatever sat first in the tab table, which meant the landing
 * screen changed whenever somebody reordered the row — a layout decision
 * silently deciding a behavioural one. They are separate choices and they are
 * made separately now.
 *
 * Booth, because it is the screen with the most to act on when somebody first
 * sits down: what has not reported, and what has and is stuck at a desk.
 */
export const LANDING = "booth";

/** A remembered view, or null. Never trusts the string it is handed. */
export function asView(value) {
  return typeof value === "string" && IS_VIEW.has(value) ? value : null;
}
