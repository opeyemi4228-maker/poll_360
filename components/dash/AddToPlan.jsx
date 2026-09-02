"use client";

import { useSyncExternalStore } from "react";
import { Check, Plus } from "lucide-react";

import { campaign } from "@/lib/campaign";
import { isCovered, pathKey } from "@/lib/coverage";
import { cn } from "@/lib/utils";

/**
 * The control that turns a finding into work.
 *
 * ── WHY THE SAME BUTTON ON EVERY SCREEN ────────────────────────────────────
 * Each dashboard answers a different question, and until now each one ended
 * there: you learned something and then closed the tab. This is the sentence
 * that follows every one of those findings — put these places in the plan —
 * and it is deliberately the same control everywhere, because a campaign has
 * one plan and the point is that the turnout screen and the party screen and
 * the map are all writing into it.
 *
 * ── IT SAYS WHAT IT WILL DO, AND WHAT IT ALREADY DID ───────────────────────
 * The count on the face is the places this press would newly add, not the
 * length of the list it was handed. Pressing "add the six biggest" twice adds
 * six and then nothing, and the button says so rather than looking broken —
 * which matters, because these buttons add places somebody is about to be
 * asked to pay to cover.
 */
export default function AddToPlan({
  /** Paths to add: arrays of names, state first. */
  paths = [],
  /** The sentence that goes in the plan beside every one of them. */
  reason,
  /** Which screen it came from, for the export and the panel. */
  from,
  label = "Add to plan",
  className,
}) {
  const plan = useSyncExternalStore(campaign.subscribe, campaign.snapshot, campaign.serverSnapshot);

  const fresh = paths.filter((path) => !isCovered(plan.marks, pathKey(path)));
  const already = paths.length - fresh.length;
  const nothingToDo = paths.length === 0 || fresh.length === 0;

  return (
    <button
      type="button"
      disabled={nothingToDo}
      onClick={() => campaign.add(paths, reason, from)}
      title={
        nothingToDo
          ? paths.length
            ? `All ${paths.length} are already covered by the plan`
            : "Nothing to add"
          : reason
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-dash-sm border px-2.5 py-1.5 text-[0.75rem] font-bold transition-colors",
        nothingToDo
          ? "cursor-default border-dash-line text-dash-muted"
          : "border-dash-ink bg-dash-ink text-white hover:bg-red-600",
        className
      )}
    >
      {nothingToDo && paths.length ? (
        <Check size={13} strokeWidth={3} />
      ) : (
        <Plus size={13} strokeWidth={3} />
      )}
      {nothingToDo && paths.length ? "In the plan" : label}
      {fresh.length > 0 && (
        <span className="figure rounded-full bg-white/20 px-1.5 text-[0.6875rem]">
          {fresh.length}
        </span>
      )}
      {already > 0 && fresh.length > 0 && (
        <span className="text-[0.625rem] font-normal opacity-70">+{already} already in</span>
      )}
    </button>
  );
}
