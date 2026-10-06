import { AlertTriangle, ChevronDown, ShieldCheck, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Whether this deployment is fit to be trusted with an election.
 *
 * ── WHY IT IS FIRST, AND WHY IT DISAPPEARS COMPLETELY ───────────────────────
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
        <ShieldCheck size={13} strokeWidth={2.5} className="shrink-0 text-ok-600" />
        Deployment checks pass: no published account can sign in, and everything required is set.
      </p>
    );
  }

  const Icon = state.blocking ? ShieldAlert : AlertTriangle;

  return (
    <section className="mb-6 overflow-hidden rounded-dash border border-dash-line bg-dash-card shadow-e2">
      {/* Loud by tint and by position, not by a heavy red frame: the wash
          across the top is the only coloured band on the screen, which is
          enough to make it the first thing read. */}
      <header
        className={cn(
          "flex items-center gap-3.5 px-5 py-4 sm:px-6",
          state.blocking ? "bg-red-50" : "bg-flag-50"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-dash-sm text-white",
            state.blocking ? "bg-red-500" : "bg-flag-600"
          )}
        >
          <Icon size={20} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[1.0625rem] leading-snug font-bold tracking-[-0.01em] text-dash-ink">
            {state.blocking
              ? "This deployment is not ready to hold a real election"
              : "This deployment needs attention before an election"}
          </h2>
          <p className="mt-0.5 text-[0.8125rem] text-dash-muted">
            {state.failing.length} check{state.failing.length === 1 ? "" : "s"} failing. None of
            these is visible from any other screen.
          </p>
        </div>
      </header>

      {/* ── WHAT IS WRONG, THEN — ON ASKING — WHY AND HOW ────────────────
          Each finding is one line that says what is wrong and how badly,
          and opens to the explanation and the fix. All three used to be
          printed in full, which made the first thing on the page a column
          of prose: somebody who has seen it four times stops reading it,
          and the queue it sits above went below the fold. The one that
          blocks an election arrives open, because that one is not optional
          reading. Native disclosure, so it works before any script has
          loaded and from the keyboard without help. */}
      <ul className="divide-y divide-dash-line">
        {state.failing.map((check) => {
          const critical = check.severity === "critical";
          return (
            <li key={check.id}>
              <details open={critical} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-dash-bg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-dash-ink sm:px-6 [&::-webkit-details-marker]:hidden">
                  <span
                    aria-hidden="true"
                    className={cn("size-2.5 shrink-0 rounded-full", critical ? "bg-red-500" : "bg-flag-500")}
                  />
                  <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold text-dash-ink">
                    {check.title}
                  </span>
                  {/* In words as well as colour: red and amber dots are the
                      same dot to one reader in twelve. */}
                  <span
                    className={cn(
                      "hidden shrink-0 rounded-full px-2.5 py-1 text-[0.75rem] leading-none font-semibold sm:inline",
                      critical ? "bg-red-50 text-red-700" : "bg-flag-50 text-flag-700"
                    )}
                  >
                    {critical ? "Blocks an election" : "Needs attention"}
                  </span>
                  <ChevronDown
                    size={17}
                    strokeWidth={2}
                    aria-hidden="true"
                    className="shrink-0 text-dash-muted transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>

                <div className="pr-5 pb-4 pl-11 sm:pr-6 sm:pl-12">
                  <p className="max-w-3xl text-[0.8125rem] leading-relaxed text-dash-muted">
                    {check.detail}
                  </p>
                  {/* The command, not a description of the command. Somebody
                      reading this at eleven at night should be able to copy
                      it — and it sits under the finding at the full width of
                      the row, where a long one no longer squeezes the
                      explanation into a column four words wide. */}
                  <p className="mt-3 text-[0.75rem] font-medium text-dash-muted">To fix</p>
                  <code className="mt-1 inline-block max-w-full rounded-[10px] bg-dash-bg px-3 py-2 font-mono text-[0.75rem] leading-relaxed break-words text-dash-ink select-all">
                    {check.fix}
                  </code>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
