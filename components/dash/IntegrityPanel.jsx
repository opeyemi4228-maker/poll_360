import { ShieldAlert, ShieldCheck } from "lucide-react";

import { SEVERITY } from "@/lib/anomalies";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * What the screening found.
 *
 * ── IT NEVER SAYS "FRAUD" ──────────────────────────────────────────────────
 * Every line states what is arithmetically or statistically wrong and stops
 * there. The wording matters more than the detection: "640 accredited at a
 * booth with 500 registered" is a fact anybody can check against the sheet,
 * and it survives a lawyer. "Suspected rigging" is an accusation this system
 * has no standing to make, and the first one that turned out to be a typo
 * would discredit every true finding after it.
 *
 * So the panel gives the reader the arithmetic, the unit code to look it up
 * by, and nothing else. The judgement stays with the human.
 */
export default function IntegrityPanel({ report, compact = false }) {
  const clean = report.flags.length === 0;

  return (
    <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
      <header className="flex items-center gap-3 border-b border-dash-line px-4 py-3.5">
        {clean ? (
          <ShieldCheck size={18} strokeWidth={2.25} className="shrink-0 text-emerald-600" />
        ) : (
          <ShieldAlert size={18} strokeWidth={2.25} className="shrink-0 text-red-600" />
        )}
        <div className="min-w-0">
          <h3 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
            Integrity screening
          </h3>
          <p className="text-[0.75rem] text-dash-muted">
            Every return, checked on arrival
          </p>
        </div>

        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-2.5 py-1 text-[0.625rem] font-bold uppercase",
            report.impossible
              ? "bg-red-50 text-red-700"
              : report.flags.length
                ? "bg-amber-50 text-amber-800"
                : "bg-emerald-50 text-emerald-800"
          )}
        >
          {report.impossible
            ? `${report.impossible} impossible`
            : report.flags.length
              ? `${report.flags.length} to review`
              : "All clear"}
        </span>
      </header>

      <dl className="grid grid-cols-3 gap-px border-b border-dash-line bg-dash-line">
        <Cell label="Screened" value={formatNumber(report.screened)} />
        <Cell label="Passed" value={formatNumber(report.clean)} />
        <Cell label="Flagged" value={formatNumber(report.flagged)} tone={report.flagged ? "red" : "ink"} />
      </dl>

      {clean ? (
        <p className="px-4 py-6 text-center text-[0.875rem] leading-relaxed text-dash-muted">
          Nothing failed a check. Every return so far is arithmetically sound and in step with its
          neighbours, which is the result you want, and the one worth being able to prove.
        </p>
      ) : (
        <ul className="max-h-80 divide-y divide-dash-line overflow-y-auto">
          {report.flags.slice(0, compact ? 5 : 25).map((flag) => (
            <li key={flag.id} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase",
                    SEVERITY[flag.severity].tone === "alert"
                      ? "bg-red-50 text-red-700"
                      : SEVERITY[flag.severity].tone === "warn"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-dash-bg text-dash-muted"
                  )}
                >
                  {SEVERITY[flag.severity].label}
                </span>
                <span className="figure text-[0.75rem] text-dash-muted">{flag.unitCode}</span>
              </div>

              <p className="mt-1.5 text-[0.875rem] font-semibold text-dash-ink">{flag.says}</p>
              {!compact && (
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-dash-muted">{flag.why}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <footer className="border-t border-dash-line px-4 py-2.5">
        <p className="text-[0.6875rem] leading-relaxed text-dash-muted">
          These are arithmetic and statistical checks, not accusations. Each one names the unit so
          it can be read against its photographed sheet.
        </p>
      </footer>
    </section>
  );
}

function Cell({ label, value, tone = "ink" }) {
  return (
    <div className="bg-dash-card px-4 py-3">
      <dt className="text-[0.625rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "figure mt-1 text-[1.125rem] font-bold tabular-nums",
          tone === "red" ? "text-red-600" : "text-dash-ink"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
