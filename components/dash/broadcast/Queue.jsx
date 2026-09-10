"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, Loader2, Pencil, Send, Trash2, Radio, Undo2, X } from "lucide-react";

import { Badge, Empty } from "@/components/dash/DashCard";
import { draftItem, discardDraft, editDraft, moveItem } from "@/app/broadcast/actions";
import { JOURNEY, MOVES, kindLabel, stateLabel, stateTone } from "@/lib/broadcast";
import { cn } from "@/lib/utils";

/**
 * The one queue every broadcast surface writes into, and the controls that
 * move things along it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY FOURTEEN SCREENS SHARE ONE COMPONENT
 *
 *  A ticker line, a breaking strap, a social post, a claim and a clearance
 *  look nothing like each other on screen and are the same object underneath:
 *  something a person wrote, that another person has to pass, that then goes
 *  out. Written fourteen times, that shared journey would be drawn fourteen
 *  slightly different ways — and the one that would drift first is the bit
 *  that says who cleared it, because it is the bit nobody looks at until
 *  somebody asks how a wrong figure reached air.
 *
 *  So the journey is drawn once. What changes per surface is what sits above
 *  it: the composer, the preview, the figures. The card underneath is the same
 *  card everywhere, and the sentence "cleared by Amina, 21:04" is rendered by
 *  one component in the whole product.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* Who is looking, and what they may do — read by every card without being
   threaded through six components that have no other use for it. */
const DeskContext = createContext({ user: null, may: {} });

export function DeskProvider({ user, may, children }) {
  const value = useMemo(() => ({ user, may: may ?? {} }), [user, may]);
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

export const useDesk = () => useContext(DeskContext);

/**
 * Running one action, with its answer.
 *
 * Every mutation on this desk can be refused for a reason the person needs to
 * read — "you wrote this, so you cannot clear it" is not an error, it is the
 * product working — so the refusal is held and shown rather than thrown away.
 */
export function useAction() {
  const [pending, start] = useTransition();
  const [said, setSaid] = useState(null);

  const run = useCallback(
    (job, { onDone } = {}) => {
      setSaid(null);
      start(async () => {
        const answer = await job();
        if (answer?.error) setSaid({ tone: "alert", text: answer.error });
        else {
          setSaid(null);
          onDone?.(answer);
        }
      });
    },
    []
  );

  return { pending, said, setSaid, run };
}

/** A refusal, where the person who caused it is looking. */
export function Said({ said }) {
  if (!said) return null;
  return (
    <p
      className={cn(
        "mt-3 flex items-start gap-2 rounded-dash-sm px-3 py-2.5 text-[0.8125rem] leading-relaxed",
        said.tone === "alert" ? "bg-red-50 text-red-700" : "bg-dash-bg text-dash-muted"
      )}
      role="status"
    >
      <AlertTriangle size={15} strokeWidth={2.5} className="mt-0.5 shrink-0" />
      {said.text}
    </p>
  );
}

/* ──────────────────────────────────────────────────────────── the card ──── */

/**
 * One item, with whatever it is allowed to do next.
 *
 * ── THE BUTTONS ARE DERIVED, NOT LISTED ────────────────────────────────────
 * What a card offers comes from `MOVES` in lib/broadcast.js and from the
 * viewer's own grants. Nothing here decides that a draft may be submitted or
 * that only a cleared item may go to air; it reads the table that decides it,
 * so the screen and the server action can never disagree about what is legal.
 */
export function ItemCard({ item, compact = false, children }) {
  const { user, may } = useDesk();
  const { pending, said, run } = useAction();
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  /* ── EDITING EXISTS BECAUSE REFUSING DOES ────────────────────────────────
     A refusal says what is wrong with the words, and without a way to change
     them the author's only route back is to discard and retype — which loses
     the refusal, the reason and the thread between them. So a draft can be
     edited in place, and only a draft: the server refuses anything an editor
     has already seen, because a cleared item whose words then changed went out
     carrying an approval of different words. */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: item.title, body: item.body ?? "" });

  const mine = item.createdBy && item.createdBy === user?.id;
  const moves = MOVES[item.state] ?? [];

  const allowed = (to) =>
    to === "REVIEW" || to === "DRAFT"
      ? may.draft
      : to === "CLEARED" || to === "REJECTED"
        ? may.clear && !mine
        : may.air;

  const move = (to, note = null) => run(() => moveItem({ id: item.id, to, note }));

  return (
    <article
      className={cn(
        "rounded-dash border border-dash-line bg-dash-card",
        item.state === "ON_AIR" && "border-dash-ink ring-1 ring-dash-ink",
        compact ? "p-3.5" : "p-4"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={stateTone(item.state)}>{stateLabel(item.state)}</Badge>
            <Badge>{kindLabel(item.kind)}</Badge>
            {item.state === "ON_AIR" && (
              <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-[0.08em] text-red-600 uppercase">
                <span className="size-1.5 animate-pulse rounded-full bg-red-600" />
                Live
              </span>
            )}
          </div>

          <h3 className="mt-2 text-[0.9375rem] leading-snug font-bold text-dash-ink">
            {item.title}
          </h3>
          {item.body && (
            <p className="mt-1 text-[0.8125rem] leading-relaxed whitespace-pre-line text-dash-muted">
              {item.body}
            </p>
          )}
        </div>
      </div>

      {children}

      {/* ── WHO TOUCHED IT, ALWAYS ─────────────────────────────────────────
          Not a hover, not a detail panel. The two names are the evidence that
          the separation held, and evidence kept one click away is evidence
          nobody checks. */}
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dash-line pt-3 text-[0.75rem] text-dash-muted">
        <span>
          Drafted by <span className="font-semibold text-dash-ink">{item.createdName ?? "—"}</span>
          {item.createdAt ? ` · ${clock(item.createdAt)}` : ""}
        </span>
        {item.clearedName && (
          <span>
            {item.state === "REJECTED" ? "Refused" : "Cleared"} by{" "}
            <span className="font-semibold text-dash-ink">{item.clearedName}</span>
            {item.clearedAt ? ` · ${clock(item.clearedAt)}` : ""}
          </span>
        )}
        {item.airedAt && <span>On air {clock(item.airedAt)}</span>}
        {item.endedAt && <span>Off {clock(item.endedAt)}</span>}
      </p>

      {item.note && (
        <p className="mt-2 rounded-dash-sm bg-dash-bg px-3 py-2 text-[0.8125rem] leading-relaxed text-dash-muted">
          <span className="font-semibold text-dash-ink">Editor:</span> {item.note}
        </p>
      )}

      {/* ── WHY THE AUTHOR IS TOLD, RATHER THAN SIMPLY GIVEN NO BUTTON ────
          A missing control reads as a broken product. A sentence reads as a
          rule, and this one is the rule the desk is built on. */}
      {item.state === "REVIEW" && mine && may.clear && (
        <p className="mt-2 rounded-dash-sm bg-dash-bg px-3 py-2 text-[0.8125rem] text-dash-muted">
          You wrote this, so somebody else on the desk has to clear it.
        </p>
      )}

      {(moves.length > 0 || item.state === "DRAFT") && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {moves.map((to) => {
            if (!allowed(to)) return null;
            if (to === "REJECTED") {
              return (
                <button
                  key={to}
                  type="button"
                  onClick={() => setRefusing((open) => !open)}
                  disabled={pending}
                  className={moveClass("refuse")}
                >
                  <X size={14} strokeWidth={2.5} />
                  Refuse
                </button>
              );
            }
            return (
              <button
                key={to}
                type="button"
                onClick={() => move(to)}
                disabled={pending}
                className={moveClass(to)}
              >
                {pending ? <Loader2 size={14} className="animate-spin" /> : moveIcon(to)}
                {moveWord(to)}
              </button>
            );
          })}

          {(item.state === "DRAFT" || item.state === "REJECTED") && may.draft && (
            <button
              type="button"
              onClick={() => setEditing((open) => !open)}
              disabled={pending}
              className={moveClass("discard")}
            >
              <Pencil size={14} strokeWidth={2.5} />
              Edit
            </button>
          )}

          {item.state === "DRAFT" && (mine || may.clear) && (
            <button
              type="button"
              onClick={() => run(() => discardDraft(item.id))}
              disabled={pending}
              className={moveClass("discard")}
            >
              <Trash2 size={14} strokeWidth={2.5} />
              Discard
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-3 rounded-dash-sm border border-dash-line bg-dash-bg p-3">
          <label className="block text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
            The words
          </label>
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            className="mt-1.5 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 py-2 text-[0.875rem] font-semibold text-dash-ink"
          />
          <textarea
            value={draft.body}
            onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
            rows={2}
            placeholder="Anything underneath it. Optional."
            className="mt-2 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 py-2 text-[0.875rem] text-dash-ink"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending || !draft.title.trim()}
              onClick={() =>
                run(
                  () => editDraft({ id: item.id, title: draft.title.trim(), body: draft.body }),
                  { onDone: () => setEditing(false) }
                )
              }
              className={moveClass("CLEARED")}
            >
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className={moveClass("discard")}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {refusing && (
        <div className="mt-3 rounded-dash-sm border border-dash-line bg-dash-bg p-3">
          <label className="block text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
            Why it is being refused
          </label>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            placeholder="The coverage figure is missing. Put it back in and resubmit."
            className="mt-1.5 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 py-2 text-[0.875rem] text-dash-ink"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending || !reason.trim()}
              onClick={() =>
                run(() => moveItem({ id: item.id, to: "REJECTED", note: reason }), {
                  onDone: () => {
                    setRefusing(false);
                    setReason("");
                  },
                })
              }
              className={moveClass("refuse")}
            >
              Refuse it
            </button>
            <button type="button" onClick={() => setRefusing(false)} className={moveClass("discard")}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <Said said={said} />
    </article>
  );
}

const moveWord = (to) =>
  to === "REVIEW" ? "Send to editor" : to === "CLEARED" ? "Clear" : to === "ON_AIR" ? "Take to air" : to === "OFF_AIR" ? "Take off" : "Back to draft";

const moveIcon = (to) =>
  to === "REVIEW" ? <Send size={14} strokeWidth={2.5} /> : to === "CLEARED" ? <Check size={14} strokeWidth={2.5} /> : to === "ON_AIR" ? <Radio size={14} strokeWidth={2.5} /> : <Undo2 size={14} strokeWidth={2.5} />;

function moveClass(kind) {
  const base =
    "inline-flex h-9 items-center gap-1.5 rounded-dash-sm border px-3 text-[0.75rem] font-bold tracking-[0.06em] uppercase transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink";
  if (kind === "ON_AIR") return cn(base, "border-red-600 bg-red-600 text-white hover:bg-red-700");
  if (kind === "CLEARED") return cn(base, "border-dash-ink bg-dash-ink text-white hover:bg-black");
  if (kind === "refuse") return cn(base, "border-red-200 bg-red-50 text-red-700 hover:border-red-600");
  if (kind === "discard") return cn(base, "border-dash-line bg-dash-card text-dash-muted hover:text-dash-ink");
  return cn(base, "border-dash-line bg-dash-card text-dash-ink hover:border-dash-ink");
}

/** 21:04, in the reader's own timezone, and never a date on a one-night desk. */
export function clock(value) {
  if (!value) return "";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ────────────────────────────────────────────────────────── composing ───── */

/**
 * The composer every surface hands its own fields to.
 *
 * `preview` is the thing being made, drawn as it will look. Not decoration:
 * the reason a desk types a strap into a box and photographs the wall board
 * instead of using the tool is that the tool never showed them what they were
 * about to say.
 */
export function Composer({ kind, title, hint, children, values, disabled, preview, onDrafted }) {
  const { may } = useDesk();
  const { pending, said, run } = useAction();

  if (!may.draft) {
    return (
      <Empty>
        Your account can read this desk and not write to it. Straps, graphics and posts are
        drafted by an account holding the drafting grant.
      </Empty>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        run(() => draftItem({ kind, ...values() }), { onDone: onDrafted });
      }}
    >
      {hint && <p className="mb-3 text-[0.8125rem] leading-relaxed text-dash-muted">{hint}</p>}
      {children}
      {preview}
      <button
        type="submit"
        disabled={pending || disabled}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-dash-sm border-2 border-dash-ink bg-dash-ink px-4 text-[0.75rem] font-bold tracking-[0.08em] text-white uppercase transition-colors hover:bg-black disabled:opacity-40"
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={2.5} />}
        {title ?? "Save as draft"}
      </button>
      <p className="mt-2 text-[0.75rem] text-dash-muted">
        Saves as a draft. Nothing on this desk reaches air without an editor who did not write it.
      </p>
      <Said said={said} />
    </form>
  );
}

/** A labelled field, so twelve composers do not each invent their own. */
export function Field({ label, hint, children }) {
  return (
    <label className="mt-3 block first:mt-0">
      <span className="block text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
        {label}
      </span>
      {hint && <span className="mt-0.5 block text-[0.75rem] text-dash-muted">{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

export const inputClass =
  "w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 py-2 text-[0.875rem] text-dash-ink focus:border-dash-ink focus:outline-none";

/* ───────────────────────────────────────────────────────────── the list ─── */

/** A queue, in one state or all of them, with the empty case said properly. */
export function Queue({ items, empty, compact = false, render }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <div className="space-y-3">
      {items.map((item) =>
        render ? render(item) : <ItemCard key={item.id} item={item} compact={compact} />
      )}
    </div>
  );
}

/** The journey, drawn, with how many items are sitting at each step. */
export function JourneyBar({ items }) {
  const counts = Object.fromEntries(
    JOURNEY.map((step) => [step.id, items.filter((item) => item.state === step.id).length])
  );

  return (
    <ol className="flex flex-wrap items-stretch gap-1.5">
      {JOURNEY.filter((step) => step.id !== "REJECTED").map((step, index) => (
        <li key={step.id} className="flex min-w-28 flex-1 items-stretch gap-1.5">
          {index > 0 && <span aria-hidden="true" className="self-center text-dash-muted">→</span>}
          <div
            className="flex-1 rounded-dash-sm border border-dash-line bg-dash-card px-3 py-2.5"
            title={step.why}
          >
            <p className="text-[0.6875rem] font-bold tracking-[0.08em] text-dash-muted uppercase">
              {step.label}
            </p>
            <p className="figure mt-1 text-[1.25rem] leading-none font-bold text-dash-ink">
              {counts[step.id] ?? 0}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
