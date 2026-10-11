import { AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";

import { LIGHTS } from "@/lib/lights";
import { cn, formatNumber } from "@/lib/utils";

/**
 * A traffic light, drawn so that colour is never the only clue: a shape of
 * its own, a word, and the colour. Printed in grey on a projector, the cross,
 * the triangle, the tick and the hollow ring still say which is which.
 */
const ICON = { RED: XCircle, YELLOW: AlertTriangle, GREEN: CheckCircle2, GREY: Circle };

export const TONE = {
  RED: { text: "text-light-red", fill: "bg-light-red", soft: "bg-light-red-soft", line: "border-light-red" },
  YELLOW: { text: "text-light-yellow-ink", fill: "bg-light-yellow", soft: "bg-light-yellow-soft", line: "border-light-yellow" },
  GREEN: { text: "text-light-green", fill: "bg-light-green", soft: "bg-light-green-soft", line: "border-light-green" },
  GREY: { text: "text-dash-muted", fill: "bg-light-grey", soft: "bg-light-grey-soft", line: "border-light-grey" },
};

export function LightIcon({ light = "GREY", size = 16, className }) {
  const Icon = ICON[light] ?? Circle;
  return <Icon size={size} strokeWidth={2.4} aria-hidden="true" className={cn("shrink-0", TONE[light]?.text, className)} />;
}

/** The light with its label. `short` for a table cell, the full label elsewhere. */
export function LightBadge({ light = "GREY", short = false, coverage = null, className }) {
  const meta = LIGHTS[light] ?? LIGHTS.GREY;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.75rem] leading-none font-bold whitespace-nowrap",
        TONE[light]?.soft, TONE[light]?.line, TONE[light]?.text, className
      )}
    >
      <LightIcon light={light} size={14} />
      {short ? meta.short : meta.label}
      {/* Green never means complete, so wherever it is said, how much is in
          is said beside it. */}
      {coverage != null && light !== "GREY" && <span className="font-semibold opacity-80">· {coverage.toFixed(1)}% reported</span>}
    </span>
  );
}

/** ✖ 12  ▲ 341  ✔ 6,104  ○ 2,198 */
export function LightCounts({ counts, className }) {
  if (!counts) return null;
  const each = [["RED", counts.red, "red"], ["YELLOW", counts.yellow, "yellow"], ["GREEN", counts.green, "cleared"], ["GREY", counts.grey, "no returns yet"]];
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] font-semibold tabular-nums", className)}>
      {each.map(([light, n, word]) => (
        <span key={light} className={cn("inline-flex items-center gap-1", TONE[light].text)} title={`${formatNumber(n)} ${word}`}>
          <LightIcon light={light} size={13} />
          {formatNumber(n)}
          <span className="sr-only"> {word}</span>
        </span>
      ))}
    </span>
  );
}

/** "Reported 5,112 of 8,655 polling units (59.1%)", with the bar. */
export function Coverage({ reported, total, className }) {
  const share = total ? Math.min(100, (reported / total) * 100) : 0;
  return (
    <div className={className}>
      <div className="h-1.5 overflow-hidden rounded-full bg-dash-bg" role="img" aria-label={`${share.toFixed(1)}% of polling units reported`}>
        <div className="h-full rounded-full bg-dash-ink" style={{ width: `${share}%` }} />
      </div>
      <p className="mt-1.5 text-[0.75rem] text-dash-muted tabular-nums">
        {reported ? (
          <>Reported {formatNumber(reported)} of {formatNumber(total)} polling units ({share.toFixed(1)}%)</>
        ) : (
          <>No returns yet · {formatNumber(total)} polling units</>
        )}
      </p>
    </div>
  );
}
