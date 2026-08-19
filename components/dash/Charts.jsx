import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The dashboard's charts.
 *
 * Hand-drawn SVG rather than a charting library: there are three forms here,
 * they are all simple, and a dependency that ships a canvas renderer and its
 * own colour opinions to draw four bars is a poor trade in a product that has
 * to stay legible under forced colours and in a photocopy.
 *
 * Two rules run through all of them, and they are the same rules the public
 * board follows:
 *   · every mark carries a label, so colour is never the only encoding;
 *   · every total is rendered next to the share of booths behind it.
 */

/** Party fills for a white surface. See the tokens in globals.css. */
export const PARTY_FILL = {
  APC: "var(--color-apc-l)",
  PDP: "var(--color-pdp-l)",
  LP: "var(--color-lp-l)",
  NNPP: "var(--color-nnpp-l)",
  OTH: "var(--color-party-other-l)",
};

/**
 * Ranked horizontal bars, the right form for "who is ahead, and by how much".
 *
 * Scaled to the leader rather than to 100%, so the shape of the race stays
 * legible while it is still close; the percentage is printed regardless, so
 * nobody has to measure a bar against an axis to read a share.
 */
export function PartyBars({ rows, total, className }) {
  const top = Math.max(...rows.map((row) => row.votes), 1);

  return (
    <ul className={cn("space-y-3.5", className)}>
      {rows.map((row) => (
        <li key={row.id}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="flex min-w-0 items-baseline gap-2">
              <span className="figure text-[0.875rem] font-bold text-dash-ink">{row.id}</span>
              <span className="truncate text-[0.8125rem] text-dash-muted">{row.name}</span>
            </p>
            <p className="figure shrink-0 text-[0.875rem] font-bold text-dash-ink tabular-nums">
              {total ? formatShare((row.votes / total) * 100) : "0%"}
            </p>
          </div>

          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-2.5 flex-1 rounded-full bg-dash-bg">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (row.votes / top) * 100)}%`,
                  background: PARTY_FILL[row.id] ?? PARTY_FILL.OTH,
                }}
              />
            </div>
            <span className="figure w-24 shrink-0 text-right text-[0.8125rem] text-dash-muted">
              {formatNumber(row.votes)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Returns arriving over the evening.
 *
 * An area rather than a line because the quantity is a cumulative total and
 * the filled region is the point: you are meant to read how much of the
 * country has spoken, not the gradient at any instant.
 */
export function TrendArea({ points, height = 160, className, label = "Booths reporting" }) {
  if (!points || points.length < 2) {
    return (
      <p className="rounded-dash-sm bg-dash-bg px-4 py-8 text-center text-[0.875rem] text-dash-muted">
        Not enough has come in yet to draw a trend. This fills in as returns land.
      </p>
    );
  }

  const width = 640;
  const max = Math.max(...points.map((p) => p.value), 1);
  const step = width / (points.length - 1);

  const coords = points.map((point, index) => [
    index * step,
    height - (point.value / max) * (height - 12) - 6,
  ]);

  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  const area = `${line}L${width} ${height}L0 ${height}Z`;

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${label} over the evening, ending at ${formatNumber(points.at(-1).value)}.`}
        preserveAspectRatio="none"
      >
        {/* Recessive gridlines: present enough to judge a height against,
            never competing with the data. */}
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1="0"
            x2={width}
            y1={height * fraction}
            y2={height * fraction}
            stroke="var(--color-dash-line)"
            strokeWidth="1"
          />
        ))}

        <path d={area} fill="var(--color-dash-ink)" opacity="0.06" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-dash-ink)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={coords.at(-1)[0]}
          cy={coords.at(-1)[1]}
          r="4"
          fill="var(--color-red-500)"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <figcaption className="mt-2 flex justify-between text-[0.75rem] text-dash-muted">
        <span>{points[0].label}</span>
        <span>{points.at(-1).label}</span>
      </figcaption>
    </figure>
  );
}

/**
 * Coverage as a single bar, with the figure beside it.
 *
 * Used wherever a place's totals are shown, because a total without this is a
 * different claim.
 */
export function CoverageBar({ reported, total, className }) {
  const share = total ? (reported / total) * 100 : 0;

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.75rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
          Booths reporting
        </span>
        <span className="figure text-[0.875rem] font-bold text-dash-ink">
          {formatShare(share)}
        </span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-dash-bg">
        <div
          className="h-full rounded-full bg-dash-ink"
          style={{ width: `${Math.min(100, share)}%` }}
        />
      </div>
      <p className="figure mt-2 text-[0.75rem] text-dash-muted">
        {formatNumber(reported)} of {formatNumber(total)}
      </p>
    </div>
  );
}
