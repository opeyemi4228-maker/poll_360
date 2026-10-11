import Link from "next/link";
import { MapPin } from "lucide-react";

import BrandMark from "@/components/ui/BrandMark";
import SignOutButton from "@/components/auth/SignOutButton";
import RoomLive, { RoomAlarms } from "./RoomLive";
import { pickRace } from "@/app/room/actions";
import { RACES } from "@/lib/races";
import { ROLES } from "@/lib/roles";
import { cn } from "@/lib/utils";

/**
 * The frame every situation room screen is drawn in.
 *
 * A white rail holding only the screens this account may open, the top bar
 * the specification sets out (project, contest, which desk this is, the
 * ground it covers, the clock, the connection, the system light, the alarm
 * tray), and the page. Nothing in it links to analytics or planning, because
 * nothing in it knows they exist.
 *
 * `sections` is a second list under the switcher, for a screen with parts of
 * its own. `panel` is the navy column down the right-hand side.
 */
export default function RoomShell({ ctx, title, sections = null, current = null, openCount = null, panel = null, children }) {
  const { user, project, race, faces, face, groundLabel } = ctx;
  const role = ROLES[user.role];

  return (
    <div className="dash min-h-screen bg-dash-sheet">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-dash-line bg-dash-rail lg:flex">
        <div className="flex h-20 shrink-0 items-center gap-2.5 px-5">
          <BrandMark coverage={0.62} className="size-8 shrink-0 text-dash-ink" />
          <span className="font-display text-[1.3rem] leading-none font-extrabold tracking-[-0.045em] text-dash-ink">
            Poll<span className="font-mono font-bold text-red-500">360</span>
          </span>
        </div>

        <nav aria-label="Your screens" className="flex-1 overflow-y-auto px-3 pb-4">
          <p className="px-2 pb-2 text-[0.75rem] font-semibold text-dash-muted">Situation room</p>
          <ul className="space-y-1">
            {faces.map((item) => (
              <li key={item.id}>
                <Rail href={item.route} active={face?.id === item.id}>{item.name}</Rail>
              </li>
            ))}
          </ul>

          {sections && (
            <>
              <p className="px-2 pt-6 pb-2 text-[0.75rem] font-semibold text-dash-muted">{title}</p>
              <ul className="space-y-1">
                {sections.map((section) => (
                  <li key={section.id}>
                    <Rail href={section.href} active={current === section.id} quiet>{section.name}</Rail>
                  </li>
                ))}
              </ul>
            </>
          )}
        </nav>

        <div className="flex items-center gap-2 border-t border-dash-line p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-50 font-display text-[0.8125rem] font-bold text-blue-700" aria-hidden="true">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.8125rem] font-semibold text-dash-ink">{user.name}</span>
            <span className="block truncate text-[0.75rem] text-dash-muted">{role?.label ?? user.role}</span>
          </span>
          <SignOutButton variant="railIcon" size="sm" iconOnly />
        </div>
      </aside>

      <div className={cn("lg:pl-60", panel && "xl:pr-[22.5rem]")}>
        <header className="sticky top-0 z-30 border-b border-dash-line bg-dash-sheet">
          <RoomAlarms canAcknowledge={ctx.holds("field:act")} more={face ? `${face.route}?tab=situations` : null} />
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3 lg:px-8">
            <div className="min-w-0">
              <h1 className="truncate font-display text-[1.375rem] leading-tight font-bold tracking-[-0.02em] text-dash-ink">{title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.8125rem] text-dash-muted">
                <span className="font-semibold text-dash-ink">{project?.title ?? "No election project open"}</span>
                {project && (
                  <form action={pickRace} className="flex items-center gap-1.5">
                    <label className="sr-only" htmlFor="room-race">Contest</label>
                    <select id="room-race" name="race" defaultValue={race} className="h-8 rounded-dash-sm border border-dash-line bg-dash-card px-2 text-[0.8125rem] font-semibold text-dash-ink">
                      {RACES.map((each) => (
                        <option key={each.id} value={each.id}>{each.label}</option>
                      ))}
                    </select>
                    <button type="submit" className="h-8 rounded-dash-sm border border-dash-line px-2.5 text-[0.75rem] font-semibold text-dash-ink hover:border-dash-ink">Show</button>
                  </form>
                )}
                <span className="inline-flex items-center gap-1 rounded-full border border-dash-line bg-dash-bg px-2.5 py-1 text-[0.75rem] font-semibold text-dash-ink">
                  <MapPin size={12} aria-hidden="true" />
                  {role?.short ?? user.role} · {groundLabel}
                </span>
              </div>
            </div>
            <RoomLive canAcknowledge={ctx.holds("field:act")} title={title} openCount={openCount} />
          </div>

          {/* Below lg the rail is gone, so the same screens are a row here. */}
          <nav aria-label="Your screens" className="flex gap-1 overflow-x-auto border-t border-dash-line px-4 py-2 lg:hidden">
            {[...faces.map((item) => ({ href: item.route, name: item.name, on: face?.id === item.id })), ...(sections ?? []).map((section) => ({ href: section.href, name: section.name, on: current === section.id }))].map((item) => (
              <Link key={`${item.name}:${item.href}`} href={item.href} className={cn("rounded-dash-sm px-3 py-1.5 text-[0.8125rem] font-semibold whitespace-nowrap", item.on ? "bg-dash-ink text-white" : "text-dash-muted")}>
                {item.name}
              </Link>
            ))}
          </nav>
        </header>

        <main className="px-5 py-6 lg:px-8">
          {!project ? (
            <p className="rounded-dash bg-dash-bg p-8 text-center text-[0.9375rem] text-dash-muted">
              No election project is open yet. The Super Admin opens one, and this screen fills as results arrive.
            </p>
          ) : (
            children
          )}
        </main>
      </div>

      {panel && (
        <aside className="hidden xl:fixed xl:inset-y-0 xl:right-0 xl:z-20 xl:block xl:w-[22.5rem] xl:overflow-y-auto xl:bg-dash-panel xl:p-6 xl:text-white dash-panel">
          {panel}
        </aside>
      )}
    </div>
  );
}

function Rail({ href, active, quiet = false, children }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-dash-sm px-3 py-2 text-[0.875rem] font-semibold transition-colors",
        active ? (quiet ? "bg-dash-bg text-dash-ink" : "bg-dash-ink text-white") : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
      )}
    >
      {children}
    </Link>
  );
}
