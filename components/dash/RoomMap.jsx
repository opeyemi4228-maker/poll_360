"use client";

import { useEffect, useMemo, useState } from "react";
import { partyFill } from "@/lib/party-pattern";
import PartyPatterns from "@/components/ui/PartyPatterns";
import { Pause, Play, RotateCcw, Store } from "lucide-react";

import { PARTY_FILL } from "./Charts";
import { snapshot, parties } from "@/lib/replay";
import { COMMERCIAL_CENTRES } from "@/lib/geo";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The situation room: four dashboards over one country.
 *
 * ── THE MAP IS THE PAGE ────────────────────────────────────────────────────
 * Everywhere else in this product the map is a panel among panels. Here it is
 * the whole screen, with the four dashboards as tabs across the top and the
 * figures floating over the geography rather than beside it. A room watches
 * one thing for eleven hours; that thing should not be sharing a column with
 * a table.
 *
 * ── FOUR ENCODINGS, NOT FOUR MAPS ──────────────────────────────────────────
 * Results is categorical, every party keeps its own hue and its code is
 * printed on the state, because two of these hues are green. Voters, Turnout
 * and Clusters are magnitudes, so they take one hue light-to-dark in five
 * steps: a rainbow would invent categories that are not in the data, and five
 * swatches can be matched by eye where a gradient cannot.
 *
 * Clusters adds the commercial centres on top, because "where are the votes"
 * and "where is the trade" are the same question for a room deciding where to
 * send somebody, and neither answers it alone.
 * ───────────────────────────────────────────────────────────────────────────
 */
const LAYERS = [
  ["results", "Results", "Who leads each state, as the night runs"],
  ["register", "Voters", "How many are on the register"],
  ["turnout", "Turnout", "What share of them actually voted"],
  ["density", "Clusters", "Voter density and the commercial centres"],
];

const TICK = 220;
const HOLD = 5000;

export default function RoomMap({
  board,
  shapes,
  states,
  layer: layerProp,
  cursor: cursorProp,
  onCursor,
  onDrill,
}) {
  /* The cursor lives in the parent when one is supplied, so the map and every
     panel beside it are showing the same moment of the evening. A map at 60%
     counted next to standings at 40% would be two different nights on one
     screen. */
  const [ownCursor, setOwnCursor] = useState(board.opening);
  const cursor = cursorProp ?? ownCursor;
  const setCursor = onCursor ?? setOwnCursor;
  const [playing, setPlaying] = useState(true);

  const layer = layerProp ?? "results";
  const [hovered, setHovered] = useState(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(query.matches);
      if (query.matches) setCursor(board.events.length);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [board.events.length, setCursor]);

  const running = playing && !reduced && layer === "results";

  useEffect(() => {
    if (!running) return;
    if (cursor >= board.events.length) {
      const restart = setTimeout(() => setCursor(board.opening), HOLD);
      return () => clearTimeout(restart);
    }
    const advance = setTimeout(() => setCursor((value) => value + 1), TICK);
    return () => clearTimeout(advance);
  }, [running, cursor, board.events.length, board.opening, setCursor]);

  const view = useMemo(() => snapshot(board, cursor), [board, cursor]);
  const byCode = useMemo(() => new Map(states.map((s) => [s.code, s])), [states]);
  const results = useMemo(() => new Map(view.byState.map((r) => [r.code, r])), [view.byState]);

  const extent = useMemo(() => {
    const values = states.map((state) => valueFor(state, layer));
    return [Math.min(...values), Math.max(...values)];
  }, [states, layer]);

  const totals = useMemo(
    () => ({
      register: states.reduce((sum, s) => sum + s.registered, 0),
      booths: states.reduce((sum, s) => sum + s.booths, 0),
    }),
    [states]
  );

  const ranked = useMemo(() => {
    if (layer === "results") {
      return view.byState
        .filter((row) => row.reported)
        .sort((a, b) => b.units - a.units)
        .slice(0, 5)
        .map((row) => ({
          key: row.code,
          name: byCode.get(row.code)?.name ?? row.code,
          detail: `${parties[row.leader]?.id ?? "n/a"} · ${formatShare(row.coverage)} in`,
        }));
    }
    return [...states]
      .sort((a, b) => valueFor(b, layer) - valueFor(a, layer))
      .slice(0, 5)
      .map((state) => ({ key: state.code, name: state.name, detail: describe(state, layer) }));
  }, [view.byState, states, layer, byCode]);

  const active = hovered ? byCode.get(hovered) : null;
  const activeResult = hovered ? results.get(hovered) : null;

  return (
    <div className="flex min-h-[34rem] flex-col">
      {/* Playback only, the four dashboards are tabs in the top bar now, so
          this strip carries just the controls for the evening. */}
      {layer === "results" && (
        <div className="flex items-center gap-2 border-b border-dash-line px-4 py-3 lg:px-6">
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            disabled={reduced}
            aria-label={playing ? "Pause" : "Play"}
            className="inline-flex size-11 items-center justify-center rounded-dash-sm border-2 border-dash-line text-dash-ink transition-colors hover:border-dash-ink disabled:opacity-30"
          >
            {playing ? <Pause size={15} strokeWidth={2.5} /> : <Play size={15} strokeWidth={2.5} />}
          </button>
          <button
            type="button"
            onClick={() => setCursor(board.opening)}
            aria-label="Replay from the start"
            className="inline-flex size-11 items-center justify-center rounded-dash-sm border-2 border-dash-line text-dash-ink transition-colors hover:border-dash-ink"
          >
            <RotateCcw size={15} strokeWidth={2.5} />
          </button>
          <p className="ml-3 text-[0.8125rem] text-dash-muted">
            {LAYERS.find(([value]) => value === layer)[2]}
          </p>
        </div>
      )}

      {/* --------------------------------------------------------- the map */}
      <div className="relative flex-1 bg-dash-card">
        <svg
          viewBox={`0 0 ${shapes.width} ${shapes.height}`}
          className="h-full max-h-[38rem] w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Map of Nigeria: ${LAYERS.find(([value]) => value === layer)[2]}.`}
          onPointerLeave={() => setHovered(null)}
        >
          <defs>
            <PartyPatterns prefix="room" surface="light" />
          </defs>

          {shapes.states.map((shape) => {
            const state = byCode.get(shape.code);
            const result = results.get(shape.code);
            const leader = layer === "results" ? (result?.leader ?? null) : null;
            const code = leader === null ? null : parties[leader]?.id;

            const fill =
              layer === "results"
                ? code === null
                  ? "var(--color-dash-bg)"
                  : partyFill(code, "room", PARTY_FILL[code])
                : ramp(valueFor(state, layer), extent);

            return (
              <g
                key={shape.code}
                onPointerEnter={() => setHovered(shape.code)}
                onClick={() => (onDrill ? onDrill(shape.code) : setHovered(shape.code))}
              >
                <path
                  d={shape.d}
                  fill={fill}
                  stroke="#ffffff"
                  strokeWidth={hovered === shape.code ? 3 : 1.4}
                  strokeLinejoin="round"
                  className="cursor-crosshair transition-[fill] duration-500"
                />

                {layer === "results" && code && (
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
                      strokeLinejoin: "round",
                    }}
                  >
                    {code}
                  </text>
                )}
              </g>
            );
          })}

          {/* ------------------------------------------- commercial centres
              Only on Clusters, where the question is where the people and the
              trade actually are. Drawn as graduated circles because the
              quantity is a rank, not a measurement, and each one is labelled,
              so the size is never the only thing carrying the meaning. */}
          {layer === "density" &&
            COMMERCIAL_CENTRES.map((city) => (
              <g key={city.name} className="pointer-events-none">
                <circle
                  cx={city.x}
                  cy={city.y}
                  r={city.tier === 1 ? 9 : city.tier === 2 ? 6.5 : 4.5}
                  fill="var(--color-red-500)"
                  fillOpacity="0.85"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                {city.tier < 3 && (
                  <text
                    x={city.x}
                    y={city.y - (city.tier === 1 ? 14 : 11)}
                    textAnchor="middle"
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      fill: "var(--color-dash-ink)",
                      paintOrder: "stroke",
                      stroke: "#ffffff",
                      strokeWidth: 3.5,
                      strokeLinejoin: "round",
                    }}
                  >
                    {city.name}
                  </text>
                )}
              </g>
            ))}
        </svg>


          {layer === "results" && (
            <div className="rounded-dash border border-dash-line bg-dash-card/95 p-4 shadow-sm backdrop-blur">
              <ul className="space-y-2">
                {view.standings.map((party) => (
                  <li key={party.id} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: PARTY_FILL[party.id] }}
                    />
                    <span className="figure text-[0.8125rem] font-bold text-dash-ink">
                      {party.id}
                    </span>
                    <span className="figure ml-auto text-[0.8125rem] text-dash-muted tabular-nums">
                      {formatShare(party.share)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* The reading under the pointer. */}
        {active && (
          <div className="pointer-events-none absolute top-4 right-4 w-64 rounded-dash border border-dash-line bg-dash-card/95 p-4 shadow-sm backdrop-blur">
            <p className="font-display text-[1rem] font-extrabold text-dash-ink">{active.name}</p>
            <p className="figure mt-1 text-[0.8125rem] text-dash-muted">
              {describe(active, layer)}
            </p>
            {layer === "results" && (
              <p className="figure mt-0.5 text-[0.8125rem] text-dash-muted">
                {activeResult?.reported
                  ? `${formatShare(activeResult.coverage)} counted`
                  : "No returns yet"}
              </p>
            )}
          </div>
        )}


      {/* ------------------------------------------------------ the footer */}
      <div className="border-t border-dash-line bg-dash-card px-4 py-3 lg:px-6">
        {layer === "results" ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {parties.map((party) => (
                <li key={party.id} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: PARTY_FILL[party.id] }}
                  />
                  <span className="figure text-[0.75rem] font-bold text-dash-ink">{party.id}</span>
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full border border-dash-line bg-dash-bg"
                />
                <span className="text-[0.75rem] text-dash-muted">No returns yet</span>
              </li>
            </ul>

            <div className="flex min-w-60 flex-1 items-center gap-3">
              <input
                type="range"
                min={0}
                max={board.events.length}
                value={cursor}
                onChange={(event) => {
                  setCursor(Number(event.target.value));
                  setPlaying(false);
                }}
                aria-label="Scrub through the evening"
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-dash-bg"
                style={{ accentColor: "var(--color-dash-ink)" }}
              />
              <span className="figure shrink-0 text-[0.8125rem] font-bold text-dash-ink">
                {formatShare(view.coverage)}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <Ramp extent={extent} layer={layer} />
            {layer === "density" && (
              <p className="flex items-center gap-2 text-[0.75rem] text-dash-muted">
                <Store size={14} strokeWidth={2.5} className="shrink-0 text-red-500" />
                Commercial centres, sized by trade weight. Density is voters per polling unit from
                the register, this dataset carries no census figures, so none are shown.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ scales */

function valueFor(state, layer) {
  if (!state) return 0;
  if (layer === "register") return state.registered;
  if (layer === "turnout") return state.turnout;
  if (layer === "density") return Math.round(state.registered / Math.max(state.booths, 1));
  return 0;
}

function describe(state, layer) {
  if (!state) return "";
  if (layer === "turnout") return `${state.turnout}% turnout`;
  if (layer === "density")
    return `${formatNumber(Math.round(state.registered / Math.max(state.booths, 1)))} voters per unit`;
  return `${formatNumber(state.registered)} on the register`;
}

/**
 * One hue, light to dark, in five steps.
 *
 * A magnitude gets a sequential ramp and never a rainbow: a change of hue
 * reads as a change of category, and there are no categories in "how many
 * people live here".
 */
const STEPS = [
  "oklch(94% 0.012 265)",
  "oklch(84% 0.03 265)",
  "oklch(70% 0.055 265)",
  "oklch(52% 0.07 265)",
  "oklch(32% 0.06 265)",
];

function ramp(value, [min, max]) {
  if (max === min) return STEPS[2];
  const t = (value - min) / (max - min);
  return STEPS[Math.min(STEPS.length - 1, Math.floor(t * STEPS.length))];
}

function Ramp({ extent, layer }) {
  const [min, max] = extent;
  const format = (value) =>
    layer === "turnout" ? `${Math.round(value)}%` : formatNumber(Math.round(value));

  return (
    <div className="min-w-64 flex-1">
      <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
        {layer === "register"
          ? "People on the register"
          : layer === "turnout"
            ? "Turnout"
            : "Voters per polling unit"}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <span className="figure text-[0.75rem] text-dash-muted">{format(min)}</span>
        <div className="flex h-3 flex-1 overflow-hidden rounded-full">
          {STEPS.map((step) => (
            <span key={step} className="flex-1" style={{ background: step }} />
          ))}
        </div>
        <span className="figure text-[0.75rem] text-dash-muted">{format(max)}</span>
      </div>
    </div>
  );
}
