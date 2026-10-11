import { AlertTriangle, XCircle } from "lucide-react";

import { cn, formatNumber } from "@/lib/utils";

/**
 * BVAS accredited: the one accreditation figure, wherever a place is shown.
 *
 * ── WHAT THIS BLOCK MAY NEVER DO ───────────────────────────────────────────
 * Print a total without the share of polling units it is built from. Print a
 * zero where there is no figure: a unit that sent no BVAS figure is left out
 * of the sum and counted under "missing". Add the manual register figure to
 * anything: it is shown at a polling unit, beside the BVAS figure, and that
 * is all.
 *
 * `bvas` is the shape lib/room/store.js builds for a place. `unit` adds what
 * only one polling unit has: the agent's, INEC's and the manual figures.
 */
export default function BvasBlock({ bvas, total = null, unit = null, wall = false, className }) {
  const has = bvas?.accredited != null;
  const over = has && bvas.headroom < 0;
  return (
    <section className={cn("rounded-dash border border-dash-line bg-dash-card p-5", className)} aria-label="BVAS accredited">
      <p className="text-[0.75rem] font-bold tracking-[0.08em] text-dash-muted">BVAS ACCREDITED</p>
      <p className={cn("mt-1 font-display leading-none font-extrabold tracking-[-0.03em] text-dash-ink tabular-nums", wall ? "text-[clamp(72px,7vw,128px)]" : "text-[2.5rem]")}>
        {has ? formatNumber(bvas.accredited) : "No figure yet"}
      </p>

      {has && (
        <p className={cn("mt-2 text-dash-muted tabular-nums", wall ? "text-[1.5rem]" : "text-[0.875rem]")}>
          of {formatNumber(bvas.registered)} registered
          {bvas.turnout != null && <> · {bvas.turnout.toFixed(1)}% turnout</>}
        </p>
      )}

      {total != null && bvas && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-dash-bg">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, bvas.coveragePct ?? 0)}%` }} />
          </div>
          <p className={cn("mt-1.5 text-dash-muted tabular-nums", wall ? "text-[1.125rem]" : "text-[0.75rem]")}>
            Built from {(bvas.coveragePct ?? 0).toFixed(1)}% of polling units ({formatNumber(bvas.units ?? 0)} of {formatNumber(total)})
          </p>
        </div>
      )}

      {has && (
        <dl className={cn("mt-4 grid grid-cols-3 gap-3 tabular-nums", wall ? "text-[1.25rem]" : "text-[0.8125rem]")}>
          <div>
            <dt className="text-dash-muted">Votes cast</dt>
            <dd className="font-bold text-dash-ink">{formatNumber(bvas.cast)}</dd>
          </div>
          <div>
            <dt className="text-dash-muted">Rejected</dt>
            <dd className="font-bold text-dash-ink">{formatNumber(bvas.rejected)}</dd>
          </div>
          <div>
            <dt className="text-dash-muted">{over ? "Over-voted" : "Headroom"}</dt>
            <dd className={cn("inline-flex items-center gap-1 font-bold", over ? "text-light-red" : "text-dash-ink")}>
              {over && <XCircle size={14} strokeWidth={2.4} aria-hidden="true" />}
              {over ? `OVER-VOTED BY ${formatNumber(-bvas.headroom)}` : formatNumber(bvas.headroom)}
            </dd>
          </div>
        </dl>
      )}

      {(bvas?.overvoted > 0 || bvas?.missing > 0) && !unit && (
        <p className={cn("mt-3 flex flex-wrap gap-x-3 gap-y-1 font-semibold", wall ? "text-[1.125rem]" : "text-[0.8125rem]")}>
          {bvas.overvoted > 0 && (
            <span className="inline-flex items-center gap-1 text-light-red">
              <XCircle size={14} strokeWidth={2.4} aria-hidden="true" />
              {formatNumber(bvas.overvoted)} polling {bvas.overvoted === 1 ? "unit" : "units"} over-voted (red)
            </span>
          )}
          {bvas.missing > 0 && (
            <span className="inline-flex items-center gap-1 text-light-yellow-ink">
              <AlertTriangle size={14} strokeWidth={2.4} aria-hidden="true" />
              {formatNumber(bvas.missing)} missing a BVAS figure
            </span>
          )}
        </p>
      )}

      {unit && (
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-dash-line pt-3 text-[0.8125rem] tabular-nums">
          <Source label="Agent typed" value={unit.agent} against={bvas?.accredited} />
          <Source label="INEC's sheet" value={unit.inec} against={bvas?.accredited} />
          <Source label="Manual register" value={unit.manual} against={bvas?.accredited} note="never summed" />
        </dl>
      )}
    </section>
  );
}

function Source({ label, value, against, note }) {
  const known = value != null;
  const same = known && against != null && Number(value) === Number(against);
  return (
    <div>
      <dt className="text-dash-muted">{label}</dt>
      <dd className="font-bold text-dash-ink">{known ? formatNumber(value) : "Not held"}</dd>
      {known && against != null && (
        <dd className={cn("text-[0.75rem] font-semibold", same ? "text-light-green" : "text-light-yellow-ink")}>{same ? "✔ matches" : "▲ differs"}</dd>
      )}
      {note && <dd className="text-[0.75rem] text-dash-muted">{note}</dd>}
    </div>
  );
}
