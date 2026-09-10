"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { Card, Empty, Badge } from "@/components/dash/DashCard";
import { Queue, Said, useAction, useDesk } from "./Queue";
import { draftItem } from "@/app/broadcast/actions";
import { cn } from "@/lib/utils";

/**
 * The ticker and lower-third desk.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE LINES ARE WRITTEN FROM THE FIGURES, NOT TYPED FROM MEMORY
 *
 *  What goes along the bottom of the picture is the most-read text a news
 *  channel produces and the least-checked: it is written in a hurry, by
 *  somebody looking at a different screen, and it stays up for twenty minutes.
 *  The characteristic failure is not a typo. It is a share with no coverage
 *  beside it — "PLATEAU — PARTY A 42%" — which is a claim about a whole state
 *  made off a third of its booths.
 *
 *  So the generator will not produce one. Every line it offers carries the
 *  coverage that qualifies it, computed from the same rows the map is drawn
 *  from, and a desk that wants to say something else types it into the box at
 *  the bottom, where it goes through the same clearance as everything else.
 *
 *  ── FOUR BANDS, BECAUSE THEY ARE NOT THE SAME SENTENCE ──────────────────
 *  A result, a location, a verification figure and an incident look identical
 *  in a list and behave completely differently on air: one of them is a claim
 *  about who is winning and one of them is a report that something has been
 *  alleged. They are kept apart here so nobody reaches for the wrong one.
 * ══════════════════════════════════════════════════════════════════════════
 */

const BANDS = [
  { id: "BREAKING", label: "Breaking", tone: "alert", strap: "BREAKING NEWS" },
  { id: "RESULT", label: "Result", tone: "ink", strap: "RESULT" },
  { id: "LOCATION", label: "Location", tone: "neutral", strap: "REPORTING" },
  { id: "INCIDENT", label: "Incident", tone: "warn", strap: "INCIDENT" },
];

export default function TickerDesk({ suggestions, items, race }) {
  const { may } = useDesk();
  const { pending, said, run, setSaid } = useAction();

  const [band, setBand] = useState("RESULT");
  const [own, setOwn] = useState("");
  const [made, setMade] = useState(null);

  const tickers = items.filter((item) => item.kind === "TICKER" || item.kind === "LOWER_THIRD");
  const live = tickers.filter((item) => item.state === "ON_AIR");

  const byBand = useMemo(() => {
    const groups = BANDS.map((row) => ({
      ...row,
      lines: suggestions.filter((line) => line.band === row.id),
    }));
    return groups.filter((group) => group.lines.length > 0);
  }, [suggestions]);

  const take = (line) => {
    setMade(line.id);
    run(
      () =>
        draftItem({
          kind: line.kind,
          title: line.text,
          body: line.why,
          race,
          scope: line.scope ?? null,
          payload: { band: line.band, generated: true },
        }),
      {
        onDone: () => {
          setMade(null);
          setSaid({ tone: "good", text: "Drafted. It goes out when an editor who did not write it clears it." });
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      {/* ── WHAT IS CRAWLING RIGHT NOW ─────────────────────────────────── */}
      <Card title="On air" subtitle="Drawn at the weight it goes out at" padded={false}>
        {live.length === 0 ? (
          <p className="px-5 py-6 text-center text-[0.875rem] text-dash-muted">
            No ticker or lower third is on air.
          </p>
        ) : (
          <div className="space-y-px">
            {live.map((item) => {
              const strap =
                BANDS.find((row) => row.id === item.payload?.band)?.strap ??
                (item.kind === "LOWER_THIRD" ? "POLL360" : "REPORTING");
              return (
                <div key={item.id} className="flex items-stretch bg-black">
                  <span
                    className={cn(
                      "flex shrink-0 items-center px-3 py-2.5 font-display text-[0.6875rem] font-extrabold tracking-[0.16em] text-white uppercase",
                      item.payload?.band === "BREAKING" || item.payload?.band === "INCIDENT"
                        ? "bg-red-600"
                        : "bg-white/15"
                    )}
                  >
                    {strap}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center overflow-hidden px-4 py-2.5 font-display text-[0.9375rem] leading-none font-extrabold tracking-[-0.005em] whitespace-nowrap text-white uppercase">
                    {item.title}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
        {/* ── THE GENERATOR ───────────────────────────────────────────── */}
        <Card
          title="Lines from the count"
          subtitle="Written from the returns in. Every share carries the coverage behind it."
        >
          {byBand.length === 0 ? (
            <Empty>
              No returns have arrived, so there is nothing true to say yet. Lines appear here as
              booths file.
            </Empty>
          ) : (
            <div className="space-y-6">
              {byBand.map((group) => (
                <section key={group.id}>
                  <h3 className="mb-2.5 flex items-center gap-2">
                    <Badge tone={group.tone}>{group.label}</Badge>
                    <span className="text-[0.75rem] text-dash-muted">
                      {group.lines.length} line{group.lines.length === 1 ? "" : "s"}
                    </span>
                  </h3>
                  <ul className="space-y-2">
                    {group.lines.map((line) => (
                      <li
                        key={line.id}
                        className="flex flex-wrap items-center gap-3 rounded-dash-sm border border-dash-line px-3.5 py-3"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-display text-[0.875rem] leading-snug font-extrabold tracking-[-0.005em] text-dash-ink">
                            {line.text}
                          </span>
                          <span className="mt-0.5 block text-[0.75rem] leading-snug text-dash-muted">
                            {line.why}
                          </span>
                        </span>
                        {may.draft && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => take(line)}
                            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-dash-sm border border-dash-line px-2.5 text-[0.6875rem] font-bold tracking-[0.06em] text-dash-ink uppercase transition-colors hover:border-dash-ink disabled:opacity-40"
                          >
                            {pending && made === line.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Plus size={13} strokeWidth={2.5} />
                            )}
                            Draft
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          <Said said={said} />
        </Card>

        {/* ── AND THE BOX FOR EVERYTHING THE GENERATOR CANNOT KNOW ─────── */}
        <Card title="Write your own" subtitle="Same queue, same clearance">
          {!may.draft ? (
            <Empty>This account can read the ticker desk and not write to it.</Empty>
          ) : (
            <>
              <fieldset>
                <legend className="text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
                  Which band
                </legend>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {BANDS.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setBand(row.id)}
                      aria-pressed={band === row.id}
                      className={cn(
                        "h-8 rounded-dash-sm border px-3 text-[0.75rem] font-semibold transition-colors",
                        band === row.id
                          ? "border-dash-ink bg-dash-ink text-white"
                          : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                      )}
                    >
                      {row.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="mt-3 block">
                <span className="block text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
                  The line
                </span>
                <textarea
                  value={own}
                  onChange={(event) => setOwn(event.target.value)}
                  rows={3}
                  placeholder="ABUJA — 64% OF POLLING UNITS REPORTING"
                  className="mt-1.5 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 py-2 font-display text-[0.875rem] font-bold tracking-[-0.005em] text-dash-ink uppercase focus:border-dash-ink focus:outline-none"
                />
              </label>

              <div className="mt-3 flex items-stretch overflow-hidden rounded-dash-sm bg-black">
                <span
                  className={cn(
                    "flex shrink-0 items-center px-2.5 py-2 font-display text-[0.625rem] font-extrabold tracking-[0.14em] text-white uppercase",
                    band === "BREAKING" || band === "INCIDENT" ? "bg-red-600" : "bg-white/15"
                  )}
                >
                  {BANDS.find((row) => row.id === band)?.strap}
                </span>
                <span className="min-w-0 flex-1 truncate px-3 py-2 font-display text-[0.8125rem] font-extrabold text-white uppercase">
                  {own.trim() ? own.toUpperCase() : "AS IT WILL LOOK"}
                </span>
              </div>

              <button
                type="button"
                disabled={pending || !own.trim()}
                onClick={() =>
                  run(
                    () =>
                      draftItem({
                        kind: band === "BREAKING" ? "LOWER_THIRD" : "TICKER",
                        title: own.trim().toUpperCase(),
                        race,
                        payload: { band, generated: false },
                      }),
                    { onDone: () => setOwn("") }
                  )
                }
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-dash-sm border-2 border-dash-ink bg-dash-ink px-4 text-[0.75rem] font-bold tracking-[0.08em] text-white uppercase transition-colors hover:bg-black disabled:opacity-40"
              >
                {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={2.5} />}
                Save as draft
              </button>
              <p className="mt-2 text-[0.75rem] leading-relaxed text-dash-muted">
                A share you type here is a share nobody checked. If it is about the count, take
                the generated line instead — it carries its own denominator.
              </p>
            </>
          )}
        </Card>
      </div>

      <Card title="Every line tonight" subtitle="Drafts, clearances, what went out and what was refused">
        <Queue items={tickers} empty="No ticker lines have been written tonight." />
      </Card>
    </div>
  );
}
