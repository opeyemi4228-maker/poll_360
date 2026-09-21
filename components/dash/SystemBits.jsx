import { cache } from "react";

import { Badge } from "./DashCard";
import { cn } from "@/lib/utils";

/**
 * The parts every system console screen is built from.
 *
 * ── WHY THESE ARE SHARED AND NOT COPIED ────────────────────────────────────
 * Eight screens ask the same three questions in the same three shapes: what
 * is this, what state is it in, and when did it last do anything. Written out
 * eight times that is eight chances for "never" to be drawn as "—" on one
 * page and as an empty cell on another, and a console whose blanks mean
 * different things on different pages is a console nobody can read quickly.
 *
 * Server components, all of them. Nothing here needs a browser, and the
 * relative times are rendered once on the server rather than ticking — a
 * clock that updates itself would have to be a client component, would
 * disagree with the server on its first paint, and would tell an
 * administrator nothing they cannot get by reloading.
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * One clock for the whole page.
 *
 * ── WHY THE TIME IS NOT READ WHERE IT IS USED ──────────────────────────────
 * `Date.now()` called inside a component answers differently every time the
 * component renders, which makes the tree unstable and, more to the point
 * here, makes two rows on one screen measurable from two different instants.
 * "4 minutes ago" beside "5 minutes ago" should mean the second thing is a
 * minute older, not that React got round to it a minute later.
 *
 * `cache` pins it to a single value for the whole request, so every relative
 * time on a page is measured from the same moment.
 */
/* Exported, because the recency chart in SystemCharts.jsx has to be measured
   from the same instant as the "4 minutes ago" printed beside it. Two clocks
   on one page is how a dot lands to the left of a word that says it is newer. */
export const requestClock = cache(() => Date.now());

/**
 * How long ago something happened, in words, and never a lie.
 *
 * Beyond a day it switches to the date: "31 hours ago" is arithmetic nobody
 * wants to do at 2am, and "2 Sep, 19:41" is the thing they were going to work
 * out anyway. Written in Lagos time, like every other clock in the product,
 * because the person reading it is in Lagos and the server is not.
 */
export function Since({ at, never = "never" }) {
  if (!at) return <span className="text-dash-muted">{never}</span>;

  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return <span className="text-dash-muted">{never}</span>;

  const seconds = Math.round((requestClock() - date.getTime()) / 1000);

  let words;
  if (seconds < 0) words = "just now";
  else if (seconds < 90) words = "just now";
  else if (seconds < 3600) words = `${Math.round(seconds / 60)} minutes ago`;
  else if (seconds < 86400) {
    const hours = Math.round(seconds / 3600);
    words = `${hours} hour${hours === 1 ? "" : "s"} ago`;
  } else {
    words = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Africa/Lagos",
    }).format(date);
  }

  /* The exact instant stays in the title. Somebody reconciling an incident
     against a broadcast needs the second, and "3 hours ago" cannot give it
     to them. */
  return (
    <time dateTime={date.toISOString()} title={date.toISOString()} className="text-dash-muted">
      {words}
    </time>
  );
}

/**
 * Configured, half-configured, or not configured.
 *
 * The middle state carries the warning colour on purpose. Half-configured is
 * strictly worse than switched off: it looks connected from every other
 * screen in the product and cannot deliver a single message.
 */
export function Wired({ state }) {
  if (state === "on") return <Badge tone="good">Connected</Badge>;
  if (state === "partial") return <Badge tone="warn">Half set up</Badge>;
  return <Badge tone="neutral">Not set up</Badge>;
}

/** A labelled fact. The console's unit of content. */
export function Field({ label, children, className }) {
  return (
    <div className={cn("border-t border-dash-line py-3 first:border-t-0 first:pt-0", className)}>
      <dt className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[0.875rem] wrap-break-word text-dash-ink">{children}</dd>
    </div>
  );
}

/**
 * A table that scrolls sideways rather than squashing.
 *
 * Every table on these screens has a column somebody will need in full — a
 * unit code, an email address, an action name — and a column that has been
 * squeezed to three characters is a column that is not there. On a phone the
 * table moves; the page never does.
 */
export function Table({ head, children, className }) {
  return (
    <div className={cn("-mx-5 overflow-x-auto px-5", className)}>
      <table className="w-full min-w-[36rem] text-left text-[0.8125rem]">
        <thead>
          <tr className="border-b border-dash-line">
            {head.map((column) => (
              <th
                key={typeof column === "string" ? column : column.label}
                scope="col"
                className={cn(
                  "px-3 py-2 text-[0.6875rem] font-bold tracking-[0.08em] text-dash-muted uppercase first:pl-0 last:pr-0",
                  typeof column === "object" && column.numeric && "text-right"
                )}
              >
                {typeof column === "string" ? column : column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-dash-line">{children}</tbody>
      </table>
    </div>
  );
}

/** A cell. `numeric` right-aligns and locks the digit width so columns line up. */
export function Cell({ children, numeric = false, strong = false, muted = false, className }) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 align-top first:pl-0 last:pr-0",
        numeric && "figure text-right tabular-nums",
        strong ? "font-bold text-dash-ink" : muted ? "text-dash-muted" : "text-dash-ink",
        className
      )}
    >
      {children}
    </td>
  );
}

/**
 * A count and what it counts, in a strip.
 *
 * Deliberately smaller than `StatCard`: these are the console's supporting
 * figures, and a system console that renders "14 accounts" at the same weight
 * the count itself is rendered at is a console competing with the election.
 */
export function Counts({ items }) {
  return (
    <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-dash border border-dash-line bg-dash-line sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-dash-card px-4 py-3.5">
          <dt className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
            {item.label}
          </dt>
          <dd
            className={cn(
              "figure mt-1 text-[1.375rem] leading-none font-bold",
              item.tone === "alert" ? "text-red-600" : item.tone === "good" ? "text-ok-700" : "text-dash-ink"
            )}
          >
            {item.value}
          </dd>
          {item.context && (
            <p className="mt-1.5 text-[0.75rem] text-dash-muted">{item.context}</p>
          )}
        </div>
      ))}
    </dl>
  );
}
