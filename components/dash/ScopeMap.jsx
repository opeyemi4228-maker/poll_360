"use client";

import { useMemo, useRef, useState } from "react";

import { PARTY_FILL } from "./Charts";
import { boundsOf, extentOf } from "@/lib/bbox";
import { leaderOf } from "@/lib/drill";
import { parties } from "@/lib/election2023";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * One map, any level, any layer.
 *
 * ── DRILLING HAPPENS HERE, NOT IN A PANEL OVER THE TOP ─────────────────────
 * An earlier pass opened a full-screen layer when you clicked a state, which
 * hid the top bar and replaced the page. That was wrong twice over: the
 * navigation vanished at exactly the moment somebody needed it, and the state
 * arrived somewhere other than where they were looking. Now the frame stays
 * put and only the contents change — the country is replaced by the state, in
 * the same box, at the same size.
 *
 * ── EVERY LAYER DRILLS ON ITS OWN TERMS ────────────────────────────────────
 * Results colours by who leads. Voters, Turnout and Clusters colour by
 * magnitude, on a ramp recomputed for whatever is currently on screen — so
 * drilling into Lagos re-scales the ramp to Lagos's own LGAs rather than
 * leaving them all the same shade because they are all large by national
 * standards. That re-scaling is the difference between a map that keeps
 * working as you go down and one that goes flat.
 * ───────────────────────────────────────────────────────────────────────────
 */
/* Stepped for a dark ground: on near-black the ramp has to run dim-to-bright,
   because a "darker means more" scale disappears into the surface at the top
   of its own range. Same five steps, same single hue, inverted direction. */
const STEPS = [
  "oklch(30% 0.03 255)",
  "oklch(42% 0.06 250)",
  "oklch(55% 0.1 245)",
  "oklch(68% 0.13 240)",
  "oklch(82% 0.14 235)",
];

export default function ScopeMap({
  level,
  shapes,
  rows,
  layer,
  hovered,
  onHover,
  onOpen,
  labelMode = "auto",
  pulsing = null,
  /* code -> { count, worst } for the places that have something reported
     against them. Optional: a map with nothing to be alarmed about omits it. */
  incidentsByPlace = null,
}) {
  const byName = useMemo(() => new Map(rows.map((row) => [row.key ?? row.name, row])), [rows]);

  /* The window. At national level it is the whole canvas; inside a state it is
     cropped to that state, because the files carry the national projection and
     an uncropped Lagos is 1/178th of the frame. */
  const frame = useMemo(() => {
    if (level === "nation") {
      return { viewBox: `0 0 ${shapes.width} ${shapes.height}`, width: shapes.width };
    }
    return boundsOf(shapes.paths.map((shape) => shape.d));
  }, [level, shapes]);

  const extent = useMemo(() => {
    if (layer === "results") return [0, 0];
    const values = rows.map((row) => magnitude(row, layer));
    return [Math.min(...values), Math.max(...values)];
  }, [rows, layer]);

  /* Which shapes can hold their own name. Recomputed against the current
     frame, so an LGA that is unlabelable nationally may well be labelable once
     its state fills the screen. */
  const fits = useMemo(() => {
    const map = new Map();
    for (const shape of shapes.paths ?? shapes.states ?? []) {
      const size = extentOf(shape.d);
      map.set(shape.name, {
        code: size.width > frame.width * 0.03,
        name: size.width > frame.width * 0.085,
      });
    }
    return map;
  }, [shapes, frame]);

  const list = shapes.paths ?? shapes.states ?? [];

  /* ── THE HOVER CARD ──────────────────────────────────────────────────────
     The browser's own tooltip — an SVG <title> — takes about a second to
     appear, cannot be styled, and shows one line of plain text. On the screen
     whose whole job is "what is happening in this place", that is not good
     enough: the answer has to arrive the instant the pointer does.

     The card follows the pointer by writing `transform` straight onto the
     element rather than by holding the coordinates in state. A map of 37
     shapes re-rendering on every pointermove is a map that stutters, and the
     position is presentation — React never needs to know it. Only *which*
     place is under the pointer is state, and that changes a few times a
     second at most.
     ────────────────────────────────────────────────────────────────────── */
  const wrapRef = useRef(null);
  const cardRef = useRef(null);
  /* Touch has no hover: a tap sets `hovered` and the card would then sit there
     until another tap. It is opened by real pointer movement only. */
  const [floating, setFloating] = useState(false);

  const track = (event) => {
    const wrap = wrapRef.current;
    const card = cardRef.current;
    if (!wrap || !card) return;

    const rect = wrap.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    /* Flip rather than overflow: near the right edge the card goes to the left
       of the pointer, near the bottom it goes above it. A card that is half
       off-screen answers half the question. */
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const left = x + 18 + width > rect.width ? Math.max(8, x - 18 - width) : x + 18;
    const top = y + 18 + height > rect.height ? Math.max(8, y - 18 - height) : y + 18;

    card.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  };

  const hoveredRow = hovered ? byName.get(hovered) : null;
  const hoveredShape = hovered ? list.find((shape) => (shape.code ?? shape.name) === hovered) : null;

  return (
    <div ref={wrapRef} className="relative h-full w-full">
    <svg
      viewBox={frame.viewBox}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${level === "nation" ? "Nigeria" : shapes.title}: ${LABEL[layer]}. The same figures are listed beside this map.`}
      onPointerMove={(event) => {
        if (event.pointerType === "touch") return;
        setFloating(true);
        track(event);
      }}
      onPointerLeave={() => {
        setFloating(false);
        onHover?.(null);
      }}
    >
      <defs>
        {/* ── THE GRATICULE ──────────────────────────────────────────────
            A faint graph rule behind the country. It is not decoration: on a
            dark instrument an unbroken black field gives the eye nothing to
            judge distance or scale against, and the country appears to float.
            A grid gives the shapes a ground to sit on, and it is the visual
            grammar every chart-plotter, radar and mapping console has used
            for the same reason. Kept at 6% so it reads as surface texture and
            never competes with a fill. */}
        <pattern id="scope-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path
            d="M40 0H0V40"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        </pattern>

        {/* A soft lift under the shapes, so the country sits above the grid
            rather than being drawn on it. */}
        <filter id="scope-lift" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="#000" floodOpacity="0.55" />
        </filter>

        <pattern
          id="scope-hatch-lp"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" fill="var(--color-lp-l)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
        </pattern>
      </defs>

      {/* The ground. */}
      <rect
        x={frame.x ?? 0}
        y={frame.y ?? 0}
        width={frame.width ?? shapes.width}
        height={frame.height ?? shapes.height}
        fill="url(#scope-grid)"
      />

      <g filter="url(#scope-lift)">
      {list.map((shape) => {
        const key = shape.code ?? shape.name;
        const row = byName.get(key);
        const active = hovered === key;
        const size = fits.get(shape.name) ?? { code: true, name: false };

        const code = row && layer === "results" ? partyCode(row) : null;
        const fill =
          layer === "results"
            ? code === null
              ? "var(--color-silent)"
              : code === "LP"
                ? "url(#scope-hatch-lp)"
                : PARTY_FILL[code]
            : row
              ? ramp(magnitude(row, layer), extent)
              : "var(--color-silent)";

        /* Stroke is in user units, and those differ once a frame is cropped —
           so it scales with the frame or a small state gets a cage. */
        const unit = frame.width / 1000;

        return (
          <g
            key={key}
            onPointerEnter={() => onHover?.(key)}
            onClick={() => onOpen?.(shape)}
            className="cursor-pointer"
          >
            {/* No <svg:title> here on purpose. The map is role="img", which
                makes its whole subtree presentational — a title inside it is
                never read out, and all it did was raise a slow native tooltip
                a second after the hover card had already answered the same
                question, on top of it. The figures remain in the list beside
                the map, which is what the map's own label points at. */}
            <path
              d={shape.d}
              fill={fill}
              stroke={active ? "#ffffff" : "var(--color-board)"}
              strokeWidth={(active ? 2.6 : 1.1) * unit}
              strokeLinejoin="round"
              style={{ opacity: hovered && !active ? 0.5 : 1 }}
              className="transition-opacity duration-150"
            />

            {/* Inside a state the LGA's own name is drawn, not a party code:
                at that scale the question is "which place is this", and a name
                answers it where three letters do not. */}
            {row && (labelMode === "name" || level !== "nation") && size.name ? (
              <text
                x={shape.at[0]}
                y={shape.at[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none"
                style={{
                  fontSize: frame.width * 0.019,
                  fontWeight: 700,
                  fill: "#ffffff",
                  paintOrder: "stroke",
                  stroke: "rgba(0,0,0,0.45)",
                  strokeWidth: frame.width * 0.005,
                  strokeLinejoin: "round",
                }}
              >
                {shape.name}
              </text>
            ) : (
              row &&
              code &&
              size.code && (
                <text
                  x={shape.at[0]}
                  y={shape.at[1]}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none font-mono select-none"
                  style={{
                    fontSize: frame.width * 0.016,
                    fontWeight: 700,
                    fill: "#ffffff",
                    paintOrder: "stroke",
                    stroke: "rgba(0,0,0,0.4)",
                    strokeWidth: frame.width * 0.004,
                    strokeLinejoin: "round",
                  }}
                >
                  {code}
                </text>
              )
            )}
          </g>
        );
      })}
      </g>

      {/* ── LIVE ARRIVALS ───────────────────────────────────────────────────
          A ring that expands and fades on a place the moment a return lands
          there. It is the only animation on the map, and it earns its place:
          in a room the useful question is not only "who leads" but "where is
          it coming from right now", and a static choropleth cannot answer it.
          Purely decorative to assistive technology — the figures beside the
          map carry the same fact. */}
      {pulsing &&
        list
          .filter((shape) => pulsing.has(shape.code ?? shape.name))
          .map((shape) => (
            <circle
              key={`pulse-${shape.code ?? shape.name}`}
              cx={shape.at[0]}
              cy={shape.at[1]}
              r={frame.width * 0.008}
              fill="none"
              stroke="#ffffff"
              strokeWidth={frame.width * 0.0025}
              className="pointer-events-none"
              aria-hidden="true"
            >
              <animate
                attributeName="r"
                from={frame.width * 0.006}
                to={frame.width * 0.035}
                dur="1.4s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                from="0.85"
                to="0"
                dur="1.4s"
                repeatCount="indefinite"
              />
            </circle>
          ))}
    </svg>

      {/* Rendered whether or not anything is hovered, so its size can be
          measured before the first move and the flip logic has something to
          work with. Hidden with opacity rather than unmounted for the same
          reason. */}
      <div
        ref={cardRef}
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-0 left-0 z-20 w-64 origin-top-left",
          "rounded-dash border border-dash-line bg-dash-card p-3 shadow-lg",
          "transition-opacity duration-100",
          floating && hoveredShape ? "opacity-100" : "opacity-0"
        )}
      >
        <HoverCard
          name={hoveredShape?.name}
          row={hoveredRow}
          layer={layer}
          level={level}
          incident={incidentsByPlace?.[hovered] ?? null}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * What is happening in one place, in the time it takes to read it.
 *
 * Four lines and no more. The rule the whole product turns on applies hardest
 * here, because this is the figure somebody reads out loud off a wall: no total
 * appears without the share of booths it came from, and a place nobody has
 * reported from says so in words rather than showing a zero.
 */
function HoverCard({ name, row, layer, level, incident }) {
  if (!name) return <p className="text-[0.8125rem] text-dash-muted">&nbsp;</p>;

  const reported = row ? row.reported !== false : false;
  const code = reported ? partyCode(row) : null;
  const total = row?.total ?? 0;

  /* The top three, by votes, with the rest folded away. Three is what fits and
     what a producer quotes; the fourth party has never changed a sentence. */
  const ranked =
    reported && row?.votes
      ? row.votes
          .slice(0, parties.length)
          .map((votes, index) => ({ party: parties[index], votes }))
          .sort((a, b) => b.votes - a.votes)
          .slice(0, 3)
      : [];

  /* ── THE DENOMINATOR HAS TO COME FROM THE SAME PLACE AS THE NUMERATOR ────
     A row's `total` is scaled to the share of booths that have reported, while
     its `votes` are the place's full figures. Dividing one by the other gives
     a party 115% of the vote — which is what this card printed the first time
     it was pointed at Ekiti.

     A share is a ratio, so it only needs the votes: each party over the sum of
     all of them. That is scale-independent — it gives the same answer whether
     the numbers are the whole state's or the fraction counted so far — and it
     cannot drift from whatever `total` happens to mean. `total` is left to do
     the one job it is right for, below: saying how many votes are actually in,
     next to the coverage that qualifies it.
     ────────────────────────────────────────────────────────────────────── */
  const voteSum = ranked.length
    /* The whole array, including the bucket of everyone else on the ballot.
       Dividing by the four named parties alone would quietly inflate each of
       them by the small parties' share — 65.4% for APC in Ekiti becomes 66.6%,
       which is not the figure anyone else is quoting. */
    ? row.votes.reduce((sum, count) => sum + count, 0)
    : 0;

  return (
    <>
      <p className="flex items-baseline gap-2">
        <span className="truncate text-[0.9375rem] leading-tight font-bold text-dash-ink">
          {name}
        </span>
        {code && (
          <span className="ml-auto shrink-0 font-mono text-[0.6875rem] font-bold text-dash-muted">
            {code}
          </span>
        )}
      </p>

      {!reported ? (
        <p className="mt-2 text-[0.75rem] leading-relaxed text-dash-muted">
          No returns yet. Grey means nobody has reported from here — never a low score.
        </p>
      ) : (
        <>
          <ul className="mt-2.5 space-y-1.5">
            {ranked.map(({ party, votes }) => {
              const share = voteSum > 0 ? (votes / voteSum) * 100 : 0;
              return (
                <li key={party.id} className="flex items-center gap-2">
                  <span className="w-9 shrink-0 font-mono text-[0.6875rem] font-bold text-dash-ink">
                    {party.id}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-dash-bg">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.max(share, 1)}%`, background: party.token }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono text-[0.6875rem] text-dash-muted">
                    {formatShare(share)}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Never a total without its coverage — and where coverage is not
              tracked, the booth count rather than a fabricated 0.0%. Places
              below a state are apportioned from it and carry no arrival
              record of their own, so printing a share there would be
              inventing one. */}
          <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-dash-line pt-2.5">
            <dt className="text-[0.6875rem] text-dash-muted">
              {typeof row?.coverage === "number" ? "Counted" : "Booths"}
            </dt>
            <dd className="text-right font-mono text-[0.6875rem] font-semibold text-dash-ink">
              {typeof row?.coverage === "number"
                ? formatShare(row.coverage)
                : formatNumber(row?.booths ?? 0)}
            </dd>
            <dt className="text-[0.6875rem] text-dash-muted">Votes in</dt>
            <dd className="text-right font-mono text-[0.6875rem] font-semibold text-dash-ink">
              {formatNumber(total)}
            </dd>
            <dt className="text-[0.6875rem] text-dash-muted">Turnout</dt>
            <dd className="text-right font-mono text-[0.6875rem] font-semibold text-dash-ink">
              {formatShare(row?.turnout ?? 0)}
            </dd>
          </dl>
        </>
      )}

      {incident?.count > 0 && (
        <p
          className={cn(
            "mt-2.5 rounded-dash-sm px-2 py-1.5 text-[0.6875rem] font-semibold",
            incident.worst === "CRITICAL"
              ? "bg-red-50 text-red-700"
              : incident.worst === "SERIOUS"
                ? "bg-amber-50 text-amber-800"
                : "bg-dash-bg text-dash-muted"
          )}
        >
          {incident.count} report{incident.count === 1 ? "" : "s"} from the field
        </p>
      )}

      <p className="mt-2.5 text-[0.6875rem] text-dash-muted">
        {level === "ward" ? "Click to open" : "Click to open · again to drill in"}
      </p>
    </>
  );
}

/* -------------------------------------------------------------------------- */

export const LABEL = {
  results: "who leads",
  register: "register reporting",
  turnout: "turnout so far",
  density: "votes per reporting unit",
};

export function magnitude(row, layer) {
  if (layer === "register") return row.registered ?? 0;
  if (layer === "turnout") return row.turnout ?? 0;
  if (layer === "density") return row.density ?? 0;
  return row.total ?? 0;
}

export function describe(row, layer) {
  if (row && row.reported === false) return "No returns yet";
  if (layer === "register")
    return `${formatNumber(row.registered ?? 0)} of ${formatNumber(row.fullRegister ?? row.registered ?? 0)} reporting`;
  if (layer === "turnout") return `${formatShare(row.turnout ?? 0)} of the register in`;
  if (layer === "density") return `${formatNumber(row.density ?? 0)} votes per unit in`;
  const code = partyCode(row);
  return code ? `${code} leading · ${formatNumber(row.total)} votes` : "No returns yet";
}

export function partyCode(row) {
  if (!row?.votes) return null;
  const index = leaderOf(row.votes);
  return index === null ? null : parties[index].id;
}

export function ramp(value, [min, max]) {
  if (max === min) return STEPS[2];
  const t = (value - min) / (max - min);
  return STEPS[Math.min(STEPS.length - 1, Math.floor(t * STEPS.length))];
}

export { STEPS };
