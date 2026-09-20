"use client";

import { parties, CALL_LABEL } from "@/lib/replay";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * The same data as the map, with no colour in it at all.
 *
 * Not a fallback and not an accessibility afterthought, it is the encoding
 * the map is checked against. If a state's leader can only be learned by
 * matching a fill to a legend, the board has failed for roughly one man in
 * twelve, for anyone reading a monochrome print of it, and for anyone whose
 * operating system has overridden the page's colours.
 *
 * Sorted by how much of each state has actually reported, so the states worth
 * looking at are at the top and the silent ones are visibly, namedly silent at
 * the bottom rather than absent.
 */
export default function StateTable({ byState, states, className }) {
  const names = new Map(states.map((state) => [state.code, state.name]));

  const rows = [...byState].sort((a, b) => {
    if (a.reported !== b.reported) return a.reported ? -1 : 1;
    if (!a.reported) return names.get(a.code).localeCompare(names.get(b.code));
    return b.coverage - a.coverage;
  });

  return (
    /* ── min-w-0, OR THE PHONE SCROLLS SIDEWAYS ─────────────────────────
       This panel is a grid item, and a grid item's minimum width is its
       content by default: five columns of figures are wider than a phone,
       so the panel refused to shrink and took the whole page with it. The
       table scrolls inside its own box instead. */
    <div className={cn("min-w-0", className)}>
      <div className="max-h-[26rem] overflow-x-auto overflow-y-auto overscroll-contain">
        <table className="w-full min-w-[22rem] border-collapse text-left">
          <caption className="sr-only">
            Every state, its leading party, its share and how much of it has reported. The same
            figures the map above is drawn from.
          </caption>
          <thead className="sticky top-0 z-10 bg-board">
            <tr className="border-b border-white/15">
              <th scope="col" className="tag py-2 pr-3 font-semibold text-white/55">
                State
              </th>
              <th scope="col" className="tag py-2 pr-3 font-semibold text-white/55">
                Leading
              </th>
              <th scope="col" className="tag py-2 pr-3 text-right font-semibold text-white/55">
                Share
              </th>
              <th scope="col" className="tag py-2 pr-3 text-right font-semibold text-white/55">
                Counted
              </th>
              <th scope="col" className="tag py-2 text-right font-semibold text-white/55">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code} className="border-b border-white/8 last:border-0">
                <th
                  scope="row"
                  className="py-2 pr-3 text-[0.8125rem] font-medium whitespace-nowrap text-white"
                >
                  {names.get(row.code)}
                </th>
                <td className="figure py-2 pr-3 text-[0.8125rem] font-bold text-white">
                  {row.reported && row.leader !== null ? parties[row.leader].id : "n/a"}
                </td>
                <td className="figure py-2 pr-3 text-right text-[0.8125rem] text-white/70">
                  {row.reported ? formatShare(row.leaderShare) : "n/a"}
                </td>
                <td className="figure py-2 pr-3 text-right text-[0.8125rem] text-white/70">
                  {row.reported ? formatShare(row.coverage) : "n/a"}
                </td>
                <td className="py-2 text-right text-[0.75rem] whitespace-nowrap text-white/55">
                  {row.reported ? CALL_LABEL[row.call] : "No returns yet"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="figure mt-3 text-[0.6875rem] text-white/40">
        {formatNumber(rows.filter((row) => row.reported).length)} of {rows.length} states reporting
      </p>
    </div>
  );
}
