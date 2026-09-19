"use client";

import { useState } from "react";
import { Clock } from "lucide-react";

import { Card, Empty, Badge } from "@/components/dash/DashCard";
import { Composer, Field, ItemCard, Queue, clock, inputClass, useDesk } from "./Queue";
import { KINDS, kindLabel } from "@/lib/broadcast";
import { cn } from "@/lib/utils";

/**
 * Master control: the queue an operator actually drives.
 *
 * ── WHAT IS ON AIR IS WHAT SOMEBODY PUT ON AIR ─────────────────────────────
 * This screen never infers the output from the clock. A running order says
 * what was meant to happen; the ON_AIR state says what is happening. Both are
 * drawn, and where they disagree the disagreement is the headline, because on
 * a long night that gap is the single most useful thing an operator can be
 * shown — every gallery runs late, and the failure that matters is a strap
 * still up twenty minutes after the story moved on.
 */
export function Playout({ items, order, onGo }) {
  const { may } = useDesk();

  const cleared = items.filter((item) => item.state === "CLEARED");
  const onAir = items.filter((item) => item.state === "ON_AIR");

  /* Grouped by what it is, because an operator reaching for a strap is not
     scanning a list that also has programmes and social posts in it. */
  const groups = Object.keys(KINDS)
    .map((kind) => ({ kind, label: kindLabel(kind), items: cleared.filter((item) => item.kind === kind) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <Slab label="Now" item={order.now} live />
        <Slab label="Next" item={order.next} />
        <Slab label="Up next" item={order.later[0]} />
      </div>

      {order.overdue.length > 0 && (
        <p className="rounded-dash border tone-warn px-4 py-3 text-[0.875rem] leading-relaxed ink-warn">
          <span className="font-bold">The running order has drifted.</span>{" "}
          {order.overdue.length === 1 ? "One slot is" : `${order.overdue.length} slots are`} past
          their start time with nobody having taken them to air. That is not an error — it is what
          this screen is for.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── OUTPUT ─────────────────────────────────────────────────────── */}
        <Card
          title="On air"
          subtitle="Taking something off is one press, and it is always available"
        >
          <Queue
            items={onAir}
            empty="Nothing is on air. Cleared items are on the right, ready to take."
          />
        </Card>

        {/* ── THE SHELF ──────────────────────────────────────────────────── */}
        <Card
          title="Cleared and ready"
          subtitle={
            may.air
              ? "Passed by an editor. One press puts it out."
              : "Passed by an editor. This account cannot take items to air."
          }
        >
          {groups.length === 0 ? (
            <Empty>
              Nothing is cleared. Items appear here once an editor who did not write them has
              passed them.
            </Empty>
          ) : (
            <div className="space-y-5">
              {groups.map((group) => (
                <section key={group.kind}>
                  <h3 className="mb-2 text-[0.6875rem] font-bold tracking-[0.12em] text-dash-muted uppercase">
                    {group.label}
                  </h3>
                  <div className="space-y-2.5">
                    {group.items.map((item) => (
                      <ItemCard key={item.id} item={item} compact />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </Card>
      </div>

    </div>
  );
}

function Slab({ label, item, live = false }) {
  return (
    <div
      className={cn(
        "rounded-dash border px-5 py-4",
        live && item ? "border-red-600 bg-red-600 text-white" : "border-dash-line bg-dash-card"
      )}
    >
      <p
        className={cn(
          "flex items-center gap-2 text-[0.625rem] font-bold tracking-[0.18em] uppercase",
          live && item ? "text-white/70" : "text-dash-muted"
        )}
      >
        {live && item && <span className="size-1.5 animate-pulse rounded-full bg-white" />}
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-display text-[1.125rem] leading-tight font-extrabold tracking-[-0.02em]",
          live && item ? "text-white" : "text-dash-ink"
        )}
      >
        {item ? item.title : "Nothing scheduled"}
      </p>
      <p className={cn("mt-1 text-[0.8125rem]", live && item ? "text-white/80" : "text-dash-muted")}>
        {item?.scheduledFor ? clock(item.scheduledFor) : "—"}
        {item?.body ? ` · ${item.body}` : ""}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── scheduler ──── */

/**
 * The night, laid out in advance.
 *
 * ── A SCHEDULE IS A DRAFT OF AN INTENTION ──────────────────────────────────
 * Every slot goes through the same clearance as a strap, which looks like
 * bureaucracy for a programme title and is not: the running order is what the
 * gallery reads at 3am, and a slot that appeared in it because one person
 * typed it is a slot nobody has agreed to. It costs one press and it means the
 * order on the wall is the order the desk signed off.
 */
export function Scheduler({ items }) {
  const [title, setTitle] = useState("");
  const [at, setAt] = useState("");
  const [note, setNote] = useState("");

  const programmes = items
    .filter((item) => item.kind === "PROGRAMME")
    .sort((a, b) => (a.scheduledFor ? new Date(a.scheduledFor) : 0) - (b.scheduledFor ? new Date(b.scheduledFor) : 0));

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <Card title="Add a slot" subtitle="Programmes, result windows, breaking windows, streams">
        <Composer
          kind="PROGRAMME"
          title="Save the slot"
          disabled={!title.trim() || !at}
          values={() => ({
            title: title.trim(),
            body: note.trim() || null,
            scheduledFor: at ? new Date(at).toISOString() : null,
          })}
          onDrafted={() => {
            setTitle("");
            setNote("");
          }}
        >
          <Field label="What it is">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Results Special"
              className={inputClass}
            />
          </Field>
          <Field label="When it starts" hint="Your own clock. The running order shows the same.">
            <input
              type="datetime-local"
              value={at}
              onChange={(event) => setAt(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Anything the gallery needs" hint="Optional.">
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Two-way with Kano at the top"
              className={inputClass}
            />
          </Field>
        </Composer>
      </Card>

      <Card title="The night" subtitle="Every slot, in time order, with where it has got to">
        {programmes.length === 0 ? (
          <Empty>
            Nothing is scheduled. A night with no running order is a night run from memory.
          </Empty>
        ) : (
          <ol className="space-y-3">
            {programmes.map((item) => (
              <li key={item.id} className="flex gap-4">
                <span className="figure w-14 shrink-0 pt-4 text-[0.9375rem] font-bold text-dash-ink">
                  {item.scheduledFor ? clock(item.scheduledFor) : "—:—"}
                </span>
                <div className="min-w-0 flex-1">
                  <ItemCard item={item} compact />
                </div>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-4 flex items-start gap-2 border-t border-dash-line pt-4 text-[0.8125rem] leading-relaxed text-dash-muted">
          <Clock size={15} strokeWidth={2.25} className="mt-0.5 shrink-0" />
          Times follow this browser&rsquo;s own timezone.
        </p>
      </Card>
    </div>
  );
}

/** A small state badge, for lists that are not full cards. */
export function StateChip({ item }) {
  return <Badge tone={item.state === "ON_AIR" ? "ink" : "neutral"}>{item.state.toLowerCase()}</Badge>;
}
