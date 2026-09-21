"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The sections inside one dashboard, as one compact segmented control.
 *
 * ── WHY IT IS AS WIDE AS ITS WORDS AND NO WIDER ────────────────────────────
 * Each dashboard used to stretch its three or four sections across the whole
 * sheet. On a wide screen that put the choices a metre apart, turned the
 * chosen one into a black banner a third of the page long, and read as a
 * heading rather than as a switch. A control sized to its labels sits under
 * the title it belongs to, where the eye already is, and the whole choice is
 * taken in at a glance.
 *
 * Pills, large enough to hit without aiming — 44px, the size a finger or a
 * hurried cursor needs — and in the same shape as every other switch in the
 * room, so the whole screen reads as one family of controls.
 * On a phone the row scrolls rather than wraps: a wrapped segmented control
 * stops looking like one choice.
 *
 * `tone="dark"` is the same control for a navy band — the broadcast desk
 * seats its sections inside its own header, so the header and the choice of
 * screen read as one console rather than two stacked strips. Solid fills
 * throughout: nothing translucent over a band that sits above live output.
 *
 * Arrow keys move between sections, as any tablist is expected to.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function SectionTabs({ label, items, value, onChange, tone = "light", className }) {
  const dark = tone === "dark";
  const listRef = useRef(null);

  const onKeyDown = (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    const edge = { Home: 0, End: items.length - 1 }[event.key];
    if (step === undefined && edge === undefined) return;
    event.preventDefault();

    const at = items.findIndex((item) => item.id === value);
    const next = edge ?? (at + step + items.length) % items.length;
    onChange(items[next].id);
    listRef.current?.querySelectorAll('[role="tab"]')[next]?.focus();
  };

  return (
    <div className={cn("-mx-1 overflow-x-auto px-1 [scrollbar-width:none]", className)}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border p-1.5",
          dark ? "border-blue-800 bg-blue-900" : "border-dash-line bg-dash-card"
        )}
      >
        {items.map((item) => {
          const active = value === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(item.id)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2.5 rounded-full px-5 text-[0.9375rem] font-semibold whitespace-nowrap transition-colors sm:px-6",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                dark
                  ? active
                    ? "bg-white text-blue-950 focus-visible:outline-white"
                    : "text-blue-200 hover:bg-blue-800 hover:text-white focus-visible:outline-white"
                  : active
                    ? "bg-dash-ink text-white focus-visible:outline-dash-ink"
                    : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink focus-visible:outline-dash-ink"
              )}
            >
              {Icon && <Icon size={17} strokeWidth={2.25} aria-hidden="true" />}
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
