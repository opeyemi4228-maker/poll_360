"use client";

import { AlertTriangle, Gauge, Radio, ShieldAlert, Users } from "lucide-react";

import { Card, Empty, StatCard, Badge } from "@/components/dash/DashCard";
import { ItemCard, clock, useDesk } from "./Queue";
import { describeUnit } from "@/lib/broadcast";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The broadcast command centre.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE QUESTION: WHAT SHOULD THIS TEAM BE SAYING RIGHT NOW?
 *
 *  Not "what is happening in the election" — the situation room answers that,
 *  and it answers it better. This screen answers the narrower and more urgent
 *  question a gallery has every few minutes: given everything that has moved,
 *  what is on air, what is cleared and waiting, what is stuck with an editor,
 *  and what has just come in that somebody will be asked about on the next
 *  bulletin.
 *
 *  ── SO IT IS ORDERED BY WHAT DEMANDS AN ACT ────────────────────────────
 *  Output first, because that is what the audience is seeing. Then what is
 *  blocked, because that is what the person reading this can unblock. Then
 *  what has moved. Figures come last, not because they matter least but
 *  because they are on every other screen in the product and this one is the
 *  only place the queue is.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default function CommandCentre({
  load,
  order,
  clearance: pipeline,
  coverage,
  incidents,
  reporters,
  project,
  raceLabel,
  ground,
  onGo,
}) {
  const { may } = useDesk();
  const breaking = incidents.filter((row) => row.severity === "CRITICAL" || row.severity === "URGENT");

  return (
    <div className="space-y-4">
      {/* ── WHAT IS OUT THERE ─────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Radio}
          label="On air"
          value={formatNumber(load.onAir.length)}
          context={
            load.onAir.length
              ? load.onAir.map((item) => item.title).slice(0, 2).join(" · ")
              : "Nothing is being served to a renderer"
          }
          tone={load.onAir.length ? "default" : "default"}
        />
        <StatCard
          icon={AlertTriangle}
          label="Waiting on an editor"
          value={formatNumber(load.review.length)}
          context={
            load.review.length
              ? "Nothing here can reach air until somebody looks at it"
              : "The clearance queue is empty"
          }
          tone={load.review.length > 4 ? "alert" : "default"}
        />
        <StatCard
          icon={Gauge}
          label="Booths in"
          value={coverage.reporting === null ? "—" : formatShare(coverage.reporting)}
          context={`${formatNumber(coverage.filed)} ${raceLabel.toLowerCase()} returns${
            coverage.expected ? ` of about ${formatNumber(coverage.expected)} booths` : ""
          }`}
        />
        <StatCard
          icon={ShieldAlert}
          label="Reports from the field"
          value={formatNumber(incidents.length)}
          context={
            breaking.length
              ? `${formatNumber(breaking.length)} marked urgent or worse`
              : "Nothing marked urgent"
          }
          tone={breaking.length ? "alert" : "default"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ── THE OUTPUT ITSELF ───────────────────────────────────────────── */}
        <Card
          title="On air now"
          subtitle="Everything a renderer is currently serving"
          className="xl:col-span-2"
        >
          {load.onAir.length === 0 ? (
            <Empty>
              Nothing is on air. Straps, graphics and maps appear here the moment somebody takes
              a cleared item to air.
            </Empty>
          ) : (
            <div className="space-y-3">
              {load.onAir.map((item) => (
                <ItemCard key={item.id} item={item} compact />
              ))}
            </div>
          )}

          {/* ── THE RUNNING ORDER, BESIDE THE OUTPUT AND NOT ON ANOTHER TAB ─
              What is on and what was supposed to be on are the same question
              asked twice, and an operator who has to change screens to compare
              them will not compare them. */}
          <div className="mt-4 grid gap-3 border-t border-dash-line pt-4 sm:grid-cols-3">
            <Slot label="Now" item={order.now} tone="ink" />
            <Slot label="Next" item={order.next} />
            <Slot label="Then" item={order.later[0]} />
          </div>
          {order.overdue.length > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-dash-sm bg-amber-50 px-3 py-2.5 text-[0.8125rem] leading-relaxed text-amber-800">
              <AlertTriangle size={15} strokeWidth={2.5} className="mt-0.5 shrink-0" />
              {order.overdue.length === 1 ? "One item is" : `${order.overdue.length} items are`} past
              their scheduled start and have not been taken to air. A gallery running late is
              normal; a running order that nobody has moved is worth a look.
            </p>
          )}
        </Card>

        {/* ── WHAT THE READER CAN UNBLOCK ─────────────────────────────────── */}
        <Card
          title="Waiting on you"
          subtitle={may.clear ? "Cleared by somebody who did not write it" : "Read only from this account"}
        >
          {load.review.length === 0 ? (
            <Empty>Nothing is waiting for clearance.</Empty>
          ) : (
            <ul className="space-y-2.5">
              {load.review.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onGo("approvals")}
                    className="w-full rounded-dash-sm border border-dash-line px-3 py-2.5 text-left transition-colors hover:border-dash-ink"
                  >
                    <span className="flex items-center gap-2">
                      <Badge tone="warn">{item.kind.replace(/_/g, " ").toLowerCase()}</Badge>
                      <span className="text-[0.75rem] text-dash-muted">{clock(item.createdAt)}</span>
                    </span>
                    <span className="mt-1.5 block text-[0.875rem] leading-snug font-semibold text-dash-ink">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[0.75rem] text-dash-muted">
                      from {item.createdName ?? "the desk"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ── THE COUNT, AS THIS DESK IS ALLOWED TO USE IT ─────────────────
            The four stages, tiny, because the full control is one press away
            and what belongs here is only the answer to "may we say numbers
            out loud yet". */}
        <Card
          title="Figures cleared for air"
          subtitle="RAW → VERIFIED → CLEARED → ON AIR"
          action={
            <button
              type="button"
              onClick={() => onGo("liveresults")}
              className="text-[0.75rem] font-bold tracking-[0.06em] text-dash-muted uppercase hover:text-dash-ink"
            >
              Open
            </button>
          }
        >
          <ol className="space-y-2">
            {pipeline.stages.map((stage) => (
              <li key={stage.id} className="flex items-baseline justify-between gap-3">
                <span className="text-[0.8125rem] text-dash-muted" title={stage.why}>
                  {stage.label}
                </span>
                <span className="figure text-[1.125rem] leading-none font-bold text-dash-ink">
                  {formatNumber(stage.count)}
                </span>
              </li>
            ))}
          </ol>
          {pipeline.verifiedNotCleared > 0 && (
            <p className="mt-3 border-t border-dash-line pt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
              <span className="font-semibold text-dash-ink">
                {formatNumber(pipeline.verifiedNotCleared)} verified returns
              </span>{" "}
              are not covered by any clearance. They are checked; nobody has passed them for
              reading out.
            </p>
          )}
        </Card>

        {/* ── DEVELOPMENTS, WORDED AS REPORTS ──────────────────────────────
            The broadcast desk is not given the narrative — that is sealed and
            belongs to the room running the count. What it gets is that a
            report exists, of what kind, and where, which is exactly what a
            producer needs to decide whether to send somebody. */}
        <Card title="Breaking developments" subtitle="Reports from the field. Reports, not findings.">
          {incidents.length === 0 ? (
            <Empty>Nothing has been reported.</Empty>
          ) : (
            <ul className="space-y-2.5">
              {incidents.slice(0, 6).map((row) => (
                <li key={row.id} className="border-l-2 border-dash-line pl-3">
                  <p className="flex items-center gap-2">
                    <Badge tone={row.severity === "CRITICAL" ? "alert" : row.severity === "URGENT" ? "warn" : "neutral"}>
                      {String(row.kind ?? "report").replace(/_/g, " ").toLowerCase()}
                    </Badge>
                    <span className="text-[0.75rem] text-dash-muted">{clock(row.createdAt)}</span>
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-snug text-dash-ink">
                    {describeUnit(row.unitCode)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── THE PEOPLE ───────────────────────────────────────────────── */}
        <Card
          title="Field"
          subtitle="Who is out, and whether they are filing"
          action={
            <button
              type="button"
              onClick={() => onGo("reporters")}
              className="text-[0.75rem] font-bold tracking-[0.06em] text-dash-muted uppercase hover:text-dash-ink"
            >
              Open
            </button>
          }
        >
          <div className="grid grid-cols-3 gap-3">
            <Tally label="Assigned" value={reporters.assigned} />
            <Tally label="Signed in" value={reporters.signedIn} />
            <Tally label="Filed" value={reporters.filed} tone="good" />
          </div>
          <p className="mt-3 flex items-center gap-2 border-t border-dash-line pt-3 text-[0.8125rem] text-dash-muted">
            <Users size={15} strokeWidth={2.25} className="shrink-0" />
            {ground}
            {project ? ` · ${project.title}` : ""}
          </p>
        </Card>
      </div>

      {/* ── WHAT WENT OUT ────────────────────────────────────────────────── */}
      <Card title="Went out" subtitle="Everything this desk has broadcast, most recent first">
        {load.aired.length === 0 ? (
          <Empty>Nothing has gone out yet.</Empty>
        ) : (
          <ol className="space-y-2">
            {load.aired.slice(0, 8).map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-dash-line pb-2 last:border-0 last:pb-0"
              >
                <span className="figure w-12 shrink-0 text-[0.8125rem] font-bold text-dash-ink">
                  {clock(item.airedAt)}
                </span>
                <span className="min-w-0 flex-1 text-[0.875rem] text-dash-ink">{item.title}</span>
                <span className="text-[0.75rem] text-dash-muted">
                  {item.clearedName ? `cleared by ${item.clearedName}` : "no clearance recorded"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function Slot({ label, item, tone = "neutral" }) {
  return (
    <div
      className={cn(
        "rounded-dash-sm border px-3 py-2.5",
        tone === "ink" ? "border-dash-ink bg-dash-ink text-white" : "border-dash-line bg-dash-bg"
      )}
    >
      <p
        className={cn(
          "text-[0.625rem] font-bold tracking-[0.16em] uppercase",
          tone === "ink" ? "text-white/60" : "text-dash-muted"
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-[0.875rem] leading-snug font-bold",
          tone === "ink" ? "text-white" : "text-dash-ink"
        )}
      >
        {item ? item.title : "—"}
      </p>
      {item?.scheduledFor && (
        <p className={cn("mt-0.5 text-[0.75rem]", tone === "ink" ? "text-white/70" : "text-dash-muted")}>
          {clock(item.scheduledFor)}
        </p>
      )}
    </div>
  );
}

function Tally({ label, value, tone = "neutral" }) {
  return (
    <div className="rounded-dash-sm bg-dash-bg px-3 py-2.5">
      <p className="text-[0.625rem] font-bold tracking-[0.12em] text-dash-muted uppercase">{label}</p>
      <p
        className={cn(
          "figure mt-1 text-[1.25rem] leading-none font-bold",
          tone === "good" ? "text-emerald-700" : "text-dash-ink"
        )}
      >
        {formatNumber(value)}
      </p>
    </div>
  );
}
