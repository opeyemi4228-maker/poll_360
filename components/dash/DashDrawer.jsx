"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import BrandMark from "@/components/ui/BrandMark";
import SignOutButton from "@/components/auth/SignOutButton";
import DashNav from "./DashNav";
import { ROLES } from "@/lib/roles";

/**
 * The rail, on a phone.
 *
 * The fixed sidebar is hidden below `lg`, which left every dashboard with no
 * navigation at all on the device most of these people are actually holding, * a polling unit coordinator is on a phone by definition, and a producer
 * checking coverage from a corridor is on one too.
 *
 * Same links, same order, same permission filter as the rail: one nav, two
 * presentations, so there is no second list to keep in step.
 */
export default function DashDrawer({ user }) {
  const [open, setOpen] = useState(false);
  const role = ROLES[user.role] ?? ROLES.VIEWER;

  /* A drawer over a scrolling page is a drawer people scroll behind. */
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* Escape closes it, because a full-screen overlay with one small X is a trap
     for anybody navigating by keyboard. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="dash-drawer"
        aria-label="Open menu"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-dash-sm border border-dash-line bg-dash-card text-dash-ink transition-colors hover:border-dash-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink lg:hidden"
      >
        <Menu size={19} strokeWidth={2.25} />
      </button>

      {open && (
        <div id="dash-drawer" className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-dash-ink/45"
          />

          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col rounded-r-dash-panel bg-dash-rail shadow-e4">
            <div className="flex h-18 shrink-0 items-center gap-2.5 px-5">
              <BrandMark coverage={0.62} className="size-8 text-dash-ink" />
              <span className="font-display text-[1.3rem] leading-none font-extrabold tracking-[-0.045em] text-dash-ink">
                Poll<span className="font-mono font-bold text-red-500">360</span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="ml-auto inline-flex size-10 items-center justify-center rounded-dash-sm border border-dash-line text-dash-ink"
              >
                <X size={18} strokeWidth={2.25} />
              </button>
            </div>

            <div onClick={() => setOpen(false)} className="flex min-h-0 flex-1 flex-col">
              <DashNav role={user.role} />
            </div>

            <div className="border-t border-dash-line p-3.5">
              {/* The same identity block the rail carries, and the same link
                  out of it: a viewer's only room is /console, and flat text
                  gave them no way to reach it from a phone. */}
              <Link
                href="/console"
                onClick={() => setOpen(false)}
                className="mb-2 flex items-center gap-3 rounded-dash-sm px-2 py-2 transition-colors hover:bg-dash-bg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-dash-ink"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-50 font-display text-[0.8125rem] font-bold text-blue-700">
                  {user.name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[0.8125rem] font-semibold text-dash-ink">
                    {user.name}
                  </span>
                  <span className="block truncate text-[0.75rem] text-dash-muted">{role.label}</span>
                </span>
              </Link>
              <SignOutButton variant="railQuiet" size="sm" full />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
