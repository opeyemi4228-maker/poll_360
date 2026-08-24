import Link from "next/link";

import BrandMark from "@/components/ui/BrandMark";
import SignOutButton from "@/components/auth/SignOutButton";
import DashRail from "./DashRail";
import Assistant from "./Assistant";
import ElectionSwitcher from "./ElectionSwitcher";
import DashDrawer from "./DashDrawer";
import { currentElection, listElections } from "@/lib/election-scope";
import { elections } from "@/lib/elections";
import { ROLES } from "@/lib/roles";
import { cn } from "@/lib/utils";

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
      <DashRail user={user} />

      {/* ---------------------------------------------------------- sheet */}
      {/* The sheet follows the rail. The width is driven by a data attribute
          on <html> rather than by prop-drilling, so a collapse costs one class
          change and no re-render of the page's contents. */}
      <div className="transition-[padding] duration-300 lg:pl-64 lg:data-[rail=collapsed]:pl-18">
        <header className="sticky top-0 z-30 border-b border-dash-line bg-dash-card/90 backdrop-blur">
          <div className="flex h-18 items-center gap-4 px-5 lg:px-8">
            {/* Below lg the rail is gone, so the same navigation arrives as a
                drawer rather than leaving a phone with no way out of the page. */}
            <DashDrawer user={user} />

            <div className="min-w-0">
              <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-dash-muted uppercase">
                {role.label}
              </p>
              <h1 className="truncate font-display text-[1.35rem] leading-tight font-extrabold tracking-[-0.03em] text-dash-ink">
                {title}
              </h1>
            </div>

            <div className="ml-auto flex items-center gap-2.5">
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

      {/* ── THE ASSISTANT BELONGS ON EVERY DASHBOARD ──────────────────────
          It was mounted in the other shell only, so the situation room and
          the WhatsApp desk had it and the administrator, the broadcast desk,
          the coordinator and the divergence room did not. The point of an
          assistant that can explain any figure in the product is that it is
          there wherever a figure is, and the person most likely to meet a
          word they do not recognise is the one on their first shift at a
          desk, not the analyst in the situation room. */}
      <Assistant tab={screen ?? "results"} />
    </div>
  );
}

/* ------------------------------------------------------------ primitives */

/** The white card everything on a dashboard sits in. */
