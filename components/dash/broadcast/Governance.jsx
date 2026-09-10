"use client";

import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Card, Empty, Badge } from "@/components/dash/DashCard";
import { ItemCard, JourneyBar, Queue, clock, useDesk } from "./Queue";
import { DUTIES, PLATFORMS, SPINE, kindLabel } from "@/lib/broadcast";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Content governance: who passed what, and the record of it.
 */

/* ─────────────────────────────────────────────────── editorial approval ─── */

/**
 * Everything waiting on an editor, in one place.
 *
 * ── ONE QUEUE FOR ELEVEN KINDS OF THING, ON PURPOSE ────────────────────────
 * A strap, a map, a social post, a programme and a clearance are cleared by
 * the same act — a person who did not write it deciding whether it may go out
 * — so they queue together. Eleven separate approval screens would mean the
 * quiet ones never get looked at, and the quiet one is always the clearance.
 */
export function Approvals({ items, load }) {
  const { user, may } = useDesk();
  const [kind, setKind] = useState(null);

  const waiting = load.review;
  const mine = waiting.filter((item) => item.createdBy === user?.id);
  const theirs = waiting.filter((item) => item.createdBy !== user?.id);

  const kinds = useMemo(() => {
    const out = new Map();
    for (const item of waiting) out.set(item.kind, (out.get(item.kind) ?? 0) + 1);
    return [...out.entries()].map(([id, count]) => ({ id, count }));
  }, [waiting]);

  const shown = kind ? theirs.filter((item) => item.kind === kind) : theirs;

  return (
    <div className="space-y-4">
      <Card title="The journey" subtitle="Where everything on this desk is sitting">
        <JourneyBar items={items} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card
          title={may.clear ? "Waiting on you" : "Waiting on an editor"}
          subtitle={
            may.clear
              ? "Written by somebody else, which is what makes clearing it a check"
              : "This account cannot clear. It can see what is queued."
          }
          action={
            kinds.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setKind(null)}
                  aria-pressed={kind === null}
                  className={chip(kind === null)}
                >
                  All
                </button>
                {kinds.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setKind(row.id)}
                    aria-pressed={kind === row.id}
                    className={chip(kind === row.id)}
                  >
                    {kindLabel(row.id)} {row.count}
                  </button>
                ))}
              </div>
            )
          }
        >
          <Queue
            items={shown}
            empty={
              waiting.length === 0
                ? "Nothing is waiting for clearance."
                : "Everything waiting was written by you, and you cannot clear your own work."
            }
          />
        </Card>

        <div className="space-y-4">
          {mine.length > 0 && (
            <Card title="Yours, with somebody else" subtitle="Submitted and waiting on another pair of eyes">
              <ul className="space-y-2">
                {mine.map((item) => (
                  <li key={item.id} className="rounded-dash-sm border border-dash-line px-3 py-2.5">
                    <p className="flex items-center gap-2">
                      <Badge tone="warn">{kindLabel(item.kind)}</Badge>
                      <span className="text-[0.75rem] text-dash-muted">{clock(item.createdAt)}</span>
                    </p>
                    <p className="mt-1.5 text-[0.875rem] leading-snug font-semibold text-dash-ink">
                      {item.title}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Refused tonight" subtitle="Kept with the reason, never deleted">
            {load.rejected.length === 0 ? (
              <Empty>Nothing has been refused.</Empty>
            ) : (
              <div className="space-y-3">
                {load.rejected.slice(0, 6).map((item) => (
                  <ItemCard key={item.id} item={item} compact />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

const chip = (on) =>
  cn(
    "h-8 rounded-dash-sm border px-2.5 text-[0.6875rem] font-bold tracking-[0.06em] uppercase transition-colors",
    on ? "border-dash-ink bg-dash-ink text-white" : "border-dash-line text-dash-muted hover:border-dash-ink"
  );

/* ────────────────────────────────────────────────────────────── audit ───── */

/**
 * What happened, in order.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  BUILT FROM TWO LOGS, BECAUSE ONE OF THEM CAN BE ARGUED WITH
 *
 *  The items themselves carry their own history — drafted by, cleared by,
 *  aired at — and that is what the desk reads. The append-only audit table is
 *  what an inquiry reads: it records every transition as it happened, it has
 *  no update path and no delete path, and it survives an item being discarded.
 *
 *  Both are shown, interleaved, because the question somebody actually asks at
 *  2am — "how did that figure get on air" — is answered by the two together:
 *  the item says what it was, the log says who moved it and when.
 * ══════════════════════════════════════════════════════════════════════════
 */
export function Audit({ items, audit }) {
  /* One timeline. Item stamps and log rows are different shapes, so they are
     normalised here rather than each rendered by its own branch — a timeline
     drawn twice is a timeline that will one day be sorted twice, differently. */
  const events = useMemo(() => {
    const rows = [];

    for (const item of items) {
      if (item.createdAt)
        rows.push({
          at: new Date(item.createdAt),
          who: item.createdName,
          what: `${kindLabel(item.kind)} drafted`,
          detail: item.title,
          tone: "neutral",
        });
      if (item.clearedAt)
        rows.push({
          at: new Date(item.clearedAt),
          who: item.clearedName,
          what: item.state === "REJECTED" ? `${kindLabel(item.kind)} refused` : `${kindLabel(item.kind)} cleared`,
          detail: item.note ? `${item.title} — ${item.note}` : item.title,
          tone: item.state === "REJECTED" ? "alert" : "good",
        });
      if (item.airedAt)
        rows.push({
          at: new Date(item.airedAt),
          who: null,
          what: `${kindLabel(item.kind)} on air`,
          detail: item.title,
          tone: "ink",
        });
      if (item.endedAt)
        rows.push({
          at: new Date(item.endedAt),
          who: null,
          what: `${kindLabel(item.kind)} off air`,
          detail: item.title,
          tone: "neutral",
        });
    }

    for (const row of audit) {
      rows.push({
        at: new Date(row.createdAt),
        who: row.actorName,
        what: String(row.action ?? "").replace(/[:_]/g, " "),
        detail: row.meta?.title ?? row.subject ?? null,
        tone: "log",
      });
    }

    return rows
      .filter((row) => !Number.isNaN(row.at.getTime()))
      .sort((a, b) => b.at - a.at)
      .slice(0, 120);
  }, [items, audit]);

  return (
    <div className="space-y-4">
      <Card title="Tonight, in order" subtitle="The desk's own stamps and the append-only log, interleaved">
        {events.length === 0 ? (
          <Empty>Nothing has happened on this desk yet.</Empty>
        ) : (
          <ol className="space-y-0">
            {events.map((row, index) => (
              <li
                key={`${row.at.getTime()}-${index}`}
                className="flex gap-4 border-b border-dash-line py-2.5 last:border-0"
              >
                <span className="figure w-12 shrink-0 text-[0.8125rem] font-bold text-dash-ink">
                  {clock(row.at)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "text-[0.875rem] font-semibold",
                        row.tone === "alert" ? "text-red-700" : "text-dash-ink"
                      )}
                    >
                      {row.what}
                    </span>
                    {row.who && <span className="text-[0.8125rem] text-dash-muted">by {row.who}</span>}
                    {row.tone === "log" && <Badge>log</Badge>}
                  </span>
                  {row.detail && (
                    <span className="mt-0.5 block text-[0.8125rem] leading-snug text-dash-muted">
                      {row.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title="What is recorded, and what cannot be undone">
        <p className="text-[0.875rem] leading-relaxed text-dash-muted">
          Every draft, submission, clearance, refusal and take-to-air is written to an append-only
          table that has no update path and no delete path in this product — the same table the
          count itself is logged to. A draft can be discarded; nothing that has been through an
          editor ever is. A refused strap is kept with its reason, and a strap that went out is
          kept because it went out.
        </p>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── team ───── */

/**
 * Who can do what on this desk.
 *
 * ── TWELVE DUTIES, THREE GRANTS, AND ONE RULE ──────────────────────────────
 * A newsroom has a dozen job titles; this product has a permission table.
 * Inventing a role per title would double what every future screen has to be
 * audited against and grant the same three capabilities twelve times over.
 *
 * The separation that actually protects the output is not between titles. It
 * is between people, and it is enforced on the item: nobody clears what they
 * wrote, whatever they hold, including the administrator.
 */
export function Team({ role, capabilities }) {
  const held = new Set(capabilities.map((row) => row.id));

  return (
    <div className="space-y-4">
      <Card title="The rule this desk runs on">
        <p className="font-display text-[1.125rem] leading-snug font-extrabold tracking-[-0.02em] text-dash-ink">
          Nobody clears their own work.
        </p>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-dash-muted">
          It is checked on the item rather than on the role, so it holds however the accounts are
          configured and it holds for the super administrator — who is, on any long night, the
          person most likely to be signed in when it is late and there is nobody else about. The
          same rule the count already lives under: whoever verifies a return is never the person
          who filed it.
        </p>
      </Card>

      <Card title="Duties" subtitle={`Mapped onto what this account (${role}) actually holds`}>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[36rem] border-collapse text-[0.875rem]">
            <thead>
              <tr className="border-b border-dash-line text-left">
                <th className="pb-2 pr-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                  Duty
                </th>
                <th className="pb-2 pr-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                  What it does
                </th>
                <th className="pb-2 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                  Needs
                </th>
              </tr>
            </thead>
            <tbody>
              {DUTIES.map((duty) => (
                <tr key={duty.id} className="border-b border-dash-line last:border-0">
                  <td className="py-2.5 pr-3 font-semibold text-dash-ink">{duty.label}</td>
                  <td className="py-2.5 pr-3 text-dash-muted">{duty.does}</td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <code className="rounded-dash-sm bg-dash-bg px-1.5 py-0.5 font-mono text-[0.75rem] text-dash-ink">
                        {duty.capability}
                      </code>
                      {held.has(duty.capability) ? (
                        <Badge tone="good">held</Badge>
                      ) : (
                        <Badge>not held</Badge>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="This account" subtitle="Read from the same table the guard consults">
        {capabilities.length === 0 ? (
          <Empty>This account holds nothing on this desk.</Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {capabilities.map((row) => (
              <li key={row.id} className="flex items-start gap-2 text-[0.875rem]">
                <ShieldCheck size={15} strokeWidth={2.5} className="mt-0.5 shrink-0 text-dash-muted" />
                <span className="text-dash-ink">{row.label}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 border-t border-dash-line pt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
          Accounts are issued from the administrator&rsquo;s console, one at a time, and a
          broadcast account can be narrowed to one contest and one piece of the country when it is
          issued. This screen reads permissions; it does not grant them.
        </p>
      </Card>
    </div>
  );
}

/* ──────────────────────────────────────────────── platform connections ──── */

export function Platforms({ items }) {
  const queued = useMemo(() => {
    const out = Object.fromEntries(PLATFORMS.map((row) => [row.id, 0]));
    for (const item of items) for (const id of item.platforms ?? []) if (id in out) out[id] += 1;
    return out;
  }, [items]);

  return (
    <div className="space-y-4">
      <Card title="Connections" subtitle="One fact per row, and none of them is a green light">
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[40rem] border-collapse text-[0.875rem]">
            <thead>
              <tr className="border-b border-dash-line text-left">
                <th className="pb-2 pr-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                  Platform
                </th>
                <th className="pb-2 pr-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                  State
                </th>
                <th className="pb-2 pr-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                  Carries
                </th>
                <th className="pb-2 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                  What it would take
                </th>
              </tr>
            </thead>
            <tbody>
              {PLATFORMS.map((row) => (
                <tr key={row.id} className="border-b border-dash-line last:border-0">
                  <td className="py-2.5 pr-3">
                    <span className="font-semibold text-dash-ink">{row.label}</span>
                    {queued[row.id] > 0 && (
                      <span className="ml-2 text-[0.75rem] text-dash-muted">
                        {formatNumber(queued[row.id])} queued
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge>not connected</Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-dash-muted">{row.carries}</td>
                  <td className="py-2.5 text-dash-muted">{row.needs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Why nothing here is connected, and why that is a decision">
        <p className="text-[0.875rem] leading-relaxed text-dash-muted">
          A publishing token is the ability to say something in the organisation&rsquo;s name with
          nobody watching. On an ordinary product that is a convenience; on a night when a wrong
          figure cannot be recalled it is the single largest risk this desk carries, and it is a
          risk taken on behalf of people who are not in the room.
        </p>
        <p className="mt-3 text-[0.875rem] leading-relaxed text-dash-muted">
          So the desk stops at the file. Every screen here composes, adapts, clears and hands over
          a picture and a caption, and a person presses send. If that changes, it should change
          deliberately, with the tokens held somewhere a person can revoke them in one action, and
          with the audit trail on this desk recording the send the way it records everything else.
        </p>
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
          The one channel that <em>is</em> configured in this product is WhatsApp, and it is
          configured for the field: agents file returns to it. That is a different grant from
          broadcasting to an audience, and it is deliberately not reused here.
        </p>
      </Card>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── health ───── */

/**
 * Whether the desk itself is working.
 *
 * Everything drawn here is measured from what the page already fetched. There
 * is no probe, no ping and no uptime figure, because a health screen that
 * invents its own reassurance is the most dangerous screen in a product: it is
 * the one somebody checks before deciding not to investigate.
 */
export function Health({ project, race, load, counts, ground }) {
  const rows = [
    {
      label: "Election project",
      value: project ? project.title : "None open",
      tone: project ? "good" : "alert",
      why: project
        ? project.isDemo
          ? "A demonstration replay. Nothing on this desk is a live count."
          : "A live project. Returns filed against it enter this desk."
        : "No project is open, so every figure on this desk is empty for that reason.",
    },
    {
      label: "Contest",
      value: race,
      tone: "neutral",
      why: "A night is several counts. Everything on this desk is this one.",
    },
    {
      label: "Ground",
      value: ground,
      tone: "neutral",
      why: "What this account may read. Every figure is narrowed to it before it is summed.",
    },
    {
      label: "Returns in hand",
      value: formatNumber(counts.filed),
      tone: counts.filed > 0 ? "good" : "warn",
      why: "Rows this page fetched. Not a probe — it is the data the screens are drawn from.",
    },
    {
      label: "Desk queue",
      value: formatNumber(load.total),
      tone: "neutral",
      why: `${load.review.length} waiting on an editor, ${load.onAir.length} on air.`,
    },
    {
      label: "Graphics renderer",
      value: "In this repository",
      tone: "good",
      why: "The count renders to a PNG at /api/graphic. Every other template is a design.",
    },
    {
      label: "Publishing",
      value: "Not connected",
      tone: "warn",
      why: "No platform token is held. The desk hands over a file; a person sends it.",
    },
    {
      label: "Stream ingest",
      value: "Not connected",
      tone: "warn",
      why: "No encoder or ingest endpoint. Stream health is not drawn rather than drawn empty.",
    },
  ];

  return (
    <div className="space-y-4">
      <Card title="What this desk is standing on" subtitle="Measured from this page, not from a probe">
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {rows.map((row) => (
            <li key={row.label} className="rounded-dash-sm border border-dash-line px-3.5 py-3">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                  {row.label}
                </span>
                <Badge tone={row.tone}>{row.tone === "good" ? "ready" : row.tone === "alert" ? "missing" : "note"}</Badge>
              </p>
              <p className="mt-1.5 text-[0.9375rem] font-bold text-dash-ink">{row.value}</p>
              <p className="mt-1 text-[0.75rem] leading-snug text-dash-muted">{row.why}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Live data → verify → analyse → create → approve → broadcast → distribute → measure">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {SPINE.map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true" className="text-dash-muted">→</span>}
              <span
                className={cn(
                  "rounded-dash-sm border px-2.5 py-1.5 text-[0.75rem] font-bold tracking-[0.04em] uppercase",
                  index >= 6
                    ? "border-dash-line bg-dash-bg text-dash-muted"
                    : "border-dash-ink bg-dash-ink text-white"
                )}
              >
                {step}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[0.875rem] leading-relaxed text-dash-muted">
          The first six are in this product and run against the count itself: a verified return
          becomes a cleared figure, a rendered frame, a strap and a post without anybody retyping a
          number. The last two are the ones that need somebody else&rsquo;s API, and they are drawn
          in grey rather than claimed.
        </p>
      </Card>
    </div>
  );
}
