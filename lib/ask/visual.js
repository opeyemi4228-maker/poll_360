import { LEVEL_WORDS, fmtInt, fmtPct, fmtPts } from "./format.js";
import { STATE_LIST } from "./ground.js";

const STATE_NAMES = Object.fromEntries(STATE_LIST.map((state) => [state.code, state.name]));

/**
 * The map and the chart under an answer.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE PICTURE FOLLOWS THE QUESTION
 *
 *  A map when the answer is about places, a 2019-to-2023 chart when it is
 *  about change between two runs, and never a picture for its own sake. The
 *  map is drawn at the level the question is about: the states for a question
 *  about the country or a zone, one state's local governments for a question
 *  about that state — and a question about wards or polling units is shown by
 *  local government, because 176,000 dots on a phone are not a map.
 *
 *  Colours are decided here, once, so the screen and the PDF brief cannot
 *  disagree about what blue means. Every palette below was run through the
 *  data-visualisation validator against the white card:
 *
 *    STATUS      held · new · within reach — royal, light royal, the flagged
 *                orange; out of reach is the neutral grey, an absence rather
 *                than a category. Passes CVD and normal-vision separation.
 *    SEQUENTIAL  one hue, the brand's royal, light to dark — for any amount.
 *    DIVERGING   the brand red for a fall, royal for a rise, grey at nought.
 *    PARTY       the party's own colour, where the party is the answer —
 *                the one place a party colour is allowed on this desk.
 *
 *  The colour is never the only carrier: every region has a label on hover,
 *  every map a legend, and the table under it is the same data in words.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const STATUS_COLOUR = {
  held: "#2943c5",
  cleared: "#6387f6",
  reach: "#ec7c0e",
  beyond: "#c5c7cd",
  none: "#edeef1",
};

/* Light to dark, one hue: blue-100, blue-300ish, blue-400, blue-500, blue-800. */
const RAMP = ["#dee8ff", "#abc3ff", "#6e91fa", "#3d5fe3", "#1d319d"];

/* Fall to rise through a neutral grey: red-500, red-300, ink-200, blue-300, blue-600. */
const DIVERGING = ["#e4013b", "#ff9092", "#dee0e4", "#abc3ff", "#2943c5"];

/* The parties' own colours, as the rest of the product draws them. */
const PARTY = {
  APC: "#87beeb",
  PDP: "#006903",
  LP: "#da251c",
  NNPP: "#049603",
  APGA: "#c9b400",
  ADC: "#ef8a1f",
  SDP: "#1aa3a3",
  ANPP: "#2a6fbd",
  "AD-APP": "#7a5b3a",
  OTH: "#9ca0a8",
};

/** Bins for an amount: fixed breaks where the measure has meaningful lines, quantiles otherwise. */
function sequential(values, breaks = null, { fixed = false } = {}) {
  const known = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value)).sort((a, b) => a - b);
  let edges = breaks;
  /* ── FIXED BANDS ONLY WHERE THEY SEPARATE ──────────────────────────────
     10, 20, 30% are the right bands for the country. For Kano, where every
     local government is under 10%, they paint one colour and say nothing.
     Where the fixed bands would leave fewer than three in use, the bands
     follow the data instead, rounded to half a point. */
  if (edges && known.length && !fixed) {
    const used = new Set(known.map((value) => edges.filter((edge) => value >= edge).length));
    if (used.size < 3) edges = null;
  }
  if (!edges && known.length >= 2 && breaks) {
    /* Rounded to a step that suits the spread: a tenth of a point where the
       places sit within five points of each other, whole points where not. */
    const spread = known[known.length - 1] - known[0];
    const step = spread < 5 ? 0.1 : spread < 20 ? 0.5 : 1;
    const at = (q) => Math.round(known[Math.min(known.length - 1, Math.floor(q * (known.length - 1)))] / step) * step;
    edges = [...new Set([at(0.2), at(0.4), at(0.6), at(0.8)].map((edge) => Number(edge.toFixed(1))))];
  }
  if (!edges) {
    if (known.length < 2) edges = [known[0] ?? 0];
    else {
      const at = (q) => known[Math.min(known.length - 1, Math.floor(q * (known.length - 1)))];
      edges = [...new Set([at(0.2), at(0.4), at(0.6), at(0.8)])];
    }
  }
  const binOf = (value) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    let bin = 0;
    for (const edge of edges) if (value >= edge) bin += 1;
    return Math.min(bin, RAMP.length - 1);
  };
  const ramp = edges.length + 1 >= RAMP.length ? RAMP : RAMP.slice(RAMP.length - (edges.length + 1));
  const adaptive = Boolean(breaks) && edges !== breaks;
  return { edges, adaptive, low: known[0] ?? null, high: known[known.length - 1] ?? null, colourOf: (value) => (binOf(value) === null ? STATUS_COLOUR.none : ramp[Math.min(binOf(value), ramp.length - 1)]), ramp };
}

/**
 * The legend for a ramp: "Under 10", "10–20", "45 and over", with the unit
 * said once after the figures rather than on both ends of every range.
 */
function legendFor(scale, format, unit = "") {
  const { edges, ramp } = scale;
  const tail = unit === "%" ? "%" : unit ? ` ${unit}` : "";
  return ramp.map((color, index) => ({
    color,
    label:
      index === 0
        ? edges[0] === 1 && !unit ? "None" : `Under ${format(edges[0])}${tail}`
        : index === ramp.length - 1
          ? `${format(edges[edges.length - 1])}${tail} and over`
          : `${format(edges[index - 1])}–${format(edges[index])}${tail}`,
  }));
}

const pctUnit = (v) => (Number.isInteger(v) ? `${v}` : v.toFixed(1));

/* ══════════════════════════════════════════════════════════════ the map */

/**
 * Where a row sits against the line, as the map colours it: by where it
 * stands now. "Lost since 2019" is said in words in the table and on hover.
 */
function standing(row, T, band) {
  if (row.share === null || row.share === undefined) return "none";
  if (row.share >= T) return row.share_prev !== null && row.share_prev !== undefined && row.share_prev >= T ? "held" : "cleared";
  return row.share >= T - band ? "reach" : "beyond";
}

const STATUS_LEGEND = (T, band, prev) => [
  { color: STATUS_COLOUR.held, label: prev ? `Over ${T}% in ${prev} and now` : `Over ${T}%` },
  ...(prev ? [{ color: STATUS_COLOUR.cleared, label: `Over ${T}%, new since ${prev}` }] : []),
  { color: STATUS_COLOUR.reach, label: `Within ${band} points` },
  { color: STATUS_COLOUR.beyond, label: "Further off" },
];

/** A map spec: which regions, and what colour and words each one gets. */
function mapFrom({ level, state, title, fills, legend, note }) {
  return { level, state: state ?? null, title, fills, legend, note: note ?? null };
}

/**
 * The rest of the ground a question asked about, drawn in the neutral grey.
 *
 * A list of the nine northern states Atiku won is an answer about the North,
 * so the map is the North with those nine lit — not nine states cut out of
 * their region. The map zooms to whatever is filled, so this is also what
 * frames it.
 */
function withGround(map, result, tip) {
  if (!map || map.level !== "state") return map;
  const ground = result.scope?.states ?? null;
  const codes = ground ?? Object.keys(STATE_NAMES);
  for (const code of codes) {
    if (!map.fills[code]) map.fills[code] = { color: STATUS_COLOUR.beyond, tip: `${STATE_NAMES[code] ?? code}: ${tip}` };
  }
  return map;
}

/** Group lower rows (wards, polling units) into their local governments. */
function byLga(rows, pick) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.lga) continue;
    if (!groups.has(row.lga)) groups.set(row.lga, []);
    groups.get(row.lga).push(row);
  }
  return [...groups.entries()].map(([lga, inLga]) => ({ lga, rows: inLga, ...pick(inLga) }));
}

const oneState = (rows) => {
  const states = new Set(rows.map((row) => row.stateCode ?? row.state).filter(Boolean));
  return states.size === 1 ? [...states][0] : null;
};

function stateCodeOf(result, rows) {
  const code = result.plan?.within?.states?.length === 1 ? result.plan.within.states[0] : null;
  if (code) return code;
  const only = oneState(rows);
  return only && only.length === 3 && only === only.toUpperCase() ? only : null;
}

function reachMap(result, section) {
  const T = section.facts.threshold;
  const band = result.band ?? 5;
  const rows = section.rows;
  if (section.level === "state") {
    return mapFrom({
      level: "state",
      title: `Where ${result.whoName} stands against ${T}%, ${result.year}`,
      fills: Object.fromEntries(
        rows.map((row) => [
          row.key,
          { color: STATUS_COLOUR[standing(row, T, band)], tip: `${row.name}: ${fmtPct(row.share)}${row.share_prev !== null && row.share_prev !== undefined ? ` (${result.prev}: ${fmtPct(row.share_prev)})` : ""} — ${row.status_label}` },
        ])
      ),
      legend: STATUS_LEGEND(T, band, result.prev),
    });
  }
  const state = stateCodeOf(result, rows);
  if (section.level === "lga" && state) {
    return mapFrom({
      level: "lga",
      state,
      title: `${result.scope.name}'s local governments against ${T}%, ${result.year}`,
      fills: Object.fromEntries(
        rows.map((row) => [row.name, { color: STATUS_COLOUR[standing(row, T, band)], tip: `${row.name}: ${fmtPct(row.share)} — ${row.status_label}${row.need ? `, ${fmtInt(row.need)} votes to find` : ""}` }])
      ),
      legend: STATUS_LEGEND(T, band, result.prev),
      note: "Estimated below the state.",
    });
  }
  if (section.level === "lga" && !state) {
    return byStateMap(rows, {
      title: `Local governments over ${T}%, state by state`,
      measure: (inState) => (inState.filter((row) => row.share >= T).length / inState.length) * 100,
      format: (v) => `${Math.round(v)}`,
      unit: "%",
      breaks: [20, 40, 60, 80],
      fixed: true,
      tip: (entry) => `${entry.state}: ${fmtInt(entry.rows.filter((row) => row.share >= T).length)} of ${fmtInt(entry.rows.length)} local governments over ${T}%`,
    });
  }
  if ((section.level === "ward" || section.level === "unit") && state) {
    /* The list holds places over the line or near it; the map counts, in
       each local government, how many are already over. */
    const groups = byLga(rows, (inLga) => ({
      cleared: inLga.filter((row) => row.share >= T).length,
      near: inLga.filter((row) => row.share < T && row.share >= T - band).length,
    }));
    const scale = sequential(groups.map((group) => group.cleared));
    return mapFrom({
      level: "lga",
      state,
      title: `${LEVEL_WORDS[section.level].title} over ${T}%, counted by local government`,
      fills: Object.fromEntries(
        groups.map((group) => [
          group.lga,
          { color: scale.colourOf(group.cleared), tip: `${group.lga}: ${fmtInt(group.cleared)} ${LEVEL_WORDS[section.level].many} over ${T}%, ${fmtInt(group.near)} within ${band} points` },
        ])
      ),
      legend: legendFor(scale, (v) => fmtInt(v)),
      note: "Estimated below the state.",
    });
  }
  return null;
}

function shareMap(result, rows, level, title, { matchOnly = false } = {}) {
  if (level === "state") {
    const scale = sequential(rows.map((row) => row.share), [10, 20, 30, 45]);
    return mapFrom({
      level: "state",
      title,
      fills: Object.fromEntries(
        rows.map((row) => [
          row.key,
          { color: matchOnly ? STATUS_COLOUR.held : scale.colourOf(row.share), tip: `${row.name}: ${fmtPct(row.share)}${row.won ? ", carried" : row.won === false ? ", not carried" : ""}` },
        ])
      ),
      legend: matchOnly ? [{ color: STATUS_COLOUR.held, label: "On the list" }, { color: STATUS_COLOUR.none, label: "Not on it" }] : legendFor(scale, pctUnit, "%"),
      note: scale.adaptive && !matchOnly ? `Every one is between ${fmtPct(scale.low)} and ${fmtPct(scale.high)}; the shades separate them within that range.` : null,
    });
  }
  const state = stateCodeOf(result, rows);
  if (level === "lga" && state) {
    const scale = sequential(rows.map((row) => row.share), [10, 20, 30, 45]);
    return mapFrom({
      level: "lga",
      state,
      title,
      fills: Object.fromEntries(
        rows.map((row) => [
          row.name,
          {
            color: matchOnly ? STATUS_COLOUR.held : scale.colourOf(row.share),
            tip: `${row.name}: ${fmtPct(row.share)}${row.won ? ", carried" : row.won === false ? ", not carried" : ""}${row.tier ? `, ${row.tier.toLowerCase()} stronghold` : ""}`,
          },
        ])
      ),
      legend: matchOnly ? [{ color: STATUS_COLOUR.held, label: "On the list" }, { color: STATUS_COLOUR.none, label: "Not on it" }] : legendFor(scale, pctUnit, "%"),
      /* Where the bands follow a narrow spread, say how narrow — dark blue in
         Kano is 8.8%, and nobody should read it as strength. */
      note: scale.adaptive && !matchOnly
        ? `Estimated below the state. Every one is between ${fmtPct(scale.low)} and ${fmtPct(scale.high)}; the shades separate them within that range.`
        : "Estimated below the state.",
    });
  }
  if ((level === "ward" || level === "unit") && state) {
    const groups = byLga(rows, (inLga) => ({ n: inLga.length }));
    const scale = sequential(groups.map((group) => group.n));
    return mapFrom({
      level: "lga",
      state,
      title: `${LEVEL_WORDS[level].title} on the list, by local government`,
      fills: Object.fromEntries(groups.map((group) => [group.lga, { color: scale.colourOf(group.n), tip: `${group.lga}: ${fmtInt(group.n)} ${LEVEL_WORDS[level].many}` }])),
      legend: legendFor(scale, (v) => fmtInt(v)),
      note: "Estimated below the state.",
    });
  }
  return null;
}

function tierMap(result, section) {
  const state = stateCodeOf(result, section.rows);
  const colour = { PRIMARY: STATUS_COLOUR.held, SECONDARY: STATUS_COLOUR.cleared, TERTIARY: STATUS_COLOUR.reach };
  const legend = [
    { color: colour.PRIMARY, label: "Primary — carried both times" },
    { color: colour.SECONDARY, label: "Secondary — once, on PDP ground" },
    { color: colour.TERTIARY, label: "Tertiary — carried once" },
    { color: STATUS_COLOUR.beyond, label: "Not a stronghold" },
  ];
  const fillOf = (row) => ({ color: colour[row.tier] ?? STATUS_COLOUR.beyond, tip: `${row.name}: ${row.tier ? `${row.tier.toLowerCase()} stronghold` : "not a stronghold"}, ${fmtPct(row.share)} in ${result.year}` });
  if (section.level === "state") {
    return mapFrom({ level: "state", title: `${result.whoName}'s strongholds, state by state`, fills: Object.fromEntries(section.rows.map((row) => [row.key, fillOf(row)])), legend });
  }
  if (section.level === "lga" && state) {
    return mapFrom({ level: "lga", state, title: `${result.whoName}'s strongholds in ${result.scope.name}`, fills: Object.fromEntries(section.rows.map((row) => [row.name, fillOf(row)])), legend, note: "Estimated below the state." });
  }
  return null;
}

function listMap(result, section) {
  const filters = result.plan.filters ?? [];
  if (filters.some((filter) => filter.field === "tier")) return tierMap(result, section);
  const matchOnly = filters.length > 0 && !section.unfiltered && section.level === "state";
  const map = shareMap(result, section.rows, section.level, `${result.whoName}'s share, ${result.year}`, { matchOnly });
  if (map && matchOnly) return withGround(map, result, "not on this list");
  if (map || section.level === "state") return map;
  return byStateMap(section.rows, {
    result,
    title: `${LEVEL_WORDS[section.level].title} on the list, state by state`,
    measure: (inState) => inState.length,
    format: (v) => fmtInt(v),
    tip: (entry) => `${entry.state}: ${fmtInt(entry.rows.length)} ${LEVEL_WORDS[section.level].many}`,
  });
}

function swingMap(result, section) {
  const rows = section.rows;
  const colourOf = (change) =>
    change === null || change === undefined ? STATUS_COLOUR.none : change <= -10 ? DIVERGING[0] : change < -2 ? DIVERGING[1] : change <= 2 ? DIVERGING[2] : change < 10 ? DIVERGING[3] : DIVERGING[4];
  const legend = [
    { color: DIVERGING[0], label: "Fell 10 pts or more" },
    { color: DIVERGING[1], label: "Fell 2–10 pts" },
    { color: DIVERGING[2], label: "Within 2 pts" },
    { color: DIVERGING[3], label: "Rose 2–10 pts" },
    { color: DIVERGING[4], label: "Rose 10 pts or more" },
  ];
  const state = stateCodeOf(result, rows);
  if (section.level !== "state" && !(section.level === "lga" && state)) return null;
  return mapFrom({
    level: section.level === "state" ? "state" : "lga",
    state: section.level === "state" ? null : state,
    title: `${result.whoName}'s change, ${result.prev} to ${result.year}`,
    fills: Object.fromEntries(rows.map((row) => [section.level === "state" ? row.key : row.name, { color: colourOf(row.change), tip: `${row.name}: ${fmtPts(row.change)} (${fmtPct(row.share_prev)} to ${fmtPct(row.share)})` }])),
    legend,
    note: section.level === "state" ? null : "Estimated below the state.",
  });
}

function targetMap(result, section) {
  const rows = section.rows;
  const scale = sequential(rows.map((row) => row.score), [20, 40, 60, 80]);
  const state = stateCodeOf(result, rows);
  const legend = legendFor(scale, (v) => `${v}`);
  if (section.level === "state") {
    return mapFrom({ level: "state", title: "Priority score", fills: Object.fromEntries(rows.map((row) => [row.key, { color: scale.colourOf(row.score), tip: `${row.name}: scores ${row.score}${row.why ? ` — ${row.why}` : ""}` }])), legend });
  }
  if (section.level === "lga" && state) {
    return mapFrom({ level: "lga", state, title: "Priority score, by local government", fills: Object.fromEntries(rows.map((row) => [row.name, { color: scale.colourOf(row.score), tip: `${row.name}: scores ${row.score}${row.why ? ` — ${row.why}` : ""}` }])), legend, note: "Estimated below the state." });
  }
  if ((section.level === "lga" || section.level === "ward") && !state) {
    return byStateMap(rows, {
      result,
      rest: "none in the top of the list",
      title: `Highest priority score in each state`,
      measure: (inState) => Math.max(...inState.map((row) => row.score)),
      format: (v) => `${Math.round(v)}`,
      tip: (entry) => {
        const best = [...entry.rows].sort((a, b) => b.score - a.score)[0];
        return `${entry.state}: best is ${best.name}, scoring ${best.score}`;
      },
    });
  }
  if ((section.level === "ward" || section.level === "unit") && state) {
    const groups = byLga(rows, (inLga) => ({ best: Math.max(...inLga.map((row) => row.score)) }));
    return mapFrom({
      level: "lga",
      state,
      title: `Highest-scoring ${LEVEL_WORDS[section.level].one} in each local government`,
      fills: Object.fromEntries(groups.map((group) => [group.lga, { color: scale.colourOf(group.best), tip: `${group.lga}: best ${LEVEL_WORDS[section.level].one} scores ${group.best}` }])),
      legend,
    });
  }
  return null;
}

function registerMap(result, section) {
  const rows = section.rows;
  const f = section.facts;
  const state = stateCodeOf(result, rows);
  if (section.level === "state" || (section.level === "lga" && state)) {
    const measure = rows.some((row) => row.per_thousand !== null) ? "per_thousand" : "members";
    const scale = sequential(rows.map((row) => row[measure]));
    const format = (v) => fmtInt(v);
    return mapFrom({
      level: section.level,
      state: section.level === "state" ? null : state,
      title: f.against ? `${f.party} members per 1,000 voters` : `${f.party} register, ${measure === "per_thousand" ? "members per 1,000 registered voters" : "members"}`,
      fills: Object.fromEntries(
        rows.map((row) => [
          section.level === "state" ? row.key : row.name,
          { color: row.members === 0 ? STATUS_COLOUR.beyond : scale.colourOf(row[measure]), tip: `${row.name}: ${fmtInt(row.members)} members${row.per_thousand !== null ? `, ${fmtInt(row.per_thousand)} per 1,000 voters` : ""}${row.status_label ? ` — ${row.status_label}` : ""}` },
        ])
      ),
      legend: [...legendFor(scale, format, measure === "per_thousand" ? "per 1,000" : "members"), ...(rows.some((row) => row.members === 0) ? [{ color: STATUS_COLOUR.beyond, label: "No members" }] : [])],
      note: "Members, not votes.",
    });
  }
  return null;
}

function voteMap(result, section) {
  if (section.level !== "state") return null;
  const f = section.facts;
  const winners = [...new Set(section.rows.map((row) => row.winner).filter(Boolean))];
  return mapFrom({
    level: "state",
    title: `Who carried each state, ${f.year}`,
    fills: Object.fromEntries(
      section.rows.map((row) => [row.key, { color: PARTY[row.winner] ?? PARTY.OTH, tip: `${row.name}: ${row.winner} by ${fmtPts(row.margin).replace("+", "")}${f.standalone ? `; ${f.party} ${fmtPct(row[`p_${f.party}`])}` : ""}` }])
    ),
    legend: winners.map((id) => ({ color: PARTY[id] ?? PARTY.OTH, label: id })),
    note: "Party colours: here the colour is the data.",
  });
}

function scenarioMap(result, section) {
  return mapFrom({
    level: "state",
    title: "After the swing",
    fills: Object.fromEntries(
      section.rows.map((row) => [
        row.key,
        {
          color: row.won ? STATUS_COLOUR.held : row.clears ? STATUS_COLOUR.cleared : row.share >= 20 ? STATUS_COLOUR.reach : STATUS_COLOUR.beyond,
          tip: `${row.name}: ${fmtPct(row.share)} projected (${fmtPct(row.share_prev)} in 2023), ${row.won ? "carried" : `${row.winner} carries`}`,
        },
      ])
    ),
    legend: [
      { color: STATUS_COLOUR.held, label: "Carried" },
      { color: STATUS_COLOUR.cleared, label: "Over 25%, not carried" },
      { color: STATUS_COLOUR.reach, label: "20–25%" },
      { color: STATUS_COLOUR.beyond, label: "Under 20%" },
    ],
    note: "A projection, not a result.",
  });
}

/**
 * Local governments (or lower) spread over several states, drawn by state:
 * each state coloured by a figure worked out from its own rows. Used when a
 * question about a region's local governments has no single state to zoom to.
 */
function byStateMap(rows, { title, measure, format, tip, note, breaks = null, fixed = false, unit = "", result = null, rest = "none on this list" }) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.stateCode) continue;
    if (!groups.has(row.stateCode)) groups.set(row.stateCode, { state: row.state, rows: [] });
    groups.get(row.stateCode).rows.push(row);
  }
  if (groups.size < 2) return null;
  const figures = [...groups.entries()].map(([code, group]) => ({ code, state: group.state, value: measure(group.rows), rows: group.rows }));
  const scale = sequential(figures.map((entry) => entry.value), breaks, { fixed });
  const map = mapFrom({
    level: "state",
    title,
    fills: Object.fromEntries(figures.map((entry) => [entry.code, { color: scale.colourOf(entry.value), tip: tip(entry) }])),
    legend: [...legendFor(scale, format, unit), ...(result ? [{ color: STATUS_COLOUR.beyond, label: cap(rest) }] : [])],
    note: note ?? "Estimated below the state; each state coloured by its own local governments.",
  });
  return result ? withGround(map, result, rest) : map;
}

const cap = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);

/* ══════════════════════════════════════════════════════════════ the chart */

/**
 * Two runs, one row per place: where it was and where it is, with the line
 * between. A dumbbell, because the question is "how far did it move", and the
 * gap is the answer.
 */
function dumbbell(rows, { title, fromKey = "share_prev", toKey = "share", fromLabel, toLabel, line = null, limit = 44 }) {
  const usable = rows.filter((row) => Number.isFinite(row[fromKey]) && Number.isFinite(row[toKey]));
  if (usable.length < 3) return null;
  const sorted = [...usable].sort((a, b) => b[toKey] - a[toKey]).slice(0, limit);
  return {
    kind: "dumbbell",
    title,
    fromLabel,
    toLabel,
    line,
    rows: sorted.map((row) => ({ label: row.name, from: row[fromKey], to: row[toKey] })),
    more: usable.length > sorted.length ? usable.length - sorted.length : 0,
  };
}

/* ══════════════════════════════════════════════════════════════ the door */

/**
 * @returns {{ map: object | null, chart: object | null }}
 */
export function visualise(result) {
  const found = visualiseRaw(result);
  /* A legend names only the colours the map uses: a key to a colour that is
     not there is a question the reader cannot answer. */
  if (found.map?.legend) {
    const used = new Set(Object.values(found.map.fills).map((fill) => fill.color));
    found.map.legend = found.map.legend.filter((entry) => used.has(entry.color));
  }
  return found;
}

function visualiseRaw(result) {
  const section = result.sections?.[0];
  if (!section) return { map: null, chart: null };
  const kind = section.facts?.kind;
  const T = section.facts?.threshold ?? result.threshold ?? 25;
  const fewEnough = section.rows.length <= 44 && (section.level === "state" || section.level === "zone" || section.level === "lga");
  try {
    switch (kind) {
      case "reach":
        return {
          map: reachMap(result, section),
          chart: result.prev && fewEnough
            ? dumbbell(section.rows, { title: `${result.whoName}'s share, ${result.prev} to ${result.year}`, fromLabel: String(result.prev), toLabel: String(result.year), line: T })
            : null,
        };
      case "list":
        return {
          map: listMap(result, section),
          chart: result.prev && fewEnough
            ? dumbbell(section.rows, { title: `${result.whoName}'s share, ${result.prev} to ${result.year}`, fromLabel: String(result.prev), toLabel: String(result.year), line: 25 })
            : null,
        };
      case "swing":
        return {
          map: swingMap(result, section),
          chart: fewEnough ? dumbbell(section.rows, { title: `${result.whoName}'s share, ${result.prev} to ${result.year}`, fromLabel: String(result.prev), toLabel: String(result.year), line: 25 }) : null,
        };
      case "target":
        return { map: targetMap(result, section), chart: null };
      case "profile-state": {
        const lgas = result.sections.find((entry) => entry !== section && entry.level === "lga");
        const code = result.plan?.place?.key;
        return {
          map: lgas ? shareMap({ ...result, plan: { ...result.plan, within: { states: [code] } } }, lgas.rows, "lga", `${result.whoName}'s share by local government, 2023`) : null,
          chart: lgas ? dumbbell(lgas.rows, { title: `${result.whoName}'s share by local government, 2019 to 2023`, fromLabel: "2019", toLabel: "2023", line: 25 }) : null,
        };
      }
      case "strength-register":
        return { map: registerMap(result, section), chart: null };
      case "strength-vote":
        return { map: voteMap(result, section), chart: null };
      case "versus": {
        if (section.level !== "state" || section.facts.kind !== "versus") return { map: null, chart: null };
        const f = section.facts;
        const colourA = PARTY[f.partyA] ?? STATUS_COLOUR.held;
        const colourB = PARTY[f.partyB] ?? STATUS_COLOUR.reach;
        return {
          map: mapFrom({
            level: "state",
            title: `Who was ahead, ${f.nameA} or ${f.nameB}, ${f.year}`,
            fills: Object.fromEntries(
              section.rows.map((row) => [row.key, { color: row.gap >= 0 ? colourA : colourB, tip: `${row.name}: ${f.nameA} ${fmtPct(row.a)}, ${f.nameB} ${fmtPct(row.b)}` }])
            ),
            legend: [
              { color: colourA, label: `${f.nameA} ahead` },
              { color: colourB, label: `${f.nameB} ahead` },
            ],
            note: "Party colours: here the colour is the data.",
          }),
          chart: null,
        };
      }
      case "outlook": {
        const colour = { base: STATUS_COLOUR.held, defend: STATUS_COLOUR.cleared, target: STATUS_COLOUR.reach, out: STATUS_COLOUR.beyond };
        const f = section.facts;
        return {
          map: mapFrom({
            level: "state",
            title: `${f.who}'s path: every state's role`,
            fills: Object.fromEntries(
              section.rows.map((row) => [
                row.key,
                {
                  color: colour[row.role],
                  tip: `${row.name}: ${row.status_label} — ${fmtPct(row.share)} in ${f.year}${row.to_lead ? `, ${fmtInt(row.to_lead)} votes to lead` : row.to_quarter ? `, ${fmtInt(row.to_quarter)} votes to 25%` : ""}`,
                },
              ])
            ),
            legend: [
              { color: colour.base, label: "Base — hold" },
              { color: colour.defend, label: "Defend" },
              { color: colour.target, label: "Target" },
              { color: colour.out, label: "Out of reach" },
            ],
          }),
          chart: f.prev
            ? dumbbell(section.rows.filter((row) => row.role !== "out"), {
                title: `${f.who}'s share in the states on the path, ${f.prev} to ${f.year}`,
                fromLabel: String(f.prev),
                toLabel: String(f.year),
                line: 25,
              })
            : null,
        };
      }
      case "ground": {
        const f = section.facts;
        if (f.level === "state") {
          const scale = sequential(section.rows.map((row) => row.registered));
          return {
            map: withGround(
              mapFrom({
                level: "state",
                title: section.title,
                fills: Object.fromEntries(section.rows.map((row) => [row.key, { color: scale.colourOf(row.registered), tip: `${row.name}: ${fmtInt(row.registered)} registered, ${fmtPct(row.turnout)} turnout` }])),
                legend: [...legendFor(scale, (v) => fmtInt(v)), { color: STATUS_COLOUR.beyond, label: "Not in the set" }],
              }),
              result,
              "not in the set"
            ),
            chart: null,
          };
        }
        return {
          map: byStateMap(section.rows, {
            result,
            rest: "none in the set",
            title: `Where the ${fmtInt(f.size)} are, state by state`,
            measure: (inState) => inState.length,
            format: (v) => fmtInt(v),
            tip: (entry) => `${entry.state}: ${fmtInt(entry.rows.length)} of the ${fmtInt(f.size)} ${LEVEL_WORDS[f.level].many}, ${fmtInt(entry.rows.reduce((total, row) => total + (row.registered ?? 0), 0))} registered voters`,
            note: f.level === "unit" || f.level === "ward" ? "Estimated below the state." : null,
          }),
          chart: null,
        };
      }
      case "research": {
        const stateSection = result.sections.find((entry) => entry.columns?.some((column) => column.key === "average"));
        if (!stateSection) return { map: null, chart: null };
        const f = section.facts;
        const latestKey = `y${f.latestMapped}`;
        const firstKey = f.firstMapped ? `y${f.firstMapped}` : null;
        const scale = sequential(stateSection.rows.map((row) => row[latestKey]), [10, 20, 30, 45]);
        return {
          map: mapFrom({
            level: "state",
            title: `${f.short}'s share by state, ${f.latestMapped}`,
            fills: Object.fromEntries(
              stateSection.rows.map((row) => [
                row.key,
                { color: scale.colourOf(row[latestKey]), tip: `${row.name}: ${fmtPct(row[latestKey])} in ${f.latestMapped}${firstKey ? `, ${fmtPct(row[firstKey])} in ${f.firstMapped}` : ""}; carried in ${row.carriedRuns} of ${f.mappedYears.length}` },
              ])
            ),
            legend: legendFor(scale, pctUnit, "%"),
          }),
          chart: firstKey
            ? dumbbell(stateSection.rows.map((row) => ({ ...row, share_prev: row[firstKey], share: row[latestKey] })), {
                title: `${f.short}'s share, ${f.firstMapped} to ${f.latestMapped}`,
                fromLabel: String(f.firstMapped),
                toLabel: String(f.latestMapped),
                line: 25,
              })
            : null,
        };
      }
      case "national": {
        const byState = result.sections.find((entry) => entry.facts?.kind === "results");
        return { map: byState ? voteMap(result, byState) : null, chart: null };
      }
      case "governors": {
        const winners = [...new Set(section.rows.map((row) => row.current))];
        return {
          map: withGround(
            mapFrom({
              level: "state",
              title: section.rows.length === 1 ? `${section.rows[0].name}: the governor's party now` : "The governor's party now, by state",
              fills: Object.fromEntries(
                section.rows.map((row) => [row.key, { color: PARTY[row.current] ?? PARTY.OTH, tip: `${row.name}: ${row.governor}, ${row.current}${row.current !== row.elected ? ` (elected ${row.elected})` : ""}` }])
              ),
              legend: winners.map((id) => ({ color: PARTY[id] ?? PARTY.OTH, label: id })),
              note: "Party colours: here the colour is the data. The FCT has no governor.",
            }),
            result,
            "no governor — run by a federal minister"
          ),
          chart: null,
        };
      }
      case "coalition":
        return {
          map: withGround(
            mapFrom({
              level: "state",
              title: `${section.facts.partners.map((partner) => partner.id).join(" + ")} pooled, ${section.facts.year}`,
              fills: Object.fromEntries(
                section.rows.map((row) => [row.key, { color: STATUS_COLOUR[row.status], tip: `${row.name}: ${fmtPct(row.share)} pooled — ${row.status_label.toLowerCase()}; strongest outside, the ${row.rival}` }])
              ),
              legend: [
                { color: STATUS_COLOUR.held, label: "Carried" },
                { color: STATUS_COLOUR.cleared, label: "25% or more" },
                { color: STATUS_COLOUR.beyond, label: "Under 25%" },
              ],
            }),
            result,
            "outside this answer"
          ),
          chart: dumbbell(section.rows, {
            title: `${section.facts.biggest} alone and pooled, ${section.facts.year}`,
            fromLabel: `${section.facts.biggest} alone`,
            toLabel: "Pooled",
            line: 25,
          }),
        };
      case "scenario":
        return {
          map: scenarioMap(result, section),
          chart: dumbbell(section.rows, { title: `${result.whoName}'s share, 2023 and after the swing`, fromLabel: "2023", toLabel: "Projected", line: 25 }),
        };
      default:
        return { map: null, chart: null };
    }
  } catch (error) {
    console.error("[ask] visual failed:", error);
    return { map: null, chart: null };
  }
}
