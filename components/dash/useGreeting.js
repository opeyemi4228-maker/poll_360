"use client";

import { useEffect, useState } from "react";

/**
 * "Good evening, Ada", without lying to the server about what time it is.
 *
 * ── WHY A HOOK AND NOT TWO LINES AT THE TOP OF A COMPONENT ─────────────────
 * Two lines at the top of a component is exactly what this was, in two
 * different dashboards, and both were wrong in the same way.
 *
 * `new Date().getHours()` during render asks the machine doing the rendering.
 * On the server that is the host's clock, which in any ordinary deployment is
 * UTC. In the browser it is the room's, which here is an hour ahead. So for
 * one hour in three the server writes "afternoon" into the HTML and the
 * client hydrates expecting "evening", the two disagree, and React throws the
 * markup away and rebuilds the tree — the same hydration failure, from a
 * different source, on the same screen.
 *
 * It is not a clock bug that shows up at 5pm. It is a timezone bug that shows
 * up whenever the server and the room are not in the same one, which is
 * always.
 *
 * ── SO THE FIRST RENDER DOES NOT GUESS ─────────────────────────────────────
 * The server and the first client render agree on something that has no time
 * of day in it at all, and the real greeting lands a tick later — before
 * anybody has finished reading the word. Nothing has to know where the server
 * is, which is the point: the only clock that matters is the one in the room.
 */
export function useGreeting(name) {
  const first = String(name ?? "").trim().split(" ")[0] || "there";

  const [part, setPart] = useState(null);

  useEffect(() => {
    const settle = setTimeout(() => {
      const hour = new Date().getHours();
      setPart(hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening");
    }, 0);
    return () => clearTimeout(settle);
  }, []);

  return part ? `Good ${part}, ${first}` : `Welcome back, ${first}`;
}
