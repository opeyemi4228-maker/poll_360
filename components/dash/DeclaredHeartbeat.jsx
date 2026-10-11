"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps fetched declared figures current from any dashboard page.
 *
 * Where a sheet's address has been given on the declared figures screen, it
 * has to be read again every few minutes, and something has to ask. This asks
 * once a minute while the tab is in front, and redraws the page when a reading
 * brought in something new. It draws nothing itself.
 */
export default function DeclaredHeartbeat() {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;

    async function beat() {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const answer = await fetch("/api/declared/turn", {
          method: "POST",
          headers: { "x-poll360-turn": "1" },
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!answer.ok) return;
        const went = await answer.json();
        if (!stopped && went.changed) router.refresh();
      } catch {
        /* The server is away. Asked again in a minute. */
      }
    }

    const first = setTimeout(beat, 5000);
    const timer = setInterval(beat, 60000);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [router]);

  return null;
}
