"use client";

import { useMemo, useState } from "react";

import { PARTY_FILL } from "./Charts";
import { boundsOf, extentOf } from "@/lib/bbox";
import { leaderOf } from "@/lib/drill";
import { allParties } from "@/lib/election2023";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * One state, by local government.
 *
 * ── THE THREE THINGS THE FIRST VERSION GOT WRONG ───────────────────────────
 * 1. It rendered the state into the national canvas. Every LGA file is drawn
 *    in the national projection and carries 1000×812 with it, so Lagos
 *    appeared as a thumbnail in the corner of an empty rectangle. The frame is
 *    now cropped to the state's own extent, same projection, right window.
 * 2. Nothing was labelled. Twenty-three coloured shapes with the names hidden
 *    in a tooltip is a picture of a state, not a map of one. Every LGA that is
 *    big enough now carries its leading party's code, and the list beside the
 *    map names all of them in full.
 * 3. There was no way to read a figure without hovering. A room cannot work
 *    from hover: two people looking at one screen means one of them is not
 *    holding the mouse.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function StateLevel({ state, shapes, rows, onOpen }) {
  const [hovered, setHovered] = useState(null);

  /* Crop the national canvas to this state. Memoised because it walks every
     coordinate in every LGA and the answer never changes for a given state. */
  const frame = useMemo(() => boundsOf(shapes.lgas.map((lga) => lga.d)), [shapes]);

  /* Whether a party code fits inside each shape. A code spilling across three
     neighbours is worse than no code, and the list carries the full name
     regardless. */
  const fits = useMemo(() => {
    const map = new Map();
    for (const lga of shapes.lgas) {
      const size = extentOf(lga.d);
      map.set(lga.name, size.width > frame.width * 0.055 && size.height > frame.height * 0.045);
    }
    return map;
  }, [shapes, frame]);

  const byName = useMemo(() => new Map(rows.map((row) => [row.name, row])), [rows]);
  const total = rows.reduce((sum, row) => sum + row.total, 0);

  /* Ranked, because "which LGA delivered the most" is the question, and an
     alphabetical list of 23 names answers nothing. */
  const ranked = useMemo(() => [...rows].sort((a, b) => b.total - a.total), [rows]);

  /* One call, not three, and a miss returns null instead of throwing. The
     index is into the vote array minus its "other" bucket, so it is read back
     through `allParties` rather than the four contenders. */
  const label = (row) => {
    const lead = row ? leaderOf(row.votes) : null;
    return lead === null ? null : (allParties[lead]?.id ?? null);
  };

  return (
    <div className="grid h-full gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* ------------------------------------------------------------- map */}
      <div className="relative min-h-0 rounded-dash border border-dash-line bg-dash-card p-3">
        <svg
          viewBox={frame.viewBox}
          className="h-full max-h-[32rem] w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${state.name} by local government. The same figures are listed beside this map.`}
          onPointerLeave={() => setHovered(null)}
        >
          <defs>
            <pattern
              id="lga-hatch-lp"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill="var(--color-lp-l)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
            </pattern>
          </defs>

          {shapes.lgas.map((lga) => {
            const row = byName.get(lga.name);
            const code = label(row);
            const isHovered = hovered === lga.name;

            return (
              <g
                key={lga.name}
                onPointerEnter={() => setHovered(lga.name)}
                onClick={() => onOpen(lga.name)}
                className="cursor-pointer"
              >
                <path
                  d={lga.d}
                  fill={
                    code === null
                      ? "var(--color-dash-bg)"
                      : code === "LP"
                        ? "url(#lga-hatch-lp)"
                        : PARTY_FILL[code]
                  }
                  stroke={isHovered ? "var(--color-dash-ink)" : "#ffffff"}
                  /* Stroke width is in user units, and those units differ per
                     state once the frame is cropped, so it is scaled to the
                     frame rather than fixed, or a small state gets a cage and
                     a large one gets hairlines. */
                  strokeWidth={(isHovered ? 3 : 1.2) * (frame.width / 1000)}
                  strokeLinejoin="round"
                  className="transition-opacity"
                  style={{ opacity: hovered && !isHovered ? 0.55 : 1 }}
                />

                {code && fits.get(lga.name) && (
                  <text
                    x={lga.at[0]}
                    y={lga.at[1]}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="pointer-events-none font-mono select-none"
                    style={{
                      fontSize: frame.width * 0.028,
                      fontWeight: 700,
                      fill: "#ffffff",
                      paintOrder: "stroke",
                      stroke: "rgba(0,0,0,0.4)",
                      strokeWidth: frame.width * 0.006,
                      strokeLinejoin: "round",
                    }}
                  >
                    {code}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hovered && (
          <div className="pointer-events-none absolute top-4 left-4 rounded-dash-sm border border-dash-line bg-dash-card/95 px-3.5 py-2.5 shadow-sm backdrop-blur">
            <p className="text-[0.875rem] font-bold text-dash-ink">{hovered}</p>
            <p className="figure mt-0.5 text-[0.75rem] text-dash-muted">
              {formatNumber(byName.get(hovered)?.total ?? 0)} votes ·{" "}
              {formatNumber(byName.get(hovered)?.booths ?? 0)} booths
            </p>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ list
          Every LGA, named in full and ranked. This is the half of the screen
          somebody actually reads figures from. */}
      <div className="flex min-h-0 flex-col rounded-dash border border-dash-line bg-dash-card">
        <header className="flex items-baseline justify-between gap-3 border-b border-dash-line px-4 py-3">
          <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">
            {rows.length} local governments
          </h3>
          <span className="figure text-[0.6875rem] text-dash-muted">by votes</span>
        </header>

        <ul className="min-h-0 flex-1 divide-y divide-dash-line overflow-y-auto">
          {ranked.map((row) => {
            const code = label(row);
            return (
              <li key={row.name}>
                <button
                  type="button"
                  onMouseEnter={() => setHovered(row.name)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onOpen(row.name)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    hovered === row.name ? "bg-dash-bg" : "hover:bg-dash-bg"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: code ? PARTY_FILL[code] : "var(--color-dash-line)" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold text-dash-ink">
                    {row.name}
                  </span>
                  <span className="figure shrink-0 text-[0.6875rem] font-bold text-dash-muted">
                    {code ?? "n/a"}
                  </span>
                  <span className="figure w-16 shrink-0 text-right text-[0.8125rem] text-dash-ink tabular-nums">
                    {formatNumber(row.total)}
                  </span>
                  <span className="figure w-10 shrink-0 text-right text-[0.6875rem] text-dash-muted">
                    {formatShare((row.total / (total || 1)) * 100)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
