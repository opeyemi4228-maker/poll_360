import { formatNumber, formatShare } from "@/lib/utils";

/**
 * The coverage dial.
 *
 * ── WHY THIS AND NOT ANOTHER NUMBER IN A BOX ───────────────────────────────
 * Poll360's mark is a dial with an arc swept round it: the whole identity is
 * "a total means nothing without the arc around it". Every dashboard in the
 * world can render a KPI card; this is the one object that belongs to this
 * product and no other, so it is the largest thing on the page and every other
 * figure is read in its shadow.
 *
 * It is also the product's central rule made physical. You cannot look at the
 * count without also looking at how much of the country it came from, because
 * they are drawn as the same object.
 * ───────────────────────────────────────────────────────────────────────────
 */
const TICKS = 60;
const R = 78;
const CIRCUMFERENCE = 2 * Math.PI * R;

export default function CoverageDial({ reported, total, verified = 0, label = "Booths reporting" }) {
  const share = total ? Math.min(1, reported / total) : 0;
  const verifiedShare = total ? Math.min(1, verified / total) : 0;

  return (
    <figure className="flex flex-col items-center">
      <svg
        viewBox="0 0 200 200"
        className="w-full max-w-[15rem]"
        role="img"
        aria-label={`${label}: ${formatShare(share * 100)} — ${formatNumber(reported)} of ${formatNumber(total)}.`}
      >
        {/* The dial face: sixty ticks, one per unit of the last percent, so
            the ring reads as an instrument rather than as a donut chart. */}
        <g stroke="var(--color-dash-line)" strokeWidth="2" strokeLinecap="round">
          {Array.from({ length: TICKS }, (_, index) => {
            const angle = (index / TICKS) * 2 * Math.PI - Math.PI / 2;
            const major = index % 5 === 0;
            const inner = major ? 86 : 90;
            return (
              <line
                key={index}
                x1={100 + Math.cos(angle) * inner}
                y1={100 + Math.sin(angle) * inner}
                x2={100 + Math.cos(angle) * 96}
                y2={100 + Math.sin(angle) * 96}
              />
            );
          })}
        </g>

        {/* The track everything is measured against: the whole country. */}
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--color-dash-bg)" strokeWidth="16" />

        {/* Filed. */}
        <circle
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke="var(--color-dash-ink)"
          strokeWidth="16"
          strokeLinecap="butt"
          strokeDasharray={`${CIRCUMFERENCE * share} ${CIRCUMFERENCE}`}
          transform="rotate(-90 100 100)"
        />

        {/* Verified, drawn inside filed because it is a subset of it — it can
            never lead, and showing it trail is the point. */}
        <circle
          cx="100"
          cy="100"
          r={R - 13}
          fill="none"
          stroke="var(--color-red-500)"
          strokeWidth="5"
          strokeLinecap="butt"
          strokeDasharray={`${2 * Math.PI * (R - 13) * verifiedShare} ${2 * Math.PI * (R - 13)}`}
          transform="rotate(-90 100 100)"
        />

        <text
          x="100"
          y="97"
          textAnchor="middle"
          className="font-mono"
          style={{
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            fill: "var(--color-dash-ink)",
          }}
        >
          {formatShare(share * 100)}
        </text>
        <text
          x="100"
          y="120"
          textAnchor="middle"
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fill: "var(--color-dash-muted)",
          }}
        >
          counted
        </text>
      </svg>

      <figcaption className="mt-4 w-full space-y-2 text-[0.8125rem]">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-dash-ink" />
          <span className="text-dash-muted">Filed</span>
          <span className="figure ml-auto font-bold text-dash-ink">{formatNumber(reported)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-red-500" />
          <span className="text-dash-muted">Checked</span>
          <span className="figure ml-auto font-bold text-dash-ink">{formatNumber(verified)}</span>
        </div>
        <div className="flex items-center gap-2 border-t border-dash-line pt-2">
          <span className="text-dash-muted">Of a register of</span>
          <span className="figure ml-auto font-bold text-dash-ink">{formatNumber(total)}</span>
        </div>
      </figcaption>
    </figure>
  );
}
