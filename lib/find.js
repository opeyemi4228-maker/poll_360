import { parseUnitCode } from "./units.js";

/**
 * Universal search: one box, and it never comes back with nothing.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE QUESTION THIS ANSWERS IS ASKED OUT LOUD, NOT TYPED CAREFULLY
 *
 *  Somebody in the room is on the telephone. What reaches them is a sentence:
 *  "Kano, Nassarawa local government, ward four, PU two." Not a code. Not a
 *  code in the spelling this product happens to store. A sentence, with the
 *  levels in the order a person says them, punctuated however the person
 *  typing it decides to punctuate it.
 *
 *  The search this replaced took thirty-seven state names and the local
 *  governments of whichever state was already open, matched them as
 *  substrings, and moved a map. Everything else in the product — every booth,
 *  every agent, every report — was unreachable by typing, which meant the one
 *  control in the room that works while you are holding a phone could not
 *  reach the three things a phone call is ever about.
 *
 *  So this takes the sentence. It resolves as far down the ladder as the
 *  words allow, and hands back what it reached.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE RULE THAT MAKES IT WORTH HAVING: NO DEAD ENDS ──────────────────────
 * A query that names a booth this room holds nothing about still resolves.
 * It comes back as a booth, with the state and the local government its code
 * names, and the card it opens says in words that nothing has been filed from
 * it, nobody is assigned to it, and nothing has been reported. That is not an
 * empty result. It is four findings, and on election night it is the most
 * important answer this box gives: *we have nobody there.*
 *
 * A search that returned "no matches" for a real booth code would send the
 * person back to the phone to ask a question this product could already
 * answer.
 *
 * ── IT IS PURE, AND THAT IS NOT AN ACCIDENT ────────────────────────────────
 * Nothing here reads the disk or the database. The room already holds every
 * booth it knows about, keyed and named, because lib/unit-card.js built that
 * index on the server for the intelligence card — so searching it costs one
 * pass over an object already in the browser, and the box answers with no
 * network at all. On the connection in the room, at the hour the connection
 * in the room is worst, that is the difference between a search box and a
 * spinner.
 * ───────────────────────────────────────────────────────────────────────────
 */

/* ───────────────────────────────────────────────────────── what a hit can be

   Ordered. Where two kinds match a query equally well the one earlier in this
   list is offered first, and the ordering is the ladder itself: a person who
   types "Kano" wants the state before they want a booth in it, and a person
   who types nine digits wants the booth. */
export const KINDS = {
  unit: { rank: 0, label: "Polling unit" },
  agent: { rank: 1, label: "Agent" },
  state: { rank: 2, label: "State" },
  lga: { rank: 3, label: "Local government" },
  ward: { rank: 4, label: "Ward" },
};

/** Case, punctuation and the spelling of a hyphen, all made to stop mattering. */
export function normalise(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/* ── THE WORDS PEOPLE PUT BETWEEN THE LEVELS ───────────────────────────────
   "Kano → Nassarawa LGA → Ward 4 → PU 002" carries three level words and two
   kinds of arrow. None of them is part of a name, and every one of them is
   how a person says the thing rather than how the product stores it. They are
   stripped before matching and read as separators when splitting.

   `pu` is here and `unit` is not: "unit" appears in no Nigerian place name,
   but neither does it appear in what people actually type, and leaving it out
   costs nothing. `ward` earns its place because a ward genuinely has no name
   in this product — see the note in lib/unit-card.js — so the only thing
   anybody can say about one is its number. */
const LEVEL_WORDS = /\b(lga|l\.g\.a\.?|local government(?: area)?|ward|pu|polling unit|booth|state)\b/gi;

/** Every character a person might put between two levels of the ladder. */
const SEPARATORS = /\s*(?:→|->|>|\/|,|·|\||»)\s*/;

/**
 * Read a spoken path into the four levels it names.
 *
 * ── WHY THIS IS SEPARATE FROM MATCHING ─────────────────────────────────────
 * Matching answers "what in the index is called this". A path answers "how
 * far down did they get", and the two are different jobs: "Kano" is a
 * complete answer to the first and a one-rung answer to the second. Keeping
 * them apart is what lets a partial path — a state and a local government,
 * with no ward said yet — narrow the booth list rather than returning nothing
 * because no single row is called "Kano Nassarawa".
 *
 * Returns nulls all the way down for anything that is not a path. That is not
 * a failure; most queries are one word.
 */
export function parsePath(query) {
  const raw = String(query ?? "").trim();
  if (!raw) return EMPTY_PATH;

  /* ── A BARE CODE IS A PATH, AND THE SHORTEST ONE THERE IS ──────────────
     Tried first and on the untouched string, because `parseUnitCode` is
     already the product's one tolerant reader of a booth code and splitting
     "20/05/04/002" on slashes here would hand it four fragments to reassemble.
     One reader, and it is the one every other module uses. */
  const code = parseUnitCode(raw);
  if (code) {
    return {
      state: code.stateName,
      stateNumber: code.stateNumber,
      lga: null,
      lgaCode: code.lgaCode,
      ward: code.wardCode.split("/").at(-1),
      wardCode: code.wardCode,
      unit: code.unitNo,
      unitCode: code.code,
      /* Said in full. Nothing below is a guess. */
      depth: 4,
    };
  }

  const parts = raw
    .split(SEPARATORS)
    .map((part) => part.replace(LEVEL_WORDS, " ").trim())
    .filter(Boolean);

  if (parts.length < 2) return EMPTY_PATH;

  /* ── THE LAST TWO RUNGS ARE NUMBERS, AND THE FIRST TWO ARE NAMES ───────
     A ward and a polling unit have no names in this product, so anything
     numeric in the third or fourth position is read as one. A local
     government is a name; a state is a name. That is the whole grammar, and
     it is deliberately this small: a parser that tried to be cleverer would
     start guessing which of two ambiguous words was the local government,
     and a wrong guess sends somebody to the wrong booth. */
  const digits = (part) => {
    const only = String(part).replace(/\D/g, "");
    return only ? only : null;
  };

  const [first, second, third, fourth] = parts;

  return {
    state: first ?? null,
    stateNumber: null,
    lga: second ?? null,
    lgaCode: null,
    ward: third ? digits(third) : null,
    wardCode: null,
    unit: fourth ? digits(fourth) : null,
    unitCode: null,
    depth: parts.length,
  };
}

const EMPTY_PATH = {
  state: null,
  stateNumber: null,
  lga: null,
  lgaCode: null,
  ward: null,
  wardCode: null,
  unit: null,
  unitCode: null,
  depth: 0,
};

/* ───────────────────────────────────────────────────────────────── the index

   Built once from what the room is already holding. Everything in it carries
   the words it can be found by, flattened and normalised at build time rather
   than on every keystroke: a room types into this box while four thousand
   returns are landing, and re-normalising the index on each letter is the
   difference between a box that answers as you type and one that stutters. */

/**
 * @param states      the board's states — code, name
 * @param lgas        the open state's local governments, if the boundaries
 *                    for it have arrived. Named rather than numbered, which
 *                    is why they come from the caller: turning "18/03" into
 *                    "Chikun" reads from disk and cannot happen in a browser.
 * @param cards       the polling unit index, keyed by canonical unit code —
 *                    lib/unit-card.js
 * @param agents      the coordinator watch list
 */
export function buildIndex({ states = [], lgas = [], cards = {}, agents = [] } = {}) {
  const entries = [];

  for (const row of states) {
    if (!row?.name) continue;
    entries.push({
      key: `state:${row.code ?? row.name}`,
      kind: "state",
      label: row.name,
      hint: "State",
      needle: normalise(row.name),
      target: { kind: "place", path: [{ code: row.code ?? null, name: row.name }] },
    });
  }

  for (const row of lgas) {
    if (!row?.name) continue;
    entries.push({
      key: `lga:${row.state?.code ?? ""}:${row.name}`,
      kind: "lga",
      label: row.name,
      hint: row.state?.name ? `Local government · ${row.state.name}` : "Local government",
      needle: normalise(`${row.name} ${row.state?.name ?? ""}`),
      target: {
        kind: "place",
        path: [row.state, { name: row.name }].filter(Boolean),
      },
    });
  }

  /* ── EVERY BOOTH THE ROOM HOLDS ANYTHING ABOUT ─────────────────────────
     Found by its code, by the places its code names, and by the name of
     whoever is standing at it — because "what is happening at Musa's booth"
     is a question somebody asks in exactly those words, and the code is the
     one part of it they do not have. */
  for (const [code, card] of Object.entries(cards)) {
    entries.push({
      key: `unit:${code}`,
      kind: "unit",
      label: code,
      hint: placeLine(card) || "Polling unit",
      /* The code twice: once with its slashes and once as bare digits, so
         "200504002" and "20/05/04/002" both find it without the matcher
         having to know anything about codes. */
      needle: normalise(
        [code, code.replace(/\D/g, ""), card.lga, card.state, card.agent?.name]
          .filter(Boolean)
          .join(" ")
      ),
      unitCode: code,
      /* ── THE TWO RUNGS THAT ARE NUMBERS, KEPT AS NUMBERS ──────────────
         A ward and a booth have no names, only positions, so "ward 4" can
         only ever be matched against a code. Matching it as text against the
         needle would find ward 04 inside "…/04/002" and also inside a local
         government numbered 04 and also inside a register of 4,004 — three
         different things that happen to share two digits. These are compared
         as what they are. */
      wardNo: card?.wardCode ? String(card.wardCode).split("/").at(-1) : null,
      unitNo: card?.unitNo ?? code.split("/").at(-1),
      target: { kind: "unit", unitCode: code },
    });
  }

  for (const row of agents) {
    if (!row?.name) continue;
    entries.push({
      key: `agent:${row.id ?? row.name}`,
      kind: "agent",
      label: row.name,
      hint: row.scope ? `Agent · ${row.scope}` : "Agent",
      needle: normalise(`${row.name} ${row.scope ?? ""}`),
      unitCode: row.scope ?? null,
      target: { kind: "agent", id: row.id ?? null, unitCode: row.scope ?? null },
    });
  }

  return entries;
}

const placeLine = (card) =>
  [
    card?.unitNo && `Unit ${card.unitNo}`,
    card?.wardCode && `Ward ${String(card.wardCode).split("/").at(-1)}`,
    card?.lga,
    card?.state,
  ]
    .filter(Boolean)
    .join(" · ");

/* ──────────────────────────────────────────────────────────────── the search */

/**
 * What the box should offer for what has been typed so far.
 *
 * ── HOW IT RANKS, AND WHY IT IS NOT A FUZZY MATCHER ────────────────────────
 * A name that starts with what you typed beats one that merely contains it,
 * and after that the shorter name wins. That is the whole ranking, and it is
 * deliberately not a similarity score: a room is typing the first few letters
 * of something it already knows the name of, and fuzzy matching's whole
 * purpose — finding what you did not quite spell — is bought by sometimes
 * offering something you did not ask for. On a screen that dispatches people,
 * that trade is the wrong way round.
 */
export function search(entries, query, { limit = 10 } = {}) {
  const path = parsePath(query);

  /* ── A FULL CODE SHORT-CIRCUITS EVERYTHING ─────────────────────────────
     Nine digits are unambiguous. Offering a list of near-misses under an
     exact booth code would ask somebody to choose between one right answer
     and four wrong ones. */
  if (path.unitCode) {
    const held = entries.find((row) => row.kind === "unit" && row.unitCode === path.unitCode);
    if (held) return [held];
    return [unknownBooth(path)];
  }

  const needle = normalise(String(query ?? "").replace(LEVEL_WORDS, " "));
  if (!needle) return [];

  /* ── A PARTIAL PATH NARROWS RATHER THAN MATCHES ────────────────────────
     "Kano / Nassarawa" is not the name of anything, so a plain substring
     match returns nothing for it — which is the single most annoying way a
     search box can fail, because the person typing it was being *more*
     specific, not less. Each rung is required separately instead, so the
     booths of one local government come back and the sentence keeps working
     as it is being said. */
  const named = path.depth >= 2
    ? [path.state, path.lga].filter(Boolean).map(normalise).filter(Boolean)
    : null;
  /* Padded to the width the codes are stored in, so "ward 4" and "ward 04"
     are the same question — which is what somebody reading a form out loud
     over a telephone is entitled to assume. */
  const wardNo = named && path.ward ? String(path.ward).padStart(2, "0") : null;
  const unitNo = named && path.unit ? String(path.unit).padStart(3, "0") : null;

  const scored = [];
  for (const row of entries) {
    let at;
    if (named) {
      /* Both names have to be in there somewhere: a query that says two
         levels is being more specific, and every rung of it has to hold. */
      if (!named.every((rung) => row.needle.includes(rung))) continue;
      /* A path that reaches a ward or a booth can only be answered by a
         booth. Offering the local government back for "…ward 4, PU 002"
         would be answering a narrower question with a broader one. */
      if ((wardNo || unitNo) && row.kind !== "unit") continue;
      if (wardNo && row.wardNo !== wardNo) continue;
      if (unitNo && row.unitNo !== unitNo) continue;
      at = row.needle.indexOf(named[0]);
    } else {
      at = row.needle.indexOf(needle);
      if (at === -1) continue;
    }

    /* ── A PATH THAT STOPS AT A PLACE IS ANSWERED BY THAT PLACE ────────
       "Katsina, Bakori" names a local government, and the local government
       is what should be offered first even though every booth inside it also
       matches. Below a named path the booths are the answer, and the
       ordinary rank — which puts a booth first, because a query carrying a
       code fragment is a query about a booth — is the one that applies. */
    const rank =
      named && !wardNo && !unitNo && row.kind === "unit" ? 9 : (KINDS[row.kind]?.rank ?? 9);

    scored.push({ row, at, rank });
    /* A cap on work, not on answers: past a few hundred candidates the top
       ten cannot change, and a room typing one letter into an index of four
       thousand booths should not pay for all of them. */
    if (scored.length > 400) break;
  }

  scored.sort(
    (a, b) =>
      /* Starts-with first, whatever kind it is. */
      (a.at === 0 ? 0 : 1) - (b.at === 0 ? 0 : 1) ||
      a.rank - b.rank ||
      a.at - b.at ||
      a.row.label.length - b.row.label.length ||
      a.row.label.localeCompare(b.row.label)
  );

  return scored.slice(0, limit).map((entry) => entry.row);
}

/**
 * A booth nobody has told us anything about.
 *
 * ── THIS IS A RESULT, NOT A MISS ───────────────────────────────────────────
 * It carries the places its own code names, which are real and which cost
 * nothing to know, and it opens the same card every other booth opens. What
 * that card then says — nothing filed, nobody assigned, nothing reported — is
 * the answer somebody rang in to get.
 */
function unknownBooth(path) {
  return {
    key: `unit:${path.unitCode}`,
    kind: "unit",
    label: path.unitCode,
    hint:
      [
        path.unit && `Unit ${path.unit}`,
        path.ward && `Ward ${path.ward}`,
        path.state,
        "nothing held",
      ]
        .filter(Boolean)
        .join(" · "),
    unitCode: path.unitCode,
    unknown: true,
    target: { kind: "unit", unitCode: path.unitCode },
  };
}
