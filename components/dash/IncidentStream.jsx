"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Camera, Clock, MapPin, ShieldAlert } from "lucide-react";

import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The situation stream.
 *
 * ── WHY IT READS LIKE A TIMELINE AND NOT A TABLE ───────────────────────────
 * What comes off a polling unit that is not a number is not tabular. It is
 * "the card reader has failed at 08:14", "party agents are being turned away",
 * "the queue is four hundred deep and it closes in an hour". Those are events
 * in time, and the shape people already read events in, newest at the top,
 * timestamped, one to a line, scannable in a glance, is a feed.
 *
 * ── AND WHY SEVERITY IS A WORD BEFORE IT IS A COLOUR ───────────────────────
 * A room under pressure at 2am is exactly the audience that cannot afford to
 * decode a colour key. Every item is labelled CRITICAL, SERIOUS or INFO in
 * type; the colour repeats that, and never carries it alone.
 * ───────────────────────────────────────────────────────────────────────────
 */
const SEVERITY = {
  CRITICAL: { tone: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500", rank: 3 },
  SERIOUS: { tone: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500", rank: 2 },
  INFO: { tone: "bg-dash-bg text-dash-muted border-dash-line", dot: "bg-dash-line", rank: 1 },
};

const FILTERS = [
  ["all", "Everything"],
  ["CRITICAL", "Critical"],
  ["SERIOUS", "Serious"],
  ["photo", "With a photo"],
];

export default function IncidentStream({ incidents, photos = {} }) {
  const [filter, setFilter] = useState("all");
  /* Re-rendered on a timer purely so "4 minutes ago" stays true. The data
     itself arrives through the page's own refresh. */
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const shown = useMemo(
    () =>
      incidents.filter((item) =>
        filter === "all"
          ? true
          : filter === "photo"
            ? (photos[item.id]?.length ?? 0) > 0
            : item.severity === filter
      ),
    [incidents, filter, photos]
  );

  const counts = useMemo(
    () => ({
      critical: incidents.filter((item) => item.severity === "CRITICAL").length,
      serious: incidents.filter((item) => item.severity === "SERIOUS").length,
    }),
    [incidents]
  );

  return (
    <section className="flex min-h-0 flex-col rounded-dash border border-dash-line bg-dash-card">
      <header className="border-b border-dash-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <ShieldAlert size={16} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
          <h3 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
            Situation stream
          </h3>
          <span className="ml-auto flex items-center gap-1.5">
            <span aria-hidden="true" className="size-1.5 animate-pulse-live rounded-full bg-red-500" />
            <span className="figure text-[0.625rem] font-bold tracking-wider text-dash-muted uppercase">
              Live
            </span>
          </span>
        </div>

        <p className="mt-1 text-[0.75rem] text-dash-muted">
          {formatNumber(incidents.length)} report{incidents.length === 1 ? "" : "s"} from the field
          {counts.critical ? ` · ${counts.critical} critical` : ""}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={cn(
                "rounded-full px-3 py-1.5 text-[0.75rem] font-semibold transition-colors",
                filter === value
                  ? "bg-dash-ink text-white"
                  : "bg-dash-bg text-dash-muted hover:text-dash-ink"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {shown.length === 0 ? (
        <p className="px-4 py-10 text-center text-[0.875rem] leading-relaxed text-dash-muted">
          {incidents.length === 0
            ? "Nothing reported. When a coordinator files something that is not a number, a queue at close, a reader that will not read, an agent turned away, it appears here within seconds, with the unit code attached."
            : "Nothing matches this filter."}
        </p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {shown.map((item, index) => {
            const tone = SEVERITY[item.severity] ?? SEVERITY.INFO;
            const shots = photos[item.id] ?? [];

            return (
              <li
                key={item.id}
                className={cn(
                  "relative px-4 py-3.5",
                  index > 0 && "border-t border-dash-line",
                  /* Newest item gets the entrance, and only the newest, a
                     list that animates every row on each refresh becomes a
                     slot machine. */
                  index === 0 && "animate-[land_0.5s_var(--ease-out-quart)_both]"
                )}
              >
                {/* The spine: a timeline needs a line. */}
                <span
                  aria-hidden="true"
                  className={cn("absolute top-0 bottom-0 left-0 w-0.5", tone.dot)}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[0.625rem] font-bold uppercase",
                      tone.tone
                    )}
                  >
                    {item.severity}
                  </span>
                  <span className="figure flex items-center gap-1 text-[0.6875rem] text-dash-muted">
                    <MapPin size={11} strokeWidth={2.5} />
                    {item.unitCode}
                  </span>
                  <span className="figure ml-auto flex items-center gap-1 text-[0.6875rem] text-dash-muted">
                    <Clock size={11} strokeWidth={2.5} />
                    {ago(item.createdAt)}
                  </span>
                </div>

                <p className="mt-1.5 text-[0.9375rem] font-bold text-dash-ink">{item.kind}</p>

                {item.detail && (
                  <p className="mt-1 text-[0.875rem] leading-relaxed text-dash-muted">
                    {item.detail}
                  </p>
                )}

                {shots.length > 0 && (
                  <ul className="mt-2.5 flex flex-wrap gap-2">
                    {shots.map((photo) => (
                      <li key={photo.id}>
                        {/* eslint-disable-next-line @next/next/no-img-element --
                            Served by an authenticated route that 404s to anyone
                            who may not read incidents; the optimiser would
                            proxy evidence onto disk. */}
                        <img
                          src={`/api/media/${photo.id}`}
                          alt={`Filed with the ${item.kind} report at ${item.unitCode}`}
                          loading="lazy"
                          className="size-16 rounded-dash-sm border border-dash-line object-cover"
                        />
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-1.5 flex items-center gap-2 text-[0.6875rem] text-dash-muted">
                  {item.reporter}
                  {shots.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Camera size={11} strokeWidth={2.5} />
                      {shots.length}
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** "4 minutes ago", the only form of time a feed should show. */
function ago(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
