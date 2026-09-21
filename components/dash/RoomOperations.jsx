"use client";

import { useState } from "react";

import { Funnel, Gauge, TONE } from "./Figures";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Results operations: where the count is, and where it has stopped.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE DROP IS THE CONTENT, AND A TAPER DRAWS IT
 *
 *  Six bars of decreasing length report that fewer things reach the end than
 *  start, which nobody needed a chart to learn. What a room needs is the
 *  *difference* between two rungs, because a difference is a pile of returns
 *  sitting somewhere with somebody's name on it.
 *
 *  Drawn as a taper, that difference stops being an arithmetic exercise
 *  between two bar ends and becomes a wedge of missing area — the one shape
 *  the eye reads without being asked to. Where returns are actually held the
 *  wedge is amber; where the drop is nobody owing that step, it stays neutral.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * See lib/operations.js for why each rung contains the one above it, and for
 * the two figures printed under the funnel that its last rung would otherwise
 * swallow.
 */

const CUTS = [
  ["state", "By state"],
  ["channel", "By how it arrived"],
];

const LABEL = {
  extracted: "Sheet read",
  confirmed: "Agent confirmation",
  validated: "Validation",
  verified: "A desk",
};

export default function RoomOperations({ operations, onGo, onUnit }) {
  const [cut, setCut] = useState("state");

  if (!operations) return null;

  const {
    stages,
    stuck,
    kpis,
    byState,
    byChannel,
    withoutEvidence,
    verifiedImpossible,
    unitsRegistered,
  } = operations;

  const rows = cut === "state" ? byState : byChannel;
  const held = stages.filter((stage) => stage.held > 0);

  return (
    <div className="flex flex-col gap-3">
      {/* ── THE ROW OF TILES THAT SAID THE FUNNEL TWICE ──────────────────
          Four tiles stood here: Received, Verified, Waiting and Thrown out,
          each with a value, a denominator, a share and a footnote. Three of
          the four were funnel stages restated — the same two numbers, in a
          second shape, eighteen inches above the shape that already showed
          them and their relationship to every other stage.

          A figure printed twice on one screen is not emphasis. It is two
          things to keep in step, and the first time the tile and the funnel
          disagree — after a filter, a narrowing, a refactor — a desk stops
          trusting both. The funnel is the better of the two shapes because it
          is the only one that shows what fell out between the steps, which is
          the entire question this screen exists to answer.

          Only "thrown out" survives, as a line rather than a tile, because it
          is the one figure that is genuinely not in the funnel: a disputed
          return is out of every sum, so it has no rung to stand on. */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ---------------------------------------------------------- funnel */}
        <section className="rounded-dash border border-dash-line bg-dash-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                The pipeline
              </h3>
              <p className="figure mt-1 text-[1.75rem] leading-none font-bold tracking-[-0.03em] text-dash-ink tabular-nums">
                {formatNumber(kpis.processed)}
                <span className="ml-2 text-[0.8125rem] font-normal text-dash-muted">
                  processed
                </span>
              </p>
            </div>

            {/* The one arc on this screen: how much of what was expected has
                been all the way through. */}
            <Gauge
              share={kpis.complete}
              tone={kpis.complete >= 90 ? "good" : kpis.complete >= 50 ? "ink" : "warn"}
              label="complete"
              size={104}
              track={9}
            />
          </div>

          <div className="mt-4">
            <Funnel stages={stages} />
          </div>

          {/* ── THE ONE FIGURE THE FUNNEL CANNOT CARRY ────────────────────
              A disputed return is out of every sum above — see
              results.counted in lib/db.js — so it has no rung to stand on and
              would be invisible if this screen only drew the pipeline. It is
              stated against everything filed rather than against `received`,
              which it is not part of. */}
          {kpis.rejected > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-x-2 border-t border-dash-line pt-3 text-[0.8125rem] text-dash-muted">
              <span className="font-semibold text-red-700">
                {formatNumber(kpis.rejected)} thrown out
              </span>
              <span>
                — {formatShare((kpis.rejected / (kpis.received + kpis.rejected)) * 100)} of
                everything filed, and out of every figure above.
              </span>
            </p>
          )}

          {/* Where returns are actually standing, as chips rather than as a
              paragraph. Each is a rung, a count, and how long the median one
              has been there — the three things that decide who gets rung. */}
          {held.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {held.map((stage) => (
                <li
                  key={stage.id}
                  title={stage.why}
                  className="flex items-center gap-2 rounded-full border border-flag-200 bg-flag-50 px-3 py-1.5"
                >
                  <span className="figure text-[0.875rem] font-bold text-flag-800 tabular-nums">
                    {formatNumber(stage.held)}
                  </span>
                  <span className="text-[0.75rem] font-semibold text-flag-900">
                    at {stage.label.toLowerCase()}
                  </span>
                  {stage.p50 != null && (
                    <span className="figure text-[0.75rem] text-flag-700 tabular-nums">
                      {clock(stage.p50)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* ── WHAT THE LAST RUNG'S BACK-FILL WOULD OTHERWISE SWALLOW ──────
              Verification counts as having cleared everything beneath it, or
              the funnel widens at the end. These are the two things that
              hides. See the head of lib/operations.js. */}
          {(verifiedImpossible > 0 || withoutEvidence > 0) && (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-dash-line pt-3">
              {verifiedImpossible > 0 && (
                <button
                  type="button"
                  onClick={() => onGo?.("integrity")}
                  className="flex items-baseline gap-2 text-left"
                >
                  <span className="figure text-[1.125rem] font-bold text-red-700 tabular-nums">
                    {formatNumber(verifiedImpossible)}
                  </span>
                  <span className="text-[0.75rem] text-dash-muted underline-offset-2 hover:underline">
                    verified despite breaking arithmetic
                  </span>
                </button>
              )}
              {withoutEvidence > 0 && (
                <span
                  title="Not a fault — a desk that rang the presiding officer did better than any reader would have. But not evidence either."
                  className="flex items-baseline gap-2"
                >
                  <span className="figure text-[1.125rem] font-bold text-dash-ink tabular-nums">
                    {formatNumber(withoutEvidence)}
                  </span>
                  <span className="text-[0.75rem] text-dash-muted">
                    verified with no sheet compared
                  </span>
                </span>
              )}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------ cuts */}
        <div className="flex flex-col gap-3">
          <section className="rounded-dash border border-dash-line bg-dash-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                Where the backlog is
              </h3>
              <span className="figure text-[0.8125rem] font-bold text-flag-700 tabular-nums">
                {formatNumber(stuck.length)}
              </span>
            </div>

            {/* Filters in one row above the marks they filter. */}
            <div className="mt-3 flex gap-1">
              {CUTS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCut(id)}
                  aria-pressed={cut === id}
                  className={cn(
                    "rounded-full px-2.5 py-1.5 text-[0.75rem] font-semibold transition-colors",
                    cut === id
                      ? "bg-dash-ink text-white"
                      : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {rows.length === 0 ? (
              <p className="mt-3 text-[0.875rem] text-dash-muted">Nothing has arrived yet.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {rows.slice(0, 10).map((row) => (
                  <li key={row.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[0.8125rem] font-semibold text-dash-ink">
                        {row.label}
                      </span>
                      <span className="figure shrink-0 text-[0.8125rem] tabular-nums">
                        <span
                          className={cn(
                            "font-bold",
                            row.stuck ? "text-flag-700" : "text-dash-ink"
                          )}
                        >
                          {formatNumber(row.stuck)}
                        </span>
                        <span className="text-dash-muted"> / {formatNumber(row.received)}</span>
                      </span>
                    </div>
                    {/* Two segments on one track with a 2px surface gap: the
                        row is about the split, never about the size. */}
                    <span
                      aria-hidden="true"
                      title={`${row.label}: ${row.verified} verified, ${row.stuck} not`}
                      className="mt-1 flex h-[6px] gap-0.5 overflow-hidden"
                    >
                      <span
                        className="rounded-l-full transition-[width] duration-500"
                        style={{
                          width: `${(row.verified / row.received) * 100}%`,
                          background: TONE.good,
                        }}
                      />
                      <span
                        className="flex-1 rounded-r-full"
                        style={{
                          background: row.stuck ? TONE.warn : "var(--color-dash-bg)",
                        }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── TIME THROUGH THE DESK, AS A SPAN AND NOT TWO NUMBERS ──────
              p50 and p90 printed as a pair of readouts are two facts to hold
              at once. Drawn as one bar with two markers on it they are a
              single shape: this is where most returns land, and this is the
              tail. */}
          <section className="rounded-dash border border-dash-line bg-dash-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                Time through the desk
              </h3>
              <span className="figure text-[0.8125rem] text-dash-muted tabular-nums">
                {formatNumber(kpis.wait.counted)} timed
              </span>
            </div>

            {kpis.wait.p50 == null ? (
              <p className="mt-3 text-[0.875rem] text-dash-muted">Nothing has been checked yet.</p>
            ) : (
              <>
                <p className="figure mt-2 text-[2rem] leading-none font-bold tracking-[-0.03em] text-dash-ink tabular-nums">
                  {clock(kpis.wait.p50)}
                  <span className="ml-2 text-[0.75rem] font-normal text-dash-muted">
                    for half of them
                  </span>
                </p>

                <span className="relative mt-4 mb-1 block h-[8px] rounded-full bg-dash-bg">
                  <span
                    aria-hidden="true"
                    className="block h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.min(100, (kpis.wait.p50 / Math.max(kpis.wait.p90, 1)) * 100)}%`,
                      background: TONE.ink,
                    }}
                  />
                  <span
                    aria-hidden="true"
                    title="Nine in ten"
                    className="absolute inset-y-[-3px] right-0 w-[2px] bg-dash-ink"
                  />
                </span>
                <div className="flex justify-between">
                  <span className="figure text-[0.6875rem] text-dash-muted tabular-nums">
                    half · {clock(kpis.wait.p50)}
                  </span>
                  <span
                    className={cn(
                      "figure text-[0.6875rem] font-semibold tabular-nums",
                      kpis.wait.p90 > 120 ? "text-flag-700" : "text-dash-muted"
                    )}
                  >
                    nine in ten · {clock(kpis.wait.p90)}
                  </span>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {/* ── THE WORK QUEUE ────────────────────────────────────────────────
          A table on purpose, and the one place on this screen that should be
          one: this is not a comparison, it is a list of jobs somebody works
          down. A figure on a chart cannot be worked on; a booth code can. */}
      <section className="rounded-dash border border-dash-line bg-dash-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Stuck, oldest first
          </h3>
          <span className="figure text-[0.8125rem] font-bold text-dash-ink tabular-nums">
            {formatNumber(stuck.length)}
          </span>
        </div>

        {stuck.length === 0 ? (
          <p className="mt-3 text-[0.875rem] text-dash-muted">
            Everything that has arrived has been all the way through.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left">
              <thead>
                <tr className="border-b border-dash-line">
                  {["Polling unit", "State", "Waiting on", "For", ""].map((head, index) => (
                    <th
                      key={head || index}
                      className="pb-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stuck.slice(0, 25).map((row) => (
                  <tr key={row.unitCode} className="border-b border-dash-line/60 last:border-0">
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => onUnit?.(row.unitCode)}
                        className="figure text-[0.8125rem] font-semibold text-dash-ink tabular-nums underline-offset-2 hover:underline"
                      >
                        {row.unitCode}
                      </button>
                    </td>
                    <td className="py-2 text-[0.8125rem] text-dash-muted">{row.state ?? "—"}</td>
                    <td className="py-2">
                      <span
                        title={row.because}
                        className="rounded-full bg-dash-bg px-2 py-1 text-[0.75rem] font-semibold text-dash-ink"
                      >
                        {LABEL[row.next] ?? row.next}
                      </span>
                    </td>
                    <td className="py-2">
                      <span
                        className={cn(
                          "figure text-[0.8125rem] font-bold tabular-nums",
                          row.minutes >= 90 ? "text-flag-700" : "text-dash-muted"
                        )}
                      >
                        {row.minutes != null ? clock(row.minutes) : "—"}
                      </span>
                    </td>
                    {/* How long it has been waiting, drawn against the worst
                        wait on the list, so the queue has a shape as well as
                        a set of figures. */}
                    <td className="w-24 py-2">
                      <span
                        aria-hidden="true"
                        className="block h-[5px] overflow-hidden rounded-full bg-dash-bg"
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${((row.minutes ?? 0) / Math.max(1, stuck[0].minutes ?? 1)) * 100}%`,
                            background: row.minutes >= 90 ? TONE.warn : TONE.ink,
                          }}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stuck.length > 25 && (
              <p className="mt-2 text-[0.75rem] text-dash-muted">
                {formatNumber(stuck.length - 25)} more.{" "}
                <button
                  type="button"
                  onClick={() => onGo?.("coverage")}
                  className="font-semibold text-dash-ink underline-offset-2 hover:underline"
                >
                  Open coverage
                </button>
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** Minutes, in the shortest form a room can read at three metres. */
function clock(minutes) {
  if (minutes == null) return "—";
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return hours < 24 ? `${hours.toFixed(1)} h` : `${Math.round(hours / 24)} d`;
}
