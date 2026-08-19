"use client";

import { PARTY_FILL } from "./Charts";
import { cn } from "@/lib/utils";

/**
 * Nigeria, on a white sheet.
 *
 * ── WHY THE MAP IS THE DASHBOARD AND NOT AN ORNAMENT ───────────────────────
 * Every admin template ever built has a sidebar, four stat cards and a line
 * chart. None of them has this. An election product's one irreplaceable object
 * is the country itself: it is how a producer picks a state to talk about, how
 * a situation room spots a region going quiet, and how anybody sees the shape
 * of a night in one look. So it is the control, not the decoration, tapping a
 * state drives every panel beside it.
 *
 * ── THE RULES COME WITH IT ─────────────────────────────────────────────────
 * A state nobody has reported from is drawn in flat paper-grey with no label:
 * an absence, not a low number. Every state that has reported carries its
 * leading party's code in type, because roughly one man in twelve cannot
 * separate the two greens in this palette by hue. LP is hatched for the same
 * reason it is hatched on the public board.
 * ───────────────────────────────────────────────────────────────────────────
 */
const SILENT_FILL = "var(--color-dash-bg)";

export default function StateMap({ shapes, leaders, selected, onSelect, className }) {
  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${shapes.width} ${shapes.height}`}
        className="w-full"
        role="img"
        aria-label="Map of Nigeria. Tap a state to filter the panels beside it. The same figures are listed in the table."
      >
        <defs>
          {/* The tie-breaker for the pair colour cannot separate: LP red
              against PDP green is invisible to the commonest colour blindness,
              so LP is drawn with a rule across it. */}
          <pattern
            id="dash-hatch-lp"
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="7" height="7" fill="var(--color-lp-l)" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" />
          </pattern>
        </defs>

        {shapes.states.map((state) => {
          const leader = leaders[state.code] ?? null;
          const active = selected === state.code;

          return (
            <g key={state.code} onClick={() => onSelect?.(active ? null : state.code)}>
              <path
                d={state.d}
                fill={
                  leader === null
                    ? SILENT_FILL
                    : leader === "LP"
                      ? "url(#dash-hatch-lp)"
                      : PARTY_FILL[leader]
                }
                stroke={active ? "var(--color-dash-ink)" : "#ffffff"}
                strokeWidth={active ? 3 : 1.5}
                strokeLinejoin="round"
                className={cn(
                  "cursor-pointer transition-opacity",
                  selected && !active ? "opacity-45" : "opacity-100"
                )}
              >
                <title>
                  {state.name}
                  {leader ? `, ${leader} leading` : ", no returns yet"}
                </title>
              </path>

              {leader && (
                <text
                  x={state.at[0]}
                  y={state.at[1]}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none font-mono select-none"
                  style={{
                    fontSize: leader.length > 3 ? 13 : 16,
                    fontWeight: 700,
                    fill: "#ffffff",
                    paintOrder: "stroke",
                    stroke: "rgba(0,0,0,0.35)",
                    strokeWidth: 3,
                    strokeLinejoin: "round",
                  }}
                >
                  {leader}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
