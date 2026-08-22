"use client";

import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

/**
 * What a room sees when a page cannot be built.
 *
 * ── WHY THIS EXISTS AT ALL ─────────────────────────────────────────────────
 * Without it, a database that blinks shows a stack trace with file paths and
 * line numbers. On a normal product that is untidy. On a screen in a situation
 * room at eleven at night it is worse than untidy: it looks like the count has
 * broken, and the first thing anybody does is stop trusting the figures that
 * were on the screen a second ago.
 *
 * ── WHAT IT SAYS, AND WHAT IT REFUSES TO SAY ───────────────────────────────
 * It says which of the two things happened, because they need different
 * responses: a connection that dropped is waited out, and a fault in the
 * product is reported. It says plainly that nothing filed has been lost,
 * because that is the question everybody in the room is actually asking and
 * leaving it unanswered invites the worst assumption.
 *
 * It does not say "something went wrong". That sentence tells a reader nothing
 * they had not already worked out from looking at the screen.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function ErrorPage({ error, reset }) {
  const [tries, setTries] = useState(0);
  const [waiting, setWaiting] = useState(false);

  /* Production strips the message and leaves a digest, so the tag cannot be
     relied on there. A missing digest means the error was thrown while
     rendering rather than caught from a query, and a connection failure is by
     far the likeliest cause of the latter, so it leads. */
  const unreachable =
    error?.name === "DatabaseUnreachable" ||
    /could not be reached|fetch failed|timeout|network/i.test(error?.message ?? "");

  useEffect(() => {
    /* Logged rather than swallowed. The room sees the calm version; whoever is
       keeping the deployment up needs the real one. */
    console.error("Poll360 could not render this page:", error);
  }, [error]);

  const again = () => {
    setWaiting(true);
    setTries((n) => n + 1);
    reset();
    /* The spinner is a courtesy: reset re-renders on the server and there is
       nothing to await. Long enough to be seen, short enough not to look stuck. */
    setTimeout(() => setWaiting(false), 900);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-dash-bg px-6 py-16">
      <div className="w-full max-w-lg">
        <span className="flex size-11 items-center justify-center rounded-full bg-dash-ink text-white">
          {unreachable ? (
            <WifiOff size={19} strokeWidth={2.25} />
          ) : (
            <RefreshCw size={19} strokeWidth={2.25} />
          )}
        </span>

        <h1 className="mt-5 font-display text-[1.75rem] leading-tight font-extrabold tracking-[-0.035em] text-dash-ink">
          {unreachable ? "We cannot reach the database" : "This page did not build"}
        </h1>

        <p className="mt-3 text-[0.9375rem] leading-relaxed text-dash-muted">
          {unreachable ? (
            <>
              The connection to the database dropped while this page was being put
              together. It is usually the network rather than the count, and it usually
              comes back within a few seconds.
            </>
          ) : (
            <>
              Something in this page failed while it was being put together. This one is
              on us rather than on the connection, and it needs reporting.
            </>
          )}
        </p>

        {/* The sentence the room is actually waiting for. */}
        <p className="mt-4 rounded-dash border border-dash-line bg-dash-card px-4 py-3 text-[0.875rem] leading-relaxed text-dash-ink">
          <strong className="font-bold">Nothing that was filed has been lost.</strong>{" "}
          Every return, incident and payment already recorded is safe. This page could not
          be drawn; it does not affect what is stored.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={again}
            className="flex items-center gap-2 rounded-dash-sm bg-dash-ink px-4 py-2.5 text-[0.875rem] font-bold text-white transition-colors hover:bg-red-600"
          >
            <RefreshCw
              size={15}
              strokeWidth={2.5}
              className={waiting ? "animate-spin" : undefined}
            />
            Try again
          </button>

          {/* A plain anchor, not next/link, and the lint rule is silenced
              deliberately. This boundary catches failures that can leave the
              client router in a state it cannot navigate out of, so the way
              out has to be a full page load rather than a client transition
              through the machinery that just broke. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="rounded-dash-sm border border-dash-line px-4 py-2.5 text-[0.875rem] font-bold text-dash-ink transition-colors hover:border-dash-ink"
          >
            Back to the board
          </a>
        </div>

        {tries >= 2 && unreachable && (
          <p className="mt-5 text-[0.8125rem] leading-relaxed text-dash-muted">
            Still failing after {tries} attempts. If the rest of the internet is working,
            the database itself is likely down rather than the link to it. Whoever runs
            the deployment should check the database provider&rsquo;s status before anybody
            changes anything here.
          </p>
        )}

        {error?.digest && (
          <p className="figure mt-6 text-[0.6875rem] text-dash-muted">
            Reference {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
