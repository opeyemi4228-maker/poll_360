"use client";

import { useEffect } from "react";

/**
 * Publishes the desk bar's height as `--room-top`, so a map pinned under it
 * sits exactly below it. The bar is not one height: it gains a row of tabs
 * on a laptop, a row of alarms when something rings, and changes again when
 * a browser is zoomed. A constant would be right on one screen only.
 */
export default function BarHeight({ id }) {
  useEffect(() => {
    const bar = document.getElementById(id);
    if (!bar || typeof ResizeObserver === "undefined") return undefined;
    const set = () => document.documentElement.style.setProperty("--room-top", `${bar.offsetHeight}px`);
    const observer = new ResizeObserver(set);
    observer.observe(bar);
    set();
    return () => observer.disconnect();
  }, [id]);
  return null;
}
