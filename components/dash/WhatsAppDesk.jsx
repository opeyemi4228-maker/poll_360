"use client";

import { useMemo, useState } from "react";
import {
  Camera,
  CheckCheck,
  ChevronRight,
  MapPin,
  Network,
  Image as ImageIcon,
  Lock,
  MessageSquare,
  Phone,
  ShieldCheck,
  ShieldQuestion,
  Users,
} from "lucide-react";

import TopShell from "./TopShell";
import LiveRefresh from "./LiveRefresh";
import { STEP_LABEL } from "@/lib/whatsapp-steps";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The WhatsApp desk.
 *
 * ── THREE QUESTIONS, IN THE ORDER A DESK ASKS THEM ─────────────────────────
 *   1. What is arriving right now?          the stream
 *   2. Who is stuck halfway through?        the open conversations
 *   3. Who is this, and can I trust them?   the roster
 *
 * The order matters. A desk with a hundred threads open does not want a list
 * of contacts, it wants the two people whose returns are jammed at step four.
 *
 * ── NO PHONE NUMBER IS ON THIS SCREEN ──────────────────────────────────────
 * Numbers are sealed in the database and never shaped out to the browser. The
 * desk sees a name and the last four digits, which is enough to recognise
 * somebody on a call and useless to anybody who photographs the screen. An
 * operator who genuinely needs the number asks for it, and that ask is
 * recorded.
 * ───────────────────────────────────────────────────────────────────────────
 */

const TAB_GROUPS = [
  {
    id: "live",
    label: "Live",
    tabs: [
      { value: "stream", label: "Messages" },
      { value: "open", label: "In progress" },
    ],
  },
  {
    id: "count",
    label: "The count",
    tabs: [
      { value: "units", label: "Polling units" },
      { value: "sheets", label: "Sheets read" },
      { value: "places", label: "Locations" },
    ],
  },
  {
    id: "people",
    label: "People",
    tabs: [
      { value: "contacts", label: "Numbers" },
      { value: "setup", label: "Connection" },
    ],
  },
];

const TABS = TAB_GROUPS.flatMap((group) => group.tabs.map((tab) => ({ ...tab, group: group.id })));

export default function WhatsAppDesk({
  user,
  summary,
  contacts,
  messages,
  open,
  canClaim,
  tree = null,
  unitCount = 0,
  reportedCount = 0,
  places = [],
  reads = [],
  readSummary = {},
}) {
  const [tab, setTab] = useState("stream");
  const [thread, setThread] = useState(null);

  const byContact = useMemo(() => new Map(contacts.map((row) => [row.id, row])), [contacts]);

  const threadMessages = useMemo(
    () => (thread ? messages.filter((row) => row.contactId === thread).reverse() : []),
    [messages, thread]
  );

  const hour = new Date().getHours();
  const greeting = `Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, ${user.name.split(" ")[0]}`;

  return (
    <TopShell
      user={user}
      tabs={TABS}
      tabGroups={TAB_GROUPS}
      active={tab}
      onTab={(value) => {
        setTab(value);
        setThread(null);
      }}
      greeting={greeting}
      subtitle={
        tab === "stream"
          ? `${formatNumber(summary.inbound ?? 0)} messages in from ${formatNumber(summary.contacts ?? 0)} numbers`
          : tab === "open"
            ? `${open.length} ${open.length === 1 ? "return" : "returns"} part way through`
            : tab === "contacts"
              ? `${formatNumber(summary.verified ?? 0)} of ${formatNumber(summary.contacts ?? 0)} numbers confirmed`
              : tab === "units"
                ? `${formatNumber(reportedCount)} of ${formatNumber(unitCount)} registered units have reported`
                : tab === "sheets"
                  ? `${formatNumber(readSummary.total ?? 0)} sheets read, ${formatNumber(readSummary.accepted ?? 0)} accepted`
                  : tab === "places"
                    ? `${places.length} ${places.length === 1 ? "coordinator" : "coordinators"} sending a position`
                    : "How the bot is wired up"
      }
      aside={
        <>
          <LiveRefresh seconds={12} label="Live" />
          <span className="flex items-center gap-2 rounded-full border border-dash-line bg-dash-card px-4 py-2.5 text-[0.8125rem] text-dash-muted">
            <Lock size={13} strokeWidth={2.5} aria-hidden="true" />
            Numbers sealed
          </span>
        </>
      }
    >
      <div className="space-y-3">
        {/* ------------------------------------------------------- the count */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Numbers talking", value: formatNumber(summary.contacts ?? 0), icon: Users, foot: `${formatNumber(summary.verified ?? 0)} confirmed` },
            { label: "Messages", value: formatNumber(summary.messages ?? 0), icon: MessageSquare, foot: `${formatNumber(summary.inbound ?? 0)} inbound` },
            { label: "Sheets sent", value: formatNumber(summary.images ?? 0), icon: ImageIcon, foot: "Photographs of result sheets" },
            { label: "Returns filed", value: formatNumber(summary.filed ?? 0), icon: CheckCheck, foot: `${open.length} still in progress` },
          ].map((card) => (
            <section key={card.label} className="rounded-dash border border-dash-line bg-dash-card p-4">
              <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                <card.icon size={13} strokeWidth={2.5} className="shrink-0" />
                {card.label}
              </p>
              <p className="figure mt-2 text-[1.75rem] leading-none font-bold tracking-[-0.03em] text-dash-ink tabular-nums">
                {card.value}
              </p>
              <p className="mt-1.5 text-[0.75rem] text-dash-muted">{card.foot}</p>
            </section>
          ))}
        </div>

        {/* ------------------------------------------------------ the stream */}
        {tab === "stream" && (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <section className="rounded-dash border border-dash-line bg-dash-card">
              <header className="flex items-center gap-2 border-b border-dash-line px-4 py-3">
                <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
                  Everything arriving
                </h2>
                <span className="figure ml-auto text-[0.6875rem] text-dash-muted">
                  newest first
                </span>
              </header>

              {messages.length === 0 ? (
                <Empty>
                  Nothing has arrived yet. Once the number is connected, every message from every
                  polling unit lands here.
                </Empty>
              ) : (
                <ul className="max-h-[34rem] divide-y divide-dash-line overflow-y-auto">
                  {messages.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setThread(row.contactId)}
                        className={cn(
                          "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-dash-bg",
                          thread === row.contactId && "bg-dash-bg"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold",
                            row.direction === "IN"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-dash-ink text-white"
                          )}
                        >
                          {row.direction === "IN" ? "IN" : "OUT"}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-[0.8125rem] font-bold text-dash-ink">
                              {row.name ?? "Unknown"}
                            </span>
                            <span className="figure text-[0.6875rem] text-dash-muted">
                              ends {row.tail}
                            </span>
                            {row.unitCode && (
                              <span className="figure rounded-full bg-dash-bg px-1.5 py-0.5 text-[0.625rem] text-dash-muted">
                                {row.unitCode}
                              </span>
                            )}
                            {row.contactStatus !== "VERIFIED" && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase text-amber-900">
                                unconfirmed
                              </span>
                            )}
                            <span className="figure ml-auto shrink-0 text-[0.625rem] text-dash-muted">
                              {row.at}
                            </span>
                          </span>

                          <span className="mt-0.5 block whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-dash-muted">
                            {row.kind === "image" ? "Sent a photograph of the result sheet" : row.body}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ------------------------------------------------- one thread */}
            <section className="flex min-h-0 flex-col rounded-dash border border-dash-line bg-dash-card">
              <header className="border-b border-dash-line px-4 py-3">
                <h2 className="font-display text-[0.875rem] font-extrabold text-dash-ink">
                  {thread ? (byContact.get(thread)?.name ?? "Conversation") : "Conversation"}
                </h2>
                <p className="text-[0.75rem] text-dash-muted">
                  {thread
                    ? `Ends ${byContact.get(thread)?.tail}. ${byContact.get(thread)?.messageCount ?? 0} messages.`
                    : "Pick a message to read the whole exchange"}
                </p>
              </header>

              {threadMessages.length === 0 ? (
                <Empty>Nothing selected.</Empty>
              ) : (
                <div className="max-h-[30rem] space-y-2 overflow-y-auto p-3">
                  {threadMessages.map((row) => (
                    <div
                      key={row.id}
                      className={cn("flex", row.direction === "IN" ? "justify-start" : "justify-end")}
                    >
                      <p
                        className={cn(
                          "max-w-[85%] rounded-dash px-3 py-2 text-[0.8125rem] leading-relaxed whitespace-pre-wrap",
                          row.direction === "IN"
                            ? "border border-dash-line bg-dash-bg text-dash-ink"
                            : "bg-dash-ink text-white"
                        )}
                      >
                        {row.kind === "image" ? "Photograph of the result sheet" : row.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ------------------------------------------------ in progress */}
        {tab === "open" && (
          <section className="rounded-dash border border-dash-line bg-dash-card">
            <header className="border-b border-dash-line px-4 py-3">
              <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
                Returns part way through
              </h2>
              <p className="text-[0.75rem] text-dash-muted">
                Somebody started filing and has not finished. These are the calls worth making.
              </p>
            </header>

            {open.length === 0 ? (
              <Empty>Nothing is half finished. Every conversation is either idle or filed.</Empty>
            ) : (
              <ul className="divide-y divide-dash-line">
                {open.map((row) => (
                  <li
                    key={row.contactId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
                  >
                    <span className="text-[0.8125rem] font-bold text-dash-ink">
                      {row.name ?? "Unknown"}
                    </span>
                    <span className="figure text-[0.6875rem] text-dash-muted">ends {row.tail}</span>
                    {row.draft?.unitCode && (
                      <span className="figure rounded-full bg-dash-bg px-2 py-0.5 text-[0.6875rem] text-dash-muted">
                        {row.draft.unitCode}
                      </span>
                    )}
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.625rem] font-bold text-amber-900">
                      {STEP_LABEL[row.step] ?? row.step}
                    </span>
                    {row.draft?.held && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[0.625rem] font-bold text-red-900">
                        waiting to be confirmed
                      </span>
                    )}
                    <span className="figure ml-auto text-[0.6875rem] text-dash-muted">
                      {row.at}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ---------------------------------------------------- the roster */}
        {tab === "contacts" && (
          <section className="rounded-dash border border-dash-line bg-dash-card">
            <header className="border-b border-dash-line px-4 py-3">
              <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
                Numbers we have heard from
              </h2>
              <p className="text-[0.75rem] text-dash-muted">
                A number counts for nothing until somebody ties it to a real agent. Until then its
                figures are held and never enter the count.
              </p>
            </header>

            {contacts.length === 0 ? (
              <Empty>No number has messaged the service yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-[0.8125rem]">
                  <thead>
                    <tr className="border-b border-dash-line text-left">
                      <th className="px-4 py-2 font-bold text-dash-muted">Who</th>
                      <th className="px-3 py-2 font-bold text-dash-muted">Number</th>
                      <th className="px-3 py-2 font-bold text-dash-muted">Polling unit</th>
                      <th className="px-3 py-2 text-right font-bold text-dash-muted">Messages</th>
                      <th className="px-4 py-2 font-bold text-dash-muted">Standing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dash-line">
                    {contacts.map((row) => (
                      <tr key={row.id} className="hover:bg-dash-bg">
                        <td className="px-4 py-2 font-semibold text-dash-ink">
                          {row.name ?? "Unknown"}
                        </td>
                        <td className="figure px-3 py-2 text-dash-muted">
                          <span className="inline-flex items-center gap-1.5">
                            <Lock size={11} strokeWidth={2.5} aria-hidden="true" />
                            ends {row.tail}
                          </span>
                        </td>
                        <td className="figure px-3 py-2 text-dash-ink">{row.unitCode ?? "not set"}</td>
                        <td className="figure px-3 py-2 text-right tabular-nums text-dash-ink">
                          {formatNumber(row.messageCount)}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase",
                              row.status === "VERIFIED"
                                ? "bg-emerald-50 text-emerald-800"
                                : row.status === "BLOCKED"
                                  ? "bg-red-100 text-red-900"
                                  : "bg-amber-100 text-amber-900"
                            )}
                          >
                            {row.status === "VERIFIED" ? (
                              <ShieldCheck size={11} strokeWidth={2.5} />
                            ) : (
                              <ShieldQuestion size={11} strokeWidth={2.5} />
                            )}
                            {row.status === "VERIFIED"
                              ? "confirmed"
                              : row.status === "BLOCKED"
                                ? "blocked"
                                : "unconfirmed"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="border-t border-dash-line px-4 py-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
              {canClaim
                ? "You can confirm a number against an account, which is what allows its figures to enter the count."
                : "Confirming a number against an account is the administrator's to do. This desk can read, and cannot change what is counted."}
            </p>
          </section>
        )}


        {/* ------------------------------------------------- the hierarchy */}
        {tab === "units" && (
          <section className="rounded-dash border border-dash-line bg-dash-card">
            <header className="flex flex-wrap items-center gap-2 border-b border-dash-line px-4 py-3">
              <Network size={15} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
              <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
                Nation, state, local government, ward, unit
              </h2>
              <p className="w-full text-[0.75rem] text-dash-muted sm:w-auto sm:flex-1">
                Units register themselves as their returns arrive
              </p>
            </header>

            {tree && tree.units > 0 && (
              <div className="flex items-center gap-2 border-b border-dash-line px-4 py-1.5 pl-[2.1rem]">
                <span className="min-w-0 flex-1" />
                <span className="w-24 shrink-0 text-right text-[0.5625rem] font-bold uppercase tracking-wide text-dash-muted">
                  Reported
                </span>
                <span className="hidden w-24 shrink-0 text-right text-[0.5625rem] font-bold uppercase tracking-wide text-dash-muted md:block">
                  Accredited
                </span>
                <span className="w-24 shrink-0 text-right text-[0.5625rem] font-bold uppercase tracking-wide text-dash-muted">
                  Votes
                </span>
              </div>
            )}

            {!tree || tree.units === 0 ? (
              <Empty>
                No polling unit has reported yet. The first return over WhatsApp registers its
                unit, and its ward, local government and state fill in behind it.
              </Empty>
            ) : (
              <div className="p-2">
                <Branch node={tree} depth={0} />
              </div>
            )}

            <p className="border-t border-dash-line px-4 py-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
              The tree is read off the polling unit code, which already carries the address:
              state, local government, ward, unit. Nothing is stored twice, so no level can
              disagree with the one below it.
            </p>
          </section>
        )}

        {/* ------------------------------------------------- sheets read */}
        {tab === "sheets" && (
          <section className="rounded-dash border border-dash-line bg-dash-card">
            <header className="flex flex-wrap items-center gap-2 border-b border-dash-line px-4 py-3">
              <Camera size={15} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
              <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
                What the reader made of the sheets
              </h2>
              <p className="w-full text-[0.75rem] text-dash-muted sm:w-auto sm:flex-1">
                Kept beside what the agent confirmed, so the difference is on the record
              </p>
            </header>

            {reads.length === 0 ? (
              <Empty>
                No sheet has been read yet. Set GOOGLE_VISION_API_KEY and a photographed result
                sheet is read automatically, with every figure proposed to the agent rather than
                filed.
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[46rem] border-collapse text-[0.8125rem]">
                  <thead>
                    <tr className="border-b border-dash-line text-left">
                      <th className="px-4 py-2 font-bold text-dash-muted">Unit</th>
                      <th className="px-3 py-2 font-bold text-dash-muted">Read</th>
                      <th className="px-3 py-2 font-bold text-dash-muted">Officer</th>
                      <th className="px-3 py-2 text-right font-bold text-dash-muted">Confidence</th>
                      <th className="px-4 py-2 font-bold text-dash-muted">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dash-line">
                    {reads.map((row) => {
                      const changed =
                        row.corrected &&
                        JSON.stringify(row.corrected.votes) !== JSON.stringify(row.parsed?.votes);
                      return (
                        <tr key={row.id} className="hover:bg-dash-bg">
                          <td className="figure px-4 py-2 font-bold text-dash-ink">
                            {row.unitCode ?? "unknown"}
                          </td>
                          <td className="figure px-3 py-2 text-dash-muted">
                            {row.parsed?.accredited ?? "?"} accredited ·{" "}
                            {(row.parsed?.votes ?? []).join(", ") || "no figures"}
                          </td>
                          <td className="px-3 py-2 text-dash-ink">{row.parsed?.repName ?? "not read"}</td>
                          <td className="figure px-3 py-2 text-right tabular-nums text-dash-ink">
                            {row.confidence == null ? "n/a" : `${Math.round(row.confidence * 100)}%`}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase",
                                changed
                                  ? "bg-amber-100 text-amber-900"
                                  : row.accepted
                                    ? "bg-emerald-50 text-emerald-800"
                                    : "bg-dash-bg text-dash-muted"
                              )}
                            >
                              {changed ? "agent corrected it" : row.accepted ? "accepted" : "proposed"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="border-t border-dash-line px-4 py-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
              Nothing here was filed by the reader. Every figure was proposed to the agent
              standing in front of the sheet and only counted once they confirmed it, because a
              reader confuses 3 and 8 on a creased form under a torch, and a count that trusted
              its own guess would be worse than no reading at all.
            </p>
          </section>
        )}

        {/* ---------------------------------------------------- locations */}
        {tab === "places" && (
          <section className="rounded-dash border border-dash-line bg-dash-card">
            <header className="flex flex-wrap items-center gap-2 border-b border-dash-line px-4 py-3">
              <MapPin size={15} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
              <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
                Where coordinators are
              </h2>
              <p className="w-full text-[0.75rem] text-dash-muted sm:w-auto sm:flex-1">
                Newest position from each phone, live as it arrives
              </p>
            </header>

            {places.length === 0 ? (
              <Empty>
                No coordinator has shared a location yet. In WhatsApp they attach a location and
                it lands here, and on the coordinator watch, within seconds.
              </Empty>
            ) : (
              <ul className="divide-y divide-dash-line">
                {places.map((row) => (
                  <li
                    key={row.contactId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
                  >
                    <span className="text-[0.8125rem] font-bold text-dash-ink">
                      {row.name ?? "Unknown"}
                    </span>
                    <span className="figure text-[0.6875rem] text-dash-muted">ends {row.tail}</span>
                    {row.unitCode && (
                      <span className="figure rounded-full bg-dash-bg px-2 py-0.5 text-[0.6875rem] text-dash-muted">
                        {row.unitCode}
                      </span>
                    )}
                    {row.label && (
                      <span className="text-[0.75rem] text-dash-muted">{row.label}</span>
                    )}
                    <span className="figure text-[0.75rem] text-dash-ink tabular-nums">
                      {Number(row.lat).toFixed(4)}, {Number(row.lon).toFixed(4)}
                    </span>
                    <span className="figure ml-auto text-[0.6875rem] text-dash-muted">{row.at}</span>
                  </li>
                ))}
              </ul>
            )}

            <p className="border-t border-dash-line px-4 py-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
              A position corroborates a filing and never authorises one. A phone fix drifts, and a
              booth does genuinely get moved across a compound, so distance is a reason to ring
              somebody rather than an accusation.
            </p>
          </section>
        )}

        {/* --------------------------------------------------- how it works */}
        {tab === "setup" && <Setup />}
      </div>
    </TopShell>
  );
}

/**
 * One level of the tree, and everything under it.
 *
 * ── OPEN AT THE TOP, CLOSED FURTHER DOWN ───────────────────────────────────
 * Nation, state and local government open by default; wards and units do not.
 * Expanding everything on a full night would render tens of thousands of rows
 * nobody asked for, and collapsing everything hides the one fact the screen
 * exists to show, which is how far the count has got.
 */
function Branch({ node, depth }) {
  const [open, setOpen] = useState(depth < 2);
  const kids = node.children ?? [];
  const share = node.units ? (node.reported / node.units) * 100 : 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => kids.length && setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center gap-2 rounded-dash-sm px-2 py-1.5 text-left transition-colors",
          kids.length ? "hover:bg-dash-bg" : "cursor-default"
        )}
        style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}
      >
        <ChevronRight
          size={13}
          strokeWidth={2.5}
          aria-hidden="true"
          className={cn(
            "shrink-0 transition-transform",
            kids.length ? "text-dash-muted" : "opacity-0",
            open && "rotate-90"
          )}
        />

        <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold text-dash-ink">
          {node.name}
        </span>

        {/* Coverage as a bar, because the useful question at every level is the
            same one: how much of this place has actually reported. */}
        <span className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-dash-bg sm:block">
          <span
            className="block h-full rounded-full bg-dash-ink"
            style={{ width: `${Math.min(100, share)}%` }}
          />
        </span>

        <span className="figure w-24 shrink-0 text-right text-[0.75rem] text-dash-muted tabular-nums">
          {formatNumber(node.reported)} of {formatNumber(node.units)}
        </span>

        <span className="figure hidden w-24 shrink-0 text-right text-[0.75rem] text-dash-muted tabular-nums md:block">
          {formatNumber(node.accredited)}
        </span>

        <span className="figure w-24 shrink-0 text-right text-[0.75rem] font-bold text-dash-ink tabular-nums">
          {formatNumber(node.total)}
        </span>
      </button>

      {open && kids.map((child) => <Branch key={child.key} node={child} depth={depth + 1} />)}
    </div>
  );
}

function Empty({ children }) {
  return (
    <p className="px-4 py-10 text-center text-[0.875rem] leading-relaxed text-dash-muted">
      {children}
    </p>
  );
}

/**
 * What has to be true for the channel to be live.
 *
 * On the screen rather than in a README, because the person who has to do this
 * is the person looking at this page, and a setup step nobody can find is a
 * setup step nobody does.
 */
function Setup() {
  const rows = [
    ["WHATSAPP_VERIFY_TOKEN", "Any phrase you choose. Meta echoes it back once to prove it reached the right server."],
    ["WHATSAPP_APP_SECRET", "From the Meta app. Every delivery is signed with it, and a delivery that does not match is refused before it is read."],
    ["WHATSAPP_TOKEN", "The access token the replies are sent with. Without it the bot still runs and its replies are held rather than sent."],
    ["WHATSAPP_PHONE_ID", "The number the service answers on."],
  ];

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <header className="border-b border-dash-line px-4 py-3">
          <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
            What the agent does
          </h2>
        </header>
        <ol className="divide-y divide-dash-line">
          {[
            ["Sends RESULT", "From the phone they already use. No app, no account, no password."],
            ["Answers four questions", "Polling unit, accredited voters, rejected ballots, then each party in turn."],
            ["Photographs the sheet", "The evidence arrives attached to the figures rather than separately."],
            ["Confirms", "The figures are read back before anything is filed, so nobody files a number they did not say."],
          ].map(([step, note], index) => (
            <li key={step} className="flex gap-3 px-4 py-3">
              <span className="figure mt-0.5 shrink-0 text-[0.6875rem] font-bold text-dash-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <span className="block text-[0.8125rem] font-bold text-dash-ink">{step}</span>
                <span className="block text-[0.75rem] leading-relaxed text-dash-muted">{note}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="border-t border-dash-line px-4 py-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
          The bot refuses a figure that cannot be true as it is typed, not at the end. More votes
          than ballots is caught on the party that broke it, while the agent is still looking at
          that line of the sheet.
        </p>
      </section>

      <section className="rounded-dash border border-dash-line bg-dash-card">
        <header className="flex items-center gap-2 border-b border-dash-line px-4 py-3">
          <Phone size={15} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
          <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
            What the server needs
          </h2>
        </header>
        <dl className="divide-y divide-dash-line">
          {rows.map(([key, note]) => (
            <div key={key} className="px-4 py-3">
              <dt className="figure text-[0.75rem] font-bold text-dash-ink">{key}</dt>
              <dd className="mt-0.5 text-[0.75rem] leading-relaxed text-dash-muted">{note}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-dash-line px-4 py-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
          Point Meta at <span className="figure">/api/whatsapp/webhook</span>. Messages and phone
          numbers are encrypted in the database, so a stolen copy of the file contains no readable
          numbers and no readable conversations.
        </p>
      </section>
    </div>
  );
}
