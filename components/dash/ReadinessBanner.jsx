import { AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Whether this deployment is fit to be trusted with an election.
 *
 * ── WHY IT IS LOUD, AND WHY IT DISAPPEARS COMPLETELY ───────────────────────
 * Every failure it reports is invisible from every other screen in the
 * product. A demonstration account with a password printed in the repository
 * looks exactly like a real one; a missing site URL breaks nothing anybody
 * notices until a link is shared. So when something is wrong it takes the top
 * of the page and says what to type to fix it.
 *
 * And when nothing is wrong it renders one quiet line rather than a green
 * panel. A dashboard that permanently congratulates itself trains the reader
 * to skip the place the warning will appear.
 */
export default function ReadinessBanner({ state }) {
  if (!state) return null;

  if (state.ready) {
    return (
      <p className="mb-6 flex items-center gap-2 text-[0.75rem] text-dash-muted">
        <ShieldCheck size={13} strokeWidth={2.5} className="shrink-0 text-emerald-600" />
        Deployment checks pass: no published account can sign in, and everything required is set.
      </p>
    );
  }

  return (
    <section
      className={cn(
        "mb-6 rounded-dash border-2 bg-dash-card",
        state.blocking ? "border-red-600" : "border-amber-400"
      )}
    >
      <header className="flex items-center gap-2.5 border-b border-dash-line px-5 py-3.5">
        {state.blocking ? (
          <ShieldAlert size={18} strokeWidth={2.25} className="shrink-0 text-red-600" />
        ) : (
          <AlertTriangle size={18} strokeWidth={2.25} className="shrink-0 text-amber-600" />
        )}
        <div>
          <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
            {state.blocking
              ? "This deployment is not ready to hold a real election"
              : "This deployment needs attention before an election"}
          </h2>
          <p className="text-[0.75rem] text-dash-muted">
            {state.failing.length} check{state.failing.length === 1 ? "" : "s"} failing. None of
            these is visible from any other screen.
          </p>
        </div>
      </header>

      <ul className="divide-y divide-dash-line">
        {state.failing.map((check) => (
          <li key={check.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5">
            <span
              aria-hidden="true"
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                check.severity === "critical" ? "bg-red-600" : "bg-amber-500"
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[0.875rem] font-bold text-dash-ink">{check.title}</p>
              <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-dash-muted">
                {check.detail}
              </p>
            </div>
            {/* The command, not a description of the command. Somebody reading
                this at eleven at night should be able to copy it. */}
            <code className="figure shrink-0 rounded-dash-sm border border-dash-line bg-dash-bg px-2.5 py-1.5 text-[0.75rem] text-dash-ink">
              {check.fix}
            </code>
          </li>
        ))}
      </ul>
    </section>
  );
}
