"use client";

import { useState } from "react";
import { MapPinned } from "lucide-react";

import { Columns, Meter, Panel, Ranked, Readout, Split, Tile } from "./Figures";
import { clockLabel, quiet } from "./RoomPulse";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * Coverage: what was planned, what signed in, what filed, what was checked.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SCREEN THAT IS ALLOWED TO BE DEPRESSING
 *
 *  A count can be wrong two ways. The figures can be wrong — that is the
 *  integrity console. Or the figures can be fine and there can simply not be
 *  enough of them, and that failure is invisible everywhere else in this room,
 *  because a map drawn from eleven booths looks exactly like a map drawn from
 *  eleven thousand.
 *
 *  Every stage below is a subset of the one above it, so the drop between two
 *  of them is a real drop rather than two differently-sourced numbers
 *  disagreeing. The loss is printed in whole booths, never smoothed into a
 *  percentage on its own.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE SILENCE LIST IS NAMES, NOT A COUNT ─────────────────────────────────
 * "Fourteen have not reported" is a statistic. Fourteen names, the booth each
 * one holds and how long since anybody heard from them is a call list — and
 * one of those names may be somebody in trouble rather than somebody asleep.
 */
export default function RoomCoverage({ pulse, ground = null, onGo, onUnit = null }) {
  const [showAll, setShowAll] = useState(false);

  const { funnel, channels, clocks, positions, states, silence } = pulse;
  const roster = funnel[0].count || 1;
  const share = (part, whole) => (whole ? (part / whole) * 100 : 0);
  const shown = showAll ? silence : silence.slice(0, 10);
  const never = silence.filter((row) => row.quietMinutes === null).length;

  /* Ordered bands, so one hue getting darker — except "far", which is a state
     somebody has to look at and therefore wears the warning colour. */
  const bands = [
    { id: "matched", label: "At the booth", value: positions.matched ?? 0, color: "var(--color-ink-800)" },
    { id: "near", label: "Within 2km", value: positions.near ?? 0, color: "var(--color-ink-500)" },
    { id: "far", label: "Further", value: positions.far ?? 0, color: "var(--color-amber-500)" },
    {
      id: "none",
      label: "No fix",
      value: (positions.unmatched ?? 0) + (positions.unknown ?? 0),
      color: "var(--color-ink-300)",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* ── NO KPI ROW HERE ANY MORE ──────────────────────────────────────
          Four tiles drew the four funnel stages, each with its own count, its
          own denominator and its own "N lost from the step above". It was the
          same funnel as the one now drawn at the top of this screen — see
          components/dash/RoomGround.jsx — and drawing it twice, once as a
          shape and once as four numbers, is exactly the wall of figures this
          room was accused of being. The shape stays; the arithmetic that was
          under it is on the shape itself. */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-3">
          {/* ------------------------------------------------------- states */}
          <Panel
            title="By state"
            figure={`${formatNumber(states.length)} state${states.length === 1 ? "" : "s"}`}
          >
            {states.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-[0.8125rem]">
                  <thead>
                    <tr className="border-b border-dash-line text-left text-[0.625rem] tracking-[0.08em] text-dash-muted uppercase">
                      <th className="pb-2 font-semibold">State</th>
                      <th className="pb-2 text-right font-semibold">Assigned</th>
                      <th className="pb-2 text-right font-semibold">Filed</th>
                      <th className="pb-2 text-right font-semibold">Verified</th>
                      <th className="w-[38%] pb-2 pl-4 font-semibold">Reporting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {states.map((row) => {
                      /* Only a state with somebody in it has a reporting rate.
                         Dividing by nobody prints 0% or ∞, and both are claims
                         about a deployment that does not exist. */
                      const rate = row.assigned ? (row.filed / row.assigned) * 100 : null;
                      return (
                        <tr key={row.code} className="border-b border-dash-line/60 last:border-0">
                          <td className="py-1.5 font-semibold text-dash-ink">{row.name}</td>
                          <td className="figure py-1.5 text-right text-dash-muted tabular-nums">
                            {formatNumber(row.assigned)}
                          </td>
                          <td className="figure py-1.5 text-right font-bold text-dash-ink tabular-nums">
                            {formatNumber(row.filed)}
                          </td>
                          <td className="figure py-1.5 text-right text-dash-muted tabular-nums">
                            {formatNumber(row.verified)}
                          </td>
                          <td className="py-1.5 pl-4">
                            {rate === null ? (
                              <span className="text-[0.6875rem] text-dash-muted">unassigned</span>
                            ) : (
                              <span className="flex items-center gap-2">
                                <Meter
                                  share={rate}
                                  height={6}
                                  className="w-full"
                                  tone={rate >= 80 ? "good" : rate >= 40 ? "warn" : "alert"}
                                />
                                <span className="figure w-11 shrink-0 text-right text-[0.6875rem] text-dash-muted tabular-nums">
                                  {formatShare(rate)}
                                </span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[0.875rem] text-dash-muted">
                Nothing filed and nobody assigned{ground ? ` in ${ground}` : ""} yet.
              </p>
            )}
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              title="Returns per quarter hour"
              figure={`peak ${formatNumber(Math.max(0, ...pulse.arrivals.map((b) => b.count)))}`}
            >
              <Columns
                height={80}
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

            <Panel title="The clocks">
              <div className="space-y-0.5">
                <Readout
                  label="Since the last return"
                  value={quiet(clocks.quietMinutes)}
                  tone={clocks.quietMinutes > 45 ? "warn" : "ink"}
                />
                <Readout label="Half of returns checked within" value={quiet(clocks.verify.p50)} />
                <Readout label="Nine in ten checked within" value={quiet(clocks.verify.p90)} />
                <Readout
                  label="First return"
                  value={clocks.first ? stamp(clocks.first) : "—"}
                  /* Measured from the instant the pulse was assembled on the
                     server, not from a clock read during render: every window
                     on this screen has to be measured from one moment or it
                     reports movement that did not happen. */
                  sub={
                    clocks.first && pulse.at
                      ? `${clockLabel((new Date(pulse.at) - new Date(clocks.first)) / 60000)} ago`
                      : null
                  }
                />
              </div>
            </Panel>
          </div>
        </div>

        {/* ----------------------------------------------------------- aside */}
        <div className="flex flex-col gap-3">
          <Panel
            title="How the returns reached us"
            figure={formatNumber(channels.reduce((sum, row) => sum + row.count, 0))}
          >
            {channels.length ? (
              <Split segments={channels.map((row) => ({ id: row.id, label: row.label, value: row.count }))} />
            ) : (
              <p className="text-[0.8125rem] text-dash-muted">Nothing has arrived yet.</p>
            )}
          </Panel>

          <Panel
            title="Filed from where"
            figure={
              bands[2].value
                ? `${formatShare(share(bands[2].value, bands.reduce((sum, b) => sum + b.value, 0)))} far`
                : null
            }
            foot="A position corroborates a return; it never authorises one."
          >
            <Split segments={bands} />
          </Panel>

          {/* --------------------------------------------------------- silence */}
          <Panel
            title="Not heard from"
            figure={`${formatNumber(silence.length)}${never ? ` · ${formatNumber(never)} never signed in` : ""}`}
          >
            {silence.length ? (
              <>
                <ul className="divide-y divide-dash-line/60">
                  {shown.map((row) => {
                    /* ── A NAME ON THIS LIST IS A DOOR, NOT A STRING ──────
                       Every finding on this screen ends in a booth code, and
                       until the polling-unit card sat on the same screen the
                       only thing a reader could do with one was copy it out
                       by hand. A row opens the card for its booth where there
                       is a booth and a card to open; the rest stay plain
                       text, because a control that does nothing when pressed
                       teaches people not to press any of them. */
                    const opens = onUnit && row.unitCode;
                    const Tag = opens ? "button" : "div";

                    return (
                      <li key={row.id}>
                        <Tag
                          {...(opens ? { type: "button", onClick: () => onUnit(row.unitCode) } : {})}
                          className={cn(
                            "flex w-full items-baseline justify-between gap-3 py-1.5 text-left",
                            opens &&
                              "rounded-dash-sm px-1 transition-colors hover:bg-dash-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[0.8125rem] font-semibold text-dash-ink">
                              {row.name}
                            </span>
                            <span className="figure block truncate text-[0.6875rem] text-dash-muted">
                              {row.unitCode ?? "no booth"}
                              {row.state ? ` · ${row.state}` : ""}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "figure shrink-0 text-[0.75rem] font-bold tabular-nums",
                              row.quietMinutes === null ? "text-red-600" : "text-dash-muted"
                            )}
                          >
                            {row.quietMinutes === null ? "never" : clockLabel(row.quietMinutes)}
                          </span>
                        </Tag>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {silence.length > 10 && (
                    <button
                      type="button"
                      onClick={() => setShowAll((value) => !value)}
                      className="text-[0.75rem] font-semibold text-dash-ink underline underline-offset-4"
                    >
                      {showAll ? "Fewer" : `All ${formatNumber(silence.length)}`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onGo?.("watch")}
                    className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-dash-ink underline underline-offset-4"
                  >
                    <MapPinned size={13} strokeWidth={2.5} />
                    On the map
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[0.8125rem] text-dash-muted">Everyone holding a booth has filed.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

const stamp = (date) =>
  date
    ? new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false }).format(
        new Date(date)
      )
    : "—";
