"use client";

import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * The room's figures: one visual vocabulary, used by every monitoring surface.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THESE ARE IN ONE FILE AND NOT INSIDE THE SCREENS THAT USE THEM
 *
 *  Five surfaces were each drawing their own bar, their own tile, their own
 *  percentage, and they had already begun to disagree: two bar heights, three
 *  label sizes, two different ways of writing a share. A room reads these at
 *  three metres, at two in the morning, and every inconsistency costs a
 *  fraction of a second of "is that the same kind of thing as that".
 *
 *  So there is one tile, one bar, one part-to-whole, one column chart, and the
 *  screens choose between them rather than inventing.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE RULES THESE OBEY ───────────────────────────────────────────────────
 *  · The number is the object. Prose is a caption at most, never the content —
 *    an election room is read in glances, and a paragraph is not a glance.
 *  · Every share is printed as a figure as well as drawn, so nobody has to
 *    measure a bar against an axis to read a percentage.
 *  · Ordered things (a funnel, distance bands) get one hue getting darker.
 *    Distinct things get the party colours or a status colour, never a
 *    rainbow, and never a colour picked by rank — see references in
 *    components/dash/Charts.jsx.
 *  · Status colour is reserved for status. Amber and red here always mean
 *    "somebody has to look at this", never "series two".
 *  · Bars sit on a track of the surface behind them, with a 2px gap between
 *    segments rather than a border, so nothing is outlined.
 */

/** One hue, light to dark, for anything with an inherent order. */
export const RAMP = [
  "var(--color-ink-300)",
  "var(--color-ink-500)",
  "var(--color-ink-700)",
  "var(--color-ink-900)",
];

/**
 * ── THE STATUS TONES, AND WHY SEVERITY IS ONE HUE AND NOT FIVE ─────────────
 * The obvious way to draw a five-step warning scale is five colours, and it
 * does not work. Run green/blue/amber/orange/red through a colour-vision
 * check and the amber-to-orange pair separates by ΔE 1.6 for a deuteranope
 * and 6.7 for somebody with full colour vision — they are the same colour,
 * and they are the two steps a room most needs to tell apart, because they
 * are the boundary between "worth a call" and "this will cost the night".
 *
 * Severity is *ordered*, so it gets an ordinal ramp: one hue, getting darker,
 * which is the same rule every other ordered thing on this dashboard obeys.
 * The three red steps below are the project's own red at 400/500/700 and pass
 * all four ordinal checks — monotone lightness, ΔL gaps ≥ 0.06, a light end
 * that clears the surface at 3.09:1, and a hue spread of 1°.
 *
 * `warn` stays amber because "somebody should look" and "this is going wrong"
 * are genuinely different states rather than two steps of one — and amber
 * against the brand red separates by ΔE 25.3 (19.7 deutan), comfortably.
 * Amber's own contrast on the surface is 2.08:1, which is why it is only ever
 * a fill behind dark text or a thick mark, never a hairline or a label.
 *
 * And rank is never left to colour alone: see LevelMeter at the foot of this
 * file, which counts the level out in bars.
 */
export const TONE = {
  ink: "var(--color-dash-ink)",
  muted: "var(--color-dash-line)",
  good: "var(--color-ok-500)",
  warn: "var(--color-flag-500)",
  /* One step lighter than `alert`, same hue. Ordinal, not a second accent. */
  serious: "var(--color-red-400)",
  alert: "var(--color-red-500)",
};

const TEXT_TONE = {
  ink: "text-dash-ink",
  muted: "text-dash-muted",
  good: "text-ok-600",
  /* amber-700 rather than -500: text on the surface has to clear contrast,
     and the fill tone above does not. */
  warn: "text-flag-700",
  serious: "text-red-600",
  alert: "text-red-700",
};

/* ------------------------------------------------------------------ tile */

/**
 * A stat tile: the figure, what it is out of, and which way it is going.
 *
 * `share` is drawn as a hairline meter under the number rather than as a
 * second figure competing with it. A tile with an `onClick` is a door — a
 * number somebody wants to look into and cannot is a number they photograph
 * and carry to another screen by hand.
 */
export function Tile({
  label,
  value,
  unit = null,
  of = null,
  share = null,
  delta = null,
  foot = null,
  tone = "ink",
  size = "md",
  icon: Icon,
  onClick,
}) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      {...(onClick ? { type: "button", onClick } : {})}
      className={cn(
        "rounded-dash border border-dash-line bg-dash-card p-5 text-left shadow-e2",
        onClick &&
          "transition-[border-color,box-shadow] hover:border-dash-ink hover:shadow-e3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-[0.6875rem] font-bold tracking-[0.12em] text-dash-muted uppercase">
          {label}
        </span>
        {Icon && <Icon size={15} strokeWidth={2.25} className="shrink-0 text-dash-muted" />}
      </span>

      <span className="mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span
          className={cn(
            "figure leading-none font-bold tracking-[-0.03em] tabular-nums",
            size === "lg" ? "text-[2.5rem]" : "text-[1.875rem]",
            TEXT_TONE[tone]
          )}
        >
          {value}
        </span>
        {unit && <span className="text-[0.875rem] font-semibold text-dash-muted">{unit}</span>}
        {of !== null && (
          <span className="figure text-[0.9375rem] text-dash-muted tabular-nums">/{of}</span>
        )}
        {delta !== null && <Delta value={delta} />}
      </span>

      {share !== null && (
        <span className="mt-2.5 block">
          <Meter share={share} tone={tone} />
        </span>
      )}

      {foot && <span className="mt-2 block text-[0.8125rem] leading-snug text-dash-muted">{foot}</span>}
    </Tag>
  );
}

/** A signed change, in the smallest form that still reads at a glance. */
export function Delta({ value, suffix = "" }) {
  if (!value) return <span className="text-[0.8125rem] text-dash-muted">no change</span>;
  return (
    <span
      className={cn(
        "figure rounded-full px-1.5 py-0.5 text-[0.75rem] font-bold tabular-nums",
        value > 0 ? "bg-ok-50 text-ok-700" : "bg-red-50 text-red-700"
      )}
    >
      {value > 0 ? "+" : "−"}
      {formatNumber(Math.abs(value))}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ meter */

/** One ratio against its limit. `share` is a percentage, 0–100. */
export function Meter({ share, tone = "ink", height = 6, className }) {
  return (
    <span
      className={cn("block overflow-hidden rounded-full bg-dash-bg", className)}
      style={{ height }}
      aria-hidden="true"
    >
      <span
        className="block h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, share))}%`, background: TONE[tone] }}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ ranked */

/**
 * Ranked bars: the form for "which of these is biggest".
 *
 * One hue for every bar, never a ramp by size — the length already carries the
 * magnitude, and colouring by it spends the only free channel saying the same
 * thing twice. Scaled to the largest row rather than to the total, so a field
 * of small values still has a shape.
 */
export function Ranked({ rows, tone = "ink", showShare = true, of = null, empty = null }) {
  if (!rows.length) {
    return empty ? <p className="text-[0.875rem] text-dash-muted">{empty}</p> : null;
  }

  const top = Math.max(...rows.map((row) => row.value), 1);
  const whole = of ?? rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id ?? row.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[0.8125rem] font-semibold text-dash-ink">
              {row.label}
            </span>
            <span className="figure shrink-0 text-[0.8125rem] font-bold text-dash-ink tabular-nums">
              {formatNumber(row.value)}
              {showShare && whole ? (
                <span className="ml-1.5 font-normal text-dash-muted">
                  {formatShare((row.value / whole) * 100)}
                </span>
              ) : null}
            </span>
          </div>
          <Meter share={(row.value / top) * 100} tone={row.tone ?? tone} height={5} className="mt-1" />
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------- part/whole */

/**
 * A part-to-whole bar: segments, a 2px gap between them, and a legend that
 * carries the figures. Never a pie — these are values people compare, and two
 * close slices of a circle are two slices nobody can compare.
 *
 * Segments under 6% are not labelled inside the bar. A label that does not fit
 * with its padding goes to the legend, where there is room for it.
 */
export function Split({ segments, total = null, legend = true }) {
  const whole = total ?? segments.reduce((sum, part) => sum + part.value, 0);
  if (!whole) return null;

  return (
    <div>
      <div className="flex h-7 w-full gap-0.5 overflow-hidden" aria-hidden="true">
        {segments
          .filter((part) => part.value > 0)
          .map((part, index) => {
            const share = (part.value / whole) * 100;
            return (
              <div
                key={part.id ?? part.label}
                title={`${part.label}: ${formatNumber(part.value)} (${formatShare(share)})`}
                className="flex items-center justify-center overflow-hidden first:rounded-l-sm last:rounded-r-sm"
                style={{ width: `${share}%`, background: part.color ?? RAMP[index % RAMP.length] }}
              >
                {share >= 12 && (
                  <span className="figure px-1 text-[0.6875rem] font-bold text-white tabular-nums">
                    {formatShare(share)}
                  </span>
                )}
              </div>
            );
          })}
      </div>

      {legend && (
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {segments.map((part, index) => (
            <li key={part.id ?? part.label} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ background: part.color ?? RAMP[index % RAMP.length] }}
              />
              <span className="text-[0.75rem] text-dash-muted">{part.label}</span>
              <span className="figure text-[0.75rem] font-bold text-dash-ink tabular-nums">
                {formatNumber(part.value)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- columns */

/**
 * Counts over time, one column per bucket.
 *
 * Columns rather than a line because these are counts in discrete windows, not
 * a continuous quantity — and because an empty bucket has to read as empty. A
 * line drawn through the hour nothing arrived would smooth over the one thing
 * this chart exists to show.
 */
export function Columns({ points, height = 96, tone = "ink", label = (point) => point.label }) {
  if (!points?.length) return null;
  const peak = Math.max(1, ...points.map((point) => point.value));

  return (
    <div>
      <div className="flex items-end gap-0.5" style={{ height }} aria-hidden="true">
        {points.map((point, index) => (
          <div
            key={point.id ?? index}
            title={`${label(point)}: ${formatNumber(point.value)}`}
            className="flex-1 rounded-t-[3px] transition-[height] duration-500"
            style={{
              height: `${point.value ? Math.max(4, (point.value / peak) * 100) : 1}%`,
              background: point.value ? TONE[tone] : "var(--color-dash-line)",
            }}
          />
        ))}
      </div>
      <p className="sr-only">
        {points.map((point) => `${label(point)}: ${point.value}`).join(". ")}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- frame */

/** The card every figure above sits in. Title left, one figure right. */
export function Panel({ title, figure, foot, children, className, ...props }) {
  return (
    <section
      className={cn("rounded-dash border border-dash-line bg-dash-card p-5 shadow-e2", className)}
      {...props}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[0.6875rem] font-bold tracking-[0.12em] text-dash-muted uppercase">
          {title}
        </h3>
        {figure && (
          <span className="figure shrink-0 text-[0.875rem] font-bold text-dash-ink tabular-nums">
            {figure}
          </span>
        )}
      </div>
      <div className="mt-4">{children}</div>
      {foot && <p className="mt-3 text-[0.8125rem] leading-snug text-dash-muted">{foot}</p>}
    </section>
  );
}

/** A label and a figure on one line. The densest form there is. */
export function Readout({ label, value, sub = null, tone = "ink", onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button", onClick } : {})}
      className={cn(
        "flex w-full items-baseline justify-between gap-3 py-1.5 text-left",
        onClick &&
          "rounded-dash-sm px-1 transition-colors hover:bg-dash-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
      )}
    >
      <span className="truncate text-[0.875rem] text-dash-muted">{label}</span>
      <span className="flex shrink-0 items-baseline gap-1.5">
        <span className={cn("figure text-[1rem] font-bold tabular-nums", TEXT_TONE[tone])}>
          {value}
        </span>
        {sub && <span className="text-[0.75rem] text-dash-muted">{sub}</span>}
      </span>
    </Tag>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   INFOGRAPHICS

   Everything above draws a number beside a bar. Everything below draws the
   number *as* a shape, because a room reads a shape across three metres and
   reads a sentence at one.

   ── THE RULE THESE ALL OBEY, AND WHY IT IS NOT "USE MORE COLOUR" ──────────
   Colour carries at most one thing on this dashboard: status. Everything
   ordered is one hue getting darker, everything about identity is the party
   colours, and nothing is ever coloured by its rank — the length already
   carries the magnitude, and colouring by it spends the only free channel
   saying the same thing twice.

   Every mark here is also readable without colour. The gauge prints its
   figure, the funnel prints its counts, the level meter is a stepped glyph
   before it is a hue. That is not only an accessibility position: this is a
   product whose output ends up photographed off a wall and printed in black
   and white, and a chart that dies in greyscale dies on the night it matters.
   ══════════════════════════════════════════════════════════════════════════ */

/* ------------------------------------------------------------------ gauge */

/**
 * One ratio against its limit, drawn as an arc with the figure inside it.
 *
 * ── WHY AN ARC AND NOT A SECOND BAR ────────────────────────────────────────
 * A dashboard of nothing but bars has no hierarchy: the headline coverage
 * figure and the ninth row of a ranked list are the same object, so the eye
 * has nothing to land on first. An arc is the one form here that reads as a
 * *destination* rather than as a row, so it is reserved for the single figure
 * a screen is actually about — never more than one to a screen.
 *
 * 270°, not 360°, so the empty part of the track is visibly empty. A full ring
 * at 95% and a full ring at 100% are the same picture.
 */
export function Gauge({
  share,
  label = null,
  figure = null,
  sub = null,
  tone = "ink",
  size = 132,
  track = 10,
  children,
}) {
  const value = Math.max(0, Math.min(100, share ?? 0));
  const r = (size - track) / 2;
  const sweep = 0.75; // 270° of the circle
  const length = 2 * Math.PI * r;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        /* Rotated so the gap sits at the bottom, where a reader's eye is least
           likely to mistake it for a segment. */
        style={{ transform: "rotate(135deg)" }}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-dash-bg)"
          strokeWidth={track}
          strokeLinecap="round"
          strokeDasharray={`${length * sweep} ${length}`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE[tone]}
          strokeWidth={track}
          strokeLinecap="round"
          strokeDasharray={`${length * sweep * (value / 100)} ${length}`}
          className="transition-[stroke-dasharray] duration-700"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
        {children ?? (
          <>
            <span
              className={cn(
                "figure leading-none font-bold tracking-[-0.03em] tabular-nums",
                size >= 120 ? "text-[1.75rem]" : "text-[1.25rem]",
                TEXT_TONE[tone]
              )}
            >
              {figure ?? formatShare(value)}
            </span>
            {label && (
              <span className="mt-1 text-[0.625rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                {label}
              </span>
            )}
            {sub && <span className="mt-0.5 text-[0.6875rem] text-dash-muted">{sub}</span>}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ donut */

/**
 * Part-to-whole as a ring. Six segments at the very most.
 *
 * A ring rather than a pie because the hole is where the total goes, and the
 * total is the thing that makes every segment legible. Two close segments are
 * still two close segments — where the reader has to *compare* them rather
 * than see the shape of the whole, `Split` is the right form and this is not.
 */
export function Donut({ segments, total = null, size = 132, track = 14, centre = null }) {
  const whole = total ?? segments.reduce((sum, part) => sum + part.value, 0);
  const r = (size - track) / 2;
  const length = 2 * Math.PI * r;
  /* Each arc is drawn 2px short of its true length rather than being given a
     stroke: a 2px gap in the surface colour separates segments without an
     outline round every wedge, which reads as chrome and thickens the mark. */
  let offset = 0;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-dash-bg)"
          strokeWidth={track}
        />
        {whole > 0 &&
          segments
            .filter((part) => part.value > 0)
            .map((part, index) => {
              const share = (part.value / whole) * 100;
              const dash = Math.max(0, (length * share) / 100 - 2);
              const node = (
                <circle
                  key={part.id ?? part.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={part.color ?? RAMP[index % RAMP.length]}
                  strokeWidth={track}
                  strokeDasharray={`${dash} ${length - dash}`}
                  strokeDashoffset={-((length * offset) / 100)}
                  className="transition-[stroke-dasharray] duration-700"
                >
                  <title>{`${part.label}: ${formatNumber(part.value)} (${formatShare(share)})`}</title>
                </circle>
              );
              offset += share;
              return node;
            })}
      </svg>

      {centre && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          {centre}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- waffle */

/**
 * A hundred cells, and the ones that are the point are filled.
 *
 * ── THE ONE FORM THAT MAKES A SMALL SHARE FEEL SMALL ───────────────────────
 * "3% of booths have not reported" and a bar that is almost full are the same
 * fact drawn so as to be dismissed. Three filled cells out of a hundred is the
 * same fact drawn so as to be counted, and a room that can count them argues
 * about them properly.
 *
 * Each cell is a percentage point, not a booth, and the caption says so — a
 * grid somebody believes is one-cell-one-booth is a grid that will be counted
 * and quoted wrongly.
 */
export function Waffle({ share, tone = "ink", cells = 100, columns = 20, label = null }) {
  const on = Math.round((Math.max(0, Math.min(100, share ?? 0)) / 100) * cells);

  return (
    <div>
      <div
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {Array.from({ length: cells }, (_, index) => (
          <span
            key={index}
            className="aspect-square rounded-[1.5px] transition-colors duration-500"
            style={{ background: index < on ? TONE[tone] : "var(--color-dash-bg)" }}
          />
        ))}
      </div>
      {label && <p className="mt-2 text-[0.75rem] text-dash-muted">{label}</p>}
      <p className="sr-only">{formatShare(share ?? 0)}. Each cell is one percentage point.</p>
    </div>
  );
}

/* ----------------------------------------------------------------- funnel */

/**
 * A pipeline drawn as flow, with the loss between two rungs visible as the
 * shape that goes missing.
 *
 * ── WHY A TAPER AND NOT SIX BARS ───────────────────────────────────────────
 * Six bars of decreasing length report that fewer things reach the end than
 * start, which nobody needed a chart to learn. What a room needs is the
 * *difference*, because a difference is a pile of work with somebody's name on
 * it — and a taper draws the difference as an actual wedge of missing area
 * rather than as an arithmetic exercise between two bar ends.
 *
 * The wedge is amber only where returns are held; where the drop is somebody
 * legitimately not owing that step, it stays neutral. Status colour is for
 * status, here as everywhere.
 */
export function Funnel({ stages, height = 44, gap = 3, onPick }) {
  const top = Math.max(1, stages[0]?.count ?? 1);
  const width = 1000;

  return (
    <div>
      {/* ── WHY THERE IS NO PIXEL HEIGHT ON THIS ────────────────────────
          A viewBox plus a fixed pixel height is two aspect ratios, and SVG
          resolves the disagreement by letterboxing: the funnel would sit in
          the middle of its own box with air either side and never fill the
          card. `h-auto` lets the one ratio the viewBox declares be the ratio
          it is drawn at, so the labels scale with the bands instead of
          drifting off them. */}
      <svg
        viewBox={`0 0 ${width} ${stages.length * (height + gap)}`}
        className="h-auto w-full"
        role="img"
        aria-label="The pipeline, rung by rung"
      >
        {stages.map((stage, index) => {
          const next = stages[index + 1];
          const w = (stage.count / top) * width;
          const wNext = next ? (next.count / top) * width : w;
          const y = index * (height + gap);
          const held = stage.held > 0;

          /* The band itself, and then the taper into the next one. Drawn as
             one path so the two never separate by a rounding pixel. */
          const x = (width - w) / 2;
          const xNext = (width - wNext) / 2;
          /* Wide enough for a label and a figure with air between them. Below
             this the band gets neither and both sit outside it. */
          const inside = w > 300;

          return (
            <g key={stage.id}>
              {next && (
                <path
                  d={`M${x} ${y + height} L${x + w} ${y + height} L${xNext + wNext} ${y + height + gap} L${xNext} ${y + height + gap} Z`}
                  fill={held ? "var(--color-flag-500)" : "var(--color-dash-line)"}
                  opacity={held ? 0.5 : 1}
                />
              )}
              <rect
                x={x}
                y={y}
                width={Math.max(2, w)}
                height={height}
                rx={4}
                fill={held ? "var(--color-flag-500)" : "var(--color-dash-ink)"}
                className={cn("transition-all duration-700", onPick && "cursor-pointer")}
                onClick={onPick ? () => onPick(stage.id) : undefined}
              >
                <title>
                  {`${stage.label}: ${formatNumber(stage.count)}${stage.held ? ` · ${formatNumber(stage.held)} held here` : ""}`}
                </title>
              </rect>

              {/* ── DIRECT LABELS, AND THE ONE WAY THEY GO WRONG ──────────
                  Inside the band while it is wide enough to hold them, and
                  outside it when it is not. The count is anchored to a fixed
                  edge in both cases rather than positioned relative to the
                  label: guessing a label's rendered width from its character
                  count is how two labels end up on top of each other at the
                  one font size nobody tested. */}
              <text
                x={inside ? x + 14 : x + w + 12}
                y={y + height / 2 + 5}
                className="figure"
                fontSize="14"
                fontWeight="600"
                fill={inside ? "#ffffff" : "var(--color-dash-ink)"}
              >
                {stage.label}
              </text>
              <text
                x={inside ? x + w - 14 : width}
                y={y + height / 2 + 5}
                textAnchor="end"
                className="figure"
                fontSize="15"
                fontWeight="700"
                fill={inside ? "#ffffff" : "var(--color-dash-ink)"}
              >
                {formatNumber(stage.count)}
              </text>
            </g>
          );
        })}
      </svg>

      <table className="sr-only">
        <caption>The pipeline</caption>
        <tbody>
          {stages.map((stage) => (
            <tr key={stage.id}>
              <th scope="row">{stage.label}</th>
              <td>{stage.count}</td>
              <td>{stage.held} held</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------ level meter */

/**
 * How loud something is, as a stepped glyph.
 *
 * ── THIS EXISTS BECAUSE FIVE STATUS COLOURS DO NOT WORK ────────────────────
 * A five-step warning scale wants five hues, and the warm end of any palette
 * cannot supply them: run the numbers on green/blue/amber/orange/red and the
 * amber-to-orange pair separates by ΔE 1.6 for a deuteranope and 6.7 for
 * somebody with full colour vision. That is not a near miss. Those two steps
 * are the same colour, and they are the two steps a room most needs to tell
 * apart, because they are the boundary between "worth a call" and "this will
 * cost the night".
 *
 * So rank is carried by *count* — one filled bar to five — which is exact,
 * countable, survives greyscale, and is the same glyph everybody already
 * reads for signal strength. Colour rides along on top of it and is never
 * asked to do the work alone.
 */
export function LevelMeter({ rank, of = 5, tone = "ink", size = 4 }) {
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden="true">
      {Array.from({ length: of }, (_, index) => (
        <span
          key={index}
          className="rounded-[1px] transition-colors duration-500"
          style={{
            width: size,
            height: size * (1.5 + index * 0.75),
            background: index < rank ? TONE[tone] : "var(--color-dash-line)",
          }}
        />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ track */

/**
 * Things that happened, on a line, at the time they happened.
 *
 * A timeline drawn as an evenly-spaced list is a list. Placing each mark at
 * its real position on the clock is what turns it into a picture: the two
 * hours where nothing happened become a visible two hours of nothing, which
 * is the finding a list of eight tidy rows destroys.
 */
export function Track({ points, from, to, height = 56, label = (point) => point.label }) {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  const span = Math.max(1, end - start);
  const at = (when) => ((new Date(when).getTime() - start) / span) * 100;

  /* ── TWO MARKS FIVE MINUTES APART ON A FOURTEEN-HOUR AXIS ───────────────
     They land 0.6% apart, which at the width this is drawn is about four
     pixels, and two nine-pixel dots four pixels apart are one smudge. The
     position is still the point, so they are not re-ordered or binned — each
     is nudged right only as far as it has to be to clear the one before it,
     which keeps the sequence true and the earliest mark exactly where it
     belongs. The tooltip carries the real time either way. */
  const MIN_GAP = 1.7;
  const placed = [];
  let last = -Infinity;

  for (const point of points.filter((row) => row.at).sort((a, b) => new Date(a.at) - new Date(b.at))) {
    const want = Math.max(0, Math.min(100, at(point.at)));
    const x = Math.min(100, Math.max(want, last + MIN_GAP));
    placed.push({ ...point, x });
    last = x;
  }

  return (
    <div className="relative" style={{ height }}>
      <span
        aria-hidden="true"
        className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-dash-line"
      />
      {placed.map((point) => {
          const x = point.x;
          return (
            <span
              key={point.id}
              title={`${label(point)} · ${new Date(point.at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false })}`}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%` }}
            >
              <span
                className="block rounded-full ring-2 ring-dash-card"
                style={{
                  width: point.big ? 13 : 9,
                  height: point.big ? 13 : 9,
                  background: TONE[point.tone ?? "ink"],
                }}
              />
            </span>
          );
        })}
      <p className="sr-only">
        {points
          .filter((point) => point.at)
          .map(
            (point) =>
              `${label(point)} at ${new Date(point.at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false })}`
          )
          .join(". ")}
      </p>
    </div>
  );
}
/* ----------------------------------------------------------------- minimap */

/**
 * The country, small, coloured by whatever this panel is about.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY EVERY OPERATIONAL SCREEN GETS A MAP AND NOT A TABLE OF STATES
 *
 *  Every one of these surfaces had a "By state" table: five columns, up to
 *  thirty-seven rows, sorted by something. It is the most complete way to
 *  present the data and the least useful, because the question actually being
 *  asked of it is never "what is Kebbi's figure" — it is "where is this going
 *  wrong", and a region going dark is a shape. A table cannot show a shape.
 *  The reader has to reconstruct the map in their head from thirty-seven rows,
 *  every time.
 *
 *  So the map is the panel and the table, where it survives at all, is
 *  underneath it for the reader who wants to look one figure up.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Deliberately dumb about meaning: it is handed a fill per state code and
 * draws it. What the colours mean is the caller's business, and the caller
 * prints the key — see the surfaces that use it.
 *
 * @param shapes  the national outline, { width, height, states: [{ code, name, d, at }] }
 * @param fills   code -> a CSS colour. A code that is missing is drawn silent.
 * @param notes   code -> the line the hover tooltip carries.
 */
export function MiniMap({ shapes, fills = {}, notes = {}, onOpen, selected = null, height = 220 }) {
  if (!shapes?.states?.length) return null;

  return (
    <svg
      viewBox={`0 0 ${shapes.width} ${shapes.height}`}
      style={{ height }}
      className="w-full"
      role="img"
      aria-label="Map of the states. The same figures are listed beside it."
    >
      {shapes.states.map((state) => {
        const active = selected === state.code;
        return (
          <path
            key={state.code}
            d={state.d}
            fill={fills[state.code] ?? "var(--color-dash-bg)"}
            stroke={active ? "var(--color-dash-ink)" : "#ffffff"}
            strokeWidth={active ? 3 : 1.2}
            strokeLinejoin="round"
            onClick={onOpen ? () => onOpen(state.code) : undefined}
            className={cn(
              onOpen && "cursor-pointer",
              selected && !active ? "opacity-45" : "opacity-100",
              "transition-opacity"
            )}
          >
            {/* One string rather than two children: the DOM merges adjacent
                text nodes inside a <title>, so React would hydrate against one
                node where it rendered two and report a mismatch on every
                state, on every load. Same reason as StateMap. */}
            <title>{`${state.name}${notes[state.code] ? `, ${notes[state.code]}` : ""}`}</title>
          </path>
        );
      })}
    </svg>
  );
}
