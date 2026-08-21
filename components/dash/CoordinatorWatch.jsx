"use client";

import { useMemo, useState } from "react";
import { MapPin, Radio, ShieldAlert, Users } from "lucide-react";

import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The coordinator watch.
 *
 * ── A DOT IS A CLAIM, SO ONLY REAL FIXES GET A SOLID ONE ───────────────────
 * A filled dot means: this person filed, and their device reported this
 * position at that moment. A hollow ring means: we know which booth they hold
 * and nothing else, they are drawn at the centre of their state purely so
 * they exist on the screen, and both the ring and the list say "not reported".
 *
 * The distinction is the whole panel. A map that drew everybody solid would be
 * asserting the location of hundreds of people nobody has heard from, which is
 * precisely the confident wrongness this product refuses everywhere else.
 * ───────────────────────────────────────────────────────────────────────────
 */
/**
 * How each position band is described, in words.
 *
 * Defined here rather than imported from lib/watch.js: that module opens the
 * database, and a client component importing anything from it drags
 * `node:sqlite` into the browser bundle, which Turbopack rightly refuses to
 * build. Labels are presentation and belong with the thing that renders them.
 */
const BANDS = {
  matched: { label: "At the unit" },
  near: { label: "Nearby" },
  far: { label: "Away from unit" },
  unmatched: { label: "Position unmatched" },
  unknown: { label: "Not reported" },
};

const TONE = {
  matched: "var(--color-verified)",
  near: "var(--color-apc)",
  far: "var(--color-red-500)",
  unmatched: "var(--color-party-other)",
  unknown: "transparent",
};

export default function CoordinatorWatch({ shapes, coordinators, summary }) {
  const [hovered, setHovered] = useState(null);
  const [filter, setFilter] = useState("all");

  const shown = useMemo(
    () =>
      coordinators.filter((row) =>
        filter === "all"
          ? true
          : filter === "far"
            ? row.band === "far"
            : filter === "silent"
              ? !row.filed
              : row.filed
      ),
    [coordinators, filter]
  );

  /* A row whose unit code names no state we recognise has no coordinates, and
     is left off the map rather than drawn somewhere plausible. It stays in the
     list beside it, which is where the person actually is accounted for. */
  const plotted = useMemo(() => shown.filter((row) => row.x != null && row.y != null), [shown]);

  const active = hovered ? coordinators.find((row) => row.id === hovered) : null;

  return (
    <div className="grid gap-3 xl:h-[calc(100vh-12.5rem)] xl:grid-cols-[minmax(0,1fr)_21rem]">
      {/* --------------------------------------------------------- the map */}
      <div className="on-board flex min-h-[32rem] flex-col overflow-hidden rounded-dash border border-board-line bg-board xl:min-h-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-board-line px-4 py-2.5">
          {[
            ["all", "Everyone"],
            ["filed", "Filed"],
            ["far", "Away from unit"],
            ["silent", "Not reported"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={cn(
                "rounded-full px-3.5 py-2 text-[0.8125rem] font-semibold transition-colors",
                filter === value ? "bg-white text-ink-950" : "text-white/55 hover:bg-white/10"
              )}
            >
              {label}
            </button>
          ))}
          <span className="figure ml-auto text-[0.75rem] text-white/45">
            {shown.length} of {coordinators.length}
          </span>
        </div>

        <div className="relative min-h-0 flex-1 p-1.5">
          <svg
            viewBox={`0 0 ${shapes.width} ${shapes.height}`}
            className="h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`${coordinators.length} polling unit coordinators. ${summary.located} have reported a position. The same list appears beside this map.`}
            onPointerLeave={() => setHovered(null)}
          >
            <defs>
              <pattern id="watch-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={shapes.width} height={shapes.height} fill="url(#watch-grid)" />

            {/* The country, recessive but not invisible.
                ── IT USED TO DISAPPEAR ────────────────────────────────────
                Filled slate and stroked in the board's own colour, the land
                and the background were within a shade of each other: the map
                read as one dark rectangle with dots floating on it, and a dot
                near a border told you nothing about which state it was in.
                Recessive means quiet, not absent, the backdrop still has to
                say where Nigeria is and where one state stops.

                So the edges are white. They are the only thing separating the
                land from the ground behind it, and at this weight they read
                across a room without competing with the markers, which are
                the data. */}
            {shapes.states.map((shape) => (
              <path
                key={shape.code}
                d={shape.d}
                fill="var(--color-silent)"
                stroke="rgba(255,255,255,0.55)"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            ))}

            {plotted.map((row) => (
              <g key={row.id} onPointerEnter={() => setHovered(row.id)}>
                {/* A position that has just arrived rings out from where it
                    landed, so the map shows the count moving rather than a
                    still photograph of it. Only a real fix does this, a
                    placeholder has nothing to be fresh about. */}
                {row.fresh && !row.derived && (
                  <circle
                    cx={row.x}
                    cy={row.y}
                    r="9"
                    fill="none"
                    stroke={TONE[row.band]}
                    strokeWidth="1.5"
                    opacity="0.55"
                  >
                    <animate attributeName="r" from="5" to="14" dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.55" to="0" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                )}

                {row.band === "far" && (
                  <circle cx={row.x} cy={row.y} r="10" fill="none" stroke={TONE.far} strokeWidth="1.5" opacity="0.5">
                    <animate attributeName="r" from="6" to="16" dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.6" to="0" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  cx={row.x}
                  cy={row.y}
                  r={hovered === row.id ? 7 : 5}
                  fill={row.derived ? "none" : TONE[row.band]}
                  stroke={row.derived ? "rgba(255,255,255,0.35)" : "#ffffff"}
                  strokeWidth={row.derived ? 1.5 : 1.2}
                  strokeDasharray={row.derived ? "2 2" : undefined}
                  className="cursor-pointer transition-all"
                >
                  {/* One string: adjacent text nodes inside a <title> are
                      merged by the DOM and never match what React rendered. */}
                  <title>{`${row.unitCode}, ${BANDS[row.band].label}`}</title>
                </circle>
              </g>
            ))}
          </svg>

          {active && (
            <div className="pointer-events-none absolute top-3 left-3 rounded-dash-sm border border-white/20 bg-ink-950/95 px-3.5 py-2.5 backdrop-blur">
              <p className="figure text-[0.8125rem] font-bold text-white">{active.unitCode}</p>
              <p className="mt-0.5 text-[0.75rem] text-white/60">{active.name}</p>
              <p className="figure mt-1 text-[0.75rem] text-white/45">
                {active.derived
                  ? "No position reported"
                  : `${active.lat.toFixed(4)}, ${active.lon.toFixed(4)}${
                      active.accuracy ? ` · ±${Math.round(active.accuracy)}m` : ""
                    }`}
              </p>
              {/* When, not just where. A coordinate with no time on it is the
                  one thing this panel must never show: it would read as "now". */}
              {active.at && (
                <p className="figure mt-0.5 text-[0.75rem] text-white/45">{ago(active.at)}</p>
              )}
              <p className="tag mt-1.5 text-white/70">{BANDS[active.band].label}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-board-line px-4 py-2.5">
          {[
            ["Coordinators", summary.total],
            ["Filed", summary.filed],
            ["Located", summary.located],
            ["Away from unit", summary.far],
            ["Not reported", summary.silent],
          ].map(([label, value]) => (
            <span key={label} className="flex items-baseline gap-2">
              <span className="text-[0.5625rem] font-semibold tracking-[0.14em] text-white/35 uppercase">
                {label}
              </span>
              <span className="figure text-[0.75rem] font-bold text-white tabular-nums">
                {formatNumber(value)}
              </span>
            </span>
          ))}
          <span className="figure ml-auto text-[0.625rem] text-white/35">
            One fix per filing · no background tracking
          </span>
        </div>
      </div>

      {/* -------------------------------------------------------- the list */}
      <section className="flex min-h-0 flex-col rounded-dash border border-dash-line bg-dash-card">
        <header className="flex items-baseline justify-between gap-3 border-b border-dash-line px-4 py-3">
          <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">Coordinators</h3>
          <span className="figure text-[0.6875rem] text-dash-muted">{shown.length}</span>
        </header>

        {shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-[0.875rem] leading-relaxed text-dash-muted">
            No coordinators match this filter. Accounts are created by an administrator and tied to
            one polling unit each.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-dash-line overflow-y-auto">
            {shown.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHovered(row.id)}
                  onMouseLeave={() => setHovered(null)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors",
                    hovered === row.id ? "bg-dash-bg" : "hover:bg-dash-bg"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn("size-2.5 shrink-0 rounded-full", row.derived && "border border-dash-line")}
                    style={{ background: row.derived ? "transparent" : TONE[row.band] }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="figure block truncate text-[0.8125rem] font-bold text-dash-ink">
                      {row.unitCode}
                    </span>
                    <span className="block truncate text-[0.6875rem] text-dash-muted">{row.name}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[0.6875rem] font-semibold text-dash-muted">
                      {BANDS[row.band].label}
                    </span>
                    {row.distance != null && (
                      <span className="figure block text-[0.625rem] text-dash-muted">
                        {Math.round(row.distance)}m
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** How long ago a fix came in, in words a room reads at a glance. */
function ago(value) {
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  const minutes = Math.round((Date.now() - at.getTime()) / 60000);
  if (minutes < 1) return "Reported just now";
  if (minutes < 60) return `Reported ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `Reported ${hours} hour${hours === 1 ? "" : "s"} ago`;
}
