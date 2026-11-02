"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ChevronDown, CircleCheck, CircleSlash, Database, Pause, Play, Radio, RefreshCw, ServerCog, TriangleAlert, XCircle } from "lucide-react";

import { cn, formatNumber } from "@/lib/utils";

/**
 * The technical desk, live.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A status page that is redrawn when somebody reloads it is a photograph of
 *  the system. This one is the system: it measures every few seconds, keeps
 *  the last few minutes of every measurement in the browser, and draws the
 *  line, so a database that is slowing down is seen slowing down and not
 *  discovered slow.
 *
 *  · Four gauges, each with its own recent history drawn under the figure.
 *  · The database's heartbeat: every round trip of the last few minutes,
 *    with the median, the 95th percentile and the worst.
 *  · Every service check as a tile that pulses in its own colour, keeps a
 *    strip of its recent states, and opens to say what it means and what it
 *    measured. A check that changes state flashes and is announced.
 *  · Results a minute for the last hour, moving left as the hour does.
 *
 *  It can be paused, so a figure can be read without moving, and it says
 *  plainly when it could not reach the server, and for how long.
 *  No vote figure is on it.
 * ══════════════════════════════════════════════════════════════════════════
 */
const EVERY_MS = 4000;
const KEEP = 90;
const TONE = {
  ok: { dot: "bg-light-green", text: "text-light-green", ring: "ring-light-green/30", word: "Normal", pill: "bg-light-green-soft text-light-green", stroke: "var(--color-light-green)" },
  warn: { dot: "bg-light-yellow", text: "text-light-yellow-ink", ring: "ring-light-yellow/40", word: "Needs a look", pill: "bg-light-yellow-soft text-light-yellow-ink", stroke: "var(--color-light-yellow)" },
  bad: { dot: "bg-light-red", text: "text-light-red", ring: "ring-light-red/40", word: "Failing", pill: "bg-light-red-soft text-light-red", stroke: "var(--color-light-red)" },
  off: { dot: "bg-light-grey", text: "text-dash-muted", ring: "ring-light-grey/30", word: "Off", pill: "bg-dash-bg text-dash-muted", stroke: "var(--color-light-grey)" },
};
const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Africa/Lagos" });

const megabytes = (value) => `${(Number(value) / 1e6).toFixed(0)} MB`;
const percentile = (values, share) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
};

/** A small line of recent values under a figure. */
function Spark({ values, stroke = "var(--color-dash-ink)", height = 28 }) {
  if (values.length < 2) return <div style={{ height }} />;
  const top = Math.max(1, ...values);
  const step = 100 / (values.length - 1);
  const line = values.map((value, index) => `${index === 0 ? "M" : "L"}${(index * step).toFixed(2)} ${(height - 2 - (value / top) * (height - 4)).toFixed(2)}`).join(" ");
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden="true">
      <path d={`${line} L100 ${height} L0 ${height} Z`} fill={stroke} fillOpacity="0.1" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Gauge({ icon: Icon, label, value, note, tone = "ok", values }) {
  return (
    <div className={cn("overflow-hidden rounded-dash border border-dash-line bg-dash-card shadow-e2 ring-2 ring-transparent transition-shadow", tone !== "ok" && TONE[tone].ring)}>
      <div className="px-5 pt-4">
        <p className="flex items-center gap-2 text-[0.8125rem] text-dash-muted">
          <Icon size={15} aria-hidden="true" />
          {label}
          <span className={cn("ml-auto size-2 rounded-full", TONE[tone].dot, tone !== "ok" && "room-pulse")} aria-hidden="true" />
        </p>
        <p className={cn("mt-2 font-display text-[2rem] leading-none font-bold tracking-[-0.02em] tabular-nums", tone === "ok" ? "text-dash-ink" : TONE[tone].text)}>{value}</p>
        <p className="mt-2 truncate text-[0.8125rem] text-dash-muted">{note}</p>
      </div>
      <Spark values={values} stroke={TONE[tone].stroke} />
    </div>
  );
}

/** The database's round trip, sample by sample, with the lines that say what is slow. */
function Heartbeat({ samples }) {
  const values = samples.map((sample) => sample.ping);
  const top = Math.max(600, ...values) * 1.1;
  const [w, h] = [1000, 220];
  const x = (index) => (samples.length < 2 ? w : (index / (KEEP - 1)) * w + (w - ((samples.length - 1) / (KEEP - 1)) * w));
  const y = (value) => h - 8 - (value / top) * (h - 20);
  const line = values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  const last = samples[samples.length - 1];
  const stats = [["Now", last?.ping ?? 0], ["Typical", percentile(values, 0.5)], ["Slow end", percentile(values, 0.95)], ["Worst", Math.max(0, ...values)]];
  return (
    <section className="flex h-full flex-col rounded-dash bg-[#090c17] p-5 text-white" aria-label="Database speed, live">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#2fd67b] opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-[#2fd67b]" />
            </span>
            Database speed
          </h2>
          <p className="mt-0.5 text-[0.8125rem] text-white/50">How long it took to answer, every {EVERY_MS / 1000} seconds for the last {Math.round((KEEP * EVERY_MS) / 60000)} minutes.</p>
        </div>
        <dl className="flex gap-5 text-[0.75rem]">
          {stats.map(([name, value]) => (
            <div key={name}>
              <dt className="text-white/45">{name}</dt>
              <dd className={cn("font-display text-[1.125rem] leading-tight font-bold tabular-nums", value > 1500 ? "text-[#ff4d4d]" : value > 400 ? "text-[#ffd21f]" : "text-[#2fd67b]")}>{Math.round(value)} ms</dd>
            </div>
          ))}
        </dl>
      </header>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-4 min-h-44 w-full flex-1" role="img" aria-label={`Database speed. Now ${last?.ping ?? 0} milliseconds.`}>
        {[400, 1500].filter((mark) => mark < top).map((mark) => (
          <g key={mark}>
            <line x1="0" x2={w} y1={y(mark)} y2={y(mark)} stroke={mark === 400 ? "#ffd21f" : "#ff4d4d"} strokeOpacity="0.45" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
            <text x="6" y={y(mark) - 5} fontSize="13" fill={mark === 400 ? "#ffd21f" : "#ff4d4d"} fillOpacity="0.8">{mark === 400 ? "Slow above 400 ms" : "Stuck above 1.5 s"}</text>
          </g>
        ))}
        {values.length > 1 && (
          <>
            <path d={`${line} L${w} ${h} L${x(0).toFixed(1)} ${h} Z`} fill="#2fd67b" fillOpacity="0.12" />
            <path d={line} fill="none" stroke="#2fd67b" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </>
        )}
        {samples.map((sample, index) => (!sample.ok || sample.ping > 400 ? <circle key={sample.at} cx={x(index)} cy={y(sample.ping)} r="5" fill={!sample.ok || sample.ping > 1500 ? "#ff4d4d" : "#ffd21f"} /> : null))}
        {last && <circle cx={x(samples.length - 1)} cy={y(last.ping)} r="6" fill="#ffffff" className="room-pulse" />}
      </svg>
      <p className="mt-2 flex justify-between text-[0.75rem] text-white/45 tabular-nums">
        <span suppressHydrationWarning>{samples[0] ? `Since ${CLOCK.format(samples[0].at)}` : ""}</span>
        <span>{samples.length < 2 ? "The line draws as measurements arrive" : `${samples.length} measurements`}</span>
        <span>Now</span>
      </p>
    </section>
  );
}

function CheckTile({ check, history, open, onToggle, changed }) {
  const tone = TONE[check.state];
  const Icon = check.state === "ok" ? CircleCheck : check.state === "bad" ? XCircle : check.state === "off" ? CircleSlash : TriangleAlert;
  return (
    <li className={cn("overflow-hidden rounded-dash border bg-dash-card shadow-e2 transition-colors", check.state === "bad" ? "border-light-red" : check.state === "warn" ? "border-light-yellow" : "border-dash-line", changed && "room-flash")}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="block w-full px-4 pt-3.5 pb-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-dash-ink">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.6875rem] text-dash-muted">{check.group}</span>
            <span className="block truncate text-[0.8125rem] font-semibold text-dash-ink">{check.name ?? check.id}</span>
          </span>
          <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[0.6875rem] font-bold whitespace-nowrap", tone.pill)}>
            <Icon size={12} strokeWidth={2.5} aria-hidden="true" />
            {tone.word}
          </span>
        </span>
        <span className={cn("mt-2 block truncate font-display text-[1.375rem] leading-none font-bold tracking-[-0.02em] tabular-nums", check.state === "ok" || check.state === "off" ? "text-dash-ink" : tone.text)}>{check.value}</span>
        {/* Its recent states, oldest on the left. */}
        <span className="mt-3 flex h-1.5 gap-px" aria-hidden="true">
          {Array.from({ length: 30 }, (_, index) => {
            const past = history[history.length - 30 + index];
            return <span key={index} className={cn("flex-1 rounded-full", past ? TONE[past].dot : "bg-dash-bg")} />;
          })}
        </span>
        <span className="mt-2 flex items-center justify-between text-[0.75rem] text-dash-muted">
          <span>{open ? "Hide what this is" : "What this is"}</span>
          <ChevronDown size={14} className={cn("transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
        </span>
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-dash-line bg-dash-bg px-4 py-3 text-[0.8125rem] leading-relaxed">
          <p className="font-semibold text-dash-ink">{check.detail}</p>
          <p className="text-dash-muted">{check.means}</p>
        </div>
      )}
    </li>
  );
}

function Throughput({ perMinute, now }) {
  const byMinute = new Map(perMinute.map((row) => [row.minute, row.n]));
  const bars = [];
  for (let back = 59; back >= 0; back -= 1) bars.push(byMinute.get(new Date(now - back * 60_000).toISOString().slice(0, 16)) ?? 0);
  const peak = Math.max(1, ...bars);
  const total = bars.reduce((sum, n) => sum + n, 0);
  return (
    <section className="flex h-full flex-col rounded-dash border border-dash-line bg-dash-card p-5 shadow-e2" aria-label="Results a minute, last hour">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[0.9375rem] font-bold text-dash-ink">Results arriving</h2>
          <p className="mt-0.5 text-[0.8125rem] text-dash-muted">One bar for each minute of the last hour.</p>
        </div>
        <dl className="flex gap-5 text-[0.75rem]">
          {[["In the hour", formatNumber(total)], ["Busiest minute", total ? formatNumber(peak) : "0"], ["Average a minute", (total / 60).toFixed(1)]].map(([name, value]) => (
            <div key={name}>
              <dt className="text-dash-muted">{name}</dt>
              <dd className="font-display text-[1.125rem] leading-tight font-bold text-dash-ink tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </header>
      {total === 0 && <p className="mt-4 rounded-dash-sm bg-dash-bg px-3 py-2 text-[0.8125rem] text-dash-muted">No result has arrived in the last hour. Bars appear here as they do.</p>}
      <div className="mt-4 flex min-h-32 flex-1 items-end gap-[2px]" role="img" aria-label={`${total} results in the last hour, peak ${peak} in one minute`}>
        {bars.map((n, index) => (
          <span key={index} title={`${n} results, ${59 - index} min ago`} className={cn("flex-1 rounded-t-[2px] transition-[height] duration-500", n ? "bg-dash-ink" : "bg-dash-line", index === 59 && "bg-blue-600")} style={{ height: `${n ? Math.max(6, (n / peak) * 100) : 2}%` }} />
        ))}
      </div>
      <p className="mt-2 flex justify-between text-[0.75rem] text-dash-muted"><span>An hour ago</span><span>30 minutes ago</span><span>Now</span></p>
    </section>
  );
}

export default function TechLive({ initial }) {
  const [samples, setSamples] = useState([{ ...initial, ok: initial.pingOk }]);
  const [paused, setPaused] = useState(false);
  const [missed, setMissed] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [changed, setChanged] = useState({});
  const [said, setSaid] = useState("");
  const last = useRef(initial);
  const busy = useRef(false);

  const measure = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const response = await fetch("/api/room/telemetry", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const next = await response.json();
      setMissed(0);
      const before = last.current;
      last.current = next;
      const moved = {};
      const lines = [];
      for (const check of next.checks) {
        const was = before?.checks.find((each) => each.id === check.id)?.state;
        if (was && was !== check.state) {
          moved[check.id] = next.at;
          lines.push(`${check.name ?? check.id} went from ${TONE[was].word} to ${TONE[check.state].word}`);
        }
      }
      if (lines.length) {
        setChanged(moved);
        setSaid(lines.join(". "));
      }
      // The route shares one measurement for three seconds, so asking twice
      // inside that window hands back the one already drawn.
      setSamples((held) => (held.some((each) => each.at === next.at) ? held : [...held, { ...next, ok: next.pingOk }].slice(-KEEP)));
    } catch {
      setMissed((count) => count + 1);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) measure();
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [paused, measure]);

  const now = samples[samples.length - 1];
  /* Each check's recent states, read off the samples held. */
  const historyOf = (id) => samples.map((sample) => sample.checks.find((check) => check.id === id)?.state).filter(Boolean);
  const pingTone = !now.pingOk || now.ping > 1500 ? "bad" : now.ping > 400 ? "warn" : "ok";
  const stale = missed >= 2;

  return (
    <div className="space-y-3">
      <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-dash border px-4 py-2.5 text-[0.8125rem]", stale ? "border-light-red bg-light-red-soft" : now.failing ? "border-light-red bg-light-red-soft" : now.warning ? "border-light-yellow bg-light-yellow-soft" : "border-light-green bg-light-green-soft")}>
        <span className={cn("flex items-center gap-2 text-[0.9375rem] font-bold", stale || now.failing ? "text-light-red" : now.warning ? "text-light-yellow-ink" : "text-light-green")}>
          <span className={cn("size-2.5 rounded-full room-pulse", stale || now.failing ? "bg-light-red" : now.warning ? "bg-light-yellow" : "bg-light-green")} aria-hidden="true" />
          {stale ? `Cannot reach the server: ${missed} measurements missed` : now.failing ? `${now.failing} check${now.failing === 1 ? "" : "s"} failing` : now.warning ? `Everything is running, ${now.warning} need${now.warning === 1 ? "s" : ""} a look` : "Everything is running normally"}
        </span>
        <span className="text-dash-muted tabular-nums" suppressHydrationWarning>
          {paused ? "Paused at" : "Measured at"} {CLOCK.format(now.at)}{paused ? "" : `, and again every ${EVERY_MS / 1000} seconds`}
        </span>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={() => setPaused((value) => !value)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dash-line bg-dash-card px-3 font-semibold text-dash-ink hover:border-dash-ink">
            {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={measure} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dash-line bg-dash-card px-3 font-semibold text-dash-ink hover:border-dash-ink">
            <RefreshCw size={14} aria-hidden="true" /> Measure now
          </button>
        </span>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{said}</p>

      <div className="grid gap-3 min-[30rem]:grid-cols-2 xl:grid-cols-4">
        <Gauge icon={Database} label="Database speed" value={`${now.ping} ms`} note={`${now.connections} of ${now.maxConnections} connections in use`} tone={pingTone} values={samples.map((sample) => sample.ping)} />
        <Gauge icon={Activity} label="Results a minute" value={now.lastTen.toFixed(1)} note={`${formatNumber(now.results)} held for this contest`} values={samples.map((sample) => sample.lastTen)} />
        <Gauge icon={Radio} label="Screen updates a minute" value={formatNumber(now.events.lastMinute)} note={`${formatNumber(now.sessions.online)} screen${now.sessions.online === 1 ? "" : "s"} open now`} values={samples.map((sample) => sample.events.lastMinute)} />
        <Gauge icon={ServerCog} label="Server memory" value={now.runtime ? megabytes(now.runtime.rss) : "n/a"} note={now.runtime ? `Running for ${now.runtime.uptime < 5400 ? `${Math.max(1, Math.round(now.runtime.uptime / 60))} minutes` : `${Math.round(now.runtime.uptime / 3600)} hours`}` : ""} values={samples.map((sample) => (sample.runtime ? sample.runtime.rss / 1e6 : 0))} />
      </div>

      <div className="grid items-stretch gap-3 xl:grid-cols-2">
        <Heartbeat samples={samples} />
        <Throughput perMinute={now.perMinute} now={now.at} />
      </div>

      {/* One grid, not a row for each group: four groups of four, three, two
          and one left more holes than tiles. The group is the small line
          over each name. */}
      <section aria-label="Checks">
        <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-[0.9375rem] font-bold text-dash-ink">
          Every check
          <span className="text-[0.8125rem] font-normal text-dash-muted">{now.checks.length} of them, measured together. Press one to see what it is.</span>
        </h2>
        <ul className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {now.checks.map((check) => (
            <CheckTile key={check.id} check={check} history={historyOf(check.id)} open={openId === check.id} onToggle={() => setOpenId(openId === check.id ? null : check.id)} changed={changed[check.id] === now.at} />
          ))}
        </ul>
      </section>
    </div>
  );
}
