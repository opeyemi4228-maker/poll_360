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
 * White, with the place you are standing drawn as a navy tile.
 *
 * ── WHY IT COLLAPSES TO ICONS AND NOT TO NOTHING ───────────────────────────
 * A situation room gives the map every pixel it can, so the rail has to get
 * out of the way. But collapsing it to zero leaves somebody hunting for a
 * hamburger on a wall-mounted screen, so it collapses to a 5rem strip of
 * icons instead: the navigation is still one click away and still visible,
 * and the page gains 10rem.
 *
 * ── THE WIDTH IS CSS, NOT STATE ────────────────────────────────────────────
 * The choice is remembered, and a remembered choice that arrives one frame
 * late is worse than none: the room watched the rail snap shut every time it
 * loaded a page. So `--rail` is set on <html> before the first paint by the
 * inline script in app/layout.js, both this and the sheet beside it are sized
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

  const toggle = (
    <button
      type="button"
      onClick={() => setRail(!collapsed)}
      aria-pressed={collapsed}
      aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
      title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
      className="flex size-10 shrink-0 items-center justify-center rounded-dash-sm text-dash-muted transition-colors hover:bg-dash-bg hover:text-dash-ink focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-dash-ink"
    >
      {collapsed ? <PanelLeftOpen size={18} strokeWidth={2} /> : <PanelLeftClose size={18} strokeWidth={2} />}
    </button>
  );

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden w-(--rail) flex-col border-r border-dash-line bg-dash-rail transition-[width] duration-300 lg:flex"
    >
      {/* White, like the sheet beside it, and told apart from it by one
          hairline. The navy that used to fill this column is spent on the
          tile that says where you are, which is the only thing in a
          navigation that needs to shout.

          The fold control sits up here beside the brand, which is where a
          hand goes looking for it, and out of the footer, where it and the
          sign-out between them took a fifth of the column from the links. */}
      <div className="flex h-20 shrink-0 items-center gap-1 pr-3 pl-5 rail-collapsed:justify-center rail-collapsed:px-0">
        <Link
          href="/"
          title="Poll360"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-dash-sm transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink rail-collapsed:flex-none"
        >
          <BrandMark coverage={0.62} className="size-8 shrink-0 text-dash-ink" />
          <span className="font-display text-[1.3rem] leading-none font-extrabold tracking-[-0.045em] text-dash-ink rail-collapsed:sr-only">
            Poll<span className="font-mono font-bold text-red-500">360</span>
          </span>
        </Link>
        <span className="rail-collapsed:hidden">{toggle}</span>
      </div>

      <DashNav role={user.role} rail />

      {/* One row: who you are, and the way out. Collapsed, the same three
          things stand in a column. */}
      <div className="mt-auto flex items-center gap-1 border-t border-dash-line p-3 rail-collapsed:flex-col rail-collapsed:px-0">
        {/* Who you are, and the way to your own account. It was flat text, so
            a viewer, whose only room *is* /console, had no link to it
            anywhere in the chrome. */}
        <Link
          href="/console"
          title={`${user.name} · ${role.label}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-dash-sm px-2 py-1.5 transition-colors hover:bg-dash-bg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-dash-ink rail-collapsed:flex-none rail-collapsed:px-1"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-50 font-display text-[0.8125rem] font-bold text-blue-700">
            {initials}
          </span>
          <span className="min-w-0 rail-collapsed:sr-only">
            <span className="block truncate text-[0.8125rem] font-semibold text-dash-ink">{user.name}</span>
            <span className="block truncate text-[0.75rem] text-dash-muted">{role.label}</span>
          </span>
        </Link>

        <SignOutButton variant="railIcon" size="sm" iconOnly />

        <span className="hidden rail-collapsed:block">{toggle}</span>
      </div>
    </aside>
  );
}
