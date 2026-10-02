"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import { releaseEmbargoed } from "@/app/broadcast/actions";
import { embargoOf } from "@/lib/broadcast";

/**
 * The desk's sense of time, and the two things it does with it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY A HOOK FILE AND NOT A COMPONENT
 *
 *  None of these draw anything. One reads the clock for the countdowns, one
 *  tells an editor something has arrived while they are looking elsewhere,
 *  and one lets an embargo lift on time. They live together because each
 *  would otherwise keep its own timer, and three timers drifting apart on one
 *  screen is how a countdown says "0 min" while the post is still held.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ── THE CLOCK, AS A STORE ───────────────────────────────────────────────────
   The same shape as the wall clock's (components/dash/WallClock.jsx), at a
   coarser beat: a countdown in minutes does not need a whole desk of cards
   redrawn every second. Null on the server — the server and the browser would
   read different clocks, and a countdown that differs between the two is a
   page React has to throw away and redraw. */
const BEAT = 15_000;
const beats = new Set();
let beatTimer = null;
const onBeat = (fn) => {
  beats.add(fn);
  if (!beatTimer) beatTimer = setInterval(() => beats.forEach((listener) => listener()), BEAT);
  return () => {
    beats.delete(fn);
    if (!beats.size) {
      clearInterval(beatTimer);
      beatTimer = null;
    }
  };
};
const beatNow = () => Math.floor(Date.now() / BEAT) * BEAT;

/** The time now, to the nearest fifteen seconds; null on the server. */
export function useNow() {
  return useSyncExternalStore(onBeat, beatNow, () => null);
}

/* ── THE CHIME ───────────────────────────────────────────────────────────────
   Two short tones, made in the browser — no sound file to download, cache or
   fail to find on a newsroom network. Quiet on purpose: it is a tap on the
   shoulder in a room that already has a programme playing. */
function chime() {
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const audio = new Context();
    [880, 1320].forEach((pitch, index) => {
      const tone = audio.createOscillator();
      const level = audio.createGain();
      const start = audio.currentTime + index * 0.14;
      tone.frequency.value = pitch;
      tone.type = "sine";
      level.gain.setValueAtTime(0.0001, start);
      level.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
      level.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      tone.connect(level).connect(audio.destination);
      tone.start(start);
      tone.stop(start + 0.2);
    });
    setTimeout(() => audio.close?.(), 800);
  } catch {
    /* A browser that will not play a sound still has the badge. */
  }
}

const MUTE_KEY = "poll360.desk.muted";

/* Whether the chime is off, remembered on this device. A store rather than
   state so every desk on the page — and a second tab — agrees at once. */
const muteListeners = new Set();
let mutedHere = false;
const onMute = (fn) => {
  muteListeners.add(fn);
  const fromOtherTab = (event) => event.key === MUTE_KEY && fn();
  window.addEventListener("storage", fromOtherTab);
  return () => {
    muteListeners.delete(fn);
    window.removeEventListener("storage", fromOtherTab);
  };
};
const readMute = () => {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    /* A private window keeps it for this visit only. */
    return mutedHere;
  }
};
function setMuted(value) {
  mutedHere = value;
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    /* Remembered for this visit only. */
  }
  muteListeners.forEach((fn) => fn());
}

/**
 * Something new for an editor: a chime, and the count in the tab's title.
 *
 * Only for items somebody else wrote — your own submission arriving in the
 * queue is not news to you — and only for ones that were not there when the
 * page first drew, so opening the desk does not ring for the whole backlog.
 *
 * @returns {{ waiting, muted, setMuted }}
 */
export function useArrivals(items, { userId, enabled = true } = {}) {
  const waiting = items.filter((item) => item.state === "REVIEW" && item.createdBy !== userId);
  const seen = useRef(null);
  const muted = useSyncExternalStore(onMute, readMute, () => false);

  const ids = waiting.map((item) => item.id).join(",");
  useEffect(() => {
    const now = new Set(ids ? ids.split(",") : []);
    if (seen.current && enabled && !muted && [...now].some((id) => !seen.current.has(id))) chime();
    seen.current = now;
  }, [ids, enabled, muted]);

  /* The tab's title carries the count, so a desk in a background tab still
     says there is work waiting. The original title is put back on the way out. */
  useEffect(() => {
    if (!enabled) return;
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = waiting.length ? `(${waiting.length}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(\d+\) /, "");
    };
  }, [waiting.length, enabled]);

  return { waiting: waiting.length, muted, setMuted };
}

/**
 * When a cleared post's embargo lifts, send it — from this desk, if this desk
 * may put things on air.
 *
 * The server decides what is due and lets exactly one caller move each post,
 * so every open desk may ask at once and a post still goes out once.
 */
export function useEmbargoRelease(items, { now, mayAir }) {
  const asked = useRef(new Set());
  useEffect(() => {
    if (!mayAir || !now) return;
    const due = items.filter((item) => {
      const until = embargoOf(item);
      return item.state === "CLEARED" && item.payload?.sendOnClear && until && until.getTime() <= now && !asked.current.has(item.id);
    });
    if (!due.length) return;
    due.forEach((item) => asked.current.add(item.id));
    releaseEmbargoed().catch(() => {
      /* Asked again on the next tick by whichever desk is open. */
      due.forEach((item) => asked.current.delete(item.id));
    });
  }, [items, now, mayAir]);
}
