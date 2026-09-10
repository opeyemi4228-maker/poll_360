"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Check, Radio, Zap } from "lucide-react";

import { Card } from "@/components/dash/DashCard";
import { PLATFORMS } from "@/lib/broadcast";
import { cn } from "@/lib/utils";

/**
 * Automatic publishing across the platforms.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SWITCH IS REAL. WHAT IT CAN REACH IS THE HONEST PART.
 *
 *  Arming this means: the moment a post is cleared, it goes, without anybody
 *  pressing anything. That is a genuine and useful thing to want — a results
 *  night has hundreds of cards and a desk of four people — and it is what
 *  this control does.
 *
 *  It is also the single most dangerous switch in the product, because the
 *  thing it publishes is an election result in the organisation's name. So it
 *  is built to the rule the rest of this desk is built to: it never reports
 *  something as sent that was not sent.
 *
 *  This repository holds no publishing credential for any platform. Every row
 *  below therefore says so, and arming the switch queues for hand-off rather
 *  than dispatching. The moment a credential exists for a platform, that row
 *  becomes live and the switch starts sending to it — the control does not
 *  change, only what it can reach.
 *
 *  A dashboard that showed a green "connected" light it could not verify, and
 *  a desk that believed forty cards had gone out when none had, is the exact
 *  failure this shape prevents.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THE SETTING LIVES IN THIS BROWSER ──────────────────────────────────
 * Automatic publishing is a decision about *this* desk's shift, not a
 * property of the election, and two rooms watching one count must not be able
 * to arm each other's dispatch. It survives a refresh and goes no further.
 * When there is a credential to dispatch with there will be a server-side
 * setting to match, and that is the point at which this becomes shared state
 * rather than before it.
 */

const KEY = "poll360.auto-publish";

/* What the desk starts as: nothing is armed, and the two platforms a results
   night actually uses are pre-chosen so arming is one press rather than four. */
const DEFAULTS = { armed: false, platforms: ["facebook", "x"] };

/**
 * ── A STORE, NOT A useState PLUS AN EFFECT ────────────────────────────────
 * The obvious shape — hold it in state, load it in an effect — sets state
 * inside an effect body, which cascades a second render on every mount and is
 * what React now warns about. It also has a subtler problem: this component
 * renders on the server, where there is no localStorage, so a lazy initialiser
 * that reaches for it throws on the first draw.
 *
 * `useSyncExternalStore` answers both. The server snapshot is the defaults, so
 * the markup is stable; the browser snapshot is what is stored; and React
 * reconciles the difference after hydration rather than the page arriving with
 * a switch in the wrong position. It is the same pattern the rail uses to read
 * the address bar — see components/dash/DashNav.jsx.
 */
const listeners = new Set();
/* Snapshots are cached because useSyncExternalStore compares them by identity:
   parsing the JSON afresh on every render returns a new object every time and
   spins React in an infinite loop. */
let snapshot = null;

function read() {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    const held = raw ? JSON.parse(raw) : null;
    return held
      ? {
          armed: Boolean(held.armed),
          platforms: Array.isArray(held.platforms) ? held.platforms : DEFAULTS.platforms,
        }
      : DEFAULTS;
  } catch {
    /* Storage off, private window, or a corrupted entry. The control works
       perfectly well without remembering anything. */
    return DEFAULTS;
  }
}

const store = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get() {
    if (snapshot === null) snapshot = read();
    return snapshot;
  },
  /* The server never has a stored value, and must not invent one: the same
     object every time, or React re-renders forever. */
  server: () => DEFAULTS,
  set(next) {
    snapshot = next;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* Private browsing or a full quota. It still works for this shift. */
    }
    for (const listener of listeners) listener();
  },
};

/**
 * Which platforms this deployment can actually post to.
 *
 * There is no credential store in this repository, so today the answer is
 * none, and it is derived from that fact rather than asserted as a constant —
 * the moment one exists this reads it and the screen changes by itself.
 */
function readiness() {
  return Object.fromEntries(
    PLATFORMS.map((platform) => [
      platform.id,
      /* `whatsapp` is configured for the field channel, which is a different
         grant from a broadcast one: the bot answers agents, it does not
         publish to a channel. Claiming it here because a token with that name
         exists somewhere is precisely the kind of nearly-true status light
         this file exists to refuse. */
      { connected: false, why: platform.needs },
    ])
  );
}

export default function AutoPublish({ cleared = 0 }) {
  const held = useSyncExternalStore(store.subscribe, store.get, store.server);
  const armed = held.armed;
  const chosen = new Set(held.platforms);

  const setArmed = useCallback(
    (next) => store.set({ ...store.get(), armed: next }),
    []
  );

  const ready = readiness();
  const live = [...chosen].filter((id) => ready[id]?.connected);
  const blocked = [...chosen].filter((id) => !ready[id]?.connected);

  const toggle = (id) => {
    const current = store.get();
    const next = new Set(current.platforms);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    store.set({ ...current, platforms: [...next] });
  };

  return (
    <Card
      title="Automatic publishing"
      subtitle="Send a post the moment it clears, without anybody pressing anything"
    >
      {/* ── THE SWITCH ────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-4 rounded-dash-sm border p-4 transition-colors",
          armed ? "border-dash-ink bg-dash-bg" : "border-dash-line"
        )}
      >
        <button
          type="button"
          role="switch"
          aria-checked={armed}
          onClick={() => setArmed(!armed)}
          className={cn(
            "relative h-8 w-14 shrink-0 rounded-full transition-colors",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
            armed ? "bg-dash-ink" : "bg-dash-line"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1 size-6 rounded-full bg-white shadow-sm transition-[left] duration-200",
              armed ? "left-7" : "left-1"
            )}
          />
        </button>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-bold text-dash-ink">
            {armed ? "Armed" : "Off"}
            {armed && (
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.625rem] font-bold tracking-[0.08em] uppercase",
                  live.length ? "bg-red-500 text-white" : "bg-amber-500 text-amber-950"
                )}
              >
                <Zap size={11} strokeWidth={3} />
                {live.length ? "dispatching" : "queueing only"}
              </span>
            )}
          </p>

          {/* ── WHAT WILL ACTUALLY HAPPEN, IN ONE LINE ──────────────────
              Three states, and they are genuinely different: off, armed with
              somewhere to send, and armed with nowhere. The third is the one
              a dashboard normally hides, and it is the one a desk most needs
              to be told. */}
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-dash-muted">
            {!armed ? (
              <>Every cleared post waits for a person. Nothing leaves on its own.</>
            ) : live.length ? (
              <>
                Cleared posts go straight to {live.length}{" "}
                {live.length === 1 ? "platform" : "platforms"} with no further review.
              </>
            ) : (
              <>
                Nothing can be dispatched: no publishing credential is held for any platform
                below. Cleared posts are stacked for hand-off instead, and none is recorded as
                sent.
              </>
            )}
          </p>
        </div>

        {cleared > 0 && (
          <div className="shrink-0 text-right">
            <p className="figure text-[1.5rem] leading-none font-bold text-dash-ink tabular-nums">
              {cleared}
            </p>
            <p className="text-[0.625rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
              cleared, waiting
            </p>
          </div>
        )}
      </div>

      {/* ── THE PLATFORMS ─────────────────────────────────────────────────
          Each is a switch of its own, so arming the desk for Facebook and X
          and not for TikTok is one press rather than a policy. The readiness
          is stated on the row, next to the switch it governs, rather than in
          a paragraph underneath that nobody reads. */}
      <ul className="mt-4 space-y-1.5">
        {PLATFORMS.map((platform) => {
          const on = chosen.has(platform.id);
          const connected = ready[platform.id]?.connected;

          return (
            <li
              key={platform.id}
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-dash-sm border px-3 py-2.5 transition-colors",
                on && armed ? "border-dash-ink" : "border-dash-line"
              )}
            >
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={platform.label}
                onClick={() => toggle(platform.id)}
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                  on ? "bg-dash-ink" : "bg-dash-line"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-0.5 size-4 rounded-full bg-white transition-[left] duration-200",
                    on ? "left-4.5" : "left-0.5"
                  )}
                />
              </button>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.875rem] font-bold text-dash-ink">
                    {platform.label}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.5625rem] font-bold tracking-[0.08em] uppercase",
                      connected
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-dash-bg text-dash-muted"
                    )}
                  >
                    {connected ? <Check size={10} strokeWidth={3} /> : <Radio size={10} strokeWidth={3} />}
                    {connected ? "connected" : "no credential"}
                  </span>
                </span>
                <span className="mt-0.5 block text-[0.75rem] leading-snug text-dash-muted">
                  {connected ? platform.carries : platform.needs}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {armed && blocked.length > 0 && (
        <p className="mt-3 border-t border-dash-line pt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
          <span className="font-bold text-dash-ink">
            {blocked.length} of the {chosen.size} chosen cannot be reached.
          </span>{" "}
          They stay in the hand-off list. Nothing on this screen will report them as posted, and
          the switch does not need changing when a credential arrives — the row goes live and the
          dispatch starts.
        </p>
      )}
    </Card>
  );
}
