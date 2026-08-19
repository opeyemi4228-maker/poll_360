"use client";

import { allParties } from "@/lib/replay";
import { formatNumber } from "@/lib/utils";

/**
 * The returns feed: what has just landed, newest first.
 *
 * Fixed-height rows in the mono face, so a batch arriving never reflows the
 * panel beside it, the single most distracting thing a live board can do to
 * a room full of people reading it.
 *
 * The polling-unit code is the first column because it is the identifier a
 * coordinator can act on: it says state, LGA, ward and unit in eleven
 * characters, and it is what they will type into the queue to find the sheet.
 */
export default function Ticker({ rows, className }) {
  return (
    <div className={className}>
      <h3 className="tag text-white/55">Latest returns</h3>

      <ul className="mt-3 divide-y divide-white/8">
        {rows.map((row, index) => (
          <li
            key={`${row.code}-${index}`}
            className="flex items-center gap-3 py-2"
            /* Only the newest row animates in. Animating the whole list on
               every tick would turn a feed into a slot machine. */
            style={index === 0 ? { animation: "land 0.5s var(--ease-out-quart) both" } : undefined}
          >
            <span className="figure w-24 shrink-0 text-[0.75rem] text-white/45">{row.code}</span>
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-white">{row.state}</span>
            <span className="figure shrink-0 text-[0.75rem] text-white/55">
              +{formatNumber(row.units)}
            </span>
            <span className="figure w-10 shrink-0 text-right text-[0.75rem] font-bold text-white">
              {allParties[row.leader]?.id ?? "n/a"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
