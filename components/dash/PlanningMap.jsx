"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, Layers, Loader2, RotateCcw, Users } from "lucide-react";

import { boundsOf, extentOf } from "@/lib/bbox";
import { apportion, wardCount } from "@/lib/drill";
import { ZONES } from "@/lib/forecast";
import { states2023 } from "@/lib/election2023";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The planning map.
 *
 * ── A MAP WITH NO RESULT ON IT, DELIBERATELY ───────────────────────────────
 * Every other map in this product answers "what happened". This one answers
 * "where are we going to work", and that is a different question with a
 * different failure mode: a planning map coloured by last result quietly
 * argues for fighting the previous election again. So it starts blank, and
 * the only colour on it is the territory you have chosen.
 *
 * ── WHAT SELECTION IS FOR ──────────────────────────────────────────────────
 * Choosing places is not the output. The output is the running cost of
 * covering them: how many booths, how many agents at one each, how much of the
 * national register that reaches, and what it takes to hold a quarter of the
 * vote there. A plan that names twelve states without those numbers is a wish.
 *
 * Selection survives drilling: pick three states, open one, pick four of its
 * local governments, and all seven stay in the plan.
 * ───────────────────────────────────────────────────────────────────────────
 */
const NATIONAL_REGISTER = states2023.reduce((sum, state) => sum + state.registered, 0);
const NATIONAL_BOOTHS = states2023.reduce((sum, state) => sum + state.booths, 0);

export default function PlanningMap({ shapes }) {
  const [openState, setOpenState] = useState(null);
  const [lgaShapes, setLgaShapes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(null);
  /* Keyed "LAG" for a whole state, "LAG:Ikeja" for one local government. */
  const [picked, setPicked] = useState(() => new Set());

  const byCode = useMemo(() => new Map(states2023.map((row) => [row.code, row])), []);

  useEffect(() => {
    let cancelled = false;
    if (!openState) {
      const frame = requestAnimationFrame(() => setLgaShapes(null));
      return () => cancelAnimationFrame(frame);
    }
    const started = requestAnimationFrame(() => setLoading(true));
    fetch(`/geo/lga/${openState.code}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => !cancelled && setLgaShapes(data))
      .catch(() => !cancelled && setLgaShapes(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      cancelAnimationFrame(started);
    };
  }, [openState]);

  const lgaRows = useMemo(() => {
    if (!openState || !lgaShapes) return [];
    const state = byCode.get(openState.code);
    return apportion({
      names: lgaShapes.lgas.map((row) => row.name),
      votes: state.votes,
      booths: state.booths,
      registered: state.registered,
      parentKey: state.code,
    });
  }, [openState, lgaShapes, byCode]);

  const inState = openState !== null;

  const frame = useMemo(() => {
    if (!inState) return { viewBox: `0 0 ${shapes.width} ${shapes.height}`, width: shapes.width };
    return boundsOf(lgaShapes?.lgas.map((row) => row.d) ?? []);
  }, [inState, shapes, lgaShapes]);

  const fits = useMemo(() => {
    const list = inState ? (lgaShapes?.lgas ?? []) : shapes.states;
    const map = new Map();
    for (const shape of list) {
      map.set(shape.name, extentOf(shape.d).width > frame.width * 0.075);
    }
    return map;
  }, [inState, lgaShapes, shapes, frame]);

  /* ---------------------------------------------------------------- totals */
  const plan = useMemo(() => {
    let registered = 0;
    let booths = 0;
    const states = new Set();
    const lgas = [];

    for (const key of picked) {
      if (!key.includes(":")) {
        const state = byCode.get(key);
        if (!state) continue;
        states.add(key);
        registered += state.registered;
        booths += state.booths;
        continue;
      }

      const [code, name] = key.split(":");
      states.add(code);
      lgas.push({ code, name });
    }

    /* Local governments are costed from the same apportionment the rest of the
       product uses, so a plan and a result never disagree about a place. */
    const byState = new Map();
    for (const row of lgas) {
      if (!byState.has(row.code)) byState.set(row.code, []);
      byState.get(row.code).push(row.name);
    }

    for (const [code, names] of byState) {
      const state = byCode.get(code);
      if (!state) continue;
      /* Only recompute for the state currently open, where we hold the real
         LGA list; otherwise fall back to the state's own average. */
      const share = names.length;
      const rows = code === openState?.code ? lgaRows : null;
      if (rows) {
        for (const name of names) {
          const row = rows.find((item) => item.name === name);
          if (!row) continue;
          registered += row.registered;
          booths += row.booths;
        }
      } else {
        const perLga = state.booths / Math.max(wardCount(code) * 2, 1);
        booths += Math.round(perLga * share);
        registered += Math.round((state.registered / Math.max(wardCount(code) * 2, 1)) * share);
      }
    }

    return {
      states: states.size,
      lgas: lgas.length,
      registered,
      booths,
      /* One agent per booth is the product's own rule: seatsPerUnit is 1. */
      agents: booths,
      reach: NATIONAL_REGISTER ? (registered / NATIONAL_REGISTER) * 100 : 0,
      boothShare: NATIONAL_BOOTHS ? (booths / NATIONAL_BOOTHS) * 100 : 0,
    };
  }, [picked, byCode, lgaRows, openState]);

  const toggle = (key) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const isPicked = (key) => picked.has(key);

  /* A state counts as covered if it is picked whole, or any of its LGAs is. */
  const statePartly = (code) =>
    !picked.has(code) && [...picked].some((key) => key.startsWith(`${code}:`));

  const exportPlan = () => {
    const lines = ["scope,state,local government,registered,booths"];
    for (const key of [...picked].sort()) {
      if (key.includes(":")) {
        const [code, name] = key.split(":");
        const row = code === openState?.code ? lgaRows.find((item) => item.name === name) : null;
        lines.push(
          `LGA,${byCode.get(code)?.name ?? code},"${name}",${row?.registered ?? ""},${row?.booths ?? ""}`
        );
      } else {
        const state = byCode.get(key);
        lines.push(`State,${state?.name ?? key},,${state?.registered ?? ""},${state?.booths ?? ""}`);
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "poll360-coverage-plan.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const list = inState ? (lgaShapes?.lgas ?? []) : shapes.states;

  return (
    <div className="grid gap-3 xl:h-[calc(100vh-12.5rem)] xl:grid-cols-[minmax(0,1fr)_21rem]">
      {/* ------------------------------------------------------------- map */}
      <div className="on-board flex min-h-[32rem] flex-col overflow-hidden rounded-dash border border-board-line bg-board xl:min-h-0">
        <nav className="flex flex-wrap items-center gap-1 border-b border-board-line px-4 py-2.5">
          <button
            type="button"
            onClick={() => setOpenState(null)}
            className={cn(
              "rounded-dash-sm px-2 py-1 text-[0.8125rem] font-semibold transition-colors",
              inState ? "text-white/55 hover:bg-white/10 hover:text-white" : "text-white"
            )}
          >
            Nigeria
          </button>
          {inState && (
            <>
              <ChevronRight size={13} className="shrink-0 text-white/35" />
              <span className="px-2 py-1 text-[0.8125rem] font-semibold text-white">
                {openState.name}
              </span>
            </>
          )}
          <span className="ml-auto text-[0.75rem] text-white/45">
            {inState ? "Tap a local government to add it" : "Tap a state to add it, twice to open it"}
          </span>
        </nav>

        <div className="relative min-h-0 flex-1 p-1.5">
          {loading && (
            <p className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-board/80 text-[0.875rem] text-white/60">
              <Loader2 size={16} className="animate-spin" />
              Loading boundaries
            </p>
          )}

          <svg
            viewBox={frame.viewBox}
            className="h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={
              inState
                ? `${openState.name} by local government. Selected places are listed beside this map.`
                : "Nigeria. Tap a state to add it to the plan."
            }
            onPointerLeave={() => setHovered(null)}
          >
            <defs>
              <pattern id="plan-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect
              x={frame.x ?? 0}
              y={frame.y ?? 0}
              width={frame.width ?? shapes.width}
              height={frame.height ?? shapes.height}
              fill="url(#plan-grid)"
            />

            {list.map((shape) => {
              const key = inState ? `${openState.code}:${shape.name}` : shape.code;
              const chosen = isPicked(key);
              const partly = !inState && statePartly(shape.code);
              const active = hovered === key;
              const unit = frame.width / 1000;

              return (
                <g
                  key={key}
                  onPointerEnter={() => setHovered(key)}
                  onClick={() => {
                    if (!inState && chosen) {
                      /* Second tap on a chosen state opens it, so one gesture
                         covers both "take the whole state" and "take part". */
                      setOpenState({ code: shape.code, name: shape.name });
                      return;
                    }
                    toggle(key);
                  }}
                  className="cursor-pointer"
                >
                  <path
                    d={shape.d}
                    fill={
                      chosen
                        ? "var(--color-red-500)"
                        : partly
                          ? "var(--color-red-900)"
                          : "var(--color-silent)"
                    }
                    stroke={active || chosen ? "#ffffff" : "var(--color-board)"}
                    strokeWidth={(active ? 2.4 : 1.1) * unit}
                    strokeLinejoin="round"
                    className="transition-[fill] duration-200"
                  >
                    <title>
                      {shape.name}
                      {chosen ? " (in the plan)" : partly ? " (partly covered)" : ""}
                    </title>
                  </path>

                  {fits.get(shape.name) && (
                    <text
                      x={shape.at[0]}
                      y={shape.at[1]}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="pointer-events-none select-none"
                      style={{
                        fontSize: frame.width * 0.017,
                        fontWeight: 700,
                        fill: chosen ? "#ffffff" : "rgba(255,255,255,0.55)",
                        paintOrder: "stroke",
                        stroke: "rgba(0,0,0,0.45)",
                        strokeWidth: frame.width * 0.004,
                        strokeLinejoin: "round",
                      }}
                    >
                      {shape.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* The running cost of the plan, along the foot. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-board-line px-4 py-2.5">
          {[
            ["States", plan.states],
            ["Local govts", plan.lgas],
            ["Booths", formatNumber(plan.booths)],
            ["Agents needed", formatNumber(plan.agents)],
          ].map(([label, value]) => (
            <span key={label} className="flex items-baseline gap-2">
              <span className="text-[0.5625rem] font-semibold tracking-[0.14em] text-white/35 uppercase">
                {label}
              </span>
              <span className="figure text-[0.75rem] font-bold text-white tabular-nums">
                {value}
              </span>
            </span>
          ))}
          <span className="figure ml-auto text-[0.625rem] text-white/35">
            One agent per booth
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------ plan */}
      <div className="flex min-h-0 flex-col gap-3">
        <section className="rounded-dash border border-dash-line bg-dash-card p-4">
          <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Register reached
          </p>
          <p className="figure mt-1.5 text-[2rem] leading-none font-bold tracking-[-0.03em] text-dash-ink tabular-nums">
            {formatShare(plan.reach)}
          </p>
          <p className="mt-1.5 text-[0.8125rem] text-dash-muted">
            {formatNumber(plan.registered)} of {formatNumber(NATIONAL_REGISTER)} voters
          </p>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-dash-bg">
            <div
              className="h-full rounded-full bg-dash-ink transition-[width] duration-300"
              style={{ width: `${Math.min(100, plan.reach)}%` }}
            />
          </div>

          <dl className="mt-4 space-y-2 border-t border-dash-line pt-3 text-[0.8125rem]">
            <div className="flex justify-between gap-3">
              <dt className="text-dash-muted">Share of all booths</dt>
              <dd className="figure font-bold text-dash-ink">{formatShare(plan.boothShare)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-dash-muted">Agents to recruit</dt>
              <dd className="figure font-bold text-dash-ink">{formatNumber(plan.agents)}</dd>
            </div>
          </dl>
        </section>

        <section className="flex min-h-0 flex-1 flex-col rounded-dash border border-dash-line bg-dash-card">
          <header className="flex items-center gap-2 border-b border-dash-line px-4 py-3">
            <Layers size={15} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
            <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">
              In the plan
            </h3>
            <span className="figure ml-auto text-[0.6875rem] text-dash-muted">{picked.size}</span>
          </header>

          {picked.size === 0 ? (
            <p className="px-4 py-8 text-center text-[0.875rem] leading-relaxed text-dash-muted">
              Nothing chosen yet. Tap a state to add it whole, or tap it twice to open it and take
              only the local governments you want.
            </p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-dash-line overflow-y-auto">
              {[...picked].sort().map((key) => {
                const [code, name] = key.split(":");
                const state = byCode.get(code);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      onMouseEnter={() => setHovered(key)}
                      onMouseLeave={() => setHovered(null)}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-dash-bg"
                    >
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full bg-red-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.8125rem] font-semibold text-dash-ink">
                          {name ?? state?.name ?? code}
                        </span>
                        {name && (
                          <span className="block text-[0.6875rem] text-dash-muted">
                            {state?.name}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[0.6875rem] text-dash-muted">remove</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <footer className="flex gap-2 border-t border-dash-line p-3">
            <button
              type="button"
              onClick={exportPlan}
              disabled={picked.size === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-dash-sm bg-dash-ink px-3 py-2.5 text-[0.8125rem] font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-40"
            >
              <Download size={14} strokeWidth={2.5} />
              Export plan
            </button>
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              disabled={picked.size === 0}
              aria-label="Clear the plan"
              className="inline-flex size-10 items-center justify-center rounded-dash-sm border border-dash-line text-dash-ink transition-colors hover:border-dash-ink disabled:opacity-40"
            >
              <RotateCcw size={15} strokeWidth={2.5} />
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}
