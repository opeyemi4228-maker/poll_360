import PoweredBy from "@/components/ui/PoweredBy";
import DashRail from "./DashRail";
import ElectionSwitcher from "./ElectionSwitcher";
import DashDrawer from "./DashDrawer";
import { currentElection, listElections } from "@/lib/election-scope";
import { can } from "@/lib/roles";
import IrevHeartbeat from "./IrevHeartbeat";

/**
 * The dashboard frame: a white rail, a white sheet, and one navy panel.
 *
 * ── WHY PURE WHITE ─────────────────────────────────────────────────────────
 * A dashboard is a working surface: it is read at a desk, in daylight as often
 * as at 2am, printed, screenshotted into a WhatsApp group, and stared at for
 * eleven hours. So the page is #fff — not a grey, not a cream — and the cards
 * on it are told apart by a hairline and a soft shadow rather than by a
 * darker page behind them.
 *
 * ── WHERE THE NAVY WENT ────────────────────────────────────────────────────
 * It used to fill the rail, which spent the brand's strongest colour on a
 * list of links. It is spent twice now, both times on something being said:
 * the tile in the rail that marks where you are, and the `panel` — a column
 * down the right-hand edge that a page fills with the one reading it exists
 * to give. A page with nothing of that weight passes no panel and the sheet
 * takes the full width.
 * ───────────────────────────────────────────────────────────────────────────
 */
/* Who may start a project, mirrored from app/actions/elections.js so the
   control is not offered to somebody the action will refuse. The action checks
   again regardless: a hidden button is a courtesy, not a permission. */
const MAY_CREATE = new Set(["SUPER_ADMIN", "SITUATION_ROOM"]);

/* Lagos time, not the server's: the machine this runs on is rarely in Nigeria,
   and an election day that turns over at 1am is a wrong date on every screen. */
const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Lagos",
});

export default async function DashLayout({
  user,
  title,
  lead,
  actions,
  screen = null,
  /* The navy panel's contents. Pinned to the right-hand edge from `xl` up;
     below that it follows the page. */
  panel = null,
  children,
}) {
  const today = new Date();

  /* Fetched here rather than passed in by each page: every dashboard needs the
     same control in the same place, and threading it through four call sites
     is four chances to forget one. */
  const [current, all] = await Promise.all([currentElection(), listElections()]);

  return (
    <div className="dash min-h-screen">
      {/* The rail's remembered width arrives on <html> from the inline script
          in app/layout.js, before any of this is drawn. It used to sit here,
          which put it inside a component: a soft navigation re-renders this
          tree in the browser, and a <script> React creates in the browser is
          never run. Only the root layout is always parsed as document HTML. */}

      <DashRail user={user} />

      {/* Keeps anything being gathered from INEC's portal moving while its
          owner is on another screen. Only for an account allowed to run it. */}
      {can(user.role, "system:read") && <IrevHeartbeat />}

      {/* ---------------------------------------------------------- sheet */}
      {/* Inset by the same `--rail` the sidebar is sized from, so the two can
          no longer disagree. They used to: the flag was a data attribute on
          <html>, and a data variant matches the element that carries the
          attribute, not its descendants — so collapsing the rail left 11.5rem
          of empty white beside it and never moved the page.

          And inset on the right by the panel, where there is one: it is fixed
          to the edge of the screen, so the sheet has to make room for it
          rather than run underneath. */}
      <div
        className={
          panel
            ? "transition-[padding] duration-300 lg:pl-(--rail) xl:pr-[22.5rem]"
            : "transition-[padding] duration-300 lg:pl-(--rail)"
        }
      >
        {/* ── HOW THE TOPBAR SPENDS ITS WIDTH ──────────────────────────────
            Two blocks. The title keeps the width of its own words; the
            controls take what is left and wrap within it. On a phone the
            controls take a row of their own rather than squeezing the title,
            because the project switcher alone is 15rem and a phone is 20 —
            the two were previously asked to share, and the heading lost.

            Solid, not translucent: this bar sits over dense tables all night,
            and type sliding about behind a blur is the one thing a results
            desk should never have to read through. No rule under it either —
            it is the top of the same white sheet, not a second surface. */}
        <header className="dash-bar sticky top-0 z-30 bg-dash-sheet">
          <div className="mx-auto flex min-h-20 flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5 lg:px-8">
            {/* Below lg the rail is gone, so the same navigation arrives as a
                drawer rather than leaving a phone with no way out of the page. */}
            <DashDrawer user={user} />

            {/* The title is never the thing that gives way. It keeps its own
                width and the controls wrap beneath it when the two cannot
                share a line — beside the panel on a laptop they often cannot,
                and "Overvi…" is not a heading. */}
            <div className="max-w-full min-w-0 shrink-0">
              <h1 className="truncate font-display text-[1.5rem] leading-tight font-bold tracking-[-0.02em] text-dash-ink">
                {title}
              </h1>
              {/* The day, where the role used to be. Who you are is in the
                  rail and does not change; what day it is, is the one thing
                  a room working past midnight gets wrong. */}
              <p className="mt-0.5 truncate text-[0.8125rem] text-dash-muted">
                <time dateTime={today.toISOString().slice(0, 10)}>{DAY.format(today)}</time>
              </p>
            </div>

            <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-2 sm:basis-0 sm:justify-end">
              <ElectionSwitcher
                current={current}
                all={all}
                canCreate={MAY_CREATE.has(user.role)}
                canDelete={user.role === "SUPER_ADMIN"}
              />
              {actions}
            </div>
          </div>
        </header>

        {/* A container, so a page can lay itself out against the width it has
            actually been given rather than against the window: the same page
            is 800px wide beside the panel on a laptop and 1,600 on a wall. */}
        <main id="main" className="@container px-5 pt-2 pb-6 lg:px-8 lg:pb-8">
          {/* Read once, by somebody new to the screen, and never again: so it
              is small and quiet, and the work starts directly under it. */}
          {lead && <p className="mb-5 max-w-2xl text-[0.875rem] leading-relaxed text-dash-muted">{lead}</p>}

          {children}

          {/* Below `xl` there is no edge to pin the panel to, so it follows
              the page rather than leading it: on a phone it is two screens
              tall, and whatever a page put first it put first on purpose. */}
          {panel && (
            <aside className="dash-panel mt-6 space-y-6 rounded-dash-panel p-6 xl:hidden">{panel}</aside>
          )}
          <PoweredBy className="mt-10 border-t border-dash-line pt-4" />
        </main>
      </div>

      {/* ── THE NAVY PANEL ────────────────────────────────────────────────
          Fixed to the right-hand edge and as tall as the screen, so it is
          still there however far down the sheet has been scrolled. It scrolls
          on its own when it holds more than the screen is tall. Rendered a
          second time rather than moved, because where it sits is a question
          of width and the server does not know the width. */}
      {panel && (
        <aside
          aria-label="At a glance"
          className="dash-panel fixed inset-y-3 right-3 z-30 hidden w-[21rem] space-y-6 overflow-y-auto overscroll-contain rounded-dash-panel p-6 [scrollbar-width:none] xl:block [&::-webkit-scrollbar]:hidden"
        >
          {panel}
        </aside>
      )}

      {/* ── THE ASSISTANT IS OFF ──────────────────────────────────────────
          It used to mount here so that every dashboard had it, not just the
          situation room. It is withdrawn for now rather than deleted —
          components/dash/Assistant.jsx is intact and restoring it is this
          line plus the matching one in components/dash/TopShell.jsx, where
          the reasoning is written out. */}
    </div>
  );
}
