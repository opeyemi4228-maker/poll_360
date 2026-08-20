"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import BrandMark from "@/components/ui/BrandMark";
import AlarmBell from "./AlarmBell";
import DashSearch from "./DashSearch";
import SignOutButton from "@/components/auth/SignOutButton";
import { ROLES } from "@/lib/roles";
import Assistant from "./Assistant";
import { cn } from "@/lib/utils";

/**
 * The situation room's chrome: everything across the top, nothing down the side.
 *
 * ── WHY THIS ROOM LOSES THE RAIL ───────────────────────────────────────────
 * A sidebar costs 16rem of width permanently, and this is the one screen in
 * the product whose entire job is a map of a country. On a wall display that
 *16rem is the difference between reading Bayelsa and squinting at it. So the
 * navigation goes up top as a pill group, the same links, a fifth of the
 * footprint, and the map gets the full width beneath it.
 *
 * Every other dashboard keeps its rail: they are list-and-form screens where
 * vertical navigation is genuinely better. Chrome should follow the work, not
 * be uniform for its own sake.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function TopShell({
  user,
  tabs,
  tabGroups = null,
  active,
  onTab,
  greeting,
  subtitle,
  children,
  aside,
  /* The two live controls in the bar. Both are optional: a dashboard with
     nowhere to search and nothing to be alarmed about simply omits them, and
     the bar closes up around the gap. */
  searchItems,
  onSearchPick,
  searchPlaceholder,
  alerts,
  onOpenAlerts,
}) {
  const [menu, setMenu] = useState(false);
  const role = ROLES[user.role] ?? ROLES.VIEWER;

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="min-h-screen bg-dash-bg">
      {/* ------------------------------------------------------------ bar */}
      <header className="sticky top-0 z-40 border-b border-dash-line bg-dash-card">
        <div className="flex h-18 items-center gap-4 px-4 lg:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <BrandMark coverage={0.62} className="size-8 text-dash-ink" />
            <span className="hidden font-display text-[1.25rem] leading-none font-extrabold tracking-[-0.045em] text-dash-ink sm:inline">
              Poll<span className="font-mono font-bold text-red-500">360</span>
            </span>
          </Link>

          {/* One rounded track with the active tab a solid block inside it, so
              the set reads as a single control. Where groups are supplied they
              are separated by a hairline rather than by a gap: a gap at this
              size reads as three controls, a rule reads as one control with
              structure, which is what it is. */}
          <nav
            aria-label="Dashboards"
            className="mx-auto hidden items-center rounded-full bg-dash-bg p-1 xl:flex"
          >
            {(tabGroups ?? [{ id: "all", tabs }]).map((group, index) => (
              <span key={group.id} className="flex items-center">
                {index > 0 && (
                  <span
                    aria-hidden="true"
                    className="mx-1.5 h-5 w-px shrink-0 bg-dash-line"
                  />
                )}
                {group.tabs.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => onTab(tab.value)}
                    aria-pressed={active === tab.value}
                    title={group.label}
                    className={cn(
                      "rounded-full px-3.5 py-2 text-[0.8125rem] font-semibold whitespace-nowrap transition-colors",
                      active === tab.value
                        ? "bg-dash-card text-dash-ink shadow-sm"
                        : "text-dash-muted hover:text-dash-ink"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </span>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {searchItems && (
              <div className="hidden xl:block">
                <DashSearch
                  items={searchItems}
                  onPick={onSearchPick}
                  placeholder={searchPlaceholder}
                />
              </div>
            )}

            {alerts && <AlarmBell incidents={alerts} onOpenStream={onOpenAlerts} />}

            {/* The account. A menu rather than a permanent sign-out button:
                signing out is a once-a-night action and should not sit at the
                same weight as the tabs. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu((value) => !value)}
                aria-expanded={menu}
                className="flex items-center gap-2.5 rounded-full border border-dash-line py-1.5 pr-3 pl-1.5 transition-colors hover:border-dash-ink"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-dash-ink font-display text-[0.75rem] font-bold text-white">
                  {initials}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block text-[0.8125rem] leading-tight font-semibold text-dash-ink">
                    {user.name}
                  </span>
                  <span className="block text-[0.6875rem] leading-tight text-dash-muted">
                    {role.label}
                  </span>
                </span>
                <ChevronDown size={14} className="shrink-0 text-dash-muted" />
              </button>

              {menu && (
                <>
                  <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setMenu(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="absolute right-0 z-20 mt-2 w-56 rounded-dash border border-dash-line bg-dash-card p-2 shadow-lg">
                    <Link
                      href="/console"
                      className="block rounded-dash-sm px-3 py-2.5 text-[0.875rem] text-dash-ink hover:bg-dash-bg"
                    >
                      Your account
                    </Link>
                    <Link
                      href="/#board"
                      className="block rounded-dash-sm px-3 py-2.5 text-[0.875rem] text-dash-ink hover:bg-dash-bg"
                    >
                      Public board
                    </Link>
                    <div className="mt-2 border-t border-dash-line pt-2">
                      <SignOutButton variant="dashOutline" size="sm" full />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs move under the bar on narrow screens rather than disappearing
            into a menu, they are the primary control of this screen. */}
        <div className="flex gap-1 overflow-x-auto border-t border-dash-line px-4 py-2 lg:hidden">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onTab(tab.value)}
              aria-pressed={active === tab.value}
              className={cn(
                "shrink-0 rounded-full px-4 py-2.5 text-[0.875rem] font-semibold transition-colors",
                active === tab.value
                  ? "bg-dash-ink text-white"
                  : "bg-dash-bg text-dash-muted"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* -------------------------------------------------------- greeting */}
      {/* Tighter than a marketing header on purpose: on a 13-inch laptop every
          rem spent here is a rem the map does not get. */}
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-3 pb-2.5 lg:px-6">
        <div>
          <h1 className="font-display text-[1.25rem] leading-none font-extrabold tracking-[-0.035em] text-dash-ink">
            {greeting}
          </h1>
          {subtitle && <p className="mt-1.5 text-[0.875rem] text-dash-muted">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">{aside}</div>
      </div>

      <main id="main" className="px-4 pb-3 lg:px-6 lg:pb-4">
        {children}
      </main>

      {/* Rides with the shell so every dashboard has the same assistant, and it
          is told which surface is open so "what am I looking at" answers about
          the screen in front of the person asking. */}
      <Assistant tab={active} />
    </div>
  );
}
