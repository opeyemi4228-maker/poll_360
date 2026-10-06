import Link from "next/link";
import { ArrowUpRight, Inbox } from "lucide-react";

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
      {/* No rule under the heading. The card's own edge is the box; a second
          line inside it turned every panel into a form with a title bar. */}
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5 pb-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="font-display text-[1.0625rem] leading-snug font-bold tracking-[-0.01em] text-dash-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[0.8125rem] leading-snug text-dash-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={padded ? cn("px-5 pb-5 sm:px-6 sm:pb-6", !(title || action) && "pt-5 sm:pt-6") : ""}>
        {children}
      </div>
    </section>
  );
}

/* The tinted tile an icon sits in. Four tints and all four are the product's
   own: the royal blue, the brand red, and the two status hues. */
const TILE = {
  default: "bg-blue-50 text-blue-600",
  alert: "bg-red-50 text-red-600",
  good: "bg-ok-50 text-ok-700",
  warn: "bg-flag-50 text-flag-700",
};

/**
 * A figure and what it is.
 *
 * `context` is not decoration and is not optional in spirit: this product's
 * whole argument is that a total without its coverage is a different claim, so
 * the component that renders totals has a slot for the qualifier built into it.
 */
const SHARE_FILL = {
  default: "bg-blue-500",
  alert: "bg-red-500",
  good: "bg-ok-500",
  warn: "bg-flag-500",
};

/**
 * ── A FIGURE IS A QUESTION, SO THE CARD IS A DOOR ───────────────────────────
 * "14 disputed" makes somebody want the fourteen. Given `href` the whole card
 * is the link to them — the largest target on the row, not a small "view"
 * beside the number — and it says so with an arrow and by lifting under the
 * pointer. Without `href` it is a reading and does neither: a card that looks
 * pressable and is not teaches people to stop pressing.
 *
 * `share` draws how much of a whole the figure is (0 to 1), in the place a
 * decorative sparkline would otherwise go. It is only passed where the page
 * really holds both numbers.
 */
export function StatCard({
  label,
  value,
  context,
  delta,
  tone = "default",
  icon: Icon,
  href,
  share,
  shareTone,
  children,
}) {
  const body = (
    <>
      <div className="flex items-center gap-3">
        {Icon && (
          <span
            aria-hidden="true"
            className={cn("flex size-11 shrink-0 items-center justify-center rounded-dash-sm", TILE[tone] ?? TILE.default)}
          >
            <Icon size={19} strokeWidth={2} />
          </span>
        )}
        <p className="min-w-0 flex-1 text-[0.875rem] leading-snug font-medium text-dash-ink">{label}</p>
        {href && (
          <ArrowUpRight
            size={17}
            strokeWidth={2}
            aria-hidden="true"
            className="shrink-0 self-start text-dash-muted/60 transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-dash-ink"
          />
        )}
      </div>

      <p
        className={cn(
          "figure mt-4 text-[2rem] leading-none font-semibold",
          tone === "alert" ? "text-red-600" : "text-dash-ink"
        )}
      >
        {value}
      </p>

      {(context || delta) && (
        <p className="mt-2.5 flex flex-wrap items-center gap-2 text-[0.8125rem] text-dash-muted">
          {delta && (
            <span
              className={cn(
                "figure rounded-full px-2 py-0.5 text-[0.75rem] font-semibold",
                delta.startsWith("-") ? "bg-red-50 text-red-700" : "bg-dash-bg text-dash-ink"
              )}
            >
              {delta}
            </span>
          )}
          {context}
        </p>
      )}

      {typeof share === "number" && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-dash-bg" aria-hidden="true">
          <div
            className={cn("h-full rounded-full", SHARE_FILL[shareTone ?? tone] ?? SHARE_FILL.default)}
            /* Never drawn as nothing when it is something: one in a thousand
               is still the one somebody came to find. */
            style={{ width: `${share > 0 ? Math.max(2, Math.min(100, share * 100)) : 0}%` }}
          />
        </div>
      )}

      {children && <div className="mt-4">{children}</div>}
    </>
  );

  const surface = "block rounded-dash border border-dash-line bg-dash-card p-5 shadow-e2";

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          surface,
          "group transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-dash-ink/25 hover:shadow-e3",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={surface}>{body}</div>;
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
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.75rem] leading-none font-semibold whitespace-nowrap",
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
    <div className="flex flex-col items-center gap-2.5 rounded-dash-sm bg-dash-bg px-5 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-dash-card text-dash-muted shadow-e2" aria-hidden="true">
        <Icon size={18} strokeWidth={2} />
      </span>
      <p className="max-w-sm text-[0.875rem] leading-relaxed text-dash-muted">{children}</p>
    </div>
  );
}

/**
 * A block inside the navy panel.
 *
 * Not a Card: the panel is already the surface, so a block in it is a heading
 * and what sits under it, kept apart from the next by a hairline.
 */
export function PanelBlock({ title, subtitle, action, children, className }) {
  return (
    <section className={cn("border-t border-dash-line pt-6 first:border-t-0 first:pt-0", className)}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[1.0625rem] leading-snug font-bold tracking-[-0.01em] text-dash-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[0.8125rem] leading-snug text-dash-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
