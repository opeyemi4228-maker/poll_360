"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createSpeaker, newArrivals } from "@/lib/alarm";

/**
 * The verification alarm.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY IT LIVES IN THE ROOM AND NOT ON THE VERIFICATION SCREEN
 *
 *  A finding lands when it lands, and the room is very rarely looking at the
 *  verification screen at that moment: it is on the map, or on the telephone.
 *  An alarm that only sounds on the screen it belongs to is an alarm for the
 *  one person who did not need it. So this is mounted once, by the room, and
 *  it sounds whichever screen is open.
 *
 *  It speaks with the ATTENTION voice — rising, bright — because every one of
 *  these is the product noticing something, never a person in a field
 *  reporting it. See lib/alarm.js for why those two must not sound alike.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * What counts as new is decided by `newArrivals`, which is a pure function
 * with tests: the first look is silent, and nothing sounds twice.
 */

/* The same key the Situation screen's attention lane writes, so muting this
   voice in one place mutes it in both — which is what somebody pressing
   "mute" believes they are doing. */
const MUTED = "poll360:alarm-muted:ATTENTION";

function readMuted() {
  try {
    return window.localStorage.getItem(MUTED) === "1";
  } catch {
    /* Storage switched off is not a broken alarm. */
    return false;
  }
}

/**
 * @param rows  what the alarm may sound for: [{ id, level }]
 * @returns     fresh    the ids that arrived while this room was open and have
 *                       not been looked at yet
 *              muted, blocked, toggle, arm, test
 *              seen(id) / seenAll() to mark what somebody has looked at
 */
export function useVerifyAlarm(rows) {
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [fresh, setFresh] = useState(() => new Set());

  const speaker = useRef(null);
  const announced = useRef(null);

  /* Built on mount, never during render: React may render twice, and there
     is no Web Audio on the server at all. */
  useEffect(() => {
    speaker.current = createSpeaker();
    return () => {
      speaker.current?.close();
      speaker.current = null;
    };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMuted(readMuted()));
    return () => cancelAnimationFrame(frame);
  }, []);

  const arm = useCallback(() => {
    speaker.current?.arm().then((ready) => setBlocked(!ready));
  }, []);

  /* A browser will not make a sound until somebody has touched the page. The
     first press anywhere arms it. */
  useEffect(() => {
    const first = () => arm();
    window.addEventListener("pointerdown", first, { once: true });
    window.addEventListener("keydown", first, { once: true });
    return () => {
      window.removeEventListener("pointerdown", first);
      window.removeEventListener("keydown", first);
    };
  }, [arm]);

  const play = useCallback((level) => {
    speaker.current?.play("ATTENTION", level).then((played) => {
      if (played === false) setBlocked(true);
    });
  }, []);

  /* ── THE WATCH ────────────────────────────────────────────────────────
     Runs on every refresh of the room. The mute is read at the moment of
     sounding rather than remembered, because the Situation screen can change
     it while this hook is not looking. */
  useEffect(() => {
    const found = newArrivals(rows, announced.current);
    announced.current = found.seen;
    if (found.first || !found.fresh.length) return;

    setFresh((held) => new Set([...held, ...found.fresh.map((row) => row.id)]));
    if (!readMuted()) play(found.level);
  }, [rows, play]);

  const toggle = useCallback(() => {
    const next = !readMuted();
    try {
      window.localStorage.setItem(MUTED, next ? "1" : "0");
    } catch {
      /* Nothing to remember it in; it still holds for this visit. */
    }
    setMuted(next);
    /* Turning it on is a press, so it is also the moment to arm the browser
       and let one tone out — otherwise nobody can tell it worked. */
    if (!next) {
      arm();
      play("INFO");
    }
  }, [arm, play]);

  const test = useCallback(() => {
    arm();
    play("SERIOUS");
  }, [arm, play]);

  const seen = useCallback((id) => {
    setFresh((held) => {
      if (!held.has(id)) return held;
      const next = new Set(held);
      next.delete(id);
      return next;
    });
  }, []);

  const seenAll = useCallback(() => setFresh((held) => (held.size ? new Set() : held)), []);

  return { fresh, muted, blocked, toggle, arm, test, seen, seenAll };
}
