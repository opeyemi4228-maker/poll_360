"use client";

import { useMemo, useState } from "react";
import { CheckSquare, Clock, Loader2, MapPin, Radio, RotateCw, Search, Send, Square, Undo2 } from "lucide-react";

import { Empty } from "@/components/dash/DashCard";
import { Said, useAction, useDesk } from "./Queue";
import { pressMany, resendPost } from "@/app/broadcast/actions";
import { DELIVERY, PLATFORMS, kindLabel, platformLabel } from "@/lib/broadcast";
import { stampFor } from "@/lib/stamp";
import { cn } from "@/lib/utils";

/**
 * Every post and on-screen item tonight, and the one button that moves each.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE BUTTON, ALWAYS THE NEXT STEP
 *
 *  Under pressure people do not read, they recognise and press. So each item
 *  is a picture — the card itself, the thing they will recognise — with its
 *  state in colour and in words, and exactly one strong button that does the
 *  next thing: send it to an editor, approve it and put it live, put it live,
 *  resend where a platform failed, or withdraw it. There is never a choice of
 *  four equal buttons to weigh at 11pm.
 *
 *  And because a results night is a hundred of these, they can be filtered to
 *  the ones that matter and ticked, and one press sends every ticked one as
 *  far as the person pressing may take it. The rule that a second person
 *  approves is kept item by item — see `pressMany` in app/broadcast/actions.js.
 * ══════════════════════════════════════════════════════════════════════════
 */

const TABS = [
  { id: "all", label: "All" },
  { id: "drafts", label: "Drafts" },
  { id: "waiting", label: "Waiting" },
  { id: "ready", label: "Ready" },
  { id: "live", label: "Live" },
  { id: "problems", label: "Problems" },
  { id: "ended", label: "Withdrawn" },
];

const LEVELS = [
  { id: "", label: "Every level" },
  { id: "nation", label: "Nationwide" },
  { id: "state", label: "State" },
  { id: "lga", label: "LGA" },
  { id: "ward", label: "Ward" },
  { id: "unit", label: "Polling unit" },
];

/* What each state looks like, and says. */
const STATUS = {
  DRAFT: { label: "Draft", tone: "bg-dash-bg text-dash-muted border-dash-line" },
  REJECTED: { label: "Sent back", tone: "bg-red-50 text-red-700 border-red-200" },
  REVIEW: { label: "Waiting for editor", tone: "tone-warn border-[color-mix(in_oklab,var(--color-flagged)_40%,#fff)]" },
  CLEARED: { label: "Ready to go live", tone: "tone-ok border-[color-mix(in_oklab,var(--color-verified)_40%,#fff)]" },
  ON_AIR: { label: "Live", tone: "bg-red-600 text-white border-red-600" },
  OFF_AIR: { label: "Withdrawn", tone: "bg-dash-bg text-dash-muted border-dash-line" },
};

export default function PublishingList({ items = [] }) {
  const { user, may, deliveries } = useDesk();
  const { pending, said, run } = useAction();

  const [tab, setTab] = useState("all");
  const [kind, setKind] = useState("posts");
  const [level, setLevel] = useState("");
  const [platform, setPlatform] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(() => new Set());

  const failed = (item) => Object.values(deliveries[item.id] ?? {}).some((row) => row.status === "FAILED");
  const inTab = (item, id) =>
    id === "all" ||
    (id === "drafts" && (item.state === "DRAFT" || item.state === "REJECTED")) ||
    (id === "waiting" && item.state === "REVIEW") ||
    (id === "ready" && item.state === "CLEARED") ||
    (id === "live" && item.state === "ON_AIR") ||
    (id === "problems" && ((item.state === "ON_AIR" && failed(item)) || item.state === "REJECTED")) ||
    (id === "ended" && item.state === "OFF_AIR");

  /* Everything but the tab, so the tab counts answer "how many would I see". */
  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase();
    return items.filter((item) => {
      if (kind === "posts" && item.kind !== "SOCIAL") return false;
      if (kind === "screen" && item.kind === "SOCIAL") return false;
      if (["CLEARANCE", "PROGRAMME", "CLAIM"].includes(item.kind)) return false;
      if (level && (item.payload?.level ?? "nation") !== level) return false;
      if (platform && !(item.platforms ?? []).includes(platform)) return false;
      if (words && !`${item.title} ${item.body ?? ""} ${item.payload?.place?.name ?? ""}`.toLowerCase().includes(words)) return false;
      return true;
    });
  }, [items, kind, level, platform, query]);

  const shown = filtered
    .filter((item) => inTab(item, tab))
    .sort((a, b) => new Date(b.updatedAt ?? b.createdAt) - new Date(a.updatedAt ?? a.createdAt));

  const toggle = (id) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const chosen = shown.filter((item) => picked.has(item.id));
  const everyShownPicked = shown.length > 0 && chosen.length === shown.length;

  const press = (ids, action = "live") =>
    run(() => pressMany({ ids, action }), { onDone: () => setPicked(new Set()) });

  return (
    <section className="rounded-dash border border-dash-line bg-dash-card" aria-label="Publishing list">
      {/* ─────────────────────────────────────────────────────── the head */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-dash-line px-5 pt-4 pb-3">
        <div>
          <h2 className="text-[1rem] font-extrabold tracking-[-0.01em] text-dash-ink">Publishing</h2>
          <p className="text-[0.8125rem] text-dash-muted">
            Tick what you want out, then press Go live. Each card&rsquo;s own button does its next step.
          </p>
        </div>
        <div className="flex rounded-dash-sm border border-dash-line p-0.5" role="radiogroup" aria-label="What to list">
          {[
            ["posts", "Social posts"],
            ["screen", "On screen"],
            ["both", "Both"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={kind === id}
              onClick={() => setKind(id)}
              className={cn(
                "h-8 rounded-[6px] px-3 text-[0.75rem] font-bold",
                kind === id ? "bg-dash-ink text-white" : "text-dash-muted hover:text-dash-ink"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* ──────────────────────────────────────────────── tabs and filters */}
      <div className="flex flex-col gap-3 border-b border-dash-line px-5 py-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Status">
          {TABS.map((row) => {
            const count = filtered.filter((item) => inTab(item, row.id)).length;
            const alarm = row.id === "problems" && count > 0;
            return (
              <button
                key={row.id}
                type="button"
                role="tab"
                aria-selected={tab === row.id}
                onClick={() => setTab(row.id)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[0.8125rem] font-bold transition-colors",
                  tab === row.id
                    ? "border-dash-ink bg-dash-ink text-white"
                    : alarm
                      ? "border-red-200 bg-red-50 text-red-700 hover:border-red-400"
                      : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                )}
              >
                {row.label}
                <span
                  className={cn(
                    "figure min-w-5 rounded-full px-1.5 text-center text-[0.6875rem]",
                    tab === row.id ? "bg-white/20" : alarm ? "bg-red-600 text-white" : "bg-dash-bg"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-56 flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-dash-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by place or words"
              aria-label="Search posts"
              className="h-9 w-full rounded-dash-sm border border-dash-line bg-dash-card pr-3 pl-9 text-[0.8125rem] text-dash-ink"
            />
          </label>
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            aria-label="Level"
            className="h-9 rounded-dash-sm border border-dash-line bg-dash-card px-2.5 text-[0.8125rem] text-dash-ink"
          >
            {LEVELS.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
            aria-label="Platform"
            className="h-9 rounded-dash-sm border border-dash-line bg-dash-card px-2.5 text-[0.8125rem] text-dash-ink"
          >
            <option value="">Every platform</option>
            {PLATFORMS.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
          {shown.length > 0 && may.draft && (
            <button
              type="button"
              onClick={() => setPicked(everyShownPicked ? new Set() : new Set(shown.map((item) => item.id)))}
              className="inline-flex h-9 items-center gap-1.5 rounded-dash-sm border border-dash-line px-3 text-[0.75rem] font-bold text-dash-ink hover:border-dash-ink"
            >
              {everyShownPicked ? <CheckSquare size={15} /> : <Square size={15} />}
              {everyShownPicked ? "Untick all" : `Tick all ${shown.length}`}
            </button>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────── the cards */}
      <div className="px-5 py-4">
        {shown.length === 0 ? (
          <Empty>
            {items.length === 0
              ? "Nothing written yet. Write an update above and it appears here."
              : "Nothing matches. Try another tab or clear the filters."}
          </Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {shown.map((item) => (
              <Tile
                key={item.id}
                item={item}
                picked={picked.has(item.id)}
                onPick={() => toggle(item.id)}
                mine={item.createdBy === user?.id}
                done={deliveries[item.id] ?? {}}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ─────────────────────────────────────────── the bar for the ticked */}
      {chosen.length > 0 && (
        <div className="sticky bottom-3 z-20 mx-3 mb-3 flex flex-wrap items-center gap-2 rounded-dash bg-dash-ink px-4 py-3 text-white shadow-2xl">
          <span className="mr-auto text-[0.875rem] font-bold">
            {chosen.length} ticked
            <span className="ml-2 font-normal text-white/70">
              {chosen.filter((item) => item.state === "CLEARED" || item.state === "REVIEW").length} can go live ·{" "}
              {chosen.filter((item) => item.state === "DRAFT" || item.state === "REJECTED").length} drafts
            </span>
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => press(chosen.map((item) => item.id))}
            className="inline-flex h-10 items-center gap-2 rounded-dash-sm bg-red-600 px-5 text-[0.8125rem] font-extrabold tracking-[0.04em] uppercase hover:bg-red-500 disabled:opacity-50"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} strokeWidth={2.5} />}
            Go live
          </button>
          {chosen.some((item) => item.state === "ON_AIR") && may.air && (
            <button
              type="button"
              disabled={pending}
              onClick={() => press(chosen.map((item) => item.id), "withdraw")}
              className="inline-flex h-10 items-center gap-2 rounded-dash-sm border border-white/30 px-4 text-[0.8125rem] font-bold hover:bg-white/10 disabled:opacity-50"
            >
              <Undo2 size={15} />
              Withdraw
            </button>
          )}
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            className="h-10 rounded-dash-sm px-3 text-[0.8125rem] font-semibold text-white/80 hover:text-white"
          >
            Clear
          </button>
        </div>
      )}
      <div className="px-5 pb-4">
        <Said said={said} />
      </div>
    </section>
  );
}

/**
 * One item: its picture, its state, where and when, where it went, and the
 * single button for its next step.
 */
function Tile({ item, picked, onPick, mine, done }) {
  const { may } = useDesk();
  const { pending, said, run } = useAction();
  const status = STATUS[item.state] ?? STATUS.DRAFT;
  const social = item.kind === "SOCIAL";
  const stamp = social ? item.payload?.stamp ?? stampFor({ scope: item.scope, at: item.createdAt }) : null;
  const failedOn = (item.platforms ?? []).filter((id) => done[id]?.status === "FAILED" || done[id]?.status === "NOT_CONNECTED");

  /* ── THE ONE BUTTON ─────────────────────────────────────────────────── */
  let action = null;
  if ((item.state === "DRAFT" || item.state === "REJECTED") && may.draft) {
    action = { label: "Send to editor", icon: Send, tone: "ink", go: () => pressMany({ ids: [item.id] }) };
  } else if (item.state === "REVIEW" && !mine && may.clear) {
    action = {
      label: may.air || item.payload?.sendOnClear ? "Approve & go live" : "Approve",
      icon: Radio,
      tone: "red",
      go: () => pressMany({ ids: [item.id] }),
    };
  } else if (item.state === "REVIEW" && mine) {
    action = { label: "With an editor", disabled: true };
  } else if (item.state === "CLEARED" && may.air) {
    action = { label: social ? "Go live everywhere" : "Put on screen", icon: Radio, tone: "red", go: () => pressMany({ ids: [item.id] }) };
  } else if (item.state === "ON_AIR" && failedOn.length && may.air) {
    action = {
      label: `Resend to ${failedOn.map(platformLabel).join(", ")}`,
      icon: RotateCw,
      tone: "amber",
      go: () => resendPost({ id: item.id, platforms: failedOn }),
    };
  } else if (item.state === "ON_AIR" && may.air) {
    action = { label: "Withdraw", icon: Undo2, tone: "quiet", go: () => pressMany({ ids: [item.id], action: "withdraw" }) };
  }

  return (
    <li
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-dash border bg-dash-card transition-shadow",
        picked ? "border-dash-ink ring-2 ring-dash-ink" : "border-dash-line hover:shadow-md",
        item.state === "ON_AIR" && !picked && "border-red-300"
      )}
    >
      {/* The picture. The square card for a post — the one people see in a
          feed — and a plain panel for something that only goes on screen. */}
      <div className="relative aspect-square bg-[#F5EEDC]">
        {/* Shown by the stylesheet only when the picture above fails. */}
        <span className="pointer-events-none absolute inset-0 hidden items-center justify-center p-4 text-center text-[0.75rem] leading-snug font-semibold text-dash-muted [.card-unavailable_&]:flex">
          This card could not be drawn. Check the account&rsquo;s permissions.
        </span>
        {social ? (
          <a href={`/api/graphic/post/${item.id}?shape=square`} target="_blank" rel="noreferrer" aria-label={`Open the card for ${item.title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- our own authenticated renderer */}
            <img
              src={`/api/graphic/post/${item.id}?shape=square`}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
              /* A card that will not draw says so on the tile rather than
                 leaving a torn-page icon where the post should be. */
              onError={(event) => {
                event.currentTarget.style.display = "none";
                event.currentTarget.parentElement?.parentElement?.classList.add("card-unavailable");
              }}
            />
          </a>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 bg-dash-ink p-5 text-center text-white">
            <span className="text-[0.625rem] font-bold tracking-[0.16em] text-white/60 uppercase">{kindLabel(item.kind)}</span>
            <span className="line-clamp-4 font-display text-[1.25rem] leading-tight font-extrabold">{item.title}</span>
          </div>
        )}

        <button
          type="button"
          onClick={onPick}
          aria-pressed={picked}
          aria-label={picked ? `Untick ${item.title}` : `Tick ${item.title}`}
          className={cn(
            "absolute top-2.5 left-2.5 flex size-8 items-center justify-center rounded-md border-2 shadow-sm transition-colors",
            picked ? "border-dash-ink bg-dash-ink text-white" : "border-white bg-white/90 text-dash-muted hover:text-dash-ink"
          )}
        >
          {picked ? <CheckSquare size={18} strokeWidth={2.5} /> : <Square size={18} strokeWidth={2.5} />}
        </button>

        <span className={cn("absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold shadow-sm", status.tone)}>
          {item.state === "ON_AIR" && <span className="size-1.5 animate-pulse rounded-full bg-white" />}
          {status.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <p className="line-clamp-2 text-[0.875rem] leading-snug font-bold text-dash-ink">{item.title}</p>

        {stamp && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.6875rem] font-semibold text-dash-muted">
            <span className="inline-flex min-w-0 items-center gap-1 text-red-600">
              <MapPin size={12} strokeWidth={2.5} aria-hidden="true" />
              <span className="truncate">{stamp.place.name}</span>
            </span>
            {stamp.time && (
              <span className="inline-flex items-center gap-1">
                <Clock size={12} strokeWidth={2.5} aria-hidden="true" />
                {stamp.time}
              </span>
            )}
          </p>
        )}

        {social && (item.platforms ?? []).length > 0 && (
          <ul className="flex flex-wrap gap-1">
            {item.platforms.map((id) => {
              const row = done[id];
              const tone = row ? DELIVERY[row.status]?.tone : null;
              const chip = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 rounded-full",
                      tone === "good" ? "dot-ok" : tone === "alert" ? "bg-red-500" : tone === "warn" ? "dot-warn" : "bg-dash-line"
                    )}
                  />
                  {platformLabel(id)}
                </>
              );
              const cls = "inline-flex h-7 items-center gap-1 rounded-full border border-dash-line px-2 text-[0.6875rem] font-semibold text-dash-ink";
              return (
                <li key={id} title={row ? `${DELIVERY[row.status]?.label}${row.error ? ` — ${row.error}` : ""}` : "Not sent yet"}>
                  {row?.remoteUrl ? (
                    <a href={row.remoteUrl} target="_blank" rel="noreferrer" className={cn(cls, "hover:border-dash-ink")}>
                      {chip}
                    </a>
                  ) : (
                    <span className={cls}>{chip}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {item.state === "REJECTED" && item.note && (
          <p className="rounded-dash-sm bg-red-50 px-2.5 py-1.5 text-[0.75rem] leading-snug text-red-700">{item.note}</p>
        )}

        <div className="mt-auto pt-1">
          {action && (
            <button
              type="button"
              disabled={pending || action.disabled}
              onClick={() => action.go && run(action.go)}
              className={cn(
                "inline-flex h-10 w-full items-center justify-center gap-2 rounded-dash-sm px-3 text-[0.8125rem] font-extrabold transition-colors disabled:cursor-default",
                action.tone === "red" && "bg-red-600 text-white hover:bg-red-500",
                action.tone === "ink" && "bg-dash-ink text-white hover:bg-black",
                action.tone === "amber" && "dot-warn text-dash-ink hover:dot-warn",
                action.tone === "quiet" && "border border-dash-line text-dash-ink hover:border-dash-ink",
                action.disabled && "border border-dash-line bg-dash-bg text-dash-muted"
              )}
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : action.icon ? <action.icon size={15} strokeWidth={2.5} /> : null}
              {action.label}
            </button>
          )}
          <Said said={said} />
        </div>
      </div>
    </li>
  );
}
