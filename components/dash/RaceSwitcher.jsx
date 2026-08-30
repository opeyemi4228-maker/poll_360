"use client";

import { useRef, useState, useTransition } from "react";
import { ChevronDown, Check, Vote } from "lucide-react";

import { switchRace } from "@/app/actions/elections";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Which of the day's contests is on screen.
 *
 * ── WHY THIS IS NOT A FILTER ───────────────────────────────────────────────
 * A filter narrows one set of figures. This changes which count you are
 * reading: the presidential and the senate returns from the same booth are two
 * separate tallies that must never be added together, and there is no view in
 * which "all positions" is a meaningful thing to show. So it reads as a switch
 * between counts, it sits beside the project switcher because it is the same
 * kind of decision, and there is no "all" option.
 *
 * ── AND WHY IT SAYS HOW MUCH OF EACH HAS ARRIVED ───────────────────────────
 * The question somebody actually has at 10pm is "has the governorship started
 * coming in yet". A list of five identical labels cannot answer it; the count
 * beside each one can, and it costs a single grouped query on the server.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function RaceSwitcher({ race, races = [], filed = {}, pinned = false, ground = null }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef(null);

  const current = races.find((row) => row.id === race) ?? races[0];
  if (!current) return null;

  /* ── AN ACCOUNT ISSUED FOR ONE CONTEST DOES NOT SWITCH ──────────────────
     A newsroom given the Kaduna Central senate race holds a senatorial
     district, and a district is not an extent the presidential count is read
     over: switching would show them a seventh of a national board and let
     them read it as their coverage.

     So it becomes a label rather than a control. Not a disabled button, which
     invites a click and answers with nothing, and not a hidden one, which
     would leave a desk unable to see which of the day's counts they are
     looking at — the one thing this control exists to say. */
  if (pinned) {
    return (
      <span
        className="flex items-center gap-2 rounded-full border border-dash-line bg-dash-bg px-4 py-2.5 text-[0.8125rem] font-semibold text-dash-muted"
        title={ground ? `This account covers ${ground}.` : undefined}
      >
        <Vote size={14} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap text-dash-ink">{current.label}</span>
        {ground && <span className="whitespace-nowrap">· {ground}</span>}
      </span>
    );
  }

  const pick = (id) => {
    setOpen(false);
    if (id === race) return;
    startTransition(() => {
      const data = new FormData();
      data.set("race", id);
      switchRace(data);
    });
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`Position: ${current.label}. Change which contest is shown.`}
        className={cn(
          "flex items-center gap-2 rounded-full border border-dash-line bg-dash-card px-4 py-2.5",
          "text-[0.8125rem] font-semibold text-dash-ink transition-colors hover:border-dash-ink",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
          pending && "opacity-60"
        )}
      >
        <Vote size={14} strokeWidth={2.5} className="shrink-0 text-dash-muted" aria-hidden="true" />
        <span className="whitespace-nowrap">{current.label}</span>
        <ChevronDown size={13} strokeWidth={2.5} className="shrink-0 text-dash-muted" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 z-20 mt-2 w-72 rounded-dash border border-dash-line bg-dash-card p-2 shadow-lg">
            <p className="px-3 pt-1 pb-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
              Position on the ballot
            </p>

            {races.map((row) => {
              const count = filed[row.id] ?? 0;
              const active = row.id === race;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => pick(row.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-dash-sm px-3 py-2.5 text-left transition-colors",
                    active ? "bg-dash-bg" : "hover:bg-dash-bg"
                  )}
                >
                  <span className="w-4 shrink-0">
                    {active && <Check size={14} strokeWidth={3} className="text-dash-ink" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.875rem] font-semibold text-dash-ink">
                      {row.label}
                    </span>
                    <span className="figure block text-[0.75rem] text-dash-muted">
                      {count
                        ? `${formatNumber(count)} ${count === 1 ? "return" : "returns"} in`
                        : "Nothing filed yet"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
