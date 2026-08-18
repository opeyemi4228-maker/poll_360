"use client";

import { ChevronRight } from "lucide-react";

import { PARTY_FILL } from "./Charts";
import { parties, others } from "@/lib/election2023";
import { describe, magnitude, partyCode, ramp, STEPS } from "./ScopeMap";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The list beside the map, for whatever is currently on it.
 *
 * It narrows with the map rather than staying national: at the top it is 37
 * states, inside Lagos it is Lagos's 20 LGAs, inside an LGA it is that LGA's
 * wards. One selection drives both halves, so the thing under your finger on
 * the map is the row highlighted in the list and vice versa.
 *
 * Ranked by whatever the current layer measures — not alphabetically. An
 * alphabetical list of 774 local governments answers no question anybody has.
 */
export default function ScopePanel({ rows, layer, hovered, onHover, onOpen, canOpen, title }) {
  const values = rows.map((row) => magnitude(row, layer));
  const extent = [Math.min(...values, 0), Math.max(...values, 1)];
  const total = rows.reduce((sum, row) => sum + (row.total ?? 0), 0);

  const ranked = [...rows].sort((a, b) => magnitude(b, layer) - magnitude(a, layer));

  return (
    <section className="flex min-h-0 flex-col rounded-dash border border-dash-line bg-dash-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-dash-line px-4 py-3">
        <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">{title}</h3>
        <span className="figure text-[0.6875rem] text-dash-muted">
          {rows.length} · by {layer === "results" ? "votes" : layer}
        </span>
      </header>

      <ul className="min-h-0 flex-1 divide-y divide-dash-line overflow-y-auto">
        {ranked.map((row) => {
          const key = row.key ?? row.name;
          const code = partyCode(row);
          const active = hovered === key;

          return (
            <li key={key}>
              <button
                type="button"
                onMouseEnter={() => onHover?.(key)}
                onMouseLeave={() => onHover?.(null)}
                onClick={() => canOpen && onOpen?.(row)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors",
                  active ? "bg-dash-bg" : "hover:bg-dash-bg",
                  !canOpen && "cursor-default"
                )}
              >
                {/* The swatch matches the map exactly: party colour on the
                    results layer, the same ramp step on a magnitude layer. */}
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full"
                  style={{
                    background:
                      layer === "results"
                        ? code
                          ? PARTY_FILL[code]
                          : "var(--color-dash-line)"
                        : ramp(magnitude(row, layer), extent),
                  }}
                />

                <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold text-dash-ink">
                  {row.name}
                </span>

                {/* The order of finish, in type — so the row is readable
                    without relying on the colours in the bar below it. */}
                {layer === "results" && (row.total ?? 0) > 0 && (
                  <span className="figure hidden shrink-0 text-[0.625rem] text-dash-muted sm:inline">
                    {[...parties, others]
                      .map((party, index) => ({ id: party.id, votes: row.votes?.[index] ?? 0 }))
                      .sort((a, b) => b.votes - a.votes)
                      .slice(0, 3)
                      .map((party) => party.id)
                      .join(" › ")}
                  </span>
                )}

                {layer === "results" ? (
                  <>
                    <span className="figure w-16 shrink-0 text-right text-[0.8125rem] text-dash-ink tabular-nums">
                      {formatNumber(row.total ?? 0)}
                    </span>
                  </>
                ) : (
                  <span className="figure w-24 shrink-0 text-right text-[0.8125rem] text-dash-ink tabular-nums">
                    {layer === "turnout"
                      ? formatShare(row.turnout ?? 0)
                      : formatNumber(magnitude(row, layer))}
                  </span>
                )}

                {canOpen && (
                  <ChevronRight size={14} className="shrink-0 text-dash-muted" aria-hidden="true" />
                )}
              </button>

              {/* Every party in the row, not just the one that won.
                  ── WHY A STACKED SHARE BAR ──────────────────────────────────
                  A single party code per row answers "who leads" and hides
                  everything a room is arguing about: whether it was 51/49 or
                  80/20, whether the national runner-up is second here or
                  fourth, whether the fourth party is worth anything at all.
                  One 100%-stacked bar carries the whole contest in the height
                  of a line of text — and because the segments are ordered the
                  same way in every row, the eye can compare two places by the
                  position of a colour rather than by reading numbers.

                  Segments are separated by the card's own surface, so four
                  adjacent fills read as four marks rather than one striped
                  block; anything under 2% gets no segment but is still in the
                  total, because a sliver too thin to see is worse than none. */}
              {layer === "results" && (row.total ?? 0) > 0 && (
                <div className="flex gap-px px-4 pb-2.5" aria-hidden="true">
                  {[...parties, others].map((party, index) => {
                    const votes = row.votes?.[index] ?? 0;
                    const share = (votes / (row.total || 1)) * 100;
                    if (share < 2) return null;
                    return (
                      <span
                        key={party.id}
                        title={`${party.id} ${formatShare(share)}`}
                        className="h-1.5 first:rounded-l-full last:rounded-r-full"
                        style={{ width: `${share}%`, background: PARTY_FILL[party.id] }}
                      />
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {layer !== "results" && (
        <footer className="border-t border-dash-line px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="figure text-[0.6875rem] text-dash-muted">
              {layer === "turnout" ? `${Math.round(extent[0])}%` : formatNumber(extent[0])}
            </span>
            <div className="flex h-2.5 flex-1 overflow-hidden rounded-full">
              {STEPS.map((step) => (
                <span key={step} className="flex-1" style={{ background: step }} />
              ))}
            </div>
            <span className="figure text-[0.6875rem] text-dash-muted">
              {layer === "turnout" ? `${Math.round(extent[1])}%` : formatNumber(extent[1])}
            </span>
          </div>
          <p className="mt-1.5 text-[0.6875rem] text-dash-muted">
            Scale recomputed for what is on screen
          </p>
        </footer>
      )}
    </section>
  );
}
