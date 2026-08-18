"use client";

import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import BrandMark from "@/components/ui/BrandMark";
import SignOutButton from "@/components/auth/SignOutButton";
import DashNav from "./DashNav";
import { ROLES } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * The rail, retractable.
 *
 * ── WHY IT COLLAPSES TO ICONS AND NOT TO NOTHING ───────────────────────────
 * A situation room gives the map every pixel it can, so the rail has to get
 * out of the way. But collapsing it to zero leaves somebody hunting for a
 * hamburger on a wall-mounted screen, so it collapses to a 4.5rem strip of
 * icons instead: the navigation is still one click away and still visible,
 * and the map gains 11rem.
 *
 * The choice is remembered. A room sets this once at the start of the night
 * and should never have to set it again after a refresh.
 * ───────────────────────────────────────────────────────────────────────────
 */
const KEY = "poll360:rail-collapsed";

export default function DashRail({ user }) {
  const [collapsed, setCollapsed] = useState(false);
  const role = ROLES[user.role] ?? ROLES.VIEWER;

  /* Read after mount, on the next frame: the server has no idea what this
     browser chose last time, and reading it during render would make the two
     disagree about the first paint. */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setCollapsed(localStorage.getItem(KEY) === "1");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggle = () => {
    setCollapsed((value) => {
      localStorage.setItem(KEY, value ? "0" : "1");
      /* The sheet beside it reads the same flag to know how far to inset. */
      document.documentElement.dataset.rail = value ? "open" : "collapsed";
      return !value;
    });
  };

  useEffect(() => {
    document.documentElement.dataset.rail = collapsed ? "collapsed" : "open";
  }, [collapsed]);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden flex-col bg-dash-rail transition-[width] duration-300 lg:flex",
        collapsed ? "w-18" : "w-64"
      )}
    >
      <div
        className={cn(
          "flex h-18 shrink-0 items-center gap-2.5",
          collapsed ? "justify-center px-2" : "px-6"
        )}
      >
        <BrandMark coverage={0.62} className="size-8 shrink-0 text-white" />
        {!collapsed && (
          <span className="font-display text-[1.3rem] leading-none font-extrabold tracking-[-0.045em] text-white">
            Poll<span className="font-mono font-bold text-red-500">360</span>
          </span>
        )}
      </div>

      <DashNav role={user.role} collapsed={collapsed} />

      <div className="mt-auto border-t border-white/10 p-3">
        {!collapsed && (
          <div className="mb-3 flex items-center gap-3 px-1">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 font-display text-[0.8125rem] font-bold text-white">
              {user.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[0.8125rem] font-semibold text-white">{user.name}</p>
              <p className="truncate text-[0.6875rem] text-white/45">{role.label}</p>
            </div>
          </div>
        )}

        {/* Full width and on its own line: in the previous version the icon and
            the word sat on top of each other in the narrow rail. */}
        <SignOutButton variant="railGhost" size="sm" full iconOnly={collapsed} />

        <button
          type="button"
          onClick={toggle}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-dash-sm px-2 py-2.5 text-[0.75rem] font-semibold text-white/50 transition-colors hover:bg-white/10 hover:text-white"
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
