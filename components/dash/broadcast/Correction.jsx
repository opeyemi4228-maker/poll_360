"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, CornerDownRight, Loader2, X } from "lucide-react";

import { draftCorrection } from "@/app/broadcast/actions";
import { CORRECTION_MODES } from "@/lib/broadcast";
import { Said, useAction } from "./Queue";
import { cn } from "@/lib/utils";

/**
 * Putting an update that has gone out right.
 *
 * A dialog rather than a panel on the card, because this is the one thing on
 * the desk that should not be done in passing: it is written, it goes to an
 * editor like any update, and when it airs the original is marked or taken
 * down on the live page. The rules are in lib/broadcast.js (CORRECTION_MODES)
 * and app/broadcast/actions.js (draftCorrection).
 *
 * Keyed by the item it corrects (see PublishingList), so opening it for a
 * different update starts with empty words rather than the last one's.
 *
 * @param item     the update being corrected, or null when closed
 * @param initial  which of the two to start on
 */
export default function Correction({ item, initial = "correct", onClose }) {
  const dialog = useRef(null);
  const [mode, setMode] = useState(initial);
  const [body, setBody] = useState("");
  const { pending, said, run } = useAction();

  /* The native dialog: it traps focus, closes on Escape and returns focus to
     the button that opened it, which is the accessibility a hand-built
     overlay has to reimplement and usually gets wrong. */
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (item && !node.open) node.showModal();
    if (!item && node.open) node.close();
  }, [item]);

  const retract = mode === "retract";

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="correction-title"
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-dash border border-dash-line bg-dash-card p-0 text-dash-ink shadow-2xl backdrop:bg-blue-950/60 backdrop:backdrop-blur-[2px]"
    >
      {item && (
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => draftCorrection({ id: item.id, mode, body }), { onDone: () => setTimeout(onClose, 1200) });
          }}
        >
          <header className="flex items-start gap-3 border-b border-dash-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-[0.75rem] font-medium text-dash-muted">Put it right</p>
              <h2 id="correction-title" className="mt-1 line-clamp-2 text-[1.0625rem] leading-snug font-extrabold">
                {item.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 flex size-9 items-center justify-center rounded-full text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
            >
              <X size={18} />
            </button>
          </header>

          <div className="flex flex-col gap-4 px-5 py-4">
            <fieldset>
              <legend className="sr-only">What to do</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(CORRECTION_MODES).map(([id, row]) => {
                  const on = mode === id;
                  const Icon = id === "retract" ? Ban : CornerDownRight;
                  return (
                    <label
                      key={id}
                      className={cn(
                        "flex cursor-pointer flex-col gap-1 rounded-dash-sm border px-3.5 py-3 transition-colors",
                        on ? (id === "retract" ? "border-red-600 bg-red-50" : "border-dash-ink bg-dash-bg") : "border-dash-line hover:border-dash-muted"
                      )}
                    >
                      <input type="radio" name="mode" value={id} checked={on} onChange={() => setMode(id)} className="sr-only" />
                      <span className={cn("flex items-center gap-2 text-[0.875rem] font-extrabold", on && id === "retract" && "text-red-700")}>
                        <Icon size={16} strokeWidth={2.5} aria-hidden="true" />
                        {row.verb}
                      </span>
                      <span className="text-[0.75rem] leading-snug text-dash-muted">{row.why}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <label className="block">
              <span className="text-[0.8125rem] font-medium text-dash-muted">
                {retract ? "Why it is being withdrawn" : "What the right version is"}
              </span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={4}
                required
                autoFocus
                placeholder={
                  retract
                    ? "We have withdrawn our earlier update on Kano. The figures included polling units that had not finished counting."
                    : "Our earlier update gave the APC 41% in Kano. The correct figure, with 62% of polling units counted, is 38%."
                }
                className="mt-1.5 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 py-2 text-[0.875rem] leading-relaxed focus:border-dash-ink focus:outline-none"
              />
            </label>

            <p className="rounded-dash-sm bg-dash-bg px-3 py-2.5 text-[0.75rem] leading-relaxed text-dash-muted">
              This goes to an editor first, like any update. When it goes out it is sent to the same platforms as the
              original, and the original is {retract ? "taken off the live page — its link says it was withdrawn." : "marked as corrected on the live page."}
            </p>
            <Said said={said} />
          </div>

          <footer className="flex flex-wrap justify-end gap-2 border-t border-dash-line px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-dash-sm px-4 text-[0.8125rem] font-bold text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || body.trim().length < 12}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-dash-sm px-4 text-[0.8125rem] font-extrabold text-white disabled:opacity-40",
                retract ? "bg-red-600 hover:bg-red-500" : "bg-dash-ink hover:bg-black"
              )}
            >
              {pending && <Loader2 size={15} className="animate-spin" />}
              Send to an editor
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}
