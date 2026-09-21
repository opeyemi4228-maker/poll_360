"use client";

import { MapPinned } from "lucide-react";

import RoomCoverage from "./RoomCoverage";
import { Funnel, Gauge, MiniMap, Panel } from "./Figures";
import { formatNumber, formatShare } from "@/lib/utils";

/**
 * How much of the ground has spoken, and everything known about one piece of it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY FINDING HERE ENDS IN A BOOTH CODE, AND EVERY CODE IS A DOOR
 *
 *  Coverage answers "how much of the ground is in", and each of its findings
 *  ends in a polling unit: fourteen have not reported, this ward has lost
 *  four between filing and verification, that state is at 40%.
 *
 *  This screen used to answer the follow-up itself, carrying its own copy of
 *  the polling-unit card behind a toggle. That was right about the workflow
 *  and wrong about the architecture: Polling Unit 360 is a dashboard people
 *  arrive at from outside with a code they were read over the telephone, and
 *  a second copy of it living inside this screen is a second thing to keep in
 *  step with the first.
 *
 *  So there is one card, it has a head of its own, and every code on this
 *  screen opens it in a single press. Nothing is re-typed, and nothing is
 *  drawn twice.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THE TOP IS A FUNNEL AND A MAP, NOT EIGHT TILES ─────────────────────
 * This screen's whole subject is loss — the drop between what was planned and
 * what is actually in hand — and loss was being presented as four separate
 * counts a reader had to subtract from each other. Nobody subtracts at two in
 * the morning. The funnel draws the drop as a shape, and the map draws where
 * the drop is, which is the only question that follows it.
 */

export default function RoomGround({
  pulse,
  /* Handed a booth code, which crosses to Polling Unit 360. */
  onUnit,
  /* The national outline, so "where is it thin" is a shape rather than a
     thirty-seven row table. */
  shapes = null,
  ground = null,
  onGo,
}) {
  const { funnel = [], states = [], silence = [] } = pulse ?? {};
  const roster = funnel[0]?.count ?? 0;
  const filed = pulse?.filed ?? 0;
  const assigned = pulse?.assigned ?? 0;

  /* ── WHERE IT IS THIN ─────────────────────────────────────────────────
     A state is coloured by how much of its roster has filed, on one hue
     getting darker — this is a quantity with an inherent order, so it gets a
     ramp and never a set of distinct colours. A state nobody was deployed to
     has no reporting rate at all and stays blank: not-yet and not-applicable
     are different facts and a map that draws them alike is wrong all night. */
  const fills = {};
  const notes = {};
  for (const row of states) {
    if (!row.assigned) continue;
    const rate = (row.filed / row.assigned) * 100;
    fills[row.code] =
      rate >= 80
        ? "var(--color-ink-900)"
        : rate >= 50
          ? "var(--color-ink-700)"
          : rate >= 20
            ? "var(--color-ink-500)"
            : "var(--color-flag-500)";
    notes[row.code] = `${formatShare(rate)} of ${formatNumber(row.assigned)} filed`;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ══════════════════════════════════════════════════════════ the band */}
      {/* ── THE MAP IS THE OBJECT; THE FIGURES DESCRIBE IT ─────────────────
          This was three equal panels side by side, which gave the country a
          third of a band at 190 pixels — the size at which Bayelsa is a smudge
          and nobody can tell a thin state from a blank one. The question this
          screen exists for is *where is it thin*, and that is a shape.

          So the map gets the width and the two figures that qualify it sit
          beside it: how much is in, and what fell out between the plan and a
          checked figure. Same three things, in the order they are asked. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dash-line px-5 py-3.5">
            <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
              Where it is thin
            </h2>
            <p className="text-[0.8125rem] text-dash-muted">
              {silence.length
                ? `${formatNumber(silence.length)} booths we have not heard from`
                : "Every booth we hold has filed"}
            </p>
          </header>

          <div className="px-4 py-3">
            {shapes ? (
              <MiniMap shapes={shapes} fills={fills} notes={notes} height={320} />
            ) : (
              <p className="px-4 py-12 text-center text-[0.875rem] text-dash-muted">
                No map for this contest.
              </p>
            )}
          </div>

          <footer className="border-t border-dash-line px-5 py-3 text-[0.8125rem] leading-relaxed text-dash-muted">
            Darker is more of that state&rsquo;s roster filed; amber is under a fifth. A blank
            state is one we deployed nobody to — not-yet and not-applicable are different facts,
            and a map that draws them alike is wrong all night.
          </footer>
        </section>

        <div className="flex flex-col gap-3">
          <Panel
            title="Booths reporting"
            figure={assigned ? formatShare((filed / assigned) * 100) : "—"}
            foot={
              assigned
                ? `${formatNumber(filed)} of ${formatNumber(assigned)} assigned a booth`
                : "Nobody has been assigned a booth yet"
            }
          >
            <Gauge
              share={assigned ? (filed / assigned) * 100 : 0}
              figure={formatNumber(filed)}
              sub={ground ? `filed in ${ground}` : "returns filed"}
              tone={assigned && filed / assigned >= 0.8 ? "good" : "ink"}
            />
          </Panel>

          <Panel
            title="From a plan to a checked figure"
            figure={`${formatNumber(roster)} on the roster`}
            foot="Every step is a subset of the one above it, so each drop is a real loss."
          >
            {funnel.length ? (
              <Funnel stages={funnel} />
            ) : (
              <p className="text-[0.875rem] text-dash-muted">Nobody is assigned yet.</p>
            )}
          </Panel>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────── the detail */}
      <RoomCoverage pulse={pulse} ground={ground} onGo={onGo} onUnit={onUnit} />

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[0.75rem] text-dash-muted">
        <span className="flex items-center gap-1.5">
          <MapPinned size={12} strokeWidth={2.5} />
          Every share here is against booths we have somebody at, never the whole registry
        </span>
      </p>
    </div>
  );
}
