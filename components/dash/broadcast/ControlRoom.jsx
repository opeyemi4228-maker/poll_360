"use client";

import { Activity, ArrowRight } from "lucide-react";

import { Card, Empty, Badge } from "@/components/dash/DashCard";
import { clock } from "./Queue";
import { kindLabel } from "@/lib/broadcast";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The TV control room.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE SCREEN THAT ANSWERS "WHAT IS THE VIEWER LOOKING AT"
 *
 *  Every other surface on this desk owns one layer — the ticker desk owns the
 *  crawl, the graphics bench owns the frame, the breaking desk owns the strap.
 *  Nobody owns the composite, and the composite is what goes out. The classic
 *  failure is not that any one layer is wrong; it is that three layers are
 *  each individually right and contradict each other on screen: a strap saying
 *  a result is in, over a map showing the same state grey.
 *
 *  So this screen stacks them, at the aspect ratio they go out at, and puts
 *  every layer's queue underneath. It is the only place in the product where
 *  the output is drawn as one picture.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** The layers of a broadcast picture, bottom to top. */
const LAYERS = [
  { id: "FULLSCREEN", label: "Full frame", surface: "graphics" },
  { id: "MAP", label: "Map", surface: "mapstudio" },
  { id: "GRAPHIC", label: "Graphic", surface: "graphics" },
  { id: "VIDEO", label: "Video", surface: "video" },
  { id: "LOWER_THIRD", label: "Lower third", surface: "ticker" },
  { id: "BANNER", label: "Breaking strap", surface: "breaking" },
  { id: "TICKER", label: "Ticker", surface: "ticker" },
];

export default function ControlRoom({ items, load, national, raceLabel, onGo }) {
  const on = (kind) => items.find((item) => item.kind === kind && item.state === "ON_AIR") ?? null;

  const frame = on("FULLSCREEN") ?? on("MAP") ?? on("GRAPHIC");
  const strap = on("BANNER");
  const third = on("LOWER_THIRD");
  const crawl = on("TICKER");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        {/* ── THE COMPOSITE ────────────────────────────────────────────── */}
        <Card
          title="What is going out"
          subtitle="Every on-air layer, stacked, at 16:9"
          padded={false}
        >
          <div className="relative aspect-video w-full overflow-hidden bg-black">
            {/* The frame. A colour field rather than a rendered picture: the
                renderer lives behind /api/graphic and pulling a 1200×675 PNG
                into a control room that refreshes constantly is a cost with no
                benefit — what an operator needs here is which frame, not the
                frame itself. */}
            <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
              {frame ? (
                <div>
                  <p className="text-[0.6875rem] font-bold tracking-[0.18em] text-white/50 uppercase">
                    {kindLabel(frame.kind)}
                  </p>
                  <p className="mt-2 font-display text-[1.5rem] leading-tight font-extrabold tracking-[-0.02em] text-white">
                    {frame.title}
                  </p>
                  {frame.body && <p className="mt-1.5 text-[0.875rem] text-white/70">{frame.body}</p>}
                </div>
              ) : (
                <p className="text-[0.875rem] text-white/40">
                  No frame on air. The gallery&rsquo;s own source is what the viewer sees.
                </p>
              )}
            </div>

            {/* The strap sits above everything, which is what makes it the
                strap. */}
            {strap && (
              <div className="absolute top-0 right-0 left-0 flex items-stretch">
                <span className="bg-red-600 px-3 py-2 font-display text-[0.625rem] font-extrabold tracking-[0.16em] text-white uppercase">
                  Breaking
                </span>
                <span className="min-w-0 flex-1 truncate bg-black/85 px-3 py-2 font-display text-[0.8125rem] font-extrabold text-white uppercase">
                  {strap.title}
                </span>
              </div>
            )}

            {third && (
              <div className="absolute right-8 bottom-14 left-8">
                <div className="inline-block max-w-full bg-white/95 px-4 py-2.5">
                  <p className="truncate font-display text-[0.9375rem] leading-tight font-extrabold tracking-[-0.01em] text-black uppercase">
                    {third.title}
                  </p>
                </div>
              </div>
            )}

            {crawl && (
              <div className="absolute right-0 bottom-0 left-0 flex items-stretch">
                <span className="bg-white/15 px-3 py-2 font-display text-[0.625rem] font-extrabold tracking-[0.16em] text-white uppercase">
                  Poll360
                </span>
                <span className="min-w-0 flex-1 truncate bg-black/85 px-3 py-2 font-display text-[0.8125rem] font-extrabold text-white uppercase">
                  {crawl.title}
                </span>
              </div>
            )}
          </div>

          {/* ── THE ONE CHECK THIS SCREEN EXISTS TO MAKE ─────────────────
              Layers that individually passed clearance and together say two
              different things. Only the coarsest version of that test is
              possible without reading the words, and the coarsest version is
              still worth having. */}
          <div className="border-t border-dash-line px-5 py-3">
            {frame || strap || third || crawl ? (
              <p className="text-[0.8125rem] leading-relaxed text-dash-muted">
                {[frame, strap, third, crawl].filter(Boolean).length} layer
                {[frame, strap, third, crawl].filter(Boolean).length === 1 ? "" : "s"} on air. Read
                them together before the next hit: three layers that are each correct can still
                contradict each other on screen.
              </p>
            ) : (
              <p className="text-[0.8125rem] text-dash-muted">
                Nothing from this desk is on air. Whatever the gallery is running is its own.
              </p>
            )}
          </div>
        </Card>

        {/* ── THE COUNT, IN ONE GLANCE ─────────────────────────────────── */}
        <div className="space-y-4">
          <Card title="The count behind it" subtitle={raceLabel}>
            {national ? (
              <dl className="space-y-2.5 text-[0.875rem]">
                <Line label="Returns in" value={formatNumber(national.filed)} />
                <Line label="Verified" value={formatNumber(national.verified)} />
                <Line
                  label="Booths reporting"
                  value={national.reporting === null ? "—" : formatShare(national.reporting)}
                />
                <Line
                  label="Leading"
                  value={
                    national.parties[0]
                      ? `${national.parties[0].id} ${formatShare(national.parties[0].share)}`
                      : "—"
                  }
                />
              </dl>
            ) : (
              <Empty>No returns have arrived for this contest.</Empty>
            )}
          </Card>

          <Card title="On-air alerts" subtitle="What a producer should be told without asking">
            <ul className="space-y-2.5 text-[0.875rem] leading-relaxed">
              {load.review.length > 0 && (
                <Alert tone="warn">
                  {formatNumber(load.review.length)} item
                  {load.review.length === 1 ? " is" : "s are"} waiting on an editor and cannot
                  reach air until somebody looks.
                </Alert>
              )}
              {load.onAir.length === 0 && (
                <Alert tone="neutral">Nothing from this desk is on air.</Alert>
              )}
              {load.cleared.length > 0 && (
                <Alert tone="neutral">
                  {formatNumber(load.cleared.length)} cleared item
                  {load.cleared.length === 1 ? "" : "s"} ready to take.
                </Alert>
              )}
              {load.rejected.length > 0 && (
                <Alert tone="alert">
                  {formatNumber(load.rejected.length)} item
                  {load.rejected.length === 1 ? " was" : "s were"} refused tonight. Each carries
                  its reason.
                </Alert>
              )}
            </ul>
          </Card>
        </div>
      </div>

      {/* ── EVERY CHANNEL, AND THE DOOR TO ITS BENCH ─────────────────────── */}
      <Card title="The layers" subtitle="What is on each, and where it is made">
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {LAYERS.map((layer) => {
            const live = on(layer.id);
            const waiting = items.filter(
              (item) => item.kind === layer.id && (item.state === "CLEARED" || item.state === "REVIEW")
            );
            return (
              <li key={layer.id}>
                <button
                  type="button"
                  onClick={() => onGo(layer.surface)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-dash-sm border px-3.5 py-3 text-left transition-colors",
                    live ? "border-dash-ink bg-dash-bg" : "border-dash-line hover:border-dash-ink"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                        {layer.label}
                      </span>
                      {live && <Badge tone="ink">On air</Badge>}
                    </span>
                    <span className="mt-1.5 block truncate text-[0.875rem] font-semibold text-dash-ink">
                      {live ? live.title : "—"}
                    </span>
                    <span className="mt-0.5 block text-[0.75rem] text-dash-muted">
                      {live?.airedAt ? `since ${clock(live.airedAt)} · ` : ""}
                      {waiting.length} waiting
                    </span>
                  </span>
                  <ArrowRight size={15} strokeWidth={2.5} className="mt-1 shrink-0 text-dash-muted" />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-dash-muted">{label}</dt>
      <dd className="figure font-bold text-dash-ink">{value}</dd>
    </div>
  );
}

function Alert({ tone, children }) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-dash-sm px-3 py-2.5",
        tone === "alert"
          ? "bg-red-50 text-red-700"
          : tone === "warn"
            ? "bg-amber-50 text-amber-900"
            : "bg-dash-bg text-dash-muted"
      )}
    >
      <Activity size={15} strokeWidth={2.5} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

/* ────────────────────────────────────────────────── live video control ──── */

/**
 * Streams.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A HEALTH PANEL WITH NO ENCODER BEHIND IT IS A LIE WITH A GREEN LIGHT
 *
 *  Bitrate, connection state, viewer counts and stream health are not things
 *  this product can derive from anything it holds. They come from an encoder,
 *  an ingest endpoint and a platform's own API, and none of the three is
 *  wired to this repository.
 *
 *  There are two honest options: leave the screen out, or build the half that
 *  is real and say plainly what the other half needs. Leaving it out is worse,
 *  because the scheduling half — which streams are planned, who cleared them,
 *  which are running — is genuinely useful and is exactly what a desk loses
 *  track of first on a long night. So it is here, and the meters are not
 *  drawn at all rather than drawn empty.
 * ══════════════════════════════════════════════════════════════════════════
 */
export function StreamControl({ items, onGo }) {
  const streams = items.filter(
    (item) => item.kind === "PROGRAMME" && item.payload?.stream
  );
  const programmes = items.filter((item) => item.kind === "PROGRAMME");

  return (
    <div className="space-y-4">
      <Card title="Scheduled streams" subtitle="Planned live output, cleared the way everything else is">
        {programmes.length === 0 ? (
          <Empty>
            Nothing is scheduled. Slots are added on the scheduler; mark one as a stream and it
            appears here.
          </Empty>
        ) : (
          <ul className="space-y-2.5">
            {programmes.slice(0, 10).map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-dash-sm border border-dash-line px-3.5 py-3"
              >
                <span className="figure w-12 shrink-0 text-[0.875rem] font-bold text-dash-ink">
                  {item.scheduledFor ? clock(item.scheduledFor) : "—:—"}
                </span>
                <span className="min-w-0 flex-1 text-[0.875rem] text-dash-ink">{item.title}</span>
                <Badge tone={item.state === "ON_AIR" ? "ink" : "neutral"}>
                  {item.state.replace("_", " ").toLowerCase()}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => onGo("scheduler")}
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-dash-sm border border-dash-line px-3 text-[0.6875rem] font-bold tracking-[0.06em] text-dash-ink uppercase hover:border-dash-ink"
        >
          Open the scheduler
          <ArrowRight size={13} strokeWidth={2.5} />
        </button>
      </Card>

      <Card title="Stream health" subtitle="What this would take, rather than a meter with nothing behind it">
        <p className="text-[0.875rem] leading-relaxed text-dash-muted">
          Bitrate, connection state, dropped frames, viewer counts and stream duration all come
          from an encoder and a platform&rsquo;s API. Neither is connected to this product, so none
          of those meters is drawn — a health panel reading zero and a health panel reading
          nothing look the same on a wall, and only one of them is true.
        </p>
        <ul className="mt-3 space-y-2 text-[0.875rem] leading-relaxed text-dash-muted">
          <li className="border-l-2 border-dash-line pl-3">
            <span className="font-bold text-dash-ink">An ingest endpoint.</span> RTMP or SRT, with
            a key per source, so the desk knows which encoder is which.
          </li>
          <li className="border-l-2 border-dash-line pl-3">
            <span className="font-bold text-dash-ink">A platform grant per destination.</span>{" "}
            YouTube and Facebook both report viewers and health; both need an OAuth grant that a
            person renews.
          </li>
          <li className="border-l-2 border-dash-line pl-3">
            <span className="font-bold text-dash-ink">Somewhere to put the numbers.</span> Health
            is a time series, not a current value: what matters at 11pm is that the bitrate has
            been falling for ten minutes, not what it is this second.
          </li>
        </ul>
        {streams.length > 0 && (
          <p className="mt-3 border-t border-dash-line pt-3 text-[0.8125rem] text-dash-muted">
            {formatNumber(streams.length)} slot{streams.length === 1 ? " is" : "s are"} marked as a
            stream tonight.
          </p>
        )}
      </Card>
    </div>
  );
}
