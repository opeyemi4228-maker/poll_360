"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Africa/Lagos" });

/**
 * Keeps a wall current and shows the time. A wall has no keyboard, so it
 * asks for itself every few seconds, and says so plainly when it cannot.
 */
export default function WallRefresh({ seconds = 4, clock = true }) {
  const router = useRouter();
  const [now, setNow] = useState(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const pull = setInterval(() => {
      setOnline(navigator.onLine);
      if (navigator.onLine && document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => {
      clearInterval(tick);
      clearInterval(pull);
    };
  }, [router, seconds]);

  return (
    <div className="flex items-center gap-6">
      {!online && <span role="alert" className="rounded-lg bg-light-red px-4 py-2 text-[1.5rem] font-bold text-white">OFFLINE · figures frozen</span>}
      {clock && <time className="font-mono text-[3rem] leading-none font-bold tabular-nums" suppressHydrationWarning>{now ? CLOCK.format(now) : "--:--:--"} <span className="text-[1.5rem] opacity-70">WAT</span></time>}
    </div>
  );
}
