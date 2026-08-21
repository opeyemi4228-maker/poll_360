"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, ChevronDown, FlaskConical, Loader2, Plus, Vote } from "lucide-react";

import { createElection, switchElection } from "@/app/actions/elections";
import { states2023 } from "@/lib/election2023";
import { cn } from "@/lib/utils";

/**
 * Which election you are looking at, and how to start another.
 *
 * ── NOTHING IS EVER CLEARED ────────────────────────────────────────────────
 * The obvious way to run a second election is a "reset" button, and it is the
 * wrong one: it is irreversible, it destroys the record the product exists to
 * keep, and it makes two nights impossible to compare. A new project is empty
 * because nothing has been filed against it yet — every result from the last
 * one is still there, still readable, one switch away.
 *
 * ── THE DEMONSTRATION SAYS SO, ON ITS OWN ROW ──────────────────────────────
 * The 2023 replay is marked in the list itself rather than in a footnote,
 * because the one mistake this control could cause is somebody presenting a
 * worked example as tonight's count.
 * ───────────────────────────────────────────────────────────────────────────
 */
const KINDS = [
  ["PRESIDENTIAL", "Presidential"],
  ["GOVERNORSHIP", "Governorship"],
  ["SENATE", "Senate"],
  ["HOUSE", "House of Representatives"],
  ["ASSEMBLY", "State Assembly"],
  ["LOCAL", "Local government"],
  ["OTHER", "Something else"],
];

export default function ElectionSwitcher({ current, all = [], canCreate = false }) {
  const [open, setOpen] = useState(false);
  const [making, setMaking] = useState(false);
  /* Presidential covers the federation; everything else is fought somewhere in
     particular, so the picker appears only when it is needed. */
  const [kind, setKind] = useState("GOVERNORSHIP");
  const boxRef = useRef(null);

  const [state, formAction] = useActionState(createElection, {});

  /* A project that has just been started is the one you are now looking at, so
     the panel has nothing left to say and closes itself. Adjusted during render
     rather than in an effect — React's documented way to react to a changed
     value, and the only one that cannot paint the open panel for a frame after
     the work is done. */
  const [lastResult, setLastResult] = useState(state);
  if (state !== lastResult) {
    setLastResult(state);
    if (state?.ok) {
      setMaking(false);
      setOpen(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (event) => {
      if (!boxRef.current?.contains(event.target)) {
        setOpen(false);
        setMaking(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Election project"
        className="flex max-w-[15rem] items-center gap-2.5 rounded-full border border-dash-line bg-dash-card py-2 pr-3 pl-3.5 text-left transition-colors hover:border-dash-ink"
      >
        <Vote size={15} strokeWidth={2.25} className="shrink-0 text-dash-muted" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate text-[0.8125rem] leading-tight font-semibold text-dash-ink">
            {current?.title ?? "No project yet"}
          </span>
          <span className="block text-[0.6875rem] leading-tight text-dash-muted">
            {current?.isDemo ? "Worked example" : (current?.status ?? "").toLowerCase() || "—"}
          </span>
        </span>
        <ChevronDown size={14} className="shrink-0 text-dash-muted" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-dash border border-dash-line bg-dash-card shadow-lg">
          {!making && (
            <>
              <p className="border-b border-dash-line px-4 py-2.5 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                Election projects
              </p>

              <ul className="max-h-72 overflow-y-auto">
                {all.length === 0 && (
                  <li className="px-4 py-5 text-[0.8125rem] text-dash-muted">
                    Nothing yet. Start one below.
                  </li>
                )}

                {all.map((item) => (
                  <li key={item.id}>
                    <form action={switchElection}>
                      <input type="hidden" name="electionId" value={item.id} />
                      <button
                        type="submit"
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-dash-bg",
                          item.id === current?.id && "bg-dash-bg"
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[0.875rem] font-semibold text-dash-ink">
                              {item.title}
                            </span>
                            {item.isDemo && (
                              <span
                                title="A worked example, not a live count"
                                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-dash-bg px-2 py-0.5 text-[0.625rem] font-bold text-dash-muted"
                              >
                                <FlaskConical size={10} strokeWidth={2.5} />
                                Example
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-[0.75rem] text-dash-muted">
                            {label(item)}
                          </span>
                        </span>
                        {item.id === current?.id && (
                          <Check size={15} strokeWidth={3} className="shrink-0 text-dash-ink" />
                        )}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>

              {canCreate && (
                <button
                  type="button"
                  onClick={() => setMaking(true)}
                  className="flex w-full items-center gap-2.5 border-t border-dash-line px-4 py-3 text-[0.875rem] font-semibold text-dash-ink transition-colors hover:bg-dash-bg"
                >
                  <Plus size={15} strokeWidth={2.75} />
                  New election project
                </button>
              )}
            </>
          )}

          {making && (
            <form action={formAction} className="p-4">
              <p className="text-[0.875rem] font-semibold text-dash-ink">New election project</p>
              <p className="mt-1 text-[0.75rem] leading-relaxed text-dash-muted">
                It starts empty. Nothing in your other projects is touched or removed.
              </p>

              <label htmlFor="election-title" className="mt-4 block text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                Title
              </label>
              <input
                id="election-title"
                name="title"
                required
                maxLength={120}
                autoFocus
                placeholder="Ekiti Governorship 2026"
                className="mt-1.5 h-11 w-full rounded-dash-sm border border-dash-line bg-dash-bg px-3 text-[0.875rem] text-dash-ink placeholder:text-dash-muted focus:border-dash-ink focus:outline-none"
              />

              <div className="mt-3 grid grid-cols-2 gap-2">
                <span>
                  <label htmlFor="election-kind" className="block text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                    Contest
                  </label>
                  <select
                    id="election-kind"
                    name="kind"
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-dash-sm border border-dash-line bg-dash-bg px-2 text-[0.875rem] text-dash-ink focus:border-dash-ink focus:outline-none"
                  >
                    {KINDS.map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </select>
                </span>
                <span>
                  <label htmlFor="election-day" className="block text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                    Polling day
                  </label>
                  <input
                    id="election-day"
                    name="votesOn"
                    type="date"
                    className="mt-1.5 h-11 w-full rounded-dash-sm border border-dash-line bg-dash-bg px-2 text-[0.875rem] text-dash-ink focus:border-dash-ink focus:outline-none"
                  />
                </span>
              </div>

              {kind !== "PRESIDENTIAL" && (
                <div className="mt-3">
                  <label htmlFor="election-state" className="block text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                    State
                  </label>
                  <select
                    id="election-state"
                    name="scopeStates"
                    required
                    defaultValue=""
                    className="mt-1.5 h-11 w-full rounded-dash-sm border border-dash-line bg-dash-bg px-2 text-[0.875rem] text-dash-ink focus:border-dash-ink focus:outline-none"
                  >
                    <option value="" disabled>
                      Which state is this fought in?
                    </option>
                    {states2023.map((row) => (
                      <option key={row.code} value={row.code}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-dash-muted">
                    The board will show only this state. The rest of the country is not
                    unreported, it is not in the contest.
                  </p>
                </div>
              )}

              {state?.error && (
                <p role="alert" className="mt-3 text-[0.8125rem] font-semibold text-red-600">
                  {state.error}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <StartButton />
                <button
                  type="button"
                  onClick={() => setMaking(false)}
                  className="h-11 rounded-dash-sm border border-dash-line px-4 text-[0.8125rem] font-semibold text-dash-muted transition-colors hover:border-dash-ink hover:text-dash-ink"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/** Its own component so it can read `useFormStatus`, which reports the form above it. */
function StartButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-dash-sm bg-dash-ink px-4 text-[0.8125rem] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? <Loader2 size={15} strokeWidth={3} className="animate-spin" /> : <Plus size={15} strokeWidth={2.75} />}
      {pending ? "Starting" : "Start project"}
    </button>
  );
}

function label(item) {
  const parts = [];
  if (item.kind) parts.push(item.kind.charAt(0) + item.kind.slice(1).toLowerCase());
  if (item.votesOn) {
    parts.push(
      new Date(item.votesOn).toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    );
  }
  if (item.status && item.status !== "ACTIVE") parts.push(item.status.toLowerCase());
  return parts.join(" · ") || "—";
}
