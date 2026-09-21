"use client";

import { useMemo, useState } from "react";
import { Camera, PhoneCall, ShieldCheck, ShieldX } from "lucide-react";

import RoomIntegrity from "./RoomIntegrity";
import DataQuality from "./DataQuality";
import { MiniMap } from "./Figures";
import { ACTIONS, ACTION_ORDER, SEVERITY } from "@/lib/anomalies";
import { parseUnitCode } from "@/lib/units";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Verification: which returns may go into a bulletin, and what to do about the
 * ones that may not.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT WAS WRONG WITH THIS SCREEN
 *
 *  It showed a reader everything it knew and never once told them what the
 *  screen was for. A stacked bar of clean/flagged/impossible, a ladder of
 *  what arrived with the figures, a map, a switch, and then a whole second
 *  dashboard underneath. Every figure on it was true. Nothing on it said
 *  "this is the desk where you decide whether a number can be published",
 *  and nothing on it said what to actually do next.
 *
 *  A verification desk does not want a summary of findings. A list of
 *  findings is not a job. It wants a queue, in the order it has to be worked,
 *  where every row says which of four things to do.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── SO THE SCREEN IS THE QUEUE ─────────────────────────────────────────────
 * Four boxes, in the order a desk works them, and the arithmetic behind them
 * is `integrityOf` in lib/anomalies.js rather than anything computed here:
 *
 *   HOLD BACK      the arithmetic cannot be true. It stays out of a bulletin
 *                  whether or not its sheet arrived.
 *   CHECK THE SHEET questioned, and the result sheet is here. Somebody at a
 *                  desk settles it in five minutes.
 *   CHASE THE SHEET questioned, and nothing arrived to check it against. That
 *                  is a telephone call, not a desk job.
 *   PASSED         screened against every rule and questioned by none.
 *
 * The middle two are the point. They are the *same finding* with opposite
 * instructions, and until the triage existed they looked identical on every
 * screen in this product — so a desk worked them in whatever order they
 * happened to be listed and rang nobody.
 *
 * ── AND WHAT IT NEVER DOES ─────────────────────────────────────────────────
 * Nothing here changes a result. A finding is a result being questioned. That
 * sentence is on the screen, in the reader's own language, because the
 * distinction is the product's whole credibility and a person using this at
 * two in the morning should not have to have been told it in training.
 */

/** The icon each action wears. Different shapes, not just different colours. */
const ICON = {
  HOLD: ShieldX,
  CHECK: Camera,
  CHASE: PhoneCall,
  CLEAR: ShieldCheck,
};

const SKIN = {
  HOLD: {
    on: "border-red-500 bg-red-500 text-white",
    off: "border-red-200 bg-red-50 text-red-900 hover:border-red-400",
    dot: "bg-red-500",
  },
  CHECK: {
    on: "border-flag-500 bg-flag-500 text-white",
    off: "border-flag-200 bg-flag-50 text-flag-900 hover:border-flag-400",
    dot: "bg-flag-500",
  },
  CHASE: {
    on: "border-dash-ink bg-dash-ink text-white",
    off: "border-dash-line bg-dash-bg text-dash-ink hover:border-dash-ink",
    dot: "bg-dash-ink",
  },
  CLEAR: {
    on: "border-ok-600 bg-ok-600 text-white",
    off: "border-ok-200 bg-ok-50 text-ok-900 hover:border-ok-400",
    dot: "bg-ok-600",
  },
};

export default function RoomEvidence({
  integrity = { flags: [], impossible: 0, flagged: 0, screened: 0, clean: 0, work: [], counts: {} },
  sheetFindings = [],
  sheetReads = null,
  pulse,
  divergence = null,
  shapes = null,
  ground = null,
  onGo,
  onUnit,
}) {
  /* Which of the four is being worked. Null is the whole queue, which is what
     somebody arriving cold should see: the shape of the job before any of it. */
  const [only, setOnly] = useState(null);
  /* The reference material, open only when somebody asks for it. It is not
     what this screen is for and it should not be the first thing on it. */
  const [reference, setReference] = useState(null);

  const screened = integrity.screened ?? 0;
  const counts = integrity.counts ?? {};
  /* Memoised at its source: `integrity.work ?? []` is a fresh array whenever
     the screening produced none, so every memo reading it would re-run on
     every render of the room — which is every fifteen seconds, all night. */
  const work = useMemo(() => integrity.work ?? [], [integrity.work]);

  const queue = useMemo(
    () => (only ? work.filter((unit) => unit.action === only) : work),
    [work, only]
  );

  /* Where the questioned returns are. The worst finding in a state decides its
     colour, never how many: one return that cannot be true outranks nine worth
     a second look, and a ramp would bury it. */
  const byState = useMemo(() => {
    const out = {};
    for (const unit of work) {
      const code = parseUnitCode(unit.unitCode)?.stateCode;
      if (!code) continue;
      const held = out[code];
      out[code] = {
        held: (held?.held ?? false) || unit.action === "HOLD",
        count: (held?.count ?? 0) + 1,
      };
    }
    return out;
  }, [work]);

  const located = Object.keys(byState).length;
  const blocking = counts.HOLD ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {/* ══════════════════════════════════════════════ what this screen is for */}
      {/* ── STATED, NOT IMPLIED ────────────────────────────────────────────
          Every other screen in this room can be worked out from its contents.
          This one cannot: a table of flagged booths looks the same whether it
          is a monitoring feed, an audit log or a decision queue, and the three
          want completely different behaviour from the person reading them. So
          the screen says which it is, in one sentence, in the reader's own
          language, above everything else. */}
      <section
        className={cn(
          "rounded-dash border-l-4 bg-dash-card px-5 py-4",
          blocking ? "border-l-red-500" : "border-l-dash-ink"
        )}
      >
        <h1 className="font-display text-[1.125rem] leading-tight font-extrabold tracking-[-0.02em] text-dash-ink">
          Deciding what may be published
        </h1>
        <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-relaxed text-dash-muted">
          Every return is screened against the arithmetic as it lands. The ones that fail come here
          with what to do about each of them.{" "}
          <strong className="font-semibold text-dash-ink">
            Nothing on this screen changes a result
          </strong>{" "}
          — a finding is a result being questioned, and a person decides.
        </p>

        {screened > 0 && (
          <p className="mt-2.5 text-[0.8125rem] text-dash-muted">
            {formatNumber(screened)} return{screened === 1 ? "" : "s"} screened ·{" "}
            {blocking > 0 ? (
              <strong className="font-semibold text-red-600">
                {formatNumber(blocking)} cannot go in a bulletin
              </strong>
            ) : (
              <span className="font-semibold text-ok-700">
                nothing is blocking a bulletin
              </span>
            )}
          </p>
        )}
      </section>

      {screened === 0 ? (
        <p className="rounded-dash border border-dash-line bg-dash-card px-5 py-10 text-center text-[0.9375rem] text-dash-muted">
          Nothing has been filed yet. Screening runs on every return as it arrives, and this queue
          fills itself — there is nothing to press.
        </p>
      ) : (
        <>
          {/* ═══════════════════════════════════════════════════ the four boxes */}
          {/* Each one says what it is, how many, and what a person does about
              it. The instruction is the third line of every box on purpose:
              the count is what a reader looks for and the instruction is what
              they need, so they are next to each other. */}
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {ACTION_ORDER.map((id) => {
              const action = ACTIONS[id];
              const Icon = ICON[id];
              const count = counts[id] ?? 0;
              const active = only === id;
              const skin = SKIN[id];

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setOnly(active ? null : id)}
                  aria-pressed={active}
                  disabled={count === 0 && id !== "CLEAR"}
                  className={cn(
                    "rounded-dash border-2 px-4 py-3.5 text-left transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                    active ? skin.on : skin.off,
                    count === 0 && id !== "CLEAR" && "cursor-default opacity-45"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon size={15} strokeWidth={2.5} />
                    <span className="text-[0.75rem] font-bold tracking-[0.08em] uppercase">
                      {action.label}
                    </span>
                  </span>
                  <span className="figure mt-1.5 block text-[2rem] leading-none font-bold tracking-[-0.04em] tabular-nums">
                    {formatNumber(count)}
                  </span>
                  <span
                    className={cn(
                      "mt-1.5 block text-[0.75rem] leading-snug",
                      active ? "opacity-90" : "opacity-75"
                    )}
                  >
                    {action.verb}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ══════════════════════════════════════════════════════ the queue */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
            <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
              <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dash-line px-5 py-3.5">
                <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
                  {only ? ACTIONS[only].label : "Everything questioned"}
                </h2>
                <p className="text-[0.8125rem] text-dash-muted">
                  {only ? ACTIONS[only].why : "In the order a desk has to work them."}
                </p>
              </header>

              {queue.length === 0 ? (
                <p className="px-5 py-10 text-center text-[0.9375rem] text-dash-muted">
                  {only
                    ? `Nothing to ${ACTIONS[only].label.toLowerCase()}.`
                    : "Every screened return passed. Nothing is questioned."}
                </p>
              ) : (
                <ul className="divide-y divide-dash-line">
                  {queue.slice(0, 40).map((unit) => {
                    const action = ACTIONS[unit.action];
                    const Icon = ICON[unit.action];
                    const opens = onUnit && unit.unitCode?.includes("/");
                    const Tag = opens ? "button" : "div";

                    return (
                      <li key={unit.unitCode}>
                        <Tag
                          {...(opens ? { type: "button", onClick: () => onUnit(unit.unitCode) } : {})}
                          className={cn(
                            "flex w-full items-start gap-3.5 px-5 py-3.5 text-left",
                            opens && "transition-colors hover:bg-dash-bg"
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-white",
                              SKIN[unit.action].dot
                            )}
                          >
                            <Icon size={13} strokeWidth={2.75} />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                              <span className="figure text-[0.875rem] font-bold text-dash-ink">
                                {unit.unitCode}
                              </span>
                              <span className="text-[0.75rem] font-semibold text-dash-muted">
                                {action.verb}
                              </span>
                            </span>

                            {/* Every finding against this booth, in its own
                                words. A code with no reason beside it is a code
                                nobody acts on. */}
                            <ul className="mt-1 space-y-0.5">
                              {unit.findings.slice(0, 3).map((flag) => (
                                <li
                                  key={flag.id}
                                  className="flex items-baseline gap-2 text-[0.8125rem] leading-snug"
                                >
                                  <span
                                    className={cn(
                                      "shrink-0 text-[0.625rem] font-bold tracking-[0.06em] uppercase",
                                      flag.severity === "IMPOSSIBLE" ? "text-red-600" : "text-flag-700"
                                    )}
                                  >
                                    {SEVERITY[flag.severity]?.label ?? flag.severity}
                                  </span>
                                  <span className="text-dash-ink">{flag.says}</span>
                                </li>
                              ))}
                              {unit.findings.length > 3 && (
                                <li className="text-[0.75rem] text-dash-muted">
                                  and {unit.findings.length - 3} more against this booth
                                </li>
                              )}
                            </ul>
                          </span>
                        </Tag>
                      </li>
                    );
                  })}
                </ul>
              )}

              {queue.length > 40 && (
                <p className="border-t border-dash-line px-5 py-3 text-[0.8125rem] text-dash-muted">
                  Showing the first 40 of {formatNumber(queue.length)}.
                </p>
              )}
            </section>

            {/* ── WHERE ────────────────────────────────────────────────────
                Kept, because it is the one question the queue cannot answer:
                a list of forty booth codes does not show that thirty of them
                are in one state, and that is the finding. */}
            <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
              <header className="flex items-baseline justify-between gap-3 border-b border-dash-line px-4 py-3">
                <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">Where</h3>
                <span className="text-[0.75rem] text-dash-muted">
                  {located ? `${formatNumber(located)} state${located === 1 ? "" : "s"}` : "nowhere yet"}
                </span>
              </header>

              <div className="px-3 py-3">
                {shapes ? (
                  <MiniMap
                    shapes={shapes}
                    fills={Object.fromEntries(
                      Object.entries(byState).map(([code, item]) => [
                        code,
                        item.held ? "var(--color-red-500)" : "var(--color-flag-500)",
                      ])
                    )}
                    notes={Object.fromEntries(
                      Object.entries(byState).map(([code, item]) => [
                        code,
                        `${item.count} questioned${item.held ? ", one held back" : ""}`,
                      ])
                    )}
                    height={240}
                  />
                ) : (
                  <p className="px-4 py-8 text-center text-[0.875rem] text-dash-muted">
                    No map for this contest.
                  </p>
                )}
              </div>

              <footer className="border-t border-dash-line px-4 py-2.5 text-[0.75rem] leading-relaxed text-dash-muted">
                Red is a state holding a return that cannot go in a bulletin; amber is one with
                questions on it. Colour is the worst finding, never how many.
              </footer>
            </section>
          </div>

          {/* ══════════════════════════════════════════════════ the reference */}
          {/* ── SHUT BY DEFAULT, ON PURPOSE ──────────────────────────────
              Both of these are real and useful and neither is what this screen
              is for. Open on arrival they doubled the length of the page and
              buried the queue, which is how a decision screen turns back into
              a report. They are one press away and named for what they hold. */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: "findings", label: "Every finding in full", count: integrity.flags?.length ?? 0 },
              { id: "sheets", label: "What arrived with each return", count: sheetFindings.length },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setReference(reference === item.id ? null : item.id)}
                aria-expanded={reference === item.id}
                className={cn(
                  "inline-flex items-center gap-2 rounded-dash-sm border px-3 py-2 text-[0.8125rem] font-semibold transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                  reference === item.id
                    ? "border-dash-ink bg-dash-ink text-white"
                    : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                )}
              >
                {item.label}
                {item.count > 0 && (
                  <span className="figure tabular-nums opacity-70">{formatNumber(item.count)}</span>
                )}
              </button>
            ))}
          </div>

          {reference === "findings" && (
            <RoomIntegrity
              integrity={integrity}
              sheets={sheetFindings}
              pulse={pulse}
              divergence={divergence}
              onGo={onGo}
            />
          )}
          {reference === "sheets" && (
            <DataQuality pulse={pulse} sheets={sheetReads} ground={ground} />
          )}
        </>
      )}
    </div>
  );
}
