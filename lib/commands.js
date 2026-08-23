import { states2023 } from "./election2023.js";
import { findState, findParty, normalise } from "./assistant.js";
import { findEveryone } from "./people.js";

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

/**
 * Being called by name.
 *
 * ── WHAT COUNTS AS THE NAME ────────────────────────────────────────────────
 * Recognition mangles product names more than any other kind of word. "Poll
 * 360" comes back as "pole 360", "poll three sixty", "paul ai" and a dozen
 * other things, and a wake phrase that only matches the spelling on the box
 * is a wake phrase that never fires. So the name is matched loosely and the
 * greeting in front of it is optional, because people drop it constantly.
 *
 * It stays deliberately hard to say by accident: the word has to be there,
 * and a sentence about an opinion poll will not contain "poll ai" or "poll
 * 360" in that order.
 */
/* The name, as recognisers actually write it down. */
const NAME = String.raw`(?:poll|pole|paul|pol|pull|pool)`;
const SIXTY = String.raw`(?:360|3\s*60|three\s*sixty)`;
const AI = String.raw`(?:a\.?\s*i\.?|ai|eye)`;
const HELLO = String.raw`(?:hi|hey|hello|ok|okay|yo|high)`;

/**
 * ── THREE WAYS IN, EACH AS LOOSE AS IT CAN SAFELY BE ───────────────────────
 * The first attempt at this required the letters "AI" after the name, and
 * that is precisely what a recogniser is least likely to give you: "AI" comes
 * back as "I", "a i", "eye" or nothing at all, far more often than it comes
 * back as "ai". So the name plus "360" is enough on its own, and so is the
 * name plus any spelling of AI.
 *
 * The third way is the loose one — the name followed by a bare "I" — and it
 * is the only one that needs a greeting in front of it. Without that guard
 * "the poll I saw last week" would wake it mid-conversation, which on a live
 * desk is worse than missing the call.
 */
export const WAKE = new RegExp(
  [
    String.raw`\b${NAME}\s*${SIXTY}(?:\s*${AI})?\b`,
    String.raw`\b${NAME}\s*${AI}\b`,
    String.raw`\b${HELLO}[,\s]+${NAME}\s*(?:${AI}|i)\b`,
  ].join("|"),
  "i"
);

/**
 * The sentence with the name taken off the front.
 *
 * Somebody who says "Hi Poll360 AI, show me Ekiti" has both called it and
 * told it something, in one breath, which is how people actually talk to
 * these things. Answering the greeting and making them repeat the
 * instruction is the behaviour that makes them stop using it.
 */
export function stripWake(text) {
  const without = String(text ?? "").replace(WAKE, " ").replace(/\s+/g, " ").trim();
  /* Nothing but the name: that is a call, not an instruction. */
  return without.replace(/^[,.\s]+/, "");
}

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
  /* ── SINGULARS MATTER MORE THAN THEY LOOK ────────────────────────────────
     "Result Ekiti" is how somebody actually says this out loud, and the list
     held only "results" and "the result", neither of which appears in that
     sentence. The layer went unrecognised, the sentence fell through to being
     read as a bare place name, and the person got the right state on the
     wrong screen — the most confusing possible outcome, because it half
     worked. Every one of these now carries its singular. */
  { tab: "results", words: ["result", "results", "the result", "the count", "who is winning", "who's winning", "the scoreboard", "results layer"] },
  { tab: "register", words: ["voter", "voters", "the register", "register", "registered voters", "voters layer", "voter layer"] },
  { tab: "turnout", words: ["turnout", "turnout layer"] },
  { tab: "density", words: ["cluster", "clusters", "density", "the cluster layer", "voters per unit"] },
  { tab: "watch", words: ["coordinator", "coordinators", "the coordinators", "agents", "the agents", "coordinator watch", "the watch"] },
  { tab: "stream", words: ["report", "reports", "the reports", "incident", "incidents", "the incidents", "the feed", "situation feed", "report stream"] },
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

/* Asking what a thing is, is never asking to be shown it. This guard is the
   one thing standing between "what is turnout" and the screen jumping. */
const ASKING = /\bwhat (is|are|does|do)\b|\bexplain\b|\bmean(s|ing)?\b|\bhow (do|does)\b|\btell me about\b|\bwhy\b/;

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
  /* ------------------------------------------------------ off the product */
  {
    id: "lookup",
    read: (raw, q) => {
      /* Only the phrasings that unambiguously mean "this is not in the
         product". Anything looser steals questions the glossary answers
         better, and answering from the web what we can answer from the
         declared table is how a desk ends up quoting a stranger's summary
         of a figure we are holding ourselves. */
      const hit =
        /^(?:look up|look it up|search (?:the web for|online for|for)|google|check the web for|find out about)\s+(.{2,80})$/.exec(
          q
        ) ?? /^(.{2,80})\s+(?:on the web|from the web|online)$/.exec(q);
      if (!hit) return null;

      const query = hit[1].replace(/\b(please|for me|and put it up|on the board)\b/g, " ").replace(/\s+/g, " ").trim();
      if (query.length < 2) return null;

      return { act: { do: "lookup", query }, say: null };
    },
  },

  /* ------------------------------------------- a layer and a place at once */
  {
    id: "layer-place",
    read: (raw, q, context) => {
      /* ── "RESULT EKITI" ──────────────────────────────────────────────────
         Two nouns and no verb, which is how people actually talk to a screen
         once they trust it. Naming a layer and a place in one breath is
         unambiguous — there is nothing else it could be asking for — so it
         does not need a verb the way a bare place name does. */
      if (ASKING.test(q)) return null;

      const hit = longest(q, SURFACES);
      if (!hit || hit.entry.tab === "board") return null;

      const place = findPlace(raw, q, context);
      if (!place?.state) return null;

      if (context.tabs?.length && !context.tabs.includes(hit.entry.tab)) {
        return {
          act: { do: "route", href: "/room", tab: hit.entry.tab },
          say: `${SURFACE_NAME[hit.entry.tab]} is in the situation room. Taking you there.`,
        };
      }

      return {
        act: { do: "tab", tab: hit.entry.tab, place },
        say: `${SURFACE_NAME[hit.entry.tab]}, ${place.state.name}.`,
      };
    },
  },

  /* ------------------------------------------------- naming it on the board */
  {
    id: "board-bare",
    read: (raw, q, context) => {
      /* ── ON THE BOARD, SAYING A THING IS ASKING FOR IT ────────────────────
         Everywhere else a bare noun is ambiguous, so it needs a verb. On the
         board it is not: the board's entire purpose is holding whatever was
         just named, and there is nothing else "Ekiti State" could mean while
         looking at it. Having to say "put Ekiti on the board" while standing
         on the board is the kind of ceremony that makes people go back to
         clicking. */
      if (context.tab !== "board") return null;
      if (ASKING.test(q)) return null;

      const place = findPlace(raw, q, context);
      const card = longest(q, CARDS);
      const party = findParty(raw);
      if (!place?.state && !card && !party) return null;

      return {
        act: {
          do: "pin",
          card: {
            kind: card?.entry.kind ?? "result",
            place: place ?? null,
            party: party?.id ?? null,
          },
        },
        say: place?.state
          ? `${place.state.name}.`
          : `${card?.entry.said ?? "Up"}.`,
      };
    },
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
      /* ── A NAME ON ITS OWN IS ENOUGH ─────────────────────────────────────
         This used to require a verb, so "Ekiti" did nothing and "show me
         Ekiti" worked. That is a rule the product knows and the person does
         not, and it fails in the most discouraging way possible: silently.

         A place name is now enough on its own. Saying one without a verb is
         almost always a request to see it *and* to be told about it, so the
         move is made and the full answer is read out with it rather than the
         one-line headline a deliberate "take me to" gets. */
      if (ASKING.test(q)) return null;
      const bare = !VERB.test(q);
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
        /* Named with no verb at all: the move is incidental, the question is
           the point, so the full answer is read rather than the headline. */
        alsoAnswer: bare && !place.lga && !place.ward,
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
  /* Called by name and told something in the same breath, which is how
     people talk to these things once they stop being careful with them. The
     name is taken off before anything is read, so "Poll360 AI, Ekiti" is an
     instruction rather than a greeting with a word after it. */
  const raw = stripWake(String(text ?? "").trim());
  if (!raw) return null;

  const q = normalise(raw);

  for (const reader of READERS) {
    const result = reader.read(raw, q, context);
    if (result) return { id: reader.id, ...result };
  }

  return null;
}

/**
 * Everything worth putting up that was mentioned in a sentence.
 *
 * ── WHY THIS IS SEPARATE FROM READING AN INSTRUCTION ───────────────────────
 * `drive` answers "what am I being told to do", and it is strict on purpose:
 * it acts on one thing, or nothing. This answers a different question — "what
 * is this room talking about" — and it is deliberately generous, because
 * nothing it produces changes the screen anybody is working on. It only ever
 * adds to a board that was opened for exactly this.
 *
 * "Compare Kano and Rivers" is one instruction and two places. Strictness
 * would put up Kano and silently drop Rivers, which is the worst of both:
 * the person sees it working and does not see what it missed.
 *
 * ── AND WHY IT ONLY EVER RETURNS PLACES AND PARTIES ────────────────────────
 * Things this product can compute from its own data, and nothing else. A
 * sentence that wanders onto a subject the product knows nothing about
 * produces no cards at all rather than a guess, because a board that fills
 * itself with near-misses is a board somebody turns off.
 */
export function harvest(text, context = {}) {
  const raw = stripWake(String(text ?? "").trim());
  if (!raw) return [];

  const q = normalise(raw);
  if (ASKING.test(q)) return [];

  const specs = [];

  /* Every state named, not just the first. Longest name first so "Cross
     River" is not swallowed by a shorter one sitting inside it. */
  const named = [...states2023]
    .sort((a, b) => b.name.length - a.name.length)
    .filter((state) => q.includes(normalise(state.name)));

  /* What sort of card, if the sentence said. Otherwise the result, which is
     the one people mean when they name a place and nothing else. */
  const card = longest(q, CARDS);
  const kind = card && !card.entry.national ? card.entry.kind : "result";

  for (const state of named) {
    specs.push({ kind, place: { state: { code: state.code, name: state.name } } });
  }

  /* A nationwide card stands on its own and does not repeat per state. */
  if (card?.entry.national) specs.push({ kind: card.entry.kind, place: null });

  /* Nothing placed, but a card kind was named, so it means where the room is
     already standing. */
  if (!specs.length && card) specs.push({ kind: card.entry.kind, place: null });

  return specs.slice(0, 4);
}

/**
 * Which of the recogniser's guesses to believe.
 *
 * ── WHY THE FIRST ONE IS OFTEN NOT THE BEST ONE ────────────────────────────
 * A recogniser does not return one answer, it returns a ranked list, and it
 * ranks them on how English they sound rather than on whether they mean
 * anything here. Asked for Kano it will happily rank "canoe" first, because
 * "canoe" is a far commoner English word than a Nigerian state — and the code
 * was reading only the first one and then failing to find a place in it.
 *
 * We know something the recogniser does not: the handful of thousand words
 * this product is ever actually asked about. Scoring every guess against that
 * and taking the one carrying the most real content is close to free, and it
 * turns a large share of "it did not understand me" into "it understood me".
 *
 * ── IT NEVER INVENTS ───────────────────────────────────────────────────────
 * Every candidate here came from the microphone. This chooses between things
 * that were genuinely heard; it does not correct one into something that was
 * not. That distinction is why this is safe and why guessing at near-misses
 * with edit distance would not be: "Ekiti" and "Ebonyi" are two letters apart
 * and sending the map to the wrong one is worse than asking again.
 */
export function bestHeard(guesses, { wake = false } = {}) {
  const list = (guesses ?? []).map((text) => String(text ?? "").trim()).filter(Boolean);
  if (list.length <= 1) return list[0] ?? "";

  let best = list[0];
  let bestScore = -1;

  list.forEach((text, rank) => {
    const q = normalise(text);
    let score = 0;

    /* Being called by name outweighs everything: in wake mode it is the only
       thing being listened for. */
    if (wake && WAKE.test(text)) score += 20;

    for (const state of states2023) if (q.includes(normalise(state.name))) score += 3;
    /* Names weigh most of all. They are the words a recogniser is worst at,
       because they are not words — "Atiku Abubakar" has no English competitor
       so the engine reaches for whatever is closest, and the real one ends up
       ranked fourth. */
    score += findEveryone(q).length * 4;
    if (findParty(text)) score += 2;
    if (longest(q, SURFACES)) score += 2;
    if (longest(q, CARDS)) score += 2;
    if (VERB.test(q)) score += 1;

    /* The recogniser's own confidence, as a tiebreak and nothing more: it is
       what we are correcting, so it does not get to be the deciding vote. */
    score -= rank * 0.1;

    if (score > bestScore) {
      bestScore = score;
      best = text;
    }
  });

  return best;
}

/* Words that begin a sentence or fill it out, and are never what it is about. */
const NOT_A_NAME =
  /^(?:the|a|an|and|but|so|for|what|who|where|when|why|how|show|open|put|give|tell|this|that|these|those|there|here|it|its|is|are|was|were|has|have|had|will|would|can|could|should|do|does|did|let|make|take|see|look|say|said|okay|yes|no|now|then|next|about|from|with|into|onto|over|under|after|before|our|your|their|his|her|they|them|we|us|you|i)$/i;

/**
 * What is being talked about that a picture would help with.
 *
 * ── WHY THIS IS NOT "ANY NOUN WE DID NOT RECOGNISE" ────────────────────────
 * A board that fills itself with encyclopaedia entries for every word it
 * failed to parse is a board somebody switches off inside five minutes. So
 * this looks for two specific things and nothing else.
 *
 * First, the people and institutions this room genuinely discusses, which are
 * kept in a list precisely so they can be found reliably rather than guessed
 * at. Second, capitalised runs the recogniser produced that are none of ours —
 * a name it heard that this product has never heard of, which is exactly the
 * case where somebody else's reference is worth having.
 *
 * A state on its own is worth a picture too, but only when nothing else in
 * the sentence was: the figures for a state are already the better answer,
 * and a photograph beside them is a bonus rather than the point.
 */
export function topics(text) {
  const raw = stripWake(String(text ?? "").trim());
  if (!raw) return [];

  const q = normalise(raw);

  const known = findEveryone(q).map((entry) => ({
    key: entry.name,
    look: entry.look,
    note: entry.role,
  }));
  if (known.length) return known.slice(0, 2);

  /* Capitalised runs of two or three words. The opening word of the sentence
     is dropped: it is capitalised because it is first, not because it is a
     name. */
  const runs = [];
  const pattern = /\b([A-Z][a-z]{2,}(?:\s+(?:of|the|de)?\s*[A-Z][a-z]{2,}){0,2})\b/g;
  let match;
  let first = true;
  while ((match = pattern.exec(raw)) !== null) {
    const phrase = match[1].trim();
    const wasFirst = first;
    first = false;
    if (wasFirst && match.index === 0 && !phrase.includes(" ")) continue;
    if (NOT_A_NAME.test(phrase)) continue;
    /* Anything this product already knows is answered from its own data, and
       far better than by a summary of it. */
    if (findState(phrase) || findParty(phrase)) continue;
    runs.push({ key: phrase.toLowerCase(), look: phrase, note: null });
  }
  if (runs.length) return runs.slice(0, 2);

  /* Nothing but a place. Worth a picture, and nothing more. */
  const state = findState(raw);
  return state ? [{ key: state.name, look: `${state.name} State, Nigeria`, note: null }] : [];
}

/** What to offer somebody who has not worked out that it drives yet. */
export const DRIVING_STARTERS = [
  "Show me Kano",
  "Open turnout",
  "Put the map on the board",
  "Go back",
];
