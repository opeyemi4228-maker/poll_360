"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A line across the top of the screen while a dashboard is being fetched.
 *
 * A tab or a place on the map is a link, and its dashboard takes about a
 * second to arrive. With nothing on screen in that second a press looks
 * ignored, and the second press is how somebody lands on the wrong tab. So
 * the press is acknowledged at once, here, and the line goes when the
 * address changes, which is when the new dashboard is on screen.
 */
const normal = (href) => {
  try {
    const url = new URL(href, window.location.origin);
    const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    return `${url.pathname}?${new URLSearchParams(params)}`;
  } catch {
    return null;
  }
};

export default function NavPulse() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [going, setGoing] = useState(null);

  useEffect(() => {
    let timer = null;
    const onClick = (event) => {
      /* Heard on the way down, before the link's own handler: that handler
         stops the browser's navigation so it can do its own, and a listener
         that waited for it would see every room link as already dealt with. */
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const to = normal(link.href);
      if (!to || new URL(link.href, window.location.origin).origin !== window.location.origin) return;
      if (to === normal(window.location.href)) return;
      setGoing(to);
      clearTimeout(timer);
      /* Never left on: a fetch that failed must not leave the line running. */
      timer = setTimeout(() => setGoing(null), 12_000);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimeout(timer);
    };
  }, []);

  const here = typeof window === "undefined" ? null : normal(`${pathname}?${search}`);
  if (!going || going === here) return null;
  return (
    <div role="status" aria-label="Opening" className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-1 overflow-hidden bg-dash-line">
      <div className="room-nav h-full w-1/3 rounded-full bg-blue-600" />
    </div>
  );
}
