import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { agentPath } from "@/lib/agent-address";
import { cn } from "@/lib/utils";

/**
 * The frame every screen behind a home button shares.
 *
 * ── HOME IS ALWAYS ONE TAP AWAY, TOP LEFT ──────────────────────────────────
 * An agent opens Situations, Results or Updates from the home screen and has
 * to be able to get back without hunting for it, so the way back is the first
 * thing on the page and the same size and place on all three.
 *
 * ── AND THE BOOTH IS ALWAYS ON SCREEN ──────────────────────────────────────
 * Under the title, on every page, because a report or a result filed while
 * believing it was for another booth is the mistake this product is built to
 * make impossible.
 */
export const TONES = {
  red: "bg-red-600",
  ink: "bg-ink-950",
  green: "bg-emerald-700",
};

export function AgentScreen({ title, lead, unitCode, unitName, icon: Icon, tone = "ink", children }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-5">
      <Link
        href={agentPath("/")}
        className="mt-3 -ml-1 inline-flex h-11 items-center gap-2 rounded-dash-sm px-1 text-[0.9375rem] font-bold text-ink-950 hover:text-ink-700 focus-visible:ring-2 focus-visible:ring-ink-950 focus-visible:outline-none"
      >
        <ArrowLeft size={18} strokeWidth={2.5} aria-hidden="true" />
        Home
      </Link>

      <header className="mt-2 flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className={cn("flex size-12 shrink-0 items-center justify-center rounded-dash-sm text-white", TONES[tone])}
        >
          <Icon size={24} strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <h1 className="text-fluid-2xl font-bold tracking-[-0.02em] text-ink-950">{title}</h1>
          <p className="mt-0.5 text-[0.8125rem] font-semibold text-content-muted">
            Polling unit <span className="figure text-ink-950">{unitCode}</span>
            {unitName ? ` · ${unitName}` : ""}
          </p>
        </div>
      </header>

      {lead && <p className="mt-3 text-[0.9375rem] leading-relaxed text-content-muted">{lead}</p>}

      <div className="mt-6">{children}</div>
    </main>
  );
}

export function Notice({ tone = "info", children }) {
  return (
    <p
      className={cn(
        "rounded-dash-sm px-4 py-3.5 text-[0.9375rem] leading-relaxed",
        tone === "warn" ? "border-2 border-amber-300 bg-amber-50 text-amber-900" : "bg-ink-100 text-content-muted"
      )}
    >
      {children}
    </p>
  );
}
