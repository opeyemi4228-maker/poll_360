import { LGA_NAMES, STATE_LIST, ZONE_NAMES } from "./ground.js";

/**
 * Reading a question in plain English, without a model.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS EXISTS WHEN THE MODEL DOES THE SAME JOB
 *
 *  Because the model is not always there. A deployment without a key, a
 *  provider having a bad hour, a room on election night asking faster than a
 *  rate limit allows — Ask Poll360 has to answer through all of them, and the
 *  questions a campaign asks most are a small number of shapes asked a great
 *  many ways: where can he get 25%, where did he win, where do we go next,
 *  what changed since 2019, what if he gains five points.
 *
 *  This turns those shapes into a `Plan` for lib/ask/engine.js. When the model
 *  is configured it understands the long tail; when it is not, this is what
 *  answers, and it is also the model's second opinion — see lib/ask/answer.js.
 * ══════════════════════════════════════════════════════════════════════════
 */

const ATIKU = { kind: "candidate", name: "Atiku Abubakar" };

const CANDIDATE_WORDS = [
  [/\batiku\b|\babubakar\b|\bwazir(i)?\b/, ATIKU],
  [/\btinubu\b|\bjagaban\b/, { kind: "candidate", name: "Bola Ahmed Tinubu" }],
  [/\bpeter obi\b|\bobi\b/, { kind: "candidate", name: "Peter Obi" }],
  [/\bkwankwaso\b/, { kind: "candidate", name: "Rabiu Kwankwaso" }],
  [/\bbuhari\b/, { kind: "candidate", name: "Muhammadu Buhari" }],
  [/\bjonathan\b/, { kind: "candidate", name: "Goodluck Jonathan" }],
  [/\bobasanjo\b/, { kind: "candidate", name: "Olusegun Obasanjo" }],
];

const PARTY_WORDS = [
  [/\bapc\b|\bprogressives? congress\b/, "APC"],
  [/\bpdp\b|\bpeoples? democratic\b/, "PDP"],
  [/\blp\b|\blabou?r( party)?\b/, "LP"],
  [/\bnnpp\b/, "NNPP"],
  [/\bapga\b/, "APGA"],
  [/\badc\b/, "ADC"],
  [/\banpp\b/, "ANPP"],
];

const STATE_ALIASES = [
  ["fct", "FCT"],
  ["abuja", "FCT"],
  ["federal capital territory", "FCT"],
  ["cross rivers", "CRO"],
  ["nassarawa", "NAS"],
  ["akwa-ibom", "AKW"],
];

const LEVEL_PATTERNS = [
  ["zone", /\b(geo-?political )?zones\b|\bregions\b|\b(by|each|every|which|what) (geo-?political )?zone\b/],
  ["state", /\bstates\b|\b(by|each|every|which|what|list of) states?\b|\bstate by state\b|\bstate level\b/],
  ["district", /\bsenatorial districts?\b|\bsenate districts?\b|\bdistricts\b/],
  ["constituency", /\bfederal constituenc(y|ies)\b|\bconstituencies\b/],
  ["lga", /\blgas\b|\blocal governments\b|\blocal government areas\b|\blgs\b|\b(by|each|every|which|what|list of) (lga|local government)\b/],
  ["ward", /\bwards\b|\b(by|each|every|which|what|list of) ward\b/],
  ["unit", /\bpolling units\b|\bpus\b|\bbooths\b|\bpolling stations\b|\b(by|each|every|which|what|list of) (polling unit|pu|booth)\b/],
];

/* The same words, singular. They count as a level only inside a list of
   levels ("states, LGA, ward and polling unit") — "Kano state" and "Ikeja LGA"
   are names, not levels. */
const SINGULAR = [
  ["state", /\bstate\b/],
  ["lga", /\blga\b|\blocal government\b/],
  ["ward", /\bward\b/],
  ["unit", /\bpolling unit\b|\bpu\b|\bbooth\b/],
];

const ORDER = ["zone", "state", "district", "constituency", "lga", "ward", "unit"];

export function normalise(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9%+.\-/' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const wordRe = (name) => new RegExp(`(^|[^a-z0-9])${escape(name)}($|[^a-z0-9])`);

/* ── PLACES, AS PEOPLE SPELL THEM ─────────────────────────────────────────
   INEC's spelling is one of several in daily use: "Nassarawa" and
   "Nasarawa", "Danbatta" and "Danbata", "Dawakin Kudu" and "Dawaki Kudu",
   "Garun Mallam" and "Garun Malam". Names are compared squashed — letters
   only, doubled letters single — and the handful of variants that differ by
   more than that are listed. */
const squash = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1");

const VARIANTS = {
  dawakinkudu: "dawakikudu",
  dawakintofa: "dawakitofa",
  kanomunicipality: "kanomunicipal",
  municipal: "kanomunicipal",
  abujamunicipal: "municipalareacouncil",
  amac: "municipalareacouncil",
  portharcourtcity: "portharcourt",
  ph: "portharcourt",
};

const LGA_WORDS = /^(lga|lgas|l\.g\.a|local government|local govt|lg)\b/;

const STATE_KEYS = new Map();
for (const state of STATE_LIST) STATE_KEYS.set(squash(state.name), state.code);
for (const [alias, code] of STATE_ALIASES) STATE_KEYS.set(squash(alias), code);
STATE_KEYS.set(squash("abuja fct"), "FCT");

const LGA_KEYS = new Map();
for (const lga of LGA_NAMES) {
  const key = squash(lga.name.replace(/\s*\/\s*/g, " "));
  if (!LGA_KEYS.has(key)) LGA_KEYS.set(key, []);
  LGA_KEYS.get(key).push(lga);
}

/**
 * Every state and local government named, left to right, longest name first.
 *
 * A name that is both — Nasarawa, Bauchi, Gombe, Ekiti — is the state unless
 * the question says "LGA" after it. A local government name shared by two
 * states is the one in the state the question names.
 */
export function placesIn(q) {
  const tokens = q.split(" ");
  const states = [];
  const lgas = [];
  let i = 0;
  while (i < tokens.length) {
    let taken = 0;
    for (let span = Math.min(5, tokens.length - i); span >= 1; span -= 1) {
      const words = tokens.slice(i, i + span).join(" ");
      let key = squash(words);
      if (!key) continue;
      key = VARIANTS[key] ?? key;
      const after = tokens.slice(i + span).join(" ");
      const saysLga = LGA_WORDS.test(after);
      const state = STATE_KEYS.get(key);
      const lga = LGA_KEYS.get(key);
      /* Short names ("Obi", "Ido", "Ika") are ordinary words too often to be
         read as a place unless the question says it is one. */
      const lgaOk = lga && (key.length >= 4 || saysLga);
      if (state && !(saysLga && lgaOk)) {
        states.push({ code: state, at: i, name: words });
        taken = span;
        break;
      }
      if (lgaOk) {
        lgas.push({ at: i, options: lga, name: words });
        taken = span;
        break;
      }
    }
    i += taken || 1;
  }

  const named = new Set(states.map((state) => state.code));
  const chosen = [];
  for (const hit of lgas) {
    const inNamed = hit.options.filter((lga) => named.has(lga.stateCode));
    for (const lga of inNamed.length ? inNamed : hit.options) chosen.push({ ...lga, at: hit.at });
  }
  /* A state named only as the home of a named local government ("Nasarawa
     LGA in Kano") is still the state the question is in. */
  return { states: dedupe(states, (entry) => entry.code), lgas: dedupe(chosen, (entry) => entry.key) };
}

const dedupe = (list, key) => list.filter((entry, index) => list.findIndex((other) => key(other) === key(entry)) === index);

export function statesIn(q) {
  return placesIn(q).states;
}

export function lgasIn(q) {
  return placesIn(q).lgas;
}

function whoIn(q) {
  const hits = [];
  for (const [pattern, who] of CANDIDATE_WORDS) {
    const at = q.search(pattern);
    if (at >= 0) hits.push({ at, who });
  }
  for (const [pattern, id] of PARTY_WORDS) {
    const at = q.search(pattern);
    if (at >= 0) hits.push({ at, who: { kind: "party", id } });
  }
  return hits.sort((a, b) => a.at - b.at);
}

function levelsIn(q, placeNames) {
  const levels = new Set();
  for (const [level, pattern] of LEVEL_PATTERNS) if (pattern.test(q)) levels.add(level);

  /* Singular level words inside a list: "states ..., lga, ward and polling
     unit". A singular word straight after a place's own name is part of
     the name. */
  if (levels.size) {
    for (const [level, pattern] of SINGULAR) {
      const match = q.match(new RegExp(`(^|[, ]|and |or )(${pattern.source})(?=$|[ ,.?])`, "g"));
      if (!match) continue;
      const trailing = placeNames.some((name) => new RegExp(`${escape(name)} ${pattern.source}`).test(q));
      if (!trailing) levels.add(level);
    }
  }
  return ORDER.filter((level) => levels.has(level));
}

function yearsIn(q) {
  return [...new Set((q.match(/\b(1999|2003|2007|2011|2015|2019|2023)\b/g) ?? []).map(Number))];
}

/**
 * The filters a question states outright: "turnout below 30%", "more than
 * 1,000 registered voters". Taken out of the text afterwards so the 30% is not
 * mistaken for the line the question draws.
 */
function filtersIn(q) {
  const filters = [];
  let rest = q;

  const turnout = /\bturnout (?:of |was |is )?(above|over|below|under|less than|more than|greater than|at least|at most|>=|<=|>|<)\s*(\d+(?:\.\d+)?)\s*%?/;
  const t = rest.match(turnout);
  if (t) {
    filters.push({ field: "turnout", op: opOf(t[1]), value: Number(t[2]) });
    rest = rest.replace(t[0], " ");
  }

  const reg = /\b(more than|over|above|at least|fewer than|less than|under|below)\s*([\d,]+)\s*(registered )?voters\b/;
  const r = rest.match(reg);
  if (r) {
    filters.push({ field: "registered", op: opOf(r[1]), value: Number(r[2].replace(/,/g, "")) });
    rest = rest.replace(r[0], " ");
  }
  const reg2 = /\bregistered voters? (above|over|more than|at least|below|under|less than)\s*([\d,]+)/;
  const r2 = rest.match(reg2);
  if (r2) {
    filters.push({ field: "registered", op: opOf(r2[1]), value: Number(r2[2].replace(/,/g, "")) });
    rest = rest.replace(r2[0], " ");
  }
  return { filters, rest };
}

function opOf(word) {
  if (/below|under|less|fewer|at most|<=|</.test(word)) return /at most|<=/.test(word) ? "<=" : "<";
  return /at least|>=/.test(word) ? ">=" : ">";
}

function thresholdIn(q) {
  const pct = q.match(/(\d+(?:\.\d+)?)\s*(%|percent|per cent)/);
  if (pct) return Number(pct[1]);
  if (/\b(a |one )?quarter\b|\bone-quarter\b|\b1\/4\b/.test(q)) return 25;
  if (/\bsection 134\b|\btwo[- ]thirds\b|\b2\/3\b|\bspread (test|rule|requirement)\b|\b24 states\b|\bconstitutional (test|requirement|threshold)\b/.test(q)) return 25;
  if (/\b(majority|half the vote|more than half)\b/.test(q)) return 50;
  return null;
}

/** "if Atiku gains 5 points and Tinubu loses 3" -> { PDP: 5, APC: -3 }. */
function scenarioIn(q, mainWho) {
  if (!/\b(if|suppose|supposing|imagine|scenario|assume|assuming|projection|project)\b/.test(q)) return null;
  const swing = {};
  let turnout = null;
  const clauses = q.split(/\b(?:and|while|but|,)\b/);
  for (const clause of clauses) {
    const t = clause.match(/turnout (rises|increases|goes up|grows|falls|drops|goes down|decreases|up|down) (?:by )?(\d+(?:\.\d+)?)\s*(%|percent|points)?/);
    if (t) {
      const up = /rise|increase|up|grow/.test(t[1]);
      turnout = Math.max(0.3, Math.min(2, 1 + ((up ? 1 : -1) * Number(t[2])) / 100));
      continue;
    }
    const m = clause.match(/\b(gains?|gained|wins? over|adds?|rises?|increases?|improves?|picks? up|up by|loses?|lost|drops?|falls?|decreases?|down by|declines?)\b[^\d]*(\d+(?:\.\d+)?)\s*(points?|pts|percentage points?|%)?/)
      ?? clause.match(/(\+|-|−)\s*(\d+(?:\.\d+)?)\s*(points?|pts|%)/);
    if (!m) continue;
    const down = /lose|lost|drop|fall|decrease|down|decline|-|−/.test(m[1]);
    const who = whoIn(clause)[0]?.who ?? mainWho;
    const id = partyOf2023(who);
    if (!id) continue;
    swing[id] = (down ? -1 : 1) * Number(m[2]);
  }
  if (!Object.keys(swing).length && turnout === null) return null;
  return { swing, turnout };
}

function partyOf2023(who) {
  if (!who) return null;
  if (who.kind === "party") return ["APC", "PDP", "LP", "NNPP"].includes(who.id) ? who.id : null;
  return {
    "Atiku Abubakar": "PDP",
    "Bola Ahmed Tinubu": "APC",
    "Peter Obi": "LP",
    "Rabiu Kwankwaso": "NNPP",
  }[who.name] ?? null;
}

function unitCodeIn(q) {
  const m = q.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{1,2})[-/](\d{1,3})\b/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}-${m[4].padStart(3, "0")}`;
}

const FOLLOW_UP = /^(and|now|what about|how about|same|also|then|only|just|next|ok|okay|and now|for|in|at|show me the|break (it|that) down|drill|go deeper|by)\b/;

/**
 * A question, as a plan the engine can run.
 *
 * `previous` is the last plan in the conversation. A question that reads as a
 * follow-up ("now the wards", "what about 30%?", "for Tinubu") starts from it
 * and changes only what it names.
 *
 * @returns {{ plan: object, confident: boolean }}
 */
export function parse(question, previous = null) {
  const raw = normalise(question);
  const { filters, rest: q } = filtersIn(raw);

  const whoHits = whoIn(q);
  const { states, lgas } = placesIn(q);
  const zones = ZONE_NAMES.filter((zone) => wordRe(zone.toLowerCase()).test(q) || wordRe(zone.toLowerCase().replace(" ", "-")).test(q));
  const unitCode = unitCodeIn(q);
  const placeNames = [...states.map((state) => state.name), ...lgas.map((lga) => lga.name.toLowerCase())];
  let levels = levelsIn(q, placeNames);
  const years = yearsIn(q);
  const threshold = thresholdIn(q);
  const limitMatch = q.match(/\b(?:top|first|best|biggest|largest|worst|bottom)\s+(\d{1,5})\b|\b(\d{1,5})\s+(?:biggest|largest|best|top|most|worst|weakest|strongest)\b/);
  const limit = limitMatch ? Number(limitMatch[1] ?? limitMatch[2]) : null;

  const followUp = Boolean(previous) && (FOLLOW_UP.test(q) || (!whoHits.length && !threshold && q.split(" ").length <= 7));
  const base = followUp ? structuredClone(previous) : null;

  /* ── PARTY STRENGTH ────────────────────────────────────────────────────
     "How strong is the APC in the North West", "ADC members in Kano by
     ward", "our presence in Kaduna". Asked of a party, not a run — and
     where no party is named, of the party whose register Poll360 holds. */
  const strengthAsked =
    /\b(party strength|strength of|how strong|how weak|strongest (party|region|zone|state)|weakest (region|zone|state)|dominan\w*|presence|members?|membership|register of members|party register|support base|our party|grassroots|party structures?)\b/.test(q) &&
    !/\bregistered voters\b/.test(q.replace(/\bmembers?\b/g, ""));
  /* Membership is the party's register. Naming Atiku in the same breath
     ("compare our membership with Atiku's vote") asks for his vote beside it,
     not for his party instead of it. */
  const aboutRegister = /\b(members?|membership|register of members|party register|registrations?|our party|grassroots|structures?)\b/.test(q);
  const namedParty = whoHits.find((hit) => hit.who.kind === "party")?.who ?? null;
  const strengthWho = namedParty ?? (aboutRegister ? { kind: "party", id: "ADC" } : whoHits[0]?.who ?? null);
  const againstVote =
    strengthAsked &&
    (/\b(compare|compared|comparing|comparison|against|versus|vs|alongside|beside|side by side|relative to|with)\b[^?]*\b(votes?|results?|performance|atiku|pdp)\b/.test(q) ||
      (aboutRegister && whoHits.some((hit) => hit.who.kind === "candidate")));
  const weakFirst = /\b(weak|weakest|weakness(es)?|thin|thinnest|low|lowest|least|fewest|few|poor|poorly|lacking|lacks|absent|no members|gaps?|missing|behind)\b/.test(q);

  const who = strengthAsked ? strengthWho ?? { kind: "party", id: "ADC" } : whoHits[0]?.who ?? base?.who ?? ATIKU;
  const scenario = strengthAsked ? null : scenarioIn(q, who);

  /* ── WHAT IS BEING ASKED ────────────────────────────────────────────────
     Ordered from the most specific shape to the least, so "what if he gains
     five points, which states clear 25%" is a scenario and not a reach. */
  let intent = null;
  if (strengthAsked) intent = "strength";
  else if (scenario) intent = "scenario";
  else if (/\b(target|focus|prioriti[sz]e|priorit(y|ies)|where should|deploy|mobili[sz]e|canvass|invest|resources?|best places|next votes|opportunit(y|ies)|where (can|could) (we|he|she|they) gain|where to (go|campaign|work))\b/.test(q)) intent = "target";
  else if (threshold !== null) intent = "reach";
  else if (/\b(swing|swung|changed?|changes|since (2019|2015)|compared? (to|with)|versus|vs|gained|gain(ed)? ground|lost ground|improved|declined|grew|dropped|fell|shift(ed)?|trend)\b/.test(q) || years.length >= 2) intent = "swing";
  else if (/\b(won|carried|win|wins|winning|lost|lose|stronghold|strongholds|primary|secondary|tertiary|biggest|largest|most voters|most registered|highest|lowest|turnout|registered)\b/.test(q) || filters.length) intent = "list";

  const named = unitCode || states.length + lgas.length === 1;
  if (!intent && named && !levels.length) intent = "profile";
  if (!intent && /\b(tell me about|profile|how did|how (is|was)|results? (in|for)|record (in|for)|history (of|in))\b/.test(q) && (states.length || lgas.length || unitCode)) intent = "profile";
  if (!intent) intent = base?.intent ?? "overview";

  /* ── WHERE ──────────────────────────────────────────────────────────── */
  let within = { zones, states: states.map((state) => state.code), lgas: lgas.map((lga) => lga.key) };
  if (lgas.length && !states.length) within.states = [...new Set(lgas.map((lga) => lga.stateCode))];
  const namedPlaces = zones.length || states.length || lgas.length;
  if (!namedPlaces && base) within = base.within;

  /* ── AT WHAT DEPTH ─────────────────────────────────────────────────────
     Unsaid, a question is answered one level below the ground it names: the
     country by state, a state by local government, a local government by
     ward. That is the level a person asking about a place means to see. */
  /* "Strongest region", "which zone" — a question about zones, even singular. */
  if (!levels.length && /\b(strongest|weakest|best|worst|which|what) (region|zone|geo-?political zone)\b/.test(q) && !zones.length) levels = ["zone"];
  if (!levels.length) {
    if (base && !namedPlaces) levels = base.levels;
    else if (lgas.length) levels = ["ward"];
    else if (states.length) levels = ["lga"];
    else if (zones.length) levels = ["state"];
    else levels = intent === "target" ? ["lga"] : ["state"];
  }

  /* ── WHICH RUN ─────────────────────────────────────────────────────── */
  let year = years.length ? Math.max(...years) : base && !years.length ? base.year : null;
  let compareYear = years.length >= 2 ? Math.min(...years) : base && !years.length ? base.compareYear : null;
  if (years.length === 1) compareYear = null;
  /* "since 2019" names the year to measure from, not the year asked about. */
  const since = q.match(/\b(?:since|from|after) (1999|2003|2015|2019)\b/);
  if (since && years.length === 1) {
    compareYear = Number(since[1]);
    year = null;
  }

  /* ── HOW MUCH OF THE ANSWER ────────────────────────────────────────── */
  let show = base?.show ?? null;
  if (intent === "reach") {
    if (/\b(below|under|less than|fail(ed|s)?|short|didn'?t|did not|couldn'?t|could not|not get|missed)\b/.test(q)) show = "short";
    else if (/\b(already|got|scored|achieved|cleared|secured|did get|has|had)\b/.test(q) && !/\bcan\b|\bcould\b/.test(q)) show = "cleared";
    else if (!followUp) show = null;
  }

  const listFilters = [...filters];
  let sort = null;
  if (intent === "list") {
    if (/\b(lost|lose|didn'?t win|did not win)\b/.test(q)) listFilters.push({ field: "won", op: "=", value: false });
    else if (/\b(won|carried|win|wins|winning)\b/.test(q)) listFilters.push({ field: "won", op: "=", value: true });
    const tier = q.match(/\b(primary|secondary|tertiary)\b/);
    if (tier) listFilters.push({ field: "tier", op: "=", value: tier[1].toUpperCase() });
    else if (/\bstrongholds?\b/.test(q)) listFilters.push({ field: "tier", op: "=", value: "any" });
    if (/\b(biggest|largest|most voters|most registered|most populous)\b/.test(q)) sort = { field: "registered", dir: "desc" };
    else if (/\b(lowest|worst) turnout\b/.test(q)) sort = { field: "turnout", dir: "asc" };
    else if (/\b(highest|best) turnout\b/.test(q)) sort = { field: "turnout", dir: "desc" };
    else if (/\b(weakest|worst|lowest)\b/.test(q)) sort = { field: "share", dir: "asc" };
  }
  if (intent === "swing" && /\b(lost ground|declined|dropped|fell|worst|weakest|fall)\b/.test(q)) sort = { field: "swing", dir: "asc" };

  let place = null;
  if (intent === "profile") {
    if (unitCode) place = { level: "unit", key: unitCode };
    else if (lgas.length) place = { level: "lga", key: lgas[0].key };
    else if (states.length) place = { level: "state", key: states[0].code };
    else if (base?.place) place = base.place;
    else intent = "overview";
  }

  const factors = intent === "target" ? factorsIn(q) : null;

  const plan = {
    intent: intent === "overview" ? "list" : intent,
    who,
    levels: levels.slice(0, 4),
    year,
    compareYear,
    threshold: threshold ?? (followUp && intent === base?.intent ? base.threshold : null),
    band: bandIn(q) ?? (followUp ? base?.band ?? null : null),
    show,
    within,
    filters: listFilters.length ? listFilters : followUp && !namedPlaces ? base?.filters ?? [] : [],
    sort: intent === "strength" ? (weakFirst ? { field: "per_thousand", dir: "asc" } : null) : sort ?? (followUp ? base?.sort ?? null : null),
    limit: limit ?? (intent === "target" ? 50 : null),
    against: intent === "strength" && againstVote ? "vote" : null,
    factors,
    place,
    scenario,
  };

  const confident =
    intent !== "overview" && (whoHits.length > 0 || followUp || threshold !== null || namedPlaces > 0 || Boolean(scenario));

  return { plan, confident, followUp };
}

function bandIn(q) {
  const m = q.match(/\bwithin (\d+(?:\.\d+)?)\s*(points?|pts|%)/);
  return m ? Number(m[1]) : null;
}

function factorsIn(q) {
  const out = [];
  if (/\b(voters|register|registered|population|populous|biggest)\b/.test(q)) out.push("voters");
  if (/\b(cluster|clusters|dense|density|packed)\b/.test(q)) out.push("clusters");
  if (/\bturnout\b|\bstayed home\b|\bdidn'?t vote\b|\bapathy\b/.test(q)) out.push("turnout");
  if (/\b(close|marginal|narrow|tight|battleground|swing)\b/.test(q)) out.push("close");
  return out.length ? out : null;
}
