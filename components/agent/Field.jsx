"use client";

import { useId } from "react";
import { TriangleAlert } from "lucide-react";

/**
 * One labelled thing on the coordinator's forms.
 *
 * ── WHY IT IS ITS OWN FILE ─────────────────────────────────────────────────
 * It began inside AgentAuthForm, which was right while that form was the only
 * one. The polling unit picker sits inside the same form, needs labels that
 * match it exactly, and is far too large to live in the same file — so the two
 * would have had a label style each, drifting apart at the first change. This
 * is the same component both of them render, which is the only way a label on
 * one half of a form reliably looks like a label on the other.
 *
 * ── THE SIZES ARE NOT A HOUSE STYLE, THEY ARE THE BRIEF ────────────────────
 * 56px of height, 17px of text. The person filling this in is standing at a
 * polling unit, holding a result sheet in one hand, on a phone screen they can
 * barely see. Every dimension here is set by that and not by what looks
 * balanced on a laptop.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function Field({ label, hint, error, name, children }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline justify-between gap-3">
        <span className="text-[0.9375rem] font-bold text-ink-950">{label}</span>
        {hint && <span className="text-[0.8125rem] text-content-subtle">{hint}</span>}
      </label>
      <div className="mt-2">{children(id)}</div>
      {error && (
        <p id={`${name}-error`} className="mt-2 flex gap-2 text-[0.875rem] text-red-700">
          <TriangleAlert size={14} strokeWidth={2.5} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/** The one input shape these forms use, in its normal and its wrong state. */
export const fieldInput = (error) =>
  [
    "h-14 w-full rounded-dash-sm border-2 bg-white px-4 text-[1.0625rem] text-ink-950",
    "placeholder:text-ink-400 focus:outline-none",
    error ? "border-red-500" : "border-ink-300 focus:border-ink-950",
  ].join(" ");

/**
 * A select, styled as one of these inputs.
 *
 * `appearance-none` and a drawn chevron, because the platform arrow lands in a
 * different place on every phone and the one thing this form cannot afford is
 * a field somebody does not recognise as tappable.
 */
export const fieldSelect = (error) =>
  [
    fieldInput(error),
    "appearance-none bg-[right_1rem_center] bg-no-repeat pr-11",
    "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%3E%3Cpath%20d%3D%22M4%206l4%204%204-4%22/%3E%3C/svg%3E')]",
  ].join(" ");
