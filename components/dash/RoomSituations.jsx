"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Database,
  ShieldAlert,
  Volume2,
  VolumeX,
} from "lucide-react";

import RoomAlerts from "./RoomAlerts";
import IncidentStream from "./IncidentStream";
import HubReports from "./HubReports";
import { MiniMap } from "./Figures";
import { createSpeaker, newArrivals, soundable } from "@/lib/alarm";
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

const MUTED = "poll360:alarm-muted";

export default function RoomSituations({
  /* What `raiseAlerts` returned — an object, not a list. See lib/alerts.js. */
  alerts = null,
  incidents = [],
  /* ── THE THIRD LANE ─────────────────────────────────────────────────────
     Data Bank's own reports board, for the booths this room watches. A third
     job with a third response: this is something that reached the hub and did
     not reach us, so the response is to find out why — not to ring a booth
     (that is a situation) and not to walk to a screen (that is attention).
     Kept as its own lane for the reason the other two are: behind a switch,
     the invisible one is always the one nobody is thinking about. */
  hubReports = null,
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

  /* The hub's rows are not `soundable` — there is no alarm on this lane — so
     the count is the plain length. Null when Data Bank is not connected, which
     the button prints as a dash rather than as a confident zero: "no reports"
     and "not reading the hub" are different sentences and the second one must
     never be able to look like the first. */
  const hubCount = hubReports?.available ? (hubReports.rows?.length ?? 0) : null;

  const worst = LEVELS[band.level] ?? LEVELS.NORMAL;

  /* ── WHICH HALF IS BEING WORKED, AND WHERE ────────────────────────────
     Two pieces of state and no more. The screen opens on whichever half has
     something in it — a room that lands on an empty list every night learns
     the screen is empty. */
  const [half, setHalf] = useState(() => (incidents.length ? "situations" : "attention"));
  const [place, setPlace] = useState(null);

  const here = place ? band.byState[place] : null;

  return (
    <div className="flex flex-col gap-3">
      {/* ═══════════════════════════════════════════════════════ the one strip */}
      {/* ── THE COUNTS ARE THE CONTROL ────────────────────────────────────
          This screen used to open with two large lanes, each showing its own
          count and its four newest items — and then repeat both lists in full
          underneath. Every item on the screen appeared twice, and the copy a
          reader met first was the truncated one.

          The counts are worth showing and the duplication is not, so the
          counts became the switch. One number, in one place, doing a job. */}
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5">
          <span
            aria-hidden="true"
            className={cn(
              "size-2.5 shrink-0 rounded-full",
              worst.rank >= 4
                ? "animate-pulse-live bg-red-500"
                : worst.rank >= 3
                  ? "bg-amber-500"
                  : "bg-emerald-500"
            )}
          />
          <div className="min-w-0">
            <h2 className="font-display text-[0.9375rem] leading-tight font-extrabold tracking-[-0.01em] text-dash-ink">
              The room is {worst.label.toLowerCase()}
            </h2>
            <p className="text-[0.8125rem] leading-snug text-dash-muted">{worst.why}</p>
          </div>

          <div
            role="group"
            aria-label="Which half to work"
            className="ml-auto flex shrink-0 items-center rounded-full border border-dash-line bg-dash-bg p-1"
          >
            {[
              ["situations", "Situations", situationRows.length, "red", situation.fresh],
              ["attention", "Attention", attentionRows.length, "amber", attention.fresh],
              /* No alarm on this lane, deliberately. A report reaching Data
                 Bank and not reaching us is a gap to close, not an emergency
                 to interrupt a room for — and a third noise at two in the
                 morning is how all three get muted. */
              ["databank", "Data Bank", hubCount, "sky", false],
            ].map(([id, label, count, accent, fresh]) => (
              <button
                key={id}
                type="button"
                onClick={() => setHalf(id)}
                aria-pressed={half === id}
                title={
                  id === "situations"
                    ? "A person in a field filed this. Ring them."
                    : id === "attention"
                      ? "The product noticed a threshold. Look at a screen."
                      : "This reached Data Bank. Find out why it did not reach us."
                }
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-bold transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                  half === id ? "bg-dash-ink text-white" : "text-dash-muted hover:text-dash-ink",
                  /* ── THE ALARM'S VISUAL HALF ──────────────────────────
                     The sound has a picture, and it lasts a little longer
                     than the sound does, so somebody who looked up a second
                     too late still learns which kind of thing arrived. It
                     used to be a glow around a whole lane; the lanes have
                     gone, and the count that replaced them is the honest
                     place for it — it is the thing that just changed. */
                  fresh &&
                    (accent === "red"
                      ? "ring-2 ring-red-500 ring-offset-1"
                      : "ring-2 ring-amber-500 ring-offset-1")
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    accent === "red"
                      ? "bg-red-500"
                      : accent === "amber"
                        ? "bg-amber-500"
                        : "bg-sky-500"
                  )}
                />
                {label}
                <span className="figure tabular-nums">
                  {count === null ? "—" : formatNumber(count)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── WHAT EACH HALF MEANS, WHERE IT IS BEING CHOSEN ───────────────
            One line, under the control, changing with it. The old screen
            carried both sentences permanently in a footnote at the bottom,
            eight inches from anything they described. */}
        <p className="flex items-center gap-2 border-t border-dash-line px-5 py-2.5 text-[0.8125rem] text-dash-muted">
          {half === "situations" ? (
            <>
              <ShieldAlert size={13} strokeWidth={2.5} className="shrink-0 text-red-500" />
              Somebody in a field is telling you what they can see. The response is a telephone.
            </>
          ) : half === "attention" ? (
            <>
              <BellRing size={13} strokeWidth={2.5} className="shrink-0 text-amber-500" />
              This product crossed a threshold it was told to watch. The response is a screen.
            </>
          ) : (
            <>
              <Database size={13} strokeWidth={2.5} className="shrink-0 text-sky-500" />
              Reports that reached the hub, for booths this room watches. The account stays in Data
              Bank.
            </>
          )}
          <span className="ml-auto flex items-center gap-2">
            <Mute lane={situation} label="Situations" />
            <Mute lane={attention} label="Attention" />
          </span>
        </p>

        {(situation.blocked || attention.blocked) && (
          <button
            type="button"
            onClick={() => {
              situation.arm();
              attention.arm();
            }}
            className="flex w-full items-center gap-2 border-t border-dash-line bg-amber-50 px-5 py-2.5 text-left text-[0.75rem] text-amber-900 hover:bg-amber-100"
          >
            <AlertTriangle size={13} strokeWidth={2.5} className="shrink-0" />
            Your browser is holding the alarms until you interact with the page. Press to arm them.
          </button>
        )}
      </section>

      {/* ═══════════════════════════════════ where, and what to do about it */}
      {/* ── THE SAME SKELETON AS EVERY OTHER SCREEN IN THIS ROOM ───────────
          Map on the left at a size somebody can read from across a room, the
          working list on the right, and the map filters the list. The command
          centre, the booth screen and this one now share one shape, which is
          what stops the room reading as five products. */}
      <div className="grid gap-3 xl:grid-cols-[24rem_minmax(0,1fr)] xl:items-start">
        <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card xl:sticky xl:top-[calc(var(--dash-top,4.5rem)+0.75rem)]">
          <header className="flex items-baseline justify-between gap-3 border-b border-dash-line px-4 py-3">
            <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">Where</h3>
            <span className="text-[0.75rem] text-dash-muted">
              {band.states
                ? `${formatNumber(band.states)} state${band.states === 1 ? "" : "s"}`
                : "nothing located"}
            </span>
          </header>

          <div className="px-3 py-3">
            {shapes ? (
              <MiniMap
                shapes={shapes}
                selected={place}
                onOpen={(code) => setPlace(place === code ? null : code)}
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
                height={280}
              />
            ) : (
              <p className="px-4 py-10 text-center text-[0.875rem] text-dash-muted">
                No map for this contest.
              </p>
            )}
          </div>

          <footer className="border-t border-dash-line px-4 py-2.5 text-[0.8125rem] leading-relaxed text-dash-muted">
            {here ? (
              <>
                <span className="font-semibold text-dash-ink">{place}</span> ·{" "}
                {formatNumber(here.count)} report{here.count === 1 ? "" : "s"}.{" "}
                <button
                  type="button"
                  onClick={() => setPlace(null)}
                  className="font-semibold text-dash-ink underline-offset-2 hover:underline"
                >
                  Show everywhere
                </button>
              </>
            ) : band.states ? (
              "Red is a critical report, amber a serious one. A state with nothing against it is left blank. Tap one to narrow the list."
            ) : (
              "Nothing reported carries a location."
            )}
          </footer>
        </section>

        {/* ── THE WORKING LIST, FULL LENGTH, ONCE ────────────────────────── */}
        <div className="min-w-0">
          {half === "situations" ? (
            <IncidentStream
              incidents={place ? incidents.filter((row) => row.stateCode === place) : incidents}
              photos={photos}
            />
          ) : half === "attention" ? (
            <RoomAlerts alerts={alerts} onGo={onGo} />
          ) : (
            <HubReports
              /* The map narrows this lane too. A booth code's first two digits
                 are its state, which is the same fact `stateCode` carries on
                 our own rows — read off the code here because the hub's view
                 does not carry a separate state column, and the code is what
                 is printed on the sheet. */
              hubReports={
                place && hubReports?.rows
                  ? {
                      ...hubReports,
                      rows: hubReports.rows.filter(
                        (row) => String(row.polling_unit_code ?? "").slice(0, 2) === place
                      ),
                    }
                  : hubReports
              }
              incidents={incidents}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One lane's mute, as a control rather than a panel.
 *
 * The alarms are per-kind and stay that way — a room sick of one is not
 * necessarily sick of the other, and a single mute forces a choice that ends
 * with both switched off. What has gone is the row of chrome each one used to
 * sit in: a mute, a test button and a sentence about the sound, per lane, above
 * the content. Two icons say the same thing.
 */
function Mute({ lane, label }) {
  return (
    <button
      type="button"
      onClick={lane.toggleMute}
      aria-pressed={lane.muted}
      aria-label={`${label} alarm: ${lane.muted ? "muted" : "sounding"}`}
      title={`${label} alarm — ${lane.muted ? "muted, press to unmute" : "sounding, press to mute"}`}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full border transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
        lane.muted
          ? "border-dash-line text-dash-muted hover:text-dash-ink"
          : "border-dash-ink bg-dash-ink text-white"
      )}
    >
      {lane.muted ? <VolumeX size={13} strokeWidth={2.5} /> : <Volume2 size={13} strokeWidth={2.5} />}
    </button>
  );
}

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
