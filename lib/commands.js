import { states2023 } from "./election2023.js";
import { findState, findParty, normalise } from "./assistant.js";

/**
 * Poll360 AI, the driving half.
 *
 * ── WHY DRIVING IS A SEPARATE MODULE FROM ANSWERING ────────────────────────
 * Answering and driving fail in opposite directions. An answer that is not
 * quite what you meant costs you a sentence; you ask again. A drive that is
 * not quite what you meant throws the screen somewhere else in the middle of
 * a broadcast, and the person now has to find their way back before they can
 * even repeat themselves. So this half is deliberately stricter than the
 * other: it acts only when it is confident, and when it is not confident it
 * hands the sentence back to be answered instead of guessing at a destination.
 *
 * ── AN INSTRUCTION LOOKS DIFFERENT FROM A QUESTION ─────────────────────────
 * "What is turnout" is a question about a word. "Show me turnout" is an
 * instruction to change the screen. The difference is a verb, so almost
 * everything here requires one. The exceptions are the handful of phrases
 * that cannot be anything but an instruction, "go back", "the whole country",
 * and a bare surface name said on its own.
 *
 * ── IT RETURNS AN INTENTION, NOT AN EFFECT ─────────────────────────────────
 * Nothing here touches the screen. It returns what should happen and what
 * should be said about it, and the room decides whether it can do that. A
 * dashboard with no map ignores a map instruction rather than crashing on it,
 * and the same sentence works in every room without this module knowing which
 * room it is in.
 * ───────────────────────────────────────────────────────────────────────────
 */

/* ── matching ─────────────────────────────────────────────────────────────── */

/**
 * The longest phrase wins.
 *
 * "the planning board" contains both "planning" and "board". Taking the first
 * hit would open the whiteboard; taking the longest takes the phrase the
 * person actually said. Every table here is searched this way.
 */
function longest(q, table) {
  let best = null;
  for (const entry of table) {
    for (const phrase of entry.words) {
      if (q.includes(phrase) && (!best || phrase.length > best.length)) {
        best = { entry, length: phrase.length, phrase };
      }
    }
  }
  return best;
}

/* Anything that turns a noun into an instruction. Without one of these a
   sentence is a question, and questions belong to the answering half. */
const VERB =
  /\b(show|open|go|goto|take|bring|pull|switch|jump|display|put|move|navigate|zoom|drill|load|back|return|clear|wipe|erase|rub|scrub|delete|remove|save|store|keep|pin|add|write|restore|find|focus|centre|center)\b/;

/* Spoken numbers. Recognition writes "ward 7" about as often as "ward seven",
   and a room saying the second and getting nothing would rightly call the
   thing broken. */
const NUMBER_WORD = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};

function numberAfter(q, word) {
  const digits = new RegExp(`${word}\\s+(?:number\\s+)?(\\d{1,3})`).exec(q);
  if (digits) return Number(digits[1]);
  const spoken = new RegExp(`${word}\\s+(?:number\\s+)?([a-z]+)`).exec(q);
  const value = spoken && NUMBER_WORD[spoken[1]];
  return value ?? null;
}

/* ── the surfaces of the situation room ───────────────────────────────────── */

/**
 * Every screen, keyed by what a person calls it out loud.
 *
 * The tab values and the spoken words are not the same and never will be: the
 * Voters tab is `register` internally and nobody has ever said "take me to
 * register". Both are listed so either works.
 */
const SURFACES = [
  { tab: "results", words: ["results", "the result", "the count", "who is winning", "who's winning", "the scoreboard", "results layer"] },
  { tab: "register", words: ["voters", "the register", "registered voters", "voters layer", "voter layer"] },
  { tab: "turnout", words: ["turnout", "turnout layer"] },
  { tab: "density", words: ["clusters", "density", "the cluster layer", "voters per unit"] },
  { tab: "watch", words: ["coordinators", "the coordinators", "agents", "the agents", "coordinator watch", "the watch"] },
  { tab: "stream", words: ["reports", "the reports", "incidents", "the incidents", "the feed", "situation feed", "report stream"] },
  { tab: "analytics", words: ["analytics", "the projection", "projection", "the forecast", "forecast", "scenarios", "what if"] },
  { tab: "planning", words: ["planning", "the plan", "deployment", "planning map", "coverage plan"] },
  { tab: "board", words: ["board", "the board", "whiteboard", "white board", "the canvas", "canvas", "workspace"] },
];

const SURFACE_NAME = {
  results: "Results",
  register: "Voters",
  turnout: "Turnout",
  density: "Clusters",
  watch: "Coordinators",
  stream: "Reports",
  analytics: "Analytics",
  planning: "Planning",
  board: "the board",
};

/* ── the other rooms ──────────────────────────────────────────────────────── */

/**
 * The dashboards that are whole pages rather than tabs.
 *
 * Going to one is a page load, which is slower and more disruptive than
 * changing a tab, so these are matched on full phrases only: "field" on its
 * own is a word people use about the work, not a place they want to be sent.
 */
const ROOMS = [
  { href: "/room", words: ["the situation room", "situation room", "the war room"] },
  { href: "/broadcast", words: ["the broadcast desk", "broadcast desk", "the broadcast board", "the studio", "on air"] },
  { href: "/field", words: ["the field desk", "field desk", "the field dashboard", "field dashboard"] },
  { href: "/whatsapp", words: ["the whatsapp desk", "whatsapp desk", "whatsapp", "the message desk"] },
  { href: "/admin", words: ["the admin desk", "admin desk", "administration", "the accounts desk"] },
  { href: "/console", words: ["my account", "the console", "account settings"] },
  { href: "/", words: ["the home page", "the public board", "the website", "the front page"] },
];

/* ── what can go on the board ─────────────────────────────────────────────── */

/**
 * The cards the board can hold.
 *
 * Each is a thing a room asks for out loud, and each is computed from the same
 * modules the screens are drawn from rather than described in prose. Nothing
 * goes up that the dashboard behind it would contradict.
 */
const CARDS = [
  { kind: "map", said: "The map", words: ["the map", "map", "a map", "the shape", "geography"] },
  { kind: "result", said: "The result", words: ["the result", "result", "results", "who won", "the figures", "figures", "the numbers", "numbers"] },
  { kind: "parties", said: "Every party", words: ["the parties", "parties", "party breakdown", "the breakdown", "every party", "all the parties", "the split"] },
  { kind: "turnout", said: "Turnout", words: ["the turnout", "turnout"] },
  { kind: "register", said: "The register", words: ["the register", "register", "voters", "registered voters"] },
  { kind: "projection", said: "The projection", national: true, words: ["the projection", "projection", "the forecast", "forecast", "the win condition", "win condition"] },
  { kind: "battlegrounds", said: "The closest states", national: true, words: ["the closest states", "closest states", "battlegrounds", "the battlegrounds", "marginals", "the marginal states"] },
  { kind: "zones", said: "The zones", national: true, words: ["the zones", "zones", "by zone", "the regions", "regions"] },
];

/**
 * Every word this module already understands as something other than a place.
 *
 * Without this, "show turnout in Lagos" reads "turnout" as the name of a local
 * government of Lagos, and the map spends the next second looking for it. The
 * words the product owns are subtracted before anything left over is treated
 * as a place name.
 */
const VOCABULARY = new RegExp(
  `\\b(${[...SURFACES, ...CARDS, ...ROOMS]
    .flatMap((entry) => entry.words)
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})\\b`,
  "g"
);

/* ── where the question is about ──────────────────────────────────────────── */

/**
 * The place named in a sentence, as deep as it can honestly be resolved.
 *
 * A state is resolvable anywhere, because all 37 are loaded from the moment
 * the room opens. A local government is only resolvable once its state's
 * boundaries have arrived, so when somebody says "take me to Ikeja in Lagos"
 * this returns Lagos and marks Ikeja as pending. The room drills the rest of
 * the way when the names land. That is the honest version: the alternative is
 * shipping all 774 names to every browser to answer a question most rooms
 * never ask.
 */
function findPlace(raw, q, context) {
  const state = findState(raw);
  const open = context.path?.[0] ?? null;
  /* A local government named without a state means the state already on
     screen. "Go to Ikeja" from inside Lagos is the common case. */
  const host = state ?? open;

  let lga = null;
  if (context.lgas?.length && (!state || state.code === open?.code)) {
    const hit = longest(q, context.lgas.map((name) => ({ name, words: [normalise(name)] })));
    if (hit) lga = hit.entry.name;
  }

  const ward = numberAfter(q, "ward");
  const unit = numberAfter(q, "(?:polling unit|unit|pu|booth)");

  if (!host && !lga && ward === null) return null;

  return {
    state: host ? { code: host.code, name: host.name } : null,
    /* Named but not yet resolvable: the room finishes the drill when the
       boundary file lands. */
    pendingLga: lga ? null : namedButUnresolved(q, state, context),
    lga,
    ward,
    unit,
  };
}

/**
 * A sub-state place we can hear but cannot yet place.
 *
 * Only ever set when the sentence names a state we are not currently inside,
 * because that is the one case where the names genuinely are not loaded. If
 * we are already in the state and still cannot match, the person said
 * something that is not a local government of it, and inventing a pending
 * target would send the map somewhere arbitrary a second later.
 */
function namedButUnresolved(q, state, context) {
  if (!state || state.code === context.path?.[0]?.code) return null;
  const after = q.split(normalise(state.name))[0]?.trim();
  if (!after) return null;
  /* The words before the state name, minus the instruction itself. Anything
     left is a candidate: "show me Ikeja in Lagos" leaves "ikeja". */
  const rest = after
    .replace(VERB, " ")
    .replace(VOCABULARY, " ")
    .replace(/\b(me|the|to|into|in|on|at|for|of|us|please|poll360|ai|local government|lga|area)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return rest.length > 2 ? rest : null;
}

/** A one-line headline for a state, straight off the declared table. */
function headline(code) {
  const row = states2023.find((state) => state.code === code);
  if (!row) return null;
  const order = row.votes
    .map((votes, index) => ({ votes, index }))
    .sort((a, b) => b.votes - a.votes);
  const ids = ["APC", "PDP", "LP", "NNPP", "Others"];
  return `${row.name}. ${ids[order[0].index]} led it, on ${Math.round((order[0].votes / (row.total || 1)) * 100)}% of ${row.total.toLocaleString("en-NG")} votes cast.`;
}

/* ── the readers, tried in order ──────────────────────────────────────────── */

const READERS = [
  /* ---------------------------------------------------------- the board */
  {
    id: "board-clear",
    read: (q) =>
      /\b(clear|wipe|empty|reset|scrub)\b.*\b(board|canvas|everything|it all|whiteboard)\b|\berase everything\b|\bstart (a )?(new|fresh) board\b/.test(q)
        ? { act: { do: "clear" }, say: "Board cleared." }
        : null,
  },
  {
    id: "board-erase",
    read: (q) => {
      if (!/\b(erase|rub|remove|delete|take)\b/.test(q)) return null;

      /* Naming a card is itself enough to mean the board: "erase the map" is
         not a sentence about anything else on this product. */
      const card = longest(q, CARDS);
      const target = /\b(board|canvas|card|that|this|it|last|whiteboard)\b/.test(q);
      if (!card && !target) return null;

      return {
        act: { do: "erase", kind: card?.entry.kind ?? null },
        say: "Taken off the board.",
      };
    },
  },
  {
    id: "board-save",
    read: (q) => {
      if (!/\b(save|store|keep)\b/.test(q)) return null;
      if (!/\b(board|canvas|this|it|whiteboard|work)\b/.test(q)) return null;

      const named = /\b(?:as|called|named)\s+(.{2,48})$/.exec(q);
      const name = named ? named[1].trim() : null;
      return {
        act: { do: "save", name },
        say: name ? `Saved as ${name}.` : "Board saved. Say save it as, and a name, if you want to find it again by name.",
      };
    },
  },
  {
    id: "board-restore",
    read: (q) => {
      const hit = /\b(?:open|restore|bring back|load|show)\s+(?:the\s+)?(?:saved\s+)?board\s+(?:called\s+|named\s+)?(.{2,48})$/.exec(q);
      if (!hit) return null;
      return { act: { do: "restore", name: hit[1].trim() }, say: `Opening ${hit[1].trim()}.` };
    },
  },
  {
    id: "board-pin",
    read: (raw, q, context) => {
      /* Two ways in: "put X on the board", or "show X on the board". Both
         have to name the board, because everything the board can hold is
         also a thing the room can simply be shown. */
      const wantsBoard = /\b(on|onto|to|up on)\s+(the\s+)?(board|canvas|whiteboard)\b|\bpin\b|\bwrite (it|that|this) (up|down)\b/.test(q);
      if (!wantsBoard) return null;

      const place = findPlace(raw, q, context);
      const card = longest(q, CARDS);
      const party = findParty(raw);

      /* "Put that on the board" with nothing named means the last answer. */
      if (!card && !place && !party) {
        return { act: { do: "pin", card: { kind: "answer" } }, say: "On the board." };
      }

      /* A card that is about the country cannot also be about the state
         somebody happens to be standing in, so the place is dropped along
         with any mention of it in what gets said back. */
      const national = card?.entry.national ?? false;

      return {
        act: {
          do: "pin",
          card: {
            kind: card?.entry.kind ?? (place ? "result" : "answer"),
            place: national ? null : (place ?? null),
            party: party?.id ?? null,
          },
        },
        say: national
          ? `${card.entry.said}, on the board.`
          : place?.state
            ? `${place.state.name}, on the board.`
            : card
              ? `${card.entry.said}, on the board.`
              : "On the board.",
      };
    },
  },

  /* ------------------------------------------------------- moving the map */
  {
    id: "up",
    read: (q) =>
      /\b(go|zoom|move|step|come|take me|back)\b.*\b(back|up|out|out again|a level|one level|up one)\b|^back$|^go back$|^zoom out$|^up$/.test(q) &&
      !/\b(back to|all the way)\b/.test(q)
        ? { act: { do: "up" }, say: null }
        : null,
  },
  {
    id: "root",
    read: (raw, q) =>
      /\b(the whole country|whole country|the federation|all of nigeria|nationally|national level|the nation|back to nigeria|all the way out|zoom right out|start again)\b/.test(q) &&
      !findState(raw)
        ? { act: { do: "root" }, say: "Back to the whole country." }
        : null,
  },
  /* --------------------------------------------------------- the surfaces */
  {
    id: "surface",
    read: (raw, q, context) => {
      const hit = longest(q, SURFACES);
      if (!hit) return null;

      /* A bare surface name on its own is an instruction; inside a longer
         sentence it needs a verb, or "what is turnout" would move the screen
         instead of explaining the word. */
      const bare = q === hit.phrase || q === `the ${hit.phrase}`;
      if (!bare && !VERB.test(q)) return null;
      if (/\bwhat (is|are|does)\b|\bexplain\b|\bmean\b/.test(q)) return null;

      const tab = hit.entry.tab;
      const place = findPlace(raw, q, context);

      /* The surface exists, but not in this room. Say where it lives rather
         than silently doing nothing. */
      if (context.tabs?.length && !context.tabs.includes(tab)) {
        return {
          act: { do: "route", href: "/room", tab },
          say: `${SURFACE_NAME[tab]} is in the situation room. Taking you there.`,
        };
      }

      return {
        act: { do: "tab", tab, place: place ?? null },
        say: place?.state
          ? `${SURFACE_NAME[tab]}, ${place.state.name}.`
          : `${SURFACE_NAME[tab]}.`,
      };
    },
  },

  /* ------------------------------------------------- the place on the map */
  {
    id: "place",
    read: (raw, q, context) => {
      if (!VERB.test(q)) return null;
      /* A sentence that names a surface as well as a place is handled by the
         surface reader below, which carries the place along with it. */
      const place = findPlace(raw, q, context);
      if (!place) return null;

      const parts = [];
      if (place.state) parts.push(place.state.name);
      if (place.lga) parts.push(place.lga);
      if (place.ward) parts.push(`Ward ${String(place.ward).padStart(2, "0")}`);

      return {
        act: { do: "place", place },
        /* The headline comes with the move, because "show me Kano" is almost
           never a request to look at a shape. It is a request for what
           happened in Kano, and having to ask again for it is a wasted turn
           on a desk that is live. */
        say: place.lga || place.ward ? parts.join(", ") + "." : (headline(place.state?.code) ?? parts.join(", ")),
      };
    },
  },

  /* ------------------------------------------------------- the other rooms */
  {
    id: "room",
    read: (raw, q) => {
      if (!VERB.test(q)) return null;
      const hit = longest(q, ROOMS);
      if (!hit) return null;
      return { act: { do: "route", href: hit.entry.href }, say: "On my way." };
    },
  },
];

/**
 * Read a sentence as an instruction.
 *
 * @param text    what was said or typed
 * @param context where the room currently is: which tabs it has, how deep the
 *                map is, and the names of the local governments it has loaded
 * @returns       what should happen and what to say about it, or null if this
 *                was not an instruction at all, in which case it is a question
 *                and the answering half takes it
 */
export function drive(text, context = {}) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;

  const q = normalise(raw);

  for (const reader of READERS) {
    const result = reader.read(raw, q, context);
    if (result) return { id: reader.id, ...result };
  }

  return null;
}

/** What to offer somebody who has not worked out that it drives yet. */
export const DRIVING_STARTERS = [
  "Show me Kano",
  "Open turnout",
  "Put the map on the board",
  "Go back",
];
