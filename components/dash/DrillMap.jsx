"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, MapPin } from "lucide-react";

import { PARTY_FILL } from "./Charts";
import StateLevel from "./StateLevel";
import { apportion, wardCount, unitCount, leaderOf } from "@/lib/drill";
import { allParties } from "@/lib/election2023";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Nation → state → LGA → ward → polling unit.
 *
 * ── WHERE THE MAP STOPS AND THE GRID STARTS ────────────────────────────────
 * There are real boundaries for states and for all 774 LGAs, so those two
 * levels are drawn as maps. There are none for Nigeria's 8,809 wards or its
 * 176,623 polling units, nobody has published them, so those two levels are
 * drawn as ordered grids of tiles instead.
 *
 * That is a deliberate refusal rather than a shortcut. Inventing ward outlines
 * would produce a map that looks authoritative and says something false about
 * where things are, on the one night when being wrong about that matters most.
 * A grid claims nothing about geography and still answers the question the
 * level is for: who is leading across these wards, and which have reported.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function DrillMap({ shapes, states, leaders, onClose }) {
  const [path, setPath] = useState([]); // [state, lga, ward]
  const [boundaries, setBoundaries] = useState(null); // { code, data } for one state

  const [state, lga, ward] = path;
  const level = ["nation", "state", "lga", "ward"][path.length];

  const stateData = useMemo(
    () => (state ? states.find((row) => row.code === state.code) : null),
    [state, states]
  );

  /* LGA outlines are a megabyte across all 37 states, so a state's file is
     fetched only when somebody opens that state, and the browser caches it,
     so going back into the same state a second time costs nothing.

     What arrives is stamped with the state it was fetched for. Whether the map
     is still waiting is then read off that stamp instead of being kept in a
     separate flag: a flag has to be switched on and off in the right order,
     and a cached file can beat the switch that turns it on, which leaves a
     spinner running over a map that has already drawn. A stamp cannot
     disagree with the shapes sitting next to it. */
  const stateCode = state?.code ?? null;

  useEffect(() => {
    if (!stateCode) return;
    let cancelled = false;

    fetch(`/geo/lga/${stateCode}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setBoundaries({ code: stateCode, data });
      })
      .catch(() => {
        if (!cancelled) setBoundaries({ code: stateCode, data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [stateCode]);

  /* Only ever the boundaries of the state open now: a reply for the state just
     left stays invisible, and so does one that has not landed yet. */
  const lgaShapes = boundaries?.code === stateCode ? boundaries.data : null;
  const loading = Boolean(stateCode) && boundaries?.code !== stateCode;

  /* Each level's figures are apportioned from the level above, so a drill can
     never disagree with the total it came from. */
  const lgaRows = useMemo(() => {
    if (!stateData || !lgaShapes) return [];
    return apportion({
      names: lgaShapes.lgas.map((row) => row.name),
      votes: stateData.votes,
      booths: stateData.booths,
      parentKey: stateData.code,
    });
  }, [stateData, lgaShapes]);

  const wardRows = useMemo(() => {
    if (!lga) return [];
    const parent = lgaRows.find((row) => row.name === lga.name);
    if (!parent) return [];
    const count = wardCount(lga.name);
    return apportion({
      names: Array.from({ length: count }, (_, index) => `Ward ${String(index + 1).padStart(2, "0")}`),
      votes: parent.votes,
      booths: parent.booths,
      parentKey: `${state.code}:${lga.name}`,
    });
  }, [lga, lgaRows, state]);

  const unitRows = useMemo(() => {
    if (!ward) return [];
    const parent = wardRows.find((row) => row.name === ward.name);
    if (!parent) return [];
    const key = `${state.code}:${lga.name}:${ward.name}`;
    const count = unitCount(key);
    return apportion({
      names: Array.from({ length: count }, (_, index) => `PU ${String(index + 1).padStart(3, "0")}`),
      votes: parent.votes,
      booths: parent.booths,
      parentKey: key,
    });
  }, [ward, wardRows, state, lga]);

  const crumbs = [
    { label: "Nigeria", onClick: () => setPath([]) },
    state && { label: state.name, onClick: () => setPath([state]) },
    lga && { label: lga.name, onClick: () => setPath([state, lga]) },
    ward && { label: ward.name, onClick: () => setPath([state, lga, ward]) },
  ].filter(Boolean);

  return (
    <div className="flex h-full flex-col">
      {/* ------------------------------------------------------ breadcrumb */}
      <nav
        aria-label="Where you are"
        className="flex flex-wrap items-center gap-1 border-b border-dash-line px-4 py-3 lg:px-6"
      >
        {crumbs.map((crumb, index) => (
          <span key={crumb.label} className="flex items-center gap-1">
            {index > 0 && <ChevronRight size={14} className="shrink-0 text-dash-muted" />}
            <button
              type="button"
              onClick={crumb.onClick}
              className={cn(
                "rounded-dash-sm px-2 py-1.5 text-[0.875rem] font-semibold transition-colors",
                index === crumbs.length - 1
                  ? "text-dash-ink"
                  : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
              )}
            >
              {crumb.label}
            </button>
          </span>
        ))}

        <span className="ml-auto text-[0.75rem] text-dash-muted">
          {level === "nation"
            ? "Tap a state"
            : level === "state"
              ? "Tap a local government"
              : level === "lga"
                ? "Tap a ward"
                : "Polling units"}
        </span>
      </nav>

      {/* ---------------------------------------------------------- canvas */}
      <div className="relative min-h-0 flex-1 overflow-auto p-4 lg:p-6">
        {loading && (
          <p className="absolute inset-0 flex items-center justify-center gap-2 text-[0.875rem] text-dash-muted">
            <Loader2 size={16} className="animate-spin" />
            Loading boundaries…
          </p>
        )}

        {/* ------------------------------------------------------- nation */}
        {level === "nation" && (
          <svg
            viewBox={`0 0 ${shapes.width} ${shapes.height}`}
            className="mx-auto max-h-full w-full"
            role="img"
            aria-label="Nigeria. Tap a state to open it."
          >
            {shapes.states.map((shape) => {
              const code = leaders[shape.code] ?? null;
              return (
                <g
                  key={shape.code}
                  onClick={() =>
                    setPath([{ code: shape.code, name: shape.name }])
                  }
                  className="cursor-pointer"
                >
                  <path
                    d={shape.d}
                    fill={code ? PARTY_FILL[code] : "var(--color-dash-bg)"}
                    stroke="#ffffff"
                    strokeWidth="1.4"
                    className="transition-opacity hover:opacity-80"
                  >
                    <title>{shape.name}</title>
                  </path>
                  {code && (
                    <text
                      x={shape.at[0]}
                      y={shape.at[1]}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="pointer-events-none font-mono select-none"
                      style={{
                        fontSize: code.length > 3 ? 12 : 15,
                        fontWeight: 700,
                        fill: "#ffffff",
                        paintOrder: "stroke",
                        stroke: "rgba(0,0,0,0.35)",
                        strokeWidth: 3,
                      }}
                    >
                      {code}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {/* -------------------------------------------------------- state
            Cropped to the state's own extent, labelled, and paired with a
            ranked list, see StateLevel for why all three were needed. */}
        {level === "state" && lgaShapes && (
          <StateLevel
            state={state}
            shapes={lgaShapes}
            rows={lgaRows}
            onOpen={(name) => setPath([state, { name }])}
          />
        )}

        {/* ---------------------------------------------- wards and units
            No boundaries exist below the LGA, so these are ordered grids
            rather than invented shapes. */}
        {(level === "lga" || level === "ward") && (
          <TileGrid
            rows={level === "lga" ? wardRows : unitRows}
            onSelect={
              level === "lga" ? (row) => setPath([state, lga, { name: row.name }]) : undefined
            }
            leaf={level === "ward"}
          />
        )}
      </div>

      {/* --------------------------------------------------------- summary */}
      <Summary
        level={level}
        state={stateData}
        rows={level === "nation" ? [] : level === "state" ? lgaRows : level === "lga" ? wardRows : unitRows}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function TileGrid({ rows, onSelect, leaf }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {rows.map((row) => {
        const leader = leaderOf(row.votes);
        /* Read back through the same list the array was built from, and
           tolerate a miss rather than throwing on `.id`. See ScopeMap.partyCode
           for why the presidential four is not that list on every board. */
        const code = leader === null ? null : (allParties[leader]?.id ?? null);

        return (
          <button
            key={row.name}
            type="button"
            onClick={onSelect ? () => onSelect(row) : undefined}
            className={cn(
              "rounded-dash-sm border border-dash-line p-3 text-left transition-colors",
              onSelect ? "cursor-pointer hover:border-dash-ink" : "cursor-default"
            )}
          >
            <p className="flex items-center justify-between gap-2">
              <span className="text-[0.8125rem] font-bold text-dash-ink">{row.name}</span>
              {code && (
                <span
                  className="figure rounded-full px-2 py-0.5 text-[0.625rem] font-bold text-white"
                  style={{ background: PARTY_FILL[code] }}
                >
                  {code}
                </span>
              )}
            </p>
            <p className="figure mt-2 text-[1.125rem] leading-none font-bold text-dash-ink">
              {formatNumber(row.total)}
            </p>
            <p className="mt-1 text-[0.6875rem] text-dash-muted">
              {formatNumber(row.booths)} {leaf ? "voters" : "booths"}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function Summary({ level, state, rows }) {
  if (level === "nation" || !state) {
    return (
      <p className="border-t border-dash-line px-4 py-3 text-[0.75rem] text-dash-muted lg:px-6">
        State figures are the declared 2023 results. Everything below a state is apportioned from
        them and labelled as an estimate.
      </p>
    );
  }

  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const booths = rows.reduce((sum, row) => sum + row.booths, 0);

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-dash-line px-4 py-3 lg:px-6">
      <p className="flex items-center gap-2 text-[0.8125rem] text-dash-muted">
        <MapPin size={14} strokeWidth={2.5} className="shrink-0" />
        {rows.length} {level === "state" ? "local governments" : level === "lga" ? "wards" : "polling units"}
      </p>
      <p className="text-[0.8125rem] text-dash-muted">
        Votes <span className="figure font-bold text-dash-ink">{formatNumber(total)}</span>
      </p>
      <p className="text-[0.8125rem] text-dash-muted">
        Booths <span className="figure font-bold text-dash-ink">{formatNumber(booths)}</span>
      </p>
      <p className="ml-auto text-[0.75rem] text-dash-muted">
        Apportioned from {state.name}&rsquo;s declared total of {formatNumber(state.total)}, the
        parts always add back to it.
      </p>
    </div>
  );
}
