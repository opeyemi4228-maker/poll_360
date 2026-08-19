"use client";

import { useState } from "react";
import { parties, SILENT, CALL_LABEL } from "@/lib/replay";
import { formatNumber, formatShare } from "@/lib/utils";

/**
 * The choropleth: Nigeria, coloured by who led where.
 *
 * ── COLOUR IS NEVER THE ONLY ENCODING ──────────────────────────────────────
 * The parties keep their own colours, APC blue, PDP green, LP red, NNPP
 * green, because a map that invents a party's colour is a map nobody in
 * Nigerian politics will read at a glance. That fidelity costs something: PDP
 * green against LP red is ΔE 3.5 under the commonest colour blindness, which
 * is to say indistinguishable, and no hex fixes it (see lib/election2023.js).
 *
 * So the fill is the fast read and never the only one:
 *   · every reporting state carries its leading party's code in type;
 *   · LP is hatched, so the failing pair separates by pattern for every
 *     reader, in a monochrome print, and under forced colours;
 *   · the tooltip names the party in words;
 *   · the table beside the map is the same data with no colour in it at all.
 *
 * Every state in Nigeria is large enough at this projection to hold three
 * characters, checked at build time, which is why `w` and `h` are in the
 * payload, so no state is ever left as colour alone.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * ── SILENCE IS NOT ZERO ────────────────────────────────────────────────────
 * A state nobody has reported from is drawn flat slate with no label. Not a
 * small number, not a tie: an absence. On election night the difference
 * between "nobody is winning here" and "nobody has told us yet" is the whole
 * story, and a map that blurs the two lies early in the evening.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function NationMap({ shapes, byState, className }) {
  const [hovered, setHovered] = useState(null);

  const results = new Map(byState.map((row) => [row.code, row]));
  const reported = byState.filter((row) => row.reported).length;
  const active = hovered ? results.get(hovered.code) : null;

  return (
    <div className={className}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${shapes.width} ${shapes.height}`}
          className="w-full"
          role="img"
          aria-label={`Map of Nigeria. ${reported} of ${shapes.states.length} states have reported. The same figures are listed in the table beside this map.`}
          onPointerLeave={() => setHovered(null)}
        >
          <defs>
            {/* The tie-breaker for the one pair colour cannot separate. Drawn
                in the party's own red with a lighter rule across it, so it
                still reads as LP rather than as a different colour. */}
            <pattern
              id="poll360-hatch-lp"
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="7" height="7" fill="var(--color-lp)" />
              <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,0.42)" strokeWidth="2.5" />
            </pattern>
          </defs>

          {shapes.states.map((state) => {
            const result = results.get(state.code);
            const leader = result?.leader ?? null;
            const party = leader === null ? null : parties[leader];
            const dimmed = hovered && hovered.code !== state.code;

            return (
              <g
                key={state.code}
                /* Decorative for assistive technology: the table carries the
                   same data as text, and 37 tab stops in a page's hero would
                   be a worse experience than one good table. The SVG's label
                   says where that table is. */
                aria-hidden="true"
                onPointerEnter={() => setHovered(state)}
              >
                <path
                  d={state.d}
                  fill={
                    party === null
                      ? SILENT
                      : party.hatch
                        ? "url(#poll360-hatch-lp)"
                        : party.token
                  }
                  /* Stroked in the board's own colour rather than white: it
                     gives adjacent fills a clean gap so two states leading for
                     different parties never bleed into one another, without
                     drawing a bright cage over the country. */
                  stroke="var(--color-board)"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  className="cursor-crosshair transition-opacity duration-200"
                  style={{ opacity: dimmed ? 0.55 : 1 }}
                />

                {party && (
                  <text
                    x={state.at[0]}
                    y={state.at[1]}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="pointer-events-none font-mono select-none"
                    style={{
                      /* NNPP is four characters; everything else is two or
                         three, and Lagos is a thin state. */
                      fontSize: party.id.length > 3 ? 14 : 17,
                      fontWeight: 700,
                      letterSpacing: "0.01em",
                      fill: "#ffffff",
                      paintOrder: "stroke",
                      stroke: "rgba(0,0,0,0.5)",
                      strokeWidth: 3.5,
                      strokeLinejoin: "round",
                    }}
                  >
                    {party.id}
                  </text>
                )}
              </g>
            );
          })}

          {/* The hovered state redrawn on top, so its outline is never
              overpainted by a neighbour drawn later in the list. */}
          {hovered && (
            <path
              d={hovered.d}
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinejoin="round"
              className="pointer-events-none"
            />
          )}
        </svg>

        {/* Tooltip in HTML: it wraps, it inherits the type scale, and it never
            has to be measured by hand the way an SVG text block does. */}
        {hovered && (
          <div
            className="pointer-events-none absolute z-10 min-w-56 border border-white/25 bg-ink-950/95 px-3.5 py-3 shadow-e4 backdrop-blur-sm"
            style={{
              left: `${(hovered.at[0] / shapes.width) * 100}%`,
              top: `${(hovered.at[1] / shapes.height) * 100}%`,
              transform: "translate(-50%, -115%)",
            }}
          >
            <p className="font-display text-sm font-extrabold tracking-tight text-white">
              {hovered.name}
            </p>

            {active?.reported ? (
              <>
                <p className="mt-2 flex items-center gap-2 text-[0.8125rem] whitespace-nowrap text-white">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0"
                    style={{
                      background:
                        active.leader === null ? SILENT : parties[active.leader].token,
                    }}
                  />
                  <span className="font-mono font-bold">
                    {active.leader === null ? "No party" : parties[active.leader].id}
                  </span>
                  <span className="text-white/55">leading on</span>
                  <span className="figure font-bold">{formatShare(active.leaderShare)}</span>
                </p>
                <p className="figure mt-1.5 text-[0.75rem] text-white/55">
                  {formatNumber(active.units)} booths in · {formatShare(active.coverage)} counted
                </p>
                <p className="tag mt-2 text-white/70">{CALL_LABEL[active.call]}</p>
              </>
            ) : (
              /* The one label this component exists to get right. */
              <p className="mt-2 text-[0.8125rem] text-white/55">No returns yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
