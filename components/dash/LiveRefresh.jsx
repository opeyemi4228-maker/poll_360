"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Keeps a dashboard current without a socket.
 *
 * ── WHY POLLING, AND NOT A LIVE CONNECTION ─────────────────────────────────
 * A websocket pushes the instant something lands, which sounds better and is
 * worse here. Returns arrive over hours from 176,623 booths; nobody in a room
 * gains anything from seeing a figure move two seconds sooner. Meanwhile a
 * socket is a connection to hold open per viewer for eleven hours, on hosting
 * that charges for exactly that and drops them anyway.
 *
 * `router.refresh()` re-runs the server component and swaps the rendered
 * output in, so the page updates without losing scroll position, without
 * closing an open panel, and without the reader losing the row they were
 * reading. A socket-driven re-render would have to rebuild all of that by hand.
 *
 * ── AND IT STOPS WHEN NOBODY IS LOOKING ────────────────────────────────────
 * Hidden tab, no polling. A room leaves these open all night on machines that
 * are also doing other work.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function LiveRefresh({ seconds = 20, label = "Live" }) {
  const router = useRouter();
  const [at, setAt] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let timer;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      setBusy(true);
      router.refresh();
      /* The refresh is not awaited, it resolves when the server component
         has re-rendered, and the spinner is only there to show the page is
         doing something. Half a second is long enough to be seen and short
         enough not to look stuck. */
      setTimeout(() => {
        setBusy(false);
        setAt(new Date());
      }, 500);
    };

    timer = setInterval(tick, seconds * 1000);

    const onVisibility = () => {
      /* Coming back to a tab that has been hidden for ten minutes should show
         current figures immediately, not in twenty seconds' time. */
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, seconds]);

  return (
    <span className="flex items-center gap-2 text-[0.75rem] text-dash-muted">
      <RefreshCw
        size={13}
        strokeWidth={2.5}
        className={cn("shrink-0", busy && "animate-spin")}
        aria-hidden="true"
      />
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full bg-red-500", !busy && "animate-pulse-live")}
      />
      {label}
      {at && (
        <span className="figure hidden sm:inline">
          · {at.toTimeString().slice(0, 8)}
        </span>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {at ? `Updated at ${at.toTimeString().slice(0, 8)}` : "Updating automatically"}
      </span>
    </span>
  );
}
