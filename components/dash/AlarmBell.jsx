"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bell, Repeat, Volume2, VolumeX } from "lucide-react";

import { createSpeaker, newArrivals } from "@/lib/alarm";
import { cn } from "@/lib/utils";

/**
 * The alarm.
 *
 * ── WHY A ROOM NEEDS A SOUND AND NOT A BADGE ───────────────────────────────
 * Everything else in this product is designed to be read. This one thing is
 * designed to be heard, because the situation room is the only screen here
 * that nobody is looking at. It is on a wall, at 1am, while the people in the
 * room are on the phone to a ward coordinator. A red dot that appears silently
 * in the corner of a wall display is a red dot nobody sees for nine minutes,
 * and nine minutes is the difference between a booth being closed early and a
 * booth having been closed early.
 *
 * So an incident makes a noise, and the noise is the SITUATION voice — low,
 * falling, with a warble — because everything this bell watches was filed by a
 * person standing somewhere. Its severity sets the loudness and the number of
 * pulses, so somebody across the room can tell how bad it is without turning
 * round, and can tell it apart from the attention alarm without being taught.
 * See lib/alarm.js.
 *
 * ── AND WHY IT CAN BE SILENCED ─────────────────────────────────────────────
 * An alarm nobody can turn off is an alarm somebody unplugs the speakers to
 * escape, and then it is off for the rest of the night without anyone knowing.
 * The mute is one click, obvious, remembered, and visible while it is on.
 *
 * ── ON BROWSERS AND AUTOPLAY ───────────────────────────────────────────────
 * A page may not make a sound before the reader has interacted with it. That
 * is not a bug to work around: it is the reason this component tells you when
 * it is muted by the browser rather than pretending it is armed. One click on
 * "Turn sound on" arms it for the session.
 * ───────────────────────────────────────────────────────────────────────────
 */
const REHEARSAL_SECONDS = 20;
const MUTED = "poll360:alarm-muted:SITUATION";

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE BELL SPEAKS WITH THE ROOM'S VOICE, NOT ITS OWN
 *
 *  This component used to synthesise its own three-tone pattern. That made a
 *  third sound in a product whose whole claim is that it has exactly two —
 *  rising and bright when the product noticed something, falling and rough
 *  when a person in a field reported something — and a third sound is a third
 *  thing to learn, which in practice means none of them gets learnt.
 *
 *  The bell watches the incident feed, so everything it announces is a
 *  SITUATION. It plays that voice, at the severity of the worst thing in the
 *  batch, out of lib/alarm.js. The mute is the same key the Situations
 *  dashboard writes, so silencing the alarm in one place silences it in both
 *  — which is what somebody pressing "mute" believes they are doing.
 * ══════════════════════════════════════════════════════════════════════════
 */
const TONE = {
  CRITICAL: "bg-red-500",
  SERIOUS: "bg-flag-500",
  INFO: "bg-dash-line",
};

const LABEL = {
  CRITICAL: "Critical",
  SERIOUS: "Serious",
  INFO: "Info",
};

export default function AlarmBell({ incidents = [], onOpenStream }) {
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [unread, setUnread] = useState(0);
  const [flashing, setFlashing] = useState(false);
  /* Rehearsal: the alarm on a timer, for demonstrating the room to people who
     are not going to wait for a real report to come in. */
  const [rehearsing, setRehearsing] = useState(false);

  const speaker = useRef(null);
  /* Which incidents this tab has already announced. Seeded on the first render
     with everything that was already on the page: those are history, and a room
     opening the dashboard at 9pm must not be greeted by forty alarms. */
  const announced = useRef(null);
  const mutedRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  /* Read the preference after mount, localStorage cannot be read during
     render without the server and the client disagreeing about the first
     paint, and on the next frame rather than in the effect body, so it lands
     as one asynchronous update instead of a synchronous second render. */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMuted(localStorage.getItem(MUTED) === "1");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  /* ------------------------------------------------------------ the sound */

  /* One speaker, built on mount rather than lazily during render: React may
     call a render twice, and the second call would find a speaker it did not
     make. There is no Web Audio on the server in any case. */
  useEffect(() => {
    speaker.current = createSpeaker();
    return () => {
      speaker.current?.close();
      speaker.current = null;
    };
  }, []);

  /** Everything this bell announces came from a person in a field. */
  const sound = useCallback(async (severity) => {
    const played = await speaker.current?.play("SITUATION", severity);
    setBlocked(played === false);
  }, []);

  /** Arm the context on a real gesture, per the autoplay rules. */
  const arm = useCallback(() => {
    speaker.current?.arm().then((ready) => setBlocked(!ready));
  }, []);

  useEffect(() => {
    const onFirstGesture = () => arm();
    window.addEventListener("pointerdown", onFirstGesture, { once: true });
    window.addEventListener("keydown", onFirstGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
  }, [arm]);

  /* ---------------------------------------------------------- the watching */

  /**
   * Announce anything that was not on the page a moment ago.
   *
   * The feed is re-fetched by the dashboard's own refresh, so this effect runs
   * on every poll. The set of ids it has already seen is the whole mechanism:
   * an incident is new exactly once, whatever order the server returns it in
   * and however many times the page re-renders.
   */
  useEffect(() => {
    const seen = newArrivals(incidents, announced.current);
    announced.current = seen.seen;

    /* The first look is silent: everything on the page then is history, and a
       room opening the dashboard at 9pm must not be met by forty alarms. */
    if (seen.first || !seen.fresh.length) return;

    setUnread((count) => count + seen.fresh.length);
    setFlashing(true);
    if (!mutedRef.current) sound(seen.level);
  }, [incidents, sound]);

  useEffect(() => {
    if (!flashing) return;
    const timer = setTimeout(() => setFlashing(false), 6000);
    return () => clearTimeout(timer);
  }, [flashing]);

  /**
   * The rehearsal loop.
   *
   * ── WHY THIS IS A MODE AND NOT A SETTING ───────────────────────────────
   * Sounding a real alarm on a timer would be the worst thing this component
   * could do. An alarm that goes off when nothing has happened is an alarm a
   * room learns to ignore within the hour, and then the one that matters at
   * 02:40 is ignored too. So the loop never touches the unread count, never
   * flashes the bell, and never claims a report arrived, it plays the tone
   * and nothing else, while a strip across the panel says out loud that it is
   * a rehearsal.
   *
   * It is deliberately not remembered between sessions either. Somebody
   * demonstrating the room on Thursday must not leave it armed for Saturday.
   * ───────────────────────────────────────────────────────────────────────
   */
  useEffect(() => {
    if (!rehearsing || muted) return;

    /* Sound at once, then every twenty seconds. Waiting a full interval before
       the first tone is wrong for the thing this mode is for: somebody
       switches it on in front of a room and needs to hear it now, not after a
       silence long enough to look broken. */
    /* The first tone is scheduled rather than fired in the effect body:
       sound() sets state when the browser blocks audio, and doing that
       synchronously inside an effect cascades a render. One frame later is
       still instant to a listener. */
    const first = requestAnimationFrame(() => sound("CRITICAL"));
    const timer = setInterval(() => sound("CRITICAL"), REHEARSAL_SECONDS * 1000);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(timer);
    };
  }, [rehearsing, muted, sound]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem(MUTED, next ? "1" : "0");
    /* Unmuting is a gesture, so it is also the moment to arm the context and
       play one tone, otherwise the reader cannot tell it worked. */
    if (!next) {
      arm();
      sound("INFO");
    }
  };

  const latest = useMemo(() => incidents.slice(0, 8), [incidents]);
  const critical = useMemo(
    () => incidents.filter((item) => item.severity === "CRITICAL").length,
    [incidents]
  );

  return (
    <div className="relative">
      <button
        type="button"
        /* Opening the list is what marks them read, not a timer, and not the
           alarm having sounded. Somebody has to have looked. */
        onClick={() => {
          setOpen((value) => {
            if (!value) setUnread(0);
            return !value;
          });
        }}
        aria-expanded={open}
        aria-label={
          unread ? `Incident reports, ${unread} new` : `Incident reports, ${incidents.length} on file`
        }
        className={cn(
          "relative inline-flex size-11 items-center justify-center rounded-full border transition-colors",
          flashing && unread
            ? "border-red-500 bg-red-50 text-red-600"
            : "border-dash-line text-dash-ink hover:border-dash-ink"
        )}
      >
        <Bell
          size={16}
          strokeWidth={2.25}
          className={cn(flashing && unread && "animate-alarm-swing")}
        />

        {unread > 0 && (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 inline-flex min-w-5 items-center justify-center",
              "rounded-full bg-red-500 px-1.5 py-0.5 font-mono text-[0.625rem] font-bold text-white",
              flashing && "animate-pulse-live"
            )}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}

        {muted && (
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 inline-flex size-4 items-center justify-center rounded-full bg-dash-ink text-white"
          >
            <VolumeX size={9} strokeWidth={3} />
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close reports"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />

          <div className="absolute right-0 z-20 mt-2 w-[22rem] rounded-dash border border-dash-line bg-dash-card shadow-lg">
            <div className="flex items-center gap-2 border-b border-dash-line px-4 py-3">
              <p className="text-[0.875rem] font-semibold text-dash-ink">Incident reports</p>
              {critical > 0 && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 font-mono text-[0.625rem] font-bold text-red-700">
                  {critical} critical
                </span>
              )}

              <button
                type="button"
                onClick={() => {
                  const next = !rehearsing;
                  setRehearsing(next);
                  /* The click is the gesture the autoplay policy wants, so the
                     first tone can play immediately rather than 30s later. */
                  if (next && !muted) {
                    arm();
                    sound("CRITICAL");
                  }
                }}
                aria-pressed={rehearsing}
                title="Sound the alarm every 30 seconds, for demonstrating the room"
                className={cn(
                  "ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[0.6875rem] font-semibold transition-colors",
                  rehearsing
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                )}
              >
                <Repeat size={13} strokeWidth={2.5} />
                {rehearsing ? "Rehearsing" : "Rehearse"}
              </button>

              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={muted}
                className="inline-flex items-center gap-1.5 rounded-full border border-dash-line px-2.5 py-1.5 text-[0.6875rem] font-semibold text-dash-muted transition-colors hover:border-dash-ink hover:text-dash-ink"
              >
                {muted ? <VolumeX size={13} strokeWidth={2.5} /> : <Volume2 size={13} strokeWidth={2.5} />}
                {muted ? "Muted" : "Sound on"}
              </button>
            </div>

            {rehearsing && (
              <p className="border-b border-dash-line bg-red-50 px-4 py-2.5 text-[0.75rem] font-semibold text-red-800">
                Rehearsal, the alarm sounds every 30 seconds. No report has arrived.
              </p>
            )}

            {blocked && !muted && (
              <button
                type="button"
                onClick={arm}
                className="flex w-full items-center gap-2 border-b border-dash-line bg-flag-50 px-4 py-2.5 text-left text-[0.75rem] text-flag-900 hover:bg-flag-100"
              >
                <AlertTriangle size={13} strokeWidth={2.5} className="shrink-0" />
                Your browser is holding the sound until you interact with the page. Click to turn it
                on.
              </button>
            )}

            <ul className="max-h-[22rem] divide-y divide-dash-line overflow-y-auto">
              {latest.length === 0 && (
                <li className="px-4 py-6 text-center text-[0.8125rem] text-dash-muted">
                  Nothing reported yet. You will hear it when there is.
                </li>
              )}

              {latest.map((item) => (
                <li key={item.id} className="flex gap-3 px-4 py-3">
                  <span
                    aria-hidden="true"
                    className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE[item.severity] ?? TONE.INFO)}
                  />
                  <div className="min-w-0">
                    <p className="text-[0.8125rem] leading-snug font-semibold text-dash-ink">
                      {item.kind}
                    </p>
                    <p className="mt-0.5 truncate text-[0.75rem] text-dash-muted">
                      <span className="font-mono">{item.unitCode}</span>
                      {item.reporter ? ` · ${item.reporter}` : ""}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] text-dash-muted">
                      {LABEL[item.severity] ?? "Info"} · {when(item.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            {onOpenStream && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenStream();
                }}
                className="w-full border-t border-dash-line px-4 py-3 text-[0.8125rem] font-semibold text-dash-ink hover:bg-dash-bg"
              >
                Open the full stream
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Plain words, because a room reads this at a glance and not with a calculator. */
function when(value) {
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return "just now";

  const seconds = Math.round((Date.now() - at.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return at.toTimeString().slice(0, 5);
}
