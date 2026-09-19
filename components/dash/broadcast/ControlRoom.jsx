"use client";

import { Activity } from "lucide-react";

import { Card, Empty } from "@/components/dash/DashCard";

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
