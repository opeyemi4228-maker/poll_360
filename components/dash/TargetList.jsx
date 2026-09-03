"use client";

import AddToPlan from "./AddToPlan";
import { cn } from "@/lib/utils";

/**
 * One target list: the claim, the arithmetic behind it, and the press that
 * turns it into work.
 *
 * ── WHY THE SAME CARD ON EVERY SCREEN ──────────────────────────────────────
 * Each dashboard produces different lists from different data, and every one
 * of them is the same shape of thing: here is a set of places, here is the
 * figure that makes them worth going to, here is the sentence that will be in
 * the plan beside them. Making that one card means a reader learns it once,
 * and means no screen can quietly offer a list without saying what is in it.
 *
 * `quiet` is for a list that argues *against* spending — the states that never
 * move, the places already covered. Those go in the plan just as readily,
 * because "we are defending these" is a decision somebody has to cost too,
 * but they do not get the colour that says opportunity.
 */
export default function TargetList({
  title,
  figure,
  unit,
  note,
  paths = [],
  reason,
  from,
  quiet = false,
  label,
  children,
}) {
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
        {title}
      </p>
      <p
        className={cn(
          "figure text-[1.5rem] leading-none font-bold tracking-[-0.02em]",
          quiet ? "text-dash-muted" : "text-dash-ink"
        )}
      >
        {figure}
      </p>
      {unit && <p className="text-[0.6875rem] text-dash-muted">{unit}</p>}
      {note && <p className="flex-1 text-[0.75rem] leading-relaxed text-dash-muted">{note}</p>}
      {children}
      <AddToPlan
        paths={paths}
        reason={reason}
        from={from}
        label={label ?? `Add ${paths.length} to plan`}
        className="self-start"
      />
    </div>
  );
}
