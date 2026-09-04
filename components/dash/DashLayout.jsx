import DashRail from "./DashRail";
import ElectionSwitcher from "./ElectionSwitcher";
import DashDrawer from "./DashDrawer";
import { currentElection, listElections } from "@/lib/election-scope";
import { ROLES } from "@/lib/roles";

/**
 * The dashboard frame: a black rail, a white sheet.
 *
 * ── WHY WHITE, WHEN THE PUBLIC BOARD IS BLACK ──────────────────────────────
 * The public board is a broadcast object, read across a room, over a video
 * wall, usually in the dark. A dashboard is a working surface: it is read at a
 * desk, in daylight as often as at 2am, printed, screenshotted into a WhatsApp
 * group, and stared at for eleven hours. Black-on-white is what every figure
 * in this business has been printed on for a century, it holds up under a
 * window, and it costs nothing in a photocopier.
 *
 * The black is spent entirely on the rail, so the data gets all of the white.
 * ───────────────────────────────────────────────────────────────────────────
 */
/* Who may start a project, mirrored from app/actions/elections.js so the
   control is not offered to somebody the action will refuse. The action checks
   again regardless: a hidden button is a courtesy, not a permission. */
const MAY_CREATE = new Set(["SUPER_ADMIN", "SITUATION_ROOM"]);

export default async function DashLayout({ user, title, lead, actions, screen = null, children }) {
  const role = ROLES[user.role] ?? ROLES.VIEWER;

  /* Fetched here rather than passed in by each page: every dashboard needs the
     same control in the same place, and threading it through four call sites
     is four chances to forget one. */
  const [current, all] = await Promise.all([currentElection(), listElections()]);

  return (
    <div className="min-h-screen bg-dash-bg">
      {/* The rail's remembered width arrives on <html> from the inline script
          in app/layout.js, before any of this is drawn. It used to sit here,
          which put it inside a component: a soft navigation re-renders this
          tree in the browser, and a <script> React creates in the browser is
          never run. Only the root layout is always parsed as document HTML. */}

      <DashRail user={user} />

      {/* ---------------------------------------------------------- sheet */}
      {/* Inset by the same `--rail` the sidebar is sized from, so the two can
          no longer disagree. They used to: the flag was a data attribute on
          <html>, and a data variant matches the element that carries the
          attribute, not its descendants — so collapsing the rail left 11.5rem
          of empty white beside it and never moved the page. */}
      <div className="transition-[padding] duration-300 lg:pl-(--rail)">
        {/* ── HOW THE TOPBAR SPENDS ITS WIDTH ──────────────────────────────
            Two blocks. The title is elastic and truncates; the controls are
            sized by their contents and never shrink. Below `lg` the controls
            take a row of their own rather than squeezing the title, because
            the project switcher alone is 15rem and a phone is 20 — the two
            were previously asked to share, and the heading lost.

            Solid, not translucent: this bar sits over dense tables all night,
            and type sliding about behind a blur is the one thing a results
            desk should never have to read through. */}
        <header className="sticky top-0 z-30 border-b border-dash-line bg-dash-card">
          <div className="mx-auto flex min-h-18 flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3 lg:flex-nowrap lg:px-8 lg:py-0">
            {/* Below lg the rail is gone, so the same navigation arrives as a
                drawer rather than leaving a phone with no way out of the page. */}
            <DashDrawer user={user} />

            <div className="min-w-0 flex-1">
              <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-dash-muted uppercase">
                {role.label}
              </p>
              <h1 className="truncate font-display text-[1.35rem] leading-tight font-extrabold tracking-[-0.03em] text-dash-ink">
                {title}
              </h1>
            </div>

            <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2.5 lg:w-auto">
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

        <main id="main" className="px-5 py-6 lg:px-8 lg:py-8">
          {lead && <p className="mb-6 max-w-3xl text-[0.9375rem] text-dash-muted">{lead}</p>}
          {children}
        </main>
      </div>

      {/* ── THE ASSISTANT IS OFF ──────────────────────────────────────────
          It used to mount here so that every dashboard had it, not just the
          situation room. It is withdrawn for now rather than deleted —
          components/dash/Assistant.jsx is intact and restoring it is this
          line plus the matching one in components/dash/TopShell.jsx, where
          the reasoning is written out. */}
    </div>
  );
}
