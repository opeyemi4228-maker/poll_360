"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Database, MapPin, Radio, ShieldQuestion } from "lucide-react";

import { cn, formatNumber } from "@/lib/utils";

/**
 * Data Bank's reports board, in this room.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE HALF OF THE NIGHT THIS PRODUCT CANNOT SEE BY ITSELF
 *
 *  The situation stream beside this one is every report filed *to Poll360*.
 *  That is not every report. An agent may send a situation straight to Data
 *  Bank from another product, over WhatsApp into the hub, or through the
 *  agents' app on an evening when the relay landed and the write into this
 *  database did not. Each of those is sealed and chained in the hub, and until
 *  this panel existed not one of them appeared on any screen in this room.
 *
 *  Silence is where rigging hides, and half the silence was invisible from
 *  inside this product. That is the whole argument for the panel.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── IT HAS NO NARRATIVE, AND THAT IS NOT A BUG TO BE FIXED ─────────────────
 * `intake.v_situation_report` carries a category, a severity, a booth, a time
 * and a channel. It does not carry the words, and it must not: the view is a
 * minimisation boundary, and pulling narratives across would put identifying
 * text into a product with no grant to hold it. A room that needs the account
 * opens it in Data Bank, where the read is logged against a name.
 *
 * So this panel never pretends to be the stream. It says what it knows — that
 * a report of this kind, at this severity, exists for this booth, at this
 * minute, over this channel — and it says where to go for the rest. Blending
 * these rows into the incident feed would have put narrative-less items beside
 * narrated ones, which reads as data that failed to load rather than as a
 * different kind of evidence.
 *
 * ── AND THE CHANNEL IS PRINTED, NEVER IMPLIED ──────────────────────────────
 * A report that arrived over WhatsApp is not the same claim as one from a
 * signed-in agent's app: Meta strips EXIF, gives a bare pin with no accuracy,
 * and offers no device attestation. lib/intake.js carries `channel` on every
 * row for that reason and says no screen may weigh the two alike. This one
 * prints it on every line.
 */

/* Data Bank's severities, which are its own vocabulary and not ours. Ours are
   CRITICAL / SERIOUS / INFO; the hub's are CRITICAL / HIGH / MEDIUM / LOW. The
   mapping between them is written down in lib/agent-day.js, and it is
   deliberately not applied here — this panel shows the hub's own word, because
   translating it would make two products disagree about what a row says. */
const SEVERITY = {
  CRITICAL: { tone: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500", rank: 4 },
  HIGH: { tone: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500", rank: 3 },
  MEDIUM: { tone: "bg-amber-50/60 text-amber-800 border-amber-200", dot: "bg-amber-400", rank: 2 },
  LOW: { tone: "bg-dash-bg text-dash-muted border-dash-line", dot: "bg-dash-line", rank: 1 },
};

/* The hub's categories, as a room says them. A category with no line here is
   printed as it arrives rather than guessed at — a mapping that invented a
   phrase would be putting words in the hub's mouth. */
const CATEGORY = {
  VIOLENCE: "Violence",
  BALLOT_SNATCHING: "Ballot box snatched",
  VOTE_BUYING: "Vote buying",
  OBSTRUCTION: "Agent obstructed",
  LATE_START: "Late start",
  BVAS_FAILURE: "Card reader failure",
  OVERVOTING: "Overvoting",
  LOGISTICS: "Logistics",
  MATERIALS: "Materials",
  COLLATION: "Collation dispute",
  OTHER: "Other",
};

const FILTERS = [
  ["all", "Everything"],
  ["unmatched", "Not in our stream"],
  ["CRITICAL", "Critical"],
  ["HIGH", "High"],
];

export default function HubReports({ hubReports = null, incidents = [] }) {
  const [filter, setFilter] = useState("all");
  /* Re-rendered on a timer purely so "4 minutes ago" stays true. The rows
     themselves arrive through the page's own refresh, the same way the
     incident stream's do. */
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  /* Wrapped rather than written inline: a fresh `[]` on every render would
     make it a new dependency each time and re-run both memos below for
     nothing, on a screen that refreshes every twenty seconds all night. */
  const rows = useMemo(() => hubReports?.rows ?? [], [hubReports]);

  /* ── WHICH OF THESE THIS PRODUCT ALREADY HOLDS ──────────────────────────
     The useful reading is the difference. A hub report whose booth has no
     report of ours is something that arrived somewhere else and never became
     an incident here — a booth to ring rather than a booth to wait for.

     Matched on the booth alone, not on a time window. The two clocks are a
     phone's and a server's and they disagree by minutes; a window tight enough
     to be meaningful would call the same report unmatched on a bad connection,
     which is the exact night this panel is for. Marking a booth as "we have
     something from here too" is the honest strength of claim. */
  const ours = useMemo(
    () => new Set(incidents.map((item) => item.unitCode).filter(Boolean)),
    [incidents]
  );

  const shown = useMemo(() => {
    const list = rows.filter((row) =>
      filter === "all"
        ? true
        : filter === "unmatched"
          ? !ours.has(row.polling_unit_code)
          : row.severity === filter
    );
    /* Newest first, on the hub's receiving clock — the one moment in the chain
       that is a single server's and therefore the only one that orders
       honestly across channels. */
    return [...list].sort(
      (a, b) => new Date(b.received_at ?? 0).getTime() - new Date(a.received_at ?? 0).getTime()
    );
  }, [rows, filter, ours]);

  const unmatched = useMemo(
    () => rows.filter((row) => !ours.has(row.polling_unit_code)).length,
    [rows, ours]
  );

  /* ── THE HUB NOT BEING THERE IS A STATE, NOT AN ERROR ───────────────────
     `available: false` means Data Bank's schema has not been published into
     this deployment. A panel that went blank on that would read as "nothing
     has happened tonight", which is the most dangerous sentence this room can
     accidentally say. It says what is actually true instead. */
  if (!hubReports?.available) {
    return (
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <header className="flex items-center gap-2.5 border-b border-dash-line px-4 py-3">
          <Database size={16} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
          <h3 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
            Data Bank reports
          </h3>
        </header>
        <p className="px-4 py-10 text-center text-[0.875rem] leading-relaxed text-dash-muted">
          This room is not reading Data Bank yet. Reports filed straight to the hub — from another
          product, or over WhatsApp — are held there and are not shown here until it is connected.
          Nothing is lost; it is not visible from this screen.
        </p>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-col rounded-dash border border-dash-line bg-dash-card">
      <header className="border-b border-dash-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Database size={16} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
          <h3 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
            Data Bank reports
          </h3>
          <span className="ml-auto flex items-center gap-1.5">
            <span aria-hidden="true" className="size-1.5 animate-pulse-live rounded-full bg-sky-500" />
            <span className="figure text-[0.625rem] font-bold tracking-wider text-dash-muted uppercase">
              Live
            </span>
          </span>
        </div>

        <p className="mt-1 text-[0.75rem] text-dash-muted">
          {formatNumber(rows.length)} report{rows.length === 1 ? "" : "s"} for booths this room
          watches
          {unmatched ? ` · ${formatNumber(unmatched)} from a booth our stream has nothing from` : ""}
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
          {rows.length === 0
            ? "Data Bank is connected and holds no situation report for any booth this room watches. That is the good reading of an empty panel, and it is the one to check against the field rather than assume."
            : "Nothing matches this filter."}
        </p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {shown.map((row, index) => {
            const tone = SEVERITY[row.severity] ?? SEVERITY.LOW;
            const matched = ours.has(row.polling_unit_code);

            return (
              <li
                key={`${row.polling_unit_code}-${row.narrative_hash ?? index}-${index}`}
                className={cn(
                  "relative px-4 py-3.5",
                  index > 0 && "border-t border-dash-line",
                  index === 0 && "animate-[land_0.5s_var(--ease-out-quart)_both]"
                )}
              >
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
                    {row.severity ?? "LOW"}
                  </span>
                  <span className="figure flex items-center gap-1 text-[0.6875rem] text-dash-muted">
                    <MapPin size={11} strokeWidth={2.5} />
                    {row.polling_unit_code}
                  </span>
                  <span className="figure ml-auto flex items-center gap-1 text-[0.6875rem] text-dash-muted">
                    <Clock size={11} strokeWidth={2.5} />
                    {ago(row.received_at ?? row.recorded_at ?? row.occurred_at)}
                  </span>
                </div>

                <p className="mt-1.5 text-[0.9375rem] font-bold text-dash-ink">
                  {CATEGORY[row.category] ?? row.category ?? "Report"}
                </p>

                {/* ── WHAT IS DELIBERATELY NOT HERE ────────────────────────
                    The account of what happened. Said once, plainly, on the
                    row rather than in a footnote, so nobody reads the absence
                    as a load that failed. */}
                <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] leading-relaxed text-dash-muted">
                  <ShieldQuestion size={12} strokeWidth={2.5} className="shrink-0" />
                  The account is held in Data Bank, under an access log.
                </p>

                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-dash-muted">
                  <span className="flex items-center gap-1">
                    <Radio size={11} strokeWidth={2.5} />
                    {channelLabel(row.channel)}
                  </span>
                  {row.media_count > 0 && (
                    <span>
                      {row.media_count} photograph{row.media_count === 1 ? "" : "s"} held
                    </span>
                  )}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-semibold",
                      matched
                        ? "bg-dash-bg text-dash-muted"
                        : "bg-sky-50 text-sky-800"
                    )}
                  >
                    {matched ? "Our stream has this booth" : "Not in our stream"}
                  </span>
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/**
 * The channel, in words, and never abbreviated to a letter.
 *
 * lib/intake.js carries `channel` on every row because a figure that arrived
 * over WhatsApp cannot be weighed like one from a signed-in browser. A room
 * reading a single-letter code at two in the morning is a room not reading it.
 */
function channelLabel(channel) {
  const value = String(channel ?? "").toUpperCase();
  if (value === "A" || value === "WEB" || value === "APP") return "Signed-in app";
  if (value === "B" || value === "WHATSAPP") return "WhatsApp";
  if (value === "API") return "Keyed API call";
  return channel ? String(channel) : "Channel not stated";
}

/** "4 minutes ago", the only form of time a feed should show. */
function ago(date) {
  if (!date) return "time not stated";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return "time not stated";
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
