"use client";

import { useState } from "react";
import { BellRing, MapPin, Radio, ShieldAlert } from "lucide-react";

import RoomAlerts from "./RoomAlerts";
import IncidentStream from "./IncidentStream";
import { Gauge, MiniMap, Panel, Waffle } from "./Figures";
import { LEVELS } from "@/lib/alerts";
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
  { id: "SERIOUS", label: "Serious", color: "var(--color-amber-500)" },
  { id: "INFO", label: "Noted", color: "var(--color-ink-500)" },
];

export default function RoomWatch({
  alerts = [],
  incidents = [],
  photos = {},
  /* The national outline, so the band can draw where this is happening
     rather than listing the states it is happening in. */
  shapes = null,
  onGo,
}) {
  const [half, setHalf] = useState("alerts");

  /* The room's own state in one word — the worst level anything on screen has
     reached. Read from lib/alerts.js so this and the alert list can never
     disagree about what "critical" means. */
  const worst = alerts.reduce((rank, item) => Math.max(rank, LEVELS[item.level]?.rank ?? 0), 0);
  const level = Object.values(LEVELS).find((item) => item.rank === worst) ?? null;

  /* How much of the room is clear. The one figure this screen is about, so it
     gets the one arc — see Gauge in components/dash/Figures.jsx. */
  const raised = alerts.length + incidents.length;

  const bySeverity = SEVERITY.map((item) => ({
    ...item,
    value: incidents.filter((row) => row.severity === item.id).length,
  }));

  /* ── WHERE, DRAWN RATHER THAN LISTED ──────────────────────────────────
     A state is coloured by the worst thing reported in it and labelled with
     how many. A state with nothing against it keeps the surface colour: an
     absence, not a low number, which is the rule every map in this product
     follows. */
  const worstOf = {};
  const howMany = {};
  for (const item of incidents) {
    if (!item.stateCode) continue;
    const rank = item.severity === "CRITICAL" ? 0 : item.severity === "SERIOUS" ? 1 : 2;
    worstOf[item.stateCode] = Math.min(worstOf[item.stateCode] ?? 2, rank);
    howMany[item.stateCode] = (howMany[item.stateCode] ?? 0) + 1;
  }

  const fills = Object.fromEntries(
    Object.entries(worstOf).map(([code, rank]) => [code, SEVERITY[rank].color])
  );

  const notes = Object.fromEntries(
    Object.entries(howMany).map(([code, count]) => [
      code,
      `${count} report${count === 1 ? "" : "s"}`,
    ])
  );

  return (
    <div className="flex flex-col gap-3">
      {/* ─────────────────────────────────────────────────── the picture band */}
      <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          title="The room"
          figure={level?.label ?? "Clear"}
          foot={
            raised
              ? `${formatNumber(alerts.length)} raised · ${formatNumber(incidents.length)} reported`
              : "Nothing above the line"
          }
        >
          <Gauge
            /* Full and green is a clear room; it empties as things are raised.
               Drawn the way somebody hopes to find it, so a glance at a wall
               tells them whether to walk over. */
            share={raised ? Math.max(6, 100 - Math.min(100, raised * 6)) : 100}
            figure={raised ? formatNumber(raised) : "0"}
            sub={raised === 1 ? "thing to look at" : "things to look at"}
            tone={worst >= 3 ? "alert" : worst >= 2 ? "warn" : "good"}
          />
        </Panel>

        <Panel
          title="Field reports by severity"
          figure={formatNumber(incidents.length)}
          foot="Each cell is a percentage point of what has been reported, not one report."
        >
          {incidents.length ? (
            <Waffle
              share={
                ((bySeverity[0].value + bySeverity[1].value) / Math.max(incidents.length, 1)) * 100
              }
              tone={bySeverity[0].value ? "alert" : "warn"}
              label={`${formatNumber(bySeverity[0].value + bySeverity[1].value)} need somebody`}
            />
          ) : (
            <p className="text-[0.875rem] text-dash-muted">
              Nothing has been reported from the field yet.
            </p>
          )}
        </Panel>

        <Panel
          title="Where"
          figure={`${formatNumber(Object.keys(hot).length)} state${Object.keys(hot).length === 1 ? "" : "s"}`}
          foot="Red is a critical report, amber a serious one. A state with nothing against it is left blank."
        >
          {shapes ? (
            <MiniMap shapes={shapes} fills={fills} notes={notes} height={190} />
          ) : (
            <p className="text-[0.875rem] text-dash-muted">No map for this contest.</p>
          )}
        </Panel>
      </div>

      {/* ───────────────────────────────────────────────────────── the detail */}
      {/* A switch rather than both stacked: the lists are long, and a reader
          scrolling past forty alerts to reach the field reports is a reader
          who stops using the second half. */}
      <div className="flex gap-1 rounded-dash border border-dash-line bg-dash-card p-1">
        {HALVES.map((item) => {
          const count = item.id === "alerts" ? alerts.length : incidents.length;
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
