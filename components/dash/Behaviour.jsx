"use client";

import { useMemo, useState } from "react";
import { ChevronRight, TrendingDown, Users, Vote } from "lucide-react";

import { PARTY_FILL } from "./Charts";
import {
  ELECTIONS,
  GAPS,
  MAPPABLE,
  effectiveParties,
  findings,
  recentContests,
  sharesOf,
  stateHistories,
  turnoutSeries,
  volatilitySeries,
  zoneSeries,
} from "@/lib/behaviour";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * How Nigerians have voted since 1999, and how that has changed.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FINDING THIS SCREEN EXISTS TO PUT IN FRONT OF SOMEBODY
 *
 *  Turnout at the 2003 presidential election was 69.1%. In 2023 it was 26.9%.
 *  Over the same period the register grew by 54% and the number of votes
 *  actually cast fell by 43%. Sixty-five million registered Nigerians did not
 *  vote in 2023 — more than twice the number who did.
 *
 *  Every campaign in this product's audience plans around persuading voters
 *  away from another party. The record says the single largest pool in the
 *  country, by a factor of two, is people who are registered and do not turn
 *  up, and that pool has grown at every election but one since 2003.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT IS DRAWN AND WHAT IS REFUSED ──────────────────────────────────────
 * Every figure on this screen is a declared result. Nothing is modelled,
 * projected or filled in. Two elections have no state-level breakdown in the
 * record — 2007 and 2011 — so the charts include them and the map skips them,
 * and both say so on their face rather than drawing a smooth line through a
 * hole. See lib/behaviour.js.
 */

/* ── COLOURS FOR PARTIES THAT NO LONGER EXIST ──────────────────────────────
   lib/party-register.js is the register of parties this product can name on a
   ballot today, and none of these are on one: the AD–APP alliance, the ANPP,
   the ACN and the CPC all ended before 2015, three of them by merging into the
   APC. They still carried states, so they still need a fill, and putting them
   in the register would claim an agent could file a return for them.

   Successor hues deliberately: the CPC and the ACN are drawn near the APC they
   became, so the 2015 merger reads on the map as parties converging rather
   than as an unexplained change of palette. */
const HISTORIC_FILL = {
  "AD-APP": "var(--color-adc-l)",
  ANPP: "oklch(58% 0.13 250)",
  ACN: "oklch(56% 0.14 230)",
  CPC: "oklch(50% 0.13 245)",
  AC: "oklch(62% 0.10 235)",
  PCP: "oklch(60% 0.08 300)",
  AAC: "oklch(58% 0.11 20)",
};

const fillFor = (id) => PARTY_FILL[id] ?? HISTORIC_FILL[id] ?? "var(--color-party-other-l)";

export default function Behaviour({ shapes }) {
  const series = useMemo(() => turnoutSeries(), []);
  const swings = useMemo(() => volatilitySeries(), []);
  const states = useMemo(() => stateHistories(), []);
  const zones = useMemo(() => zoneSeries(), []);
  const recent = useMemo(() => recentContests(), []);
  const found = useMemo(() => findings(), []);

  /* Which election the map is showing. Only the five with a state-level
     breakdown can be drawn, and the scrubber offers only those, so there is
     no way to land on a year the map would have to draw empty. */
  const [year, setYear] = useState(MAPPABLE[MAPPABLE.length - 1].year);
  const [hovered, setHovered] = useState(null);

  const shown = useMemo(() => MAPPABLE.find((item) => item.year === year), [year]);

  const winners = useMemo(() => {
    const map = new Map();
    for (const row of shown.rows) {
      const ranked = Object.entries(row.votes)
        .filter(([id]) => id !== "OTH")
        .sort((a, b) => b[1] - a[1]);
      if (!ranked.length) continue;
      map.set(row.code, {
        id: ranked[0][0],
        share: (ranked[0][1] / (row.total || 1)) * 100,
        margin: ranked.length > 1 ? ((ranked[0][1] - ranked[1][1]) / (row.total || 1)) * 100 : 100,
        total: row.total,
      });
    }
    return map;
  }, [shown]);

  const standings = useMemo(() => sharesOf(shown), [shown]);
  const hoveredState = hovered ? states.find((item) => item.code === hovered) : null;

  return (
    <div className="space-y-3">
      {/* ─────────────────────────────────────────────────── the finding */}
      <section className="rounded-dash border border-dash-line bg-dash-card p-5">
        <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
          Twenty-seven years of declared results
        </p>
        <h2 className="mt-2 font-display text-[1.5rem] leading-tight font-extrabold tracking-[-0.02em] text-dash-ink sm:text-[1.75rem]">
          Turnout has fallen by {found.turnoutFall.points.toFixed(1)} points since{" "}
          {found.turnoutFall.from.year}. The register grew{" "}
          {found.registerGrowth.share.toFixed(0)}% while the votes cast in it fell{" "}
          {found.votesFall.share.toFixed(0)}%.
        </h2>
        <p className="mt-3 max-w-3xl text-[0.9375rem] leading-relaxed text-dash-muted">
          {formatNumber(found.stayedHome)} registered Nigerians did not vote in{" "}
          {found.turnoutFall.to.year} — more than twice the{" "}
          {formatNumber(found.turnoutFall.to.cast)} who did. That is the largest single bloc in
          Nigerian politics, and it is not a party.
        </p>
      </section>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={TrendingDown}
          label="Turnout now"
          value={formatShare(series[series.length - 1].turnout)}
          foot={`${formatShare(found.turnoutFall.from.turnout)} at its peak in ${found.turnoutFall.from.year}`}
        />
        <Stat
          icon={Users}
          label="Stayed home"
          value={formatNumber(found.stayedHome)}
          foot={`of ${formatNumber(series[series.length - 1].registered)} registered`}
          tone="red"
        />
        <Stat
          icon={Vote}
          label="Votes cast"
          value={formatNumber(series[series.length - 1].cast)}
          foot={`down ${found.votesFall.share.toFixed(0)}% from ${found.turnoutFall.from.year}`}
        />
        <Stat
          label="Parties in play"
          value={effectiveParties(ELECTIONS[ELECTIONS.length - 1]).toFixed(2)}
          foot="Effective parties, 2023 — every earlier election was near 2"
        />
      </div>

      {/* ───────────────────────────────────────────── the scissors chart */}
      <Panel
        title="The register and the vote"
        note="Two lines that used to move together. Everybody entitled to vote, against everybody who did."
      >
        <Scissors series={series} />
      </Panel>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
        {/* ──────────────────────────────────────────────── the map, by year */}
        <div className="on-board flex min-h-[34rem] flex-col overflow-hidden rounded-dash border border-board-line bg-board xl:sticky xl:top-[calc(var(--dash-top,4.5rem)+0.75rem)] xl:h-[calc(100vh-var(--dash-top,4.5rem)-1.5rem)] xl:min-h-0">
          <nav className="flex flex-wrap items-center gap-1 border-b border-board-line px-4 py-2.5">
            <span className="px-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-white/40 uppercase">
              Who carried each state
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {MAPPABLE.map((item) => (
                <button
                  key={item.year}
                  type="button"
                  onClick={() => setYear(item.year)}
                  aria-pressed={item.year === year}
                  className={cn(
                    "figure rounded-full px-2.5 py-1 text-[0.75rem] font-bold transition-colors",
                    item.year === year
                      ? "bg-white text-ink-950"
                      : "text-white/50 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {item.year}
                </button>
              ))}
            </div>
          </nav>

          <div className="relative min-h-0 flex-1 p-2">
            <svg
              viewBox={`0 0 ${shapes.width} ${shapes.height}`}
              className="h-full w-full"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`Who carried each state at the ${year} presidential election. The same figures are listed beside this map.`}
              onPointerLeave={() => setHovered(null)}
            >
              {shapes.states.map((shape) => {
                const held = winners.get(shape.code);
                const active = hovered === shape.code;
                return (
                  <path
                    key={shape.code}
                    d={shape.d}
                    fill={held ? fillFor(held.id) : "var(--color-silent)"}
                    /* Lighter where it was close, solid where it was not: the
                       margin is the fact a planner acts on, and a flat fill
                       makes a four-point state look like a sixty-point one. */
                    fillOpacity={held ? 0.45 + Math.min(0.55, held.margin / 60) : 1}
                    stroke={active ? "#ffffff" : "var(--color-board)"}
                    strokeWidth={active ? 2.2 : 0.9}
                    strokeLinejoin="round"
                    className="cursor-pointer"
                    onPointerEnter={() => setHovered(shape.code)}
                  />
                );
              })}
            </svg>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-board-line px-4 py-2.5">
            {standings.slice(0, 5).map((party) => (
              <span key={party.id} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: fillFor(party.id) }}
                />
                <span className="figure text-[0.6875rem] font-bold text-white">{party.id}</span>
                <span className="figure text-[0.625rem] text-white/45">
                  {formatShare(party.share)}
                </span>
              </span>
            ))}
            <span className="figure ml-auto text-[0.625rem] text-white/40">
              {hoveredState
                ? `${hoveredState.name} · ${hoveredState.run.map((r) => `${r.year} ${r.winner}`).join("  ")}`
                : `${shown.rows.length} states · turnout ${formatShare(shown.turnout)}`}
            </span>
          </div>
        </div>

        {/* ───────────────────────────────────────────── the reading column */}
        <div className="flex flex-col gap-3">
          <Panel
            title="How much of the vote moved"
            note="Half the sum of every party's change in share: the percentage of the electorate that switched."
          >
            <ul className="space-y-2.5">
              {swings.map((swing) => (
                <li key={`${swing.from}-${swing.to}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="figure text-[0.8125rem] font-semibold text-dash-ink">
                      {swing.from} <ChevronRight size={11} className="inline text-dash-muted" />{" "}
                      {swing.to}
                    </span>
                    <span className="figure text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                      {formatShare(swing.volatility)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-dash-bg">
                    <div
                      className="h-full rounded-full bg-dash-ink"
                      style={{ width: `${Math.min(100, swing.volatility * 1.6)}%` }}
                    />
                  </div>
                  {swing.merged && (
                    <p className="mt-1 text-[0.625rem] leading-relaxed text-amber-700">
                      {swing.merged}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="The zones" note="Who each geopolitical zone carried, election by election.">
            <ul className="space-y-2">
              {zones.map((zone) => (
                <li key={zone.zone} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 truncate text-[0.75rem] font-semibold text-dash-ink">
                    {zone.zone}
                  </span>
                  <span className="flex flex-1 gap-1">
                    {zone.run.map((step) => (
                      <span
                        key={step.year}
                        title={`${step.year}: ${step.winner} ${step.share.toFixed(1)}%`}
                        className="flex h-6 flex-1 items-center justify-center rounded-[3px] text-[0.5625rem] font-bold text-white"
                        style={{ background: fillFor(step.winner) }}
                      >
                        {step.winner}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[0.625rem] leading-relaxed text-dash-muted">
              {MAPPABLE.map((item) => item.year).join(" · ")}, left to right.
            </p>
          </Panel>

          <Panel
            title="Since the presidential"
            note="Every governorship declared between 2023 and now. A different contest, kept apart from the line above."
          >
            <ul className="divide-y divide-dash-line">
              {recent.map((row) => (
                <li key={`${row.code}-${row.on}`} className="flex items-center gap-2.5 py-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: fillFor(row.winner) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-semibold text-dash-ink">
                      {row.state}
                      <span className="ml-1.5 text-[0.6875rem] font-normal text-dash-muted">
                        {row.on}
                      </span>
                    </span>
                    <span className="block truncate text-[0.6875rem] text-dash-muted">
                      {row.candidate}
                      {row.partialBallot && " · leading candidates only"}
                      {row.unverified && " · unverified total"}
                    </span>
                  </span>
                  <span className="figure shrink-0 text-[0.75rem] font-bold text-dash-ink">
                    {row.winner}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {/* ────────────────────────────────────────────── every state's run */}
      <Panel
        title="Every state, every election"
        note="Who carried it each time the record can say. Three states have never changed hands."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] table-fixed border-collapse">
            {/* Fixed, and the widths declared: left to itself the state column
                took every spare pixel on a wide screen and pushed five year
                columns into the right-hand third of the table. */}
            <colgroup>
              <col style={{ width: "18%" }} />
              {MAPPABLE.map((item) => (
                <col key={item.year} style={{ width: `${68 / MAPPABLE.length}%` }} />
              ))}
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 bg-dash-card py-1.5 pr-3 text-left text-[0.625rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                  State
                </th>
                {MAPPABLE.map((item) => (
                  <th
                    key={item.year}
                    className="figure px-1 py-1.5 text-[0.625rem] font-semibold text-dash-muted"
                  >
                    {item.year}
                  </th>
                ))}
                <th className="py-1.5 pl-3 text-right text-[0.625rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                  Changes
                </th>
              </tr>
            </thead>
            <tbody>
              {states.map((state) => (
                <tr
                  key={state.code}
                  onMouseEnter={() => setHovered(state.code)}
                  onMouseLeave={() => setHovered(null)}
                  className={cn(
                    "border-t border-dash-line",
                    hovered === state.code && "bg-dash-bg"
                  )}
                >
                  <td className="sticky left-0 bg-inherit py-1 pr-3 text-[0.75rem] font-semibold text-dash-ink">
                    {state.name}
                  </td>
                  {state.run.map((step) => (
                    <td key={step.year} className="px-1 py-1">
                      <span
                        title={`${step.year}: ${step.winner} by ${step.margin.toFixed(1)} points`}
                        className="flex h-5 items-center justify-center rounded-[3px] text-[0.5625rem] font-bold text-white"
                        style={{
                          background: fillFor(step.winner),
                          opacity: 0.5 + Math.min(0.5, step.margin / 60),
                        }}
                      >
                        {step.winner}
                      </span>
                    </td>
                  ))}
                  <td className="py-1 pl-3 text-right">
                    <span
                      className={cn(
                        "figure text-[0.75rem] font-bold",
                        state.loyal ? "text-dash-muted" : "text-dash-ink"
                      )}
                    >
                      {state.loyal ? "never" : state.changes.length}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ─────────────────────────────────────────────────────── the gaps */}
      <section className="rounded-dash border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-amber-900 uppercase">
          What this record does not contain
        </p>
        <ul className="mt-2 space-y-1.5">
          {GAPS.map((gap) => (
            <li key={gap.year} className="text-[0.8125rem] leading-relaxed text-amber-900">
              <span className="font-bold">{gap.year}</span> has {gap.has} and not {gap.missing}.{" "}
              {gap.why} It is on every chart here and on none of the maps.
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[0.75rem] leading-relaxed text-amber-900/80">
          Nothing on this screen is modelled or filled in. Where a figure could not be computed
          from a declared result it is absent, and its absence is named rather than smoothed.
        </p>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The register against the votes cast, on one pair of axes.
 *
 * ── WHY BOTH LINES AND NOT THE PERCENTAGE ──────────────────────────────────
 * Turnout is a ratio and a falling ratio has two possible causes that call for
 * opposite responses: fewer people voting, or more people registered. Here it
 * is both, and the gap between the two lines — everybody registered who did
 * not vote — is the quantity this whole screen is about. A percentage hides
 * it; two lines and the space between them is the finding.
 */
function Scissors({ series }) {
  const W = 1000;
  const H = 320;
  const PAD = { top: 20, right: 20, bottom: 34, left: 64 };

  const top = Math.max(...series.map((row) => row.registered)) * 1.05;
  const x = (index) => PAD.left + (index * (W - PAD.left - PAD.right)) / (series.length - 1);
  const y = (value) => H - PAD.bottom - (value / top) * (H - PAD.top - PAD.bottom);

  const line = (pick) => series.map((row, index) => `${x(index)},${y(pick(row))}`).join(" ");

  const band = [
    ...series.map((row, index) => `${x(index)},${y(row.registered)}`),
    ...[...series].reverse().map((row, index) => `${x(series.length - 1 - index)},${y(row.cast)}`),
  ].join(" ");

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[30rem]" role="img"
        aria-label="The register and the votes cast at every presidential election from 1999 to 2023. The two lines diverge steadily: the register rises while the votes cast fall.">
        {[0, 0.25, 0.5, 0.75, 1].map((step) => (
          <g key={step}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(top * step)}
              y2={y(top * step)}
              stroke="var(--color-dash-line)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(top * step) + 4}
              textAnchor="end"
              className="figure"
              style={{ fontSize: 15, fill: "var(--color-dash-muted)" }}
            >
              {Math.round((top * step) / 1_000_000)}m
            </text>
          </g>
        ))}

        {/* The people who did not vote, drawn as the space they actually are. */}
        <polygon points={band} fill="var(--color-red-500)" fillOpacity={0.08} />

        <polyline points={line((row) => row.registered)} fill="none" stroke="var(--color-dash-ink)" strokeWidth={3} />
        <polyline points={line((row) => row.cast)} fill="none" stroke="var(--color-red-500)" strokeWidth={3} />

        {series.map((row, index) => (
          <g key={row.year}>
            <circle cx={x(index)} cy={y(row.registered)} r={5} fill="var(--color-dash-ink)" />
            <circle cx={x(index)} cy={y(row.cast)} r={5} fill="var(--color-red-500)" />
            <text
              x={x(index)}
              y={H - 12}
              textAnchor="middle"
              className="figure"
              style={{ fontSize: 15, fill: "var(--color-dash-muted)" }}
            >
              {row.year}
            </text>
            {/* Above the point, not below it: below, 1999's label sat on top
                of the axis scale in the corner. */}
            <text
              x={x(index)}
              y={y(row.cast) - 14}
              textAnchor="middle"
              className="figure"
              style={{ fontSize: 15, fontWeight: 700, fill: "var(--color-red-500)" }}
            >
              {row.turnout.toFixed(0)}%
            </text>
          </g>
        ))}

        <text x={PAD.left} y={14} style={{ fontSize: 15, fontWeight: 700, fill: "var(--color-dash-ink)" }}>
          Registered
        </text>
        <text x={PAD.left + 96} y={14} style={{ fontSize: 15, fontWeight: 700, fill: "var(--color-red-500)" }}>
          Voted
        </text>
      </svg>
    </div>
  );
}

function Panel({ title, note, children }) {
  return (
    <section className="rounded-dash border border-dash-line bg-dash-card">
      <header className="border-b border-dash-line px-4 py-3">
        <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">{title}</h3>
        {note && <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-dash-muted">{note}</p>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Stat({ icon: Icon, label, value, foot, tone }) {
  return (
    <div className="rounded-dash border border-dash-line bg-dash-card px-4 py-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={14} strokeWidth={2.25} className="shrink-0 text-dash-muted" />}
        <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "figure mt-1.5 text-[1.5rem] leading-none font-bold tracking-[-0.02em]",
          tone === "red" ? "text-red-600" : "text-dash-ink"
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-dash-muted">{foot}</p>
    </div>
  );
}
