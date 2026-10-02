import { LGA_NAMES, STATE_LIST, ZONE_NAMES } from "./ground.js";
import { findAspirant } from "./research.js";

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
    /* "66,000" is one number, not "66" and "000". */
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
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

/* Singular only: "Gombe LGA" is the local government, "Gombe LGAs" are the
   state's local governments. */
const LGA_WORDS = /^(lga|l\.g\.a|local government(?!s)|local govt|lg)\b/;

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

  /* "3 million", "500k", "1.2m" — how people say a register. */
  const amount = (digits, unit) => Number(String(digits).replace(/,/g, "")) * ({ million: 1e6, m: 1e6, k: 1e3, thousand: 1e3 }[String(unit ?? "").toLowerCase()] ?? 1);
  const reg = /\b(more than|over|above|at least|fewer than|less than|under|below)\s*([\d,.]+)\s*(million|m|k|thousand)?\s*(registered )?voters\b/;
  const r = rest.match(reg);
  if (r) {
    filters.push({ field: "registered", op: opOf(r[1]), value: amount(r[2], r[3]) });
    rest = rest.replace(r[0], " ");
  }
  const reg2 = /\bregistered voters? (above|over|more than|at least|below|under|less than)\s*([\d,.]+)\s*(million|m|k|thousand)?/;
  const r2 = rest.match(reg2);
  if (r2) {
    filters.push({ field: "registered", op: opOf(r2[1]), value: amount(r2[2], r2[3]) });
    rest = rest.replace(r2[0], " ");
  }
  return { filters, rest };
}

function opOf(word) {
  if (/below|under|less|fewer|at most|<=|</.test(word)) return /at most|<=/.test(word) ? "<=" : "<";
  return /at least|>=/.test(word) ? ">=" : ">";
}

function thresholdIn(q) {
  /* A percentage that moves turnout, or measures it, is not a line of vote share. */
  q = q.replace(/\bturnout\s+(rises|increases|goes up|grows|falls|drops|goes down|decreases|up|down|of|at|is|was|above|below|over|under)?\s*(by\s*)?\d+(\.\d+)?\s*(%|percent|per cent)/g, " ");
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
    const more = clause.match(/\b(?:gets?|got|takes?|wins?|earns?|secures?|has|had|with|an?)\s+(?:an? )?(?:extra |additional )?(\d+(?:\.\d+)?)\s*(?:%|percent|points?|pts|percentage points?)\s*(more|extra|additional|higher|less|fewer|lower)?\b/);
    const m =
      clause.match(/\b(gains?|gained|wins? over|adds?|rises?|increases?|improves?|picks? up|up by|loses?|lost|drops?|falls?|decreases?|down by|declines?)\b[^\d]*(\d+(?:\.\d+)?)\s*(points?|pts|percentage points?|%)?/) ??
      clause.match(/(\+|-|−)\s*(\d+(?:\.\d+)?)\s*(points?|pts|%)/) ??
      (more && (more[2] || /\b(extra|additional)\b/.test(more[0])) ? [more[0], /less|fewer|lower/.test(more[2] ?? "") ? "loses" : "gains", more[1]] : null);
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

/**
 * A region named in the question: "the South", "northern states", "up north",
 * "the core North", "the Middle Belt".
 *
 * The words North and South are everywhere in Nigerian place names — Jos
 * North, Yola South, North West, South South — so the zone names and every
 * place name already found are taken out of the text before it is read for a
 * region. What is left of "north" or "south" is the region.
 */
function regionIn(q, { states, lgas, zones }) {
  let rest = ` ${q} `;
  for (const zone of zones) rest = rest.replace(new RegExp(zone.toLowerCase().replace(" ", "[ -]"), "g"), " ");
  rest = rest.replace(/\bnorth[ -]?(west|east|central)\b|\bsouth[ -]?(west|east|south)\b|\bnorth-?western|\bnorth-?eastern|\bsouth-?western|\bsouth-?eastern/g, " ");
  for (const lga of lgas) rest = rest.replace(new RegExp(lga.name.toLowerCase().replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"), "g"), " ");
  for (const state of states) rest = rest.replace(new RegExp(String(state.name).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"), "g"), " ");
  if (/\bmiddle[ -]?belt\b/.test(rest)) return "Middle Belt";
  if (/\bcore[ -]?north(ern)?\b|\bfar north\b/.test(rest)) return "Core North";
  if (/\bnorth(ern)?\b|\bup north\b|\barewa\b/.test(rest)) return "North";
  if (/\bsouth(ern)?\b|\bdown south\b/.test(rest)) return "South";
  return null;
}

const FOLLOW_UP = /^(and|now|what about|how about|same|also|then|only|just|next|ok|okay|and now|for|in|at|show me the|break (it|that) down|drill|go deeper|by|add|plus|include|bring in|with|without)\b/;

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

  let whoHits = whoIn(q);

  /* ── RESEARCH ON AN ASPIRANT ──────────────────────────────────────────
     "Research Peter Obi", "Kwankwaso's record", "profile of Buhari", or a
     candidate's name on its own. The name is looked for among everybody who
     has stood, by full name, surname or a near spelling. */
  const researchWords =
    /\b(research|profile|dossier|track record|record|history of|background|analy[sz]e|analysis of|study|trend|trends|over the years|through the years|every election|all elections|since 1999|electoral history)\b|'s (record|history|profile|runs?|performance)\b/;
  const researchAsked = researchWords.test(q);
  let aspirantTyped = null;
  let aspirantFound = null;
  if (researchAsked || (!whoHits.length && q.split(" ").length <= 4)) {
    const cleaned = q
      .replace(researchWords, " ")
      .replace(/\b(research|on|of|into|for|the|candidate|aspirant|presidential|president|give|me|a|an|full|about|do|please|his|her|record|runs?|history|performance|profile|'s)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned) {
      aspirantTyped = cleaned;
      aspirantFound = findAspirant(cleaned) ?? cleaned.split(" ").map(findAspirant).find(Boolean) ?? null;
    }
  }
  if (aspirantFound && !whoHits.some((hit) => hit.who.kind === "candidate" && hit.who.name === aspirantFound)) {
    whoHits = [{ at: 0, who: { kind: "candidate", name: aspirantFound } }, ...whoHits];
  }
  const { states, lgas } = placesIn(q);
  const zones = ZONE_NAMES.filter((zone) => wordRe(zone.toLowerCase()).test(q) || wordRe(zone.toLowerCase().replace(" ", "-")).test(q));
  const region = regionIn(q, { states, lgas, zones });
  const unitCode = unitCodeIn(q);
  const placeNames = [...states.map((state) => state.name), ...lgas.map((lga) => lga.name.toLowerCase())];
  let levels = levelsIn(q, placeNames);
  const years = yearsIn(q);
  const threshold = thresholdIn(q);
  const limitMatch = q.match(/\b(?:top|first|best|biggest|largest|worst|bottom)\s+(\d{1,3}(?:,\d{3})+|\d{1,6})\b|\b(\d{1,3}(?:,\d{3})+|\d{1,6})\s+(?:biggest|largest|best|top|most|worst|weakest|strongest)\b/);
  const limitRaw = limitMatch ? Number(String(limitMatch[1] ?? limitMatch[2]).replace(/,/g, "")) : null;
  const limit = limitRaw && limitRaw >= 1 ? Math.min(20000, limitRaw) : null;

  const followUp = Boolean(previous) && (FOLLOW_UP.test(q) || (!whoHits.length && !threshold && q.split(" ").length <= 7));
  const base = followUp ? structuredClone(previous) : null;

  /* ── PARTY STRENGTH ────────────────────────────────────────────────────
     "How strong is the APC in the North West", "ADC members in Kano by
     ward", "our presence in Kaduna". Asked of a party, not a run — and
     where no party is named, of the party whose register Poll360 holds. */
  const registerParty = whoIn(q).some((hit) => hit.who.kind === "party" && hit.who.id === "ADC") || /\bour party\b/.test(q);
  const strengthAsked =
    (registerParty && /\b(strong|strongest|stronger|weak|weakest|weaker|strength|presence|base|grip)\b/.test(q)) ||
    /\b(recruit|recruitment|party strength|strength of|how strong|how weak|strongest (party|region|zone|state)|weakest (region|zone|state)|dominan\w*|presence|members?|membership|register of members|party register|support base|our party|grassroots|party structures?)\b/.test(q) &&
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
  const weakFirst = /\b(weak|weakest|weakness(es)?|thin|thinnest|low|lowest|least|fewest|few|poor|poorly|lacking|lacks|absent|no members|gaps?|missing|behind|recruit|recruitment|grow|expand|mobili[sz]e|register more|sign up)\b/.test(q);

  const who = strengthAsked ? strengthWho ?? { kind: "party", id: "ADC" } : whoHits[0]?.who ?? base?.who ?? ATIKU;
  const scenario = strengthAsked ? null : scenarioIn(q, who);

  /* ── WHAT IS BEING ASKED ────────────────────────────────────────────────
     Ordered from the most specific shape to the least, so "what if he gains
     five points, which states clear 25%" is a scenario and not a reach. */
  /* ── WHAT THE QUESTION LEADS WITH ───────────────────────────────────── */
  const signals = /\b(atiku|abubakar|tinubu|obi|kwankwaso|buhari|jonathan|obasanjo|apc|pdp|lp|labour|nnpp|adc|apga|state|states|lga|lgas|local government|ward|wards|polling|booth|vote|votes|voters|voted|election|elections|turnout|win|won|wins|lost|lose|stronghold|strongholds|register|registered|member|members|membership|party|zone|zones|region|percent|section 134|swing|campaign|target|focus|result|results|share|strength|agents|deploy|constituenc|district|senat|president|presidential|governor|governors|governorship|margin|close|narrow|happened|coalition|alliance|section 134|1999|2003|2007|2011|2015|2019|2023|2027)\b|%/.test(q);
  const placeNamed = states.length + lgas.length + zones.length > 0 || Boolean(unitCode) || Boolean(region);
  const offTopic = !signals && !placeNamed && !followUp;
  const nationalAsked =
    !placeNamed &&
    /\b(who (won|is|was) (the )?(president|presidential|election)|who won (the )?(\d{4} )?(presidential )?election|who won in (1999|2003|2007|2011|2015|2019|2023)|(national|overall) (result|results|outcome)|(1999|2003|2007|2011|2015|2019|2023) (presidential )?(election )?(result|results|winner))\b/.test(q);
  const versusAsked =
    whoHits.length >= 2 && whoHits[0].who !== whoHits[1].who && /\b(vs\.?|versus|against|compared? (to|with)|compare|head to head|head-to-head|beat|beats|outperform(ed|s)?|better than|ahead of|margin between|difference between|gap between)\b/.test(q) && !strengthAsked;
  /* "Chances of Atiku winning 2027", "his odds", "prospects", "can he win
     2027", "what does he need to win": the whole path, not a probability. */
  const outlookAsked =
    /\b(chances?|odds|prospects?|likelihood|likely to win|outlook|forecast|predict(ion)?|path to (victory|win|the presidency)|roadmap to|winning strategy|how to win|win(ning)? (the )?(2027|next)|2027 (election|presidential|race))\b/.test(q) ||
    (!/\bwhere\b/.test(q) && /\b(can .{1,30} win|need(s)? to win|what (will|would|does) it take|how (can|will|could|does) .{1,30} win)\b/.test(q));
  const pathAsked = !placeNamed && !/\bwhere\b/.test(q) && /\b(can .{1,30} win|need(s)? to win|path to (victory|win|the presidency)|what (will|would|does) it take|how (can|will|could|does) .{1,30} win|win (in )?2027|winning formula)\b/.test(q);
  const winnableAsked = /\bwhere (can|could|will) .{1,30} win\b|\bwinnable\b/.test(q);
  const closeAsked = /\b(close|closest|narrow|narrowly|tight|marginal|battleground|swing states?|barely|slim)\b/.test(q);
  /* "How many polling units" is a count of places; "how many votes" is a
     question about the vote, answered by the place's own record. */
  const countAsked = /\b(how many|number of|count of)\s+(states|lgas|local governments|wards|polling units|pus|booths|senatorial districts|constituencies)\b/.test(q);
  const votesAsked = /\bhow many votes\b|\bnumber of votes\b|\bvotes did\b/.test(q);
  const turnoutAsked = /\bturnout\b/.test(q) && !filters.some((filter) => filter.field === "turnout");
  const topAsked = /\b(top|best|strongest|highest)\s+\d+\b/.test(q) || /\b\d+\s+(best|strongest|top)\b/.test(q);

  /* "Who won the South in 2023" — the region's own result. */
  const regionWon = Boolean(region) && !states.length && !lgas.length && /\bwho (won|carried|took|led)\b|\bwinner\b/.test(q);

  /* A person named on their own, or with a research word, is research. */
  /* Only when nothing else is asked: "Buhari" is research, "Buhari 2015
     results" and "Atiku strongholds" are questions about the vote. */
  const leftover = CANDIDATE_WORDS.reduce((text, [pattern]) => text.replace(new RegExp(pattern.source, "g"), " "), q)
    .replace(/\b(1999|2003|2007|2011|2015|2019|2023|who is|tell me about|about|the|a|an|of|on|mr|alhaji|dr|his|'s|s)\b/g, " ")
    .trim();
  const personOnly = whoHits.length > 0 && whoHits[0].who.kind === "candidate" && !placeNamed && !leftover && !threshold;
  const researchIntent = (researchAsked && (whoHits.length > 0 || aspirantTyped)) || personOnly;

  /* ── THE BIGGEST PLACES ───────────────────────────────────────────────
     "The 66,000 biggest polling units", "wards with the most voters in
     Kano", "highest turnout polling units", "densest LGAs". Measured by the
     register, turnout or voters per unit — not by anybody's share, which is
     what "top 10 states for Atiku" is and stays. */
  const sizeWords = /\b(biggest|largest|most (registered )?voters|most populous|populous|highest (number of )?(registered )?voters|most registered|densest|density|dense|crowded|most crowded|heaviest)\b/.test(q);
  const turnoutRank = /\b(highest|lowest|best|worst) turnout\b/.test(q) && /\b(polling units?|pus|wards?)\b/.test(q);
  const bigNumber = q.match(/\b(\d{1,3}(?:,\d{3})+|\d{2,6})\s*(k\b|thousand\b)?\s*(biggest|largest|polling units?|pus|wards|lgas|local governments)/);
  const groundAsked =
    (sizeWords || turnoutRank || (Boolean(bigNumber) && !whoHits.some((hit) => hit.who.kind === "candidate"))) &&
    !threshold &&
    !/\b(won|carried|win|lost|lose|stronghold|strongholds|weakest|strongest)\b/.test(q);

  /* ── GOVERNORS ─────────────────────────────────────────────────────── */
  const governorAsked = /\b(governors?|governorship|gubernatorial|who governs|ruling party|which party (rules|controls|governs|runs)|party in power)\b/.test(q);

  /* ── A COALITION: two or more candidates or parties, pooled ──────────── */
  const coalitionWords =
    /\b(coalition|alliance|merger|merge[sd]?|team(s|ed)? up|join(s|ed)? (him|them|forces|hands|together|up)|joins? him|together|combined?|combining|pool(ed|ing)?|unite[sd]?|united front|work(ing)? together|joint ticket|same ticket|adopt(s|ed)?|collaborat\w*)\b/;
  /* Partners are named before whoever they are to beat: "Atiku and Obi
     together, can they beat Tinubu" pools two, not three. */
  const beatAt = q.search(/\b(beat|defeat|against|versus|vs|topple|unseat|oust|over)\b/);
  const partners = [
    ...new Set(
      whoHits
        .filter((hit) => beatAt < 0 || hit.at < beatAt)
        .map((hit) => partyOf2023(hit.who) ?? (hit.who.kind === "party" ? hit.who.id : null))
        .filter(Boolean)
    ),
  ];
  const coalitionAsked = coalitionWords.test(q) && partners.length >= 2 && !strengthAsked;

  /* ── THE RULES OF WINNING ──────────────────────────────────────────── */
  const rulesAsked =
    !whoHits.length &&
    /\b(section 134|what (does|do) (it|one|you|a candidate) (take|need) to (win|be declared)|how many votes (to|do you need to|does (one|a candidate) need to|are needed to|needed to|required to) win|how (is|are) (the |a )?(president|winner)s? (elected|declared|chosen)|requirements? (to|for) (win|winning|becoming)|rules? (of|for|to) (win|winning)|run-?off|second ballot|constitutional (test|requirement|threshold)s?|(25%|25 percent|quarter|spread) (rule|test|requirement)|two[- ]thirds of the states)\b/.test(q);

  /* ── HOW EVERY STATE VOTED ─────────────────────────────────────────── */
  const candidateNamed = whoHits.some((hit) => hit.who.kind === "candidate");
  const resultsAsked =
    !candidateNamed &&
    !lgas.length &&
    states.length !== 1 &&
    /\b(results?|outcome|how did (the )?(states?|regions?|zones?|north|south|country|nigeria|nigerians) vote|who won (each|every|which|the) states?|state by state|what happened in (1999|2003|2007|2011|2015|2019|2023)|(1999|2003|2007|2011|2015|2019|2023) (presidential )?election\b)/.test(q);

  /* ── A PLAN TO WIN ─────────────────────────────────────────────────── */
  const campaignAsked =
    !strengthAsked &&
    /\b(campaign strategy|strategy|strategi[sz]e|strategic plan|game ?plan|blueprint|master ?plan|plan (for|to win)|winning plan|where should .{1,30} campaign|how (do|can|should|will) we win|(focus|concentrate|prioriti[sz]e) on to win|to win (the )?(election|presidency|presidential election))\b/.test(q);

  /* ── WHERE SOMEBODY IS STRONG ──────────────────────────────────────── */
  const strongestAsked = /\bwhere (is|are|was|were|does|did) .{1,30} (strongest|strong|popular|most popular|do best|did best|perform best|performed best)\b|\b(best|strongest|most popular) (states|lgas|local governments|wards|polling units|zones|areas|places|regions)\b|\bstrongest\b/.test(q);

  /* ── THE REGISTER OF VOTERS ────────────────────────────────────────── */
  const registerAsked = /\b(registered voters|voter register|register of voters|number of voters|how many voters|voter population|voting population|pvcs?)\b/.test(q) && !candidateNamed;

  const swingPlaces = /\bswing (states?|lgas|local governments|wards|areas|regions|zones)\b|\bbattleground/.test(q);
  const gainsAsked = /\b(gain|gained|gains|rose|risen|grew|grown|improved?|increased?|went up|growth)\b/.test(q) && !/\b(lost|lose|fell|drop|dropped|declined?|decrease|worst)\b/.test(q);

  const flippedAsked = /\b(won|carried|win) in (1999|2003|2015|2019)\b.{0,20}\b(but )?(lost|lose|not) in (2003|2015|2019|2023)\b|\b(lost|flipped|slipped) (from|since) (2019|2015)\b|\bstates? .{0,20}(lost|dropped) since\b/.test(q);
  const flipAsked = /\b(flip|flippable|turn around|win back|take back|snatch|capture|take from)\b/.test(q);
  const partyWon = !candidateNamed && /\b(which|what) party (won|carried|took|has|had|got)\b|\bparty (won|carried) the most\b|\bwho (won|carried|took) (the )?most states\b/.test(q) && !governorAsked;
  const improveAsked = /\b(need(s)? to improve|improve (in|on)|weak spots|weaknesses|where .{1,30} (struggle|struggles|struggled|underperform\w*|did badly|did worst))\b/.test(q);
  const winnableState = /\b(winnable|within reach|can (he|she|they|we|atiku|tinubu|obi|kwankwaso) win)\b/.test(q) && states.length === 1 && !lgas.length && !levelsIn(q, placeNames).length;

  const addsPartner = followUp && base?.intent === "coalition" && /\b(add|adding|plus|include|including|with|and|bring in|join)\b/.test(q) && partners.length >= 1;

  let intent = null;
  if (addsPartner) intent = "coalition";
  else if (governorAsked) intent = "governor";
  else if (winnableState) intent = "outlook";
  else if (partyWon) intent = "national";
  else if (flippedAsked) intent = "swing";
  else if (coalitionAsked) intent = "coalition";
  else if (rulesAsked) intent = "rules";
  else if ((outlookAsked || campaignAsked) && !versusAsked) intent = "outlook";
  else if (groundAsked && !researchIntent) intent = "ground";
  else if (researchIntent && !placeNamed) intent = "research";
  else if (offTopic) intent = "help";
  else if (nationalAsked || regionWon || (resultsAsked && !groundAsked)) intent = "national";
  else if (versusAsked) intent = "versus";
  else if (pathAsked) intent = "reach";
  else if (votesAsked && (states.length + lgas.length === 1 || unitCode)) intent = "profile";
  /* "Who won Kano in 2015" asks about a place's record, not about Atiku. */
  const whoWon = /\bwho (won|carried|took|clinched)\b|\bwinner (in|of)\b|\bwho (was|came) (first|second)\b/.test(q) && (states.length || lgas.length);
  if (intent) {
    /* decided above */
  } else if (whoWon) intent = "profile";
  else if (strengthAsked) intent = "strength";
  else if (scenario) intent = "scenario";
  else if (/\b(target|focus|prioriti[sz]e|priorit(y|ies)|where should|deploy|mobili[sz]e|canvass|invest|resources?|best places|next votes|opportunit(y|ies)|where (can|could) (we|he|she|they) gain|where to (go|campaign|work)|where (can|could|should|would) .{1,30} (gain|grow|pick up|find|get) (the )?(most |more |extra |new )?votes)\b/.test(q)) intent = "target";
  else if (swingPlaces || flipAsked) intent = "list";
  else if (improveAsked) intent = "list";
  else if (registerAsked && !groundAsked) intent = "list";
  else if (threshold !== null) intent = "reach";
  else if (/\b(swing|swung|changed?|changes|since (2019|2015)|compared? (to|with)|versus|vs|gained|gain(ed)? ground|lost ground|improved|declined|grew|dropped|fell|shift(ed)?|trend)\b/.test(q) || years.length >= 2) intent = "swing";
  else if (/\b(won|carried|win|wins|winning|lost|lose|stronghold|strongholds|primary|secondary|tertiary|biggest|largest|most voters|most registered|highest|lowest|turnout|registered|weakest|strongest|worst|best|poorest)\b/.test(q) || filters.length) intent = "list";

  if (!intent && (winnableAsked || closeAsked || countAsked || turnoutAsked || topAsked || strongestAsked)) intent = "list";
  if (!intent && /\b(rank|ranking|order|sort|arrange)\b/.test(q)) intent = "list";
  /* "Buhari 2015 results", "how did Obi do in 2023": the run itself, state by state. */
  if (!intent && candidateNamed && /\b(results?|performance|perform|performed|how did|do in|did in|votes?|score|scored)\b/.test(q)) intent = "list";

  /* "What about Kano?" after the 2027 question is the 2027 question for
     Kano; after a governor question, Kano's governor. A follow-up that names
     only a place keeps the question it follows. */
  if (!intent && followUp && base?.intent && !["help", "overview"].includes(base.intent)) intent = base.intent;
  const named = unitCode || states.length + lgas.length === 1;
  if (!intent && named && !levels.length) intent = "profile";
  if (!intent && /\b(tell me about|profile|how did|how (is|was)|results? (in|for)|record (in|for)|history (of|in))\b/.test(q) && (states.length || lgas.length || unitCode)) intent = "profile";
  if (!intent) intent = base?.intent ?? "overview";

  /* ── WHERE ──────────────────────────────────────────────────────────── */
  let within = { region, zones, states: states.map((state) => state.code), lgas: lgas.map((lga) => lga.key) };
  if (lgas.length && !states.length) within.states = [...new Set(lgas.map((lga) => lga.stateCode))];
  const namedPlaces = (region ? 1 : 0) + zones.length + states.length + lgas.length;
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
    /* A region's places to target are its local governments; a region's
       answer otherwise is read state by state. */
    else if (zones.length || region) levels = intent === "target" ? ["lga"] : ["state"];
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
  let focus = null;
  if (intent === "list") {
    if (winnableAsked) {
      focus = "winnable";
      listFilters.push({ field: "lead", op: ">", value: -5 });
    } else if (flipAsked && !closeAsked) {
      /* "Which states can he flip": lost, and within ten points. */
      focus = "close";
      listFilters.push({ field: "won", op: "=", value: false }, { field: "lead", op: ">", value: -10 });
    } else if (closeAsked) {
      focus = "close";
      if (/\b(lost|lose)\b/.test(q)) listFilters.push({ field: "won", op: "=", value: false }, { field: "lead", op: ">", value: -5 });
      else if (/\b(won|carried|win)\b/.test(q)) listFilters.push({ field: "won", op: "=", value: true }, { field: "lead", op: "<", value: 5 });
      else listFilters.push({ field: "margin", op: "<", value: 5 });
    }
    if (countAsked) focus = "count";
    if (turnoutAsked) {
      focus = "turnout";
      sort = { field: "turnout", dir: /\b(lowest|worst|least|poorest)\b/.test(q) ? "asc" : "desc" };
    }
    if (topAsked) focus = focus ?? "top";
    if (strongestAsked && !focus && !/\bstrongholds?\b/.test(q)) focus = "top";
    if (registerAsked && !focus) focus = "register";
  }
  if (intent === "reach" && pathAsked) focus = "path";
  if (intent === "list") {
    if (focus === "winnable" || focus === "close") {
      /* the filters above already say it */
    } else if (/\b(lost|lose|didn'?t win|did not win)\b/.test(q)) listFilters.push({ field: "won", op: "=", value: false });
    else if (/\b(won|carried|win|wins|winning)\b/.test(q)) listFilters.push({ field: "won", op: "=", value: true });
    const tier = q.match(/\b(primary|secondary|tertiary)\b/);
    if (tier) listFilters.push({ field: "tier", op: "=", value: tier[1].toUpperCase() });
    else if (/\bstrongholds?\b/.test(q)) listFilters.push({ field: "tier", op: "=", value: "any" });
    if (sort) {
      /* set by the turnout question above */
    } else if (/\b(biggest|largest|most voters|most registered|most populous)\b/.test(q)) sort = { field: "registered", dir: "desc" };
    else if (/\b(lowest|worst) turnout\b/.test(q)) sort = { field: "turnout", dir: "asc" };
    else if (/\b(highest|best) turnout\b/.test(q)) sort = { field: "turnout", dir: "desc" };
    else if (/\b(weakest|worst|lowest|poorest)\b/.test(q) || improveAsked) sort = { field: "share", dir: "asc" };
    /* "Rank states by margin", "by votes", "by share". */
    else if (/\b(by|on) (the )?([a-z']+ ){0,2}(margin|margins|lead)\b/.test(q)) sort = { field: "lead", dir: "desc" };
    else if (/\b(by|on) (the )?([a-z']+ ){0,2}(votes|vote count|number of votes|total votes)\b/.test(q)) sort = { field: "votes", dir: "desc" };
    else if (/\b(by|on) (the )?([a-z']+ ){0,2}(share|vote share|percentage|percent)\b/.test(q)) sort = { field: "share", dir: "desc" };
    else if (focus === "register") sort = { field: "registered", dir: "desc" };
    else if (focus === "top") sort = { field: "share", dir: "desc" };
  }
  if (intent === "swing" && flippedAsked) focus = "flipped";
  else if (intent === "swing" && /\b(lost ground|declined|dropped|fell|worst|weakest|fall)\b/.test(q)) sort = { field: "swing", dir: "asc" };
  else if (intent === "swing" && gainsAsked) {
    sort = { field: "swing", dir: "desc" };
    focus = "gains";
  }

  let place = null;
  if (intent === "profile") {
    if (unitCode) place = { level: "unit", key: unitCode };
    else if (lgas.length) place = { level: "lga", key: lgas[0].key };
    else if (states.length) place = { level: "state", key: states[0].code };
    else if (base?.place) place = base.place;
    else intent = "overview";
  }

  /* The ADC stood in 2023 without a measurable presidential vote, so its path
     is read from what Poll360 does hold for it: its register. */
  if (intent === "outlook" && who?.kind === "party" && !["APC", "PDP", "LP", "NNPP"].includes(who.id)) {
    intent = "strength";
    focus = "path";
  }

  if (partyWon && intent === "national") focus = "count";

  const factors = intent === "target" ? factorsIn(q) : null;

  if (intent === "reach" && pathAsked) {
    levels = ["state"];
  }
  let size = null;
  if (intent === "ground" && bigNumber) {
    const n = Number(bigNumber[1].replace(/,/g, "")) * (bigNumber[2] ? 1000 : 1);
    if (n >= 1 && !(n >= 1999 && n <= 2031 && !bigNumber[1].includes(","))) size = n;
  }
  if (intent === "ground" && !size && limit) size = limit;
  if (intent === "ground" && !levelsIn(q, placeNames).length) levels = ["unit"];
  const plan = {
    intent: intent === "overview" ? "list" : intent,
    size,
    measure: intent === "ground" ? (/\bturnout\b/.test(q) ? "turnout" : /\b(density|dense|densest|crowded|per polling unit|per unit)\b/.test(q) ? "density" : "registered") : null,
    whoNamed: whoHits.length > 0,
    aspirant: intent === "research" && !whoHits.length ? titleCase(aspirantTyped) : null,
    rival: intent === "versus" ? whoHits[1].who : null,
    focus,
    who,
    levels: levels.slice(0, 4),
    year,
    compareYear,
    /* A scenario's "5% more" is a swing, not a line of share. */
    threshold:
      intent === "scenario" && scenario && Object.values(scenario.swing).some((points) => Math.abs(points) === threshold)
        ? null
        : intent === "governor" || intent === "coalition"
          ? null
          : threshold ?? (followUp && intent === base?.intent ? base.threshold : null),
    /* A follow-up keeps the coalition it follows, and "add Kwankwaso" adds. */
    partners:
      intent === "coalition"
        ? partners.length >= 2
          ? partners
          : base?.partners?.length
            ? [...new Set([...base.partners, ...partners])]
            : partners
        : null,
    band: bandIn(q) ?? (followUp ? base?.band ?? null : null),
    show,
    within,
    filters: listFilters.length ? listFilters : followUp && !namedPlaces ? base?.filters ?? [] : [],
    sort:
      intent === "strength"
        ? weakFirst
          ? { field: "per_thousand", dir: "asc" }
          : /\b(strong|strongest|stronger|densest|most members|biggest)\b/.test(q)
            ? { field: "per_thousand", dir: "desc" }
            : null
        : sort ?? (followUp ? base?.sort ?? null : null),
    limit: limit ?? null,
    against: intent === "strength" && againstVote ? "vote" : null,
    factors,
    place,
    scenario,
  };

  const confident =
    intent !== "overview" && (whoHits.length > 0 || followUp || threshold !== null || namedPlaces > 0 || Boolean(scenario));

  return { plan, confident, followUp };
}

function titleCase(text) {
  return String(text ?? "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ") || null;
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
