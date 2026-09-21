import { cn, formatNumber, formatShare } from "@/lib/utils";
/* ── THE ARITHMETIC IS NOT IN THIS FILE, ON PURPOSE ────────────────────────
   Every mapping from a number to a position lives in lib/console-charts.js,
   where a test can pin it without a browser. A chart that misplaces a figure
   is not ugly, it is false, and it is false in the way nobody checks. */
import {
  bandFor,
  barPercent,
  beyondScale,
  meterPosition,
  minutesSince,
  recencyPosition,
  splitShares,
} from "@/lib/console-charts";

/**
 * The console's pictures.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SYSTEM CONSOLE WAS ALL WORDS, AND WORDS ARE THE WRONG FORM FOR IT
 *
 *  Every screen under /admin answered its question in a sentence and a
 *  table: "342 ms", "6 of 7 checks pass", "last message 41 minutes ago".
 *  Each of those is correct and each of them has to be *read* — and the
 *  person opening the console is doing it at 2am, between two phone calls,
 *  to find out whether anything is wrong. Reading is the slowest way to
 *  answer that, and it is the only way this console offered.
 *
 *  A picture answers it before it is read. A latency of 342 ms is a marker
 *  sitting in the green band; 2,400 ms is the same marker off the end of the
 *  scale, and the eye has the answer at a glance and across a room. Nothing
 *  below invents a figure or softens one — every mark here is drawn from the
 *  same number the sentence used to print, and the sentence is still printed
 *  beside it.
 *
 *  ── WHAT THESE ARE NOT ──────────────────────────────────────────────────
 *  Not a charting library, for the reason Charts.jsx already gives: a
 *  dependency that ships a canvas renderer and its own colour opinions to
 *  draw four bars is a poor trade in a product that must stay legible under
 *  forced colours and in a photocopy.
 *
 *  Not client components, either. The console is server-rendered, these are
 *  static SVG, and the hover text is a native <title> the browser draws for
 *  free. A tooltip worth a kilobyte of JavaScript on a page whose whole job
 *  is to load when things are broken is not worth it.
 *
 *  ── THE RULES EVERY MARK HERE FOLLOWS ───────────────────────────────────
 *  · colour is never the only encoding — every coloured mark carries a word
 *    and a figure beside it, so the console survives a colourblind reader,
 *    forced colours, and a black-and-white print;
 *  · status colour is reserved. Emerald, amber and red mean "fine",
 *    "somebody should look" and "act" on every screen in this product, and
 *    nothing here spends them on a category;
 *  · anything that is a magnitude is drawn in one ink, light to dark. A
 *    rainbow across eight roles would imply eight kinds of thing where there
 *    is one kind of thing at eight sizes;
 *  · fills that touch are separated by a 2px gap of the surface colour, so
 *    two adjacent segments never read as one;
 *  · the grid, where there is one, is recessive — present enough to judge a
 *    height against, never competing with the data.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ── THE STATUS PALETTE, IN ONE PLACE ──────────────────────────────────────
   Checked rather than chosen: these three were run through a contrast and
   colour-vision separation check against the console's white surface before
   being used. Amber is the 600 step rather than the 500 everything else in
   the product uses, because at 500 it falls under 3:1 against white and a
   band nobody can see is a band that is not there.

   The neutral is deliberately grey and deliberately not in that check. It is
   not a fourth category, it is the absence of one — "shut off", "nothing
   here", "never used" — and grey is what that should look like. */
const TONE_FILL = {
  good: "var(--color-ok-600)",
  warn: "var(--color-flag-600)",
  alert: "var(--color-red-600)",
  ink: "var(--color-dash-ink)",
  neutral: "var(--color-dash-line)",
};

const TONE_TEXT = {
  good: "text-ok-700",
  warn: "text-flag-700",
  alert: "text-red-600",
  ink: "text-dash-ink",
  neutral: "text-dash-muted",
};

/** The label above every mark on these screens. One style, eight uses. */
function Kicker({ children, className }) {
  return (
    <p
      className={cn(
        "text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase",
        className
      )}
    >
      {children}
    </p>
  );
}

/* ═══════════════════════════════════════════════════════════════════ a ring
 *
 * One proportion, drawn as an arc, with the figure inside it.
 *
 * ── WHY A RING AND NOT A BAR, HERE AND ONLY HERE ───────────────────────────
 * A ring is the wrong form for comparing several quantities — the eye judges
 * angle far worse than length, which is why every comparison on these screens
 * is a bar. It is the right form for exactly one job: a single share that is
 * the headline of its card, where the shape has to be readable across a room
 * and the middle is free for the number itself. "6 of 7 checks pass" is that
 * job. A row of rings would not be.
 *
 * The track is always drawn, so an empty ring is visibly "none of it" rather
 * than ambiguously "nothing rendered".
 */
export function Ring({
  value,
  of,
  label,
  caption,
  tone = "ink",
  size = 132,
  display,
}) {
  const total = of > 0 ? of : 0;
  const share = total ? Math.min(1, Math.max(0, value / total)) : 0;

  /* Geometry. The stroke is thin — 8% of the diameter — because a fat donut
     reads as a pie and starts inviting angle comparisons the form cannot
     support. */
  const stroke = Math.round(size * 0.08);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <figure className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="shrink-0"
        role="img"
        aria-label={`${label}: ${formatNumber(value)} of ${formatNumber(total)}, ${formatShare(share * 100)}.`}
      >
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-dash-bg)"
            strokeWidth={stroke}
          />
          {share > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={TONE_FILL[tone] ?? TONE_FILL.ink}
              strokeWidth={stroke}
              strokeLinecap="round"
              /* The whole arc as one dash, and the rest as the gap. Drawn this
                 way rather than as an arc path because a path has to special-
                 case the 100% turn, and a dash array simply closes. */
              strokeDasharray={`${circumference * share} ${circumference}`}
            />
          )}
        </g>

        {/* The figure lives in the hole. Rendered as SVG text rather than
            positioned over the top with CSS so that the whole mark scales,
            prints and screenshots as one object. */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className={cn("figure font-bold", TONE_TEXT[tone] ?? TONE_TEXT.ink)}
          style={{ fontSize: `${Math.round(size * 0.24)}px` }}
        >
          {display ?? formatShare(share * 100)}
        </text>
      </svg>

      <figcaption className="mt-3 text-center">
        <Kicker>{label}</Kicker>
        {caption && <p className="mt-1 text-[0.8125rem] text-dash-muted">{caption}</p>}
      </figcaption>
    </figure>
  );
}

/* ══════════════════════════════════════════════════════════════════ a meter
 *
 * A measured value against the thresholds that decide what it means.
 *
 * ── THE FIGURE WAS NEVER THE PROBLEM ───────────────────────────────────────
 * The health page printed "342 ms" and coloured it. That tells somebody who
 * already knows what a good latency is precisely what they already knew, and
 * tells everybody else nothing at all: is 342 fine? Is 900? The number people
 * actually want is not the reading, it is the distance to the line — and the
 * line was in a comparison buried in the page's JSX.
 *
 * So the bands are drawn. Each one is named, the reading sits on them, and
 * the threshold that would change the answer is a visible edge rather than a
 * literal in a ternary. A room that cannot see the threshold cannot argue
 * with the alert; the same principle lib/alerts.js states for the warnings.
 *
 * `bands` run left to right and must be given in order, each with the value
 * it extends to. The last one is the top of the scale.
 */
export function Meter({ value, bands, unit, label, caption, over }) {
  const ceiling = bands.at(-1).to;
  /* A reading past the top of the scale is pinned to the end and *said* to be
     pinned, rather than silently drawn as though it were the ceiling. The
     difference between a 3-second query and a 30-second one is the difference
     between slow and gone, and a bar that maxes out hides it. */
  const beyond = beyondScale(value, ceiling);
  const position = meterPosition(value, ceiling);
  const band = bandFor(value, bands);
  const tone = beyond ? "alert" : (band?.tone ?? "neutral");

  return (
    <figure>
      <div className="flex items-baseline justify-between gap-3">
        <Kicker>{label}</Kicker>
        <p className={cn("figure text-[1.375rem] leading-none font-bold", TONE_TEXT[tone])}>
          {value === null ? over ?? "no answer" : `${formatNumber(value)}${unit ? ` ${unit}` : ""}`}
        </p>
      </div>

      <div className="mt-3">
        {/* The bands. A 2px gap of the surface between them, so two adjacent
            tones never merge into one longer band. */}
        <div className="flex h-2.5 w-full gap-[2px]">
          {bands.map((row, index) => {
            const from = index === 0 ? 0 : bands[index - 1].to;
            return (
              <div
                key={row.label}
                title={`${row.label}: ${formatNumber(from)}–${formatNumber(row.to)}${unit ? ` ${unit}` : ""}`}
                className={cn(
                  "h-full",
                  index === 0 && "rounded-l-full",
                  index === bands.length - 1 && "rounded-r-full"
                )}
                style={{
                  flexGrow: row.to - from,
                  /* The band a reading is *in* is drawn at full strength and
                     the others are held back, so the answer is the loudest
                     thing in the mark rather than one of four equal stripes. */
                  background: TONE_FILL[row.tone],
                  opacity: band === row && !beyond ? 1 : 0.22,
                }}
              />
            );
          })}
        </div>

        {/* The reading itself: a needle, not a fill. A filled bar would say
            "this much of something", and latency is not a quantity anybody is
            accumulating — it is a position on a scale. */}
        {value !== null && (
          <div className="relative h-4">
            <div
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${position * 100}%` }}
              aria-hidden="true"
            >
              <div className={cn("h-2.5 w-0.5", beyond ? "bg-red-600" : "bg-dash-ink")} />
            </div>
          </div>
        )}

        <div className="flex justify-between text-[0.6875rem] text-dash-muted">
          {bands.map((row) => (
            <span key={row.label} className={cn(band === row && !beyond && "font-bold text-dash-ink")}>
              {row.label}
            </span>
          ))}
        </div>
      </div>

      {(caption || beyond) && (
        <figcaption className="mt-2 text-[0.8125rem] text-dash-muted">
          {beyond
            ? `Past the end of this scale — over ${formatNumber(ceiling)}${unit ? ` ${unit}` : ""}.`
            : caption}
        </figcaption>
      )}
    </figure>
  );
}

/* ═══════════════════════════════════════════════════════════ a split of one
 *
 * A whole, divided, with every part named and counted on the mark.
 *
 * ── WHY THE LABELS ARE NOT A LEGEND ────────────────────────────────────────
 * A legend makes the reader carry a colour across the card and match it to a
 * swatch, which is work, and is work that fails outright for a reader who
 * cannot tell two of the colours apart. Where a segment is wide enough its
 * name and count are written under it; where it is too thin to hold them,
 * they move to the list below, which is always drawn. Nothing here is ever
 * identified by its colour alone.
 */
/**
 * `depth` on a segment, instead of `tone`, for a scale rather than a state.
 *
 * ── STATUS COLOUR IS RESERVED, AND THIS IS WHY IT MATTERS HERE ─────────────
 * The data-sources screen divides returns by how they arrived: filed by the
 * agent standing at the booth, read down a phone, typed by a desk before
 * polling day. That is an *ordered* scale of evidence, not a set of states —
 * a desk-entered return is weaker, and it is not a warning, and it is
 * certainly not an error. Painting it amber would say the count contains
 * something wrong, when what it contains is something ordinary that deserves
 * less weight.
 *
 * So an ordered scale gets one ink, deepening along it, which is the rule
 * every magnitude on these screens follows. Red and amber stay available to
 * mean what they mean everywhere else in this product: somebody has to look.
 */
const rampFill = (depth) =>
  `color-mix(in oklab, var(--color-dash-ink) ${Math.round(25 + Math.max(0, Math.min(1, depth)) * 70)}%, var(--color-dash-line))`;

const fillFor = (row) =>
  row.depth !== undefined ? rampFill(row.depth) : (TONE_FILL[row.tone] ?? TONE_FILL.neutral);

export function Split({ segments, label, caption, className }) {
  const total = segments.reduce((sum, row) => sum + row.value, 0);
  if (total === 0) {
    return (
      <div className={className}>
        {label && <Kicker>{label}</Kicker>}
        <p className="mt-2 rounded-dash-sm bg-dash-bg px-4 py-5 text-center text-[0.875rem] text-dash-muted">
          Nothing to divide yet.
        </p>
      </div>
    );
  }

  const shown = splitShares(segments);

  return (
    <figure className={className}>
      {label && (
        <div className="flex items-baseline justify-between gap-3">
          <Kicker>{label}</Kicker>
          <span className="figure text-[0.8125rem] font-bold text-dash-ink">
            {formatNumber(total)}
          </span>
        </div>
      )}

      <div
        className="mt-2.5 flex h-3 w-full gap-[2px] overflow-hidden"
        role="img"
        aria-label={`${label ?? "Split"}: ${shown
          .map((row) => `${row.label} ${formatNumber(row.value)}`)
          .join(", ")}.`}
      >
        {shown.map((row, index) => (
          <div
            key={row.label}
            title={`${row.label}: ${formatNumber(row.value)} (${formatShare((row.value / total) * 100)})`}
            className={cn(
              "h-full",
              index === 0 && "rounded-l-full",
              index === shown.length - 1 && "rounded-r-full"
            )}
            style={{
              flexGrow: row.value,
              /* A floor, so a real but tiny segment cannot vanish. One
                 disabled account out of four hundred still has to be a
                 visible sliver — it is the one somebody came to look for. */
              minWidth: "3px",
              background: fillFor(row),
            }}
          />
        ))}
      </div>

      <figcaption className="mt-3">
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
          {shown.map((row) => (
            <li key={row.label} className="flex items-baseline gap-2 text-[0.8125rem]">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 translate-y-[-1px] rounded-full"
                style={{ background: fillFor(row) }}
              />
              <span className="figure font-bold text-dash-ink">{formatNumber(row.value)}</span>
              <span className="text-dash-muted">{row.label}</span>
            </li>
          ))}
        </ul>
        {caption && <p className="mt-2 text-[0.8125rem] text-dash-muted">{caption}</p>}
      </figcaption>
    </figure>
  );
}

/* ══════════════════════════════════════════════════════════════ ranked bars
 *
 * Several quantities of the same kind, longest first.
 *
 * ── ONE INK, NOT EIGHT HUES ────────────────────────────────────────────────
 * These rows are one kind of thing at different sizes — eight tables with
 * different row counts, six roles with different headcounts — and giving each
 * one its own colour would say they are eight different kinds of thing. The
 * bar's length is the whole encoding; the ink only deepens with it, so the
 * ordering survives a greyscale print.
 *
 * Scaled to the largest row rather than to a round number, for the reason
 * Charts.jsx gives: the shape of the comparison stays legible, and the figure
 * is printed anyway so nobody has to measure against an axis.
 */
export function Ranked({ rows, label, caption, className, href }) {
  const shown = [...rows].sort((a, b) => b.value - a.value);
  const top = Math.max(...shown.map((row) => row.value), 1);

  return (
    <figure className={className}>
      {label && <Kicker className="mb-3">{label}</Kicker>}

      <ul className="space-y-2.5">
        {shown.map((row) => {
          const share = row.value / top;
          return (
            <li key={row.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-[0.8125rem] font-semibold text-dash-ink">
                  {row.label}
                </span>
                {row.note && (
                  <span className="shrink-0 text-[0.75rem] text-dash-muted">{row.note}</span>
                )}
              </div>
              <span className="figure text-right text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                {row.display ?? formatNumber(row.value)}
              </span>

              <div className="col-span-2 mt-1 h-1.5 w-full rounded-full bg-dash-bg">
                <div
                  className="h-full rounded-full"
                  title={`${row.label}: ${formatNumber(row.value)}`}
                  style={{
                    /* A floor again: a table with three rows in it must not
                       draw as an empty track beside a table with three
                       million, because "a few" and "none" are the two states
                       this screen exists to tell apart. */
                    width: `${barPercent(row.value, top)}%`,
                    background: row.tone
                      ? TONE_FILL[row.tone]
                      : /* Deepens with the value: the leader is full ink, the
                           tail is a light grey, and the ramp is monotonic so
                           it still orders correctly in greyscale. */
                        `color-mix(in oklab, var(--color-dash-ink) ${Math.round(35 + share * 65)}%, var(--color-dash-line))`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {caption && <figcaption className="mt-3 text-[0.8125rem] text-dash-muted">{caption}</figcaption>}
    </figure>
  );
}

/* ══════════════════════════════════════════════════════════════════ recency
 *
 * When each of several things last happened, on one scale.
 *
 * ── THE LIST OF "AGO"s WAS THE WORST THING ON THE CONSOLE ──────────────────
 * Five rows reading "4 minutes ago", "2 hours ago", "31 August, 19:41",
 * "never". Every one of those is a separate arithmetic problem, they are in
 * three different units, and the question being asked of them — "is anything
 * still happening?" — is a comparison the shape of the list actively hides.
 *
 * Here they share an axis, so the answer is the *pattern*: a cluster on the
 * right is a live night, a cluster on the left is a pipe that broke some time
 * ago, and one lonely dot far from the others is the thing to go and look at.
 *
 * ── AND THE AXIS IS LOGARITHMIC, WHICH IS SAID OUT LOUD ────────────────────
 * Linear, a minute and an hour are the same pixel and the whole live end of
 * the scale collapses. The gridlines are therefore labelled with their real
 * times — a minute, an hour, a day — rather than being evenly spaced ticks
 * that quietly are not. An unlabelled log axis is a lie by omission.
 */
const RECENCY_TICKS = [
  { minutes: 1, label: "1 min" },
  { minutes: 60, label: "1 hr" },
  { minutes: 60 * 24, label: "1 day" },
  { minutes: 60 * 24 * 7, label: "1 wk" },
];

export function Recency({ rows, now, label, caption, className }) {
  const horizon = 60 * 24 * 7; /* A week. Older than that is "before this". */
  /* Right edge is "now", left edge is a week ago, and the scale between them
     is log — see recencyPosition, which is where that mapping is tested. */
  const place = (minutes) => recencyPosition(minutes, horizon) ?? 0;

  const measured = rows.map((row) => ({ ...row, minutes: minutesSince(row.at, now) }));

  return (
    <figure className={className}>
      {label && <Kicker className="mb-3">{label}</Kicker>}

      <ul className="space-y-0">
        {measured.map((row) => {
          const dead = row.minutes === null;
          const stale = !dead && row.minutes > 60;
          return (
            <li
              key={row.label}
              className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-x-4 border-t border-dash-line py-2.5 first:border-t-0"
            >
              <span className="truncate text-[0.8125rem] text-dash-ink">{row.label}</span>

              <div className="relative h-5" title={row.title ?? undefined}>
                {/* The scale. Recessive, and drawn on every row so the dots
                    are comparable down the column rather than each floating
                    in its own empty track. */}
                <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-dash-line" />
                {RECENCY_TICKS.map((tick) => (
                  <div
                    key={tick.label}
                    aria-hidden="true"
                    className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-dash-line"
                    style={{ left: `${place(tick.minutes) * 100}%` }}
                  />
                ))}

                {dead ? (
                  /* Never is not a very old time, it is a different fact, so
                     it is not drawn on the scale at all. A dot at the far left
                     would read as "a long time ago", which is a claim this
                     product does not have the evidence to make. */
                  <span className="absolute top-1/2 left-0 -translate-y-1/2 text-[0.6875rem] font-semibold text-dash-muted">
                    never
                  </span>
                ) : (
                  <span
                    className={cn(
                      "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-dash-card",
                      stale ? "bg-flag-600" : "bg-ok-600"
                    )}
                    style={{ left: `${place(row.minutes) * 100}%` }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* The axis, once, under the column. */}
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_9rem] gap-x-4">
        <span />
        <div className="relative h-4">
          {RECENCY_TICKS.map((tick) => (
            <span
              key={tick.label}
              className="absolute top-0 -translate-x-1/2 text-[0.625rem] text-dash-muted"
              style={{ left: `${place(tick.minutes) * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
          <span className="absolute top-0 right-0 text-[0.625rem] font-semibold text-dash-ink">
            now
          </span>
        </div>
      </div>

      <figcaption className="mt-2.5 text-[0.8125rem] text-dash-muted">
        {caption ?? "Further right is more recent. Amber is over an hour old."}
      </figcaption>
    </figure>
  );
}

/* ═══════════════════════════════════════════════════════════════ a histogram
 *
 * How much happened, when.
 *
 * ── WHY THE AUDIT TRAIL NEEDED ONE ─────────────────────────────────────────
 * The trail is fifty lines a page of perfectly precise history, and the
 * question most often asked of it is not answerable from any page of it:
 * "was there a burst of activity around the time the figure changed?". That
 * is a shape, and fifty timestamps is not a shape. It is one query and one
 * row of bars, and it turns the trail from a record you can search into a
 * record you can *scan*.
 */
export function Histogram({ buckets, label, caption, className, height = 56 }) {
  const top = Math.max(...buckets.map((row) => row.value), 1);
  const busiest = buckets.reduce((best, row) => (row.value > best.value ? row : best), buckets[0]);

  return (
    <figure className={className}>
      {label && (
        <div className="flex items-baseline justify-between gap-3">
          <Kicker>{label}</Kicker>
          <span className="text-[0.75rem] text-dash-muted">
            busiest <span className="figure font-bold text-dash-ink">{busiest?.label}</span>
          </span>
        </div>
      )}

      <div
        className="mt-2.5 flex items-end gap-[2px]"
        style={{ height }}
        role="img"
        aria-label={`${label ?? "Activity"} by period, highest ${formatNumber(top)} at ${busiest?.label}.`}
      >
        {buckets.map((row) => (
          <div
            key={row.label}
            title={`${row.label}: ${formatNumber(row.value)}`}
            className="flex-1 rounded-t-[3px] bg-dash-ink"
            style={{
              /* Zero is a 1px rule, not an absent bar. An empty column has to
                 look deliberate, or a gap in the data and a quiet hour look
                 identical. */
              height: `${Math.max(row.value > 0 ? 8 : 1, (row.value / top) * 100)}%`,
              opacity: row.value > 0 ? 0.25 + (row.value / top) * 0.75 : 0.25,
            }}
          />
        ))}
      </div>

      <figcaption className="mt-1.5 flex justify-between text-[0.6875rem] text-dash-muted">
        <span>{buckets[0]?.label}</span>
        {caption && <span className="text-center">{caption}</span>}
        <span>{buckets.at(-1)?.label}</span>
      </figcaption>
    </figure>
  );
}

/* ══════════════════════════════════════════════════════ a wall of small dots
 *
 * Many things, each in one of a few states, all at once.
 *
 * Used where a table would be right about the detail and wrong about the
 * question: twenty environment keys, seven integrations, a page of endpoints.
 * The reader is not looking for a row, they are looking for the red one, and
 * a grid of dots hands that over instantly at a fraction of the height.
 *
 * Every cell keeps its name in a title and in the accessible label, so the
 * detail is still there for anybody who needs it — and the table it summarises
 * is still on the page underneath.
 */
export function StateGrid({ cells, label, caption, className }) {
  const tally = cells.reduce((counts, cell) => {
    counts[cell.tone] = (counts[cell.tone] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <figure className={className}>
      {label && <Kicker className="mb-2.5">{label}</Kicker>}

      <ul className="flex flex-wrap gap-1.5">
        {cells.map((cell) => (
          <li key={cell.label}>
            <span
              title={`${cell.label}: ${cell.state}`}
              className="flex size-6 items-center justify-center rounded-dash-sm"
              style={{
                background: `color-mix(in oklab, ${TONE_FILL[cell.tone]} 18%, white)`,
              }}
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ background: TONE_FILL[cell.tone] }}
              />
              <span className="sr-only">
                {cell.label}: {cell.state}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <figcaption className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-dash-muted">
        {["good", "warn", "alert", "neutral"].map((tone) =>
          tally[tone] ? (
            <span key={tone} className="flex items-baseline gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 translate-y-[-1px] rounded-full"
                style={{ background: TONE_FILL[tone] }}
              />
              <span className="figure font-bold text-dash-ink">{tally[tone]}</span>
              {LEGEND[tone]}
            </span>
          ) : null
        )}
        {caption && <span>{caption}</span>}
      </figcaption>
    </figure>
  );
}

const LEGEND = {
  good: "set and working",
  warn: "half set up",
  alert: "missing, and needed",
  neutral: "not in use",
};
