"use client";

import { useId } from "react";

/**
 * A density field over the map.
 *
 * ── WHY A HEAT LAYER AND NOT ANOTHER CHOROPLETH ────────────────────────────
 * A choropleth answers "what is the figure for this place", one flat colour
 * per shape, and it lies about scale in a specific way: Nasarawa and Kano are
 * the same object to it, so a big empty state shouts and a small crowded one
 * whispers. Every question this layer is asked — where are the voters, where
 * are the queues going to be, where did turnout actually happen — is a
 * question about concentration, and concentration does not respect a boundary.
 *
 * So the same real figures are also drawn as a field: a soft mass at each
 * place's own centre, sized and lit by its value, added together where they
 * overlap. Two neighbouring places that each hold half a million voters read
 * as one hot region, which is what they are on the ground and what a plan has
 * to treat them as.
 *
 * ── THE FIELD IS NOT A MEASUREMENT ─────────────────────────────────────────
 * Every blob is centred on a real place and weighted by a real figure, and the
 * spread between them is drawn, not measured: nobody surveyed where inside
 * Kano its two million voters stand. So this never replaces the choropleth, it
 * sits over it, and the shapes underneath keep the figures a reader can quote.
 * It is a way of seeing where the mass is, and it is labelled as one.
 *
 * ── HOW IT IS COMPOSED ─────────────────────────────────────────────────────
 * Screen blending rather than plain alpha. Stacked transparent circles get
 * *darker* where they overlap, which is exactly backwards for a density field
 * on a dark board — the crowded middle of the country would come out as the
 * dimmest part of it. Screen adds light, so overlap brightens, and the hottest
 * point on the map is where the most mass is.
 */
export default function HeatLayer({
  /** [{ x, y, weight }] — weight already normalised to 0–1. */
  points = [],
  /** The frame's width in user units, so the radius scales with the crop. */
  width,
  tint = "var(--color-red-500)",
  /** Fraction of the frame one blob spans at full weight. */
  spread = 0.11,
}) {
  const id = useId();
  if (!points.length || !width) return null;

  const radius = width * spread;

  return (
    <g className="pointer-events-none" style={{ mixBlendMode: "screen" }}>
      <defs>
        <radialGradient id={`heat-${id}`}>
          <stop offset="0%" stopColor={tint} stopOpacity="0.9" />
          <stop offset="35%" stopColor={tint} stopOpacity="0.42" />
          <stop offset="70%" stopColor={tint} stopOpacity="0.12" />
          <stop offset="100%" stopColor={tint} stopOpacity="0" />
        </radialGradient>
      </defs>

      {points.map((point, index) => {
        const weight = Math.max(0, Math.min(1, point.weight ?? 0));
        /* Both the reach and the brightness carry the value. Reach alone makes
           two very different figures look alike wherever they are far apart;
           brightness alone makes a large figure a small bright dot rather than
           the wide warm region it actually is. */
        return (
          <circle
            key={point.key ?? index}
            cx={point.x}
            cy={point.y}
            r={radius * (0.42 + 0.9 * weight)}
            fill={`url(#heat-${id})`}
            opacity={0.2 + 0.8 * weight}
          />
        );
      })}
    </g>
  );
}
