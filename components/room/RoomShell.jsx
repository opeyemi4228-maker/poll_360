import Link from "next/link";
import { Activity, ChevronDown, MapPin } from "lucide-react";

import BrandMark from "@/components/ui/BrandMark";
import SignOutButton from "@/components/auth/SignOutButton";
import LiveRefresh from "@/components/dash/LiveRefresh";
import RoomLive, { RoomAlarms } from "./RoomLive";
import { pickRace } from "@/app/room/actions";
import { greetingNow } from "@/lib/room/page";
import { RACES } from "@/lib/races";
import { ROLES } from "@/lib/roles";
import { cn, formatNumber } from "@/lib/utils";

/**
 * The frame every situation room desk is drawn in.
 *
 * ── THE SAME FRAME AS THE ROOM THAT WAS ALREADY THERE ──────────────────────
 * One bar across the top and no rail down the side: the brand, which desk
 * this is (and the others this account may open), that desk's own tabs, the
 * wall clock, the alarms, and who is signed in. Every rem a rail took was a
 * rem the map lost, on screens where the map is the point.
 *
 * Under it, one line saying who this is and what their ground is doing, with
 * the project and the contest beside it. Nothing in the frame links to
 * analytics or planning, because nothing in it knows they exist.
 *
 * `tabs` are `{ id, name, href, count }`. `summary` is the sentence under the
 * greeting.
 */
export default function RoomShell({ ctx, title, tabs = null, sections = null, current = null, openCount = null, summary = null, children }) {
  const { user, project, race, faces, face, groundLabel } = ctx;
  const role = ROLES[user.role];
  const items = tabs ?? sections ?? [];
  const firstName = String(user.name ?? "").trim().split(/\s+/)[0];

  return (
    <div className="dash min-h-screen bg-dash-sheet">
      <header className="sticky top-0 z-30 border-b border-dash-line bg-dash-sheet">
        <RoomAlarms canAcknowledge={ctx.holds("field:act")} more={face ? `${face.route}?tab=situations` : null} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:px-6">
          <span className="flex shrink-0 items-center gap-2">
            <BrandMark coverage={0.62} className="size-8 text-dash-ink" />
            <span className="hidden font-display text-[1.25rem] leading-none font-extrabold tracking-[-0.045em] text-dash-ink sm:inline">
              Poll<span className="font-mono font-bold text-red-500">360</span>
            </span>
          </span>

          {/* Which desk this is. An account that holds several switches here. */}
          <details className="relative shrink-0">
            <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-full bg-dash-ink px-4 text-[0.9375rem] font-bold text-white">
              <Activity size={16} aria-hidden="true" />
              {title}
              {openCount ? <span className="rounded-full bg-white px-2 py-0.5 text-[0.75rem] text-dash-ink tabular-nums">{formatNumber(openCount)}</span> : null}
              {faces.length > 1 && <ChevronDown size={15} aria-hidden="true" />}
            </summary>
            {faces.length > 1 && (
              <ul className="absolute left-0 z-50 mt-2 w-64 rounded-dash border border-dash-line bg-dash-card p-1.5 shadow-e3">
                {faces.map((item) => (
                  <li key={item.id}>
                    <Link href={item.route} aria-current={face?.id === item.id ? "page" : undefined} className={cn("block rounded-dash-sm px-3 py-2 text-[0.875rem] font-semibold", face?.id === item.id ? "bg-dash-ink text-white" : "text-dash-ink hover:bg-dash-bg")}>
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </details>

          {items.length > 0 && (
            <nav aria-label={`${title} sections`} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-full bg-dash-bg p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={current === item.id ? "page" : undefined}
                  className={cn("flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[0.875rem] font-semibold whitespace-nowrap", current === item.id ? "bg-dash-ink text-white" : "text-dash-muted hover:text-dash-ink")}
                >
                  {item.name}
                  {item.count ? <span className={cn("rounded-full px-1.5 text-[0.75rem] tabular-nums", current === item.id ? "bg-white/20" : "bg-dash-card")}>{formatNumber(item.count)}</span> : null}
                </Link>
              ))}
            </nav>
          )}

          <div className={cn("flex items-center gap-2", items.length ? "" : "ml-auto")}>
            <RoomLive canAcknowledge={ctx.holds("field:act")} title={title} openCount={openCount} />
            <span className="flex h-11 items-center gap-2 rounded-full border border-dash-line pr-1 pl-1.5">
              <span className="flex size-8 items-center justify-center rounded-full bg-blue-50 font-display text-[0.75rem] font-bold text-blue-700" aria-hidden="true">
                {String(user.name ?? "?").split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <span className="hidden max-w-36 min-w-0 leading-tight xl:block">
                <span className="block truncate text-[0.8125rem] font-semibold text-dash-ink">{user.name}</span>
                <span className="block truncate text-[0.6875rem] text-dash-muted">{role?.label ?? user.role}</span>
              </span>
              <SignOutButton variant="railIcon" size="sm" iconOnly />
            </span>
          </div>
        </div>
      </header>

      <main className="px-4 pt-4 pb-10 lg:px-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="font-display text-[1.5rem] leading-tight font-bold tracking-[-0.02em] text-dash-ink">
              {greetingNow()}{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-0.5 text-[0.875rem] text-dash-muted">{summary ?? title}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[0.875rem]">
            <span className="flex h-10 items-center rounded-full border border-dash-line px-4 font-semibold text-dash-ink">{project?.title ?? "No election project open"}</span>
            {project && (
              <form action={pickRace} className="flex h-10 items-center gap-1 rounded-full border border-dash-line pr-1 pl-3">
                <label className="sr-only" htmlFor="room-race">Contest</label>
                <select id="room-race" name="race" defaultValue={race} className="h-8 bg-transparent text-[0.875rem] font-semibold text-dash-ink focus:outline-none">
                  {RACES.map((each) => (
                    <option key={each.id} value={each.id}>{each.label}</option>
                  ))}
                </select>
                <button type="submit" className="h-8 rounded-full bg-dash-bg px-3 text-[0.75rem] font-semibold text-dash-ink hover:bg-dash-line">Show</button>
              </form>
            )}
            {/* The same live chip the situation room carries: it refreshes
                the whole screen on its own rhythm, says when it last did, and
                turns when the figures have gone stale. Events from the room
                refresh it sooner than that. */}
            {project && <LiveRefresh seconds={12} />}
            <span className="flex h-10 items-center gap-1.5 rounded-full border border-dash-line px-4 font-semibold text-dash-ink">
              <MapPin size={14} aria-hidden="true" />
              {groundLabel}
            </span>
          </div>
        </div>

        {!project ? (
          <p className="rounded-dash bg-dash-bg p-8 text-center text-[0.9375rem] text-dash-muted">
            No election project is open yet. The Super Admin opens one, and this screen fills as results arrive.
          </p>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
