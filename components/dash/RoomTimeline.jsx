"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Flag, MapPin } from "lucide-react";

import { SLOT_MINUTES } from "@/lib/timeline";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The night as one operational clock.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A PHASE WITH NO TIME BESIDE IT IS THE POINT
 *
 *  The instinct on a timeline screen is to fill it: print the timetable, show
 *  eight tidy rows, five o'clock to nine. That screen is a photograph of a
 *  document and it looks exactly the same on the morning the lorries did not
 *  arrive.
 *
 *  Here, a phase that has not been observed carries no time and says what
 *  would have to be seen for it to have one. The empty rows are the most
 *  informative thing on the page, so they are drawn plainly and never hidden.
 *
 *  ── THE PHASES USED TO BE DRAWN TWICE, EIGHTEEN INCHES APART ────────────
 *  There was a clock strip along the top of this panel and an evenly spaced
 *  list underneath it, both showing the same eight phases. The strip existed
 *  for a good reason — an evenly spaced list is a lie about a night, because
 *  four things happen in one hour and then nothing happens for three — but
 *  answering that with a second drawing of the same data left a reader
 *  matching dots to rows by eye, and left the product with two pictures to
 *  keep in step.
 *
 *  They are one object now: a spine whose gaps are proportional to the time
 *  that actually elapsed. The three-hour silence is drawn three times the
 *  height of the one-hour one, so the gap is the visible thing it always
 *  should have been, and the exact duration is printed inside it — because a
 *  drawing that has been compressed to fit a column must never be the only
 *  place a figure exists.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── TWO DIRECTIONS, AND BOTH ARE DELIBERATE ────────────────────────────────
 * The half-hours run left to right, the way a clock does. The moments beneath
 * run newest first, the way anything read during a live night is read. Each
 * form matches how it is used rather than both being forced into one order.
 */

export default function RoomTimeline({ timeline, onGo, onPlace }) {
  /* Which phase is open. Null until somebody asks: a panel that opens itself
     on the first phase would put an answer on the screen nobody asked for and
     push the track that was the point off the top. */
  const [selected, setSelected] = useState(null);

  if (!timeline) return null;

  const { slots, phases, moments, quietFor } = timeline;
  const peak = Math.max(1, ...slots.map((slot) => slot.filed));
  const loudest = Math.max(1, ...slots.map((slot) => slot.incidents));
  /* ── THE MORNING'S OWN SCALE ────────────────────────────────────────────
     Updates run to their own maximum rather than to the returns'. They are a
     different quantity — eight presses a booth against one return a booth —
     and sharing a scale would draw the whole field's morning as a flat line
     under the evening's count. */
  const busiest = Math.max(1, ...slots.map((slot) => slot.updates ?? 0));

  /* ── THE CHART DRAWS ONCE THE DAY STARTS, NOT ONCE THE COUNTING DOES ────
     This used to wait for the first return, so a screen watched through an
     entire morning of agents arriving, materials landing and voting opening
     showed the empty state and the words "nothing yet". The night starts when
     the first agent says it has. */
  const started = slots.some((slot) => slot.filed || slot.updates);

  const observed = phases.filter((phase) => phase.at).length;
  const totalFiled = slots.reduce((sum, slot) => sum + slot.filed, 0);
  const totalReports = slots.reduce((sum, slot) => sum + slot.incidents, 0);
  const totalUpdates = slots.reduce((sum, slot) => sum + (slot.updates ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      {/* ══════════════════════════════════════════════════ the night, drawn */}
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-dash-line px-5 py-3.5">
          <div>
            <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
              The night, half-hour by half-hour
            </h2>
            <p className="mt-0.5 text-[0.8125rem] text-dash-muted">
              Returns above the line, reports from the field below it.
            </p>
          </div>

          {/* ── THE ONE FIGURE THE CHART CANNOT DRAW ──────────────────────
              How long the count has been still. A room glancing at a chart
              full of bars cannot tell a busy night from one that stopped
              twenty minutes ago, because the bars that are there look the
              same either way. This is the number that separates them. */}
          <p className="flex items-baseline gap-2">
            <span className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
              Quiet for
            </span>
            <span
              className={cn(
                "figure text-[1.25rem] leading-none font-bold tabular-nums",
                quietFor != null && quietFor > 45 ? "text-flag-700" : "text-dash-ink"
              )}
            >
              {quietFor == null ? "—" : `${Math.round(quietFor)}m`}
            </span>
          </p>
        </header>

        <div className="px-5 py-4">
          {!started ? (
            <p className="py-10 text-center text-[0.875rem] text-dash-muted">
              Nothing has happened yet today.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex min-w-[34rem] gap-3">
                {/* ── A SCALE, SO THE BARS MEAN SOMETHING ─────────────────
                    The chart had no axis at all, which made every column a
                    ratio to a peak the reader could not see. Two labels are
                    enough: the tallest bar's value, and the floor. */}
                <div
                  aria-hidden="true"
                  className="flex w-9 shrink-0 flex-col justify-between pb-11 text-right"
                >
                  <span className="figure text-[0.625rem] leading-none text-dash-muted tabular-nums">
                    {formatNumber(peak)}
                  </span>
                  <span className="figure text-[0.625rem] leading-none text-dash-muted tabular-nums">
                    0
                  </span>
                </div>

                <div className="flex min-w-0 flex-1 items-stretch gap-[2px]">
                  {slots.map((slot, index) => {
                    const last = index === slots.length - 1;
                    return (
                      <div
                        key={index}
                        className="group flex min-w-0 flex-1 flex-col"
                        title={tip(slot)}
                      >
                        {/* returns */}
                        <div className="flex h-28 items-end">
                          <div
                            className={cn(
                              "w-full rounded-t-[3px] transition-[height,opacity] duration-500",
                              "group-hover:opacity-80"
                            )}
                            style={{
                              height: `${slot.filed ? Math.max(3, (slot.filed / peak) * 100) : 1}%`,
                              background: slot.filed
                                ? /* The newest column is the live one. Marking
                                     it means a reader can find "now" without
                                     counting columns from the right. */
                                  last
                                  ? "var(--color-red-500)"
                                  : "var(--color-dash-ink)"
                                : "var(--color-dash-line)",
                            }}
                          />
                        </div>

                        {/* ── WHAT THE AGENTS SENT, ON ITS OWN THIN TRACK ──
                            A third quantity and therefore a third track: the
                            file's own rule is that two kinds of event must not
                            share an axis, and an update is neither a return
                            nor a report. It is thin because it is context for
                            the other two rather than the subject — but it is
                            the only thing on this chart that is not zero at
                            nine in the morning, which is most of a polling
                            day. */}
                        <div className="flex h-4 items-end pb-[2px]">
                          <div
                            className="w-full rounded-t-[2px] transition-[height] duration-500"
                            style={{
                              height: `${slot.updates ? Math.max(12, ((slot.updates ?? 0) / busiest) * 100) : 1}%`,
                              background: slot.updates
                                ? "var(--color-blue-500)"
                                : "var(--color-dash-line)",
                            }}
                          />
                        </div>

                        {/* the axis: the hour, and only every other one on a
                            long night, so the labels never collide */}
                        <span className="figure border-y border-dash-line py-1 text-center text-[0.625rem] leading-none text-dash-muted tabular-nums">
                          {index % 2 === 0 || slots.length < 12 ? hour(slot.at) : " "}
                        </span>

                        {/* reports, hanging down: two different kinds of event
                            must not share one axis, or a busy hour and a bad
                            hour draw the same bar */}
                        <div className="flex h-11 items-start">
                          <div
                            className="w-full rounded-b-[3px] transition-[height] duration-500"
                            style={{
                              height: `${slot.incidents ? Math.max(6, (slot.incidents / loudest) * 100) : 1}%`,
                              background: slot.loud
                                ? "var(--color-red-500)"
                                : slot.incidents
                                  ? "var(--color-flag-500)"
                                  : "var(--color-dash-line)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <p className="sr-only">
            {slots
              .map(
                (slot) =>
                  `${hour(slot.at)}: ${slot.filed} returns, ${slot.verified} verified, ${slot.incidents} reports, ${slot.updates ?? 0} updates from agents`
              )
              .join(". ")}
          </p>
        </div>

        {/* A legend that is also the totals, so the two colours are explained
            and the chart's whole content is stated once in words. */}
        <footer className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-dash-line px-5 py-2.5 text-[0.75rem] text-dash-muted">
          <Key colour="var(--color-dash-ink)" label="Returns filed" value={totalFiled} />
          <Key colour="var(--color-blue-500)" label="Updates from agents" value={totalUpdates} />
          <Key colour="var(--color-flag-500)" label="Reports from the field" value={totalReports} />
          <Key colour="var(--color-red-500)" label="Most recent half-hour" />
          <span className="ml-auto">{SLOT_MINUTES} minutes to a column, running to now.</span>
        </footer>
      </section>

      {/* ══════════════════════════════ the phases, along the day, left to right
          ── IT WAS A COLUMN, AND A DAY IS NOT A COLUMN ─────────────────────
          The phases ran down a 23rem column: a vertical spine whose height
          between two marks was the elapsed time. The arithmetic was right and
          the form was wrong. A day is read left to right — it is read that way
          on the chart eight inches above this one, which is the same day — and
          making a reader turn the same night ninety degrees between two panels
          costs them the comparison the two panels exist to support.

          Horizontal, the two line up: a phase mark sits over the half-hour
          column that produced it, and "the peak was at 18:30" is something the
          eye reads across rather than something it works out.

          ── PLACED BY THE CLOCK, NOT BY THE INDEX ──────────────────────────
          An evenly spaced row of phases is a lie about a night, because four
          things happen in one hour and then nothing happens for three. Each
          observed phase sits at its true position along the span, so the
          silences are the gaps — visible, and measurable against the axis
          underneath.

          ── AND THE UNSEEN ONES ARE NOT ON THE LINE ────────────────────────
          A phase nobody has observed has no time, and there is nowhere honest
          to put it on a scale made of time. Interpolating one between its
          neighbours would invent the very fact the panel exists to say is
          missing. They are listed under the track instead, named, with what
          would have to be seen for them to have a time — which is the most
          informative thing on this screen on the morning the lorries did not
          arrive. */}
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-dash-line px-5 py-3.5">
          <div>
            <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
              Phases of the day
            </h2>
            <p className="mt-0.5 text-[0.8125rem] text-dash-muted">
              Placed by the clock, so the gaps are the silences.
            </p>
          </div>
          <span className="figure shrink-0 text-[0.8125rem] font-bold text-dash-ink tabular-nums">
            {observed}/{phases.length} observed
          </span>
        </header>

        {observed === 0 ? (
          <p className="px-5 py-12 text-center text-[0.875rem] text-dash-muted">
            No phase of the day has been observed yet. Each one appears here the moment something
            happens that proves it.
          </p>
        ) : (
          <div className="px-5 py-5">
            <PhaseTrack
              phases={phases}
              slots={slots}
              selected={selected}
              onSelect={setSelected}
              onPlace={onPlace}
            />
          </div>
        )}

        <footer className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-dash-line px-5 py-3 text-[0.75rem] text-dash-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full bg-dash-ink" />
            Observed
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 rounded-full border border-dash-line bg-dash-card"
            />
            Not seen yet
          </span>
          <span className="ml-auto">
            Gaps grow with the time that actually passed, and carry the figure.
          </span>
        </footer>
      </section>

      <div className="grid gap-3">
        {/* ══════════════════════════════════════════════════════ the moments */}
        <section className="rounded-dash border border-dash-line bg-dash-card">
          <header className="flex items-baseline justify-between gap-3 border-b border-dash-line px-5 py-3.5">
            <div>
              <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
                What happened, and where
              </h2>
              <p className="mt-0.5 text-[0.8125rem] text-dash-muted">
                The first booth to reach each step, the first return from each state, and the
                reports at the top severity. Newest first.
              </p>
            </div>
            <span className="figure shrink-0 text-[0.8125rem] font-bold text-dash-ink tabular-nums">
              {formatNumber(moments.length)}
            </span>
          </header>

          {moments.length === 0 ? (
            <p className="px-5 py-12 text-center text-[0.875rem] text-dash-muted">
              Nothing worth naming yet.
            </p>
          ) : (
            <ul className="divide-y divide-dash-line">
              {moments.map((moment) => {
                /* Three kinds now, and each gets its own mark: a step the
                   field reached, a first return from a state, a report at the
                   top severity. One icon for all three would make the list
                   read as one kind of thing happening repeatedly. */
                const Icon =
                  moment.kind === "critical"
                    ? AlertTriangle
                    : moment.kind === "step"
                      ? Flag
                      : MapPin;
                const critical = moment.kind === "critical";

                return (
                  <li key={moment.id} className="flex items-start gap-3 px-5 py-3">
                    {/* The clock is the column a reader scans down, so it is
                        fixed width and monospaced and never moves. */}
                    <span className="figure w-11 shrink-0 pt-px text-[0.75rem] font-bold text-dash-muted tabular-nums">
                      {clock(moment.at)}
                    </span>
                    <Icon
                      size={15}
                      strokeWidth={2.25}
                      className={cn("mt-px shrink-0", critical ? "text-red-600" : "text-dash-muted")}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-[0.875rem] font-semibold",
                          critical ? "text-red-700" : "text-dash-ink"
                        )}
                      >
                        {moment.headline}
                      </span>
                      {moment.detail && (
                        <span className="figure mt-0.5 block truncate text-[0.75rem] text-dash-muted tabular-nums">
                          {moment.detail}
                        </span>
                      )}
                    </span>
                    {critical && (
                      <button
                        type="button"
                        onClick={() => onGo?.("situations")}
                        className="shrink-0 rounded-dash-sm px-2 py-1 text-[0.75rem] font-bold text-dash-ink transition-colors hover:bg-dash-bg"
                      >
                        Open →
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

/**
 * The day as a row of steps, with the real elapsed time in the gaps between.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY NOT MARKS ON A CONTINUOUS AXIS
 *
 *  The obvious horizontal timeline places each phase at its true position on
 *  one scale. It is elegant and it fails on the nights this room exists for.
 *  These phases cluster: polls open, first return, the peak and the first
 *  verification can all fall inside ninety minutes, and four labels placed at
 *  their true positions on a 1,000-pixel track are four labels on top of one
 *  another. Alternating them above and below halves the collisions and does
 *  not solve them, and the failure is silent — the screen looks designed and
 *  is unreadable exactly when the night is busiest.
 *
 *  So the cards are evenly spaced and the *connectors* carry the time. Each
 *  gap grows with the minutes it represents and prints its own duration, so
 *  the three-hour silence is visibly three times the one-hour one and says so
 *  in words. Proportion where it can be read, and never at the cost of the
 *  labels.
 *
 *  ── THE GAP IS CLAMPED, AND THE FIGURE IS PRINTED FOR THAT REASON ───────
 *  An eleven-hour overnight gap drawn to scale would push every phase after it
 *  off the screen. The connector is proportional between a floor and a
 *  ceiling; the duration inside it is the fact, and the width is the
 *  impression. A drawing that has been compressed to fit must never be the
 *  only place a figure exists.
 *
 *  ── AND A PHASE NOBODY HAS SEEN KEEPS ITS PLACE IN THE ROW ──────────────
 *  Hollow, dashed, with no time and no connector measurement — because there
 *  is no elapsed time to measure to something that has not happened. It stays
 *  in sequence rather than being dropped to a list, so the shape of the day
 *  is complete and the hole in it is where the hole actually is. On the
 *  morning the lorries did not arrive, that hole is the whole screen.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* The connector's width in pixels: proportional between these, then clamped.
   Forty minutes is about the rhythm of an ordinary evening, so a gap around
   that size sits mid-range and the unusual ones read as unusual. */
const LINK_MIN = 32;
const LINK_MAX = 168;
const LINK_PER_MINUTE = 1.1;

function PhaseTrack({ phases, slots, selected, onSelect, onPlace }) {
  const open = selected ? phases.find((phase) => phase.id === selected) : null;

  return (
    <div>
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-stretch">
        {phases.map((phase, index) => {
          const previous = index > 0 ? phases[index - 1] : null;
          /* Only measurable when both ends actually happened. */
          const gap =
            phase.at && previous?.at ? minutesBetween(previous.at, phase.at) : null;

          return (
            <li key={phase.id} className="flex items-stretch">
              {index > 0 && <Link minutes={gap} known={Boolean(phase.at && previous?.at)} />}
              <PhaseCard
                phase={phase}
                open={phase.id === selected}
                onSelect={onSelect}
              />
            </li>
          );
        })}
      </ol>
    </div>

    {/* ── WHAT THE CARD COULD NOT HOLD ────────────────────────────────────
        A card in a row is a headline: a time, a name, one figure. The rest —
        what actually arrived in that half-hour, from where, and what it was
        worth — needs room, and putting it on the cards would make the row
        unscannable for the sake of a paragraph nobody has asked for yet.

        So it opens underneath, once, for the phase somebody pressed. Under
        the track rather than over it, so pressing a card never moves the
        card that was pressed. */}
    {open && <PhaseDetail phase={open} slots={slots} onPlace={onPlace} />}
    </div>
  );
}

/**
 * One phase, opened.
 *
 * ── THE HALF-HOUR AROUND IT, NOT THE WHOLE NIGHT ───────────────────────────
 * A phase is a moment; what a room wants of it is the window it sits in —
 * what came in, how much of it was checked, what was reported, and where from.
 * The slot is found by time rather than by index, because the slots are a
 * fixed grid of the day and the phases are not.
 *
 * ── AND EVERY PLACE NAMED IS A DOOR ────────────────────────────────────────
 * The states a phase's returns came from are the reason somebody opened it.
 * Each one takes the map there, and the room's own drill carries on to the
 * local government, the ward and the polling unit — this panel does not need
 * a drill of its own, it needs to hand the room a place.
 */
function PhaseDetail({ phase, slots, onPlace }) {
  const at = phase.at ? new Date(phase.at).getTime() : null;

  /* The window this phase fell in. `SLOT_MINUTES` is the grid's width, so a
     phase belongs to the slot whose start is within one slot before it. */
  const slot =
    at == null
      ? null
      : slots.find((row) => {
          const start = new Date(row.at).getTime();
          return at >= start && at < start + SLOT_MINUTES * 60_000;
        }) ?? null;

  const places = slot?.states ?? [];

  return (
    <section className="mt-4 rounded-dash-sm border border-dash-line bg-dash-bg p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
          {phase.label}
        </h3>
        <span className="figure text-[0.8125rem] font-bold text-dash-ink tabular-nums">
          {phase.at ? clock(phase.at) : "not seen yet"}
        </span>
      </div>

      <p className="mt-1 text-[0.8125rem] leading-relaxed text-dash-muted">
        {phase.at ? phase.evidence : `Not seen yet. ${phase.evidence}`}
        {phase.nominal ? ` Timetabled for ${phase.nominal}.` : ""}
      </p>

      {slot ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-dash-sm border border-dash-line bg-dash-line sm:grid-cols-3 lg:grid-cols-6">
            <Figure label="Returns filed" value={slot.filed} />
            <Figure label="Checked" value={slot.verified} />
            <Figure label="Reports" value={slot.incidents} tone={slot.loud ? "alert" : undefined} />
            <Figure label="Updates" value={slot.updates ?? 0} />
            {/* Every booth heard from in this half-hour by any means. It is the
                honest answer to "is the field alive right now", which neither
                returns nor reports give on their own. */}
            <Figure label="Booths heard" value={slot.booths ?? 0} />
            <Figure label="Agents seen" value={slot.signedIn} />
          </dl>
          <p className="mt-2 text-[0.6875rem] text-dash-muted">
            In the {SLOT_MINUTES} minutes from {clock(slot.at)}.
          </p>
        </>
      ) : (
        <p className="mt-4 rounded-dash-sm bg-dash-card px-4 py-5 text-center text-[0.8125rem] text-dash-muted">
          {phase.at
            ? "Nothing was recorded in the half-hour this fell in."
            : "Nothing to show until this phase has been observed."}
        </p>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          THE SAME PHASE IN EVERY STATE

          ── ONE TIME AGAINST A PHASE DESCRIBES ONE STATE ─────────────────
          "Polling under way, 08:05" is a real observation of Nasarawa and is
          silently wrong about the other thirty-six. Polls open at half past
          eight in some places and eleven in others, and that spread is the
          most operationally useful thing on this screen: it is the difference
          between a slow morning everywhere and a problem in one region.

          So the phase opens into all of it — every state, earliest first, the
          ones still waiting at the end, and how far apart the first and last
          were. Filterable, because thirty-seven rows is a list somebody
          searches rather than reads.
          ══════════════════════════════════════════════════════════════════ */}
      <StateSpread phase={phase} onPlace={onPlace} />

      {places.length > 0 && (
        <div className="mt-4 border-t border-dash-line pt-3">
          <p className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
            Where it came from in this half-hour
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {places.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => onPlace?.(name)}
                  className="flex items-center gap-1 rounded-dash-sm border border-dash-line bg-dash-card px-2.5 py-1.5 text-[0.8125rem] font-semibold text-dash-ink transition-colors hover:border-dash-ink"
                >
                  {name}
                  <ChevronRight size={13} strokeWidth={2.5} className="text-dash-muted" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.6875rem] text-dash-muted">
            Opens the map there. Keep pressing to go down to a local government, a ward and a
            polling unit.
          </p>
        </div>
      )}
    </section>
  );
}


/**
 * One phase, in all thirty-seven states.
 *
 * ── EVERY STATE IS LISTED, INCLUDING THE ONES STILL WAITING ────────────────
 * A list of only the states that have reached a phase reads as though the rest
 * were not in the election. "Nothing seen in Bayelsa" is the finding, not an
 * absence of one, so Bayelsa is on the list with a dash and sits at the end.
 *
 * ── AND THE GAP IS FROM THE FIRST STATE, NOT FROM THE CLOCK ────────────────
 * "+3h 07m" against Abia means three hours after the earliest state got there.
 * That is the number a room acts on — an absolute time says when, and the gap
 * says whether it is late.
 */
function StateSpread({ phase, onPlace }) {
  const [query, setQuery] = useState("");
  const spread = phase.spread ?? { seen: 0, waiting: 0, first: null, last: null, minutes: null };

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return phase.byState ?? [];
    return (phase.byState ?? []).filter((row) => row.name.toLowerCase().includes(needle));
  }, [phase.byState, query]);

  if (!phase.byState?.length) return null;

  const from = spread.first?.at ? new Date(spread.first.at).getTime() : null;

  return (
    <div className="mt-4 border-t border-dash-line pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <p className="text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
          Every state
        </p>
        <label className="flex items-center gap-2">
          <span className="sr-only">Filter states</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter a state"
            className="w-40 rounded-dash-sm border border-dash-line bg-dash-card px-2.5 py-1 text-[0.8125rem] text-dash-ink placeholder:text-dash-muted"
          />
        </label>
      </div>

      {/* The spread, in one sentence, because it is the whole finding. */}
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-dash-muted">
        {spread.seen === 0 ? (
          <>Not seen anywhere yet.</>
        ) : (
          <>
            First in{" "}
            <strong className="font-semibold text-dash-ink">{spread.first.name}</strong> at{" "}
            <span className="figure text-dash-ink">{clock(spread.first.at)}</span>
            {spread.seen > 1 && (
              <>
                , last in{" "}
                <strong className="font-semibold text-dash-ink">{spread.last.name}</strong> at{" "}
                <span className="figure text-dash-ink">{clock(spread.last.at)}</span> —{" "}
                <strong className="font-semibold text-dash-ink">{gapOf(spread.minutes)}</strong>{" "}
                apart
              </>
            )}
            .{" "}
            {spread.waiting > 0 ? (
              <>
                {spread.waiting} state{spread.waiting === 1 ? " has" : "s have"} not got there.
              </>
            ) : (
              <>Every state has got there.</>
            )}
          </>
        )}
      </p>

      <ul className="mt-3 max-h-72 divide-y divide-dash-line overflow-y-auto rounded-dash-sm border border-dash-line bg-dash-card">
        {rows.length === 0 ? (
          <li className="px-3 py-4 text-center text-[0.8125rem] text-dash-muted">
            No state matches that.
          </li>
        ) : (
          rows.map((row) => {
            const at = row.at ? new Date(row.at).getTime() : null;
            const behind = at !== null && from !== null ? (at - from) / 60_000 : null;

            return (
              <li key={row.code}>
                <button
                  type="button"
                  onClick={() => onPlace?.(row.name)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-dash-bg"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      row.at ? "bg-dash-ink" : "bg-dash-line"
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold text-dash-ink">
                    {row.name}
                  </span>
                  {row.figure && (
                    <span className="hidden shrink-0 text-[0.75rem] text-dash-muted sm:inline">
                      {row.figure}
                    </span>
                  )}
                  <span
                    className={cn(
                      "figure w-14 shrink-0 text-right text-[0.8125rem] font-bold tabular-nums",
                      row.at ? "text-dash-ink" : "text-dash-muted"
                    )}
                  >
                    {row.at ? clock(row.at) : "—"}
                  </span>
                  <span className="figure w-16 shrink-0 text-right text-[0.75rem] text-dash-muted tabular-nums">
                    {behind === null ? "" : behind === 0 ? "first" : `+${gapOf(behind)}`}
                  </span>
                  <ChevronRight size={13} strokeWidth={2.5} className="shrink-0 text-dash-muted" />
                </button>
              </li>
            );
          })
        )}
      </ul>

      <p className="mt-2 text-[0.6875rem] text-dash-muted">
        Pressing a state opens the map there. A dash is a state this has not been seen in yet.
      </p>
    </div>
  );
}

/** Minutes as a room says them: "3h 07m", "45m". */
function gapOf(minutes) {
  const whole = Math.round(minutes ?? 0);
  if (whole < 60) return `${whole}m`;
  const hours = Math.floor(whole / 60);
  return `${hours}h ${String(whole % 60).padStart(2, "0")}m`;
}

function Figure({ label, value, tone }) {
  return (
    <div className="bg-dash-card px-3 py-2.5">
      <dt className="text-[0.625rem] font-bold tracking-[0.08em] text-dash-muted uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "figure mt-1 text-[1.125rem] leading-none font-bold tabular-nums",
          tone === "alert" ? "text-red-600" : "text-dash-ink"
        )}
      >
        {formatNumber(value ?? 0)}
      </dd>
    </div>
  );
}

/**
 * The gap between two phases, drawn and named.
 *
 * A gap between two things where one of them never happened is not a duration
 * and is not drawn as one — it is a dashed rule with no figure, because the
 * honest answer to "how long between these" is that nobody knows.
 */
function Link({ minutes, known }) {
  const width = known
    ? Math.round(Math.min(LINK_MAX, Math.max(LINK_MIN, minutes * LINK_PER_MINUTE)))
    : LINK_MIN;

  /* Long enough to be worth naming. Below this the connector is just spacing
     and a figure on it would be noise between two things that happened
     essentially together. */
  const notable = known && minutes >= 30;

  return (
    <div
      className="flex shrink-0 flex-col justify-center px-1 pb-8"
      style={{ width }}
      aria-hidden="true"
    >
      <div
        className={cn(
          "h-px w-full",
          known
            ? notable
              ? "bg-dash-ink/30"
              : "bg-dash-line"
            : "bg-[linear-gradient(to_right,var(--color-dash-line)_50%,transparent_50%)] bg-[length:5px_1px]"
        )}
      />
      {notable && (
        <p className="figure mt-1.5 text-center text-[0.625rem] leading-none whitespace-nowrap text-dash-muted tabular-nums">
          {duration(minutes)}
        </p>
      )}
    </div>
  );
}

function PhaseCard({ phase, open, onSelect }) {
  const seen = Boolean(phase.at);

  return (
    /* A button, not a div with a handler: this is reachable by keyboard, says
       what it does to a screen reader, and reports whether it is the one
       currently open. */
    <button
      type="button"
      aria-expanded={open}
      onClick={() => onSelect?.(open ? null : phase.id)}
      /* ── AND A DOUBLE PRESS ALWAYS LEAVES IT OPEN ──────────────────────
         A single press toggles, which is right for a card somebody is
         flicking between. A double press on a toggle is two toggles and
         lands back where it started — so the second press forces it open
         rather than repeating the toggle. Somebody who double-clicks to
         "go into" a phase gets the phase. */
      onDoubleClick={() => onSelect?.(phase.id)}
      className={cn(
        "flex w-[10.5rem] shrink-0 flex-col rounded-dash-sm border px-3 py-2.5 text-left transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
        open
          ? "border-dash-ink bg-dash-card"
          : seen
            ? "border-dash-line bg-dash-card hover:border-dash-ink"
            : "border-dashed border-dash-line bg-dash-bg hover:border-dash-muted"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "size-2 shrink-0 rounded-full",
            seen ? "bg-dash-ink" : "border border-dash-line bg-dash-card"
          )}
        />
        <span
          className={cn(
            "figure text-[0.9375rem] leading-none font-bold tabular-nums",
            seen ? "text-dash-ink" : "text-dash-muted"
          )}
        >
          {seen ? clock(phase.at) : "—"}
        </span>
      </div>

      <p
        className={cn(
          "mt-1.5 text-[0.8125rem] leading-tight font-semibold",
          seen ? "text-dash-ink" : "text-dash-muted"
        )}
      >
        {phase.label}
      </p>

      <p className="mt-1 text-[0.6875rem] leading-snug text-dash-muted">
        {seen ? phase.figure || phase.evidence : phase.evidence}
      </p>

      {!seen && (
        <p className="mt-1.5 text-[0.625rem] font-semibold tracking-[0.06em] text-dash-muted/70 uppercase">
          Not seen yet
          {phase.nominal ? ` · due ${phase.nominal}` : ""}
        </p>
      )}
    </button>
  );
}

function Key({ colour, label, value }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[2px]" style={{ background: colour }} />
      {label}
      {value != null && (
        <span className="figure font-bold text-dash-ink tabular-nums">{formatNumber(value)}</span>
      )}
    </span>
  );
}

/** The hour a bucket opens, in the reader's own zone. */
function hour(at) {
  return new Date(at).toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const clock = hour;


const minutesBetween = (from, to) => (new Date(to).getTime() - new Date(from).getTime()) / 60000;


/**
 * A duration in the fewest words that stay exact.
 *
 * Named `duration` and not `span`: `timeline.span` is the day's start and end,
 * and a helper sharing that name was shadowed by the destructured binding
 * inside the component — which is not a syntax error, not a lint error, and a
 * TypeError the first time a gap is long enough to be printed.
 */
function duration(minutes) {
  if (minutes < 90) return `${Math.round(minutes)} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours}h ${rest}m` : `${hours} hours`;
}

function tip(slot) {
  return [
    `${hour(slot.at)} — ${slot.filed} returns`,
    slot.verified ? `${slot.verified} verified` : null,
    slot.updates ? `${slot.updates} updates` : null,
    slot.incidents ? `${slot.incidents} reports` : null,
    slot.states.length ? slot.states.slice(0, 3).join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
