import Link from "next/link";

import BrandMark from "@/components/ui/BrandMark";
import SignOutButton from "@/components/auth/SignOutButton";
import DashRail from "./DashRail";
import DashDrawer from "./DashDrawer";
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
export default function DashLayout({ user, title, lead, actions, children }) {
  const role = ROLES[user.role] ?? ROLES.VIEWER;

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

            <div className="ml-auto flex items-center gap-2.5">{actions}</div>
          </div>
        </header>

        <main id="main" className="px-5 py-6 lg:px-8 lg:py-8">
          {lead && <p className="mb-6 max-w-3xl text-[0.9375rem] text-dash-muted">{lead}</p>}
          {children}
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ primitives */

/** The white card everything on a dashboard sits in. */
export function Card({ title, subtitle, action, children, className, padded = true, ...props }) {
  return (
    <section
      /* `id` and anything else passes through: the rail links to
         /admin#returns and #accounts, and without this they were five dead
         anchors pointing at elements that never carried the id.
         `scroll-mt-24` clears the sticky header, or the heading lands
         underneath it and the panel looks like it did not move. */
      className={cn(
        "scroll-mt-24 rounded-dash border border-dash-line bg-dash-card",
        className
      )}
      {...props}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-dash-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[0.8125rem] text-dash-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

/**
 * A figure and what it is.
 *
 * `context` is not decoration and is not optional in spirit: this product's
 * whole argument is that a total without its coverage is a different claim, so
 * the component that renders totals has a slot for the qualifier built into it.
 */
export function StatCard({ label, value, context, delta, tone = "default", icon: Icon }) {
  return (
    <div className="rounded-dash border border-dash-line bg-dash-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.75rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
          {label}
        </p>
        {Icon && <Icon size={16} strokeWidth={2.25} className="shrink-0 text-dash-muted" />}
      </div>

      <p
        className={cn(
          "figure mt-3 text-[2rem] leading-none font-bold tracking-[-0.02em]",
          tone === "alert" ? "text-red-600" : "text-dash-ink"
        )}
      >
        {value}
      </p>

      {(context || delta) && (
        <p className="mt-2.5 flex items-center gap-2 text-[0.8125rem] text-dash-muted">
          {delta && (
            <span
              className={cn(
                "figure rounded-dash-sm px-1.5 py-0.5 text-[0.75rem] font-bold",
                delta.startsWith("-")
                  ? "bg-red-50 text-red-700"
                  : "bg-dash-bg text-dash-ink"
              )}
            >
              {delta}
            </span>
          )}
          {context}
        </p>
      )}
    </div>
  );
}

/** Status word + colour, never colour alone. */
export function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: "border-dash-line bg-dash-bg text-dash-muted",
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    alert: "border-red-200 bg-red-50 text-red-700",
    ink: "border-dash-ink bg-dash-ink text-white",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-dash-sm border px-2 py-1 text-[0.6875rem] font-bold tracking-[0.08em] uppercase",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

export function Empty({ children }) {
  return (
    <p className="rounded-dash-sm bg-dash-bg px-4 py-6 text-center text-[0.875rem] leading-relaxed text-dash-muted">
      {children}
    </p>
  );
}
