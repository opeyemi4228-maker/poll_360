import { states2023, parties, others } from "./election2023.js";
import { ZONES } from "./zones.js";
import { battlegrounds, byZone, project, winCondition } from "./forecast.js";

/**
 * The board Poll360 AI writes on.
 *
 * ── WHY A BOARD AND NOT A LONGER ANSWER ────────────────────────────────────
 * A spoken answer is gone the moment it finishes. That is fine for one figure
 * and useless for the thing a room actually does, which is hold four or five
 * places side by side and argue about them. So anything the assistant is
 * asked for can be put up and left up: ask for Kano, ask for Rivers, ask for
 * the projection, and all three stay on the wall until somebody takes them
 * down.
 *
 * ── A CARD IS A POINTER, NOT A PICTURE ─────────────────────────────────────
 * Every card here is small enough to write down: a kind, a place, and nothing
 * else. The figures are recomputed from the same modules the dashboards read,
 * every time it draws. That is deliberate. A card that stored its numbers
 * would still be showing 40% counted an hour after the count finished, and a
 * stale figure on a wall is worse than no figure at all. It also means a board
 * saved tonight is a handful of bytes rather than a copy of the country's
 * boundaries.
 * ───────────────────────────────────────────────────────────────────────────
 */

const ALL = [...parties, others];

/* ── what a card is ───────────────────────────────────────────────────────── */

export const CARD_TITLE = {
  map: "Map",
  result: "Result",
  parties: "Every party",
  turnout: "Turnout",
  register: "The register",
  projection: "The projection",
  battlegrounds: "Closest states",
  zones: "By zone",
  answer: "Noted",
};

/**
 * The cards that are about the country and cannot be about anywhere else.
 *
 * "Put the closest states up" while standing in Rivers is not a request for
 * Rivers. These three are national by construction, so whatever place is
 * named or open is discarded rather than printed under a heading it does not
 * belong to.
 */
const NATIONWIDE = new Set(["projection", "battlegrounds", "zones"]);

let counter = 0;

/**
 * Turn a spoken request into a card.
 *
 * `spec` is what the person asked for. `context` is where the room is, so
 * "put the turnout up" with nothing named means the place currently on screen
 * rather than the whole country.
 */
export function buildCard(spec, context = {}) {
  const kind = spec?.kind ?? "answer";
  const place = NATIONWIDE.has(kind)
    ? { scope: "nation", stateCode: null, lga: null, ward: null, name: "Nigeria" }
    : resolvePlace(spec?.place, context);

  counter += 1;
  const base = {
    id: `card-${Date.now().toString(36)}-${counter}`,
    kind,
    at: Date.now(),
    stateCode: place.stateCode,
    lga: place.lga,
    ward: place.ward,
    scope: place.scope,
    place: place.name,
  };

  if (kind === "answer") {
    return { ...base, title: "Noted", subtitle: place.name, text: spec?.text ?? "" };
  }

  return { ...base, title: CARD_TITLE[kind] ?? "Card", subtitle: place.name };
}

/**
 * Which place a card is about.
 *
 * A place named out loud wins. Nothing named means wherever the room is
 * standing, because somebody who says "put the turnout up" while looking at
 * Ogun means Ogun, and making them say it twice is the kind of thing that
 * gets an assistant switched off.
 */
function resolvePlace(place, context) {
  const named = place?.state?.code ?? null;
  const standing = context.path?.[0]?.code ?? null;
  const stateCode = named ?? standing;

  const lga = place?.lga ?? (named && named !== standing ? null : (context.path?.[1]?.name ?? null));
  const wardNumber = place?.ward ?? null;
  const ward = wardNumber ? `Ward ${String(wardNumber).padStart(2, "0")}` : (place?.lga ? null : (context.path?.[2]?.name ?? null));

  const state = stateCode ? states2023.find((row) => row.code === stateCode) : null;

  if (!state) return { scope: "nation", stateCode: null, lga: null, ward: null, name: "Nigeria" };
  if (!lga) return { scope: "state", stateCode, lga: null, ward: null, name: state.name };
  if (!ward) return { scope: "lga", stateCode, lga, ward: null, name: `${lga}, ${state.name}` };
  return { scope: "ward", stateCode, lga, ward, name: `${ward}, ${lga}` };
}

/* ── the figures behind a card ────────────────────────────────────────────── */

/**
 * The numbers a card draws, worked out fresh every render.
 *
 * `rowFor` is supplied by the room, because only the room knows how a local
 * government's share of its state was divided and the board must never come
 * to a different answer from the map beside it. Where the room cannot supply
 * one, the card says the place could not be reached rather than substituting
 * the state it sits in.
 */
export function figuresFor(card, { rowFor } = {}) {
  if (card.scope === "nation") {
    const votes = ALL.map((_, index) =>
      states2023.reduce((sum, state) => sum + state.votes[index], 0)
    );
    const total = votes.reduce((sum, value) => sum + value, 0);
    const registered = states2023.reduce((sum, state) => sum + state.registered, 0);
    const booths = states2023.reduce((sum, state) => sum + state.booths, 0);
    return { votes, total, registered, booths, turnout: (total / registered) * 100, density: Math.round(registered / booths) };
  }

  if (card.scope === "state") {
    const state = states2023.find((row) => row.code === card.stateCode);
    if (!state) return null;
    return {
      votes: state.votes,
      total: state.total,
      registered: state.registered,
      booths: state.booths,
      turnout: state.turnout,
      density: Math.round(state.registered / state.booths),
    };
  }

  return rowFor?.(card) ?? null;
}

/** Every party at a place, biggest first, with its share. */
export function standingsFor(figures) {
  if (!figures) return [];
  return ALL.map((party, index) => ({
    party,
    votes: figures.votes[index] ?? 0,
    share: ((figures.votes[index] ?? 0) / (figures.total || 1)) * 100,
  })).sort((a, b) => b.votes - a.votes);
}

/** The projection as it stands with no assumptions set: the declared result. */
export function projectionRows() {
  const outcome = winCondition(project({}));
  return outcome.slice(0, 4).map((row) => ({
    id: row.id,
    votes: row.votes,
    share: row.share,
    quarterStates: row.quarterStates,
    states: row.states,
  }));
}

/** The states a small movement could change hands. */
export function closestStates(limit = 8) {
  return battlegrounds(project({}), 12).slice(0, limit);
}

/** The six zones, each with who led it. */
export function zoneRows() {
  const rows = byZone(project({}));
  return rows.map((row) => ({ ...row, states: ZONES[row.zone]?.length ?? 0 }));
}

/* ── keeping a board ──────────────────────────────────────────────────────── */

/**
 * ── WHY THIS STAYS IN THE BROWSER ──────────────────────────────────────────
 * A board is somebody's working notes during one shift, not a record of the
 * election. Putting it on the server would mean deciding who else in the room
 * can see it, what happens when two people edit it, and how long it is kept,
 * three questions nobody has asked for. It lives in this browser, it survives
 * a refresh and a crash, and that is the whole promise made about it.
 */
const LIVE = "poll360.board";
const SAVED = "poll360.boards";

function read(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    /* A browser with storage turned off, or a corrupted entry. The board
       simply starts empty rather than taking the room down with it. */
    return fallback;
  }
}

function write(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing, or a full quota. The board still works for this
       session, it just will not be there tomorrow, and that is not worth
       interrupting anybody over. */
  }
}

export const board = {
  load: () => read(LIVE, []),
  keep: (cards) => write(LIVE, cards),

  saved: () => read(SAVED, {}),

  save(name, cards) {
    const key = String(name ?? "").trim() || `Board ${new Date().toLocaleString("en-NG")}`;
    const all = read(SAVED, {});
    all[key.toLowerCase()] = { name: key, at: Date.now(), cards };
    write(SAVED, all);
    return key;
  },

  open(name) {
    const all = read(SAVED, {});
    const wanted = String(name ?? "").trim().toLowerCase();
    /* Spoken names are never typed back exactly. "Open the Kano brief" should
       find "Kano briefing", so an exact key is tried first and a contained
       one after it. */
    return all[wanted] ?? Object.values(all).find((entry) => entry.name.toLowerCase().includes(wanted)) ?? null;
  },

  forget(name) {
    const all = read(SAVED, {});
    delete all[String(name ?? "").trim().toLowerCase()];
    write(SAVED, all);
  },
};
