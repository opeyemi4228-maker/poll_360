import { clearUnder, isCovered, isUnder, pathKey, statusOf, toggle } from "./coverage.js";

/**
 * The campaign's working plan: the places it has decided to work, and why.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS TURNS THE PRODUCT INTO
 *
 *  Every dashboard here could answer a question and then leave the reader
 *  holding it. You could see that turnout in your own zone collapsed, that
 *  four local governments are within three points, that eleven coordinators
 *  have not reported — and then you closed the tab, because a screen that
 *  ends in a fact ends.
 *
 *  A campaign does not need facts. It needs a list of places, a cost for
 *  covering them, and a reason attached to each one that survives the
 *  argument about it next week. So every screen now ends in the same action:
 *  put these places in the plan. There is one plan, it is the same plan the
 *  planning map costs and exports, and it remembers why each place is in it.
 *
 *  That is the difference between a display and a tool.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THE REASON IS NOT OPTIONAL ─────────────────────────────────────────
 * A plan is read by somebody who was not in the room when it was made, and
 * usually by the person being asked to pay for it. "Kano" is not a plan;
 * "Kano — 3.1m registered voters did not vote in 2023" is an argument. Every
 * entry carries the sentence that put it there and the screen it came from,
 * and the export carries them too.
 *
 * ── WHERE IT LIVES, AND WHY NOT ON THE SERVER ─────────────────────────────
 * The same bargain lib/whiteboard.js makes: this is somebody's working plan
 * during one shift, not a record of anything. Putting it on the server means
 * deciding who else can see it, what happens when two people edit it, and how
 * long it is kept — three questions nobody has asked for yet. It lives in
 * this browser, it survives a refresh and a crash, and it exports to a file
 * the moment it needs to leave.
 */

const STORE = "poll360.campaign";

function read() {
  if (typeof window === "undefined") return { marks: [], reasons: {} };
  try {
    const raw = window.localStorage.getItem(STORE);
    const held = raw ? JSON.parse(raw) : null;
    if (!held || !Array.isArray(held.marks)) return { marks: [], reasons: {} };
    return { marks: held.marks, reasons: held.reasons ?? {} };
  } catch {
    /* Storage off, or a corrupted entry. The plan starts empty rather than
       taking the room down with it. */
    return { marks: [], reasons: {} };
  }
}

function write(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORE,
      JSON.stringify({ marks: [...state.marks], reasons: state.reasons })
    );
  } catch {
    /* Private browsing, or a full quota. The plan still works for this
       session; it just will not be there tomorrow, and that is not worth
       interrupting anybody over. */
  }
}

/* ── THE SNAPSHOT HAS TO BE STABLE ────────────────────────────────────────
   useSyncExternalStore compares snapshots by identity and re-renders when it
   changes. Building a fresh object on every read means a render loop, so the
   current plan is held here and replaced only when it actually changes. */
let current = null;
const listeners = new Set();

/* The server has no plan, and this exact object is returned every time: a new
   empty object per call is a new identity per call, which is the same loop
   again in a different costume. */
const EMPTY = { marks: new Map(), reasons: {} };

function hydrate() {
  const held = read();
  return { marks: new Map(held.marks), reasons: held.reasons };
}

function commit(next) {
  current = next;
  write(next);
  for (const listener of listeners) listener();
}

export const campaign = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  snapshot() {
    current ??= hydrate();
    return current;
  },

  /** The server renders an empty plan; the browser fills it in on mount. */
  serverSnapshot: () => EMPTY,

  /**
   * Put a place in the plan, with the sentence that justifies it.
   *
   * Idempotent on purpose. This is called from buttons that add several
   * places at once — "the six biggest stay-at-home states" — and pressing one
   * twice must not take back what the first press added. Tapping a shape on
   * the map is a different gesture and uses `flip`.
   */
  add(paths, why, from) {
    const state = campaign.snapshot();
    const marks = new Map(state.marks);
    const reasons = { ...state.reasons };
    const at = Date.now();

    for (const path of paths) {
      const key = Array.isArray(path) ? pathKey(path) : path;
      /* Already covered by something above it: adding it again would write a
         mark that changes nothing, and the plan would grow entries that do
         not do anything. The reason is still recorded, because the reason is
         the point. */
      if (!isCovered(marks, key)) marks.set(key, "+");
      reasons[key] = { why, from, at };
    }

    commit({ marks, reasons });
  },

  /** Take a place, or take it back out — the map's own gesture. */
  flip(path, why, from) {
    const state = campaign.snapshot();
    const key = Array.isArray(path) ? pathKey(path) : path;
    const marks = toggle(state.marks, key);
    const reasons = { ...state.reasons };

    if (marks.has(key)) reasons[key] = { why: why ?? "Chosen on the map", from, at: Date.now() };
    else delete reasons[key];

    /* Marks inside it went with it, so their reasons go too. `isUnder` and
       not startsWith: "KAN" is a prefix of "KANO" as a string and is not its
       ancestor as a path, and a plan that quietly dropped a neighbouring
       state because its code shares three letters would be very hard to
       notice and very easy to ship. */
    for (const held of Object.keys(reasons)) {
      if (isUnder(held, key) && !marks.has(held)) delete reasons[held];
    }

    commit({ marks, reasons });
  },

  /** Everything about this place and everything inside it, gone. */
  drop(path) {
    const state = campaign.snapshot();
    const key = Array.isArray(path) ? pathKey(path) : path;
    const marks = clearUnder(state.marks, key);
    const reasons = { ...state.reasons };

    for (const held of Object.keys(reasons)) {
      if (held === key || isUnder(held, key)) delete reasons[held];
    }

    commit({ marks, reasons });
  },

  /** Replace the marks wholesale — the map's undo, which restores a snapshot. */
  restore(marks, reasons) {
    commit({ marks: new Map(marks), reasons: reasons ?? campaign.snapshot().reasons });
  },

  clear() {
    commit({ marks: new Map(), reasons: {} });
  },

  /** Why this place is in the plan, if anything said so. */
  reasonFor(key) {
    return campaign.snapshot().reasons[key] ?? null;
  },

  /** What the plan says about a place, in one word. */
  statusOf(key) {
    return statusOf(campaign.snapshot().marks, key);
  },
};
