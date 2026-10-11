"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Watches which polling units this agent holds while the app is open.
 *
 * If the unit they are working is taken from them, the app says so, hands
 * any unsent draft for it to the field desk, and moves them off it. The
 * draft does not become a result. Runs only while the screen is visible.
 */
const DRAFT = "poll360:draft";

export default function AssignmentWatch({ current, draftPrefix = DRAFT }) {
  const router = useRouter();

  useEffect(() => {
    if (!current) return undefined;
    let stopped = false;
    async function look() {
      if (stopped || document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const response = await fetch("/api/agent/units", { cache: "no-store" });
        if (!response.ok) return;
        const { units } = await response.json();
        if (units.includes(current)) return;
        stopped = true;
        for (const key of Object.keys(window.localStorage)) {
          if (!key.startsWith(`${draftPrefix}:${current}:`)) continue;
          const race = key.split(":").pop();
          try {
            const figures = JSON.parse(window.localStorage.getItem(key));
            await fetch("/api/agent/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ unit: current, race, figures }) });
          } catch {
            /* A draft that cannot be read or sent is left where it is. */
            continue;
          }
          window.localStorage.removeItem(key);
        }
        window.alert("You are no longer assigned to this polling unit. Anything you had not sent has been passed to the field desk.");
        router.refresh();
      } catch {
        /* No signal. The next look tries again. */
      }
    }
    const timer = setInterval(look, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [current, draftPrefix, router]);

  return null;
}
