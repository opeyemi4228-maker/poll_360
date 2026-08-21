"use client";

import { useMemo, useState } from "react";
import { Scale } from "lucide-react";

import { Finding } from "./DivergencePanel";
import { DIVERGENCE } from "@/lib/divergence";
import { LEVELS } from "@/lib/declared";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The whole comparison, with somewhere to stand in it.
 *
 * ── WHY IT FILTERS RATHER THAN PAGES ───────────────────────────────────────
 * On a busy night this is thousands of lines, and the useful question is never
 * "what is on page four". It is "show me the places where the winner differs",
 * or "show me this state". Both are one click, and the counts on the buttons
 * are the counts, so somebody can see there are two flipped wards without
 * opening the filter that shows them.
 *
 * ── AND WHY THE ORDER IS FIXED ─────────────────────────────────────────────
 * Sorted by severity in lib/divergence.js and never re-sorted here. A room
 * that can sort this table by size of difference will sort it by size of
 * difference, and then the largest arithmetic slip in the country outranks the
 * ward where the winner changed. The ordering is a judgement about what
 * matters and it belongs with the rules, not with the reader.
 */
const ALL = "ALL";

export default function GapBoard({ report }) {
  const [severity, setSeverity] = useState(ALL);
  const [level, setLevel] = useState(ALL);

  const counts = useMemo(() => {
    const bySeverity = {};
    const byLevel = {};
    for (const flag of report.flags) {
      bySeverity[flag.severity] = (bySeverity[flag.severity] ?? 0) + 1;
      byLevel[flag.level] = (byLevel[flag.level] ?? 0) + 1;
    }
    return { bySeverity, byLevel };
  }, [report.flags]);

  const shown = useMemo(
    () =>
      report.flags.filter(
        (flag) =>
          (severity === ALL || flag.severity === severity) &&
          (level === ALL || flag.level === level)
      ),
    [report.flags, severity, level]
  );

  if (!report.ready) return null;

  return (
    <div className="space-y-4">
      {/* --------------------------------------------------------- filters */}
      <div className="space-y-3">
        <Row label="Showing">
          <Chip active={severity === ALL} onClick={() => setSeverity(ALL)}>
            Everything <Count value={report.flags.length} />
          </Chip>
          {Object.entries(DIVERGENCE)
            .sort((a, b) => b[1].rank - a[1].rank)
            .map(([key, meta]) => (
              <Chip
                key={key}
                active={severity === key}
                tone={meta.tone}
                disabled={!counts.bySeverity[key]}
                onClick={() => setSeverity(key)}
              >
                {meta.label} <Count value={counts.bySeverity[key] ?? 0} />
              </Chip>
            ))}
        </Row>

        {report.levels.length > 1 && (
          <Row label="At">
            <Chip active={level === ALL} onClick={() => setLevel(ALL)}>
              Every level
            </Chip>
            {report.levels.map((key) => (
              <Chip
                key={key}
                active={level === key}
                disabled={!counts.byLevel[key]}
                onClick={() => setLevel(key)}
              >
                {LEVELS[key].label} <Count value={counts.byLevel[key] ?? 0} />
              </Chip>
            ))}
          </Row>
        )}
      </div>

      {/* -------------------------------------------------------- the list */}
      {shown.length === 0 ? (
        <p className="rounded-dash border border-dash-line bg-dash-card px-4 py-8 text-center text-[0.875rem] leading-relaxed text-dash-muted">
          {report.flags.length === 0 ? (
            <>
              Nothing differs. Every place we hold in full is in step with what was declared for it,
              across {formatNumber(report.compared)}{" "}
              {report.compared === 1 ? "place" : "places"} compared.
            </>
          ) : (
            <>Nothing under that filter. {formatNumber(report.flags.length)} findings in total.</>
          )}
        </p>
      ) : (
        <ul className="divide-y divide-dash-line rounded-dash border border-dash-line bg-dash-card">
          {shown.map((flag) => (
            <Finding key={flag.id} flag={flag} />
          ))}
        </ul>
      )}

      {/* ── THE FOOTER IS NOT DECORATION ──────────────────────────────────
          Whatever is filtered above, this says what the whole comparison
          covered. A reader looking at four findings needs to know whether they
          came out of four places or four thousand. */}
      <p className="flex items-start gap-2 text-[0.75rem] leading-relaxed text-dash-muted">
        <Scale size={14} strokeWidth={2.25} className="mt-0.5 shrink-0" />
        <span>
          {formatNumber(report.ourReturns)} of our returns against{" "}
          {formatNumber(report.declared)} declared{" "}
          {report.declared === 1 ? "figure" : "figures"}.{" "}
          {formatNumber(report.compared)} {report.compared === 1 ? "place" : "places"} held
          completely enough to compare in full
          {report.tooThin > 0 && (
            <>
              , {formatNumber(report.tooThin)} not — there, only figures that could not be true at
              any level of coverage are checked
            </>
          )}
          .
        </span>
      </p>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[0.625rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip({ active, tone, disabled, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      /* 44px on the shortest side: this screen gets pushed at on a touch wall
         in a situation room, the same as the broadcast analysis surface. */
      className={cn(
        "min-h-11 rounded-dash-sm border px-3 py-1.5 text-[0.8125rem] font-semibold",
        disabled && "cursor-not-allowed opacity-40",
        active
          ? "border-dash-ink bg-dash-ink text-white"
          : tone === "alert"
            ? "border-red-200 bg-red-50 text-red-700"
            : tone === "warn"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-dash-line bg-dash-card text-dash-ink"
      )}
    >
      {children}
    </button>
  );
}

const Count = ({ value }) => <span className="figure ml-1 tabular-nums opacity-70">{value}</span>;
