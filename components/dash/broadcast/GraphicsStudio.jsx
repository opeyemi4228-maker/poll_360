"use client";

import { useMemo, useState } from "react";
import { Download, ImageIcon, Loader2, RefreshCw } from "lucide-react";

import { Card } from "@/components/dash/DashCard";
import { Queue, Said, useAction, useDesk } from "./Queue";
import { draftItem } from "@/app/broadcast/actions";
import { SHAPES, TEMPLATES } from "@/lib/broadcast";
import { cn } from "@/lib/utils";

/**
 * The graphics bench.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE PRODUCER PICKS THE DATA; THE SYSTEM FILLS THE FRAME
 *
 *  That is the whole idea, and the reason it is worth building is not speed.
 *  It is that a frame filled by hand is a frame somebody typed a number into,
 *  and the number they typed came off a screen that has since moved. Every
 *  wrong figure that has ever gone out on an election night went out inside a
 *  graphic that somebody built five minutes earlier from a figure that was
 *  true when they built it.
 *
 *  So the frame is rendered from the same rows the map draws, at the moment it
 *  is rendered, with the coverage burnt into it — see app/api/graphic.
 *
 *  ── AND WHY MOST OF THIS CATALOGUE SAYS "NOT BUILT" ─────────────────────
 *  Seventeen templates are listed because seventeen are what a newsroom needs.
 *  One renderer exists. Listing all seventeen as though they work would be the
 *  same lie this product refuses to tell about its coverage figures, so each
 *  one says which it is, and the one that renders is the one that draws.
 *
 *  A template that is not built is still worth drafting against: the item goes
 *  into the queue naming the template and the place, an editor clears it, and
 *  the desk builds the frame in whatever it uses today. The workflow is real
 *  even where the renderer is not.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default function GraphicsStudio({ race, raceLabel, places, filed, registered, incidentCount, items }) {
  const { may } = useDesk();
  const { pending, said, run, setSaid } = useAction();

  const [template, setTemplate] = useState("result-presidential");
  const [shape, setShape] = useState("wide");
  const [scope, setScope] = useState("NATION");
  const [stamp, setStamp] = useState(() => Date.now());

  const graphics = items.filter((item) => item.kind === "GRAPHIC" || item.kind === "FULLSCREEN");

  /* ── WHAT EACH TEMPLATE WOULD NEED, AND WHETHER WE HAVE IT ─────────────
     Availability is computed from the project rather than declared, so a
     template stops being offered the moment the data behind it goes away. */
  const has = useMemo(
    () => ({
      returns: filed > 0,
      register: registered > 0,
      registry: places.some((place) => place.expected > 0),
      incidents: incidentCount > 0,
      none: true,
    }),
    [filed, registered, places, incidentCount]
  );

  const ready = (row) =>
    row.needs in has ? has[row.needs] : row.needs === race && filed > 0;

  /* The one template with a renderer behind it: the count for the contest
     currently on screen. Everything else is a design with no printer. */
  const rendersNow = (row) => row.needs === race && filed > 0;

  const chosen = TEMPLATES.find((row) => row.id === template) ?? TEMPLATES[0];
  const live = rendersNow(chosen);
  const src = `/api/graphic?shape=${shape}&race=${encodeURIComponent(race ?? "")}&t=${stamp}`;

  const groups = ["Result", "Place", "Analysis", "Alert", "Map"].map((group) => ({
    group,
    rows: TEMPLATES.filter((row) => row.group === group),
  }));

  const place = places.find((row) => row.scope === scope);

  return (
    <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
      {/* ── THE CATALOGUE ──────────────────────────────────────────────── */}
      <Card title="Templates" subtitle={`${TEMPLATES.length} designs · one renderer`} padded={false}>
        <div className="max-h-[38rem] overflow-y-auto p-3">
          {groups.map((group) => (
            <section key={group.group} className="mb-4 last:mb-0">
              <h3 className="px-1 pb-1.5 text-[0.625rem] font-bold tracking-[0.14em] text-dash-muted uppercase">
                {group.group}
              </h3>
              <ul className="space-y-1">
                {group.rows.map((row) => {
                  const available = ready(row);
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setTemplate(row.id)}
                        aria-pressed={template === row.id}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-dash-sm px-2.5 py-2 text-left text-[0.8125rem] transition-colors",
                          template === row.id
                            ? "bg-dash-ink font-semibold text-white"
                            : available
                              ? "text-dash-ink hover:bg-dash-bg"
                              : "text-dash-muted hover:bg-dash-bg"
                        )}
                      >
                        <span className="min-w-0 truncate">{row.label}</span>
                        {rendersNow(row) ? (
                          <span
                            className={cn(
                              "shrink-0 text-[0.625rem] font-bold tracking-[0.08em] uppercase",
                              template === row.id ? "text-white/70" : "text-emerald-700"
                            )}
                          >
                            Renders
                          </span>
                        ) : !available ? (
                          <span
                            className={cn(
                              "shrink-0 text-[0.625rem] tracking-[0.08em] uppercase",
                              template === row.id ? "text-white/50" : "text-dash-muted"
                            )}
                          >
                            No data
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        {/* ── THE BENCH ──────────────────────────────────────────────────── */}
        <Card
          title={chosen.label}
          subtitle={live ? `Rendered from tonight's ${raceLabel.toLowerCase()} returns` : "Designed. No renderer behind it yet."}
          action={
            live && (
              <button
                type="button"
                onClick={() => setStamp(Date.now())}
                className="inline-flex h-8 items-center gap-1.5 rounded-dash-sm border border-dash-line px-2.5 text-[0.6875rem] font-bold tracking-[0.06em] text-dash-ink uppercase hover:border-dash-ink"
              >
                <RefreshCw size={13} strokeWidth={2.5} />
                Restamp
              </button>
            )
          }
        >
          <div className="flex flex-wrap items-center gap-4">
            <fieldset>
              <legend className="text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
                Shape
              </legend>
              <div className="mt-1.5 flex gap-1.5">
                {SHAPES.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setShape(row.id)}
                    aria-pressed={shape === row.id}
                    title={`${row.size} · ${row.why}`}
                    className={cn(
                      "h-9 rounded-dash-sm border px-3 text-[0.75rem] font-semibold transition-colors",
                      shape === row.id
                        ? "border-dash-ink bg-dash-ink text-white"
                        : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                    )}
                  >
                    {row.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="min-w-48">
              <span className="block text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
                Which place
              </span>
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                className="mt-1.5 h-9 w-full rounded-dash-sm border border-dash-line bg-dash-card px-2.5 text-[0.875rem] text-dash-ink"
              >
                <option value="NATION">Everywhere this desk may read</option>
                {places.map((row) => (
                  <option key={row.scope} value={row.scope}>
                    {row.name} · {row.filed} filed
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* ── THE PREVIEW IS THE ARTEFACT ────────────────────────────────
              Where a renderer exists, what is on screen is the file itself
              rather than a rehearsal of it in HTML — the same rule the share
              graphic already follows. A preview built separately from the
              output is a preview that will one day disagree with it, and the
              first anybody knows is after it has gone out. */}
          <div className="mt-4">
            {live ? (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`${chosen.label}, ${shape}`}
                  className="w-full rounded-dash-sm border border-dash-line bg-black"
                />
                <figcaption className="mt-2 flex flex-wrap items-center gap-3 text-[0.75rem] text-dash-muted">
                  <span>{SHAPES.find((row) => row.id === shape)?.size}</span>
                  <a
                    href={src}
                    download
                    className="inline-flex items-center gap-1.5 font-semibold text-dash-ink hover:underline"
                  >
                    <Download size={13} strokeWidth={2.5} />
                    Download the file
                  </a>
                </figcaption>
              </figure>
            ) : (
              <div className="rounded-dash-sm border border-dashed border-dash-line bg-dash-bg px-5 py-10 text-center">
                <ImageIcon size={22} strokeWidth={2} className="mx-auto text-dash-muted" />
                <p className="mt-3 text-[0.875rem] leading-relaxed text-dash-muted">
                  <span className="font-semibold text-dash-ink">{chosen.label}</span> is designed and
                  has no renderer in this repository yet.
                  {!ready(chosen) && " This project also holds none of the figures it needs."}
                </p>
                <p className="mx-auto mt-2 max-w-md text-[0.8125rem] leading-relaxed text-dash-muted">
                  Drafting it still works: the item names the template and the place, an editor
                  clears it, and the audit records what went out. The frame itself is built in
                  whatever the gallery uses today.
                </p>
              </div>
            )}
          </div>

          {may.draft && (
            <div className="mt-4 border-t border-dash-line pt-4">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      draftItem({
                        kind: "GRAPHIC",
                        title: `${chosen.label} — ${place?.name ?? "everywhere"}`,
                        body: `${SHAPES.find((row) => row.id === shape)?.label} · ${
                          live ? "rendered from tonight's returns" : "template not yet built"
                        }`,
                        race,
                        scope,
                        payload: { template: chosen.id, shape, rendered: live },
                      }),
                    {
                      onDone: () =>
                        setSaid({
                          tone: "good",
                          text: "Drafted. An editor who did not draft it has to clear it before it can go out.",
                        }),
                    }
                  )
                }
                className="inline-flex h-10 items-center gap-2 rounded-dash-sm border-2 border-dash-ink bg-dash-ink px-4 text-[0.75rem] font-bold tracking-[0.08em] text-white uppercase transition-colors hover:bg-black disabled:opacity-40"
              >
                {pending ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} strokeWidth={2.5} />}
                Draft this graphic
              </button>
              <Said said={said} />
            </div>
          )}
        </Card>

        <Card title="Graphics tonight" subtitle="Every frame this desk has built, and where it got to">
          <Queue items={graphics} empty="No graphics have been built tonight." />
        </Card>
      </div>
    </div>
  );
}
