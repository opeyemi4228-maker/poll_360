"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  CheckSquare,
  Clock,
  CornerDownRight,
  Hand,
  Keyboard,
  Loader2,
  MapPin,
  Radio,
  RotateCw,
  Search,
  Send,
  Square,
  Timer,
  Undo2,
  X,
} from "lucide-react";

import { Empty } from "@/components/dash/DashCard";
import { Said, useAction, useDesk } from "./Queue";
import Correction from "./Correction";
import { holdItem, moveItem, pressMany, resendPost } from "@/app/broadcast/actions";
import {
  DELIVERY,
  PLATFORMS,
  correctedBy,
  correctionOf,
  embargoOf,
  holdOf,
  isEmbargoed,
  kindLabel,
  mayCorrect,
  nextStep,
  platformLabel,
  untilWords,
} from "@/lib/broadcast";
import { clockWAT, stampFor } from "@/lib/stamp";
import { cn } from "@/lib/utils";

/**
 * The queue: every post and on-screen item tonight, and what moves each one.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE BUTTON, ALWAYS THE NEXT STEP — AND ONE KEY FOR IT
 *
 *  Under pressure people do not read, they recognise and press. So each item
 *  is a picture — the card itself — with its state in colour and in words,
 *  and one strong button for the next thing. The next thing is decided once,
 *  in lib/broadcast.js (`nextStep`), so the button and the keyboard cannot
 *  disagree about what "go" means.
 *
 *  An editor clearing forty items does it from the keyboard: J and K to move,
 *  A to approve, R to send back with a reason, T to take an item so nobody
 *  else reads it at the same time. Work waiting for a person sorts to the top
 *  of the list, above what is already out.
 *
 *  Ticking many and pressing once still works, and the rule that a second
 *  person approves is still kept item by item — see `pressMany` in
 *  app/broadcast/actions.js.
 * ══════════════════════════════════════════════════════════════════════════
 */

const TABS = [
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting" },
  { id: "ready", label: "Ready" },
  { id: "drafts", label: "Drafts" },
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
  REVIEW: { label: "Waiting for editor", tone: "tone-warn" },
  CLEARED: { label: "Ready to go live", tone: "tone-ok" },
  ON_AIR: { label: "Live", tone: "bg-red-600 text-white border-red-600" },
  OFF_AIR: { label: "Withdrawn", tone: "bg-dash-bg text-dash-muted border-dash-line" },
};

/* The order "All" shows things in: what needs a person first, then what is
   out, then what is finished. Within each, the newest first. */
const URGENCY = { REVIEW: 0, CLEARED: 1, REJECTED: 2, DRAFT: 3, ON_AIR: 4, OFF_AIR: 5 };

/* The keys, as the help lists them. The handler below is the source; this is
   what a person reads. */
const KEYS = [
  ["J / ↓", "Next item"],
  ["K / ↑", "Previous item"],
  ["A", "Do the next step: send, approve, go live, resend"],
  ["R", "Send back to its writer, with a reason"],
  ["T", "Take it — tell other editors you are on it"],
  ["C", "Correct or withdraw an update that is out"],
  ["X", "Tick or untick"],
  ["1 – 7", "Switch tab"],
  ["S", "Search the queue"],
  ["Esc", "Close, untick all"],
];

export default function PublishingList({ items = [] }) {
  const { user, may, deliveries, now } = useDesk();
  const { pending, said, run } = useAction();

  const waitingForMe = items.filter((item) => item.state === "REVIEW" && item.createdBy !== user?.id).length;
  const [tab, setTab] = useState(() => (may.clear && waitingForMe > 0 ? "waiting" : "all"));
  const [kind, setKind] = useState("both");
  const [level, setLevel] = useState("");
  const [platform, setPlatform] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [focus, setFocus] = useState(0);
  const [refusing, setRefusing] = useState(null);
  const [correcting, setCorrecting] = useState(null);
  const [help, setHelp] = useState(false);
  const search = useRef(null);
  const list = useRef(null);

  const failed = (item) => Object.values(deliveries[item.id] ?? {}).some((row) => row.status === "FAILED");
  const inTab = (item, id) =>
    id === "all" ||
    (id === "drafts" && (item.state === "DRAFT" || item.state === "REJECTED")) ||
    (id === "waiting" && item.state === "REVIEW") ||
    (id === "ready" && item.state === "CLEARED") ||
    (id === "live" && item.state === "ON_AIR") ||
    (id === "problems" && ((item.state === "ON_AIR" && failed(item)) || item.state === "REJECTED")) ||
    (id === "ended" && item.state === "OFF_AIR");

  /* The desk's own kinds of work that are not items to publish: clearances,
     programmes and claims each have their own screen. */
  const publishable = useMemo(
    () => items.filter((item) => !["CLEARANCE", "PROGRAMME", "CLAIM"].includes(item.kind)),
    [items]
  );

  /* Everything but the tab, so the tab counts answer "how many would I see". */
  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase();
    return publishable.filter((item) => {
      if (kind === "posts" && item.kind !== "SOCIAL") return false;
      if (kind === "screen" && item.kind === "SOCIAL") return false;
      if (level && (item.payload?.level ?? "nation") !== level) return false;
      if (platform && !(item.platforms ?? []).includes(platform)) return false;
      if (words && !`${item.title} ${item.body ?? ""} ${item.payload?.place?.name ?? ""}`.toLowerCase().includes(words)) return false;
      return true;
    });
  }, [publishable, kind, level, platform, query]);

  const shown = filtered
    .filter((item) => inTab(item, tab))
    .sort(
      (a, b) =>
        (tab === "all" ? (URGENCY[a.state] ?? 9) - (URGENCY[b.state] ?? 9) : 0) ||
        new Date(b.updatedAt ?? b.createdAt) - new Date(a.updatedAt ?? a.createdAt)
    );

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

  /* ── WHAT A TILE'S BUTTON — OR THE A KEY — DOES ─────────────────────────── */
  const failedOn = (item) =>
    (item.platforms ?? []).filter((id) => deliveries[item.id]?.[id]?.status === "FAILED" || deliveries[item.id]?.[id]?.status === "NOT_CONNECTED");
  const stepFor = (item) => nextStep(item, { may, mine: item.createdBy === user?.id, failedOn: failedOn(item), now });
  const goFor = (item, step) => {
    if (!step) return null;
    if (step.step === "resend") return () => resendPost({ id: item.id, platforms: failedOn(item) });
    if (step.step === "withdraw") return () => pressMany({ ids: [item.id], action: "withdraw" });
    if (["submit", "approve", "air"].includes(step.step)) return () => pressMany({ ids: [item.id] });
    return null;
  };

  /* ── THE KEYBOARD ─────────────────────────────────────────────────────────
     Listens on the window, so it works without first clicking into the list,
     and stands aside whenever somebody is typing — a J in a caption is a J. */
  const focusIndex = Math.min(focus, Math.max(0, shown.length - 1));
  const focused = shown[focusIndex] ?? null;
  const keys = useRef(null);
  const onKey = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const typing = event.target.closest?.("input, textarea, select, [contenteditable=true], dialog");
    if (typing) {
      if (event.key === "Escape" && event.target === search.current) search.current.blur();
      return;
    }
    const key = event.key;
    const by = (step) => {
      event.preventDefault();
      setFocus((at) => Math.max(0, Math.min(shown.length - 1, at + step)));
    };
    if (key === "j" || key === "ArrowDown") return by(1);
    if (key === "k" || key === "ArrowUp") return by(-1);
    /* "/" belongs to the room's own search (DashSearch), so the queue's is S. */
    if (key === "s") {
      event.preventDefault();
      return search.current?.focus();
    }
    if (key === "?") return setHelp((open) => !open);
    if (key === "Escape") {
      setHelp(false);
      setRefusing(null);
      return setPicked(new Set());
    }
    if (/^[1-7]$/.test(key)) return setTab(TABS[Number(key) - 1].id);
    if (!focused) return;
    if (key === "x") return toggle(focused.id);
    /* A, never Enter: Enter on a focused button anywhere on the page is that
       button's press, and must not also approve whatever the queue has in
       focus. */
    if (key === "a") {
      const step = stepFor(focused);
      /* Withdrawing takes a press of its own button: a key that can pull a
         live post off air by accident is not one a tired hand should have. */
      if (step?.step === "withdraw") return;
      const go = goFor(focused, step);
      if (go) {
        event.preventDefault();
        run(go);
      }
      return;
    }
    if (key === "r" && focused.state === "REVIEW" && may.clear && focused.createdBy !== user?.id) {
      event.preventDefault();
      return setRefusing(focused.id);
    }
    if (key === "t" && (focused.state === "REVIEW" || focused.state === "CLEARED") && may.clear) {
      const mine = holdOf(focused, now ?? 0)?.by === user?.id;
      return run(() => holdItem({ id: focused.id, release: mine }));
    }
    if (key === "c" && may.draft && mayCorrect(focused)) return setCorrecting(focused);
  };
  /* The listener is attached once and always calls the latest handler, which
     sees this render's list; the handler is swapped in after each render. */
  useEffect(() => {
    keys.current = onKey;
  });
  useEffect(() => {
    const listener = (event) => keys.current?.(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  /* Keep the focused tile on screen as the keys move it. */
  useEffect(() => {
    list.current?.querySelector(`[data-index="${focusIndex}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusIndex]);

  const nothingYet = publishable.length === 0;

  return (
    <section className="rounded-dash border border-dash-line bg-dash-card" aria-label="Queue">
      {/* ─────────────────────────────────────────────────────── the head */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-dash-line px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-[1rem] font-extrabold tracking-[-0.01em] text-dash-ink">Queue</h2>
          <p className="text-[0.8125rem] text-dash-muted">
            What needs a person comes first. Each card&rsquo;s button does its next step.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-dash-sm border border-dash-line p-0.5" role="radiogroup" aria-label="What to list">
            {[
              ["both", "Everything"],
              ["posts", "Posts"],
              ["screen", "On screen"],
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
          <button
            type="button"
            onClick={() => setHelp((open) => !open)}
            aria-expanded={help}
            title="Keyboard shortcuts (?)"
            className={cn(
              "hidden h-9 items-center gap-1.5 rounded-dash-sm border px-2.5 text-[0.75rem] font-bold sm:inline-flex",
              help ? "border-dash-ink bg-dash-ink text-white" : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
            )}
          >
            <Keyboard size={15} />
            Keys
          </button>
        </div>
      </header>

      {help && (
        <div className="border-b border-dash-line bg-dash-bg px-5 py-3">
          <dl className="grid gap-x-6 gap-y-1.5 text-[0.75rem] sm:grid-cols-2 lg:grid-cols-3">
            {KEYS.map(([key, what]) => (
              <div key={key} className="flex items-baseline gap-2.5">
                <dt className="figure min-w-[4.75rem] font-bold text-dash-ink">{key}</dt>
                <dd className="text-dash-muted">{what}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* ──────────────────────────────────────────────── tabs and filters */}
      <div className="flex flex-col gap-3 border-b border-dash-line px-5 py-3">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]" role="tablist" aria-label="Status">
          {TABS.map((row) => {
            const count = filtered.filter((item) => inTab(item, row.id)).length;
            const alarm = (row.id === "problems" && count > 0) || (row.id === "waiting" && count > 0 && may.clear);
            return (
              <button
                key={row.id}
                type="button"
                role="tab"
                aria-selected={tab === row.id}
                onClick={() => setTab(row.id)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[0.8125rem] font-bold transition-colors",
                  tab === row.id
                    ? "border-dash-ink bg-dash-ink text-white"
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
          <label className="relative min-w-48 flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-dash-muted" />
            <input
              ref={search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by place or words"
              aria-label="Search the queue"
              className="h-9 w-full rounded-dash-sm border border-dash-line bg-dash-card pr-8 pl-9 text-[0.8125rem] text-dash-ink"
            />
            <kbd className="figure pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-dash-line px-1.5 text-[0.625rem] text-dash-muted sm:block">
              S
            </kbd>
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
            {nothingYet
              ? "Nothing written yet. Write an update and it appears here — waiting for an editor, then ready to go live."
              : tab === "waiting"
                ? "Nothing is waiting for an editor."
                : "Nothing here. Try another tab or clear the search."}
          </Empty>
        ) : (
          <ul ref={list} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {shown.map((item, index) => (
              <Tile
                key={item.id}
                index={index}
                item={item}
                focused={index === focusIndex}
                onFocus={() => setFocus(index)}
                picked={picked.has(item.id)}
                onPick={() => toggle(item.id)}
                step={stepFor(item)}
                go={goFor(item, stepFor(item))}
                refusing={refusing === item.id}
                onRefuse={(open) => setRefusing(open ? item.id : null)}
                onCorrect={() => setCorrecting(item)}
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
            className="inline-flex h-10 items-center gap-2 rounded-dash-sm bg-red-600 px-5 text-[0.8125rem] font-semibold hover:bg-red-500 disabled:opacity-50"
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
      <div className="px-5 pb-4 empty:hidden">
        <Said said={said} />
      </div>

      <Correction key={correcting?.id ?? "closed"} item={correcting} onClose={() => setCorrecting(null)} />
    </section>
  );
}

/**
 * One item: its picture, its state, where and when, where it went, and the
 * single button for its next step — with the editor's two lesser moves,
 * sending back and taking, underneath it.
 */
function Tile({ index, item, focused, onFocus, picked, onPick, step, go, refusing, onRefuse, onCorrect, done }) {
  const { user, may, now } = useDesk();
  const { pending, said, run } = useAction();
  const [reason, setReason] = useState("");
  const status = STATUS[item.state] ?? STATUS.DRAFT;
  const social = item.kind === "SOCIAL";
  const stamp = social ? item.payload?.stamp ?? stampFor({ scope: item.scope, at: item.createdAt }) : null;
  const mine = item.createdBy === user?.id;

  const embargo = embargoOf(item);
  const held = embargo && isEmbargoed(item, now ?? 0) && item.state !== "ON_AIR" && item.state !== "OFF_AIR";
  const hold = holdOf(item, now ?? 0);
  const holdMine = hold?.by === user?.id;
  const fixes = correctionOf(item);
  const fixed = correctedBy(item);
  const reviewable = item.state === "REVIEW" && !mine && may.clear;
  const takeable = (item.state === "REVIEW" || item.state === "CLEARED") && may.clear;

  const refuse = () =>
    run(() => moveItem({ id: item.id, to: "REJECTED", note: reason }), {
      onDone: () => {
        setReason("");
        onRefuse(false);
      },
    });

  return (
    <li
      data-index={index}
      onPointerDown={onFocus}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-dash border bg-dash-card transition-shadow",
        picked ? "border-dash-ink ring-2 ring-dash-ink" : "border-dash-line hover:shadow-md",
        focused && !picked && "ring-2 ring-blue-500 ring-offset-2 ring-offset-dash-card",
        item.state === "ON_AIR" && !picked && "border-red-300",
        hold && !holdMine && "opacity-80"
      )}
    >
      {/* The picture. The square card for a post — the one people see in a
          feed — and a plain panel for something that only goes on screen. */}
      <div className="relative aspect-[4/3] bg-[#F5EEDC]">
        {/* Shown by the stylesheet only when the picture above fails. */}
        <span className="pointer-events-none absolute inset-0 hidden items-center justify-center p-4 text-center text-[0.75rem] leading-snug font-semibold text-dash-muted [.card-unavailable_&]:flex">
          This card could not be drawn. Check the account&rsquo;s permissions.
        </span>
        {social ? (
          <a href={`/api/graphic/post/${item.id}?shape=square`} target="_blank" rel="noreferrer" aria-label={`Open the card for ${item.title}`} tabIndex={-1}>
            {/* eslint-disable-next-line @next/next/no-img-element -- our own authenticated renderer */}
            <img
              src={`/api/graphic/post/${item.id}?shape=square`}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover object-top"
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
            <span className="line-clamp-3 font-display text-[1.125rem] leading-tight font-extrabold">{item.title}</span>
          </div>
        )}

        <button
          type="button"
          onClick={onPick}
          aria-pressed={picked}
          aria-label={picked ? `Untick ${item.title}` : `Tick ${item.title}`}
          className={cn(
            "absolute top-2.5 left-2.5 flex size-8 items-center justify-center rounded-md border shadow-e2 transition-colors",
            picked ? "border-dash-ink bg-dash-ink text-white" : "border-white bg-white/90 text-dash-muted hover:text-dash-ink"
          )}
        >
          {picked ? <CheckSquare size={18} strokeWidth={2.5} /> : <Square size={18} strokeWidth={2.5} />}
        </button>

        <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold shadow-e2", status.tone)}>
            {item.state === "ON_AIR" && <span className="size-1.5 animate-pulse rounded-full bg-white" />}
            {status.label}
          </span>
          {held && (
            <span className="air-band inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold shadow-e2" title={`Not before ${clockWAT(embargo)}`}>
              <Timer size={12} strokeWidth={2.5} />
              {clockWAT(embargo)}
            </span>
          )}
        </div>

        {/* Who is on it, across the foot of the picture where the eye lands
            before it reaches the button. */}
        {hold && (
          <p
            className={cn(
              "absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-3 py-1.5 text-[0.6875rem] font-bold",
              holdMine ? "bg-blue-600 text-white" : "bg-dash-ink/90 text-white"
            )}
          >
            <Hand size={12} strokeWidth={2.5} />
            {holdMine ? "You are on this" : `${hold.name ?? "An editor"} is on this`}
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        {(fixes || fixed) && (
          <p
            className={cn(
              "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold",
              (fixes?.mode ?? fixed?.mode) === "retract" ? "bg-red-50 text-red-700" : "tone-warn"
            )}
          >
            {(fixes?.mode ?? fixed?.mode) === "retract" ? <Ban size={11} strokeWidth={2.5} /> : <CornerDownRight size={11} strokeWidth={2.5} />}
            {fixes
              ? fixes.mode === "retract"
                ? "Withdraws an update"
                : "Corrects an update"
              : fixed.mode === "retract"
                ? "Withdrawn with a retraction"
                : "Corrected"}
          </p>
        )}

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
            {item.createdName && <span className="truncate">by {mine ? "you" : item.createdName}</span>}
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
          <p className="rounded-dash-sm bg-red-50 px-2.5 py-1.5 text-[0.75rem] leading-snug text-red-700">
            <span className="font-bold">Sent back{item.clearedName ? ` by ${item.clearedName}` : ""}:</span> {item.note}
          </p>
        )}

        {held && step?.step !== "embargoed" && (
          <p className="text-[0.6875rem] font-semibold text-dash-muted">
            Embargoed until {clockWAT(embargo)}{now ? ` — lifts ${untilWords(embargo, now)}` : ""}.
          </p>
        )}

        {/* ── SENDING BACK ─────────────────────────────────────────────────
            In the card, not a dialog: the reason is short and it is written
            while looking at the thing being refused. */}
        {refusing && (
          <form
            className="flex flex-col gap-2 rounded-dash-sm border border-red-200 bg-red-50 p-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              refuse();
            }}
          >
            <label className="text-[0.75rem] font-medium text-red-700" htmlFor={`why-${item.id}`}>
              Why is it going back?
            </label>
            <textarea
              id={`why-${item.id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && reason.trim()) {
                  event.preventDefault();
                  refuse();
                }
                if (event.key === "Escape") onRefuse(false);
              }}
              rows={2}
              autoFocus
              placeholder="The figure for Kano is from before the last 40 units came in."
              className="w-full rounded-dash-sm border border-red-200 bg-white px-2.5 py-1.5 text-[0.8125rem] text-dash-ink focus:border-red-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending || !reason.trim()}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-dash-sm bg-red-600 px-3 text-[0.75rem] font-extrabold text-white hover:bg-red-500 disabled:opacity-40"
              >
                {pending && <Loader2 size={14} className="animate-spin" />}
                Send back
              </button>
              <button
                type="button"
                onClick={() => onRefuse(false)}
                aria-label="Cancel"
                className="flex size-9 items-center justify-center rounded-dash-sm text-red-700 hover:bg-red-100"
              >
                <X size={16} />
              </button>
            </div>
          </form>
        )}

        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          {step && !refusing && (
            <button
              type="button"
              disabled={pending || !go}
              onClick={() => go && run(go)}
              className={cn(
                "inline-flex h-10 w-full items-center justify-center gap-2 rounded-dash-sm px-3 text-[0.8125rem] font-extrabold transition-colors disabled:cursor-default",
                !go && "border border-dash-line bg-dash-bg text-dash-muted",
                go && ["approve", "air"].includes(step.step) && "bg-red-600 text-white hover:bg-red-500",
                go && step.step === "submit" && "bg-dash-ink text-white hover:bg-black",
                go && step.step === "resend" && "tone-warn border",
                go && step.step === "withdraw" && "border border-dash-line text-dash-ink hover:border-dash-ink"
              )}
            >
              {pending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                (() => {
                  const Icon = { submit: Send, approve: Radio, air: Radio, resend: RotateCw, withdraw: Undo2, embargoed: Timer }[step.step];
                  return Icon ? <Icon size={15} strokeWidth={2.5} /> : null;
                })()
              )}
              {step.label}
            </button>
          )}

          {/* The lesser moves: quiet, and only the ones this person may make. */}
          {!refusing && (reviewable || takeable || (may.draft && mayCorrect(item))) && (
            <div className="flex flex-wrap gap-1">
              {reviewable && (
                <button
                  type="button"
                  onClick={() => onRefuse(true)}
                  className="inline-flex h-8 items-center gap-1 rounded-dash-sm px-2 text-[0.75rem] font-bold text-dash-muted hover:bg-red-50 hover:text-red-700"
                >
                  <Undo2 size={13} strokeWidth={2.5} />
                  Send back
                </button>
              )}
              {takeable && (!hold || holdMine) && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => holdItem({ id: item.id, release: holdMine }))}
                  className="inline-flex h-8 items-center gap-1 rounded-dash-sm px-2 text-[0.75rem] font-bold text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
                >
                  <Hand size={13} strokeWidth={2.5} />
                  {holdMine ? "Let go" : "I've got this"}
                </button>
              )}
              {may.draft && mayCorrect(item) && (
                <button
                  type="button"
                  onClick={onCorrect}
                  className="inline-flex h-8 items-center gap-1 rounded-dash-sm px-2 text-[0.75rem] font-bold text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
                >
                  <CornerDownRight size={13} strokeWidth={2.5} />
                  Correct
                </button>
              )}
            </div>
          )}
          <Said said={said} />
        </div>
      </div>
    </li>
  );
}
