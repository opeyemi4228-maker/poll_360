"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  MapPin,
  Radio,
  ShieldAlert,
  Volume2,
  VolumeX,
} from "lucide-react";

import RoomAlerts from "./RoomAlerts";
import IncidentStream from "./IncidentStream";
import { MiniMap } from "./Figures";
import { VOICES, createSpeaker, newArrivals, soundable } from "@/lib/alarm";
import { LEVELS, watchBand } from "@/lib/alerts";
import { cn, formatNumber } from "@/lib/utils";

/**
 * The two things that interrupt a room, on one screen, in two lanes.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS TWO DASHBOARDS SIDE BY SIDE AND NOT ONE MERGED ONE
 *
 *  The last version put alerts and field reports behind a switch. That was
 *  wrong in a way that only shows up in a real room: the two are not two views
 *  of one thing, they are two jobs with two different responses.
 *
 *    ATTENTION   the product noticed a threshold. Nobody is in danger. The
 *                response is to walk to a screen.
 *    SITUATION   a person in a field filed a report. The response is to pick
 *                up a telephone and ring them.
 *
 *  Behind a switch, one of them is always invisible — and it is always the one
 *  the reader is not thinking about, which is exactly the one that matters.
 *  Side by side, each lane keeps its own colour, its own icon, its own count
 *  and its own alarm, and a glance from across the room says which kind of
 *  night it is without anybody pressing anything.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── NOT JAM-PACKED, ON PURPOSE ─────────────────────────────────────────────
 * The previous version stacked a gauge, a waffle, a map, a switch and two long
 * lists into one column. Everything was true and none of it was legible. This
 * screen has one job — tell a room what has just happened and how bad it is —
 * so it spends its space on two headline states and the newest few items, with
 * the full lists underneath for somebody who has sat down to work.
 *
 * ── AND IT MAKES A NOISE ───────────────────────────────────────────────────
 * Two noises, and they do not sound alike: rising and bright for attention,
 * falling and rough for a situation. See lib/alarm.js for why they differ on
 * four axes rather than on pitch alone. Each lane's alarm is armed and muted
 * independently, because a room that is sick of one is not necessarily sick of
 * the other, and forcing that choice is how both end up off.
 */

/* How many of the newest items each lane shows before the full list. Four,
   because this strip is read at a glance and a glance is about four things. */
const FRESH = 4;

const MUTED = "poll360:alarm-muted";

export default function RoomSituations({
  /* What `raiseAlerts` returned — an object, not a list. See lib/alerts.js. */
  alerts = null,
  incidents = [],
  photos = {},
  shapes = null,
  onGo,
}) {
  const band = watchBand({ alerts, incidents });

  /* Only rows an alarm may sound for. "Normal" is a row in the alert list and
     it says everything is fine; an alarm for it is the fastest way to lose
     the feature. */
  const attentionRows = useMemo(() => soundable(band.raisedRows), [band.raisedRows]);
  const situationRows = useMemo(() => soundable(incidents), [incidents]);

  const attention = useLane("ATTENTION", attentionRows);
  const situation = useLane("SITUATION", situationRows);

  const worst = LEVELS[band.level] ?? LEVELS.NORMAL;

  return (
    <div className="flex flex-col gap-3">
      {/* ═══════════════════════════════════════════════════════ the two lanes */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Lane
          voice={VOICES.SITUATION}
          icon={ShieldAlert}
          accent="red"
          title="Situations"
          what="A person in a field filed this. Ring them."
          count={situationRows.length}
          fresh={situation.fresh}
          rows={situationRows.slice(0, FRESH).map((row) => ({
            id: row.id,
            headline: row.kind ?? "Report",
            detail: [row.unitCode, row.reporter].filter(Boolean).join(" · "),
            level: row.severity ?? "INFO",
          }))}
          lane={situation}
          onOpen={() => onGo?.("situations")}
        />

        <Lane
          voice={VOICES.ATTENTION}
          icon={BellRing}
          accent="amber"
          title="Attention"
          what="The product noticed this. Look at a screen."
          count={attentionRows.length}
          fresh={attention.fresh}
          rows={attentionRows.slice(0, FRESH).map((row) => ({
            id: row.id,
            headline: row.headline,
            detail: row.detail,
            level: row.level,
          }))}
          lane={attention}
          onOpen={() => onGo?.(attentionRows[0]?.goto ?? "pulse")}
        />
      </div>

      {/* ── THE ROOM IN ONE LINE, AND WHERE ────────────────────────────────
          One strip rather than a panel of gauges: this screen already says how
          bad it is twice, in colour, at the top of each lane. What it does not
          say anywhere else is *where*, and where is a shape. */}
      <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-dash-line px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "size-2.5 rounded-full",
                worst.rank >= 4 ? "animate-pulse-live bg-red-500" : worst.rank >= 3 ? "bg-amber-500" : "bg-emerald-500"
              )}
            />
            <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
              The room is {worst.label.toLowerCase()}
            </h2>
            <p className="text-[0.8125rem] text-dash-muted">{worst.why}</p>
          </div>
          <p className="text-[0.8125rem] text-dash-muted">
            {band.states
              ? `Reports from ${formatNumber(band.states)} state${band.states === 1 ? "" : "s"}`
              : "No report carries a location"}
          </p>
        </header>

        {shapes && band.states > 0 && (
          <div className="px-4 py-3">
            <MiniMap
              shapes={shapes}
              fills={Object.fromEntries(
                Object.entries(band.byState).map(([code, item]) => [
                  code,
                  item.rank === 0
                    ? "var(--color-red-500)"
                    : item.rank === 1
                      ? "var(--color-amber-500)"
                      : "var(--color-ink-400)",
                ])
              )}
              notes={Object.fromEntries(
                Object.entries(band.byState).map(([code, item]) => [
                  code,
                  `${item.count} report${item.count === 1 ? "" : "s"}`,
                ])
              )}
              height={200}
            />
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════ the working lists */}
      {/* Underneath, full length, for somebody who has sat down. The strips
          above are for the room; these are for the desk. */}
      <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 px-1 text-[0.6875rem] font-bold tracking-[0.16em] text-dash-muted uppercase">
            <ShieldAlert size={13} strokeWidth={2.5} />
            Every field report
          </h3>
          <IncidentStream incidents={incidents} photos={photos} />
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 px-1 text-[0.6875rem] font-bold tracking-[0.16em] text-dash-muted uppercase">
            <BellRing size={13} strokeWidth={2.5} />
            Everything above the line
          </h3>
          <RoomAlerts alerts={alerts} onGo={onGo} />
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[0.75rem] text-dash-muted">
        <span className="flex items-center gap-1.5">
          <MapPin size={12} strokeWidth={2.5} />
          A situation is somebody telling you what they can see
        </span>
        <span className="flex items-center gap-1.5">
          <BellRing size={12} strokeWidth={2.5} />
          An attention is this product noticing a threshold
        </span>
        <span className="flex items-center gap-1.5">
          <Radio size={12} strokeWidth={2.5} />
          Neither is ever merged with the commission&rsquo;s figures
        </span>
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ a lane */

/**
 * One lane: its state, its newest few, and its own alarm.
 *
 * The whole lane takes the accent of what it is for, so the two are told apart
 * peripherally rather than by reading the heading. Red is somebody in a field;
 * amber is a threshold. Nothing else on this screen uses either colour.
 */
function Lane({ voice, icon: Icon, accent, title, what, count, fresh, rows, lane, onOpen }) {
  const hot = accent === "red";

  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-dash border bg-dash-card transition-colors",
        /* The border is the alarm's visual half: it lights for as long as the
           sound lasts and a little after, so somebody who looked up a second
           too late still knows which lane made the noise. */
        fresh
          ? hot
            ? "border-red-500 shadow-[0_0_0_3px_var(--color-red-100)]"
            : "border-amber-500 shadow-[0_0_0_3px_var(--color-amber-100)]"
          : "border-dash-line"
      )}
    >
      <header
        className={cn(
          "flex items-start gap-3 border-b px-5 py-4",
          hot ? "border-red-100 bg-red-50/60" : "border-amber-100 bg-amber-50/60"
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
            hot ? "bg-red-500 text-white" : "bg-amber-500 text-white",
            fresh && "animate-alarm-swing"
          )}
        >
          <Icon size={17} strokeWidth={2.5} />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[1.0625rem] leading-none font-extrabold tracking-[-0.02em] text-dash-ink">
            {title}
          </h2>
          <p className="mt-1 text-[0.8125rem] leading-snug text-dash-muted">{what}</p>
        </div>

        <span
          className={cn(
            "figure shrink-0 text-[2rem] leading-none font-bold tracking-[-0.04em] tabular-nums",
            count === 0 ? "text-dash-muted" : hot ? "text-red-600" : "text-amber-600"
          )}
        >
          {formatNumber(count)}
        </span>
      </header>

      {/* ── THE ALARM'S OWN CONTROLS, ON THE LANE IT BELONGS TO ────────────
          Each lane is muted and tested separately. A room sick of one alarm is
          not necessarily sick of the other, and a single mute forces a choice
          that ends with both switched off. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-dash-line px-5 py-2.5">
        <button
          type="button"
          onClick={lane.toggleMute}
          aria-pressed={lane.muted}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[0.6875rem] font-bold transition-colors",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
            lane.muted
              ? "border-dash-ink bg-dash-ink text-white"
              : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
          )}
        >
          {lane.muted ? <VolumeX size={12} strokeWidth={2.5} /> : <Volume2 size={12} strokeWidth={2.5} />}
          {lane.muted ? "Muted" : "Sound on"}
        </button>

        <button
          type="button"
          onClick={lane.test}
          className="inline-flex items-center gap-1.5 rounded-full border border-dash-line px-2.5 py-1.5 text-[0.6875rem] font-semibold text-dash-muted transition-colors hover:border-dash-ink hover:text-dash-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
        >
          Hear it
        </button>

        <p className="ml-auto text-[0.6875rem] text-dash-muted">{voice.what}</p>
      </div>

      {lane.blocked && !lane.muted && (
        <button
          type="button"
          onClick={lane.arm}
          className="flex w-full items-center gap-2 border-b border-dash-line bg-amber-50 px-5 py-2.5 text-left text-[0.75rem] text-amber-900 hover:bg-amber-100"
        >
          <AlertTriangle size={13} strokeWidth={2.5} className="shrink-0" />
          Your browser is holding this alarm until you interact with the page. Press to arm it.
        </button>
      )}

      {/* ── THE NEWEST FEW, LARGE ─────────────────────────────────────────
          Not the whole list. The whole list is underneath and is a working
          document; this is what a room reads standing up. */}
      <ul className="flex-1 divide-y divide-dash-line">
        {rows.length === 0 ? (
          <li className="px-5 py-8 text-center text-[0.875rem] text-dash-muted">
            {hot ? "Nothing reported from the field." : "Nothing above the line."}
          </li>
        ) : (
          rows.map((row) => (
            <li key={row.id} className="flex items-start gap-3 px-5 py-3">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  row.level === "CRITICAL"
                    ? "bg-red-500"
                    : row.level === "SERIOUS"
                      ? "bg-amber-500"
                      : "bg-dash-line"
                )}
              />
              <span className="min-w-0">
                <span className="block text-[0.875rem] leading-snug font-semibold text-dash-ink">
                  {row.headline}
                </span>
                {row.detail && (
                  <span className="mt-0.5 block truncate text-[0.75rem] text-dash-muted">
                    {row.detail}
                  </span>
                )}
              </span>
            </li>
          ))
        )}
      </ul>

      {count > rows.length && (
        <button
          type="button"
          onClick={onOpen}
          className="border-t border-dash-line px-5 py-3 text-left text-[0.8125rem] font-semibold text-dash-ink transition-colors hover:bg-dash-bg"
        >
          {formatNumber(count - rows.length)} more below
        </button>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════ one lane's alarm */

/**
 * One lane's alarm: what is new, whether to sound, and the controls for it.
 *
 * ── WHY EACH LANE OWNS A SPEAKER ───────────────────────────────────────────
 * Two independent mutes need two independent states, and the browser's
 * autoplay block is per-context rather than per-sound, so a shared speaker
 * would report one lane blocked because the other had not been armed. One
 * each is a few bytes and removes the whole class of confusion.
 *
 * The decision of *what is new* is not here: it is `newArrivals` in
 * lib/alarm.js, which is a pure function with tests, because an alarm that
 * sounds once too often is an alarm somebody mutes for the night.
 */
function useLane(voiceId, rows) {
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [fresh, setFresh] = useState(false);

  const speaker = useRef(null);
  const seen = useRef(null);
  const mutedRef = useRef(false);

  /* ── THE SPEAKER IS BUILT ON MOUNT, NOT DURING RENDER ────────────────
     Lazily filling a ref while rendering reads a ref during render, which
     React can and does call more than once; the second call would find a
     speaker it did not make. It is also pointless work on the server, where
     there is no Web Audio at all.

     Declared first so it runs before the watch below on the very first
     mount — effects fire in declaration order — and the watch's first pass
     is the silent one anyway. */
  useEffect(() => {
    speaker.current = createSpeaker();
    return () => {
      speaker.current?.close();
      speaker.current = null;
    };
  }, []);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  /* Read the preference after the first paint. Local storage does not exist
     on the server, so reading it while rendering is how a hydration mismatch
     is made — and on the next frame rather than in the effect body, so it
     lands as one asynchronous update instead of a synchronous second render. */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        setMuted(window.localStorage.getItem(`${MUTED}:${voiceId}`) === "1");
      } catch {
        /* Storage switched off is not a broken alarm. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [voiceId]);

  const arm = useCallback(() => {
    speaker.current?.arm().then((ready) => setBlocked(!ready));
  }, []);

  /* The autoplay policy wants a real gesture. The first one anywhere on the
     page arms both lanes, so a room that clicks anything is armed. */
  useEffect(() => {
    const first = () => arm();
    window.addEventListener("pointerdown", first, { once: true });
    window.addEventListener("keydown", first, { once: true });
    return () => {
      window.removeEventListener("pointerdown", first);
      window.removeEventListener("keydown", first);
    };
  }, [arm]);

  /* ── THE WATCH ────────────────────────────────────────────────────────
     Runs on every refresh of the room, which is every fifteen seconds all
     night. Everything that decides whether to make a noise is in the pure
     function; this only plays what it is told to. */
  useEffect(() => {
    const seenNow = newArrivals(rows, seen.current);
    seen.current = seenNow.seen;

    if (seenNow.first || !seenNow.fresh.length) return;

    setFresh(true);
    if (!mutedRef.current) {
      speaker.current?.play(voiceId, seenNow.level).then((played) => {
        if (!played) setBlocked(true);
      });
    }
  }, [rows, voiceId]);

  /* The visual half of the alarm outlasts the sound, so somebody who looked up
     a second too late still knows which lane made the noise. */
  useEffect(() => {
    if (!fresh) return;
    const timer = setTimeout(() => setFresh(false), 8000);
    return () => clearTimeout(timer);
  }, [fresh]);

  const toggleMute = useCallback(() => {
    setMuted((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(`${MUTED}:${voiceId}`, next ? "1" : "0");
      } catch {
        /* As above. */
      }
      /* Unmuting is itself a gesture, so it is the moment to arm the context
         and play one figure — otherwise the reader cannot tell it worked. */
      if (!next) {
        speaker.current?.arm().then((ready) => {
          setBlocked(!ready);
          if (ready) speaker.current?.play(voiceId, "INFO");
        });
      }
      return next;
    });
  }, [voiceId]);

  const test = useCallback(() => {
    speaker.current?.arm().then((ready) => {
      setBlocked(!ready);
      /* The serious figure rather than the critical one: loud enough to learn
         from, not loud enough that somebody demonstrating the room at a desk
         makes everybody else look up. */
      if (ready) speaker.current?.play(voiceId, "SERIOUS");
    });
  }, [voiceId]);

  return { muted, blocked, fresh, arm, toggleMute, test };
}
