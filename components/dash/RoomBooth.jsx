"use client";

import { useState } from "react";
import { ArrowRight, Check, CircleSlash, PhoneCall, ScanLine } from "lucide-react";

import { quiet } from "@/lib/pulse";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Booth: every booth we hold, in the one state it is actually in.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE PICTURE AND THE CONTROL ARE ONE OBJECT
 *
 *  This screen was seven panels stacked in a column two hundred pixels wide:
 *  a meter, three cells, a rejected line, a funnel, and three tabs a reader
 *  had to choose between before knowing what was behind any of them. Every
 *  one of them was the same size and the same weight, so the eye had nowhere
 *  to land, and the tabs asked the reader to guess where their work was.
 *
 *  It is one instrument now, and the whole design rests on a single fact
 *  about the data: every booth we hold is in exactly one of four states.
 *
 *      checked      filed, and through. Done.
 *      stuck        filed, and waiting on us.
 *      silent       we have heard nothing.
 *      thrown out   filed, and refused. Out of the count.
 *
 *  Those four partition the roster — they sum to it exactly, with no overlap
 *  and no remainder — so they can be drawn as one bar that is the entire
 *  night at a glance. And because it is a partition, pressing a band of that
 *  bar is a complete, unambiguous filter. The bar is the tab strip. There is
 *  no separate control to keep in step with the picture, and no reader
 *  choosing blind: the band they press is the band they can already see is
 *  the big one.
 *
 *  ── WHY THE HEADLINE IS A SENTENCE AND NOT A PERCENTAGE ─────────────────
 *  "94%" is the answer to a question nobody in a situation room is asking at
 *  two in the morning. "8 booths have said nothing" is an instruction, and it
 *  is the same fact. The percentage is on the strip above the map, where the
 *  reader who wants the state of the night rather than the work will find it,
 *  and it is deliberately not repeated here — a figure printed twice on one
 *  screen is not emphasis, it is two things to keep in step.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ── THE FOUR STATES, IN THE ORDER A NIGHT MOVES THROUGH THEM ──────────────
   Silent, then stuck, then checked: a booth travels left to right along this
   list as the evening goes on, so a healthy night visibly fills from the
   right. Thrown out sits at the end because it is not a stage, it is an exit.

   Colour is ordinal, not decorative — red is the furthest from done, and
   every band carries its word and its count in the legend, so the bar is
   never read by colour alone. */
const BANDS = [
  {
    id: "silent",
    label: "Silent",
    colour: "var(--color-red-500)",
    icon: PhoneCall,
    of: (here) => here?.silent ?? 0,
    /* What the reader is looking at, and who they would ring about it. Kept
       here beside the band rather than in the list, so the sentence changes
       with the selection and the reader never has to remember which tab they
       are on. */
    means: "We have heard nothing from these booths. This is a call to a coordinator.",
    empty: "Every booth we hold here has sent something.",
  },
  {
    id: "stuck",
    label: "Stuck",
    colour: "var(--color-amber-500)",
    icon: ScanLine,
    of: (here) => here?.stuck ?? 0,
    means: "These arrived and have not got through. This is a call to our own desk, not to a booth.",
    empty: "Nothing that arrived here is waiting on us.",
  },
  {
    id: "checked",
    label: "Checked",
    colour: "var(--color-emerald-500)",
    icon: Check,
    of: (here) => here?.verified ?? 0,
    means: "Filed, checked against the sheet, and usable in a bulletin.",
    empty: "Nothing has been checked here yet.",
  },
  {
    id: "rejected",
    label: "Thrown out",
    colour: "var(--color-dash-line)",
    icon: CircleSlash,
    of: (here) => here?.rejected ?? 0,
    /* Not a stage. A disputed return is out of every sum on this screen and
       out of the count, which is why it is drawn apart from the other three
       rather than folded into one of them. */
    means: "Refused, and out of the count entirely. Not waiting on anybody.",
    empty: "Nothing here has been thrown out.",
  },
];

export default function RoomBooth({
  here = null,
  places = [],
  childWord = "state",
  operations = null,
  pulse = null,
  ground = null,
  onOpen,
  onUnit,
  onGo,
}) {
  /* Opens on the work rather than on the achievement. A room arriving at this
     screen is not here to be told what is finished. */
  const [band, setBand] = useState("silent");

  const assigned = here?.assigned ?? 0;
  const silent = here?.silent ?? 0;
  const stuck = here?.stuck ?? 0;

  const prefix = here?.prefix ?? "";
  const within = (code) => !prefix || String(code ?? "").startsWith(prefix);

  const silentRows = (pulse?.silence ?? []).filter((row) => within(row.unitCode));
  const stuckRows = (operations?.stuck ?? []).filter((row) => within(row.unitCode));

  /* ── WHERE IT IS WORST, WHICHEVER BAND IS SELECTED ─────────────────────
     Ordered by the count of missing booths rather than by the rate: a ward at
     0% of two booths and a state at 40% of nine hundred are both behind, and
     only one is worth the room's next hour. */
  const worst = [...places]
    .filter((row) => (row.silentBooths ?? 0) > 0)
    .sort((a, b) => (b.silentBooths ?? 0) - (a.silentBooths ?? 0));

  const active = BANDS.find((row) => row.id === band) ?? BANDS[0];
  const count = active.of(here);

  return (
    <div className="flex flex-col gap-3">
      {/* ══════════════════════════════════════════════ the one sentence */}
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <div className="px-4 pt-4">
          <p className="text-[0.6875rem] font-bold tracking-[0.12em] text-dash-muted uppercase">
            {ground ? `Booths in ${ground}` : "Booths we hold"}
          </p>

          {/* The headline is the work, in words. Not a percentage — that is on
              the strip above the map, and printing it twice would be two
              things to keep in step rather than one thing said loudly. */}
          <p className="mt-1.5 font-display text-[1.5rem] leading-tight font-extrabold tracking-[-0.03em] text-dash-ink">
            {assigned === 0
              ? "Nobody is assigned here"
              : silent > 0
                ? `${formatNumber(silent)} ${silent === 1 ? "booth has" : "booths have"} said nothing`
                : stuck > 0
                  ? `${formatNumber(stuck)} waiting on us`
                  : "Everything we hold has filed"}
          </p>

          <p className="mt-1 text-[0.8125rem] text-dash-muted">
            {assigned === 0
              ? "No coordinator has been given a booth in this scope."
              : silent > 0
                ? `of ${formatNumber(assigned)} we have somebody at`
                : stuck > 0
                  ? `${formatNumber(assigned)} booths in, and none of them silent`
                  : `All ${formatNumber(assigned)} of them, and none silent`}
          </p>
        </div>

        {/* ── THE WHOLE NIGHT AS ONE BAR, AND THE BAR IS THE CONTROL ─────
            Four bands that partition the roster exactly. Pressing one filters
            the list below, so there is no separate tab strip to disagree with
            the picture — and a reader can see which band is big before they
            choose it, rather than guessing behind a label. */}
        {assigned > 0 && (
          <div className="px-4 pt-4 pb-1">
            <div
              className="flex h-9 w-full gap-0.5 overflow-hidden rounded-dash-sm"
              role="group"
              aria-label="Every booth we hold, by state"
            >
              {BANDS.map((row) => {
                const value = row.of(here);
                if (value === 0) return null;
                const share = (value / assigned) * 100;
                const on = band === row.id;

                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setBand(row.id)}
                    aria-pressed={on}
                    title={`${row.label}: ${formatNumber(value)} (${formatShare(share)})`}
                    style={{ width: `${share}%`, background: row.colour }}
                    className={cn(
                      "flex min-w-0 items-center justify-center transition-[filter,opacity]",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-dash-ink",
                      /* The selected band is full strength and the rest step
                         back. Dimming rather than outlining, because an
                         outline on a 6% sliver is thicker than the sliver. */
                      on ? "opacity-100" : "opacity-45 hover:opacity-75"
                    )}
                  >
                    {share >= 14 && (
                      <span
                        className={cn(
                          "figure truncate px-1 text-[0.6875rem] font-bold tabular-nums",
                          row.id === "rejected" ? "text-dash-muted" : "text-white"
                        )}
                      >
                        {formatNumber(value)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* The legend is the same control again, in words — because a band
                under about a seventh of the bar is too narrow to press, and
                because colour must never be the only carrier. */}
            <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5">
              {BANDS.map((row) => {
                const value = row.of(here);
                const on = band === row.id;

                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setBand(row.id)}
                      aria-pressed={on}
                      className={cn(
                        "flex items-center gap-1.5 rounded-dash-sm px-1.5 py-1 transition-colors",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-dash-ink",
                        on ? "bg-dash-bg" : "hover:bg-dash-bg"
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn("size-2.5 shrink-0 rounded-[2px]", !on && "opacity-45")}
                        style={{ background: row.colour }}
                      />
                      <span
                        className={cn(
                          "text-[0.75rem]",
                          on ? "font-bold text-dash-ink" : "text-dash-muted"
                        )}
                      >
                        {row.label}
                      </span>
                      <span className="figure text-[0.75rem] font-bold text-dash-ink tabular-nums">
                        {formatNumber(value)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* What the selection means, and who it is a call to. One line, and it
            changes with the band, so the reader never has to remember which
            list they are looking at. */}
        <p className="border-t border-dash-line px-4 py-2.5 text-[0.75rem] leading-relaxed text-dash-muted">
          {active.means}
        </p>
      </section>

      {/* ══════════════════════════════════════════════════════ the work */}
      <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
        <header className="flex items-baseline justify-between gap-3 border-b border-dash-line px-4 py-3">
          <h3 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
            {active.label}
          </h3>
          <span className="figure text-[0.8125rem] font-bold text-dash-ink tabular-nums">
            {formatNumber(count)}
          </span>
        </header>

        <div className="max-h-[24rem] overflow-y-auto">
          {band === "silent" &&
            (silentRows.length === 0 ? (
              <Empty>{active.empty}</Empty>
            ) : (
              <Rows>
                {silentRows.slice(0, 40).map((row) => (
                  <Row
                    key={row.id ?? row.unitCode}
                    icon={PhoneCall}
                    tone="alert"
                    code={row.unitCode ?? "no booth code"}
                    detail={[row.name, row.state].filter(Boolean).join(" · ")}
                    /* Never signed in and gone quiet after signing in are
                       different problems: the second may be somebody in
                       trouble, the first is a deployment that never happened. */
                    aside={row.quietMinutes === null ? "never signed in" : `quiet ${quiet(row.quietMinutes)}`}
                    onClick={() => row.unitCode && onUnit?.(row.unitCode)}
                  />
                ))}
              </Rows>
            ))}

          {band === "stuck" &&
            (stuckRows.length === 0 ? (
              <Empty>{active.empty}</Empty>
            ) : (
              <Rows>
                {stuckRows.slice(0, 40).map((row) => (
                  <Row
                    key={row.unitCode}
                    icon={ScanLine}
                    tone="warn"
                    code={row.unitCode}
                    /* Why it stopped, in the rung's own words, so the row is
                       readable without looking anything else up. */
                    detail={row.because}
                    aside={row.minutes === null ? "—" : quiet(row.minutes)}
                    onClick={() => onUnit?.(row.unitCode)}
                  />
                ))}
              </Rows>
            ))}

          {/* ── CHECKED AND THROWN OUT ARE NOT WORK, AND SAY SO ───────────
              Neither is a queue. A room does not chase a checked return, and
              a thrown-out one is already out of the count. Listing places
              here under a "Checked" heading — which is what this did — puts a
              count of 284 above a list of eight silent wards and asks the
              reader to work out that the two are unrelated. The honest answer
              to pressing these bands is a sentence saying there is nothing to
              do, and the thinnest places stay where they always are, in the
              footer, under their own heading. */}
          {(band === "checked" || band === "rejected") && (
            <p className="px-4 py-10 text-center text-[0.8125rem] leading-relaxed text-dash-muted">
              {count === 0
                ? active.empty
                : `${formatNumber(count)} ${count === 1 ? "booth" : "booths"} — and nothing to do about ${count === 1 ? "it" : "them"}. ${
                    band === "checked"
                      ? "These are done."
                      : "These are out of the count."
                  }`}
            </p>
          )}
        </div>

        {/* ── THE PLACES, ALWAYS REACHABLE, NEVER COMPETING ──────────────
            Where the ground is thin is a different question from which booths
            are silent — it is the same finding one level up — so it is a
            footer that drills rather than a fifth panel of its own. Shown
            under every band, because it is the one thing a room wants next
            whichever list it was just reading. */}
        {worst.length > 0 && (
          <footer className="border-t border-dash-line">
            <p className="px-4 pt-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
              Where it is thinnest
            </p>
            <Rows>
              {worst.slice(0, 5).map((row) => (
                <Row
                  key={row.key ?? row.name}
                  tone="alert"
                  code={row.name}
                  detail={`${formatNumber(row.filedBooths ?? 0)} of ${formatNumber(row.assignedBooths ?? 0)} filed`}
                  aside={`${formatNumber(row.silentBooths)} silent`}
                  chevron
                  onClick={() => onOpen?.(row)}
                />
              ))}
            </Rows>
          </footer>
        )}

        <p className="border-t border-dash-line px-4 py-2.5 text-[0.75rem] leading-relaxed text-dash-muted">
          Every share here is against booths we have somebody at, never the whole registry. Tap a{" "}
          {childWord} to drill; tap a booth code to open everything known about it.
        </p>
      </section>

      {onGo && silent > 0 && (
        <button
          type="button"
          onClick={() => onGo("situations")}
          className="rounded-dash border border-dash-line bg-dash-card px-4 py-3 text-left text-[0.8125rem] text-dash-muted transition-colors hover:border-dash-ink hover:text-dash-ink"
        >
          A booth going quiet is sometimes a booth in trouble. What the field reported →
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

const Rows = ({ children }) => <ul className="divide-y divide-dash-line">{children}</ul>;

/**
 * One line of work.
 *
 * Every row is the same shape whatever the band: what it is, why it is here,
 * and how long it has been. A list whose rows change shape between tabs makes
 * the reader re-learn it each time they switch.
 */
function Row({ icon: Icon, tone, code, detail, aside, chevron = false, onClick }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-dash-bg"
      >
        {Icon && (
          <Icon
            size={14}
            strokeWidth={2.25}
            className={cn(
              "shrink-0",
              tone === "alert" ? "text-red-600" : tone === "warn" ? "text-amber-700" : "text-dash-muted"
            )}
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="figure block truncate text-[0.8125rem] font-bold text-dash-ink">
            {code}
          </span>
          {detail && (
            <span className="block truncate text-[0.75rem] text-dash-muted">{detail}</span>
          )}
        </span>
        {aside && (
          <span className="shrink-0 text-right text-[0.75rem] whitespace-nowrap text-dash-muted">
            {aside}
          </span>
        )}
        {chevron && <ArrowRight size={13} className="shrink-0 text-dash-muted" />}
      </button>
    </li>
  );
}

const Empty = ({ children }) => (
  <p className="px-4 py-10 text-center text-[0.8125rem] text-dash-muted">{children}</p>
);
