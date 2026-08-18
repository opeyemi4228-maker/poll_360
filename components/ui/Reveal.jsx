"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Reveals its children once, when they first scroll into view.
 *
 * ── VISIBLE BY DEFAULT, ANIMATED ONLY AS AN ENHANCEMENT ────────────────────
 * The obvious implementation renders at `opacity: 0` and waits for an
 * observer to switch it on. That means the entire page is blank until
 * JavaScript has loaded, parsed and hydrated — and *stays* blank if any of
 * that fails, if the bundle is blocked, or if a crawler never runs scripts.
 * On a page whose whole argument is "we show you what is actually there",
 * shipping a document that renders empty without JavaScript is not a
 * defensible trade for a fade.
 *
 * So the server renders the content visible. After mount, anything still
 * below the fold is hidden and handed to an observer; anything already on
 * screen is simply left alone — it has been read by then, and fading it in
 * under the reader would be worse than not animating it at all.
 *
 * The result: no flash of hidden content, no animation the reader can catch
 * mid-flight, and a page that is complete with JavaScript switched off.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function Reveal({ children, className, delay = 0, as: Tag = "div", y = 18 }) {
  const ref = useRef(null);
  /* `null` means "not yet decided" — the server render and the first client
     render both take this branch and produce identical, visible markup. */
  const [hidden, setHidden] = useState(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    /* Already on screen at mount: leave it be. */
    const box = node.getBoundingClientRect();
    if (box.top < window.innerHeight * 0.92) return;

    setHidden(true);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHidden(false);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn(
        hidden !== null && "transition-[opacity,transform] duration-700 ease-out-quart",
        hidden ? "opacity-0" : "opacity-100",
        className
      )}
      style={{
        transitionDelay: hidden === false ? `${delay}ms` : undefined,
        transform: hidden ? `translate3d(0, ${y}px, 0)` : undefined,
      }}
    >
      {children}
    </Tag>
  );
}
