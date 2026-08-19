import React from "react";
import { cn } from "@/lib/utils";

/**
 * The Poll360 mark: a coverage dial.
 *
 * Twenty-four ticks around a full circle, the 360, with a red arc sweeping
 * the share that has reported. It is the product's one idea drawn once: a
 * total means nothing without the arc around it.
 *
 * `coverage` is real. The masthead passes the demonstration board's current
 * figure, so the mark is a live instrument rather than a logo pretending to
 * be one. Drawn with `currentColor` for the dial and the brand red for the
 * arc, so it sits correctly on paper, on navy and on the board.
 */
const TICKS = 24;
const R = 15.5;

/**
 * Round a computed coordinate before it is written into an attribute.
 *
 * `Math.sin` and `Math.cos` are not required to agree to the last bit between
 * one JavaScript engine and another, and the server and the browser are not the
 * same engine. A one-ulp difference is invisible on a 40-unit viewBox but it
 * serialises to a different string, "31.43153532995459" against
 * "31.431535329954585", and React reports that as a hydration mismatch.
 *
 * Three decimals is a thousandth of a unit on a mark drawn 36px wide: far below
 * anything a screen can show, and identical on both sides of the wire.
 */
function round(value) {
  return Math.round(value * 1000) / 1000;
}

export default function BrandMark({ coverage = 0.62, className, ...props }) {
  const swept = Math.max(0, Math.min(1, coverage));
  const circumference = 2 * Math.PI * R;

  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("size-9 shrink-0", className)}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {/* The dial */}
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" opacity="0.38">
        {Array.from({ length: TICKS }, (_, index) => {
          const angle = (index / TICKS) * 2 * Math.PI - Math.PI / 2;
          const inner = index % 6 === 0 ? 11.5 : 13.2;
          return (
            <line
              key={index}
              x1={round(20 + Math.cos(angle) * inner)}
              y1={round(20 + Math.sin(angle) * inner)}
              x2={round(20 + Math.cos(angle) * 17.5)}
              y2={round(20 + Math.sin(angle) * 17.5)}
            />
          );
        })}
      </g>

      {/* The arc: how much of it has reported. Starts at twelve o'clock. */}
      <circle
        cx="20"
        cy="20"
        r={R}
        fill="none"
        stroke="var(--color-red-500)"
        strokeWidth="3.2"
        strokeLinecap="butt"
        strokeDasharray={`${round(circumference * swept)} ${round(circumference)}`}
        transform="rotate(-90 20 20)"
      />

      {/* The count itself */}
      <circle cx="20" cy="20" r="4.4" fill="currentColor" />
    </svg>
  );
}
