"use client";

import { useMemo, useState } from "react";
import {
  CheckCheck,
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
    id: "people",
    label: "People",
    tabs: [
      { value: "contacts", label: "Numbers" },
      { value: "setup", label: "Connection" },
    ],
  },
];

const TABS = TAB_GROUPS.flatMap((group) => group.tabs.map((tab) => ({ ...tab, group: group.id })));

export default function WhatsAppDesk({ user, summary, contacts, messages, open, canClaim }) {
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

        {/* --------------------------------------------------- how it works */}
        {tab === "setup" && <Setup />}
      </div>
    </TopShell>
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
