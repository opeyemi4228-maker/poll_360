"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, MapPin, Search } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Which of a desk's states the room is showing, as one button.
 *
 * A desk that holds the whole country holds thirty-seven of them, and
 * thirty-seven pills in a row is wider than any screen: the page scrolled
 * sideways and carried the other controls off with it. So the state on
 * screen is the button, and the rest are a list under it that can be typed
 * into. Arrow keys move, Enter opens, Escape closes.
 */
/* `align` is the side of the button the list lines up with: "end" where the
   button sits at the right of a row, "start" where it sits at the left. */
export default function StatePicker({ states, base, align = "end" }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const box = useRef(null);
  const field = useRef(null);
  const current = states.find((state) => state.current) ?? states[0];
  const shown = useMemo(() => {
    const want = typed.trim().toLowerCase();
    return want ? states.filter((state) => state.name.toLowerCase().includes(want)) : states;
  }, [states, typed]);

  useEffect(() => {
    if (!open) return undefined;
    field.current?.focus();
    const onDown = (event) => !box.current?.contains(event.target) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const links = [...(box.current?.querySelectorAll("a") ?? [])];
    const at = links.indexOf(document.activeElement);
    const next = event.key === "ArrowDown" ? at + 1 : at - 1;
    (links[next] ?? (next < 0 ? field.current : links[0]))?.focus();
  };

  return (
    <div ref={box} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => {
          setTyped("");
          setOpen((value) => !value);
        }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Showing ${current.name}. Change state.`}
        className="flex h-10 items-center gap-2 rounded-full border border-dash-line bg-dash-card pr-3 pl-3.5 text-[0.8125rem] font-semibold whitespace-nowrap text-dash-ink transition-colors hover:border-dash-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
      >
        <MapPin size={14} className="shrink-0 text-dash-muted" aria-hidden="true" />
        {current.name}
        <span className="rounded-full bg-dash-bg px-1.5 py-0.5 text-[0.6875rem] font-semibold text-dash-muted tabular-nums">{states.length} states</span>
        <ChevronDown size={14} className={cn("shrink-0 text-dash-muted transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <div className={cn("absolute z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-dash border border-dash-line bg-dash-card shadow-e3", align === "start" ? "left-0" : "left-0 sm:right-0 sm:left-auto")}>
          <label className="flex items-center gap-2 border-b border-dash-line px-3.5">
            <Search size={14} className="shrink-0 text-dash-muted" aria-hidden="true" />
            <span className="sr-only">Find a state</span>
            <input
              ref={field}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Find a state"
              className="h-11 w-full bg-transparent text-[0.875rem] text-dash-ink placeholder:text-dash-muted focus:outline-none"
            />
          </label>
          <ul aria-label="Your states" className="max-h-[min(22rem,60vh)] overflow-y-auto p-1.5">
            {shown.map((state) => (
              <li key={state.code}>
                <Link
                  href={`${base}?at=${state.code}`}
                  onClick={() => setOpen(false)}
                  aria-current={state.current ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center justify-between gap-2 rounded-dash-sm px-3 text-[0.875rem] font-semibold outline-none",
                    state.current ? "bg-dash-ink text-white" : "text-dash-ink hover:bg-dash-bg focus-visible:bg-dash-bg"
                  )}
                >
                  {state.name}
                  {state.current && <Check size={15} strokeWidth={3} aria-hidden="true" />}
                </Link>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-3 text-[0.875rem] text-dash-muted">No state of yours matches that.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
