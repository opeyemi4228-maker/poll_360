"use client";

import React, { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/utils";

/**
 * Counts up to `value` when it scrolls into view.
 *
 * Driven off requestAnimationFrame with an eased curve, so it always lands
 * exactly on the figure rather than drifting against the refresh rate. The
 * real number is in the DOM from the first paint for screen readers and
 * crawlers; the animated one is decorative and hidden from them.
 */
export default function Counter({ value, prefix = "", suffix = "", duration = 1600, className }) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let frame;
    let start;

    /* Reduced motion: land on the figure immediately. Scheduled on the next
       frame rather than set in the effect body, so it is one asynchronous
       update rather than a synchronous cascading re-render. */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      frame = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(frame);
    }

    const tick = (now) => {
      start ??= now;
      const progress = Math.min((now - start) / duration, 1);
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          frame = requestAnimationFrame(tick);
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true">
        {prefix}
        {formatNumber(display)}
        {suffix}
      </span>
      <span className="sr-only">
        {prefix}
        {formatNumber(value)}
        {suffix}
      </span>
    </span>
  );
}
