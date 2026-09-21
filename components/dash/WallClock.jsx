"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AlarmClock, Bell, BellRing, Check, Plus, Repeat, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The room's wall clock, and the reminders and alarms that hang off it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE ROOM HAS ITS OWN CLOCK
 *
 *  Election night runs on a timetable nobody controls: polls open at 08:30,
 *  close at 14:30, collation starts when it starts, and a bulletin goes out
 *  on the hour whether the count is ready or not. The clock in the corner of
 *  a laptop is small, in whatever zone the laptop was set up in, and not on
 *  the wall display at all. This one is large, always West Africa Time, and
 *  sits on the two heads people watch the timetable from: the Election
 *  Monitor and the Broadcast desk.
 *
 *  ── TWO KINDS OF NUDGE, BECAUSE THEY INTERRUPT DIFFERENTLY ──────────────
 *  A reminder is a tap on the shoulder: one soft chime and a card that waits
 *  to be read. An alarm is the thing that must not be missed: it rings until
 *  a person dismisses or snoozes it, and it takes the middle of the screen.
 *  Making everything an alarm trains a room to dismiss alarms.
 *
 *  ── WHY THE ENGINE AND THE FACE ARE SEPARATE ────────────────────────────
 *  The face shows on two heads. The alarms must go off on all of them — an
 *  alarm set on the Monitor that stays silent because somebody moved to
 *  Analytics is worse than no alarm. So the provider is mounted around the
 *  whole room and the face is only a view of it.
 *
 *  Kept in this browser's storage: these are one person's nudges, not the
 *  room's shared record, and they survive a reload and sync across tabs.
 * ══════════════════════════════════════════════════════════════════════════
 */

const STORE = "poll360:wall-clock";
const ZONE = "Africa/Lagos";
const WAT_OFFSET_HOURS = 1; // UTC+1 all year; Nigeria keeps no summer time.
const MINUTE = 60_000;
const DAY = 86_400_000;
const SNOOZE = 5 * MINUTE;
/* An alarm nobody answers stops ringing eventually, and stays on screen. */
const RING_FOR = 2 * MINUTE;

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: ZONE,
});
const SHORT = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONE });
const DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONE,
});
const DAY_SHORT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: ZONE });
const PARTS = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "numeric", day: "numeric", timeZone: ZONE });

/* ── THE TICK ────────────────────────────────────────────────────────────
   One interval for the whole page, aligned to the second so the digits turn
   over together rather than drifting a few hundred milliseconds off the
   real second. The snapshot is floored to the second, so React only
   re-renders when the display would actually change. The server has no
   clock worth trusting for a viewer, so it renders a placeholder. */
let now = 0;
const listeners = new Set();
let timer = null;

function start() {
  const beat = () => {
    now = Math.floor(Date.now() / 1000) * 1000;
    listeners.forEach((fn) => fn());
    timer = setTimeout(beat, 1000 - (Date.now() % 1000) + 5);
  };
  beat();
}

function subscribe(fn) {
  listeners.add(fn);
  if (!timer) start();
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

const snapshot = () => now || Math.floor(Date.now() / 1000) * 1000;
const serverSnapshot = () => null;

export function useNow() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/* ── WAT ARITHMETIC ──────────────────────────────────────────────────────
   "14:30" means 14:30 in Nigeria, whatever zone this laptop is in. */
function watToday(at) {
  const parts = Object.fromEntries(PARTS.formatToParts(new Date(at)).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/** The next moment the WAT wall clock reads `hhmm`, from `from`. */
export function nextAt(hhmm, from = Date.now()) {
  const [hour, minute] = String(hhmm).split(":").map(Number);
  const { year, month, day } = watToday(from);
  let at = Date.UTC(year, month - 1, day, hour - WAT_OFFSET_HOURS, minute);
  while (at <= from) at += DAY;
  return at;
}

export function until(at, from) {
  const left = Math.max(0, at - from);
  const minutes = Math.round(left / MINUTE);
  if (left < MINUTE) return "in under a minute";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `in ${hours} h${rest ? ` ${rest} min` : ""}`;
}

/* ── SOUND ───────────────────────────────────────────────────────────────
   Made, not loaded: no file to fetch at 2am on a poor connection. A browser
   will not play sound on a page nobody has touched, so the context is made
   on first use, which is always after a press. */
let audio = null;

function tone(frequencies, gap = 0.18, length = 0.14) {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const t0 = audio.currentTime + 0.02;
    frequencies.forEach((frequency, index) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      const t = t0 + index * gap;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + length + 0.02);
    });
  } catch {
    /* No sound available: the card on screen still says it. */
  }
}

const chime = () => tone([660, 880], 0.16, 0.35);
const ring = () => tone([988, 988, 988, 988], 0.13, 0.09);

function read() {
  try {
    const raw = window.localStorage.getItem(STORE);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((row) => row && row.id && Number.isFinite(row.at)) : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(list));
  } catch {
    /* Storage refused: the list lives until the tab closes. */
  }
}

function notify(row) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    new Notification(row.kind === "alarm" ? "Poll360 alarm" : "Poll360 reminder", {
      body: `${SHORT.format(new Date(row.at))} WAT · ${row.label}`,
      tag: row.id,
    });
  } catch {
    /* Notifications are a courtesy on top of the card, never instead of it. */
  }
}

/* ═════════════════════════════════════════════════════════════ ENGINE ═══ */

const ClockContext = createContext(null);

export function ClockProvider({ children }) {
  const [list, setList] = useState([]);
  const [due, setDue] = useState([]);
  const tick = useNow();
  const listRef = useRef([]);

  /* One writer for the list: the ref is what the tick reads, the state is
     what the face draws, and storage is what survives a reload. */
  const save = useCallback((update) => {
    const next = typeof update === "function" ? update(listRef.current) : update;
    listRef.current = next;
    write(next);
    setList(next);
  }, []);

  /* ── FIRING ──────────────────────────────────────────────────────────
     Checked on every beat of the clock, from the clock's own callback, so
     nothing is waiting on a render to notice the time. Anything whose
     moment has passed moves from the list to the screen. A daily one goes
     straight back for tomorrow; the rest leave the list and live only as
     the card until somebody answers it.

     The list is loaded here too, after mount, because storage is the
     browser's — and kept in step with the same list open in another tab. */
  useEffect(() => {
    listRef.current = read();
    setList(listRef.current);

    const check = () => {
      const at = snapshot();
      const fired = listRef.current.filter((row) => row.at <= at);
      if (!fired.length) return;
      save((current) =>
        current
          .map((row) =>
            row.at <= at && row.repeat === "daily" ? { ...row, at: nextAt(SHORT.format(new Date(row.at)), at) } : row
          )
          .filter((row) => row.at > at)
          .sort((a, b) => a.at - b.at)
      );
      setDue((current) => [...current, ...fired.map((row) => ({ ...row, firedAt: at }))]);
      fired.forEach((row) => {
        notify(row);
        if (row.kind === "reminder") chime();
      });
    };

    const onStorage = (event) => {
      if (event.key !== STORE) return;
      listRef.current = read();
      setList(listRef.current);
    };

    const stop = subscribe(check);
    window.addEventListener("storage", onStorage);
    return () => {
      stop();
      window.removeEventListener("storage", onStorage);
    };
  }, [save]);

  /* An alarm keeps ringing, every two seconds, until it is answered or has
     rung for two minutes. */
  const ringing = due.some((row) => row.kind === "alarm" && tick && tick - row.firedAt < RING_FOR);
  useEffect(() => {
    if (!ringing) return;
    ring();
    const id = setInterval(ring, 2000);
    return () => clearInterval(id);
  }, [ringing]);

  /* The tab says it too, for a room with the dashboard behind another window. */
  useEffect(() => {
    if (!due.length) return;
    const title = document.title;
    document.title = `⏰ ${due[0].label} · ${title}`;
    return () => {
      document.title = title;
    };
  }, [due]);

  const add = useCallback(
    ({ label, at, kind, repeat }) => {
      const row = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        label: label.trim() || (kind === "alarm" ? "Alarm" : "Reminder"),
        at,
        kind,
        repeat: repeat ? "daily" : "none",
      };
      save((current) => [...current, row].sort((a, b) => a.at - b.at));
      /* Asked for on a press, which is the only time a browser will ask,
         and only the first time. */
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
      } catch {
        /* Not offered on this browser. */
      }
    },
    [save]
  );

  const remove = useCallback((id) => save((current) => current.filter((row) => row.id !== id)), [save]);

  /* Answering a card: dismiss it, or put it back for five minutes' time. */
  const answer = useCallback(
    (row, snooze = false) => {
      if (snooze) {
        save((current) =>
          [...current, { ...row, id: `${row.id}z${snapshot().toString(36)}`, at: snapshot() + SNOOZE, repeat: "none" }].sort(
            (a, b) => a.at - b.at
          )
        );
      }
      setDue((current) => current.filter((item) => item.id !== row.id));
    },
    [save]
  );

  const value = useMemo(() => ({ list, add, remove }), [list, add, remove]);

  return (
    <ClockContext.Provider value={value}>
      {children}
      <DueCards due={due} onAnswer={answer} />
    </ClockContext.Provider>
  );
}

const useClock = () => useContext(ClockContext) ?? { list: [], add: () => {}, remove: () => {} };

/* ═══════════════════════════════════════════════════════════════ FACE ═══ */

/**
 * The face: time large enough to read across a room, the date under it in
 * words, and the next thing due, so the clock answers "what is next" as well
 * as "what time is it" — the question a room actually has when it looks up.
 */
export default function WallClock({ className }) {
  const tick = useNow();
  const { list } = useClock();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event) => !boxRef.current?.contains(event.target) && setOpen(false);
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const [hh, mm, ss] = tick ? TIME.format(new Date(tick)).split(":") : ["--", "--", "--"];
  const next = list[0];

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      {/* ── ONE NAVY INSTRUMENT, BAR HEIGHT ──────────────────────────────
          The brand's block colour, the same navy as the broadcast console,
          so the clock reads as a fixture of the room rather than one more
          control. It lives in the sticky bar at the bar's own 44px, so it
          costs the map no height at all; it is the largest type in the bar,
          which is what makes it read as the clock across a room.

          The colon is drawn, not typed: in the mono face a colon takes a
          whole character cell, which spaces the time out like a word or,
          pulled in, runs into the digits. Two red dots, beating once a
          second, sit exactly where they should at any size. */}
      <div className="flex h-11 items-stretch overflow-hidden rounded-full bg-blue-950 text-white shadow-e2">
        <div
          className="flex items-center gap-3 pr-3 pl-4"
          role="timer"
          aria-label={tick ? `${hh}:${mm} West Africa Time` : "Clock"}
          title={tick ? `${DATE.format(new Date(tick))} · West Africa Time` : undefined}
        >
          <p className="flex items-center font-mono leading-none font-semibold tabular-nums" aria-hidden="true">
            <span className="text-[1.375rem] tracking-[-0.03em]">{hh}</span>
            <span className="mx-[0.3rem] flex flex-col gap-[0.22rem]">
              <span className={cn("size-[0.22rem] rounded-full bg-red-500", tick && "animate-[pulse_1s_steps(2,end)_infinite]")} />
              <span className={cn("size-[0.22rem] rounded-full bg-red-500", tick && "animate-[pulse_1s_steps(2,end)_infinite]")} />
            </span>
            <span className="text-[1.375rem] tracking-[-0.03em]">{mm}</span>
            <span className="ml-1.5 w-[1.4em] text-[0.8125rem] text-blue-300">{ss}</span>
          </p>
          <span className="hidden flex-col justify-center border-l border-blue-800 pl-3 leading-none 2xl:flex">
            <span className="text-[0.5625rem] font-bold tracking-[0.14em] text-blue-300 uppercase">WAT</span>
            <span className="mt-1 text-[0.75rem] font-medium whitespace-nowrap text-blue-100">
              {tick ? DAY_SHORT.format(new Date(tick)) : "\u00a0"}
            </span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={next && tick ? `Next: ${SHORT.format(new Date(next.at))} · ${next.label}` : "Reminders and alarms"}
          aria-label={`Reminders and alarms${list.length ? `, ${list.length} set` : ""}`}
          className={cn(
            "relative flex w-12 items-center justify-center border-l border-blue-800 transition-colors hover:bg-blue-900",
            "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white",
            open && "bg-blue-900"
          )}
        >
          <AlarmClock size={18} strokeWidth={2.25} aria-hidden="true" />
          {list.length > 0 && (
            <span
              className="figure absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[0.625rem] leading-4 font-bold text-white"
              aria-hidden="true"
            >
              {list.length}
            </span>
          )}
        </button>
      </div>

      {open && <Planner tick={tick} onClose={() => setOpen(false)} />}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── the planner ── */

/* The day's fixed points, one press each. INEC's polling hours; the rest
   are the rhythms a results desk keeps. */
const PRESETS = [
  { label: "Polls open", time: "08:30", kind: "reminder" },
  { label: "Polls close", time: "14:30", kind: "alarm" },
  { label: "Top-of-hour bulletin", time: null, kind: "reminder" },
];

const SOON = [5, 15, 30, 60];

function Planner({ tick, onClose }) {
  const { list, add, remove } = useClock();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("reminder");
  const [time, setTime] = useState("");
  const [repeat, setRepeat] = useState(false);
  const labelRef = useRef(null);

  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  const submit = (event) => {
    event.preventDefault();
    if (!time) return;
    add({ label, at: nextAt(time, tick), kind, repeat });
    setLabel("");
    setTime("");
    setRepeat(false);
  };

  /* Counted from the clock's own second, the one on the face. */
  const inMinutes = (minutes) => add({ label, at: tick + minutes * MINUTE, kind, repeat: false });

  const preset = (row) => {
    const at =
      row.time === null
        ? Math.ceil((tick + 2 * MINUTE + 1000) / (60 * MINUTE)) * 60 * MINUTE - 2 * MINUTE // two minutes before the hour
        : nextAt(row.time, tick);
    add({ label: row.label, at, kind: row.kind, repeat: row.time !== null });
  };

  return (
    <div
      role="dialog"
      aria-label="Reminders and alarms"
      className="absolute right-0 z-40 mt-2 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-dash border border-dash-line bg-dash-card shadow-e3"
    >
      <header className="flex items-center justify-between border-b border-dash-line px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="font-display text-[1rem] font-extrabold tracking-[-0.01em] text-dash-ink">Reminders and alarms</h2>
          <p className="mt-0.5 text-[0.75rem] text-dash-muted">{tick ? `${DATE.format(new Date(tick))} · WAT` : "West Africa Time"}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-8 items-center justify-center rounded-full text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
        >
          <X size={16} strokeWidth={2.5} />
        </button>
      </header>

      <form onSubmit={submit} className="space-y-4 px-5 py-4">
        {/* Which kind first, because it decides how loud the thing will be. */}
        <div role="radiogroup" aria-label="Kind" className="grid grid-cols-2 gap-1 rounded-full bg-dash-bg p-1">
          {[
            { id: "reminder", label: "Reminder", icon: Bell, note: "One chime" },
            { id: "alarm", label: "Alarm", icon: BellRing, note: "Rings until answered" },
          ].map((row) => (
            <button
              key={row.id}
              type="button"
              role="radio"
              aria-checked={kind === row.id}
              onClick={() => setKind(row.id)}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-full text-[0.875rem] font-semibold transition-colors",
                kind === row.id
                  ? row.id === "alarm"
                    ? "bg-red-600 text-white"
                    : "bg-dash-ink text-white"
                  : "text-dash-muted hover:text-dash-ink"
              )}
            >
              <row.icon size={15} strokeWidth={2.25} aria-hidden="true" />
              {row.label}
            </button>
          ))}
        </div>
        <p className="-mt-2 text-center text-[0.75rem] text-dash-muted">
          {kind === "alarm" ? "Rings and takes the screen until someone answers it." : "One soft chime and a card."}
        </p>

        <input
          ref={labelRef}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={kind === "alarm" ? "Collation call with Kano" : "Check the Lagos returns"}
          maxLength={80}
          aria-label="What it is for"
          className="h-11 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3.5 text-[0.9375rem] text-dash-ink placeholder:text-dash-muted/70 focus:border-dash-ink focus:ring-4 focus:ring-dash-ink/10 focus:outline-none"
        />

        <div className="flex items-center gap-2">
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            aria-label="At, West Africa Time"
            className="figure h-11 flex-1 rounded-dash-sm border border-dash-line bg-dash-card px-3.5 text-[1rem] text-dash-ink tabular-nums focus:border-dash-ink focus:ring-4 focus:ring-dash-ink/10 focus:outline-none"
          />
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-dash-sm border border-dash-line px-3 text-[0.8125rem] font-medium text-dash-ink has-[:checked]:border-dash-ink has-[:checked]:bg-dash-bg">
            <input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} className="size-4 accent-black" />
            <Repeat size={14} strokeWidth={2.25} aria-hidden="true" />
            Daily
          </label>
          <button
            type="submit"
            disabled={!time}
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-dash-ink px-4 text-[0.875rem] font-bold text-white transition-colors hover:bg-black disabled:bg-dash-line disabled:text-dash-muted"
          >
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            Set
          </button>
        </div>

        <div>
          <p className="text-[0.6875rem] font-bold tracking-[0.12em] text-dash-muted uppercase">Or, from now</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SOON.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => inMinutes(minutes)}
                className="inline-flex h-9 items-center rounded-full border border-dash-line px-3.5 text-[0.8125rem] font-semibold text-dash-ink transition-colors hover:border-dash-ink hover:bg-dash-bg"
              >
                {minutes < 60 ? `${minutes} min` : "1 hour"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[0.6875rem] font-bold tracking-[0.12em] text-dash-muted uppercase">Election day</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((row) => (
              <button
                key={row.label}
                type="button"
                onClick={() => preset(row)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dash-line px-3.5 text-[0.8125rem] font-semibold text-dash-ink transition-colors hover:border-dash-ink hover:bg-dash-bg"
              >
                {row.kind === "alarm" ? <BellRing size={13} strokeWidth={2.25} /> : <Bell size={13} strokeWidth={2.25} />}
                {row.label}
                {row.time && <span className="figure font-normal text-dash-muted">{row.time}</span>}
              </button>
            ))}
          </div>
        </div>
      </form>

      <div className="border-t border-dash-line bg-dash-bg">
        {list.length === 0 ? (
          <p className="px-5 py-5 text-center text-[0.8125rem] text-dash-muted">Nothing set yet.</p>
        ) : (
          <ul className="max-h-64 divide-y divide-dash-line overflow-y-auto">
            {list.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-5 py-3">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    row.kind === "alarm" ? "bg-red-50 text-red-600" : "bg-dash-card text-dash-ink"
                  )}
                  aria-hidden="true"
                >
                  {row.kind === "alarm" ? <BellRing size={15} strokeWidth={2.25} /> : <Bell size={15} strokeWidth={2.25} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] font-semibold text-dash-ink">{row.label}</span>
                  <span className="flex items-center gap-1.5 text-[0.75rem] text-dash-muted">
                    <span className="figure tabular-nums">{SHORT.format(new Date(row.at))}</span>
                    {tick && <span>· {until(row.at, tick)}</span>}
                    {row.repeat === "daily" && (
                      <span className="inline-flex items-center gap-1">
                        · <Repeat size={11} strokeWidth={2.5} aria-hidden="true" /> daily
                      </span>
                    )}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => remove(row.id)}
                  aria-label={`Remove ${row.label}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-dash-muted transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={15} strokeWidth={2.25} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────── when it's due ── */

/**
 * What is due, on screen. Alarms take the centre of the screen over a dimmed
 * room, because an alarm that can be missed is a reminder. Reminders sit in
 * the corner and wait.
 */
function DueCards({ due, onAnswer }) {
  const alarm = due.find((row) => row.kind === "alarm");
  const reminders = due.filter((row) => row.kind === "reminder");

  return (
    <>
      {alarm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby={`alarm-${alarm.id}`}>
          <div className="w-full max-w-md overflow-hidden rounded-dash bg-dash-card shadow-e3">
            <div className="flex flex-col items-center bg-red-600 px-6 pt-7 pb-6 text-white">
              <span className="flex size-16 items-center justify-center rounded-full bg-white text-red-600">
                <BellRing size={30} strokeWidth={2.25} className="animate-[alarm-swing_0.9s_ease-in-out_infinite]" aria-hidden="true" />
              </span>
              <p className="mt-4 text-[0.75rem] font-bold tracking-[0.18em] uppercase">Alarm</p>
              <p className="figure mt-1 text-[2.5rem] leading-none font-semibold tabular-nums">
                {SHORT.format(new Date(alarm.at))}
              </p>
            </div>
            <div className="px-6 py-5 text-center">
              <h2 id={`alarm-${alarm.id}`} className="font-display text-[1.375rem] leading-tight font-extrabold tracking-[-0.02em] text-dash-ink">
                {alarm.label}
              </h2>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onAnswer(alarm, true)}
                  className="h-12 rounded-full border border-dash-line text-[0.9375rem] font-bold text-dash-ink transition-colors hover:border-dash-ink hover:bg-dash-bg"
                >
                  Snooze 5 min
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => onAnswer(alarm)}
                  className="h-12 rounded-full bg-dash-ink text-[0.9375rem] font-bold text-white transition-colors hover:bg-black"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {reminders.length > 0 && (
        <div className="fixed right-4 bottom-4 z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
          {reminders.map((row) => (
            <div key={row.id} className="flex items-start gap-3 overflow-hidden rounded-dash border border-blue-800 bg-blue-950 p-4 text-white shadow-e3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-blue-950" aria-hidden="true">
                <Bell size={17} strokeWidth={2.25} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-blue-300 uppercase">
                  Reminder · <span className="figure">{SHORT.format(new Date(row.at))}</span>
                </p>
                <p className="mt-1 text-[0.9375rem] leading-snug font-semibold">{row.label}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onAnswer(row)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3.5 text-[0.8125rem] font-bold text-blue-950 hover:bg-blue-100"
                  >
                    <Check size={14} strokeWidth={2.75} aria-hidden="true" />
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={() => onAnswer(row, true)}
                    className="inline-flex h-8 items-center rounded-full border border-blue-700 px-3.5 text-[0.8125rem] font-semibold text-blue-100 hover:bg-blue-900"
                  >
                    Snooze 5 min
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
