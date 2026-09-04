/**
 * The ground an account covers.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY EVERY CONTEST NEEDS ONE
 *
 *  A presidential count is the federation. A governorship is one state. A
 *  senator is elected by a senatorial district, a member of the House of
 *  Representatives by a federal constituency, and a member of a State House
 *  of Assembly and a local government chairman inside a local government.
 *
 *  Those are not five ways of saying "which state". They are five different
 *  extents, and until this module existed the product had only two: the
 *  federation, and a list of states. An organisation covering Kaduna Central
 *  was therefore given Kaduna — three times the map, three times the figures,
 *  and a coverage percentage measured against booths it had nobody in.
 *
 *  ── ONE DEFINITION, AND IT IS A SET OF LOCAL GOVERNMENTS ────────────────
 *  Every extent above resolves to the same thing: the local governments it
 *  contains. That is the level where the three parts of this product already
 *  agree with each other — a unit code's first four digits name one, the
 *  boundary files draw one, and INEC numbers them. So a territory is a name
 *  and a set of local government codes, and everything else — which booths
 *  count, which shapes are drawn, what the coverage denominator is — is read
 *  off that one set.
 *
 *  ── WHAT THIS FILE MAY NOT DO ───────────────────────────────────────────
 *  Nothing here touches the disk. The constituency tables are read by
 *  lib/constituencies.js, which is a server module, and a resolved territory
 *  is handed to this file's functions already carrying its local governments.
 *  That is what lets a map in the browser answer "is this shape mine?" with
 *  the same function the database answers "is this return mine?" with.
 * ══════════════════════════════════════════════════════════════════════════
 */

/**
 * The five extents, and nothing else is one.
 *
 * NATION is not "no territory". It is the whole federation, stated, and it is
 * the only one whose local government set is unbounded — which is why the
 * functions below test for it by name rather than by an empty list. An empty
 * list means a territory that contains nothing, and the two must never be
 * confused: one sees every booth in Nigeria and the other sees none.
 */
export const LEVELS = ["NATION", "STATE", "SENATORIAL", "FEDERAL", "LGA"];

export const LEVEL_LABEL = {
  NATION: "the federation",
  STATE: "a state",
  SENATORIAL: "a senatorial district",
  FEDERAL: "a federal constituency",
  LGA: "a local government",
};

/**
 * Which extent each contest is fought over.
 *
 * ── THE TWO THAT SHARE ONE, AND WHY THAT IS SAID OUT LOUD ──────────────────
 * A local government chairman is elected by exactly the local government, so
 * LGA is that contest's true extent. A member of a State House of Assembly is
 * not: the 990 state constituencies are carved out of the 774 local
 * governments along ward lines, and this repository holds no ward boundaries,
 * so the closest extent it can honestly draw is the local government the
 * constituency sits inside.
 *
 * That makes an assembly territory a container rather than the seat itself,
 * and every screen that offers one says so. The alternative — inventing 990
 * ward-level boundaries to make the picker look complete — would put a line
 * on a map that nobody drew, which is the one thing this product does not do.
 */
export const LEVEL_FOR_RACE = {
  PRESIDENTIAL: "NATION",
  GOVERNORSHIP: "STATE",
  SENATE: "SENATORIAL",
  REPRESENTATIVES: "FEDERAL",
  ASSEMBLY: "LGA",
  LGA: "LGA",
};

/** The extent a contest is fought over, or null for a contest we do not know. */
export function levelForRace(race) {
  return LEVEL_FOR_RACE[String(race ?? "").toUpperCase()] ?? null;
}

/* ── HOW A TERRITORY IS WRITTEN DOWN ───────────────────────────────────────
   One short string, because it is stored in a column, sent through a form and
   read in an audit line, and a shape that survives all three without being
   re-encoded is a shape that cannot be re-encoded differently in two places.

     NATION
     STATE:24
     SENATORIAL:18/kaduna-central
     FEDERAL:24/surulere-i
     LGA:24/13

   The part after the colon is the key the tables are indexed by: a state's
   number, a district's own key, or a local government code. ──────────────── */
const PREFIX = new Set(LEVELS);

/** A stored territory, read back. Null for anything that is not one. */
export function parseTerritory(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;

  const [head, ...rest] = raw.split(":");
  const level = head.toUpperCase();
  if (!PREFIX.has(level)) return null;

  const key = rest.join(":").trim();
  if (level === "NATION") return { level, key: null };
  if (!key) return null;

  return { level, key };
}

/** And written back down. The exact inverse, so a round trip changes nothing. */
export function formatTerritory(territory) {
  if (!territory?.level) return null;
  if (territory.level === "NATION") return "NATION";
  if (!territory.key) return null;
  return `${territory.level}:${territory.key}`;
}

/* ------------------------------------------------------------- containment */

/**
 * The local government a unit code names, without parsing the rest of it.
 *
 * `parseUnitCode` would do this and do it better, but it lives in lib/units.js
 * and is strict about being handed a whole code. This is asked a great many
 * times per page — once per return, per incident, per shape on a map — and it
 * only ever needs the first two parts.
 */
export function lgaOf(unitCode) {
  const digits = String(unitCode ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
}

/**
 * Is this booth inside this territory?
 *
 * ── THE ANSWER FOR A MISSING TERRITORY IS YES ──────────────────────────────
 * An account with no territory is an account nobody has narrowed, which is
 * every account that existed before this feature and the administrator's
 * today. Refusing them everything would be a safer-sounding default that
 * silently emptied every existing room, so the unnarrowed case is the whole
 * federation and is written that way in one place rather than checked for at
 * every call site.
 */
export function coversUnit(territory, unitCode) {
  if (!territory || territory.level === "NATION") return true;
  const lga = lgaOf(unitCode);
  if (!lga) return false;
  return coversLga(territory, lga);
}

/** The same question about a local government code, "SS/LL". */
export function coversLga(territory, lgaCode) {
  if (!territory || territory.level === "NATION") return true;
  if (!Array.isArray(territory.lgas)) return false;
  return territory.lgas.includes(String(lgaCode));
}

/** And about a whole state, by its two-digit number. */
export function coversState(territory, stateNumber) {
  if (!territory || territory.level === "NATION") return true;
  const wanted = String(stateNumber ?? "").padStart(2, "0");
  return territory.stateNumber === wanted;
}

/* ------------------------------------------------------------------ SQL */

/**
 * The ground an account may read, as a piece of SQL.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A territory is a set of local governments (see lib/territory.js), and a
 *  polling unit code carries its own address — 24/13/04/006 is the sixth unit
 *  of the fourth ward of Lagos's thirteenth local government. So "every
 *  return inside this territory" needs no join and no registry lookup: it is
 *  the first five characters of the code, matched against the set.
 *
 *  ── WHY IT IS DONE HERE AND NOT AFTER THE ROWS ARRIVE ───────────────────
 *  Filtering in the page would be honest about what is shown and dishonest
 *  about what was read: the rows still leave the database, still cross the
 *  wire, and a `LIMIT 200` still counts two hundred returns from places the
 *  account may not see and then throws most of them away — so a room covering
 *  one district would show ten of its returns and call it the newest two
 *  hundred. The narrowing has to happen before the limit, which means it has
 *  to happen in the query.
 *
 *  ── AND WHY AN ABSENT TERRITORY IS EVERYWHERE ───────────────────────────
 *  No clause at all, deliberately. Null is the whole federation — it is what
 *  the administrator holds and what every account issued before territories
 *  existed holds — and that decision lives in exactly one place, here and in
 *  lib/territory.js, rather than being re-decided at every call site.
 *
 *  A territory with an empty list is a different thing and is treated as one:
 *  it matches nothing, because a territory that contains no local governments
 *  contains no booths.
 * ══════════════════════════════════════════════════════════════════════════
 */
export function within(territory, column = "unit_code") {
  if (!territory || territory.level === "NATION" || !Array.isArray(territory.lgas)) {
    return { sql: "", params: [] };
  }
  if (!territory.lgas.length) return { sql: " AND 1 = 0", params: [] };

  const marks = territory.lgas.map(() => "?").join(", ");
  return { sql: ` AND substr(${column}, 1, 5) IN (${marks})`, params: [...territory.lgas] };
}

/**
 * The same narrowing, for a table keyed by places rather than by booths.
 *
 * ── WHY IT CANNOT REUSE `within` ───────────────────────────────────────────
 * A declared figure is announced for a place at some level: a state, a local
 * government, a ward, a booth. Its key is that place's code, so the first five
 * characters are the local government for everything below a state — and are
 * the state's own two digits for a state row, which will never match a local
 * government code and is exactly right, because a state's declared total is
 * not a figure about one senatorial district inside it.
 *
 * The one exception is a room that holds the whole state: for them the state
 * row is theirs, and it is added by name rather than by prefix. Comparing our
 * district count against a whole state's declaration would be the arithmetic
 * this product exists to refuse.
 */
export function withinDeclared(territory) {
  if (!territory || territory.level === "NATION" || !Array.isArray(territory.lgas)) {
    return { sql: "", params: [] };
  }
  if (!territory.lgas.length) return { sql: " AND 1 = 0", params: [] };

  const marks = territory.lgas.map(() => "?").join(", ");

  if (territory.level === "STATE") {
    return {
      sql: ` AND (substr(place_key, 1, 5) IN (${marks}) OR (level = 'STATE' AND place_key = ?))`,
      params: [...territory.lgas, territory.stateNumber],
    };
  }

  return { sql: ` AND substr(place_key, 1, 5) IN (${marks})`, params: [...territory.lgas] };
}

/**
 * How a territory is said in a sentence, with the state after it where the
 * name alone would not place it.
 *
 * "Kaduna Central" says where it is. "Surulere I" and "Ikeja" do not, to
 * anybody outside Lagos, and a room's title bar is exactly where somebody
 * finds out they have been given the wrong constituency.
 */
export function describeTerritory(territory) {
  if (!territory || territory.level === "NATION") return "Nigeria";
  if (territory.level === "STATE") return territory.name;
  if (!territory.stateName || territory.name.includes(territory.stateName)) return territory.name;
  return `${territory.name}, ${territory.stateName}`;
}
