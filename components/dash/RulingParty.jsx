"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Info } from "lucide-react";

import { PARTY_FILL } from "./Charts";
import { cn } from "@/lib/utils";

/**
 * Who governs each state.
 *
 * ── THE WHOLE POINT IS THE TOGGLE ──────────────────────────────────────────
 * A single map of "the ruling party" is a map of one of two different facts,
 * and which one it is decides what the picture says. Since 2025 a third of the
 * federation has changed hands without an election, so the map of who won and
 * the map of who governs disagree across a large part of the country, and the
 * disagreement is the interesting part: those are governorships no voter was
 * asked about. Every count on this screen is read off the data rather than
 * written into the prose, because that gap widens every few months.
 *
 * So neither answer is hidden behind the other. The toggle names both, the
 * states that differ are marked on the map itself rather than only in a list,
 * and the seat counts move as you switch so the size of it is visible.
 */
export default function RulingParty({ rows, shapes, fct, seats, moves }) {
  const [which, setWhich] = useState("current");
  const [hovered, setHovered] = useState(null);

  const byCode = useMemo(() => new Map(rows.map((row) => [row.code, row])), [rows]);
  const total = rows.length;

  const active = hovered ? byCode.get(hovered) : null;
  const changed = new Set(moves.map((row) => row.code));
  /* Reported moves that are deliberately not on the map. Counted here so the
     note underneath cannot drift out of step with the data. */
  const rumoured = rows.filter((row) => row.rumoured).length;

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
      {/* -------------------------------------------------------------- map */}
      <div className="on-board flex min-h-[34rem] flex-col overflow-hidden rounded-dash border border-board-line bg-board">
        <header className="flex flex-wrap items-center gap-2 border-b border-board-line px-4 py-2.5">
          <div className="flex items-center gap-1 rounded-full bg-white/8 p-1">
            {[
              { id: "current", label: "Who governs now" },
              { id: "elected", label: "Who won the election" },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setWhich(option.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[0.75rem] font-bold transition-colors",
                  which === option.id ? "bg-white text-black" : "text-white/60 hover:text-white"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <span className="ml-auto text-[0.75rem] text-white/45">
            {which === "current"
              ? `${moves.length} states changed hands without an election`
              : "As declared by INEC"}
          </span>
        </header>

        <div className="relative min-h-0 flex-1 p-1.5">
          <svg
            viewBox={`0 0 ${shapes.width} ${shapes.height}`}
            className="h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Nigeria by governing party. The same list appears beside this map."
            onPointerLeave={() => setHovered(null)}
          >
            <defs>
              <pattern id="ruling-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              </pattern>
              {/* A state that changed hands is hatched on the "now" view, so the
                  difference between the two maps is legible without flipping
                  between them, and legible in greyscale. */}
              <pattern
                id="ruling-moved"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="8" height="8" fill="var(--color-apc-l)" />
                <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,0.5)" strokeWidth="3" />
              </pattern>
            </defs>

            <rect width={shapes.width} height={shapes.height} fill="url(#ruling-grid)" />

            {shapes.states.map((shape) => {
              const row = byCode.get(shape.code);
              const party = row?.[which] ?? null;
              const moved = which === "current" && changed.has(shape.code);
              const isFct = shape.code === "FCT";

              return (
                <g
                  key={shape.code}
                  onPointerEnter={() => setHovered(shape.code)}
                  className="cursor-default"
                >
                  <path
                    d={shape.d}
                    fill={
                      isFct
                        ? "var(--color-silent)"
                        : moved
                          ? "url(#ruling-moved)"
                          : (PARTY_FILL[party] ?? "var(--color-silent)")
                    }
                    stroke={hovered === shape.code ? "#ffffff" : "var(--color-board)"}
                    strokeWidth={hovered === shape.code ? 2.6 : 1.1}
                    strokeLinejoin="round"
                    className="transition-[fill] duration-300"
                  >
                    <title>
                      {`${shape.name}${
                        isFct
                          ? ", no governor"
                          : `, ${party}${moved ? `, elected ${row.elected}` : ""}`
                      }`}
                    </title>
                  </path>
                </g>
              );
            })}

            {/* ── LABELS IN THEIR OWN PASS ──────────────────────────────────
                Drawn after every shape, not inside each one. SVG paints in
                document order, so a label rendered with its own state was
                painted over by whichever neighbour came next: Plateau read
                "Pl" because Bauchi was drawn on top of the rest of it. A
                second pass costs nothing and puts every label above every
                fill, which is the only arrangement where no state can hide
                another's. */}
            {shapes.states.map((shape) => {
              const row = byCode.get(shape.code);
              const party = row?.[which] ?? null;
              const isFct = shape.code === "FCT";

              return (
                <text
                  key={`label-${shape.code}`}
                  x={shape.at[0]}
                  y={shape.at[1]}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none select-none"
                  style={{
                    fontSize: shapes.width * 0.014,
                    fontWeight: 800,
                    fill: "#ffffff",
                    paintOrder: "stroke",
                    stroke: "rgba(0,0,0,0.55)",
                    strokeWidth: shapes.width * 0.0035,
                    strokeLinejoin: "round",
                  }}
                >
                  {isFct ? "FCT" : party}
                </text>
              );
            })}
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-board-line px-4 py-2.5">
          {seats[which].map((row) => (
            <span key={row.party} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-3 rounded-full"
                style={{ background: PARTY_FILL[row.party] ?? "var(--color-silent)" }}
              />
              <span className="text-[0.75rem] font-bold text-white">{row.party}</span>
              <span className="figure text-[0.75rem] text-white/55">{row.seats}</span>
            </span>
          ))}
          <span className="figure ml-auto text-[0.6875rem] text-white/35">
            36 states, {total} governors. The FCT has none.
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------ panel */}
      <div className="flex flex-col gap-3">
        {active && (
          <section className="rounded-dash border border-dash-line bg-dash-card p-4">
            <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
              {active.state}
            </p>
            <p className="mt-1 font-display text-[1.125rem] leading-tight font-extrabold text-dash-ink">
              {active.governor}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[0.8125rem]">
              <span className="rounded-full px-2 py-0.5 text-[0.6875rem] font-bold text-white" style={{ background: PARTY_FILL[active.elected] }}>
                {active.elected}
              </span>
              {active.moved && (
                <>
                  <ArrowRight size={13} className="text-dash-muted" />
                  <span className="rounded-full px-2 py-0.5 text-[0.6875rem] font-bold text-white" style={{ background: PARTY_FILL[active.current] }}>
                    {active.current}
                  </span>
                  <span className="figure text-[0.6875rem] text-dash-muted">{active.moved.on}</span>
                </>
              )}
            </p>
            {active.moved && (
              <p className="mt-2 text-[0.75rem] leading-relaxed text-dash-muted">{active.moved.note}</p>
            )}
            {active.rumoured && (
              <p className="mt-2 rounded-dash-sm bg-amber-50 px-2.5 py-2 text-[0.75rem] leading-relaxed text-amber-900">
                {active.rumoured.note}
              </p>
            )}
          </section>
        )}

        <section className="rounded-dash border border-dash-line bg-dash-card">
          <header className="border-b border-dash-line px-4 py-3">
            <h2 className="font-display text-[0.875rem] font-extrabold text-dash-ink">
              Changed hands without an election
            </h2>
            <p className="text-[0.75rem] text-dash-muted">
              {moves.length} governorships, {moves.length * 2} seats of swing
            </p>
          </header>

          <ul className="divide-y divide-dash-line">
            {moves.map((row) => (
              <li
                key={row.code}
                onMouseEnter={() => setHovered(row.code)}
                onMouseLeave={() => setHovered(null)}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-2.5"
              >
                <span className="text-[0.8125rem] font-bold text-dash-ink">{row.state}</span>
                <span className="figure text-[0.75rem] text-dash-muted">
                  {row.elected} to {row.current}
                </span>
                <span className="figure ml-auto text-[0.6875rem] text-dash-muted">{row.moved.on}</span>
              </li>
            ))}
          </ul>

          <p className="flex gap-2 border-t border-dash-line px-4 py-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
            <Info size={13} strokeWidth={2.5} className="mt-px shrink-0" />
            <span>
              {rumoured} more {rumoured === 1 ? "is" : "are"} widely reported and{" "}
              {rumoured === 1 ? "is" : "are"} not coloured in here. A state changes colour on
              this map when the move is settled, not when it is announced, because a wall chart that
              moves with the headlines becomes the argument instead of settling it. {fct.note}
            </span>
          </p>
        </section>
      </div>
    </div>
  );
}
