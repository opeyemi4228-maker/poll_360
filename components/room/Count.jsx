import { Empty } from "@/components/dash/DashCard";
import { formatNumber } from "@/lib/utils";

/**
 * The running count, as bars with the figures written out. Our count only:
 * the announced figures have their own column elsewhere and are never added
 * to this one.
 */
export default function Count({ count, light, wall = false }) {
  if (!count.units) return <Empty>No returns yet. The count starts with the first result.</Empty>;
  const top = count.parties[0]?.votes ?? 1;
  return (
    <div>
      <ul className={wall ? "space-y-4" : "space-y-2"}>
        {count.parties.slice(0, wall ? 6 : 10).map((row) => (
          <li key={row.party} className={wall ? "text-[1.75rem]" : "text-[0.875rem]"}>
            <div className="flex items-baseline justify-between gap-3 tabular-nums">
              <span className="font-bold text-dash-ink">{row.party}</span>
              <span className="text-dash-ink">{formatNumber(row.votes)} <span className="text-dash-muted">· {row.share.toFixed(1)}%</span></span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-dash-bg">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${(row.votes / top) * 100}%` }} />
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
