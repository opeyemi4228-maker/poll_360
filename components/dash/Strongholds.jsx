"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Download,
  Landmark,
  Loader2,
  ShieldCheck,
  Target,
  Trophy,
  Users,
} from "lucide-react";

import UnitMap from "./UnitMap";
import { PARTY_FILL } from "./Charts";
import { boundsOf } from "@/lib/bbox";
import { download, stamped, toCsv } from "@/lib/csv";
import { STRONGHOLDS } from "@/lib/data/strongholds-index";
import { SEATS as ADAMAWA_SEATS } from "@/lib/adamawa";
import { ruling } from "@/lib/governors";
import {
  FACTORS,
  TIERS,
  TIER_OF,
  TOP_UNITS,
  YEARS,
  ZONE_ORDER,
  decodePlace,
  decodeUnit,
  groundIn,
  readingFor,
  scorePlaces,
  seatLevelOf,
  statesOfZone,
  sumPlaces,
} from "@/lib/stronghold-map";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * Strongholds: Atiku's ground, one zone at a time, from a state down to the
 * polling unit.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE MAP, FOUR QUESTIONS
 *
 *  The rail on the left sets what the map is asked, and the map and the list
 *  under it always answer the same question about the same ground:
 *
 *    STRENGTH   where he is Primary, Secondary or Tertiary — see the levels
 *               in lib/stronghold-map.js.
 *    BIGGEST    where the 60,000 largest polling units in the country are.
 *    WON        where the polling units he carried in the chosen year are.
 *    TARGET     where registered voters, clusters, turnout and a close
 *               contest together say the next votes are.
 *
 *  The zone picks the ground; clicking a place walks into it. Everything a
 *  zone needs to draw and list its states and local governments ships with
 *  the page. Wards and polling units are fetched a state at a time, when the
 *  map opens a state or the list is asked for them.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT IS COUNTED AND WHAT IS ESTIMATED ──────────────────────────────────
 * States are the declared results. Below a state the figures are the declared
 * totals spread across the real places inside it, so they add back up to the
 * state and are an estimate about any one ward or polling unit. The note under
 * the map says so in plain words; the jargon stays in lib/strongholds.js.
 */

/* ════════════════════════════════════════════════════════════ the ground */

const STATES = STRONGHOLDS.states.map((state) => ({
  ...state,
  place: decodePlace(state.f),
  lgas: state.lgas.map((lga, index) => ({ ...lga, index, place: decodePlace(lga.f) })),
  /* Senate districts and House constituencies, each the local governments
     it is made of, added up at build time. */
  seats: Object.fromEntries(
    Object.entries(state.seats ?? {}).map(([race, list]) => [
      race,
      list.map((seat) => ({ ...seat, place: decodePlace(seat.f) })),
    ])
  ),
}));

/* Who governs each state, for the seat card. Static for the life of the page. */
const GOVERNING = ruling();

const STATE_BY_CODE = new Map(STATES.map((state) => [state.code, state]));

const LEVELS = [
  { id: "state", label: "States", one: "state" },
  { id: "lga", label: "LGAs", one: "LGA" },
  { id: "ward", label: "Wards", one: "ward" },
  { id: "unit", label: "Polling units", one: "polling unit" },
];

/* A Senate or House room lists its seats between the state and its local
   governments, because that is the order the ground is contested in. */
const levelsFor = (seatInfo) =>
  seatInfo ? [LEVELS[0], { id: "seat", label: seatInfo.label, one: seatInfo.one }, ...LEVELS.slice(1)] : LEVELS;

const EMPTY_PATH = { state: null, seat: null, lga: null, ward: null, pick: null };

/**
 * A path held inside the room's own ground — see `groundIn`.
 *
 * Every gesture on this screen goes through here, so a crumb, a list row or a
 * click on the map can never take a room holding one district out into the
 * rest of its state.
 */
function clampPath(next, fixed) {
  if (!fixed) return next;
  if (next.state && next.state !== fixed.state) return clampPath(EMPTY_PATH, fixed);

  const out = { ...next, state: fixed.state };
  if (fixed.seat) out.seat = fixed.seat.key;

  const pinnedLga = fixed.lga !== null && fixed.lga !== undefined;
  const inside = pinnedLga
    ? out.lga === fixed.lga
    : !fixed.lgas || out.lga === null || fixed.lgas.includes(out.lga);

  if (!inside) {
    out.lga = pinnedLga ? fixed.lga : null;
    out.ward = null;
    out.pick = null;
  }
  return out;
}

const LENSES = {
  strength: { label: "Strength", icon: ShieldCheck },
  top: { label: "Biggest 60,000 polling units", icon: Users },
  won: { label: "Polling units won", icon: Trophy },
  target: { label: "Where to target", icon: Target },
};

/* ── THREE LEVELS, THREE HUES ─────────────────────────────────────────────
   Green, blue and yellow rather than one green in three strengths: on the
   dark board three opacities of one hue read as "more" and "less" of the same
   thing, and a room needs to call out "the blue wards" across a table. Blue
   against yellow is the axis every common colour-vision deficiency keeps, and
   the lightness steps apart as well, so no two levels rest on hue alone. The
   name is printed beside every swatch regardless.

   Written as values rather than Tailwind's palette variables, which are only
   emitted for colours some class name uses. */
const TIER_FILL = {
  PRIMARY: "oklch(69.6% 0.17 162.5)",
  SECONDARY: "oklch(74.6% 0.16 232.7)",
  TERTIARY: "oklch(87.9% 0.169 91.6)",
};

/* The other lenses keep clear of those three, so a colour never means one
   thing on one button and another on the next. */
const FILL = {
  strength: TIER_FILL.PRIMARY,
  top: "oklch(70.2% 0.183 293.5)",
  won: PARTY_FILL.PDP,
  target: "var(--color-class-opportunity)",
};

/* Lifted clear of the board itself. The room's own silent grey sits so close
   to the board that a zone with few strongholds drew as a hole in the map. */
const SILENT = "oklch(31% 0.014 266.6)";
const TIER_RANK = Object.fromEntries(TIERS.map((tier, index) => [tier.id, index]));
const PAGE = 50;

/** More is darker, and nothing is ever drawn so faint it reads as silent. */
const ramp = (fraction) => 0.22 + 0.78 * Math.max(0, Math.min(1, fraction));

/* ═══════════════════════════════════════════════════════ fetched per state */

/* ── CACHED AS PROMISES, FOR THE LIFE OF THE PAGE ─────────────────────────
   The same state is asked for by the map and by the list, often in the same
   render. Holding the promise rather than the result means the second asker
   joins the first request instead of starting another. A failed fetch is
   forgotten so the next ask tries again. */
const bookCache = new Map();
const outlineCache = new Map();

function fetchJson(url) {
  return fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json();
  });
}

function loadBook(state) {
  if (!bookCache.has(state.number)) {
    const request = Promise.all([
      fetchJson(`/geo/units/${state.number}.json`),
      fetchJson(`/geo/strongholds/${state.number}.json`),
    ])
      .then(([tree, figures]) => buildBook(state, tree, figures))
      .catch((error) => {
        bookCache.delete(state.number);
        throw error;
      });
    bookCache.set(state.number, request);
  }
  return bookCache.get(state.number);
}

function loadOutline(code) {
  if (!outlineCache.has(code)) {
    const request = fetchJson(`/geo/lga/${code}.json`)
      .then((data) => new Map((data?.lgas ?? []).map((shape) => [shape.name, shape.d])))
      .catch((error) => {
        outlineCache.delete(code);
        throw error;
      });
    outlineCache.set(code, request);
  }
  return outlineCache.get(code);
}

/**
 * One state's wards and polling units, names joined to figures.
 *
 * Both files are in the unit tree's order, so the join is by position. A unit
 * is scored for clusters on its ward's voters per polling unit — a single
 * polling unit has no cluster of its own, and its register is already the
 * "registered voters" factor.
 */
function buildBook(state, tree, figures) {
  return {
    lgas: tree.lgas.map((lga, li) => ({
      name: lga.name,
      wards: (lga.wards ?? []).map((ward, wi) => {
        const figure = figures.lgas[li]?.w[wi];
        const place = decodePlace(figure.f);
        return {
          key: `${state.code}/${li}/${wi}`,
          name: ward.name,
          place,
          units: (ward.units ?? []).map((unit, ui) => ({
            key: `${state.code}/${li}/${wi}/${ui}`,
            name: unit.name,
            code: `${state.number}-${lga.n}-${ward.n}-${unit.n}`,
            place: { ...decodeUnit(figure.u[ui]), density: place.density },
          })),
        };
      }),
    })),
  };
}

/** Fetch whatever in `wanted` is not already held, and hold it. */
function useLoaded(wanted, load) {
  const [held, setHeld] = useState({});

  useEffect(() => {
    let live = true;
    for (const [id, arg] of wanted) {
      if (held[id]) continue;
      load(arg)
        .then((value) => live && setHeld((current) => (current[id] ? current : { ...current, [id]: value })))
        .catch(() => live && setHeld((current) => ({ ...current, [id]: { failed: true } })));
    }
    return () => {
      live = false;
    };
  }, [wanted, held, load]);

  return held;
}

/* ═════════════════════════════════════════════════════════════════ screen */

export default function Strongholds({ shapes, race = "PRESIDENTIAL", territory = null, ground = null }) {
  /* ── THE GROUND THIS ROOM HOLDS, AND THE SEATS IT IS FOUGHT OVER ─────────
     A room narrowed to a state, a district or a local government opens inside
     it and cannot walk out past it: every figure outside it is real and none
     of it is this campaign's. A Senate or House room gets its seats as a level
     of their own, between the state and its local governments. */
  const fixed = useMemo(() => groundIn(STATES, territory), [territory]);
  const seatInfo = seatLevelOf(fixed?.seat?.race ?? race);
  const seatRace = seatInfo?.race ?? null;
  const levels = useMemo(() => levelsFor(seatInfo), [seatInfo]);
  const reading = readingFor(race);

  const [year, setYear] = useState(YEARS[0]);
  const [zone, setZone] = useState(() =>
    fixed ? (STATE_BY_CODE.get(fixed.state)?.zone ?? ZONE_ORDER[0]) : ZONE_ORDER[0]
  );
  const [lens, setLens] = useState("strength");
  const [tiers, setTiers] = useState(TIERS.map((tier) => tier.id));
  const [factors, setFactors] = useState(FACTORS.map((factor) => factor.id));
  const [path, setPath] = useState(() => clampPath(EMPTY_PATH, fixed));
  const [hovered, setHovered] = useState(null);
  const [listLevel, setListLevel] = useState("state");
  const [paging, setPaging] = useState({ key: "", count: PAGE });
  /* Inside a state, a Senate or House map is coloured seat by seat or local
     government by local government. Seats first: they are what is contested. */
  const [mapBy, setMapBy] = useState("seat");

  /* The room refreshes its props every few seconds, so the ground is compared
     by what it names rather than by object, and the map only returns to it
     when the account's ground has actually changed. */
  const groundKey = fixed
    ? `${fixed.state}|${fixed.seat?.key ?? ""}|${fixed.lga ?? ""}|${fixed.lgas?.join(",") ?? ""}`
    : "";
  const [seenGround, setSeenGround] = useState(groundKey);
  if (seenGround !== groundKey) {
    setSeenGround(groundKey);
    setPath(clampPath(EMPTY_PATH, fixed));
  }

  const zoneStates = useMemo(
    () => statesOfZone(zone).map((code) => STATE_BY_CODE.get(code)).filter(Boolean),
    [zone]
  );

  const state = path.state ? STATE_BY_CODE.get(path.state) ?? null : null;
  const seat =
    state && path.seat ? ((state.seats?.[seatRace] ?? []).find((entry) => entry.key === path.seat) ?? null) : null;

  /* The local governments the map may draw inside the open state: the open
     seat's, or the room's own district where the index could not name it. */
  const allowed = useMemo(
    () => (seat ? new Set(seat.lgas) : fixed?.lgas ? new Set(fixed.lgas) : null),
    [seat, fixed]
  );

  const depth = !state ? 0 : path.lga === null ? 1 : path.ward === null ? 2 : 3;
  const bySeat = Boolean(seatRace) && depth === 1 && !seat && !fixed?.lgas && mapBy === "seat";
  const childHere = bySeat ? seatInfo.one : childWord(depth);

  /* The list can go as deep as the country goes, but never shallower than
     the map: inside Kano there is no list of states to show, and inside a
     district no list of districts. Derived rather than corrected in an
     effect, so a render never draws a level the ground on screen lacks. */
  const floorId =
    depth === 0
      ? "state"
      : depth === 1
        ? seatRace && !seat && !fixed?.lgas
          ? "seat"
          : "lga"
        : depth === 2
          ? "ward"
          : "unit";
  const floorIndex = Math.max(0, levels.findIndex((entry) => entry.id === floorId));
  const level =
    levels.findIndex((entry) => entry.id === listLevel) >= floorIndex ? listLevel : levels[floorIndex].id;

  const scopeStates = useMemo(() => (state ? [state] : zoneStates), [state, zoneStates]);

  /* ── WHAT HAS TO BE FETCHED ─────────────────────────────────────────────
     The open state's wards and polling units, for the map; and every state
     in scope when the list is asked for wards or polling units. Kept as a
     stable list of pairs so the loader's effect only re-runs when the answer
     actually changes. */
  const wantedBooks = useMemo(() => {
    const out = new Map();
    if (state) out.set(state.number, state);
    if (level === "ward" || level === "unit") {
      for (const entry of scopeStates) out.set(entry.number, entry);
    }
    return [...out.entries()];
  }, [state, level, scopeStates]);
  const books = useLoaded(wantedBooks, loadBook);

  const wantedOutlines = useMemo(() => (state ? [[state.code, state.code]] : []), [state]);
  const outlines = useLoaded(wantedOutlines, loadOutline);

  const book = state ? books[state.number] ?? null : null;
  const bookFailed = Boolean(book?.failed);
  const outline = state ? outlines[state.code] ?? null : null;
  const lga = state && path.lga !== null ? state.lgas[path.lga] : null;
  const bookLga = book && !bookFailed && path.lga !== null ? book.lgas[path.lga] : null;
  const ward = bookLga && path.ward !== null ? bookLga.wards[path.ward] ?? null : null;

  /* ── THE PLACES ON THE MAP ─────────────────────────────────────────────── */
  const mapRows = useMemo(() => {
    if (depth === 0) {
      const byCode = new Map((shapes?.states ?? []).map((shape) => [shape.code, shape.d]));
      return zoneStates.map((entry) => ({
        key: entry.code,
        name: entry.name,
        parent: zone,
        place: entry.place,
        d: byCode.get(entry.code),
        go: { state: entry.code },
      }));
    }
    if (depth === 1) {
      const drawn = state.lgas.filter((entry) => !allowed || allowed.has(entry.index));
      const outlineOf = (entry) => (outline && !outline.failed ? outline.get(entry.shape) : null);

      if (bySeat) {
        /* Every local government in its seat's colour, the seat named once,
           so the state reads as its districts without an outline of its own
           for any of them. Pressing one opens the seat. */
        const seatOf = new Map();
        for (const entry of state.seats?.[seatRace] ?? []) {
          for (const at of entry.lgas) if (!seatOf.has(at)) seatOf.set(at, entry);
        }
        return drawn.map((entry) => {
          const owner = seatOf.get(entry.index);
          return {
            key: `${state.code}/${entry.index}`,
            group: owner?.key ?? null,
            name: owner?.name ?? entry.name,
            parent: owner ? `${state.name} · includes ${entry.name}` : state.name,
            place: owner?.place ?? entry.place,
            d: outlineOf(entry),
            go: owner ? { state: state.code, seat: owner.key } : { state: state.code, lga: entry.index },
          };
        });
      }

      return drawn.map((entry) => ({
        key: `${state.code}/${entry.index}`,
        name: entry.name,
        parent: seat ? `${seat.name}, ${state.name}` : state.name,
        place: entry.place,
        d: outlineOf(entry),
        go: { state: state.code, seat: path.seat, lga: entry.index },
      }));
    }
    if (depth === 2) {
      return (bookLga?.wards ?? []).map((entry, wi) => ({
        key: entry.key,
        name: entry.name,
        parent: `${lga.name}, ${state.name}`,
        place: entry.place,
        go: { state: state.code, seat: path.seat, lga: path.lga, ward: wi },
      }));
    }
    return (ward?.units ?? []).map((entry) => ({
      key: entry.key,
      name: entry.name,
      parent: `${ward.name}, ${lga.name}`,
      code: entry.code,
      place: entry.place,
      go: { ...path, pick: entry.key },
    }));
  }, [depth, shapes, zoneStates, zone, state, outline, bookLga, lga, ward, path, allowed, bySeat, seatRace, seat]);

  const scored = useMemo(() => withScores(mapRows, lens, factors, year), [mapRows, lens, factors, year]);

  const paintOf = useMemo(() => {
    const share = (row) =>
      lens === "top"
        ? row.place.top / Math.max(1, row.place.booths)
        : row.place.wonBooths[year] / Math.max(1, row.place.booths);
    const most = Math.max(0.0001, ...scored.map(share));

    return (row) => {
      const place = row.place;
      if (lens === "strength") {
        return place.tier && tiers.includes(place.tier)
          ? { fill: TIER_FILL[place.tier], opacity: 1 }
          : { fill: SILENT, opacity: 1 };
      }
      if (lens === "target") return { fill: FILL.target, opacity: ramp(row.score / 100) };
      if (lens === "won" && place.booths === 1 && place.won[year] === null) {
        return { fill: SILENT, opacity: 0.45 };
      }
      const value = share(row);
      return value > 0 ? { fill: FILL[lens], opacity: ramp(value / most) } : { fill: SILENT, opacity: 1 };
    };
  }, [scored, lens, tiers, year]);

  /* ── THE GROUND THE RAIL COUNTS ───────────────────────────────────────── */
  const scope = useMemo(() => {
    if (depth === 0) return { name: zone, place: sumPlaces(zoneStates.map((entry) => entry.place)) };
    if (depth === 1) {
      if (seat) return { name: seat.name, place: seat.place };
      if (allowed) {
        return {
          name: fixed?.name ?? state.name,
          place: sumPlaces(state.lgas.filter((entry) => allowed.has(entry.index)).map((entry) => entry.place)),
        };
      }
      return { name: state.name, place: state.place };
    }
    if (depth === 2) return { name: lga.name, place: lga.place };
    return { name: ward?.name ?? "…", place: ward?.place ?? null };
  }, [depth, zone, zoneStates, state, seat, allowed, fixed, lga, ward]);

  /* ── THE LIST ─────────────────────────────────────────────────────────── */
  const listScope = useMemo(() => {
    const wantsBooks = level === "ward" || level === "unit";
    const pending = wantsBooks ? scopeStates.filter((entry) => !books[entry.number]).length : 0;
    const rows = pending ? [] : rowsAt({ level, scopeStates, books, path, depth, seatRace, allowed });
    return { rows, pending };
  }, [level, scopeStates, books, path, depth, seatRace, allowed]);

  const listRows = useMemo(
    () => rankFor(listScope.rows, { lens, tiers, factors, year }),
    [listScope.rows, lens, tiers, factors, year]
  );

  const listKey = `${race}|${zone}|${JSON.stringify(path)}|${level}|${lens}|${tiers}|${factors}|${year}`;
  const shown = paging.key === listKey ? paging.count : PAGE;

  /* ── GESTURES ─────────────────────────────────────────────────────────── */
  const go = (next) => {
    setPath(clampPath({ ...EMPTY_PATH, ...next }, fixed));
    setHovered(null);
  };

  const pickZone = (next) => {
    setZone(next);
    go({});
    setListLevel("state");
  };

  const pickTier = (id) => {
    if (lens !== "strength") {
      setLens("strength");
      setTiers([id]);
      return;
    }
    setTiers((current) =>
      current.includes(id)
        ? current.length === 1
          ? TIERS.map((tier) => tier.id)
          : current.filter((entry) => entry !== id)
        : TIERS.map((tier) => tier.id).filter((entry) => entry === id || current.includes(entry))
    );
  };

  const toggleFactor = (id) =>
    setFactors((current) =>
      current.includes(id)
        ? current.length === 1
          ? current
          : current.filter((entry) => entry !== id)
        : FACTORS.map((factor) => factor.id).filter((entry) => entry === id || current.includes(entry))
    );

  const openRow = (row) => {
    const target = STATE_BY_CODE.get(row.go.state);
    if (target && target.zone !== zone) setZone(target.zone);
    go(row.go);
  };

  /* A room holding less than the country starts its trail at its own ground,
     and nothing above it is offered as somewhere to go. */
  const narrower = Boolean(fixed && (fixed.seat || fixed.lgas || (fixed.lga !== null && fixed.lga !== undefined)));
  const crumbs = [
    !fixed && { label: zone, go: () => go({}) },
    state && !narrower && { label: state.name, go: () => go({ state: state.code }) },
    state &&
      (seat || fixed?.lgas) && {
        label: seat?.name ?? fixed.name,
        go: () => go({ state: state.code, seat: seat?.key ?? null }),
      },
    lga && { label: lga.name, go: () => go({ state: state.code, seat: path.seat, lga: path.lga }) },
    ward && {
      label: ward.name,
      go: () => go({ state: state.code, seat: path.seat, lga: path.lga, ward: path.ward }),
    },
  ].filter(Boolean);

  const hoverRow =
    scored.find((row) => row.key === hovered) ??
    scored.find((row) => row.key === path.pick) ??
    null;

  /* Places on the map, counting a seat drawn across several local governments
     once. */
  const shownCount = useMemo(() => new Set(scored.map((row) => row.group ?? row.key)).size, [scored]);

  const loadingMap =
    (depth === 1 && !outline) || (depth >= 2 && !book) || (depth === 3 && !bookFailed && !ward);
  const mapFailed = (depth === 1 && outline?.failed) || (depth >= 2 && bookFailed);
  const counted = scopeStates.find((entry) => entry.counted > 0 && year === 2023);

  const exportList = () => {
    const metric = metricFor({ lens, tiers, year });
    download(
      stamped(
        `strongholds-${race.toLowerCase()}-${(fixed?.name ?? zone).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${level}`
      ),
      toCsv(listRows.map((row, index) => ({ ...row, rank: index + 1 })), [
        ["Rank", (row) => row.rank],
        ["Level", () => levels.find((entry) => entry.id === level)?.one],
        ["Name", (row) => row.name],
        ["Where", (row) => row.parent],
        ["INEC code", (row) => row.code ?? ""],
        ["Registered voters", (row) => row.place.registered],
        ["Polling units", (row) => row.place.booths],
        ["Strength", (row) => (row.place.tier ? TIER_OF[row.place.tier].label : "")],
        [`PDP share ${year}`, (row) => row.place.share[year] ?? ""],
        [`Turnout 2023`, (row) => (row.place.turnout === null ? "" : Math.round(row.place.turnout * 10) / 10)],
        [metric.label, (row) => metric.csv(row)],
      ])
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:items-start">
        {/* ═══════════════════════════════════════════════════════ the rail */}
        <aside className="flex flex-col gap-3" aria-label="What the map shows">
          <RailCard step="1" title={reading ? "Vote it reads" : "Election"}>
            <select
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="w-full rounded-dash-sm border border-dash-line bg-dash-bg px-3 py-2 text-[0.875rem] font-bold text-dash-ink"
            >
              {YEARS.map((option) => (
                <option key={option} value={option}>
                  {option} presidential · Atiku (PDP)
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[0.6875rem] leading-snug text-dash-muted">
              Changes the wins and vote shares. Strength always reads both 2019 and 2023.
            </p>
            {reading && (
              <p className="mt-2 rounded-dash-sm border border-amber-300 bg-amber-50 px-2.5 py-2 text-[0.6875rem] leading-snug text-amber-900">
                {reading}
              </p>
            )}
          </RailCard>

          {fixed ? (
            <GroundCard
              fixed={fixed}
              state={STATE_BY_CODE.get(fixed.state)}
              seatInfo={seatInfo}
              ground={ground}
              race={race}
            />
          ) : (
          <RailCard step="2" title="Region">
            <div className="grid grid-cols-2 gap-1.5">
              {ZONE_ORDER.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={zone === option}
                  onClick={() => pickZone(option)}
                  className={cn(
                    "rounded-dash-sm border px-2 py-2 text-left text-[0.75rem] leading-tight font-bold transition-colors",
                    zone === option
                      ? "border-dash-ink bg-dash-ink text-white"
                      : "border-dash-line text-dash-ink hover:border-dash-ink"
                  )}
                >
                  {option}
                  <span className={cn("figure block text-[0.625rem] font-semibold", zone === option ? "text-white/65" : "text-dash-muted")}>
                    {statesOfZone(option).length} states
                  </span>
                </button>
              ))}
            </div>
          </RailCard>
          )}

          <SeatCard race={race} state={state} seat={seat} seatInfo={seatInfo} />

          <RailCard step="3" title="Strength" active={lens === "strength"}>
            <div className="flex flex-col gap-1.5">
              {TIERS.map((tier) => {
                const on = lens === "strength" && tiers.includes(tier.id);
                const places = new Set(
                  scored.filter((row) => row.place.tier === tier.id).map((row) => row.group ?? row.key)
                ).size;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickTier(tier.id)}
                    title={tier.why}
                    className={cn(
                      "flex items-center gap-2.5 rounded-dash-sm border px-2.5 py-2 text-left transition-colors",
                      on ? "border-dash-ink bg-dash-ink/[0.04]" : "border-dash-line hover:border-dash-ink"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="size-3.5 shrink-0 rounded-[3px] border border-dash-line"
                      style={{ background: TIER_FILL[tier.id], opacity: on ? 1 : 0.3 }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.8125rem] font-bold text-dash-ink">{tier.label}</span>
                      <span className="block text-[0.6875rem] leading-snug text-dash-muted">{tier.short}</span>
                    </span>
                    <span className="figure shrink-0 text-right text-[0.6875rem] leading-tight text-dash-muted">
                      <span className="block text-[0.8125rem] font-bold text-dash-ink">
                        {scope.place ? formatNumber(scope.place.tierBooths[tier.id]) : "…"} PUs
                      </span>
                      {depth < 3 ? `${places} ${plural(childHere, places)}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[0.6875rem] leading-snug text-dash-muted">
              PUs = polling units at that level here. Click a level to show only it; click it again to
              show all three.
            </p>
          </RailCard>

          <LensButton
            step="4"
            lens="top"
            active={lens === "top"}
            onClick={() => setLens("top")}
            figure={scope.place ? formatNumber(scope.place.top) : "…"}
            line={`of the ${formatNumber(TOP_UNITS)} biggest polling units are in ${scope.name}. Each has ${formatNumber(STRONGHOLDS.threshold)}+ registered voters.`}
          />

          <LensButton
            step="5"
            lens="won"
            active={lens === "won"}
            onClick={() => setLens("won")}
            figure={scope.place ? `~${formatNumber(scope.place.wonBooths[year])}` : "…"}
            line={`polling units carried by Atiku in ${year} in ${scope.name}.`}
          />

          <LensButton
            step="6"
            lens="target"
            active={lens === "target"}
            onClick={() => setLens("target")}
            figure={null}
            line="Ranks places to win next time, on the factors you pick."
          >
            {lens === "target" && (
              <div className="mt-2.5 flex flex-col gap-1.5 border-t border-dash-line pt-2.5">
                {FACTORS.map((factor) => {
                  const on = factors.includes(factor.id);
                  return (
                    <label key={factor.id} className="flex cursor-pointer items-start gap-2" title={factor.why}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleFactor(factor.id)}
                        className="mt-0.5 accent-[var(--color-dash-ink)]"
                      />
                      <span>
                        <span className="block text-[0.75rem] font-bold text-dash-ink">{factor.label}</span>
                        <span className="block text-[0.6875rem] leading-snug text-dash-muted">{factor.why}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </LensButton>
        </aside>

        {/* ════════════════════════════════════════════════════════ the map */}
        {/* ── THE SCREEN, NOT THE RAIL, SETS ITS HEIGHT ────────────────────
            Pinned under the bar at exactly what is left of the viewport, the
            way the room's own map is: scroll the rail or the list and the map
            holds still. `--dash-top` is the bar's measured height, published
            by TopShell. On a phone it is a fixed share of the screen instead,
            so there is room left to read the list under it. */}
        <section className="on-board order-first flex h-[min(78dvh,40rem)] flex-col lg:order-none overflow-hidden rounded-dash border border-board-line bg-board lg:sticky lg:top-[calc(var(--dash-top,4.5rem)+0.75rem)] lg:h-[calc(100dvh-var(--dash-top,4.5rem)-1.5rem)] lg:min-h-[34rem]">
          <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1 border-b border-board-line px-4 py-2.5">
            {crumbs.map((crumb, index) => (
              <span key={`${index}-${crumb.label}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={13} className="shrink-0 text-white/40" />}
                <button
                  type="button"
                  onClick={crumb.go}
                  className={cn(
                    "rounded-dash-sm px-2 py-1 text-[0.8125rem] font-semibold transition-colors",
                    index === crumbs.length - 1 ? "text-white" : "text-white/55 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
            <span className="ml-auto flex items-center gap-1.5 pl-2 text-[0.75rem] text-white/55">
              {(() => {
                const Icon = LENSES[lens].icon;
                return <Icon size={13} aria-hidden="true" />;
              })()}
              {LENSES[lens].label}
              {depth < 3 ? ` · tap a ${childHere}` : ""}
            </span>
            {seatRace && depth === 1 && !seat && !fixed?.lgas && (
              <span role="group" aria-label="Colour the map by" className="flex rounded-dash-sm border border-board-line p-0.5">
                {[
                  { id: "seat", label: seatInfo.label },
                  { id: "lga", label: "LGAs" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={mapBy === option.id}
                    onClick={() => {
                      setMapBy(option.id);
                      setHovered(null);
                    }}
                    className={cn(
                      "rounded-[4px] px-2 py-1 text-[0.6875rem] font-bold transition-colors",
                      mapBy === option.id ? "bg-white text-board" : "text-white/60 hover:text-white"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </span>
            )}
          </nav>

          <div className="relative flex min-h-0 flex-1">
          {/* The drawing is laid over this box rather than sitting in it. An
              SVG sized to its width pushes its parent to its own aspect, and
              the frame then grows past the screen; laid absolute, the box's
              size is the frame's and the drawing fits inside it. */}
          <div className="relative min-h-0 min-w-0 flex-1">
            <div className="absolute inset-0 p-2 xl:p-4">
            {mapFailed ? (
              <p className="flex h-full items-center justify-center px-6 text-center text-[0.875rem] text-white/60">
                This place could not be loaded. Check the connection and open it again.
              </p>
            ) : loadingMap ? (
              <p className="flex h-full items-center justify-center gap-2 text-[0.875rem] text-white/60">
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                Loading {depth === 1 ? `${state.name}'s local governments` : "wards and polling units"}…
              </p>
            ) : depth <= 1 ? (
              <ShapeMap
                rows={scored}
                paintOf={paintOf}
                hovered={hovered}
                onHover={setHovered}
                onOpen={(row) => go(row.go)}
              />
            ) : (
              <UnitMap
                outline={lga && outline && !outline.failed && outline.get(lga.shape) ? [outline.get(lga.shape)] : []}
                parentLabel={lga?.name}
                childWord={depth === 2 ? "ward" : "polling unit"}
                tint={FILL[lens]}
                hovered={hovered}
                picked={path.pick}
                onHover={setHovered}
                onOpen={(cell) => {
                  const row = scored.find((entry) => entry.key === cell.key);
                  if (row) go(row.go);
                }}
                rows={scored.map((row) => ({
                  key: row.key,
                  name: row.name,
                  value: row.place.registered,
                  note: noteFor(row, lens, year),
                  paint: paintOf(row),
                }))}
              />
            )}
            </div>
          </div>

          {/* ── THE KEY AND THE FIGURES, BESIDE THE MAP RATHER THAN ON IT ────
              On a wide screen they get a column of their own, so no state is
              ever drawn under a card. Narrower than that the column dissolves
              (`contents`) and the two float over the corners of the map as
              overlays, because a side column would leave the map too thin. */}
          <div className="contents xl:flex xl:w-[17.5rem] xl:shrink-0 xl:flex-col xl:gap-4 xl:overflow-y-auto xl:border-l xl:border-board-line xl:p-4">
            {hoverRow ? (
              <HoverCard row={hoverRow} lens={lens} year={year} factors={factors} />
            ) : depth > 0 && scope.place?.won ? (
              <HoverCard
                row={{ name: scope.name, parent: crumbs.slice(0, -1).map((crumb) => crumb.label).reverse().join(", "), place: scope.place }}
                lens={lens}
                year={year}
                factors={factors}
                docked
              />
            ) : (
              <ScopeCard scope={scope} count={shownCount} word={childHere} />
            )}
            <Legend lens={lens} tiers={tiers} unitLevel={depth === 3} year={year} />
          </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-board-line px-4 py-2.5">
            <Strip label="Showing" value={scope.name} />
            <Strip label="Registered voters" value={scope.place ? formatNumber(scope.place.registered) : "…"} />
            <Strip label="Polling units" value={scope.place ? formatNumber(scope.place.booths) : "…"} />
            <Strip
              label="Turnout 2023"
              value={scope.place?.turnout ? formatShare(scope.place.turnout) : "—"}
            />
          </div>
        </section>
      </div>

      {/* ═══════════════════════════════════════════════════════════ the list */}
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <header className="flex flex-wrap items-center gap-3 border-b border-dash-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
              {listTitle({ lens, tiers, year, level, scope, levels })}
            </h2>
            <p className="text-[0.75rem] text-dash-muted">
              {listScope.pending
                ? "Loading…"
                : `${formatNumber(listRows.length)} ${plural(levels.find((entry) => entry.id === level).one, listRows.length)}${
                    lens === "target" ? ", highest score first" : ""
                  } · click one to open it on the map`}
            </p>
          </div>

          <div role="tablist" aria-label="List by" className="ml-auto flex flex-wrap gap-1 rounded-dash-sm border border-dash-line p-1">
            {levels.slice(floorIndex).map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={level === entry.id}
                onClick={() => setListLevel(entry.id)}
                className={cn(
                  "rounded-[5px] px-3 py-1.5 text-[0.75rem] font-bold transition-colors",
                  level === entry.id ? "bg-dash-ink text-white" : "text-dash-muted hover:text-dash-ink"
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={exportList}
            disabled={!listRows.length}
            className="flex items-center gap-1.5 rounded-dash-sm border border-dash-line px-3 py-2 text-[0.75rem] font-bold text-dash-ink transition-colors hover:border-dash-ink disabled:opacity-40"
          >
            <Download size={14} aria-hidden="true" />
            Download
          </button>
        </header>

        {listScope.pending ? (
          <p className="flex items-center gap-2 px-4 py-10 text-[0.875rem] text-dash-muted">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Loading wards and polling units for {listScope.pending}{" "}
            {plural("state", listScope.pending)}…
          </p>
        ) : listRows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[0.875rem] text-dash-muted">
            Nothing here matches. Try another level, region or button on the left.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-[0.8125rem]">
                <thead>
                  <tr className="border-b border-dash-line text-left text-[0.625rem] tracking-[0.08em] text-dash-muted uppercase">
                    <th className="w-10 py-2 pl-4 font-semibold">#</th>
                    <th className="py-2 font-semibold">Place</th>
                    <th className="py-2 text-right font-semibold">Registered</th>
                    <th className="py-2 text-right font-semibold">Polling units</th>
                    <th className="py-2 pl-4 font-semibold">Strength</th>
                    <th className="py-2 text-right font-semibold">PDP {year}</th>
                    <th className="py-2 pr-4 pl-4 text-right font-semibold">{metricFor({ lens, tiers, year }).label}</th>
                  </tr>
                </thead>
                <tbody>
                  {listRows.slice(0, shown).map((row, index) => (
                    <ListRow
                      key={row.key}
                      row={row}
                      rank={index + 1}
                      lens={lens}
                      tiers={tiers}
                      year={year}
                      open={row.key === path.pick || row.key === hovered}
                      onOpen={() => openRow(row)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {listRows.length > shown && (
              <button
                type="button"
                onClick={() => setPaging({ key: listKey, count: shown + PAGE })}
                className="w-full border-t border-dash-line px-4 py-3 text-[0.8125rem] font-bold text-dash-ink hover:bg-dash-bg"
              >
                Show {Math.min(PAGE, listRows.length - shown)} more of {formatNumber(listRows.length - shown)}
              </button>
            )}
          </>
        )}
      </section>

      <p className="px-1 text-[0.75rem] leading-relaxed text-dash-muted">
        {reading ? `${reading} ` : ""}
        {seatInfo ? `Each ${seatInfo.long}'s figures add up the local governments inside it. ` : ""}
        State results are as INEC declared them. Below a state, figures are estimates spread from
        those totals across the real LGAs, wards and polling units — good for deciding where to go,
        not a count from any one polling unit.
        {counted
          ? ` ${counted.name} 2023 uses the real result sheets for ${formatNumber(counted.counted)} polling units; one with no readable sheet is left unknown.`
          : ""}{" "}
        The biggest 60,000 are ranked across the whole country by registered voters.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ the rows */

function childWord(depth) {
  return ["state", "LGA", "ward", "polling unit"][depth];
}

function plural(word, count) {
  if (count === 1) return word;
  if (word === "LGA") return "LGAs";
  return word.endsWith("y") ? `${word.slice(0, -1)}ies` : `${word}s`;
}

/** Target scores for rows, or the rows unchanged on any other lens. */
function withScores(rows, lens, factors, year) {
  if (lens !== "target" || !rows.length) return rows;
  const scored = scorePlaces(
    rows.map((row) => row.place),
    { factors, year }
  );
  return rows.map((row, index) => ({
    ...row,
    score: scored[index].score,
    parts: scored[index].parts,
    why: scored[index].why,
  }));
}

/** Every place at one level, inside the ground on screen. */
function rowsAt({ level, scopeStates, books, path, depth, seatRace = null, allowed = null }) {
  const rows = [];

  for (const state of scopeStates) {
    if (level === "state") {
      rows.push({
        key: state.code,
        name: state.name,
        parent: state.zone,
        place: state.place,
        go: { state: state.code },
      });
      continue;
    }

    if (level === "seat") {
      for (const seat of state.seats?.[seatRace] ?? []) {
        if (path.seat && seat.key !== path.seat) continue;
        rows.push({
          key: `${state.code}~${seat.key}`,
          name: seat.name,
          parent: `${state.name} · ${seat.lgas.length} ${seat.lgas.length === 1 ? "LGA" : "LGAs"}`,
          place: seat.place,
          go: { state: state.code, seat: seat.key },
        });
      }
      continue;
    }

    if (level === "lga") {
      for (const lga of state.lgas) {
        if (depth >= 2 && lga.index !== path.lga) continue;
        if (allowed && !allowed.has(lga.index)) continue;
        rows.push({
          key: `${state.code}/${lga.index}`,
          name: lga.name,
          parent: state.name,
          place: lga.place,
          go: { state: state.code, seat: path.seat, lga: lga.index },
        });
      }
      continue;
    }

    const book = books[state.number];
    if (!book || book.failed) continue;

    book.lgas.forEach((lga, li) => {
      if (depth >= 2 && li !== path.lga) return;
      if (allowed && !allowed.has(li)) return;
      lga.wards.forEach((ward, wi) => {
        if (depth >= 3 && wi !== path.ward) return;
        if (level === "ward") {
          rows.push({
            key: ward.key,
            name: ward.name,
            parent: `${lga.name}, ${state.name}`,
            place: ward.place,
            go: { state: state.code, seat: path.seat, lga: li, ward: wi },
          });
          return;
        }
        for (const unit of ward.units) {
          rows.push({
            key: unit.key,
            name: unit.name,
            parent: `${ward.name}, ${lga.name}, ${state.name}`,
            code: unit.code,
            place: unit.place,
            go: { state: state.code, seat: path.seat, lga: li, ward: wi, pick: unit.key },
          });
        }
      });
    });
  }

  return rows;
}

/** Filter and order a list for the question the rail is asking. */
function rankFor(rows, { lens, tiers, factors, year }) {
  const byVoters = (a, b) => b.place.registered - a.place.registered;

  if (lens === "strength") {
    return rows
      .filter((row) => row.place.tier && tiers.includes(row.place.tier))
      .sort((a, b) => TIER_RANK[a.place.tier] - TIER_RANK[b.place.tier] || byVoters(a, b));
  }
  if (lens === "top") {
    return rows.filter((row) => row.place.top > 0).sort((a, b) => b.place.top - a.place.top || byVoters(a, b));
  }
  if (lens === "won") {
    return rows
      .filter((row) => row.place.wonBooths[year] > 0)
      .sort(
        (a, b) =>
          b.place.wonBooths[year] - a.place.wonBooths[year] ||
          (b.place.lead[year] ?? 0) - (a.place.lead[year] ?? 0)
      );
  }
  return withScores(rows, "target", factors, year).sort((a, b) => b.score - a.score || byVoters(a, b));
}

/** The lens's own column, for the table and the download. */
function metricFor({ lens, tiers, year }) {
  if (lens === "strength") {
    return {
      label: "Strong polling units",
      value: (row) => (row.place.booths === 1 ? null : tiers.reduce((sum, id) => sum + row.place.tierBooths[id], 0)),
      csv: (row) => (row.place.booths === 1 ? "" : tiers.reduce((sum, id) => sum + row.place.tierBooths[id], 0)),
    };
  }
  if (lens === "top") {
    return {
      label: "In the biggest 60,000",
      value: (row) => (row.place.booths === 1 ? (row.place.top ? "Yes" : "No") : row.place.top),
      csv: (row) => (row.place.booths === 1 ? (row.place.top ? "Yes" : "No") : row.place.top),
    };
  }
  if (lens === "won") {
    return {
      label: `Won in ${year}`,
      value: (row) =>
        row.place.booths === 1 ? (row.place.won[year] ? leadText(row.place.lead[year]) : "—") : row.place.wonBooths[year],
      csv: (row) => (row.place.booths === 1 ? (row.place.won[year] ? "Yes" : "No") : row.place.wonBooths[year]),
    };
  }
  return { label: "Target score", value: (row) => row.score, csv: (row) => row.score };
}

function leadText(lead) {
  if (lead === null || lead === undefined) return "—";
  return `${lead >= 0 ? "+" : "−"}${formatShare(Math.abs(lead))}`;
}

function listTitle({ lens, tiers, year, level, scope, levels = LEVELS }) {
  const where = `in ${scope.name}`;
  const what = levels.find((entry) => entry.id === level).label;
  if (lens === "strength") {
    const names = tiers.length === TIERS.length ? "Strongholds" : tiers.map((id) => TIER_OF[id].label).join(" and ");
    return `${names}: ${what} ${where}`;
  }
  if (lens === "top") return `${what} holding the biggest 60,000 polling units, ${where}`;
  if (lens === "won") return `${what} where Atiku won polling units in ${year}, ${where}`;
  return `${what} to target, ${where}`;
}

function noteFor(row, lens, year) {
  const place = row.place;
  const tier = place.tier ? TIER_OF[place.tier].label : "Not a stronghold";
  if (lens === "target") return `score ${row.score} · ${tier}`;
  if (lens === "top") {
    return place.booths === 1
      ? `${formatNumber(place.registered)} registered${place.top ? " · among the biggest 60,000" : ""}`
      : `${formatNumber(place.top)} of ${formatNumber(place.booths)} among the biggest 60,000`;
  }
  if (lens === "won") {
    return place.booths === 1
      ? place.won[year] === null
        ? "no readable result"
        : place.won[year]
          ? `won ${leadText(place.lead[year])}`
          : "lost"
      : `~${formatNumber(place.wonBooths[year])} of ${formatNumber(place.booths)} polling units won`;
  }
  return tier;
}

/* ═════════════════════════════════════════════════════════════ components */

function RailCard({ step, title, active = false, children }) {
  return (
    <div className={cn("rounded-dash border bg-dash-card p-3", active ? "border-dash-ink" : "border-dash-line")}>
      <p className="mb-2 flex items-center gap-2 text-[0.6875rem] font-bold tracking-[0.08em] text-dash-muted uppercase">
        <span className="figure flex size-4 items-center justify-center rounded-full bg-dash-well text-[0.625rem] text-dash-ink">
          {step}
        </span>
        {title}
      </p>
      {children}
    </div>
  );
}

/** The rail's second step, for a room that holds less than the country. */
function GroundCard({ fixed, state, seatInfo, ground, race }) {
  const pinnedLga = fixed.lga !== null && fixed.lga !== undefined;
  const count = pinnedLga ? 1 : (fixed.lgas?.length ?? state?.lgas.length ?? 0);
  const kind = fixed.seat
    ? `${seatInfo?.long ? seatInfo.long[0].toUpperCase() + seatInfo.long.slice(1) : "Seat"} in ${state?.name}`
    : pinnedLga
      ? `Local government in ${state?.name}`
      : `State · ${state?.zone ?? ""}`;

  return (
    <RailCard step="2" title="Your ground">
      <p className="truncate text-[0.9375rem] font-extrabold text-dash-ink">{ground ?? fixed.name}</p>
      <p className="text-[0.6875rem] text-dash-muted">
        {kind} · {count} {count === 1 ? "LGA" : "LGAs"}
      </p>
      <p className="mt-1.5 text-[0.6875rem] leading-snug text-dash-muted">
        {race === "ASSEMBLY" && pinnedLga
          ? "A House of Assembly seat follows ward lines nobody publishes, so the map shows the local government it sits inside."
          : "This account covers this ground, so the map opens here and stays inside it."}
      </p>
    </RailCard>
  );
}

/**
 * Who holds the seat on screen, where that is on record.
 *
 * The governor for a governorship room with a state open; the senator or
 * member for a Senate or House room with a seat open. Nothing at all for a
 * contest or a place with no record: an empty card would read as a vacancy.
 */
function SeatCard({ race, state, seat, seatInfo }) {
  if (race === "GOVERNORSHIP" && state) {
    const row = GOVERNING.find((entry) => entry.code === state.code);
    if (!row) return null;
    return (
      <HolderCard
        title="Governor"
        place={state.name}
        holder={row.governor}
        party={row.current}
        note={
          row.current !== row.elected
            ? `Won on the ${row.elected} ticket, now sits with the ${row.current}.`
            : `Won in ${String(row.votedOn).slice(0, 4)}.`
        }
      />
    );
  }

  if (seat && seatInfo) {
    const prefix = seatInfo.race === "SENATE" ? "SENATORIAL" : "FEDERAL";
    const held = ADAMAWA_SEATS.find((entry) => entry.territory === `${prefix}:${seat.key}`);
    return (
      <HolderCard
        title={seatInfo.race === "SENATE" ? "Senator" : "Member"}
        place={seat.name}
        holder={held?.holder ?? null}
        party={held?.party ?? null}
        note={held ? null : "Who holds this seat is not on record here yet."}
        extra={seat.shared ? "Shares a local government with another seat; its figures count all of it." : null}
      />
    );
  }

  return null;
}

function HolderCard({ title, place, holder, party, note = null, extra = null }) {
  return (
    <div className="rounded-dash border border-dash-line bg-dash-card p-3">
      <p className="mb-2 flex items-center gap-2 text-[0.6875rem] font-bold tracking-[0.08em] text-dash-muted uppercase">
        <Landmark size={13} aria-hidden="true" />
        <span className="truncate">
          {title} · {place}
        </span>
      </p>
      {holder && (
        <p className="flex items-center gap-2 text-[0.875rem] font-bold text-dash-ink">
          {party && (
            <span
              className="shrink-0 rounded-[4px] px-1.5 py-0.5 text-[0.625rem] font-bold text-white"
              style={{ background: PARTY_FILL[party] ?? "var(--color-dash-ink)" }}
            >
              {party}
            </span>
          )}
          <span className="truncate">{holder}</span>
        </p>
      )}
      {note && <p className="mt-1 text-[0.6875rem] leading-snug text-dash-muted">{note}</p>}
      {extra && <p className="mt-1 text-[0.6875rem] leading-snug text-dash-muted">{extra}</p>}
    </div>
  );
}

function LensButton({ step, lens, active, onClick, figure, line, children }) {
  const Icon = LENSES[lens].icon;
  return (
    <div className={cn("rounded-dash border bg-dash-card", active ? "border-dash-ink" : "border-dash-line")}>
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "flex w-full items-start gap-2.5 rounded-dash p-3 text-left transition-colors",
          active ? "bg-dash-ink text-white" : "hover:bg-dash-bg"
        )}
      >
        <span
          className={cn(
            "figure mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold",
            active ? "bg-white/15 text-white" : "bg-dash-well text-dash-ink"
          )}
        >
          {step}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[0.8125rem] font-bold">
            <Icon size={14} aria-hidden="true" />
            {LENSES[lens].label}
          </span>
          {figure !== null && (
            <span className="figure mt-1 block text-[1.25rem] leading-none font-extrabold">{figure}</span>
          )}
          <span className={cn("mt-1 block text-[0.6875rem] leading-snug", active ? "text-white/70" : "text-dash-muted")}>
            {line}
          </span>
        </span>
      </button>
      {children && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

/**
 * States or local governments, in their real outlines, cropped to what is drawn.
 *
 * Exported because the Overview draws the same map with its own colours:
 * `paintOf(row)` decides the fill and `describe(row)` what a screen reader
 * hears. Rows are `{ key, name, d }` plus whatever those two read.
 */
export function ShapeMap({ rows, paintOf, hovered, onHover, onOpen, describe = null }) {
  const drawn = useMemo(() => rows.filter((row) => row.d), [rows]);
  const frame = useMemo(() => boundsOf(drawn.map((row) => row.d)), [drawn]);
  const fontSize = frame.width * (drawn.length > 12 ? 0.017 : 0.021);

  /* ── NAMES THAT FIT, AND NEVER ON TOP OF EACH OTHER ─────────────────────
     Biggest shapes claim their label first; a name whose box would overlap
     one already placed is left to the hover card. Kano's forty-four local
     governments put a dozen names in one city otherwise. */
  const labels = useMemo(() => {
    const placed = [];
    const candidates = drawn
      .map((row) => {
        const box = boundsOf([row.d], 0);
        const width = row.name.length * fontSize * 0.56;
        return {
          key: row.key,
          group: row.group ?? null,
          name: row.name,
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          width,
          area: box.width * box.height,
          fits: box.width > width * 0.8,
        };
      })
      .filter((label) => label.fits)
      .sort((a, b) => b.area - a.area);

    for (const label of candidates) {
      /* A seat drawn across several local governments is named once, on the
         largest of them. */
      if (label.group && placed.some((other) => other.group === label.group)) continue;
      const clash = placed.some(
        (other) =>
          Math.abs(other.x - label.x) < (other.width + label.width) / 2 &&
          Math.abs(other.y - label.y) < fontSize * 1.2
      );
      if (!clash) placed.push(label);
    }
    return placed;
  }, [drawn, fontSize]);

  /* Hovering one local government of a seat lights the whole seat. */
  const hoveredGroup = drawn.find((row) => row.key === hovered)?.group ?? null;

  if (!drawn.length) {
    return (
      <p className="flex h-full items-center justify-center text-[0.875rem] text-white/60">No outlines to draw.</p>
    );
  }

  return (
    <svg
      viewBox={frame.viewBox}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-label={`${drawn.length} places. The same places are listed under the map.`}
      onPointerLeave={() => onHover(null)}
    >
      {drawn.map((row) => {
        const paint = paintOf(row);
        const active = hovered === row.key || (hoveredGroup !== null && row.group === hoveredGroup);
        return (
          <path
            key={row.key}
            d={row.d}
            role="button"
            tabIndex={0}
            aria-label={
              describe
                ? describe(row)
                : `${row.name}: ${row.place.tier ? TIER_OF[row.place.tier].label : "not a stronghold"}`
            }
            fill={paint.fill}
            fillOpacity={paint.opacity}
            stroke={active ? "#ffffff" : "rgba(10,13,20,0.9)"}
            strokeWidth={frame.width * (active ? 0.004 : 0.0022)}
            strokeLinejoin="round"
            className="cursor-pointer transition-[fill-opacity] focus:outline-none"
            onPointerEnter={() => onHover(row.key)}
            onFocus={() => onHover(row.key)}
            onClick={() => onOpen(row)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onOpen(row);
            }}
          />
        );
      })}
      {labels.map((label) => (
          <text
            key={`label-${label.key}`}
            x={label.x}
            y={label.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={fontSize}
            fontWeight={700}
            fill="#ffffff"
            stroke="var(--color-board)"
            strokeWidth={frame.width * 0.004}
            paintOrder="stroke"
            className="pointer-events-none select-none"
          >
            {label.name}
          </text>
        ))}
    </svg>
  );
}

function Legend({ lens, tiers, unitLevel, year }) {
  return (
    <div className="pointer-events-none absolute right-3 bottom-8 left-3 z-10 rounded-dash-sm bg-board/85 px-3 py-2 backdrop-blur-sm sm:right-auto sm:max-w-[15rem] xl:static xl:mt-auto xl:max-w-none xl:rounded-none xl:border-t xl:border-board-line xl:bg-transparent xl:px-0 xl:pt-4 xl:pb-0 xl:backdrop-blur-none">
      <p className="text-[0.625rem] font-bold tracking-[0.1em] text-white/55 uppercase">{LENSES[lens].label}</p>
      {lens === "strength" ? (
        /* A wrapping row of names over the map; the full key, one level to a
           line with what it means, only where it has a column of its own. */
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 xl:mt-2 xl:block xl:space-y-1.5">
          {TIERS.map((tier) => (
            <Swatch
              key={tier.id}
              fill={TIER_FILL[tier.id]}
              opacity={tiers.includes(tier.id) ? 1 : 0.2}
              label={tier.label}
              sub={tier.short}
            />
          ))}
          <Swatch fill={SILENT} opacity={1} label="Not a stronghold" sub="Not carried in 2019 or 2023" />
        </ul>
      ) : unitLevel && lens !== "target" ? (
        <ul className="mt-1.5 space-y-1">
          <Swatch fill={FILL[lens]} opacity={1} label={lens === "top" ? "Among the biggest 60,000" : `Won in ${year}`} />
          <Swatch fill={SILENT} opacity={1} label={lens === "top" ? "Smaller" : "Lost"} />
        </ul>
      ) : (
        <div className="mt-1.5">
          <div className="flex gap-[2px]">
            {[0, 0.25, 0.5, 0.75, 1].map((step) => (
              <span
                key={step}
                className="block h-3 w-6 rounded-[1px]"
                style={{ background: FILL[lens], opacity: ramp(step) }}
              />
            ))}
          </div>
          <p className="mt-1 flex justify-between text-[0.5625rem] text-white/50">
            <span>{lens === "target" ? "lower score" : "fewer"}</span>
            <span>{lens === "target" ? "higher" : "more"}</span>
          </p>
          {lens !== "target" && (
            <p className="mt-0.5 text-[0.5625rem] leading-tight text-white/40">
              Share of each place&rsquo;s polling units
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Swatch({ fill, opacity, label, sub = null }) {
  return (
    <li className="flex items-start gap-2 text-[0.6875rem] text-white/80">
      <span aria-hidden="true" className="relative mt-px block size-3 shrink-0 overflow-hidden rounded-[2px] bg-board-raised">
        <span className="absolute inset-0" style={{ background: fill, opacity }} />
      </span>
      <span className="leading-tight">
        <span className="block font-bold">{label}</span>
        {sub && <span className="hidden text-[0.625rem] text-white/50 xl:block">{sub}</span>}
      </span>
    </li>
  );
}

/**
 * The ground on screen, before anything is hovered.
 *
 * Docked beside the map only — as an overlay it would sit on top of the very
 * places it is summarising, so below the wide layout it is not drawn at all.
 */
function ScopeCard({ scope, count, word }) {
  const place = scope.place;
  if (!place) return null;
  const strong = TIERS.reduce((sum, tier) => sum + place.tierBooths[tier.id], 0);

  return (
    <div className="hidden xl:block">
      <p className="truncate text-[0.9375rem] font-extrabold text-white">{scope.name}</p>
      <p className="text-[0.6875rem] text-white/50">
        {count} {plural(word, count)} · hover or tap one for its figures
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-board-line pt-2.5">
        <Figure label="Registered" value={formatNumber(place.registered)} />
        <Figure label="Polling units" value={formatNumber(place.booths)} />
        <Figure label="Turnout 2023" value={place.turnout ? formatShare(place.turnout) : "—"} />
        <Figure label="Biggest 60k" value={formatNumber(place.top)} />
      </dl>

      <div className="mt-3 border-t border-board-line pt-2.5">
        <p className="flex items-baseline justify-between">
          <span className="text-[0.625rem] font-bold tracking-[0.1em] text-white/55 uppercase">
            Strong polling units
          </span>
          <span className="figure text-[0.8125rem] font-bold text-white tabular-nums">
            {formatShare((strong / Math.max(1, place.booths)) * 100)}
          </span>
        </p>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/10">
          {TIERS.map((tier) => (
            <span
              key={tier.id}
              style={{
                width: `${(place.tierBooths[tier.id] / Math.max(1, place.booths)) * 100}%`,
                background: TIER_FILL[tier.id],
              }}
            />
          ))}
        </div>
        <ul className="mt-2 space-y-1">
          {TIERS.map((tier) => (
            <li key={tier.id} className="flex items-center gap-2 text-[0.6875rem] text-white/70">
              <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: TIER_FILL[tier.id] }} />
              {tier.label}
              <span className="figure ml-auto font-bold text-white tabular-nums">
                {formatNumber(place.tierBooths[tier.id])}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function HoverCard({ row, lens, year, factors, docked = false }) {
  const place = row.place;
  const tier = place.tier ? TIER_OF[place.tier] : null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute top-3 right-3 z-10 w-[16.5rem] rounded-dash-sm border border-board-line bg-board/90 px-3.5 py-3 backdrop-blur-sm",
        "xl:static xl:w-auto xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0 xl:backdrop-blur-none",
        /* The opened place, shown while nothing is hovered: useful docked
           beside the map, and in the way when it is floating over it. */
        docked && "hidden xl:block"
      )}
    >
      <p className="truncate text-[0.9375rem] font-extrabold text-white">{row.name}</p>
      <p className="truncate text-[0.6875rem] text-white/50">
        {row.parent}
        {row.code ? ` · ${row.code}` : ""}
      </p>

      <p className="mt-2 flex items-center gap-2 text-[0.75rem] font-bold text-white">
        <span
          aria-hidden="true"
          className="relative block size-3 overflow-hidden rounded-[2px] bg-board-raised"
        >
          <span
            className="absolute inset-0"
            style={{ background: tier ? TIER_FILL[tier.id] : SILENT }}
          />
        </span>
        {tier ? tier.label : "Not a stronghold"}
      </p>
      <p className="text-[0.6875rem] leading-snug text-white/55">
        {tier
          ? tier.why
          : place.won[2023] === null
            ? "No readable 2023 result sheet here."
            : "Atiku did not carry it in 2019 or 2023."}
      </p>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-board-line pt-2.5">
        <Figure label="Registered" value={formatNumber(place.registered)} />
        {place.booths === 1 ? (
          <Figure
            label={`Won ${year}`}
            value={place.won[year] === null ? "Unknown" : place.won[year] ? "Yes" : "No"}
          />
        ) : (
          <Figure label="Polling units" value={formatNumber(place.booths)} />
        )}
        <Figure label={`PDP ${year}`} value={place.share[year] === null ? "—" : formatShare(place.share[year])} />
        <Figure label={`Margin ${year}`} value={leadText(place.lead[year])} />
        <Figure label="Turnout 2023" value={place.turnout === null ? "—" : formatShare(place.turnout)} />
        {place.booths > 1 ? (
          lens === "top" ? (
            <Figure label="In biggest 60k" value={formatNumber(place.top)} />
          ) : (
            <Figure label={`PUs won ${year}`} value={`~${formatNumber(place.wonBooths[year])}`} />
          )
        ) : (
          <Figure label="Biggest 60k" value={place.top ? "Yes" : "No"} />
        )}
      </dl>

      {lens === "target" && row.parts && (
        <div className="mt-2.5 border-t border-board-line pt-2.5">
          <p className="flex items-baseline justify-between">
            <span className="text-[0.625rem] font-bold tracking-[0.1em] text-white/55 uppercase">Target score</span>
            <span className="figure text-[1.125rem] font-extrabold text-white">{row.score}</span>
          </p>
          <ul className="mt-1.5 space-y-1">
            {FACTORS.filter((factor) => factors.includes(factor.id)).map((factor) => (
              <li key={factor.id} className="flex items-center gap-2 text-[0.625rem] text-white/60">
                <span className="w-[6.5rem] shrink-0 truncate">{factor.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${Math.round((row.parts[factor.id] ?? 0) * 100)}%`, background: FILL.target }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value }) {
  return (
    <div>
      <dt className="text-[0.5625rem] font-bold tracking-[0.08em] text-white/45 uppercase">{label}</dt>
      <dd className="figure text-[0.8125rem] font-bold text-white tabular-nums">{value}</dd>
    </div>
  );
}

function Strip({ label, value }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className="text-[0.625rem] font-bold tracking-[0.1em] text-white/45 uppercase">{label}</span>
      <span className="figure text-[0.8125rem] font-bold text-white tabular-nums">{value}</span>
    </p>
  );
}

function ListRow({ row, rank, lens, tiers, year, open, onOpen }) {
  const place = row.place;
  const tier = place.tier ? TIER_OF[place.tier] : null;
  const metric = metricFor({ lens, tiers, year }).value(row);

  return (
    <tr
      onClick={onOpen}
      className={cn(
        "cursor-pointer border-b border-dash-line/60 transition-colors last:border-0 hover:bg-dash-bg",
        open && "bg-dash-bg"
      )}
    >
      <td className="figure py-2 pl-4 text-dash-muted tabular-nums">{rank}</td>
      <td className="py-2">
        <button type="button" onClick={onOpen} className="block max-w-[22rem] text-left">
          <span className="block truncate font-bold text-dash-ink">{row.name}</span>
          <span className="block truncate text-[0.6875rem] text-dash-muted">
            {row.parent}
            {row.code ? ` · ${row.code}` : ""}
          </span>
        </button>
      </td>
      <td className="figure py-2 text-right text-dash-ink tabular-nums">{formatNumber(place.registered)}</td>
      <td className="figure py-2 text-right text-dash-muted tabular-nums">{formatNumber(place.booths)}</td>
      <td className="py-2 pl-4">
        <span className="flex items-center gap-1.5 text-dash-ink">
          <span aria-hidden="true" className="relative block size-2.5 overflow-hidden rounded-[2px] bg-dash-well">
            <span
              className="absolute inset-0"
              style={{ background: tier ? TIER_FILL[tier.id] : "transparent" }}
            />
          </span>
          {tier ? tier.label : <span className="text-dash-muted">—</span>}
        </span>
      </td>
      <td className="figure py-2 text-right text-dash-ink tabular-nums">
        {place.share[year] === null ? "—" : formatShare(place.share[year])}
      </td>
      <td className="py-2 pr-4 pl-4 text-right">
        {lens === "target" ? (
          <span className="flex items-center justify-end gap-2">
            {row.why?.length ? (
              <span className="hidden truncate text-[0.6875rem] text-dash-muted xl:inline">{row.why.join(" · ")}</span>
            ) : null}
            <span className="figure inline-block min-w-[2.25rem] rounded-dash-sm bg-dash-ink px-1.5 py-0.5 text-center text-[0.75rem] font-bold text-white tabular-nums">
              {metric}
            </span>
          </span>
        ) : (
          <span className="figure font-bold text-dash-ink tabular-nums">
            {typeof metric === "number" ? formatNumber(metric) : (metric ?? "—")}
          </span>
        )}
      </td>
    </tr>
  );
}
