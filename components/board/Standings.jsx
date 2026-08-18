"use client";

import { formatNumber, formatShare } from "@/lib/utils";

/**
 * National standings.
 *
 * A bar per party, sorted leader-first, with the margin over second place
 * printed underneath — because "who is ahead" and "by how much" are two
 * different questions and only the second one tells you whether to keep
 * watching.
 *
 * Bars are square-ended rather than rounded: this design system has no radius
 * anywhere, and a bar that rounds its end reads as slightly short of the value
 * it is drawn at. Adjacent bars are separated by the surface rather than by a
 * border, so the eye reads four marks and not one striped block.
 */
export default function Standings({ standings, total, margin, className }) {
  const top = standings[0]?.votes ?? 0;

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="tag text-white/55">Votes counted</h3>
        <p className="figure text-sm font-bold text-white">{formatNumber(total)}</p>
      </div>

      <ul className="mt-4 space-y-2.5">
        {standings.map((party) => (
          <li key={party.id}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="flex min-w-0 items-baseline gap-2">
                <span className="figure text-sm font-bold text-white">{party.id}</span>
                <span className="truncate text-[0.75rem] text-white/45">{party.name}</span>
              </p>
              <p className="figure shrink-0 text-sm font-bold text-white tabular-nums">
                {formatShare(party.share)}
              </p>
            </div>

            <div className="mt-1.5 flex items-center gap-3">
              <div className="h-2 flex-1 bg-white/8">
                <div
                  className="h-full transition-[width] duration-500 ease-out-quart"
                  style={{
                    /* Bars are scaled to the leader, not to 100%, so the shape
                       of the race is legible while it is still close. Clamped
                       because `others` is pinned to the bottom of the list
                       rather than sorted, and must not draw past the track if
                       it ever out-polls the leading named party. */
                    width: `${top ? Math.min(100, (party.votes / top) * 100) : 0}%`,
                    background: party.token,
                  }}
                />
              </div>
              <p className="figure w-24 shrink-0 text-right text-[0.75rem] text-white/55">
                {formatNumber(party.votes)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-white/10 pt-3 text-[0.75rem] text-white/55">
        Lead over second place{" "}
        <span className="figure font-bold text-white">{formatNumber(margin)}</span>
      </p>
    </div>
  );
}
