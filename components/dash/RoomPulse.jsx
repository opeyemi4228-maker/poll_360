"use client";

import { MapPin, Radio, Signal } from "lucide-react";

import CoverageDial from "./CoverageDial";
import { Columns, Donut, Gauge, Meter, Panel, Ranked, Readout, Split, Waffle } from "./Figures";
import { MOVEMENT_MINUTES } from "@/lib/pulse";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * The overview: is this working, what moved, where to ring, what looks wrong.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WRITTEN IN FIGURES, NOT IN SENTENCES
 *
 *  The first version of this screen explained itself in paragraphs. In a room
 *  where somebody is holding a phone, watching a wall, and has nine seconds
 *  between calls, a paragraph is not read — it is skipped, and the figure
 *  beside it is skipped with it.
 *
 *  So every claim on this screen is a number, a share and a bar, and the
 *  reasoning that used to sit beside them is in this comment where it belongs.
 *  Captions are capped at a line. Nothing here needs to be read twice.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE DENOMINATORS, WHICH ARE THE WHOLE ARGUMENT ─────────────────────────
 * Every share on this screen is against booths we have somebody at, and the
 * tiles say `/assigned` in figures rather than in prose. The registry — the
 * project's whole booth count — is a different and much larger number, and it
 * is shown once, greyed, beside the dial, so the two can never be swapped.
 * See lib/pulse.js.
 */
export default function RoomPulse({
  pulse,
  incidents = [],
  integrity = null,
  divergence = null,
  boardSource = "returns",
  ground = null,
  onGo,
}) {
  const { filed, verified, assigned, unitsRegistered, movement, clocks, funnel } = pulse;

  const open = incidents.length;
  const critical =
    (pulse.incidents.bySeverity.CRITICAL ?? 0) + (pulse.incidents.bySeverity.HIGH ?? 0);
  const silent = pulse.silence.length;
  const share = (part, whole) => (whole ? (part / whole) * 100 : 0);

  /* Where to ring: states with people assigned and returns missing. A state
     nobody was deployed to cannot appear here, which is the point. */
  const shortfall = pulse.states
    .filter((row) => row.assigned > 0 && row.assigned > row.filed)
    .map((row) => ({ id: row.code, label: row.name, value: row.assigned - row.filed }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  /* The last hour, off the same buckets the chart draws. */
  const lastHour = pulse.arrivals.slice(-4).reduce((sum, bucket) => sum + bucket.count, 0);
  const peak = Math.max(0, ...pulse.arrivals.map((bucket) => bucket.count));

  return (
    <div className="grid gap-3 xl:grid-cols-[19rem_minmax(0,1fr)]">
      {/* ------------------------------------------------------------ dial */}
      <div className="flex flex-col gap-3">
        <Panel
          title="Booths reporting"
          figure={formatShare(share(filed, assigned))}
          foot={
            unitsRegistered
              ? `${formatNumber(assigned)} assigned · ${formatNumber(unitsRegistered)} in the registry`
              : `${formatNumber(assigned)} assigned a booth`
          }
        >
          <CoverageDial reported={filed} total={assigned || filed || 1} verified={verified} />
        </Panel>

        <Panel title={`Last ${MOVEMENT_MINUTES} minutes`} figure={clockLabel(clocks.quietMinutes)}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Moved label="Filed" value={movement.filed} />
            <Moved label="Verified" value={movement.verified} />
            <Moved label="Reports" value={movement.incidents} tone="alert" />
          </div>
          {movement.states.length > 0 && (
            <p className="mt-3 truncate text-[0.75rem] text-dash-muted">
              {movement.states.slice(0, 4).join(" · ")}
              {movement.states.length > 4 ? ` +${movement.states.length - 4}` : ""}
            </p>
          )}
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        {/* ── FOUR NUMBERS, DRAWN AS FOUR PICTURES ────────────────────────
            This was four stat tiles: a figure, a denominator, a percentage,
            a delta and a caption apiece — twenty numbers in a row, on the
            screen somebody opens first. It was accurate and it read as a
            table of contents, so the eye landed nowhere and the room learnt
            to skim it.

            The same four facts are shapes now. A ring that is filling, a
            grid that is emptying, a bar of severities, a ring of findings.
            Each still prints the one figure it is about, because a shape
            somebody has to measure is a shape they will read wrong — but
            one figure, not five. Every panel is still a door. */}
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <Panel title="Returns in" figure={formatNumber(filed)} foot={`${formatNumber(pulse.awaiting)} awaiting a check`}>
            <button
              type="button"
              onClick={() => onGo?.("results")}
              className="w-full rounded-dash-sm transition-colors hover:bg-dash-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
            >
              <Gauge
                share={share(filed, assigned)}
                figure={formatShare(share(filed, assigned))}
                sub={`of ${formatNumber(assigned)} assigned`}
                size={116}
              />
            </button>
          </Panel>

          <Panel
            title="Not heard from"
            figure={formatNumber(silent)}
            foot={
              silent
                ? `${formatNumber(pulse.silence.filter((row) => row.quietMinutes === null).length)} never signed in`
                : "Everyone has filed"
            }
          >
            <button
              type="button"
              onClick={() => onGo?.("coverage")}
              className="block w-full rounded-dash-sm p-1 text-left transition-colors hover:bg-dash-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
            >
              {/* A percentage that has not reported reads as a pass mark.
                  The same fact as filled cells is a count of places nobody
                  has heard from, and a room argues about it properly. */}
              <Waffle
                share={share(silent, assigned)}
                tone={silent ? "warn" : "ink"}
                label={silent ? `${formatShare(share(silent, assigned))} of those assigned` : "all in"}
              />
            </button>
          </Panel>

          <Panel
            title="Reports open"
            figure={formatNumber(open)}
            foot={`${formatNumber(critical)} at the top two severities`}
          >
            <button
              type="button"
              onClick={() => onGo?.("alerts")}
              className="block w-full rounded-dash-sm p-1 text-left transition-colors hover:bg-dash-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
            >
              {open ? (
                <Split
                  segments={[
                    { id: "top", label: "Needs somebody", value: critical, color: "var(--color-red-500)" },
                    { id: "rest", label: "Noted", value: Math.max(0, open - critical), color: "var(--color-ink-500)" },
                  ]}
                  total={open}
                />
              ) : (
                <p className="py-3 text-[0.875rem] text-dash-muted">Nothing reported from the field.</p>
              )}
            </button>
          </Panel>

          <Panel
            title="The checks"
            figure={integrity ? formatNumber(integrity.impossible) : "—"}
            foot={
              integrity
                ? `${formatNumber(integrity.flagged)} flagged of ${formatNumber(integrity.screened)} screened`
                : null
            }
          >
            <button
              type="button"
              onClick={() => onGo?.("integrity")}
              className="w-full rounded-dash-sm transition-colors hover:bg-dash-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
            >
              {integrity?.screened ? (
                <Donut
                  segments={[
                    { id: "clean", label: "Clean", value: integrity.clean, color: "var(--color-emerald-500)" },
                    { id: "flagged", label: "Flagged", value: integrity.flagged, color: "var(--color-amber-500)" },
                    { id: "impossible", label: "Impossible", value: integrity.impossible, color: "var(--color-red-500)" },
                  ].filter((part) => part.value > 0)}
                  total={integrity.screened}
                  size={116}
                  centre={
                    <span className="text-center">
                      <span className="figure block text-[1.25rem] leading-none font-bold text-dash-ink tabular-nums">
                        {formatNumber(integrity.screened)}
                      </span>
                      <span className="mt-0.5 block text-[0.625rem] text-dash-muted">screened</span>
                    </span>
                  }
                />
              ) : (
                <p className="py-3 text-[0.875rem] text-dash-muted">Nothing filed yet to screen.</p>
              )}
            </button>
          </Panel>
        </div>

        {/* ------------------------------------------------------- arrivals */}
        <Panel
          title="Returns per quarter hour"
          figure={`${formatNumber(lastHour)} in the last hour`}
          foot={`Peak ${formatNumber(peak)} · four hours to ${stamp(pulse.arrivals.at(-1)?.at)}`}
        >
          <Columns
            points={pulse.arrivals.map((bucket) => ({
              id: bucket.at.toISOString(),
              value: bucket.count,
              label: stamp(bucket.at),
            }))}
          />
          <div className="mt-1.5 flex justify-between text-[0.6875rem] text-dash-muted">
            <span>{stamp(pulse.arrivals[0]?.at)}</span>
            <span>{stamp(pulse.arrivals.at(-1)?.at)}</span>
          </div>
        </Panel>

        <div className="grid gap-3 lg:grid-cols-3">
          {/* ---------------------------------------------------- the funnel */}
          <Panel
            title="The funnel"
            figure={formatShare(share(funnel.at(-1).count, funnel[0].count || 1))}
          >
            <ul className="space-y-2.5">
              {funnel.map((stage, index) => (
                <li key={stage.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[0.75rem] text-dash-muted">{stage.label}</span>
                    <span className="figure shrink-0 text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                      {formatNumber(stage.count)}
                    </span>
                  </div>
                  <Meter
                    share={share(stage.count, funnel[0].count || 1)}
                    height={5}
                    className="mt-1"
                    /* One hue getting darker as the funnel narrows: these are
                       ordered stages, not four different things. */
                    tone={index === funnel.length - 1 ? "good" : "ink"}
                  />
                </li>
              ))}
            </ul>
          </Panel>

          {/* --------------------------------------------------- where to ring */}
          <Panel
            title="Missing returns"
            figure={`${formatNumber(shortfall.reduce((sum, row) => sum + row.value, 0))} booths`}
          >
            <Ranked
              rows={shortfall}
              showShare={false}
              tone="warn"
              empty={assigned ? "Every assigned booth has filed." : "Nobody assigned yet."}
            />
          </Panel>

          {/* --------------------------------------------------------- checks */}
          <Panel title="What the checks say">
            <div className="space-y-0.5">
              <Readout
                label="Filed from outside the booth"
                value={formatNumber(pulse.positions.far ?? 0)}
                tone={pulse.positions.far ? "warn" : "ink"}
                onClick={() => onGo?.("watch")}
              />
              <Readout
                label="Sheets that do not add up"
                value={pulse.sheets.audited ? formatNumber(pulse.sheets.fails) : "—"}
                sub={
                  pulse.sheets.audited
                    ? `of ${formatNumber(pulse.sheets.audited)}`
                    : "none auditable"
                }
                tone={pulse.sheets.fails ? "warn" : "ink"}
                onClick={() => onGo?.("integrity")}
              />
              <Readout
                label="Places differing from declaration"
                value={divergence?.ready ? formatNumber(divergence.places) : "—"}
                sub={divergence?.ready ? `of ${formatNumber(divergence.compared)}` : "none declared"}
                tone={divergence?.urgent?.length ? "alert" : "ink"}
                onClick={() => onGo?.("integrity")}
              />
              <Readout
                label="Half of returns checked within"
                value={clockLabel(clocks.verify.p50)}
                onClick={() => onGo?.("coverage")}
              />
            </div>
          </Panel>
        </div>

        {/* One line, because a room does need to know what it is looking at. */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-dash border border-dash-line bg-dash-card px-4 py-2.5 text-[0.75rem] text-dash-muted">
          <span className="flex items-center gap-1.5 font-semibold text-dash-ink">
            <Signal size={13} strokeWidth={2.5} />
            {SOURCE[boardSource] ?? SOURCE.returns}
          </span>
          {ground && (
            <span className="flex items-center gap-1.5">
              <MapPin size={12} strokeWidth={2.5} />
              {ground}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Radio size={12} strokeWidth={2.5} />
            Never merged with the commission&rsquo;s figures
          </span>
        </p>
      </div>
    </div>
  );
}

const SOURCE = {
  replay: "2023 replay",
  returns: "Our agents' returns",
  declared: "Declared figures",
  empty: "Nothing filed yet",
};

function Moved({ label, value, tone = "ink" }) {
  return (
    <div className="rounded-dash-sm bg-dash-bg py-2.5">
      <p
        className={cn(
          "figure text-[1.375rem] leading-none font-bold tabular-nums",
          value > 0 && tone === "alert" ? "text-red-600" : "text-dash-ink"
        )}
      >
        {value > 0 ? `+${formatNumber(value)}` : "0"}
      </p>
      <p className="mt-1 text-[0.6875rem] text-dash-muted">{label}</p>
    </div>
  );
}

/* --------------------------------------------------------------- wording */

/** A duration in the words somebody would actually say it in. */
export function quiet(minutes) {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${Math.round(minutes)} minute${Math.round(minutes) === 1 ? "" : "s"}`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} hours`;
  return `${Math.round(hours / 24)} days`;
}

/** The same duration at tile size: two characters and a unit. */
export function clockLabel(minutes) {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 90) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  return `${Math.round(hours / 24)}d`;
}

const stamp = (date) =>
  date
    ? new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false }).format(
        new Date(date)
      )
    : "—";
