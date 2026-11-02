"use client";

import { useEffect, useRef, useState } from "react";

import { initialsOf, portraitFor } from "@/lib/principal";
import { cn } from "@/lib/utils";

/**
 * A candidate's photograph, or their initials when there is none.
 *
 * ── THE SAME RULE THE COMMAND PORTRAIT HAS ALWAYS FOLLOWED ─────────────────
 * Photographs live at the path lib/principal.js names, and the directory is
 * allowed to be empty: a missing file draws a monogram ringed in the party's
 * colour, never a broken image. `onError` is why this is a client component.
 *
 * Deliberately a plain <img> rather than next/image, for the reason given in
 * CommandDashboard.jsx: a missing source through the optimiser is a 500 and
 * the monogram never draws.
 */
export default function PersonPhoto({ name, ring = "var(--color-dash-line)", size = 56, className }) {
  const src = portraitFor(name);
  /* Remembered against the source, so switching to somebody with a photograph
     after somebody without one does not keep drawing initials. */
  const [failedFor, setFailedFor] = useState(null);
  const image = useRef(null);

  /* ── A 404 THAT LANDED BEFORE REACT DID ─────────────────────────────────
     The <img> is in the server's HTML, so the browser can try the file, fail,
     and fire `error` before this component has hydrated and attached
     `onError`. That event is gone, and the broken-image icon stays. So on
     mount, and on every new source, ask the element itself: finished loading
     with no pixels means it failed. */
  useEffect(() => {
    const node = image.current;
    if (node && node.complete && node.naturalWidth === 0) setFailedFor(src);
  }, [src]);
  const style = { boxShadow: `inset 0 0 0 2px ${ring}`, width: size, height: size };

  if (failedFor === src) {
    return (
      <span
        style={style}
        className={cn("flex shrink-0 items-center justify-center rounded-full bg-dash-bg", className)}
        aria-hidden="true"
      >
        <span className="figure font-bold text-dash-ink" style={{ fontSize: Math.max(10, size * 0.3) }}>
          {initialsOf(name)}
        </span>
      </span>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element -- see the note above */
    <img
      key={src}
      ref={image}
      src={src}
      alt={name}
      width={size}
      height={size}
      style={{ ...style, outline: `2px solid ${ring}`, outlineOffset: -2 }}
      onError={() => setFailedFor(src)}
      className={cn("shrink-0 rounded-full object-cover object-top", className)}
    />
  );
}
