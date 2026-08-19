import { cn } from "@/lib/utils";

/**
 * A figure's recent shape, at the size of a word.
 *
 * ── WHY A BAR SPARK AND NOT A LINE ─────────────────────────────────────────
 * These sit inside metric cards at about 60×24 CSS pixels. At that size a line
 * is one or two pixels of ink and the eye reads it as noise; discrete bars
 * survive, because each one is a block rather than a slope. It is the same
 * reason a stock ticker uses bars at glyph size and a full chart uses a line.
 *
 * There is no axis and no label, deliberately. A sparkline answers "which way,
 * and how steadily", the number beside it answers "how much", and duplicating
 * that in an axis would spend space on a question already answered.
 */
export default function Sparkline({ values, tone = "ink", className }) {
  if (!values || values.length < 2) return null;

  const max = Math.max(...values, 1);
  const bars = values.slice(-16);
  const width = bars.length * 4 - 1;

  const fill =
    tone === "red"
      ? "var(--color-red-500)"
      : tone === "muted"
        ? "var(--color-dash-line)"
        : "var(--color-dash-ink)";

  return (
    <svg
      viewBox={`0 0 ${width} 24`}
      className={cn("h-6 w-16 shrink-0", className)}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {bars.map((value, index) => {
        /* A floor of 2px: a real but tiny value must not vanish, because an
           empty column reads as "nothing happened" when something did. */
        const height = Math.max(2, (value / max) * 22);
        return (
          <rect
            key={index}
            x={index * 4}
            y={24 - height}
            width="3"
            height={height}
            rx="1"
            fill={fill}
            opacity={index === bars.length - 1 ? 1 : 0.35}
          />
        );
      })}
    </svg>
  );
}
