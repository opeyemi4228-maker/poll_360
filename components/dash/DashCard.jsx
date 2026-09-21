import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The dashboard's presentational primitives.
 *
 * ── WHY THESE ARE NOT IN DashLayout.jsx ────────────────────────────────────
 * They used to be, and it worked until DashLayout became a server component
 * that reads cookies. Two client components — Wallet and BroadcastAnalysis —
 * import a Card and a Badge from it, and importing one thing from a module
 * pulls the whole module: the browser bundle acquired next/headers, and the
 * build refused it.
 *
 * A card is markup. It has no business knowing which election you are looking
 * at, so it lives where anything may import it, on either side of the line.
 * ───────────────────────────────────────────────────────────────────────────
 */

export function Card({ title, subtitle, action, children, className, padded = true, ...props }) {
  return (
    <section
      /* `id` and anything else passes through: the rail links to
         /admin#returns and #accounts, and without this they were five dead
         anchors pointing at elements that never carried the id.
         `scroll-mt-24` clears the sticky header, or the heading lands
         underneath it and the panel looks like it did not move. */
      className={cn(
        "scroll-mt-24 overflow-hidden rounded-dash border border-dash-line bg-dash-card shadow-e2",
        className
      )}
      {...props}
    >
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-dash-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="font-display text-[1rem] leading-tight font-extrabold tracking-[-0.015em] text-dash-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-[0.8125rem] leading-snug text-dash-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={padded ? "p-5 sm:p-6" : ""}>{children}</div>
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
    <div className="rounded-dash border border-dash-line bg-dash-card p-5 shadow-e2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.6875rem] font-bold tracking-[0.12em] text-dash-muted uppercase">
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
    /* The product's own status colours, never a stock green or amber — see
       the note on colour in app/globals.css. */
    good: "tone-ok",
    warn: "tone-warn",
    alert: "border-red-200 bg-red-50 text-red-700",
    ink: "border-dash-ink bg-dash-ink text-white",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.6875rem] leading-none font-bold tracking-[0.08em] whitespace-nowrap uppercase",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

export function Empty({ children, icon: Icon = Inbox }) {
  /* A drawn empty state rather than a grey strip: the outline says "this is
     where it will appear", which is what somebody needs to know on the night
     — that the screen works and the thing has simply not happened yet. */
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-dash-sm border border-dashed border-dash-line bg-dash-bg px-5 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-dash-card text-dash-muted shadow-e2" aria-hidden="true">
        <Icon size={18} strokeWidth={2} />
      </span>
      <p className="max-w-sm text-[0.875rem] leading-relaxed text-dash-muted">{children}</p>
    </div>
  );
}
