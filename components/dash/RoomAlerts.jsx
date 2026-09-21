"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Info, ShieldAlert, ShieldCheck } from "lucide-react";

import { Gauge, LevelMeter, TONE } from "./Figures";
import { LEVELS, LEVEL_ORDER } from "@/lib/alerts";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Alerts and escalations.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  RANK IS COUNTED, NOT COLOURED
 *
 *  The first version of this screen drew five levels in five colours and
 *  printed the thresholds underneath as six sentences. Both were wrong, and
 *  the colour one was wrong in a way that only a measurement finds:
 *  amber and orange separate by ΔE 1.6 for a deuteranope and 6.7 for somebody
 *  with full colour vision. They are the same colour. And they were carrying
 *  the boundary between "worth a call" and "this will cost the night".
 *
 *  So the level is a stepped meter — one bar to five, countable, exact, alive
 *  in greyscale and in a photograph of this screen taken off a wall. Severity
 *  colour is one hue getting darker behind it, and the word is always there.
 *  Three encodings, none of them load-bearing alone.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── AND THE THRESHOLDS ARE DRAWN, NOT DESCRIBED ────────────────────────────
 * "A count is stalled after thirty minutes" is a fact about the software. How
 * close tonight is to that line is a fact about tonight, and it is the one
 * somebody is actually asking. Each line is now a bullet: where the room is,
 * against where the line sits. Nothing to read.
 *
 * ── ACKNOWLEDGING IS LOCAL, ON PURPOSE ─────────────────────────────────────
 * Dismissing is this browser's business, not the project's. Two rooms watching
 * one election must not be able to silence each other's warnings, and a room
 * lead clearing a row is saying "I have seen this", not "this is dealt with".
 * The rule that raised it will raise it again the moment it is true again.
 */

/* The chip a level wears. Dark text on the light fills, because amber on the
   surface is 2.08:1 and cannot carry a label on its own. */
const CHIP = {
  CRITICAL: "bg-red-500 text-white",
  SERIOUS: "bg-red-400 text-white",
  WARNING: "bg-flag-500 text-flag-950",
  INFO: "bg-dash-bg text-dash-muted",
  NORMAL: "bg-ok-500 text-white",
};

const ICON = {
  CRITICAL: ShieldAlert,
  SERIOUS: AlertTriangle,
  WARNING: AlertTriangle,
  INFO: Info,
  NORMAL: ShieldCheck,
};

export default function RoomAlerts({ alerts, onGo }) {
  const [seen, setSeen] = useState(() => new Set());
  const [only, setOnly] = useState("all");

  const rows = useMemo(() => alerts?.alerts ?? [], [alerts]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        LEVEL_ORDER.map((level) => [level, rows.filter((row) => row.level === level).length])
      ),
    [rows]
  );

  const level = alerts?.level ?? "NORMAL";
  const shown = rows.filter((row) => (only === "all" ? true : row.level === only));
  const acknowledge = (id) => setSeen((held) => new Set(held).add(id));

  /* Everything that is actually above the line, which is not the same as the
     row count: Normal is a row and is not a warning. */
  const raised = rows.filter((row) => row.level !== "NORMAL").length;
  const worst = LEVELS[level];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        {/* ── THE ROOM'S STATE, AS ONE OBJECT ────────────────────────────
            An arc, because this is the single figure the screen is about and
            a dashboard of nothing but bars has no first place for the eye to
            land. One to a screen, never two. */}
        <section className="flex items-center gap-5 rounded-dash border border-dash-line bg-dash-card p-4">
          <Gauge share={(worst.rank / 5) * 100} tone={worst.tone} size={124} track={11}>
            <span className="flex flex-col items-center" style={{ color: TONE[worst.tone] }}>
              <LevelMeter rank={worst.rank} tone={worst.tone} size={5} />
              <span className="figure mt-2 text-[1.125rem] leading-none font-bold tracking-[-0.02em]">
                {worst.label}
              </span>
            </span>
          </Gauge>

          <div className="min-w-0">
            <p className="text-[0.625rem] font-semibold tracking-[0.14em] text-dash-muted uppercase">
              Above the line
            </p>
            <p className="figure text-[2.75rem] leading-none font-bold tracking-[-0.03em] text-dash-ink tabular-nums">
              {formatNumber(raised)}
            </p>

            {/* The mix, as one stacked strip. A legend is unnecessary — the
                filter row underneath is the legend, and it carries figures. */}
            <span aria-hidden="true" className="mt-3 flex h-2 gap-0.5 overflow-hidden">
              {LEVEL_ORDER.filter((id) => counts[id] > 0).map((id) => (
                <span
                  key={id}
                  title={`${LEVELS[id].label}: ${counts[id]}`}
                  className="rounded-full first:rounded-l-full last:rounded-r-full"
                  style={{
                    flex: counts[id],
                    background: TONE[LEVELS[id].tone],
                  }}
                />
              ))}
            </span>
          </div>
        </section>

        {/* ── WHERE THE NIGHT SITS AGAINST EACH LINE ─────────────────────*/}
        <section className="rounded-dash border border-dash-line bg-dash-card p-4">
          <h3 className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Against each line
          </h3>
          <ul className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {(alerts?.dials ?? []).map((dial) => (
              <li key={dial.id} title={dial.why}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[0.75rem] text-dash-muted">{dial.label}</span>
                  <span
                    className={cn(
                      "figure shrink-0 text-[0.8125rem] font-bold tabular-nums",
                      dial.over ? "text-red-700" : "text-dash-ink"
                    )}
                  >
                    {formatNumber(Math.round(dial.value))}
                    {dial.unit && <span className="font-normal"> {dial.unit}</span>}
                    <span className="font-normal text-dash-muted">
                      {" "}
                      / {formatNumber(dial.limit)}
                    </span>
                  </span>
                </div>

                {/* A bullet: the bar is where we are, the tick is the line.
                    Capped at twice the limit so a marker never vanishes off
                    the end of a bar forty times its length. */}
                <span className="relative mt-1 block h-[6px] overflow-hidden rounded-full bg-dash-bg">
                  <span
                    aria-hidden="true"
                    className="block h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.min(100, dial.share / 2)}%`,
                      background: dial.over ? TONE.alert : TONE.ink,
                    }}
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-1/2 w-[2px] bg-dash-ink/35"
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ── THE FILTER ROW, WHICH IS ALSO THE LEGEND ────────────────────
          One row, above the list, which is where a filter belongs. Each
          button carries its level's meter, so the key and the control are
          the same object rather than two things to look between. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter id="all" label="Everything" count={rows.length} active={only} onPick={setOnly} />
        {LEVEL_ORDER.filter((id) => counts[id] > 0).map((id) => (
          <Filter
            key={id}
            id={id}
            label={LEVELS[id].label}
            count={counts[id]}
            rank={LEVELS[id].rank}
            tone={LEVELS[id].tone}
            active={only}
            onPick={setOnly}
          />
        ))}
      </div>

      {/* ------------------------------------------------------------- rows */}
      <ul className="space-y-2">
        {shown.map((row) => {
          const done = seen.has(row.id);
          const meta = LEVELS[row.level];
          const Icon = ICON[row.level];

          return (
            <li
              key={row.id}
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-dash border border-dash-line bg-dash-card p-4 transition-opacity",
                done && "opacity-40"
              )}
            >
              {/* The level: a meter, a word, an icon, and a hue. */}
              <span className="flex shrink-0 items-center gap-2.5">
                <LevelMeter rank={meta.rank} tone={meta.tone} size={4} />
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-dash-sm px-2 py-1 text-[0.625rem] font-bold tracking-[0.1em] uppercase",
                    CHIP[row.level]
                  )}
                >
                  <Icon size={12} strokeWidth={2.75} />
                  {meta.label}
                </span>
              </span>

              {/* The figure is the object. It is the largest thing on the row
                  because it is the thing that decides what happens next. */}
              <span className="flex min-w-0 flex-1 items-baseline gap-3">
                {row.level !== "NORMAL" && (
                  <span
                    className={cn(
                      "figure shrink-0 text-[1.75rem] leading-none font-bold tracking-[-0.03em] tabular-nums",
                      row.level === "CRITICAL"
                        ? "text-red-700"
                        : row.level === "SERIOUS"
                          ? "text-red-600"
                          : row.level === "WARNING"
                            ? "text-flag-700"
                            : "text-dash-ink"
                    )}
                  >
                    {formatNumber(row.count)}
                    {row.unit === "minutes" && (
                      <span className="text-[0.875rem] font-semibold"> min</span>
                    )}
                  </span>
                )}

                <span className="min-w-0">
                  <span className="block text-[0.9375rem] font-semibold text-dash-ink">
                    {stripCount(row.headline, row.count)}
                  </span>
                  <span className="block truncate text-[0.75rem] text-dash-muted">
                    {row.detail}
                  </span>
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-1.5">
                {row.goto && (
                  <button
                    type="button"
                    onClick={() => onGo?.(row.goto)}
                    /* The act used to be a sentence on the row. It is the
                       button's tooltip now: it is guidance for the person who
                       has already decided to act, not something the other
                       eleven rows should each spend a line on. */
                    title={row.act ?? undefined}
                    className="flex items-center gap-1.5 rounded-dash-sm border border-dash-line px-2.5 py-1.5 text-[0.75rem] font-semibold text-dash-ink transition-colors hover:border-dash-ink"
                  >
                    Open
                    <ArrowRight size={13} strokeWidth={2.5} />
                  </button>
                )}
                {row.level !== "NORMAL" && (
                  <button
                    type="button"
                    onClick={() => acknowledge(row.id)}
                    aria-pressed={done}
                    aria-label={done ? "Seen" : "Mark as seen in this browser"}
                    title={done ? "Seen" : "Mark as seen in this browser"}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-dash-sm border transition-colors",
                      done
                        ? "border-ok-200 bg-ok-50 text-ok-700"
                        : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                    )}
                  >
                    <Check size={14} strokeWidth={2.75} />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {shown.length === 0 && (
        <p className="rounded-dash border border-dash-line bg-dash-card p-4 text-[0.875rem] text-dash-muted">
          Nothing at that level.
        </p>
      )}

      {/* The one sentence on this screen that is not replaceable by a shape,
          and the one it would be dishonest to drop. */}
      <p className="text-[0.75rem] text-dash-muted">
        Nothing here says a figure was falsified. The arithmetic rules say a return cannot be
        true and name the box that proves it; a person decides what that means.
      </p>

      <table className="sr-only">
        <caption>Alerts</caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{LEVELS[row.level].label}</th>
              <td>{row.headline}</td>
              <td>{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The headline with its leading figure removed.
 *
 * The count is drawn as a figure beside it at four times the size, and
 * "4 · 4 reports at the top severity" is the shape of a screen nobody trusts.
 * Only a leading number is taken, and only when it is the count itself.
 */
function stripCount(headline, count) {
  const lead = new RegExp(`^${formatNumber(count)}\\s+`);
  return headline.replace(lead, "").replace(/^./, (first) => first.toUpperCase());
}

function Filter({ id, label, count, rank, tone, active, onPick }) {
  const on = active === id;
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      aria-pressed={on}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.75rem] font-semibold transition-colors",
        on
          ? "border-dash-ink bg-dash-ink text-white"
          : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
      )}
    >
      {rank ? <LevelMeter rank={rank} tone={on ? "muted" : tone} size={3} /> : null}
      {label}
      <span className="figure tabular-nums opacity-70">{formatNumber(count)}</span>
    </button>
  );
}
