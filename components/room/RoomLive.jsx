"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, BellOff, Phone, Wifi, WifiOff } from "lucide-react";

import ActionForm, { Submit, useOnline } from "./ActionForm";
import { cn } from "@/lib/utils";

/**
 * The room's pulse: what keeps a screen current, and what rings.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO ALARMS THAT DO NOT SOUND ALIKE
 *
 *  A (two soft rising tones): the product noticed something. Look at a
 *  screen. A new red item, an escalation.
 *
 *  B (three sharp beeps, again every twenty seconds until a person
 *  acknowledges): somebody in the field is in trouble. Pick up a phone.
 *
 *  A room can tell which without looking up, which is the point. B is driven
 *  from what the server says is still unacknowledged, not from events this
 *  screen happened to hear, so a screen opened a minute late still rings.
 *
 *  Sound is muted per device and never for the room: the choice is kept in
 *  this browser, and a muted device says so for as long as it is muted.
 * ══════════════════════════════════════════════════════════════════════════
 */
const EVERY_MS = 3000;
const STALE_MS = 60_000;
const REFRESH_ON = new Set([
  "item.opened", "item.resolved", "item.escalated", "item.assigned", "item.taken", "light.changed", "coverage.updated",
  "incident.reported", "incident.acknowledged", "incident.assigned", "assignment.changed", "note.added", "settings.changed",
  "scope.changed", "tech.incident", "legal.item", "broadcast.changed",
]);

function tones(context, pattern) {
  let at = context.currentTime;
  for (const [frequency, seconds, type, volume] of pattern) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + seconds + 0.02);
    at += seconds + 0.06;
  }
}

const SOUND = {
  A: [[523, 0.28, "sine", 0.12], [659, 0.36, "sine", 0.12]],
  B: [[1040, 0.14, "square", 0.2], [1040, 0.14, "square", 0.2], [1040, 0.14, "square", 0.2]],
};

/* Muted per device: the choice lives in this browser and nowhere else. */
const MUTE_KEY = "poll360-room-muted";
const isMuted = () => {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
};
const watchMute = (notify) => {
  window.addEventListener(MUTE_KEY, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(MUTE_KEY, notify);
    window.removeEventListener("storage", notify);
  };
};

/* What is ringing, shared between the controls in the top bar and the alarm
   row drawn above it. One screen has one of each, and they are two
   components only because they sit in two places. */
const ringing = { sos: [], stamp: "", listeners: new Set() };
const watchRinging = (notify) => {
  ringing.listeners.add(notify);
  return () => ringing.listeners.delete(notify);
};
let ringingView = { sos: ringing.sos, stamp: ringing.stamp };
const EMPTY_VIEW = { sos: [], stamp: "" };
function setRinging(sos, stamp) {
  const same = sos.length === ringing.sos.length && sos.every((row, index) => row.id === ringing.sos[index].id) && stamp === ringing.stamp;
  if (same) return;
  ringing.sos = sos;
  ringing.stamp = stamp;
  ringingView = { sos, stamp };
  for (const notify of ringing.listeners) notify();
}

const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Africa/Lagos" });

export default function RoomLive({ canAcknowledge = false, title = "Situation room", openCount = null }) {
  const router = useRouter();
  const online = useOnline();
  const [now, setNow] = useState(null);
  const [heardAt, setHeardAt] = useState(null);
  const [failed, setFailed] = useState(false);
  const [techLight, setTechLight] = useState("GREEN");
  const { sos } = useSyncExternalStore(watchRinging, () => ringingView, () => EMPTY_VIEW);
  const [tray, setTray] = useState([]);
  const [open, setOpen] = useState(false);
  const muted = useSyncExternalStore(watchMute, isMuted, () => false);
  const seq = useRef(null);
  const audio = useRef(null);
  const refreshTimer = useRef(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const ring = useCallback((kind) => {
    if (isMuted()) return;
    try {
      audio.current ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.current.state === "suspended") audio.current.resume();
      tones(audio.current, SOUND[kind]);
    } catch {
      /* No sound device, or the browser has not been touched yet. The
         banner and the tray carry the alarm without it. */
    }
  }, []);

  const refreshSoon = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 400);
  }, [router]);

  useEffect(() => {
    let stopped = false;
    let timer = null;

    async function ask() {
      if (stopped) return;
      if (document.visibilityState === "visible" && navigator.onLine) {
        try {
          const response = await fetch(`/api/room/events${seq.current == null ? "" : `?after=${seq.current}`}`, { cache: "no-store" });
          if (response.status === 401) {
            router.push("/login");
            return;
          }
          if (!response.ok) throw new Error(String(response.status));
          const body = await response.json();
          const first = seq.current == null;
          seq.current = body.seq;
          setHeardAt(Date.now());
          setFailed(false);
          setTechLight(body.techLight ?? "GREEN");
          setRinging(body.sos ?? [], CLOCK.format(Date.now()));

          if (!first && body.events.length) {
            const alarms = [];
            for (const event of body.events) {
              const p = event.payload ?? {};
              if (event.type === "incident.reported" && p.critical) alarms.push({ kind: "B", text: `${p.sos ? "SOS" : "Critical report"} · ${p.name ?? "An agent"} · ${p.place ?? event.areaCode}`, at: event.at });
              else if (event.type === "item.opened" && p.light === "RED" && !p.person) alarms.push({ kind: "A", text: `${p.title} · ${p.place ?? event.areaCode}`, at: event.at });
              else if (event.type === "item.escalated") alarms.push({ kind: "A", text: `Escalated to you · ${p.title ?? "an item"} · ${p.place ?? ""}`, at: event.at });
              else if (event.type === "light.changed" && p.to === "RED") alarms.push({ kind: "A", text: `${p.name} turned red`, at: event.at });
              else if (event.type === "tech.incident" && p.severity === "CRITICAL") alarms.push({ kind: "A", text: `Technical incident · ${p.title}`, at: event.at });
            }
            if (alarms.length) {
              setTray((held) => [...alarms.reverse(), ...held].slice(0, 30));
              ring(alarms.some((alarm) => alarm.kind === "B") ? "B" : "A");
            }
            if (body.events.some((event) => REFRESH_ON.has(event.type))) refreshSoon();
          }
        } catch {
          setFailed(true);
        }
      }
      timer = setTimeout(ask, EVERY_MS);
    }

    ask();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(refreshTimer.current);
    };
  }, [ring, refreshSoon, router]);

  /* B rings again every twenty seconds for as long as anything is unacknowledged. */
  const waiting = sos.length;
  useEffect(() => {
    if (!waiting) return undefined;
    const again = setInterval(() => ring("B"), 20_000);
    return () => clearInterval(again);
  }, [waiting, ring]);

  /* The count that needs this person, where they will see it from another tab. */
  useEffect(() => {
    const count = openCount ?? 0;
    document.title = `${waiting ? `☎ ${waiting} · ` : ""}${count ? `(${count}) ` : ""}${title} · Poll360`;
  }, [waiting, openCount, title]);

  const toggleMute = () => {
    const next = !muted;
    try {
      window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {
      /* A browser that refuses storage keeps its sound on. */
    }
    window.dispatchEvent(new Event(MUTE_KEY));
    if (!next) ring("A");
  };

  const stale = online && heardAt != null && now != null && now - heardAt > STALE_MS;
  const stamp = heardAt ? CLOCK.format(heardAt) : "";
  const sys = { GREEN: ["SYS ✔", "text-light-green", "Systems normal"], AMBER: ["SYS ▲", "text-light-yellow-ink", "A technical incident is open"], RED: ["SYS ✖", "text-light-red", "A critical technical incident is open"] }[techLight] ?? ["SYS", "", ""];

  return (
    <>
      <div className="flex items-center gap-2 text-[0.8125rem] font-semibold text-dash-ink">
        {/* The wall clock, with what the room most needs to know about this
            screen beside it: is it connected, and are the systems well. */}
        <div className="flex h-11 items-center gap-3 rounded-full bg-dash-ink pr-4 pl-5 text-white">
          <time className="font-mono text-[1.25rem] leading-none font-bold tabular-nums" suppressHydrationWarning>
            {now ? CLOCK.format(now) : "--:--:--"}
          </time>
          <span className="hidden border-l border-white/20 pl-3 text-[0.6875rem] leading-tight font-semibold sm:block">
            <span className="block text-white/60">WAT</span>
            <span className={cn("flex items-center gap-1", online && !failed ? "text-[#5be39a]" : "text-[#ff7b7b]")}>
              {online && !failed ? <Wifi size={11} aria-hidden="true" /> : <WifiOff size={11} aria-hidden="true" />}
              {online ? (failed ? "No reach" : "Online") : "Offline"}
            </span>
          </span>
          <span className={cn("hidden font-mono text-[0.75rem] md:inline", techLight === "GREEN" ? "text-[#5be39a]" : techLight === "AMBER" ? "text-[#ffd21f]" : "text-[#ff7b7b]")} title={sys[2]}>
            {sys[0]}
            <span className="sr-only"> {sys[2]}</span>
          </span>
        </div>
        {stale && <span className="text-light-yellow-ink">Last updated {stamp}</span>}

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={`Alarms, ${tray.length} since this screen opened`}
            className={cn("inline-flex h-11 items-center gap-1.5 rounded-full border border-dash-line px-3.5", tray.length && "border-light-yellow bg-light-yellow-soft")}
          >
            <Bell size={15} aria-hidden="true" />
            {tray.length}
          </button>
          {open && (
            <div className="absolute right-0 z-50 mt-2 w-80 rounded-dash border border-dash-line bg-dash-card p-3 shadow-e2">
              {tray.length ? (
                <ul className="max-h-80 space-y-2 overflow-auto">
                  {tray.map((alarm, index) => (
                    <li key={index} className="flex gap-2 text-[0.8125rem] font-normal leading-snug">
                      {alarm.kind === "B" ? <Phone size={14} className="mt-0.5 shrink-0 text-light-red" aria-hidden="true" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0 text-light-yellow-ink" aria-hidden="true" />}
                      <span>
                        {alarm.text}
                        <span className="block text-[0.75rem] text-dash-muted">{CLOCK.format(new Date(alarm.at))}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[0.8125rem] font-normal text-dash-muted">Nothing has rung since this screen opened.</p>
              )}
              {tray.length > 0 && (
                <button type="button" onClick={() => setTray([])} className="mt-3 text-[0.75rem] font-semibold text-blue-700 underline">
                  Clear this list
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          className={cn("inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5", muted ? "border-light-red bg-light-red-soft text-light-red" : "border-dash-line")}
          title={muted ? "Sound is off on this device" : "Sound is on"}
        >
          {muted ? <BellOff size={15} aria-hidden="true" /> : <Bell size={15} aria-hidden="true" />}
          <span className={muted ? "" : "sr-only"}>{muted ? "Sound off" : "Sound on"}</span>
        </button>
      </div>

    </>
  );
}

/**
 * The alarm row: drawn at the top of the sticky bar, so it is on screen
 * wherever the page has been scrolled to, and pushes nothing off it.
 *
 * One person in trouble is shown in full, with the number to ring. More than
 * one are counted beside it, oldest unacknowledged first, because six red
 * bars on top of each other are a wall and not six alarms.
 */
export function RoomAlarms({ canAcknowledge = false, more = null }) {
  const online = useOnline();
  const { sos, stamp } = useSyncExternalStore(watchRinging, () => ringingView, () => EMPTY_VIEW);
  const [alarm, ...rest] = sos;
  if (online && !alarm) return null;
  return (
    <div className="space-y-px">
      {!online && (
        <p role="alert" className="bg-light-red px-4 py-2 text-center text-[0.875rem] font-bold text-white">
          Offline: figures frozen at {stamp || "the last update"}. Nothing can be saved until the connection is back.
        </p>
      )}
      {alarm && (
        <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-light-red px-5 py-2 text-white lg:px-8">
          <p className="flex min-w-0 flex-1 items-center gap-2 text-[0.9375rem] font-bold">
            <Phone size={18} className="room-pulse shrink-0" aria-hidden="true" />
            <span className="truncate">
              {alarm.sos ? "SOS" : "PERSON IN TROUBLE"} · {alarm.name ?? "An agent"} · {alarm.place}
              <span className="font-normal opacity-90"> · {alarm.kind}</span>
            </span>
          </p>
          {rest.length > 0 && (
            more ? <a href={more} className="text-[0.8125rem] font-bold underline">and {rest.length} more not acknowledged</a> : <span className="text-[0.8125rem] font-bold">and {rest.length} more not acknowledged</span>
          )}
          {alarm.phone && (
            <a href={`tel:+${alarm.phone}`} className="inline-flex h-9 items-center gap-1.5 rounded-dash-sm bg-white px-3 text-[0.8125rem] font-bold text-light-red">
              <Phone size={14} aria-hidden="true" /> Call +{alarm.phone}
            </a>
          )}
          {canAcknowledge && (
            <ActionForm what="acknowledge" hidden={{ id: alarm.id }} className="contents">
              <Submit variant="dashOutline">Acknowledge</Submit>
            </ActionForm>
          )}
        </div>
      )}
    </div>
  );
}
