/**
 * The desk's instruments: a ring, a bar and a sparkline.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A TOOL, NOT A REPORT
 *
 *  A gallery screen is glanced at, not read. Figures set in type have to be
 *  found, parsed and compared before they mean anything, and at eleven at
 *  night with four people talking, that work does not get done — which is how
 *  a desk ends up with numbers nobody is acting on.
 *
 *  A shape is understood before it is read: a ring that is a third full, a bar
 *  that is mostly red, a night that has gone quiet for twenty minutes. So the
 *  desk shows the shape, and prints the one figure that shape cannot carry.
 *  Everything here is plain SVG — no library, no script, no animation loop
 *  running on a wall for six hours.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { cn } from "@/lib/utils";

/* The product's own colours, and only those: the ink for a plain figure,
   the brand red for anything live, and the two status colours this product
   uses everywhere else — verified and flagged. */
const TONES = {
  ink: "var(--color-dash-ink)",
  red: "var(--color-red-500)",
  green: "var(--color-verified)",
  orange: "var(--color-flagged)",
  blue: "var(--color-blue-900)",
};

/** A ring, filled to `value` per cent. The figure sits inside it. */
export function Ring({ value, label, size = 76, tone = "ink", figure = null }) {
  const stroke = size * 0.12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const share = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;

  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-dash-line)" strokeWidth={stroke} />
          {share > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={TONES[tone] ?? TONES.ink}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${circumference * share} ${circumference}`}
            />
          )}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="figure text-[0.9375rem] leading-none font-extrabold text-dash-ink">
            {figure ?? (value == null ? "—" : `${Math.round(value)}%`)}
          </span>
        </span>
      </div>
      {label && (
        <span className="min-w-0 text-[0.6875rem] leading-tight font-bold tracking-[0.1em] text-dash-muted uppercase">
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * A stacked bar: what happened, in proportion, with the parts in their own
 * colours. Nothing is labelled inside it — the legend is the row it sits in.
 */
export function Bar({ parts = [], height = 10, className }) {
  const total = parts.reduce((sum, part) => sum + (part.value ?? 0), 0);
  return (
    <span
      className={cn("flex w-full overflow-hidden rounded-full bg-dash-line", className)}
      style={{ height }}
      role="img"
      aria-label={parts.map((part) => `${part.value} ${part.label}`).join(", ")}
    >
      {total > 0 &&
        parts.map((part) =>
          part.value > 0 ? (
            <span
              key={part.label}
              title={`${part.label}: ${part.value}`}
              style={{ width: `${(part.value / total) * 100}%`, background: TONES[part.tone] ?? TONES.ink }}
            />
          ) : null
        )}
    </span>
  );
}

/**
 * The night as a shape: one column per half hour. A quiet stretch is a gap,
 * which is the thing a producer is actually looking for.
 */
export function Spark({ points = [], height = 34, tone = "ink", className }) {
  const top = Math.max(1, ...points);
  return (
    <span
      className={cn("flex items-end gap-[2px]", className)}
      style={{ height }}
      role="img"
      aria-label={`${points.reduce((sum, value) => sum + value, 0)} in the last ${points.length} half-hours`}
    >
      {points.map((value, index) => (
        <span
          key={index}
          className="min-w-[3px] flex-1 rounded-t-[2px]"
          style={{
            height: `${Math.max(6, (value / top) * 100)}%`,
            background: value > 0 ? TONES[tone] ?? TONES.ink : "var(--color-dash-line)",
            opacity: value > 0 ? 0.35 + 0.65 * (value / top) : 1,
          }}
        />
      ))}
    </span>
  );
}

/** A count that is a dot and a number, for things there are few of. */
export function Pip({ value, label, tone = "ink" }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: TONES[tone] ?? TONES.ink }} />
      <span className="figure text-[0.9375rem] leading-none font-extrabold text-dash-ink">{value}</span>
      <span className="text-[0.6875rem] font-bold tracking-[0.08em] text-dash-muted uppercase">{label}</span>
    </span>
  );
}
