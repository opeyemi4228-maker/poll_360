"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import BrandMark from "@/components/ui/BrandMark";
import SignOutButton from "@/components/auth/SignOutButton";
import DashNav from "./DashNav";
import { ROLES } from "@/lib/roles";

/**
 * The rail, retractable.
 *
 * ── WHY IT COLLAPSES TO ICONS AND NOT TO NOTHING ───────────────────────────
 * A situation room gives the map every pixel it can, so the rail has to get
 * out of the way. But collapsing it to zero leaves somebody hunting for a
 * hamburger on a wall-mounted screen, so it collapses to a 4.5rem strip of
 * icons instead: the navigation is still one click away and still visible,
 * and the map gains 11.5rem.
 *
 * ── THE WIDTH IS CSS, NOT STATE ────────────────────────────────────────────
 * The choice is remembered, and a remembered choice that arrives one frame
 * late is worse than none: the room watched the rail snap shut every time it
 * loaded a page. So `--rail` is set on <html> before the first paint by the
 * inline script in DashLayout, both this and the sheet beside it are sized
 * from that one number, and the labels are hidden by the `rail-collapsed`
 * variant rather than unmounted. React state here does nothing but drive the
 * toggle's own label and pressed state.
 * ───────────────────────────────────────────────────────────────────────────
 */
const KEY = "poll360:rail-collapsed";

/**
 * The attribute on <html> is the single copy of this, and React subscribes to
 * it rather than keeping a second one.
 *
 * There has to be a copy outside React whatever happens, because the width is
 * applied by CSS before any of this has run. Two copies of one fact is how the
 * button ends up saying "Collapse" beside a rail that is already collapsed, so
 * there is one, it lives on the document, and the component reads it.
 */
const listeners = new Set();

function subscribe(onChange) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const isCollapsed = () => document.documentElement.dataset.rail === "collapsed";
/* The server cannot know; it renders the rail open, and React corrects the
   button after hydration. The width was already right, from the script. */
const openOnServer = () => false;

function setRail(next) {
  document.documentElement.dataset.rail = next ? "collapsed" : "open";
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    /* Private mode, or storage full. The rail still moves; it just will not be
       this way round tomorrow. */
  }
  for (const onChange of listeners) onChange();
}

export default function DashRail({ user }) {
  const collapsed = useSyncExternalStore(subscribe, isCollapsed, openOnServer);
  const role = ROLES[user.role] ?? ROLES.VIEWER;

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden w-(--rail) flex-col bg-dash-rail transition-[width] duration-300 lg:flex"
    >
      {/* The rule under the brand continues the one under the topbar beside
          it, so the two meet as a single line across the whole screen instead
          of stopping dead at the rail's edge. */}
      <Link
        href="/"
        title="Poll360"
        className="flex h-18 shrink-0 items-center gap-2.5 border-b border-white/10 px-6 transition-opacity hover:opacity-80 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-white rail-collapsed:justify-center rail-collapsed:gap-0 rail-collapsed:px-2"
      >
        <BrandMark coverage={0.62} className="size-8 shrink-0 text-white" />
        <span className="font-display text-[1.3rem] leading-none font-extrabold tracking-[-0.045em] text-white rail-collapsed:sr-only">
          Poll<span className="font-mono font-bold text-red-500">360</span>
        </span>
      </Link>

      <DashNav role={user.role} rail />

      <div className="mt-auto border-t border-white/10 p-3">
        {/* Who you are, and the way to your own account. It was flat text, so
            a viewer, whose only room *is* /console, had no link to it
            anywhere in the chrome. */}
        <Link
          href="/console"
          title={`${user.name} · ${role.label}`}
          className="mb-3 flex items-center gap-3 rounded-dash-sm px-1 py-1.5 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white rail-collapsed:mb-2 rail-collapsed:justify-center rail-collapsed:gap-0 rail-collapsed:px-0"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 font-display text-[0.8125rem] font-bold text-white">
            {initials}
          </span>
          <span className="min-w-0 rail-collapsed:sr-only">
            <span className="block truncate text-[0.8125rem] font-semibold text-white">{user.name}</span>
            <span className="block truncate text-[0.6875rem] text-white/45">{role.label}</span>
          </span>
        </Link>

        {/* Full width and on its own line: in an earlier version the icon and
            the word sat on top of each other in the narrow rail. */}
        <SignOutButton variant="railGhost" size="sm" full iconOnly={collapsed} />

        <button
          type="button"
          onClick={() => setRail(!collapsed)}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-dash-sm px-2 py-2.5 text-[0.75rem] font-semibold text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
        >
          {collapsed ? (
            <PanelLeftOpen size={16} strokeWidth={2.25} />
          ) : (
            <>
              <PanelLeftClose size={16} strokeWidth={2.25} />
              Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
