import { Scale, ShieldAlert, ShieldCheck } from "lucide-react";

import { DIVERGENCE } from "@/lib/divergence";
import { LEVELS } from "@/lib/declared";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * What the two counts do and do not agree about.
 *
 * ── IT NEVER SAYS "RIGGED" ─────────────────────────────────────────────────
 * The same discipline as IntegrityPanel, and for the same reason. Every line
 * states which figure differs, in which place, by how much, and stops there.
 * "Our count leads LP, the declared figures lead APC across a ward we hold
 * every booth of" is a fact two people can check against the sheets, and it
 * survives a lawyer. "Results were altered" is an accusation this system has no
 * standing to make, and the first one that turned out to be a data-entry slip
 * would discredit every true finding after it.
 *
 * ── AND IT SAYS WHEN IT CANNOT TELL ────────────────────────────────────────
 * The count that matters most on this panel is the quiet one: how many places
 * are too thinly covered to compare. A dashboard that silently drops those
 * looks like it checked everything and found little. This one says how much it
 * actually checked, because the difference between "we compared eleven wards"
 * and "we compared eleven of ninety wards" is the difference between a finding
 * and a press release.
 */
export default function DivergencePanel({ report, compact = false, href = "/gap" }) {
  /* Not the same as "everything agrees". Nothing has been given to compare. */
  if (!report.ready) {
    return (
      <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
        <Header tone="neutral" badge="Nothing to compare" />
        <p className="px-4 py-6 text-[0.875rem] leading-relaxed text-dash-muted">
          No declared figures have been entered for this project yet, so there is nothing to hold
          our {formatNumber(report.ourReturns)} return{report.ourReturns === 1 ? "" : "s"} against.
          As collation announces a ward, a local government or a state, enter what was announced
          and the comparison starts from that moment.
        </p>
      </section>
    );
  }

  const clean = report.flags.length === 0;

  return (
    <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
      <Header
        tone={report.impossible || report.flipped ? "alert" : clean ? "good" : "warn"}
        badge={
          report.impossible
            ? `${report.impossible} impossible`
            : report.flipped
              ? `${report.flipped} winner${report.flipped === 1 ? "" : "s"} differ`
              : report.divergent
                ? `${report.divergent} to review`
                : "In step"
        }
      />

      <dl className="grid grid-cols-3 gap-px border-b border-dash-line bg-dash-line">
        <Cell label="Compared" value={formatNumber(report.compared)} />
        <Cell label="In step" value={formatNumber(report.agreeing)} />
        <Cell
          label="Differing"
          value={formatNumber(report.places)}
          tone={report.places ? "red" : "ink"}
        />
      </dl>

      {/* ── THE LINE THAT KEEPS THE PANEL HONEST ─────────────────────────────
          Printed above the findings rather than in a footnote below them. A
          reader who takes in the three figures and one headline and walks away
          must have seen this, because without it those figures describe a
          fraction of the country as though they described the country. */}
      {report.tooThin > 0 && (
        <p className="border-b border-dash-line bg-dash-bg px-4 py-2.5 text-[0.75rem] leading-relaxed text-dash-muted">
          {formatNumber(report.tooThin)}{" "}
          {report.tooThin === 1 ? "place is" : "places are"} not compared here: we do not hold
          enough of {report.tooThin === 1 ? "it" : "them"} for the totals to mean the same thing.
          {report.withoutUnitCount > 0 &&
            ` ${formatNumber(report.withoutUnitCount)} of those did not say how many polling units they contain, which is what settles it.`}{" "}
          Only figures that cannot be true at any coverage are checked there.
        </p>
      )}

      {clean ? (
        <p className="px-4 py-6 text-center text-[0.875rem] leading-relaxed text-dash-muted">
          Every place we hold in full is in step with what was declared for it. That is the result
          you want, and the one worth being able to prove.
        </p>
      ) : (
        <ul className="max-h-80 divide-y divide-dash-line overflow-y-auto">
          {report.flags.slice(0, compact ? 5 : 30).map((flag) => (
            <Finding key={flag.id} flag={flag} compact={compact} />
          ))}
        </ul>
      )}

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dash-line px-4 py-2.5">
        <p className="text-[0.6875rem] leading-relaxed text-dash-muted">
          Arithmetic against two independently sourced figures, never an accusation. Each line names
          the place so it can be read against its sheet.
        </p>
        {compact && report.flags.length > 5 && (
          <a
            href={href}
            className="text-[0.6875rem] font-bold text-dash-ink underline underline-offset-2"
          >
            All {formatNumber(report.flags.length)}
          </a>
        )}
      </footer>
    </section>
  );
}

export function Finding({ flag, compact = false }) {
  const severity = DIVERGENCE[flag.severity];

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase",
            severity.tone === "alert"
              ? "bg-red-50 text-red-700"
              : severity.tone === "warn"
                ? "bg-amber-50 text-amber-800"
                : "bg-dash-bg text-dash-muted"
          )}
        >
          {severity.label}
        </span>

        <span className="figure text-[0.75rem] text-dash-muted">
          {LEVELS[flag.level]?.label} {flag.key}
        </span>

        {/* ── WHY A "PARTIAL" MARK IS ON THE FINDING ITSELF ────────────────
            A finding gets copied, screenshotted and read aloud away from the
            panel that framed it. The one raised over incomplete coverage is
            the one that most needs its context travelling with it, so it
            carries it rather than relying on a line further up the page. */}
        {flag.mode === "PARTIAL" && (
          <span className="rounded-full bg-dash-bg px-2 py-0.5 text-[0.625rem] font-semibold text-dash-muted">
            {flag.coverage?.declaredUnits
              ? `${flag.coverage.oursUnits} of ${flag.coverage.declaredUnits} booths`
              : `${flag.coverage?.oursUnits ?? 0} booths held`}
          </span>
        )}
      </div>

      <p className="mt-1.5 text-[0.875rem] font-semibold text-dash-ink">{flag.says}</p>
      {!compact && (
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-dash-muted">{flag.why}</p>
      )}
    </li>
  );
}

function Header({ tone, badge }) {
  const Icon = tone === "alert" ? ShieldAlert : tone === "good" ? ShieldCheck : Scale;

  return (
    <header className="flex items-center gap-3 border-b border-dash-line px-4 py-3.5">
      <Icon
        size={18}
        strokeWidth={2.25}
        className={cn(
          "shrink-0",
          tone === "alert" ? "text-red-600" : tone === "good" ? "text-emerald-600" : "text-dash-muted"
        )}
      />
      <div className="min-w-0">
        <h3 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
          Our count against the declared figures
        </h3>
        <p className="text-[0.75rem] text-dash-muted">Two sources, held apart and compared</p>
      </div>

      <span
        className={cn(
          "ml-auto shrink-0 rounded-full px-2.5 py-1 text-[0.625rem] font-bold uppercase",
          tone === "alert"
            ? "bg-red-50 text-red-700"
            : tone === "warn"
              ? "bg-amber-50 text-amber-800"
              : tone === "good"
                ? "bg-emerald-50 text-emerald-800"
                : "bg-dash-bg text-dash-muted"
        )}
      >
        {badge}
      </span>
    </header>
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
