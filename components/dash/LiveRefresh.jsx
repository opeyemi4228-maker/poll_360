"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { isStale, nextInterval, shouldRefresh } from "@/lib/live-state";

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
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT CHANGED, AND WHY EACH PIECE IS NOT DECORATION
 *
 *  IT WAITED HALF A SECOND AND THEN CLAIMED SUCCESS
 *      The "updated" time and the ring were driven by a `setTimeout` of five
 *      hundred milliseconds, because a refresh gave nothing to wait on. So
 *      the ring refilled and the age reset to zero whether or not the server
 *      had answered — which is precisely the lie the block above says this
 *      component exists not to tell. A refresh that failed looked identical
 *      to one that worked. `useTransition` is what actually tracks it: the
 *      transition stays pending until the new output is rendered, so the ring
 *      now measures the thing it claims to.
 *
 *  EVERY VIEWER REFRESHED AT THE SAME INSTANT
 *      A fixed interval preserves whatever alignment it started with, and
 *      viewers arrive together — when a bulletin says the figures are in,
 *      when a shift starts, when a link goes into a group. A thousand of them
 *      were not fifty requests a second, they were a thousand in one second
 *      and nothing for nineteen. See lib/live-state.js.
 *
 *  A DEVICE WITH NO NETWORK KEPT TRYING ANYWAY
 *      On a handset at a booth that is the battery going for nothing, and
 *      when the signal comes back the refresh is a second late rather than
 *      nineteen.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default function LiveRefresh({ seconds = 20, label = "Live" }) {
  const router = useRouter();

  /* ── WHAT ACTUALLY KNOWS WHEN A REFRESH IS DONE ────────────────────────
     `router.refresh()` returns nothing useful. Wrapping it in a transition
     does: `busy` is true from the moment it starts until the server's new
     output has been rendered into the page. */
  const [busy, startRefresh] = useTransition();

  const [at, setAt] = useState(null);
  /* Ticks once a second purely so the ring and the age stay true. It is not
     what triggers a refresh — that is the timer below. */
  const [now, setNow] = useState(() => Date.now());
  /* ── STATE, NOT A REF, AND THE REASON IS NOT STYLE ────────────────────
     This is read on every render to draw the ring, and a ref read during
     render is exactly the thing React cannot guarantee is stable — the value
     would be whatever the last effect happened to leave, which under
     concurrent rendering is not a promise. It also cannot be seeded with
     Date.now() at declaration: that is an impure call in a render body. A
     lazy initialiser runs once, which is the same thing done legally. */
  const [since, setSince] = useState(() => Date.now());

  /* Consecutive refreshes that did not come back. Held in a ref because
     nothing is drawn from it directly — it only decides the next interval,
     and putting it in state would re-render the ring for no visible reason. */
  const failures = useRef(0);
  /* ── WHY THE TIMER READS A REF AND NOT `busy` ──────────────────────────
     The timer is created once and reschedules itself, so it closes over
     whatever `busy` was on the render that made it — which is false, forever.
     A ref is the value it can read now.

     Written from an effect rather than during render. Assigning to a ref
     while rendering is a real hazard, not a lint preference: under concurrent
     rendering a render can be started, abandoned and started again, and a ref
     written during one of those keeps a value from work that was thrown
     away. */
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const tick = useCallback(
    ({ force = false } = {}) => {
      const visible = typeof document === "undefined" || document.visibilityState === "visible";
      const online = typeof navigator === "undefined" || navigator.onLine !== false;

      if (!force && !shouldRefresh({ visible, online, busy: busyRef.current })) return;
      /* Even a forced refresh — somebody pressed the button — must not start a
         second one on top of one already running. */
      if (busyRef.current) return;

      setSince(Date.now());

      startRefresh(() => {
        router.refresh();
      });
    },
    [router]
  );

  /* ── WHEN A REFRESH FINISHES, AND ONLY THEN ────────────────────────────
     `busy` going from true to false is the transition completing, which means
     the server's output is on the screen. That is the moment the figures are
     genuinely new and the only honest moment to say so. */
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) {
      setAt(new Date());
      failures.current = 0;
    }
    wasBusy.current = busy;
  }, [busy]);

  /* ── THE TIMER RESCHEDULES ITSELF, RATHER THAN REPEATING ───────────────
     A `setInterval` fires on a fixed rhythm, which is exactly the alignment
     that has to be broken. Each refresh books the next one, at a slightly
     different distance, so a crowd that started together comes apart within a
     few cycles. */
  useEffect(() => {
    let timer;

    const schedule = () => {
      timer = setTimeout(() => {
        const visible = typeof document === "undefined" || document.visibilityState === "visible";
        const online = typeof navigator === "undefined" || navigator.onLine !== false;

        /* A skipped turn is counted, so a tab that has been offline for a
           while comes back gently rather than at full rate. */
        if (!shouldRefresh({ visible, online, busy: busyRef.current })) {
          failures.current = Math.min(8, failures.current + 1);
        } else {
          tick();
        }

        schedule();
      }, nextInterval(seconds, { failures: failures.current }));
    };

    schedule();
    const clock = setInterval(() => setNow(Date.now()), 1000);

    const onVisibility = () => {
      /* Coming back to a tab that has been hidden for ten minutes should show
         current figures immediately, not in twenty seconds' time. The failure
         count is cleared first, so returning to a tab is not treated as the
         end of a bad spell. */
      if (document.visibilityState === "visible") {
        failures.current = 0;
        tick();
      }
    };
    const onOnline = () => {
      failures.current = 0;
      tick();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      clearTimeout(timer);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
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
  const stale = isStale(age, seconds);

  return (
    <button
      type="button"
      onClick={() => tick({ force: true })}
      title={
        at
          ? `Updated ${at.toTimeString().slice(0, 8)}. Click to refresh now.`
          : "Refreshing automatically. Click to refresh now."
      }
      className="flex h-10 items-center gap-2 rounded-full border border-dash-line bg-dash-card pr-4 pl-3 text-[0.8125rem] whitespace-nowrap text-dash-muted transition-colors hover:border-dash-ink hover:text-dash-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
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

      <span className="font-semibold text-dash-ink">{label}</span>

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
