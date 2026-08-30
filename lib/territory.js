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

/**
 * The `LIKE` patterns that select this territory's returns.
 *
 * ── WHY PATTERNS AND NOT A JOIN ────────────────────────────────────────────
 * A unit code carries its own address, so "every booth in local government
 * 24/13" is `unit_code LIKE '24/13/%'` and needs no table to look it up in.
 * That is the same fact lib/units.js is built on, used in the one place where
 * it saves a join against 176,000 rows that do not exist.
 *
 * Null for the federation, which is not a pattern — it is the absence of one,
 * and a caller that treated `['%']` as equivalent would be one index scan away
 * from being right by accident.
 */
export function unitPatterns(territory) {
  if (!territory || territory.level === "NATION") return null;
  return (territory.lgas ?? []).map((code) => `${code}/%`);
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
