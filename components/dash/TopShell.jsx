"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";

import BrandMark from "@/components/ui/BrandMark";
import AlarmBell from "./AlarmBell";
import SignOutButton from "@/components/auth/SignOutButton";
import { ROLES } from "@/lib/roles";
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
  /* ── THE TWO HEADS OF THE ROOM ────────────────────────────────────────
     Optional, and where they are absent this bar is exactly what it was. A
     dashboard with one job passes no modes and gets one row of tabs; the
     situation room passes two and the tabs below become that mode's tabs.
     See the note above the switch itself for why this level exists. */
  modes = null,
  mode = null,
  onMode,
  greeting,
  subtitle,
  children,
  aside,
  /* ── THE WALL CLOCK'S SEAT: THE BAR, NOT THE PAGE ─────────────────────
     It sat in the greeting row, first sharing a line with four controls and
     then with a row of its own — and every rem it took there was a rem the
     map lost, on the screens where the map is the point. In the sticky bar
     it costs the map nothing, and it is on screen however far down anybody
     has scrolled, which is what a room clock is for. */
  clock = null,
  /* The alarm bell. Optional: a dashboard with nothing to be alarmed about
     omits it and the bar closes up around the gap. */
  alerts,
  onOpenAlerts,
}) {
  const [menu, setMenu] = useState(false);
  const role = ROLES[user.role] ?? ROLES.VIEWER;

  /**
   * ── HOW TALL THE BAR IS, MEASURED ────────────────────────────────────────
   * Every dashboard under this shell pins its map below the bar, and a pinned
   * thing needs to know exactly what it is pinned under. The bar is not one
   * height: it is 4.5rem on a wide screen and carries a second row of tabs
   * below xl, and it changes again if a browser is zoomed. A constant would be
   * right on one screen and wrong on the rest — the map would either float in
   * a gap or slide under the bar it is supposed to sit below.
   *
   * So it is measured and published as `--dash-top`, and the maps are written
   * against that. The fallback in each of those rules is the wide-screen
   * height, which is what the first paint gets before the observer reports.
   */
  const bar = useRef(null);
  const [top, setTop] = useState(0);

  useEffect(() => {
    const node = bar.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setTop(node.offsetHeight));
    observer.observe(node);
    setTop(node.offsetHeight);
    return () => observer.disconnect();
  }, []);

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="min-h-screen bg-dash-bg" style={top ? { "--dash-top": `${top}px` } : undefined}>
      {/* ------------------------------------------------------------ bar */}
      {/* ── HOW THE WIDTH IS SPENT ────────────────────────────────────────
          Three blocks, and only the middle one is elastic: the brand and the
          controls are sized by their contents and never shrink, and the tab
          group centres itself in whatever is left between them.

          Everything that could squeeze the row into a second line is nailed
          down rather than left to chance. The account name is one line or it
          is not shown at all; the tabs never wrap; and every control on the
          right is 44px, so the row has one optical baseline instead of three.
          The search was the exception that proved it — a 14rem field holding
          the baseline but not the footprint — and it is now a circle like the
          rest. Below 2xl the name gives its width back to the tabs and lives
          in the menu, which is where you look to check who you are signed in
          as anyway.
          ─────────────────────────────────────────────────────────────────── */}
      <header ref={bar} className="sticky top-0 z-40 border-b border-dash-line bg-dash-card">
        <div className="flex h-18 items-center gap-3 px-4 lg:px-6">
          <Link
            href="/"
            className="flex h-11 shrink-0 items-center gap-2.5 rounded-full transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
          >
            <BrandMark coverage={0.62} className="size-8 text-dash-ink" />
            <span className="hidden font-display text-[1.25rem] leading-none font-extrabold tracking-[-0.045em] text-dash-ink sm:inline">
              Poll<span className="font-mono font-bold text-red-500">360</span>
            </span>
          </Link>

          {/* ── THE BROADHEAD SWITCH ─────────────────────────────────────
              Two buttons, above everything else, and deliberately the only
              control in this bar drawn at full contrast.

              The room does two jobs that share a project, a contest and a
              ground and share almost nothing else. Monitoring is what is
              happening in the next ten minutes, read by somebody with a phone
              in their hand. Analytics is what happened over twenty-seven years
              and what is likely to happen next, read by somebody with a
              spreadsheet open. Presented as one flat row of tabs they compete:
              the person watching a count that has stalled should not be one
              slip away from a projection, and the analyst should not have to
              scroll past nine live tabs to reach a swing model.

              So the two are separated at the top and everything else hangs
              underneath whichever one is chosen. It is one press to cross
              between them and never more than one, because on a night where
              somebody has to reach a screen inside a live broadcast, a surface
              two clicks deep is a surface nobody uses. */}
          {/* Collapsed only where the tabs need the width: the Monitor carries
              eight, Analytics and Broadcast three or four, and on those two
              the whole choice fits beside its tabs with room to spare. */}
          {modes && (
            <ModeSwitch modes={modes} mode={mode} onMode={onMode} collapsed={(tabGroups ? tabGroups.reduce((sum, group) => sum + group.tabs.length, 0) : (tabs?.length ?? 0)) > COLLAPSE_AFTER} />
          )}

          {/* One rounded track with the active tab a solid block inside it, so
              the set reads as a single control. Where groups are supplied they
              are separated by a hairline rather than by a gap: a gap at this
              size reads as three controls, a rule reads as one control with
              structure, which is what it is. */}
          {/* ── THE TRACK SCROLLS RATHER THAN BREAKING THE ROW ────────────
              The monitoring head carries thirteen surfaces, and thirteen pills
              plus the head switch plus the account is wider than a 1440 laptop.
              The row used to be `shrink-0`, which meant it pushed the controls
              off the right-hand edge instead of giving way. It scrolls now:
              every tab is still one press, the bar is still one line, and on a
              wall display there is nothing to scroll because it all fits. */}
          <nav
            aria-label="Dashboards"
            className="mx-auto hidden min-w-0 items-center overflow-x-auto rounded-full border border-dash-line bg-dash-bg p-1 xl:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                      "inline-flex h-9 items-center rounded-full px-3 text-[0.8125rem] font-semibold whitespace-nowrap transition-colors 2xl:px-3.5",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                      active === tab.value
                        ? "bg-dash-card text-dash-ink shadow-sm"
                        : "text-dash-muted hover:text-dash-ink"
                    )}
                  >
                    {tab.label}
                    {/* A surface that fills itself while somebody is looking
                        at a different one has to say so where they already
                        are, or the feature is invisible until they happen to
                        wander over. */}
                    {tab.badge ? (
                      <span
                        className={cn(
                          "ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-bold tabular-nums",
                          active === tab.value ? "bg-dash-ink text-white" : "bg-brand-red text-white"
                        )}
                      >
                        {tab.badge}
                      </span>
                    ) : null}
                  </button>
                ))}
              </span>
            ))}
          </nav>

          {/* `ml-auto` only while the tabs are gone. With both this and the
              nav's `mx-auto` in the row, the spare width was shared between
              three automatic margins instead of two, which left the tab group
              sitting a third of the slack left of where it looked like it was
              meant to be. Now the slack falls either side of the tabs and the
              gutters match. */}
          <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0">
            {clock}

            {alerts && <AlarmBell incidents={alerts} onOpenStream={onOpenAlerts} />}

            {/* The account. A menu rather than a permanent sign-out button:
                signing out is a once-a-night action and should not sit at the
                same weight as the tabs. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu((value) => !value)}
                aria-expanded={menu}
                /* Spoken in full even at the widths where the name is not
                   drawn, so the button never announces itself as two letters
                   and a chevron. */
                aria-label={`Account: ${user.name}, ${role.label}`}
                className="flex h-11 shrink-0 items-center gap-2.5 rounded-full border border-dash-line pr-2.5 pl-1.5 transition-colors hover:border-dash-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink 2xl:pr-3"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-dash-ink font-display text-[0.75rem] font-bold text-white">
                  {initials}
                </span>
                {/* One line each, or nothing. A long name allowed to wrap here
                    is what turns a 72px bar into a ragged one, and this is the
                    block the row would otherwise choose to break first. */}
                <span className="hidden max-w-[11rem] min-w-0 text-left 2xl:block">
                  <span className="block truncate text-[0.8125rem] leading-tight font-semibold text-dash-ink">
                    {user.name}
                  </span>
                  <span className="block truncate text-[0.6875rem] leading-tight text-dash-muted">
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
                  <div className="absolute right-0 z-20 mt-2 w-60 rounded-dash border border-dash-line bg-dash-card p-2 shadow-lg">
                    {/* Who you are, said once, somewhere there is always room
                        for it however narrow the bar has become. */}
                    <div className="border-b border-dash-line px-3 pt-1 pb-3">
                      <p className="truncate text-[0.875rem] font-semibold text-dash-ink">
                        {user.name}
                      </p>
                      <p className="truncate text-[0.75rem] text-dash-muted">{role.label}</p>
                    </div>
                    <div className="pt-2">
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
                    </div>
                    <div className="mt-2 border-t border-dash-line pt-2">
                      <SignOutButton variant="dashOutline" size="sm" full />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs move under the bar rather than disappearing into a menu: they
            are the primary control of this screen. This row takes over the
            moment the pill group stops fitting, not one breakpoint later —
            between the two there used to be a stretch of widths with no tabs
            on the screen at all. It keeps the grouping, because which group a
            view sits in is half of what its label means. */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-dash-line px-4 py-2 lg:px-6 xl:hidden">
          {(tabGroups ?? [{ id: "all", tabs }]).map((group, index) => (
            <span key={group.id} className="flex items-center gap-1.5">
              {index > 0 && (
                <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-dash-line" />
              )}
              {group.tabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => onTab(tab.value)}
                  aria-pressed={active === tab.value}
                  className={cn(
                    "inline-flex h-10 shrink-0 items-center rounded-full px-4 text-[0.875rem] font-semibold whitespace-nowrap transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                    active === tab.value
                      ? "bg-dash-ink text-white"
                      : "bg-dash-bg text-dash-muted hover:text-dash-ink"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </span>
          ))}
        </div>
      </header>

      {/* -------------------------------------------------------- greeting */}
      {/* Tighter than a marketing header on purpose: on a 13-inch laptop every
          rem spent here is a rem the map does not get. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pt-3 pb-2.5 lg:px-6">
        <div className="min-w-0">
          <h1 className="font-display text-[1.25rem] leading-none font-extrabold tracking-[-0.035em] text-dash-ink">
            {greeting}
          </h1>
          {subtitle && <p className="mt-1.5 text-[0.875rem] text-dash-muted">{subtitle}</p>}
        </div>
        {aside && <div className="flex flex-wrap items-center justify-end gap-2">{aside}</div>}
      </div>

      <main id="main" className="px-4 pb-3 lg:px-6 lg:pb-4">
        {children}
      </main>

      {/* ── THE ASSISTANT IS OFF ──────────────────────────────────────────
          Withdrawn deliberately, not deleted: components/dash/Assistant.jsx
          and the RoomVoice context it drives are both intact, and putting it
          back is this line and the matching one in DashLayout. It is off
          because a floating assistant on every dashboard is a second way to
          reach every screen, and the screens themselves are being rebuilt
          around pictures rather than prose — a talking window that answers in
          sentences is the wrong shape for a room that is trying to stop
          reading like a script. */}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════ MODE SWITCH ═══ */

/**
 * The room's three heads, collapsed to the one that is open.
 *
 * ── WHY IT COLLAPSED ──────────────────────────────────────────────────────
 * Three full-width buttons spent a third of the bar on a choice made a few
 * times a night, and the price was paid by the tabs — the choice made every
 * minute — which were cut off after Timeline on a laptop. The head you are in
 * is what the bar needs to say; the other two are one press away, in a menu
 * that says what each is for, which three bare labels never did.
 *
 * A head with something waiting is not hidden by the collapse: its count
 * rides on the closed button as a red dot, and is printed in the menu.
 *
 * Arrow keys move through the menu, Enter picks, Escape closes and returns
 * focus to the button — the behaviour anybody expects of a menu.
 * ───────────────────────────────────────────────────────────────────────────
 */
/* More tabs than this under the open head and the switch folds to one button. */
const COLLAPSE_AFTER = 5;

function ModeSwitch({ modes, mode, onMode, collapsed = true }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const buttonRef = useRef(null);
  const itemRefs = useRef([]);
  const current = modes.find((item) => item.id === mode) ?? modes[0];
  const Icon = current.icon;
  const elsewhere = modes.some((item) => item.id !== current.id && item.badge);

  useEffect(() => {
    if (!open) return;
    const onDown = (event) => !boxRef.current?.contains(event.target) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    const index = Math.max(0, modes.findIndex((item) => item.id === current.id));
    itemRefs.current[index]?.focus();
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, modes, current.id]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (event) => {
    const items = itemRefs.current.filter(Boolean);
    const at = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  const pick = (id) => {
    setOpen(false);
    if (id !== current.id) onMode?.(id);
    buttonRef.current?.focus();
  };

  /* ── OPEN, WHERE THERE IS ROOM ───────────────────────────────────────
     A head with few tabs shows all three heads as one segmented control:
     every choice visible, one press each, nothing to open. */
  if (!collapsed) {
    return (
      <div
        role="group"
        aria-label="Sections"
        className="flex shrink-0 items-center gap-0.5 rounded-full border border-dash-line bg-dash-bg p-1"
      >
        {modes.map((item) => {
          const ItemIcon = item.icon;
          const on = item.id === current.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => pick(item.id)}
              aria-pressed={on}
              title={item.why}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full px-3 text-[0.8125rem] font-bold whitespace-nowrap transition-colors lg:px-4",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                on ? "bg-dash-ink text-white" : "text-dash-muted hover:bg-dash-card hover:text-dash-ink"
              )}
            >
              {ItemIcon && <ItemIcon size={15} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />}
              <span className="hidden sm:inline">{item.label}</span>
              {item.badge ? (
                <span
                  className={cn(
                    "figure inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-bold tabular-nums",
                    on ? "bg-white text-dash-ink" : "bg-brand-red text-white"
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Section: ${current.label}. Change section.`}
        className={cn(
          "relative inline-flex h-11 items-center gap-2 rounded-full bg-dash-ink pr-3 pl-4 text-[0.875rem] font-bold whitespace-nowrap text-white transition-colors hover:bg-black",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
        )}
      >
        {Icon && <Icon size={16} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />}
        <span className="hidden sm:inline">{current.label}</span>
        {current.badge ? (
          <span className="figure inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[0.6875rem] font-bold text-dash-ink tabular-nums">
            {current.badge}
          </span>
        ) : null}
        <ChevronDown
          size={15}
          strokeWidth={2.5}
          className={cn("shrink-0 text-white/70 transition-transform duration-200", open && "rotate-180")}
          aria-hidden="true"
        />
        {elsewhere && (
          <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-brand-red ring-2 ring-dash-card" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Sections"
          onKeyDown={onKeyDown}
          className="absolute left-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-dash border border-dash-line bg-dash-card p-1.5 shadow-e3"
        >
          {modes.map((item, index) => {
            const ItemIcon = item.icon;
            const on = item.id === current.id;
            return (
              <button
                key={item.id}
                ref={(node) => (itemRefs.current[index] = node)}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => pick(item.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-dash-sm px-3 py-3 text-left transition-colors outline-none",
                  "hover:bg-dash-bg focus-visible:bg-dash-bg focus-visible:ring-2 focus-visible:ring-dash-ink",
                  on && "bg-dash-bg"
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full",
                    on ? "bg-dash-ink text-white" : "border border-dash-line bg-dash-card text-dash-ink"
                  )}
                  aria-hidden="true"
                >
                  {ItemIcon && <ItemIcon size={16} strokeWidth={2.25} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[0.9375rem] font-bold text-dash-ink">{item.label}</span>
                    {item.badge ? (
                      <span className="figure inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-red px-1.5 text-[0.6875rem] font-bold text-white tabular-nums">
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  {item.why && (
                    <span className="mt-0.5 block text-[0.8125rem] leading-snug text-dash-muted">{item.why}</span>
                  )}
                </span>
                {on && <Check size={16} strokeWidth={3} className="mt-2.5 shrink-0 text-dash-ink" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
