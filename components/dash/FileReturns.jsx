"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, CircleDashed, MapPin } from "lucide-react";

import FileResultForm from "./FileResultForm";
import { RACES } from "@/lib/races";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The five ballot papers, and which of them this booth has sent.
 *
 * ── WHY ONE SCREEN AND NOT FIVE ────────────────────────────────────────────
 * A voter at a polling unit is handed several ballot papers. The agent
 * standing at that unit counts several piles, on the same table, in the same
 * hour, off sheets that look almost identical — and the single likeliest
 * mistake of the whole evening is typing the senate figures into the
 * presidential form. So the position is the first thing on the screen, it is
 * enormous, it is stated again above the vote boxes, and what has already been
 * sent is ticked so nobody files the same pile twice or goes home with one
 * still in their pocket.
 *
 * ── WHY THE POSITIONS ARE NOT A DROPDOWN ───────────────────────────────────
 * A dropdown shows one option and hides four. The question this screen has to
 * answer at a glance, at night, with a queue outside, is not "which position
 * am I filing" but "which have I not filed yet", and only a list answers that.
 *
 * ── AND WHY EACH ONE KEEPS ITS OWN DRAFT ───────────────────────────────────
 * Switching position remounts the form — `key` below — so nothing from one
 * contest can be left sitting in the boxes of another. What survives is the
 * draft in local storage, which is keyed by booth *and* position, so an agent
 * who is half way through the senate figures when the governorship sheet
 * arrives can switch, file it, and come back to their half-typed count.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function FileReturns({ unitCode, filed = {}, canNameUnit = false, action, readAction }) {
  /* Opens on the first position with nothing against it, which on a fresh
     evening is the presidential and after three filings is the next one to do.
     A screen that always opened on the first tab would make an agent who has
     filed four click past all four to reach the fifth. */
  const [race, setRace] = useState(
    () => RACES.find((row) => !filed[row.id])?.id ?? RACES[0].id
  );

  /* What has been filed, as the screen knows it. Seeded from the server and
     updated in place when a return lands, so the tick appears the moment the
     form succeeds rather than after a reload nobody performs. */
  const [sent, setSent] = useState(filed);

  const onFiled = useCallback((result) => {
    if (!result?.race) return;
    setSent((current) => ({
      ...current,
      [result.race]: { total: result.cast, status: "SUBMITTED", amended: result.amended },
    }));
  }, []);

  const done = useMemo(() => RACES.filter((row) => sent[row.id]).length, [sent]);
  const current = RACES.find((row) => row.id === race) ?? RACES[0];

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------- the booth */}
      {unitCode ? (
        <div className="rounded-dash border-2 border-dash-ink bg-dash-card px-5 py-5">
          <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            <MapPin size={13} strokeWidth={2.5} />
            Your polling unit
          </p>
          <p className="figure mt-2.5 text-[2rem] leading-none font-bold tracking-[-0.02em] text-dash-ink">
            {unitCode}
          </p>
          <p className="mt-2.5 text-[0.8125rem] text-dash-muted">
            State {unitCode.slice(0, 2)} · LGA {unitCode.slice(3, 5)} · Ward {unitCode.slice(6, 8)} ·
            Unit {unitCode.slice(9)} · {done} of {RACES.length} sent
          </p>
        </div>
      ) : (
        <div className="rounded-dash border border-dash-line bg-dash-card px-5 py-4">
          <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Filing for another booth
          </p>
          <p className="mt-2 text-[0.875rem] leading-relaxed text-dash-muted">
            This account has no polling unit of its own, so the unit code is typed below and stored
            with the return. Every row records that it was uploaded rather than filed from the
            booth.
          </p>
        </div>
      )}

      {/* --------------------------------------------------- the positions */}
      <div>
        <p className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase text-dash-muted">
          Which result is this?
        </p>

        <div
          role="tablist"
          aria-label="Position on the ballot"
          className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {RACES.map((row) => {
            const has = sent[row.id];
            const active = row.id === race;
            return (
              <button
                key={row.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setRace(row.id)}
                className={cn(
                  "flex items-start gap-3 rounded-dash border-2 px-4 py-3.5 text-left transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                  active
                    ? "border-dash-ink bg-dash-card"
                    : "border-dash-line bg-dash-bg hover:border-dash-ink"
                )}
              >
                <span className="mt-0.5 shrink-0">
                  {has ? (
                    <Check size={17} strokeWidth={3} className="text-emerald-600" />
                  ) : (
                    <CircleDashed size={17} strokeWidth={2.5} className="text-dash-muted" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.9375rem] font-bold text-dash-ink">{row.label}</span>
                  <span className="mt-0.5 block text-[0.8125rem] text-dash-muted">
                    {has
                      ? `${formatNumber(has.total ?? 0)} votes sent`
                      : `Not sent · ${row.elects}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* -------------------------------------------------------- the form */}
      <div className="rounded-dash border border-dash-line bg-dash-card p-5">
        <div className="mb-5 border-b border-dash-line pb-4">
          <h3 className="font-display text-[1.125rem] leading-none font-extrabold tracking-[-0.02em] text-dash-ink">
            {current.label}
          </h3>
          <p className="mt-2 text-[0.875rem] leading-relaxed text-dash-muted">
            {sent[current.id]
              ? `Already sent from this booth. Filing again replaces that return and sends it back to be checked.`
              : `${current.elects}. Counted at this booth, collated into ${current.collatedInto}.`}
          </p>
        </div>

        {/* Remounted per position, so no figure can survive a switch. */}
        <FileResultForm
          key={`${unitCode ?? "unassigned"}:${current.id}`}
          race={current.id}
          /* Undefined here means "use the staff action", which is what every
             caller but the coordinator dashboard wants. Passing it explicitly
             as undefined rather than omitting it would defeat the default.

             The same is true of `readAction` below: the coordinator dashboard
             passes its own, because the staff one authenticates against a
             table a coordinator is not in. */
          {...(action ? { action } : {})}
          {...(readAction ? { readAction } : {})}
          unitCode={unitCode}
          canNameUnit={canNameUnit}
          existing={filed[current.id]?.row ?? null}
          onFiled={onFiled}
        />
      </div>
    </div>
  );
}
