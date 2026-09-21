/**
 * The Ask Poll360 conversation, held in the browser for the visit.
 *
 * ── ONE CONVERSATION BEHIND TWO DOORS ──────────────────────────────────────
 * Ask Poll360 opens from Election Analytics and from Strategic Planning, and a
 * question asked through one door is still there through the other. So the
 * thread is a store rather than component state, read with
 * `useSyncExternalStore` the way lib/campaign.js is, and kept in session
 * storage so a reload or a tab switch does not lose it. Storage that refuses
 * — a private window, a full quota — costs the memory, never the answer.
 */

const KEY = "poll360:ask:thread";
const KEEP = 8;
const EMPTY = Object.freeze([]);
const listeners = new Set();
let thread = null;

function load() {
  if (thread !== null) return thread;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    /* A turn kept by an older build of the desk may not have the shape this
       one draws. It is dropped rather than drawn wrong. */
    thread = Array.isArray(parsed)
      ? parsed.filter((turn) => turn && typeof turn.id === "string" && typeof turn.answer?.headline === "string" && Array.isArray(turn.sections))
      : [];
  } catch {
    thread = [];
  }
  return thread;
}

export const askThread = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot() {
    return typeof window === "undefined" ? EMPTY : load();
  },
  serverSnapshot() {
    return EMPTY;
  },
  set(next) {
    thread = next.slice(-KEEP);
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(thread));
    } catch {
      /* Too large or refused: the thread lives for this visit only. */
    }
    for (const listener of listeners) listener();
  },
  add(turn) {
    askThread.set([...load(), turn]);
  },
  clear() {
    askThread.set([]);
  },
};

/* ── A LINK THAT NAMES THE TAB ─────────────────────────────────────────────
   /room#ask arrives on the analytics head; the tab reads the address rather
   than copying it into state on mount. */
export function subscribeHash(listener) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
export const hashSnapshot = () => window.location.hash;
export const hashServerSnapshot = () => "";
