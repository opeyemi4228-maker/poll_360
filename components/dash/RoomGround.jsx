"use client";

import { useState } from "react";
import { MapPin, MapPinned, Users } from "lucide-react";

import RoomCoverage from "./RoomCoverage";
import UnitIntel from "./UnitIntel";
import { Funnel, Gauge, MiniMap, Panel } from "./Figures";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * How much of the ground has spoken, and everything known about one piece of it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY COVERAGE AND ONE BOOTH BELONG ON THE SAME SCREEN
 *
 *  Coverage answers "how much of the ground is in" and every one of its
 *  findings ends in a booth code: fourteen have not reported, this ward has
 *  lost four between filing and verification, that state is at 40%. The
 *  polling-unit card answers "everything we know about this booth".
 *
 *  They were two tabs, which meant every single finding on the first screen
 *  ended in a code the reader had to carry, by hand or by memory, to the
 *  second one. That is the exact shape of a workflow people abandon: the tool
 *  finds the problem and then asks you to re-type it somewhere else.
 *
 *  One screen. The coverage list is the way in and the card is what opens.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THE TOP IS A FUNNEL AND A MAP, NOT EIGHT TILES ─────────────────────
 * This screen's whole subject is loss — the drop between what was planned and
 * what is actually in hand — and loss was being presented as four separate
 * counts a reader had to subtract from each other. Nobody subtracts at two in
 * the morning. The funnel draws the drop as a shape, and the map draws where
 * the drop is, which is the only question that follows it.
 */

const HALVES = [
  { id: "coverage", label: "How much is in", icon: Users },
  { id: "unit", label: "One polling unit", icon: MapPin },
];

export default function RoomGround({
  pulse,
  /* Everything held about each booth, keyed by code — see lib/unit-card.js. */
  unitCards = {},
  unitCode = null,
  onUnit,
  /* The national outline, so "where is it thin" is a shape rather than a
     thirty-seven row table. */
  shapes = null,
  ground = null,
  onGo,
}) {
  /* Opening a booth is what the coverage half is for, so choosing one crosses
     to the card rather than leaving the reader to press the switch as well. */
  const [half, setHalf] = useState(unitCode ? "unit" : "coverage");

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
            : "var(--color-amber-500)";
    notes[row.code] = `${formatShare(rate)} of ${formatNumber(row.assigned)} filed`;
  }

  const openUnit = (code) => {
    onUnit?.(code);
    setHalf("unit");
  };

  return (
    <div className="flex flex-col gap-3">
      {/* ─────────────────────────────────────────────────── the picture band */}
      <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_minmax(0,1fr)]">
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

        <Panel
          title="Where it is thin"
          figure={`${formatNumber(silence.length)} silent`}
          foot="Darker is more of the roster filed. Amber is under a fifth. Blank means nobody was deployed there."
        >
          {shapes ? (
            <MiniMap shapes={shapes} fills={fills} notes={notes} height={190} />
          ) : (
            <p className="text-[0.875rem] text-dash-muted">No map for this contest.</p>
          )}
        </Panel>
      </div>

      {/* ───────────────────────────────────────────────────────── the detail */}
      <div className="flex gap-1 rounded-dash border border-dash-line bg-dash-card p-1">
        {HALVES.map((item) => {
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
              {item.id === "unit" && unitCode && (
                <span
                  className={cn(
                    "figure rounded-full px-1.5 py-0.5 text-[0.6875rem] tabular-nums",
                    active ? "bg-white/20" : "bg-dash-bg"
                  )}
                >
                  {unitCode}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {half === "coverage" ? (
        /* The silence list on the coverage half is a call list of booth codes,
           and every one of them now opens the card beside it rather than
           being a string somebody has to carry to another tab. */
        <RoomCoverage pulse={pulse} ground={ground} onGo={onGo} onUnit={openUnit} />
      ) : (
        <UnitIntel cards={unitCards} unitCode={unitCode} onPick={onUnit} onGo={onGo} />
      )}

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[0.75rem] text-dash-muted">
        <span className="flex items-center gap-1.5">
          <MapPinned size={12} strokeWidth={2.5} />
          Every share here is against booths we have somebody at, never the whole registry
        </span>
      </p>
    </div>
  );
}
