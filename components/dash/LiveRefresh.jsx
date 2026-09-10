"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Keeps a dashboard current without a socket, and shows that it is doing it.
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
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE WORD "LIVE" IS THE WEAKEST POSSIBLE WAY TO SAY THIS
 *
 *  A pill reading "Live" is a claim, and a claim is exactly what a stalled
 *  page also makes — the label does not change when the polling dies, when
 *  the tab has been hidden for an hour, or when the network went at eight.
 *  Somebody watching a wall has no way to tell a live figure from a frozen
 *  one, which is the single worst failure this component can have.
 *
 *  So the claim is drawn instead. A ring drains through the interval and
 *  refills on each refresh: a moving ring is proof, and a ring that has
 *  stopped is visible from across the room at a glance nobody has to spend.
 *  Below it, the age of the figures in seconds, which is the number somebody
 *  about to read a total out loud actually wants.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default function LiveRefresh({ seconds = 20, label = "Live" }) {
  const router = useRouter();
  const [at, setAt] = useState(null);
  const [busy, setBusy] = useState(false);
  /* Ticks once a second purely so the ring and the age stay true. It is not
     what triggers a refresh — that is the interval below. */
  const [now, setNow] = useState(() => Date.now());
  /* ── STATE, NOT A REF, AND THE REASON IS NOT STYLE ────────────────────
     This is read on every render to draw the ring, and a ref read during
     render is exactly the thing React cannot guarantee is stable — the value
     would be whatever the last effect happened to leave, which under
     concurrent rendering is not a promise. It also cannot be seeded with
     Date.now() at declaration: that is an impure call in a render body. A
     lazy initialiser runs once, which is the same thing done legally. */
  const [since, setSince] = useState(() => Date.now());

  const tick = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    setBusy(true);
    setSince(Date.now());
    router.refresh();
    /* The refresh is not awaited — it resolves when the server component has
       re-rendered — so this is only the beat that shows the page is doing
       something. Half a second is long enough to be seen and short enough not
       to look stuck. */
    setTimeout(() => {
      setBusy(false);
      setAt(new Date());
    }, 500);
  }, [router]);

  useEffect(() => {
    const poll = setInterval(tick, seconds * 1000);
    const clock = setInterval(() => setNow(Date.now()), 1000);

    const onVisibility = () => {
      /* Coming back to a tab that has been hidden for ten minutes should show
         current figures immediately, not in twenty seconds' time. */
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tick, seconds]);

  const age = Math.max(0, Math.round((now - since) / 1000));
  const left = Math.max(0, seconds - age);
  /* Drains rather than fills: a shrinking arc reads as time running out,
     which is what it is. */
  const share = Math.max(0, Math.min(1, left / seconds));

  const r = 8;
  const circumference = 2 * Math.PI * r;

  /* Stale is not a failure state — a hidden tab is the usual cause — so it is
     drawn in the muted tone and not in a status colour. Status colour on this
     dashboard means somebody has to look at something. */
  const stale = age > seconds * 2.5;

  return (
    <button
      type="button"
      onClick={tick}
      title={
        at
          ? `Updated ${at.toTimeString().slice(0, 8)}. Click to refresh now.`
          : "Refreshing automatically. Click to refresh now."
      }
      className="flex items-center gap-2 rounded-full border border-dash-line bg-dash-card px-3 py-2 text-[0.75rem] text-dash-muted transition-colors hover:border-dash-ink hover:text-dash-ink"
    >
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r={r} fill="none" stroke="var(--color-dash-bg)" strokeWidth="2.5" />
          <circle
            cx="10"
            cy="10"
            r={r}
            fill="none"
            stroke={stale ? "var(--color-dash-line)" : "var(--color-red-500)"}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${circumference * share} ${circumference}`}
            /* From the top, clockwise, the way every countdown anybody has
               seen runs. */
            style={{ transform: "rotate(-90deg)", transformOrigin: "10px 10px" }}
          />
        </svg>
        <span
          aria-hidden="true"
          className={cn(
            "absolute size-1.5 rounded-full",
            stale ? "bg-dash-line" : "bg-red-500",
            busy && "animate-ping",
            !busy && !stale && "animate-pulse-live"
          )}
        />
      </span>

      <span className="font-semibold">{label}</span>

      {/* The age of the figures, which is the number somebody about to read a
          total out loud actually wants. Hidden on a phone, where the ring
          alone carries it. */}
      <span className="figure hidden tabular-nums sm:inline">
        {at ? `${age}s ago` : "…"}
      </span>

      <span className="sr-only" role="status" aria-live="polite">
        {at ? `Updated ${age} seconds ago` : "Updating automatically"}
      </span>
    </button>
  );
}
