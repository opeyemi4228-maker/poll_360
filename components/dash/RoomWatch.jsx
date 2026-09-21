"use client";

import { useState } from "react";
import { BellRing, MapPin, Radio, ShieldAlert } from "lucide-react";

import RoomAlerts from "./RoomAlerts";
import IncidentStream from "./IncidentStream";
import { MiniMap } from "./Figures";
import { watchBand } from "@/lib/alerts";
import { cn, formatNumber } from "@/lib/utils";

/**
 * What needs attention, and what happened — one room.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THESE WERE NEVER TWO SCREENS
 *
 *  Alerts is what this product noticed. Incidents is what a person in a field
 *  noticed. They were two tabs, and the split put a wall through the middle of
 *  one question: *is anything wrong right now.*
 *
 *  It is worse than an inconvenience, because the two halves corroborate each
 *  other and nobody could see both at once. A booth that tripped a silence
 *  threshold is a machine noticing a gap. An agent at that same booth
 *  reporting that a party official is standing over the count is a human being
 *  explaining the gap. Either alone is a shrug; together they are the reason
 *  somebody gets in a car. Two tabs meant the room had to remember to check
 *  the other one, at exactly the moment nobody remembers anything.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── AND WHY THE TOP OF IT IS PICTURES ──────────────────────────────────────
 * Both halves were built out of counts and percentages, and a screen of
 * figures is a document: complete, accurate, and skimmed. The band across the
 * top answers "how bad, where, and is it getting worse" in three shapes a
 * reader takes in before they have read a digit — and the lists underneath,
 * which is where the actual names and booth codes live, are unchanged. The
 * pictures are the way in, not a replacement for the detail.
 */

/** The two halves, and the question each one answers. */
const HALVES = [
  { id: "alerts", label: "Needs attention", icon: BellRing },
  { id: "incidents", label: "Field reports", icon: ShieldAlert },
];

/* Severity, worst first, with the colour each one is drawn in everywhere on
   this screen. Not a ramp: these are statuses and status colour is reserved. */
const SEVERITY = [
  { id: "CRITICAL", label: "Critical", color: "var(--color-red-500)" },
  { id: "SERIOUS", label: "Serious", color: "var(--color-flag-500)" },
  { id: "INFO", label: "Noted", color: "var(--color-ink-500)" },
];

export default function RoomWatch({
  /* ── THE RAISED SET, NOT A LIST OF IT ────────────────────────────────
     This is what `raiseAlerts` returns — `{ level, alerts, dials, counts }` —
     and it arrives whole because the level is computed there and must not be
     computed a second time here. It was typed as an array and read as one,
     which meant `alerts.reduce` on an object and a screen that threw before
     it drew a pixel. See lib/alerts.js. */
  alerts = null,
  incidents = [],
  photos = {},
  /* The national outline, so the band can draw where this is happening
     rather than listing the states it is happening in. */
  shapes = null,
  onGo,
}) {
  const [half, setHalf] = useState("alerts");

  /* ══════════════════════════════════════════════════════════════════════
     THE BAND'S ARITHMETIC IS NOT IN THIS FILE

     It was, and the screen went down: the component was handed the object
     `raiseAlerts` returns and read it as an array, so `alerts.reduce` threw
     before a pixel was drawn, and a rename had left a reference to a variable
     that no longer existed. Neither could be caught by a test, because there
     was nothing to test — the sums lived inside the render.

     They live in lib/alerts.js now and have a suite of their own. This file
     draws what it is given and works nothing out, which is why it can be read
     in one sitting and why the next rename cannot silently break it.
     ══════════════════════════════════════════════════════════════════════ */
  const band = watchBand({ alerts, incidents });
  const raised = band.raisedRows;

  /* A state is coloured by the worst thing reported in it. One with nothing
     against it is absent from `byState` and so keeps the surface colour: an
     absence, not a low number, which is the rule every map here follows. */
  const fills = Object.fromEntries(
    Object.entries(band.byState).map(([code, row]) => [code, SEVERITY[row.rank].color])
  );

  const notes = Object.fromEntries(
    Object.entries(band.byState).map(([code, row]) => [
      code,
      `${row.count} report${row.count === 1 ? "" : "s"}`,
    ])
  );

  const bySeverity = band.bySeverity
    .map((row) => ({ ...SEVERITY.find((item) => item.id === row.id), value: row.count }))
    .filter((row) => row.value > 0);

  return (
    <div className="flex flex-col gap-3">
      {/* ══════════════════════════════════════════════════════════ the band */}
      {/* ── ONE MAP, NOT THREE PICTURES ────────────────────────────────────
          This was a gauge, a waffle and a small map side by side. The gauge
          drew "how clear the room is" from an arc that emptied six points per
          raised item — a shape with no unit behind it, invented to fill a
          panel, and the reader had no way to know that. The waffle counted
          percentage points of reports, which is a proportion of a number that
          is itself a handful.

          What a person walking up to this screen wants is where, and one map
          at a readable size answers it. The two counts that matter sit beside
          it as a sentence rather than as figures in boxes. */}
      <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-dash-line px-5 py-3.5">
          <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
            Where
          </h2>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold tracking-[0.08em] uppercase",
              alerts?.level === "CRITICAL"
                ? "bg-red-600 text-white"
                : alerts?.level === "SERIOUS"
                  ? "bg-red-50 text-red-700"
                  : alerts?.level === "WARNING"
                    ? "bg-flag-50 text-flag-900"
                    : "bg-dash-bg text-dash-muted"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                alerts?.level === "CRITICAL" ? "animate-pulse bg-white" : "bg-current"
              )}
            />
            {band.label}
          </span>

          <p className="ml-auto text-[0.8125rem] text-dash-muted">
            {raised.length === 0 && incidents.length === 0
              ? "Nothing raised, nothing reported"
              : [
                  raised.length &&
                    `${formatNumber(raised.length)} raised by the product`,
                  incidents.length &&
                    `${formatNumber(incidents.length)} filed by somebody who was there`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        </header>

        <div className="px-4 py-3">
          {shapes ? (
            <MiniMap shapes={shapes} fills={fills} notes={notes} height={300} />
          ) : (
            <p className="px-4 py-12 text-center text-[0.875rem] text-dash-muted">
              No map for this contest.
            </p>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-dash-line px-5 py-3 text-[0.8125rem] text-dash-muted">
          {bySeverity.length ? (
            bySeverity.map((item) => (
              <span key={item.id} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-xs"
                  style={{ background: item.color }}
                />
                {formatNumber(item.value)} {item.label.toLowerCase()}
              </span>
            ))
          ) : (
            <span>Nothing has been reported from the field.</span>
          )}
          {band.states > 0 && (
            <span className="ml-auto">
              {band.states === 1 ? "One state" : `${formatNumber(band.states)} states`} with
              something against them
            </span>
          )}
        </footer>
      </section>

      {/* ───────────────────────────────────────────────────────── the detail */}
      {/* A switch rather than both stacked: the lists are long, and a reader
          scrolling past forty alerts to reach the field reports is a reader
          who stops using the second half. */}
      <div className="flex gap-1 rounded-dash border border-dash-line bg-dash-card p-1">
        {HALVES.map((item) => {
          const count = item.id === "alerts" ? raised.length : incidents.length;
          const active = half === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setHalf(item.id)}
              aria-pressed={active}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-dash-sm px-3 py-2 text-[0.8125rem] font-bold transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                active ? "bg-dash-ink text-white" : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
              )}
            >
              <item.icon size={15} strokeWidth={2.25} />
              {item.label}
              {count > 0 && (
                <span
                  className={cn(
                    "figure rounded-full px-1.5 py-0.5 text-[0.6875rem] tabular-nums",
                    active ? "bg-white/20" : "bg-dash-bg"
                  )}
                >
                  {formatNumber(count)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {half === "alerts" ? (
        <RoomAlerts alerts={alerts} onGo={onGo} />
      ) : (
        <IncidentStream incidents={incidents} photos={photos} />
      )}

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[0.75rem] text-dash-muted">
        <span className="flex items-center gap-1.5">
          <BellRing size={12} strokeWidth={2.5} />
          Alerts are raised by this product against a threshold
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin size={12} strokeWidth={2.5} />
          Field reports are filed by a person who was there
        </span>
        <span className="flex items-center gap-1.5">
          <Radio size={12} strokeWidth={2.5} />
          Neither is ever merged with the commission&rsquo;s figures
        </span>
      </p>
    </div>
  );
}
