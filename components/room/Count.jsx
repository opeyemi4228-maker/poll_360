import { Empty } from "@/components/dash/DashCard";
import { PARTY_FILL } from "@/lib/party-fill";
import { formatNumber } from "@/lib/utils";

/**
 * The running count, as bars with the figures written out. Our count only:
 * the announced figures have their own column elsewhere and are never added
 * to this one.
 */
export default function Count({ count, light, wall = false }) {
  if (!count.units) return <Empty>No returns yet. The count starts with the first result.</Empty>;
  /* The parties a reader is following, each in its own colour, and the
     rest gathered into one line: nine rows reading "100 · 0.0%" told nobody
     anything and pushed the accreditation figure off the screen. */
  const keep = wall ? 5 : 6;
  const named = count.parties.filter((row, index) => index < keep && (index < 2 || row.share >= 0.5));
  const others = count.parties.filter((row) => !named.includes(row));
  const rows = others.length
    ? [...named, { party: `${others.length} other ${others.length === 1 ? "party" : "parties"}`, votes: others.reduce((sum, row) => sum + row.votes, 0), share: others.reduce((sum, row) => sum + row.share, 0), rest: true }]
    : named;
  const top = count.parties[0]?.votes || 1;
  return (
    <div>
      <ul className={wall ? "space-y-4" : "space-y-2.5"}>
        {rows.map((row) => (
          <li key={row.party} className={wall ? "text-[1.75rem]" : "text-[0.875rem]"}>
            <div className="flex items-baseline justify-between gap-3 tabular-nums">
              <span className={row.rest ? "font-semibold text-dash-muted" : "font-bold text-dash-ink"}>{row.party}</span>
              <span className="text-dash-ink">{formatNumber(row.votes)} <span className="text-dash-muted">· {row.share.toFixed(1)}%</span></span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-dash-bg">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (row.votes / top) * 100)}%`, background: row.rest ? "var(--color-light-grey)" : (PARTY_FILL[row.party] ?? PARTY_FILL.OTH) }} />
            </div>
          </li>
        ))}
      </ul>
      <p className={wall ? "mt-4 text-[1.25rem] text-dash-muted tabular-nums" : "mt-3 text-[0.75rem] text-dash-muted tabular-nums"}>
        Built from {formatNumber(count.units)} polling units{light ? `, ${light.coveragePct.toFixed(1)}% of ${formatNumber(light.total)}` : ""}. {formatNumber(count.checked)} of them checked by a second person. Disputed results are left out.
      </p>
    </div>
  );
}
