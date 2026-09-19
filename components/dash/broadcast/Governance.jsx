"use client";

import { useMemo } from "react";
import { ShieldCheck } from "lucide-react";

import { Card, Empty, Badge } from "@/components/dash/DashCard";
import { clock, useDesk } from "./Queue";
import { Channels } from "./SocialDesk";
import { DUTIES, PLATFORMS, kindLabel } from "@/lib/broadcast";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Content governance: who passed what, and the record of it.
 */

/* ─────────────────────────────────────────────────── editorial approval ─── */

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
        <p className="mt-1.5 text-[0.8125rem] leading-snug text-dash-muted">
          Checked on the item, so it holds for every account, including the administrator.
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
          Accounts are issued from the administrator&rsquo;s console. This screen reads
          permissions; it does not grant them.
        </p>
      </Card>
    </div>
  );
}

/* ──────────────────────────────────────────────── platform connections ──── */

export function Platforms({ items }) {
  const { channels } = useDesk();
  const queued = useMemo(() => {
    const out = Object.fromEntries(PLATFORMS.map((row) => [row.id, 0]));
    for (const item of items) for (const id of item.platforms ?? []) if (id in out) out[id] += 1;
    return out;
  }, [items]);

  const relayReady = channels.find((row) => row.id === "relay")?.configured ?? false;
  const routeOf = (row) => {
    if (row.route === "direct") {
      const channel = channels.find((entry) => entry.id === row.id);
      return channel?.configured
        ? { tone: "good", text: "Posts directly" }
        : { tone: "warn", text: "Not set up" };
    }
    return relayReady ? { tone: "good", text: "Through your relay" } : { tone: "warn", text: "By hand" };
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
        <Card title="Platforms" subtitle="How a post reaches each one tonight">
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[34rem] border-collapse text-[0.875rem]">
              <thead>
                <tr className="border-b border-dash-line text-left">
                  <th className="pb-2 pr-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">Platform</th>
                  <th className="pb-2 pr-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">Route</th>
                  <th className="pb-2 pr-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">Carries</th>
                  <th className="pb-2 text-right text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">Aimed at it</th>
                </tr>
              </thead>
              <tbody>
                {PLATFORMS.map((row) => {
                  const route = routeOf(row);
                  return (
                    <tr key={row.id} className="border-b border-dash-line last:border-0">
                      <td className="py-2.5 pr-3 font-semibold text-dash-ink">{row.label}</td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={route.tone}>{route.text}</Badge>
                      </td>
                      <td className="py-2.5 pr-3 text-dash-muted">{row.carries}</td>
                      <td className="figure py-2.5 text-right text-dash-ink">{formatNumber(queued[row.id])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Channels />
      </div>

      <Card title="Setting a platform up" subtitle="Done once, by your administrator, in the deployment's settings">
        <ul className="grid gap-2 text-[0.8125rem] leading-snug text-dash-muted md:grid-cols-2">
          <li className="border-l-2 border-dash-line pl-3">
            <span className="font-bold text-dash-ink">Facebook, Instagram.</span> A Page, the linked
            Instagram account, and a Page token that can publish.
          </li>
          <li className="border-l-2 border-dash-line pl-3">
            <span className="font-bold text-dash-ink">X.</span> An app with write access, on a plan
            that allows posting, and its four keys.
          </li>
          <li className="border-l-2 border-dash-line pl-3">
            <span className="font-bold text-dash-ink">Threads.</span> The profile&rsquo;s user id and
            a long-lived token.
          </li>
          <li className="border-l-2 border-dash-line pl-3">
            <span className="font-bold text-dash-ink">Telegram.</span> A bot made an administrator of
            the channel, and the channel&rsquo;s name.
          </li>
          <li className="border-l-2 border-dash-line pl-3 md:col-span-2">
            <span className="font-bold text-dash-ink">Everywhere else.</span> One signed webhook into
            your own automation tool, which passes each post on.
          </li>
        </ul>
      </Card>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── health ───── */

