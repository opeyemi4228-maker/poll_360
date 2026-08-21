"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Gauge,
  Loader2,
  MapPin,
  Percent,
  Store,
  TrendingDown,
  TrendingUp,
  Users,
  Vote,
} from "lucide-react";

import TopShell from "./TopShell";
import ScopeMap, { LABEL, describe, magnitude } from "./ScopeMap";
import ScopePanel from "./ScopePanel";
import PartyBreakdown from "./PartyBreakdown";
import CoordinatorWatch from "./CoordinatorWatch";
import IncidentStream from "./IncidentStream";
import Analytics from "./Analytics";
import ElectionSwitcher from "./ElectionSwitcher";
import PlanningMap from "./PlanningMap";
import LiveRefresh from "./LiveRefresh";
import Sparkline from "./Sparkline";
import { PARTY_FILL } from "./Charts";
import { snapshot, parties } from "@/lib/replay";
import { apportion, wardCount, unitCount } from "@/lib/drill";
import { COMMERCIAL_CENTRES } from "@/lib/geo";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The situation room.
 *
 * ── ONE FRAME, FOUR LEVELS, FOUR LAYERS ────────────────────────────────────
 * The top bar never leaves. Clicking a state does not open a panel or navigate
 * anywhere, the country in the frame is replaced by the state, at the same
 * size, and the list beside it narrows from 37 states to that state's local
 * governments. Again for wards, again for polling units.
 *
 * The layer and the level are independent. Voters, Turnout and Clusters each
 * drill on their own terms and show their own statistics; they do not fall
 * back to the election result. Changing layer keeps your place, and changing
 * place keeps your layer.
 * ───────────────────────────────────────────────────────────────────────────
 */
/**
 * The eight surfaces, in three groups.
 *
 * ── WHY GROUPED AND NOT JUST LISTED ────────────────────────────────────────
 * Eight equal pills in one track is eight decisions every time somebody looks
 * up, and the tenth tab would have broken it outright. They are not eight
 * peers: four are layers on the same map, two are what the field is doing
 * right now, and two are about a day that has not happened yet. Grouping them
 * turns "which of eight" into "which of three, then which of two or four",
 * which is the difference between reading a menu and recognising a shape.
 *
 * Nothing is hidden behind a "more" control. On a desk where somebody has to
 * reach a screen inside a live broadcast, a tab that takes two clicks is a tab
 * that does not get used.
 */
const TAB_GROUPS = [
  {
    id: "count",
    label: "The count",
    tabs: [
      { value: "results", label: "Results" },
      { value: "register", label: "Voters" },
      { value: "turnout", label: "Turnout" },
      { value: "density", label: "Clusters" },
    ],
  },
  {
    id: "field",
    label: "The field",
    /* Not layers on the map: one is about people, the other about events, and
       neither fits in a choropleth. */
    tabs: [
      { value: "watch", label: "Coordinators" },
      { value: "stream", label: "Reports" },
    ],
  },
  {
    id: "ahead",
    label: "Ahead",
    /* Everything above answers "what is happening". These two answer "what
       would happen" and "where will we work". */
    tabs: [
      { value: "analytics", label: "Analytics" },
      { value: "planning", label: "Planning" },
    ],
  },
];

const TABS = TAB_GROUPS.flatMap((group) => group.tabs.map((tab) => ({ ...tab, group: group.id })));

const MAP_LAYERS = new Set(["results", "register", "turnout", "density"]);

const TICK = 220;

export default function SituationRoom({
  user,
  board,
  shapes,
  states,
  incidents = [],
  incidentCount,
  coordinators = [],
  watchSummary = { total: 0, filed: 0, located: 0, far: 0, silent: 0 },
  photos = {},
  /* The election switcher, built on the server and handed down: this is a
     client component and cannot read the cookie that names the current
     project, nor query the list. */
  projects = null,
  /* The states this election is actually fought in. Empty means the whole
     federation. */
  scopeStates = [],
}) {
  const [layer, setLayer] = useState("results");
  /**
   * The states this contest is fought in.
   *
   * ── A GOVERNORSHIP IS NOT A FEDERATION ─────────────────────────────────
   * Every project used to draw all 37 states. On an Ekiti governorship that
   * meant 36 of them sitting grey — and grey, everywhere else in this product,
   * means "nobody has reported yet". Nobody is ever going to report from Kano
   * in an Ekiti election. Not-yet and not-applicable are different facts, and
   * a board that draws them the same way is quietly wrong all night.
   */
  const inScope = useMemo(() => {
    if (!scopeStates?.length) return states;
    const wanted = new Set(scopeStates);
    return states.filter((row) => wanted.has(row.code));
  }, [states, scopeStates]);

  /* A contest in one state opens on that state. There is no country to zoom
     out to, so the map starts where the election actually is. */
  const [path, setPath] = useState(() =>
    scopeStates?.length === 1
      ? [{ code: scopeStates[0], name: states.find((r) => r.code === scopeStates[0])?.name ?? scopeStates[0] }]
      : []
  ); // [state, lga, ward]
  const [hovered, setHovered] = useState(null);
  const [picked, setPicked] = useState(null); // the jurisdiction whose full card is open
  const [lgaShapes, setLgaShapes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(board.opening);
  const [reduced, setReduced] = useState(false);

  const [state, lga, ward] = path;
  const level = ["nation", "state", "lga", "ward"][path.length];

  /* ------------------------------------------------------------ the replay */
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(query.matches);
      if (query.matches) setCursor(board.events.length);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [board.events.length]);

  useEffect(() => {
    if (reduced || cursor >= board.events.length) return;
    const timer = setTimeout(() => setCursor((value) => value + 1), TICK);
    return () => clearTimeout(timer);
  }, [reduced, cursor, board.events.length]);

  const view = useMemo(() => snapshot(board, cursor), [board, cursor]);

  /* The places a return has just landed in, the last handful of batches.
     Drives the expanding rings on the map, which is the only thing on the
     screen that answers "where is it coming from right now". */
  const pulsing = useMemo(() => {
    const recent = board.events.slice(Math.max(0, cursor - 4), cursor);
    return new Set(recent.map((event) => board.states[event.state]?.code).filter(Boolean));
  }, [board, cursor]);

  /* -------------------------------------------------------- the boundaries */
  useEffect(() => {
    let cancelled = false;
    if (!state) {
      const frame = requestAnimationFrame(() => setLgaShapes(null));
      return () => cancelAnimationFrame(frame);
    }
    const started = requestAnimationFrame(() => setLoading(true));
    fetch(`/geo/lga/${state.code}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => !cancelled && setLgaShapes(data))
      .catch(() => !cancelled && setLgaShapes(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      cancelAnimationFrame(started);
    };
  }, [state]);

  /* ------------------------------------------------------------- the rows
     Each level's figures come from the level above and always sum back to it. */
  const stateData = useMemo(
    () => (state ? states.find((row) => row.code === state.code) : null),
    [state, states]
  );

  /**
   * The states, as they stand right now.
   *
   * ── EVERY LAYER IS LIVE ────────────────────────────────────────────────
   * An earlier pass only animated Results and left the other three reading
   * the static register, which made three of the four dashboards a printed
   * table. They are all derived from the same moving snapshot now:
   *
   *   Voters   how much of the register has actually reported, the register
   *            itself does not change, but its coverage does, all evening.
   *   Turnout  votes counted against the register of the booths that have
   *            reported. It is meaningless against the whole register at 10%
   *            counted, and this is the figure a room actually quotes.
   *   Clusters votes per reporting unit, where the volume is landing right
   *            now, which moves as the cities come in late.
   *
   * A place that has not reported returns null rather than zero, so it stays
   * grey on the map: silence is not a low number.
   */
  const nationRows = useMemo(
    () =>
      inScope.map((row) => {
        const live = view.byState.find((item) => item.code === row.code);
        const reported = live?.reported ?? false;
        const boothsIn = live?.units ?? 0;

        /* One factor, applied to everything, so no two figures on this row can
           describe different amounts of the same count. */
        const factor = reported ? boothsIn / Math.max(row.booths, 1) : 0;
        const scaled = reported
          ? row.votes.map((value) => Math.round(value * factor))
          : [0, 0, 0, 0, 0];
        const scaledTotal = scaled.reduce((sum, value) => sum + value, 0);

        /* The slice of this state's register that has actually reported. */
        const registerIn = reported
          ? Math.round(row.registered * (boothsIn / Math.max(row.booths, 1)))
          : 0;

        return {
          key: row.code,
          name: row.name,
          reported,
          /* ── VOTES AND TOTAL MUST BE THE SAME COUNT ──────────────────
             This used to hand back the full declared votes alongside a total
             scaled to coverage, so any share computed as votes/total ran over
             100% mid-count and the stacked bars overflowed their track.

             Every party is now scaled by the same coverage factor and the
             total is the sum of exactly those scaled figures, so the two can
             never disagree. Scaling everyone identically also preserves the
             order of finish, which is what keeps a two-thousand-vote margin
             like Benue's from flipping as the count comes in. */
          votes: scaled,
          total: scaledTotal,
          /* Voters: the register that has reported, not the whole register. */
          registered: registerIn,
          fullRegister: row.registered,
          booths: boothsIn,
          fullBooths: row.booths,
          coverage: live?.coverage ?? 0,
          /* Turnout: against the reporting register, which is the only
             denominator that means anything mid-count. */
          turnout: registerIn > 0 ? (scaledTotal / registerIn) * 100 : 0,
          /* Clusters: votes per unit that has reported, the live density of
             where the count is actually coming from. */
          density: boothsIn > 0 ? Math.round(scaledTotal / boothsIn) : 0,
        };
      }),
    [inScope, view.byState]
  );

  const lgaRows = useMemo(() => {
    if (!stateData || !lgaShapes) return [];
    return apportion({
      names: lgaShapes.lgas.map((row) => row.name),
      votes: stateData.votes,
      booths: stateData.booths,
      registered: stateData.registered,
      parentKey: stateData.code,
    });
  }, [stateData, lgaShapes]);

  const wardRows = useMemo(() => {
    if (!lga) return [];
    const parent = lgaRows.find((row) => row.name === lga.name);
    if (!parent) return [];
    return apportion({
      names: Array.from({ length: wardCount(lga.name) }, (_, i) => `Ward ${String(i + 1).padStart(2, "0")}`),
      votes: parent.votes,
      booths: parent.booths,
      registered: parent.registered,
      parentKey: `${state.code}:${lga.name}`,
    });
  }, [lga, lgaRows, state]);

  const unitRows = useMemo(() => {
    if (!ward) return [];
    const parent = wardRows.find((row) => row.name === ward.name);
    if (!parent) return [];
    const key = `${state.code}:${lga.name}:${ward.name}`;
    return apportion({
      names: Array.from({ length: unitCount(key) }, (_, i) => `PU ${String(i + 1).padStart(3, "0")}`),
      votes: parent.votes,
      booths: parent.booths,
      registered: parent.registered,
      parentKey: key,
    });
  }, [ward, wardRows, state, lga]);

  const rows =
    level === "nation" ? nationRows : level === "state" ? lgaRows : level === "lga" ? wardRows : unitRows;

  /* ------------------------------------------------------------- the search
     Every state, always, plus the local governments of whichever state is
     open, because "go to Jigawa" and "go to Birnin Kudu once I am in Jigawa"
     are the two questions a room actually asks, and neither is easy to answer
     by hunting for a shape on a map that is also changing colour. Wards and
     units are left out on purpose: they are numbered rather than named, so
     "Ward 07" would return thirty-seven identical rows. */
  const searchItems = useMemo(() => {
    const items = inScope.map((row) => ({
      key: `state:${row.code}`,
      label: row.name,
      hint: "State",
      go: () => setPath([{ code: row.code, name: row.name }]),
    }));

    if (state) {
      for (const row of lgaRows) {
        items.push({
          key: `lga:${state.code}:${row.key ?? row.name}`,
          label: row.name,
          hint: `Local government · ${state.name}`,
          go: () => setPath([state, { name: row.name }]),
        });
      }
    }

    return items;
  }, [inScope, state, lgaRows]);

  /* Searching from Coordinators or Reports means you want to see the place, so
     the map comes back with you rather than leaving you on a tab that cannot
     show it. */
  /* Reports, counted against the place they came from, so the map can say
     "three reports from here" in the same breath as the figures. Only at
     national level: an incident carries a state, not a ward. */
  const incidentsByPlace = useMemo(() => {
    if (level !== "nation") return null;
    const index = {};
    for (const item of incidents) {
      if (!item.stateCode) continue;
      const entry = (index[item.stateCode] ??= { count: 0, worst: "INFO" });
      entry.count += 1;
      if (item.severity === "CRITICAL") entry.worst = "CRITICAL";
      else if (item.severity === "SERIOUS" && entry.worst !== "CRITICAL") entry.worst = "SERIOUS";
    }
    return index;
  }, [incidents, level]);

  const searchPick = (item) => {
    if (!MAP_LAYERS.has(layer)) setLayer("results");
    setPicked(null);
    item.go();
  };

  /* The shapes for the current level. Wards and units have no boundaries
     anywhere, so those levels are lists rather than maps, stated, not faked. */
  const mapShapes = useMemo(() => {
    if (level === "nation") return shapes;
    if (level === "state" && lgaShapes) {
      return { title: state.name, paths: lgaShapes.lgas };
    }
    return null;
  }, [level, shapes, lgaShapes, state]);

  /* -------------------------------------------------------------- summary */
  const scope = useMemo(() => {
    const registered = rows.reduce((sum, row) => sum + (row.registered ?? 0), 0);
    const votes = rows.reduce((sum, row) => sum + (row.total ?? 0), 0);
    const booths = rows.reduce((sum, row) => sum + (row.booths ?? 0), 0);
    return {
      registered,
      votes,
      booths,
      turnout: registered ? (votes / registered) * 100 : 0,
      density: booths ? Math.round(registered / booths) : 0,
    };
  }, [rows]);

  const trend = useMemo(() => {
    const points = [];
    for (let index = 1; index <= 16; index += 1) {
      points.push(snapshot(board, Math.min(Math.round((board.events.length * index) / 16), cursor)).unitsReported);
    }
    return points;
  }, [board, cursor]);

  /* A single-state contest has no country above it. Offering "Nigeria" as a
     breadcrumb would invite the reader to zoom out to 36 states that are not
     in this election, and then wonder why they are all empty. */
  const pinned = scopeStates?.length === 1;

  /**
   * ── THE TRAIL ALWAYS HAS A ROOT ──────────────────────────────────────────
   * A single-state contest has no country above it, so "Nigeria" is dropped:
   * offering it would invite the reader to zoom out to 36 states that are not
   * in this election and then wonder why they are empty.
   *
   * Dropping it left the trail with nothing in it at all until somebody
   * selected something, and four places read `crumbs.at(-1).label` on the way
   * to first paint. Opening a governorship project threw before it rendered a
   * single pixel. So the root is replaced rather than removed: in a pinned
   * contest the state itself is the top of the trail, which is also what it
   * is on the map. The array is never empty by construction.
   */
  const rootLabel = pinned
    ? (inScope[0]?.name ?? states.find((row) => row.code === scopeStates[0])?.name ?? "This election")
    : "Nigeria";

  const crumbs = [
    { label: rootLabel, go: () => setPath([]) },
    /* In a pinned contest the root already names the state, so adding it
       again would read "Ekiti / Ekiti". */
    !pinned && state && { label: state.name, go: () => setPath([state]) },
    lga && { label: lga.name, go: () => setPath([state, lga]) },
    ward && { label: ward.name, go: () => setPath([state, lga, ward]) },
  ].filter(Boolean);

  /* First click opens the place's full card; clicking the place that is
     already open drills into it. One gesture does both jobs in the order
     people actually want them: nobody drills into a state before looking at
     it, and having to hunt for a separate "open" control to see the numbers
     was the complaint. */
  const select = (shape) => {
    const key = shape.code ?? shape.key ?? shape.name;
    if (picked === key) {
      drill(shape);
      return;
    }
    setPicked(key);
  };

  const drill = (shape) => {
    setPicked(null);
    if (level === "nation") setPath([{ code: shape.code ?? shape.key, name: shape.name }]);
    else if (level === "state") setPath([state, { name: shape.name }]);
    else if (level === "lga") setPath([state, lga, { name: shape.name }]);
  };

  /* Whatever card is showing: the picked child, or the scope itself. */
  const pickedRow = picked ? rows.find((row) => (row.key ?? row.name) === picked) : null;

  const hour = new Date().getHours();
  const greeting = `Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, ${user.name.split(" ")[0]}`;

  return (
    <TopShell
      user={user}
      tabs={TABS}
      tabGroups={TAB_GROUPS}
      active={layer}
      onTab={setLayer}
      greeting={greeting}
      searchItems={searchItems}
      onSearchPick={searchPick}
      searchPlaceholder={state ? `Search ${state.name}…` : "Search a state…"}
      alerts={incidents}
      onOpenAlerts={() => setLayer("stream")}
      subtitle={
        MAP_LAYERS.has(layer)
          ? `${crumbs.at(-1).label} · ${LABEL[layer]}`
          : layer === "watch"
            ? `${watchSummary.filed} of ${watchSummary.total} coordinators reporting`
            : layer === "analytics"
              ? "Projection from the 2023 result, under your assumptions"
              : layer === "planning"
                ? "Choose the territory you can actually cover"
                : `${incidentCount ?? 0} report${incidentCount === 1 ? "" : "s"} from the field`
      }
      aside={
        /* Rendered here rather than handed in from the page: both this and
           LiveRefresh are client components, so passing a ready-made element
           across the server boundary gained nothing and made these two into an
           unkeyed array that React could not reconcile. */
        <>
          {projects && <ElectionSwitcher {...projects} />}
          <LiveRefresh seconds={15} label="Live" />
          <span className="flex items-center gap-2 rounded-full border border-dash-line bg-dash-card px-4 py-2.5 text-[0.8125rem] text-dash-muted">
            <span aria-hidden="true" className="size-2 animate-pulse-live rounded-full bg-red-500" />
            Presidential 2023
          </span>
        </>
      }
    >
      {layer === "analytics" ? (
        <Analytics />
      ) : layer === "planning" ? (
        <PlanningMap shapes={shapes} />
      ) : layer === "watch" ? (
        <CoordinatorWatch shapes={shapes} coordinators={coordinators} summary={watchSummary} />
      ) : layer === "stream" ? (
        <div className="grid gap-3 xl:h-[calc(100vh-12.5rem)] xl:grid-cols-[minmax(0,1fr)_21rem]">
          <IncidentStream incidents={incidents} photos={photos} />
          <div className="flex flex-col gap-3 xl:min-h-0 xl:overflow-y-auto">
            <div className="rounded-dash border border-dash-line bg-dash-card p-4">
              <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                Coordinators reporting
              </p>
              <p className="figure mt-1.5 text-[1.75rem] leading-none font-bold text-dash-ink">
                {formatNumber(watchSummary.filed)}
                <span className="text-[1rem] text-dash-muted">/{formatNumber(watchSummary.total)}</span>
              </p>
              <p className="mt-1.5 text-[0.75rem] text-dash-muted">
                {formatNumber(watchSummary.silent)} have not reported
              </p>
            </div>
            <div className="rounded-dash border border-dash-line bg-dash-card p-4">
              <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                How a report gets here
              </p>
              <ol className="mt-2.5 space-y-2 text-[0.8125rem] leading-relaxed text-dash-muted">
                <li>1. A coordinator files it from the booth, with a photo if there is one.</li>
                <li>2. The narrative is encrypted before it is stored.</li>
                <li>3. It appears here within seconds, decrypted only for this room.</li>
              </ol>
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* --------------------------------------------------------- metrics
          Each dashboard answers its own question. Voters, Turnout and Clusters
          describe the register and the geography, none of them reports who is
          winning, because that is the Results dashboard's job and duplicating
          it here would make three copies of one screen. */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {metricsFor({ layer, level, scope, rows, view, trend, incidentCount, place: crumbs.at(-1).label }).map(
          (metric) => (
            <Metric key={metric.label} {...metric} />
          )
        )}
      </div>

      {/* ------------------------------------------------------ map + list */}
      {/* ------------------------------------------------------ map + list
          ── THE MAP DOES NOT MOVE ────────────────────────────────────────────
          The panels beside it change length constantly: four parties or five,
          twenty local governments or twenty-nine, an incident feed that grows
          all evening. If the page scrolls as one document, every one of those
          pushes the map off screen and the reader has to hunt for it again.

          So on a desktop this region is exactly the height of what is left of
          the viewport, and each column scrolls inside itself. The map is
          always where it was a second ago, whatever the column beside it is
          doing. That is worth more than seeing one extra row without
          scrolling: re-finding a thing you were just looking at costs far more
          attention than reaching for it deliberately.

          Below xl it stacks and the page scrolls normally, because on a phone
          two independent scroll regions is a trap. */}
      <div className="mt-3 grid gap-3 xl:h-[calc(100vh-12.5rem)] xl:grid-cols-[minmax(0,1fr)_21rem]">
        {/* ── THE ONE DARK OBJECT ON A LIGHT SHEET ─────────────────────────
            The panels are working surfaces and stay white. The map is the
            instrument, and it goes dark: a saturated fill reads far better
            against near-black than against white, the country stops competing
            with the cards around it, and the eye lands here first because it
            is the only high-contrast object on the page. This is the same
            reason a trading desk is dark and its paperwork is not. */}
        <div className="on-board flex min-h-[32rem] flex-col overflow-hidden rounded-dash border border-board-line bg-board xl:min-h-0">
          {/* Breadcrumb, inside the frame, you never leave the page, so this
              is the only thing that tells you how deep you are. */}
          <nav
            aria-label="Where you are"
            className="flex flex-wrap items-center gap-1 border-b border-board-line px-4 py-2.5"
          >
            {/* Keyed by depth, not by name: Nasarawa State contains a
                Nasarawa LGA, so the labels collide the moment you drill into
                it. Position in the trail is the thing that is actually
                unique here. */}
            {crumbs.map((crumb, index) => (
              <span key={`${index}-${crumb.label}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={13} className="shrink-0 text-dash-muted" />}
                <button
                  type="button"
                  onClick={crumb.go}
                  className={cn(
                    "rounded-dash-sm px-2 py-1 text-[0.8125rem] font-semibold transition-colors",
                    index === crumbs.length - 1
                      ? "text-white"
                      : "text-white/55 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
            <span className="ml-auto text-[0.75rem] text-white/45">
              {level === "ward" ? "Polling units" : `Tap a ${unitWord(level, true)}`}
            </span>
          </nav>

          <div className="relative min-h-0 flex-1 p-1.5">
            {loading && (
              <p className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-board/80 text-[0.875rem] text-white/60">
                <Loader2 size={16} className="animate-spin" />
                Loading boundaries…
              </p>
            )}

            {mapShapes ? (
              <ScopeMap
                level={level}
                shapes={mapShapes}
                rows={rows}
                layer={layer}
                hovered={hovered}
                onHover={setHovered}
                onOpen={select}
                incidentsByPlace={incidentsByPlace}
                pulsing={level === "nation" && layer === "results" ? pulsing : null}
              />
            ) : (
              /* Wards and polling units: no boundaries exist, so a grid, it
                 claims nothing about geography and still answers the level. */
              <div className="grid h-full grid-cols-2 content-start gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
                {rows.map((row) => (
                  <button
                    key={row.name}
                    type="button"
                    onMouseEnter={() => setHovered(row.name)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => select(row)}
                    className={cn(
                      "rounded-dash-sm border p-3 text-left transition-colors",
                      hovered === row.name ? "border-white bg-white/10" : "border-board-line",
                      level === "lga" ? "cursor-pointer" : "cursor-default"
                    )}
                  >
                    <p className="text-[0.8125rem] font-bold text-white">{row.name}</p>
                    <p className="figure mt-1.5 text-[1.125rem] leading-none font-bold text-white">
                      {layer === "turnout"
                        ? formatShare(row.turnout)
                        : formatNumber(magnitude(row, layer))}
                    </p>
                    <p className="mt-1 truncate text-[0.6875rem] text-white/45">
                      {describe(row, layer)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── THE TELEMETRY STRIP ────────────────────────────────────────
              A readout along the foot of the instrument: what is on screen,
              how much of it has spoken, how many places are still silent, and
              the clock. All monospaced and all fixed-width, so nothing shifts
              as the digits roll, the strip should be readable out of the
              corner of the eye without ever pulling it. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-board-line px-4 py-2.5">
            <Readout label="Scope" value={crumbs.at(-1).label} />
            <Readout label="Showing" value={LABEL[layer]} />
            <Readout label="In" value={formatShare(view.coverage)} />
            <Readout
              label="Silent"
              value={`${view.byState.filter((row) => !row.reported).length}`}
              tone={view.byState.some((row) => !row.reported) ? "warn" : "ok"}
            />
            <Readout label="Units" value={formatNumber(view.unitsReported)} />
            <span className="ml-auto flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  cursor < board.events.length ? "animate-pulse-live bg-red-500" : "bg-white/40"
                )}
              />
              <span className="figure text-[0.6875rem] text-white/55 tabular-nums">
                {cursor < board.events.length ? "COLLATING" : "COMPLETE"}
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          {/* The contest, in full, for whatever is selected, every party,
              not just the one that is winning. */}
          <PartyBreakdown
            place={pickedRow?.name ?? crumbs.at(-1).label}
            level={pickedRow ? childWord(level) : levelWord(level)}
            row={
              pickedRow ?? {
                votes: rows.reduce(
                  (sum, row) => sum.map((value, i) => value + (row.votes?.[i] ?? 0)),
                  [0, 0, 0, 0, 0]
                ),
                registered: scope.registered,
                turnout: scope.turnout,
                booths: scope.booths,
              }
            }
            coverage={level === "nation" && !pickedRow ? view.coverage : undefined}
          />

          <ScopePanel
            title={titleFor(level)}
            rows={rows}
            layer={layer}
            hovered={hovered}
            onHover={setHovered}
            onOpen={select}
            canOpen={level !== "ward"}
          />

          <SidePanel
            layer={layer}
            level={level}
            rows={rows}
            view={view}
            scope={scope}
            onHover={setHovered}
          />
        </div>
      </div>
      </>
      )}
    </TopShell>
  );
}

/* -------------------------------------------------------------------------- */

const titleFor = (level) =>
  level === "nation"
    ? "States"
    : level === "state"
      ? "Local governments"
      : level === "lga"
        ? "Wards"
        : "Polling units";

const levelWord = (level) =>
  level === "nation" ? "Federation" : level === "state" ? "State" : level === "lga" ? "Local government" : "Ward";

const childWord = (level) =>
  level === "nation" ? "State" : level === "state" ? "Local government" : level === "lga" ? "Ward" : "Polling unit";

const unitWord = (level, singular = false) =>
  level === "nation"
    ? singular ? "state" : "states"
    : level === "state"
      ? singular ? "local government" : "local governments"
      : level === "lga"
        ? singular ? "ward" : "wards"
        : "polling units";

function Metric({ icon: Icon, label, value, foot, spark, tone = "ink", small = false }) {
  return (
    <div className="rounded-dash border border-dash-line bg-dash-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon size={14} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
        <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
          {label}
        </p>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <p
          className={cn(
            "figure leading-none font-bold tracking-[-0.03em] tabular-nums",
            small ? "truncate text-[1.0625rem]" : "text-[1.5rem]",
            tone === "red" ? "text-red-600" : "text-dash-ink"
          )}
        >
          {value}
        </p>
        {spark && <Sparkline values={spark} tone={tone} />}
      </div>
      <p className="mt-1 truncate text-[0.6875rem] text-dash-muted">{foot}</p>
    </div>
  );
}

/* -------------------------------------------------------- per-layer metrics */

/**
 * The four figures each dashboard leads with.
 *
 * Written out per layer rather than parameterised, because the interesting
 * part is exactly what differs: the Voters dashboard cares about how many
 * people can vote and how thinly they are spread, and cares not at all who is
 * ahead. Sharing one metric row across all four is what made three of them
 * look like weaker copies of the first.
 */
function metricsFor({ layer, level, scope, rows, view, trend, incidentCount, place }) {
  const most = (key) => [...rows].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))[0];
  const least = (key) => [...rows].sort((a, b) => (a[key] ?? 0) - (b[key] ?? 0))[0];

  if (layer === "register") {
    const top = most("registered");
    return [
      { icon: Users, label: "On the register", value: formatNumber(scope.registered), foot: place },
      { icon: Gauge, label: "Polling units", value: formatNumber(scope.booths), foot: `across ${rows.length} ${unitWord(level)}` },
      { icon: Store, label: "Voters per unit", value: formatNumber(scope.density), foot: "Average across this scope" },
      { icon: TrendingUp, label: "Largest", value: top?.name ?? "n/a", foot: top ? `${formatNumber(top.registered)} registered` : "", small: true },
    ];
  }

  if (layer === "turnout") {
    const high = most("turnout");
    const low = least("turnout");
    return [
      { icon: Percent, label: "Turnout", value: formatShare(scope.turnout), foot: `${formatNumber(scope.votes)} of ${formatNumber(scope.registered)}` },
      { icon: Users, label: "Did not vote", value: formatNumber(Math.max(0, scope.registered - scope.votes)), foot: "Register minus votes cast" },
      { icon: TrendingUp, label: "Highest", value: high?.name ?? "n/a", foot: high ? formatShare(high.turnout) : "", small: true },
      { icon: TrendingDown, label: "Lowest", value: low?.name ?? "n/a", foot: low ? formatShare(low.turnout) : "", small: true },
    ];
  }

  if (layer === "density") {
    const dense = most("density");
    const sparse = least("density");
    const inScope = level === "nation" ? COMMERCIAL_CENTRES.length : null;
    return [
      { icon: Store, label: "Voters per unit", value: formatNumber(scope.density), foot: "Average across this scope" },
      { icon: TrendingUp, label: "Densest", value: dense?.name ?? "n/a", foot: dense ? `${formatNumber(dense.density)} per unit` : "", small: true },
      { icon: TrendingDown, label: "Most spread", value: sparse?.name ?? "n/a", foot: sparse ? `${formatNumber(sparse.density)} per unit` : "", small: true },
      { icon: MapPin, label: "Commercial centres", value: inScope ? formatNumber(inScope) : "n/a", foot: inScope ? "Principal markets nationwide" : "Shown at national level" },
    ];
  }

  return [
    { icon: Gauge, label: "Booths counted", value: formatShare(view.coverage), foot: `${formatNumber(view.unitsReported)} of ${formatNumber(view.booths)}`, spark: trend },
    { icon: Vote, label: "Votes counted", value: formatNumber(level === "nation" ? view.total : scope.votes), foot: place },
    { icon: TrendingUp, label: "Leading", value: view.leader?.id ?? "n/a", foot: view.standings[1] ? `by ${formatShare(view.standings[0].share - view.standings[1].share)}` : "" },
    { icon: AlertTriangle, label: "Incidents", value: formatNumber(incidentCount ?? 0), foot: incidentCount ? "Open now" : "Nothing flagged", tone: incidentCount ? "red" : "ink" },
  ];
}

/**
 * The panel under the list, which is also the layer's own.
 */
function SidePanel({ layer, level, rows, view, onHover }) {
  if (layer === "results") {
    if (level !== "nation") return null;
    return (
      <Section title="Standings">
        <ul className="space-y-3">
          {view.standings.map((party) => (
            <li key={party.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="figure text-[0.8125rem] font-bold text-dash-ink">{party.id}</span>
                <span className="figure text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                  {formatShare(party.share)}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-dash-bg">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.min(100, party.share)}%`, background: PARTY_FILL[party.id] }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Section>
    );
  }

  if (layer === "density" && level === "nation") {
    return (
      <Section title="Commercial centres" foot="Principal markets">
        <ul className="space-y-2">
          {COMMERCIAL_CENTRES.filter((city) => city.tier === 1).map((city) => (
            <li key={city.name} className="flex items-center gap-2.5">
              <Store size={13} strokeWidth={2.5} className="shrink-0 text-red-500" />
              <span className="text-[0.8125rem] font-semibold text-dash-ink">{city.name}</span>
              <span className="ml-auto truncate text-[0.6875rem] text-dash-muted">{city.note}</span>
            </li>
          ))}
        </ul>
      </Section>
    );
  }

  /* Voters and Turnout get the distribution of the thing they measure, the
     shape of the spread, which a ranked list alone does not show. */
  const key = layer === "register" ? "registered" : layer === "turnout" ? "turnout" : "density";
  const sorted = [...rows].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));
  const top = sorted.slice(0, 5);
  const max = Math.max(...sorted.map((row) => row[key] ?? 0), 1);

  return (
    <Section title={layer === "turnout" ? "Highest turnout" : "Biggest registers"}>
      <ul className="space-y-2.5">
        {top.map((row) => (
          <li
            key={row.name}
            onMouseEnter={() => onHover?.(row.key ?? row.name)}
            onMouseLeave={() => onHover?.(null)}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[0.8125rem] font-semibold text-dash-ink">{row.name}</span>
              <span className="figure shrink-0 text-[0.75rem] text-dash-muted">
                {layer === "turnout" ? formatShare(row.turnout) : formatNumber(row[key])}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-dash-bg">
              <div
                className="h-full rounded-full bg-dash-ink"
                style={{ width: `${((row[key] ?? 0) / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Section({ title, foot, children }) {
  return (
    <section className="rounded-dash border border-dash-line bg-dash-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-dash-line px-4 py-3">
        <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">{title}</h3>
        {foot && <span className="figure text-[0.6875rem] text-dash-muted">{foot}</span>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * One field of the telemetry strip.
 *
 * Fixed-width monospaced value with the label above it in small caps: the
 * layout must not move when a figure gains a digit, because a strip that
 * shuffles is a strip nobody can read peripherally, and peripheral is the
 * only way anybody reads it during a count.
 */
function Readout({ label, value, tone = "ink" }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[0.5625rem] font-semibold tracking-[0.14em] text-white/35 uppercase">
        {label}
      </span>
      <span
        className={cn(
          "figure text-[0.75rem] font-bold tabular-nums",
          tone === "warn" ? "text-amber-400" : tone === "ok" ? "text-emerald-400" : "text-white"
        )}
      >
        {value}
      </span>
    </span>
  );
}
