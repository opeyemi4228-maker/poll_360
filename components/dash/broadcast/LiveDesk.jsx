"use client";

import { useState } from "react";
import { AlertTriangle, BarChart3, ExternalLink, Flag, MapPin, PenLine, Radio, Send } from "lucide-react";

import { Card, Empty } from "@/components/dash/DashCard";
import { useDesk } from "./Queue";
import { Pip, Ring, Spark } from "./Gauges";
import PublishingList from "./PublishingList";
import { PostComposer } from "./SocialDesk";
import { DELIVERY, platformLabel } from "@/lib/broadcast";
import { STATE_POINTS, clockWAT, placeOf, stampFor } from "@/lib/stamp";
import { parseUnitCode } from "@/lib/units";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The live desk: releasing updates as the night happens.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE SCREEN FOR THE WHOLE LOOP
 *
 *  Something happens in the field → somebody writes it up → an editor clears
 *  it → it is out on every platform, stamped with where and when → it sits on
 *  the timeline beside what caused it. Before this screen those five steps
 *  lived on five surfaces, and the step that got skipped under pressure was
 *  the one that checked whether the post had actually landed.
 *
 *  So the composer, the editor's queue and the timeline share one screen, and
 *  the timeline carries both halves: what the field reported and what the desk
 *  said about it. A room can see at a glance that Kano had three serious
 *  reports in the last hour and nothing has gone out about Kano — which is
 *  the narrative question this desk exists to answer.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* What the timeline can hold, and how each is drawn. */
const STREAMS = {
  published: { label: "Published", icon: Radio, tone: "ink" },
  field: { label: "Field reports", icon: AlertTriangle, tone: "alert" },
  results: { label: "Results", icon: BarChart3, tone: "neutral" },
  moments: { label: "Milestones", icon: Flag, tone: "neutral" },
};

export default function LiveDesk({ items = [], incidents = [], timeline = null, places = [], national = null, race, shapes = null }) {
  const { deliveries, channels, wire, may } = useDesk();

  /* A prefill from "write this up", and a key that remounts the composer so
     the prefill is taken rather than merged into whatever was half-typed. */
  const [preset, setPreset] = useState(null);
  const [presetKey, setPresetKey] = useState(0);
  const [state, setState] = useState(null);
  const [show, setShow] = useState(() => new Set(Object.keys(STREAMS)));

  const writeUp = (next) => {
    setPreset(next);
    setPresetKey((key) => key + 1);
    if (typeof window !== "undefined") {
      document.getElementById("live-compose")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const posts = items.filter((item) => item.kind === "SOCIAL");
  /* ── THE ONE PLACE THE DESK'S WORK WAITS FOR AN EDITOR ─────────────────
     Every kind — a post, a strap, a graphic, a claim — because the editor
     is one person working one list. Once cleared, an item moves to On air,
     which is where things are taken out; it is never in both. */
  const waiting = items.filter((item) => item.state === "REVIEW");
  const published = posts.filter((item) => item.state === "ON_AIR" || item.state === "OFF_AIR");
  const failing = published.filter((item) => Object.values(deliveries[item.id] ?? {}).some((row) => row.status === "FAILED"));
  const connected = channels.filter((row) => row.configured).length;

  const live = posts.filter((item) => item.state === "ON_AIR");

  /* The last six hours, half hour by half hour: when this desk was saying
     something and when it went quiet.

     The edge is the room's own reading of the clock, handed down with the
     night's timeline — a component may not read the clock while it is
     describing a picture, and one that did would draw a different strip on
     the server and in the browser. */
  const perHalfHour = (() => {
    const slots = new Array(12).fill(0);
    const clock = timeline?.at ? new Date(timeline.at).getTime() : Math.max(0, ...published.map((item) => new Date(item.airedAt ?? item.createdAt).getTime()));
    const edge = Math.floor(clock / 1_800_000) * 1_800_000;
    for (const item of published) {
      const at = new Date(item.airedAt ?? item.createdAt).getTime();
      const back = Math.floor((edge - at) / 1_800_000);
      if (back >= 0 && back < slots.length) slots[slots.length - 1 - back] += 1;
    }
    return slots;
  })();

  /* How many results each state had when the desk last published about it,
     read from the figures frozen into that post. */
  const lastSaid = new Map();
  for (const item of published) {
    const scope = item.payload?.figures?.scope ?? item.scope;
    if (!scope?.startsWith("STATE:")) continue;
    const filed = item.payload?.figures?.filed ?? 0;
    lastSaid.set(scope, Math.max(lastSaid.get(scope) ?? 0, filed));
  }
  const ready = places
    .map((place) => ({ scope: place.scope, name: place.name, fresh: place.filed - (lastSaid.get(place.scope) ?? 0) }))
    .filter((row) => row.fresh > 0)
    .sort((a, b) => b.fresh - a.fresh);

  /* ── THE TIMELINE, AS ONE LIST ─────────────────────────────────────────
     Every entry carries the same three things — a time, a place and a kind —
     so they sort together and filter together, whatever produced them. */
  const entries = (() => {
    const out = [];
    for (const item of published) {
      const stamp = item.payload?.stamp ?? stampFor({ scope: item.scope, at: item.createdAt });
      out.push({
        id: `post-${item.id}`,
        stream: "published",
        at: new Date(item.airedAt ?? stamp.at ?? item.createdAt),
        place: stamp.place,
        headline: item.title,
        detail: item.body,
        item,
      });
    }
    for (const row of incidents) {
      const parsed = parseUnitCode(row.unitCode);
      const place = placeOf(parsed ? `STATE:${parsed.stateNumber}` : null);
      out.push({
        id: `field-${row.id}`,
        stream: "field",
        at: new Date(row.createdAt),
        place,
        headline: row.kind,
        detail: `${severityWord(row.severity)} · polling unit ${row.unitCode}`,
        severity: row.severity,
        preset: {
          format: "incident",
          scope: place.scope,
          body: `${row.kind} reported at a polling unit in ${place.name}. Our team is checking with the agent there.`,
        },
      });
    }
    for (const slot of timeline?.slots ?? []) {
      if (!slot.filed) continue;
      const states = slot.states ?? [];
      out.push({
        id: `slot-${new Date(slot.at).getTime()}`,
        stream: "results",
        at: new Date(slot.at),
        place: states.length === 1 ? placeByName(states[0]) : placeOf("NATION"),
        headline: `${formatNumber(slot.filed)} result${slot.filed === 1 ? "" : "s"} in`,
        detail: states.length ? `From ${states.slice(0, 5).join(", ")}${states.length > 5 ? ` and ${states.length - 5} more` : ""}` : null,
        states,
        preset: { format: "result-card", scope: states.length === 1 ? placeByName(states[0]).scope : "NATION" },
      });
    }
    for (const moment of timeline?.moments ?? []) {
      if (moment.kind === "critical") continue; /* already a field report above */
      const parsed = parseUnitCode(moment.detail ?? "");
      const place = parsed ? placeOf(`STATE:${parsed.stateNumber}`) : placeOf("NATION");
      out.push({
        id: `moment-${moment.id}`,
        stream: "moments",
        at: new Date(moment.at),
        place,
        headline: moment.headline,
        detail: null,
        preset: { format: "situation", scope: place.scope, body: `${moment.headline}.` },
      });
    }
    return out.filter((row) => Number.isFinite(row.at.getTime())).sort((a, b) => b.at - a.at);
  })();

  const visible = entries.filter(
    (row) =>
      show.has(row.stream) &&
      (!state || row.place?.code === state || (row.stream === "results" && row.states?.includes(STATE_BY_CODE[state]?.name)))
  );

  /* Per state: what went out, and what the field reported. The gap between
     the two is the map's whole point. */
  const perState = (() => {
    const map = new Map();
    for (const row of entries) {
      const code = row.place?.code;
      if (!code) continue;
      const cell = map.get(code) ?? { published: 0, field: 0, serious: 0 };
      if (row.stream === "published") cell.published += 1;
      if (row.stream === "field") {
        cell.field += 1;
        if (row.severity === "CRITICAL" || row.severity === "SERIOUS") cell.serious += 1;
      }
      map.set(code, cell);
    }
    return map;
  })();

  return (
    <div className="flex flex-col gap-3">
      {/* ── THE NIGHT, AS A SHAPE ────────────────────────────────────────
          One row, read at a glance from across the room: how much of the
          count is in, how the publishing has gone half-hour by half-hour,
          and the two counts that need a person. */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-dash border border-dash-line bg-dash-card px-5 py-4">
        <Ring value={national?.reporting ?? null} label={`Polling units\ncounted`} tone="orange" />

        <div className="min-w-40 flex-1">
          <p className="flex items-baseline justify-between gap-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
            Published tonight
            <span className="figure text-[1.125rem] leading-none font-extrabold text-dash-ink">
              {formatNumber(live.length)}
            </span>
          </p>
          <Spark points={perHalfHour} className="mt-2" tone="red" />
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Pip value={formatNumber(waiting.length)} label="waiting" tone={waiting.length ? "orange" : "ink"} />
          <Pip value={formatNumber(failing.length)} label="to resend" tone={failing.length ? "red" : "ink"} />
          <Pip value={`${connected}/${channels.length}`} label="platforms" tone={connected ? "green" : "orange"} />
        </div>

        {wire && (
          <a
            href={wire}
            target="_blank"
            rel="noreferrer"
            className="air-band ml-auto inline-flex h-10 items-center gap-2 rounded-full px-4 text-[0.75rem] font-bold"
          >
            <span className="size-2 animate-pulse rounded-full bg-red-500" />
            Live page
          </a>
        )}
      </div>

      {/* ── READY FOR AN UPDATE ─────────────────────────────────────────
          Places whose count has moved since the desk last said anything
          about them, busiest first. The desk decides; this makes sure the
          decision is put in front of it rather than remembered. */}
      {may.draft && ready.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-dash border border-dash-line bg-dash-card px-4 py-3">
          <span className="mr-1 text-[0.6875rem] font-bold tracking-[0.12em] text-dash-muted uppercase">Ready for an update</span>
          {ready.slice(0, 8).map((row) => (
            <button
              key={row.scope}
              type="button"
              onClick={() => writeUp({ format: "result-card", scope: row.scope })}
              className="inline-flex items-center gap-1.5 rounded-full border border-dash-line bg-dash-bg px-3 py-1.5 text-[0.75rem] font-semibold text-dash-ink hover:border-dash-ink"
            >
              <PenLine size={12} strokeWidth={2.5} />
              {row.name}
              <span className="figure font-bold ink-ok">+{formatNumber(row.fresh)}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── WRITE ONE ───────────────────────────────────────────────────── */}
      <div id="live-compose" className="scroll-mt-24">
        <Card
          title="Release an update"
          subtitle={
            preset
              ? "Started from the timeline. Check the words before sending."
              : "Stamped with the place and the minute, sent everywhere you choose once cleared"
          }
        >
          <PostComposer
            key={presetKey}
            race={race}
            national={national}
            places={places}
            preset={preset}
            onSent={() => setPreset(null)}
          />
        </Card>
      </div>

      {/* ── THEN SEND THEM, ONE OR MANY ─────────────────────────────────── */}
      <PublishingList items={items} />

      {/* ──────────────────────────────────────────── map and timeline */}
      <div className="grid gap-3 xl:grid-cols-[22rem_1fr]">
        <Card
          title="Where"
          subtitle={state ? `${STATE_BY_CODE[state]?.name ?? state} · press again to clear` : "Pins are published updates; rings are field reports"}
          padded={false}
        >
          <PinMap shapes={shapes} perState={perState} selected={state} onSelect={setState} />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-dash-line px-4 py-2.5 text-[0.6875rem] text-dash-muted">
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-dash-ink" /> Published
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border-2 border-red-500" /> Serious reports
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border-2 border-[var(--color-flagged)]" /> Other reports
            </li>
          </ul>
          <Silence perState={perState} onSelect={setState} />
        </Card>

        <Card
          title="Timeline"
          subtitle="What the field reported and what the desk said, on one clock"
          action={
            <div className="flex flex-wrap gap-1">
              {Object.entries(STREAMS).map(([id, row]) => {
                const on = show.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setShow((current) => {
                        const next = new Set(current);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                    className={cn(
                      "h-8 rounded-full border px-3 text-[0.6875rem] font-semibold",
                      on ? "border-dash-ink bg-dash-ink text-white" : "border-dash-line text-dash-muted hover:text-dash-ink"
                    )}
                  >
                    {row.label}
                  </button>
                );
              })}
            </div>
          }
        >
          {visible.length === 0 ? (
            <Empty>
              {entries.length === 0
                ? "Nothing yet. Results, field reports and every update the desk publishes will appear here as they happen."
                : "Nothing matches. Clear the state or turn a stream back on."}
            </Empty>
          ) : (
            <ol className="relative flex flex-col">
              {visible.slice(0, 120).map((row, index) => (
                <Entry key={row.id} row={row} last={index === Math.min(visible.length, 120) - 1} onWriteUp={may.draft ? writeUp : null} deliveries={deliveries} />
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── the parts ── */

const STATE_BY_CODE = Object.fromEntries(Object.entries(STATE_POINTS).map(([number, row]) => [row.code, { ...row, number }]));
const STATE_BY_NAME = new Map(Object.entries(STATE_POINTS).map(([number, row]) => [row.name, number]));
const placeByName = (name) => (STATE_BY_NAME.has(name) ? placeOf(`STATE:${STATE_BY_NAME.get(name)}`) : placeOf("NATION"));

const severityWord = (value) =>
  value === "CRITICAL" ? "Critical" : value === "SERIOUS" ? "Serious" : value === "WARNING" ? "Warning" : "For information";

function Entry({ row, last, onWriteUp, deliveries }) {
  const stream = STREAMS[row.stream];
  const Icon = stream.icon;
  const done = row.item ? Object.values(deliveries[row.item.id] ?? {}) : [];
  const serious = row.severity === "CRITICAL" || row.severity === "SERIOUS";

  return (
    <li className="relative flex gap-3 pb-4">
      {!last && <span aria-hidden="true" className="absolute top-8 bottom-0 left-[0.9375rem] w-px bg-dash-line" />}
      <span
        className={cn(
          "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border",
          row.stream === "published" && "border-dash-ink bg-dash-ink text-white",
          row.stream === "field" && (serious ? "border-red-200 bg-red-50 text-red-600" : "tone-warn ink-warn"),
          (row.stream === "results" || row.stream === "moments") && "border-dash-line bg-dash-bg text-dash-muted"
        )}
      >
        <Icon size={15} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.6875rem] font-semibold text-dash-muted">
          <time dateTime={row.at.toISOString()} className="figure text-dash-ink">
            {clockWAT(row.at)}
          </time>
          {row.place && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} strokeWidth={2.5} aria-hidden="true" />
              {row.place.name}
            </span>
          )}
          <span className="tracking-[0.08em] uppercase">{stream.label}</span>
        </p>
        <p className="mt-0.5 text-[0.875rem] leading-snug font-bold text-dash-ink">{row.headline}</p>
        {row.detail && <p className="mt-0.5 line-clamp-3 text-[0.8125rem] leading-snug text-dash-muted">{row.detail}</p>}

        {done.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-1">
            {done.map((delivery) => {
              const tone = DELIVERY[delivery.status]?.tone;
              const label = `${platformLabel(delivery.platform)} · ${DELIVERY[delivery.status]?.label ?? delivery.status}`;
              const className = cn(
                "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[0.6875rem] font-semibold",
                tone === "good" ? "tone-ok ink-ok" : tone === "alert" ? "border-red-200 bg-red-50 text-red-700" : "tone-warn ink-warn"
              );
              return delivery.remoteUrl ? (
                <a key={delivery.platform} href={delivery.remoteUrl} target="_blank" rel="noreferrer" className={className} title={delivery.error ?? undefined}>
                  {label}
                  <ExternalLink size={10} strokeWidth={2.5} />
                </a>
              ) : (
                <span key={delivery.platform} className={className} title={delivery.error ?? undefined}>
                  {label}
                </span>
              );
            })}
          </p>
        )}

        {row.preset && onWriteUp && (
          <button
            type="button"
            onClick={() => onWriteUp(row.preset)}
            className="mt-1.5 -ml-2 inline-flex h-8 items-center gap-1 rounded-dash-sm px-2 text-[0.75rem] font-bold text-dash-ink hover:bg-dash-bg"
          >
            <PenLine size={13} strokeWidth={2.5} />
            Write this up
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * The country, with a pin where the desk has spoken and a ring where the
 * field has.
 */
function PinMap({ shapes, perState, selected, onSelect }) {
  if (!shapes?.states?.length) {
    return <p className="px-4 py-10 text-center text-[0.8125rem] text-dash-muted">The map is not available.</p>;
  }
  const top = Math.max(1, ...[...perState.values()].map((cell) => Math.max(cell.published, cell.field)));
  const r = (value) => 7 + 15 * Math.sqrt(value / top);

  return (
    <svg viewBox={`0 0 ${shapes.width} ${shapes.height}`} className="w-full" role="img" aria-label="Map of Nigeria with published updates and field reports by state">
      {shapes.states.map((shape) => {
        const cell = perState.get(shape.code);
        const active = selected === shape.code;
        return (
          <path
            key={shape.code}
            d={shape.d}
            onClick={() => onSelect(active ? null : shape.code)}
            fill={active ? "var(--color-dash-line)" : "var(--color-dash-bg)"}
            stroke={active ? "var(--color-dash-ink)" : "#ffffff"}
            strokeWidth={active ? 3 : 1.5}
            className={cn("cursor-pointer", selected && !active && "opacity-50")}
          >
            <title>
              {`${shape.name}: ${cell?.published ?? 0} published, ${cell?.field ?? 0} field report${cell?.field === 1 ? "" : "s"}`}
            </title>
          </path>
        );
      })}
      {shapes.states.map((shape) => {
        const cell = perState.get(shape.code);
        if (!cell) return null;
        const [x, y] = shape.at;
        return (
          <g key={`pin-${shape.code}`} className="pointer-events-none">
            {cell.field > 0 && (
              <circle cx={x} cy={y} r={r(cell.field) + 4} fill="none" stroke={cell.serious ? "#ef4444" : "#f59e0b"} strokeWidth={3} />
            )}
            {cell.published > 0 && (
              <>
                <circle cx={x} cy={y} r={r(cell.published)} fill="var(--color-dash-ink)" />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize={r(cell.published) * 1.05} fontWeight={700} className="font-mono">
                  {cell.published}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Where the field has spoken and the desk has not.
 *
 * The narrative gap, as a list: a state with serious reports and no update
 * is a state where somebody else is telling the story.
 */
function Silence({ perState, onSelect }) {
  const quiet = [...perState.entries()]
    .filter(([, cell]) => cell.serious > 0 && cell.published === 0)
    .sort((a, b) => b[1].serious - a[1].serious);
  if (!quiet.length) return null;
  return (
    <div className="border-t border-dash-line px-4 py-3">
      <p className="text-[0.625rem] font-bold tracking-[0.12em] text-red-700 uppercase">Serious reports, nothing published</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {quiet.map(([code, cell]) => (
          <li key={code}>
            <button
              type="button"
              onClick={() => onSelect(code)}
              className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[0.6875rem] font-bold text-red-700 hover:border-red-400"
            >
              <Send size={11} strokeWidth={2.5} />
              {STATE_BY_CODE[code]?.name ?? code} · {cell.serious}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
