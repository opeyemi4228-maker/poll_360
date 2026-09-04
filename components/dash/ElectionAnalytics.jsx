"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  Compass,
  LineChart,
  TrendingUp,
  Users,
} from "lucide-react";

import Executive from "./Executive";
import PartyStrength from "./PartyStrength";
import RulingParty from "./RulingParty";
import { PARTY_FILL } from "./Charts";
import { Columns, Gauge, MiniMap, Panel, Ranked, Readout, Split } from "./Figures";
import { CLASS_OF, CLASSES } from "@/lib/executive";
import {
  COMPETITIVE,
  TIMELINE,
  TRENDS,
  compare,
  partyRecord,
  span,
  stateTrends,
  turnoutByState,
  turnoutRecord,
} from "@/lib/record";
import { MAPPABLE } from "@/lib/behaviour";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * Election Analytics: one dashboard, six questions.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY SEVEN TABS BECAME ONE
 *
 *  The analytics head held seven surfaces — the brief, party ground, the
 *  ruling party, clusters, trends, the projection, the sample — and they were
 *  seven answers to one question asked seven ways. Worse, they were seven
 *  *entry points*, so a person wanting to know how a state has behaved since
 *  1999 had to guess which of the seven the answer was on, and the guess was
 *  wrong about half the time.
 *
 *  One dashboard, six tabs, in the order the questions are actually asked:
 *
 *    Overview     where we stand, in twelve figures
 *    Geography    where, on a map, with the ground classified
 *    Turnout      who came out, and who stopped coming
 *    Candidates   the parties, their runs, and who holds what now
 *    Historical   any two elections held against each other
 *    Trends       what has been moving, and in which direction
 *
 *  Planning is deliberately NOT here. "Where should we focus" is a different
 *  job with a different reader and a different output — a plan somebody is
 *  going to be asked to pay for — and mixing it into analysis is how a
 *  finding becomes a commitment nobody costed. See StrategicPlanning.jsx.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── 1999 TO THE LAST ELECTION HELD, AND THE JOIN BETWEEN THEM ──────────────
 * The record runs from the 1999 presidential to the Osun governorship of
 * August 2026, and it is two series rather than one: seven presidential
 * elections, and the off-cycle governorships that run underneath them on
 * their own cycle. Every screen here keeps them apart, because a presidential
 * share and a governorship share are two different offices on two different
 * ballots and subtracting one from the other produces a confident sentence
 * about a swing that never happened. See lib/record.js.
 */

const TABS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "geography", label: "Geography", icon: Compass },
  { id: "turnout", label: "Turnout", icon: Users },
  { id: "candidates", label: "Candidates", icon: LineChart },
  { id: "historical", label: "Historical", icon: CalendarRange },
  { id: "trends", label: "Trends", icon: TrendingUp },
];

/** One hue getting darker, for the trend grades, which have an order. */
const TREND_FILL = {
  STRONGHOLD: "var(--color-ink-900)",
  GROWING: "var(--color-ink-700)",
  DECLINING: "var(--color-ink-400)",
  SWING: "var(--color-amber-500)",
  EMERGING: "var(--color-class-opportunity)",
};

export default function ElectionAnalytics({
  /* The brief and its assumptions, from `useBrief` — the same computation the
     map is coloured by, so the Overview and Geography tabs cannot disagree. */
  brief: briefState,
  slots = [],
  place = "Nigeria",
  shapes = null,
  territory = null,
  ground = null,
  /* Who governs each state, and how they got there — built in the room, which
     is the only place that reads lib/governors.js. */
  governing = null,
  onOpen,
  onGo,
  pathOf,
}) {
  const [tab, setTab] = useState("overview");

  return (
    <div className="flex flex-col gap-3">
      {/* ── SIX TABS, NOT A DROPDOWN ───────────────────────────────────────
          Every one of these is somewhere a person arrives wanting to be, and
          a destination behind a menu is a destination that stops being used.
          The same argument the room's own tab bar makes one level up. */}
      <div
        role="tablist"
        aria-label="Election analytics"
        className="flex flex-wrap gap-1 rounded-dash border border-dash-line bg-dash-card p-1"
      >
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-dash-sm px-3 py-2 text-[0.8125rem] font-bold whitespace-nowrap transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                active ? "bg-dash-ink text-white" : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
              )}
            >
              <item.icon size={15} strokeWidth={2.25} />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <Executive
          state={briefState}
          slots={slots}
          place={place}
          onOpen={onOpen}
          onGo={onGo}
          pathOf={pathOf}
        />
      )}

      {tab === "geography" && (
        <Geography brief={briefState.brief} forParty={briefState.forParty} shapes={shapes} place={place} onOpen={onOpen} />
      )}

      {tab === "turnout" && <Turnout shapes={shapes} />}

      {tab === "candidates" && (
        <Candidates shapes={shapes} territory={territory} ground={ground} governing={governing} />
      )}

      {tab === "historical" && <Historical shapes={shapes} />}

      {tab === "trends" && <Trends shapes={shapes} onOpen={onOpen} />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ geography */

/**
 * Where, classified, for whoever the brief is written for.
 *
 * The same five classes the room's map draws, out of the same call — see
 * lib/executive.js. This is the map at whatever tier the room is standing on,
 * so drilling into a state re-classifies that state's local governments.
 */
function Geography({ brief, forParty, shapes, place, onOpen }) {
  const fills = useMemo(() => {
    const index = {};
    for (const row of brief.places) {
      if (!row.code) continue;
      index[row.code] = CLASS_OF[row.class]?.fill ?? "var(--color-silent)";
    }
    return index;
  }, [brief]);

  const notes = useMemo(() => {
    const index = {};
    for (const row of brief.places) {
      if (!row.code) continue;
      index[row.code] =
        row.margin === null
          ? CLASS_OF[row.class]?.label
          : `${CLASS_OF[row.class]?.label}, ${row.margin >= 0 ? "ahead" : "behind"} by ${formatShare(Math.abs(row.margin))}`;
    }
    return index;
  }, [brief]);

  const drawable = Object.keys(fills).length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dash-line px-5 py-3.5">
            <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
              {place}, classified for {forParty ?? "this campaign"}
            </h2>
            <p className="text-[0.8125rem] text-dash-muted">
              {formatNumber(brief.reporting.places)} place
              {brief.reporting.places === 1 ? "" : "s"}
            </p>
          </header>

          <div className="px-4 py-3">
            {shapes && drawable ? (
              <MiniMap shapes={shapes} fills={fills} notes={notes} height={340} />
            ) : (
              /* Below a state there are no shapes to draw — the boundary files
                 stop at local governments — so the tier is a list. Saying so
                 is better than an empty frame that reads as a broken map. */
              <p className="px-4 py-12 text-center text-[0.875rem] leading-relaxed text-dash-muted">
                {shapes
                  ? "No outline is published at this tier, so the places below are a list rather than a map. The classification is the same either way."
                  : "No map for this contest."}
              </p>
            )}
          </div>

          <footer className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-dash-line px-5 py-3">
            {CLASSES.map((item) => (
              <span key={item.id} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{ background: item.fill }}
                />
                <span className="text-[0.75rem] text-dash-muted">{item.label}</span>
                <span className="figure text-[0.75rem] font-bold text-dash-ink tabular-nums">
                  {brief.counts[item.id]}
                </span>
              </span>
            ))}
          </footer>
        </section>

        <div className="flex flex-col gap-3">
          <Panel
            title="The ground"
            figure={`${formatNumber(brief.reporting.places)} places`}
            foot={`Held by more than ${brief.bounds.commanding} points is a stronghold; inside ${brief.bounds.competitive} either way is a contest.`}
          >
            <Split
              segments={CLASSES.filter((item) => brief.counts[item.id] > 0).map((item) => ({
                id: item.id,
                label: item.label,
                value: brief.counts[item.id],
                color: item.fill,
              }))}
              total={brief.reporting.places}
            />
          </Panel>

          <Panel title="Closest first" figure={`${brief.battlegrounds.length}`} foot="These decide the result.">
            <Ranked
              rows={brief.battlegrounds.slice(0, 8).map((row) => ({
                id: row.key,
                label: row.name,
                value: Math.round(Math.abs(row.margin ?? 0) * 10) / 10,
              }))}
              showShare={false}
              empty="Nothing on screen is inside the competitive margin."
            />
          </Panel>
        </div>
      </div>

      <Panel title={`Every place in ${place}`} figure={`${formatNumber(brief.places.length)}`}>
        <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
          {brief.places.map((row) => (
            <li key={row.key}>
              <Readout
                label={`${CLASS_OF[row.class]?.dot ?? ""} ${row.name}`}
                value={
                  row.margin === null
                    ? "—"
                    : `${row.margin > 0 ? "+" : "−"}${formatShare(Math.abs(row.margin))}`
                }
                sub={row.turnout === null ? undefined : formatShare(row.turnout)}
                onClick={onOpen ? () => onOpen(row) : undefined}
              />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ turnout */

/**
 * Who came out, and who stopped coming.
 *
 * ── THE ONE FINDING THIS TAB EXISTS FOR ────────────────────────────────────
 * Turnout in Nigerian presidential elections has fallen from 69% in 2003 to
 * 27% in 2023. That is not a statistic about an electorate; it is the largest
 * single fact in this entire dataset, and every projection, every target and
 * every "we need X votes" on any other screen is downstream of it.
 */
function Turnout({ shapes }) {
  const record = useMemo(() => turnoutRecord(), []);
  const byState = useMemo(() => turnoutByState(), []);

  const fills = useMemo(() => {
    const index = {};
    for (const row of byState) {
      index[row.code] =
        row.turnout >= 35
          ? "var(--color-ink-900)"
          : row.turnout >= 28
            ? "var(--color-ink-700)"
            : row.turnout >= 22
              ? "var(--color-ink-500)"
              : "var(--color-amber-500)";
    }
    return index;
  }, [byState]);

  const notes = useMemo(
    () =>
      Object.fromEntries(
        byState.map((row) => [row.code, `${formatShare(row.turnout)} · ${formatNumber(row.stayedHome)} stayed home`])
      ),
    [byState]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Panel
          title="The last election"
          figure={`${record.last.year}`}
          foot={`${formatNumber(record.last.stayedHome)} people on the register did not vote`}
        >
          <Gauge
            share={record.last.turnout}
            figure={formatShare(record.last.turnout)}
            sub="of the register voted"
            tone={record.last.turnout < 35 ? "warn" : "ink"}
          />
        </Panel>

        <Panel
          title="Turnout at every presidential election"
          figure={`−${formatShare(record.fall.points)} from the ${record.peak.year} peak`}
          foot={
            record.withoutTurnout.length
              ? `${record.withoutTurnout.length} governorship${record.withoutTurnout.length === 1 ? "" : "s"} in the record carry no register, so they are not on this chart: ${record.withoutTurnout.join(", ")}.`
              : null
          }
        >
          <Columns
            points={record.points.map((point) => ({
              id: point.id,
              label: String(point.year),
              value: Math.round(point.turnout * 10) / 10,
            }))}
            height={140}
            tone={"ink"}
          />
          <p className="mt-2 flex flex-wrap justify-between gap-x-4 text-[0.6875rem] text-dash-muted">
            {record.points.map((point) => (
              <span key={point.id} className="figure tabular-nums">
                {point.year}
              </span>
            ))}
          </p>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dash-line px-5 py-3.5">
            <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
              Turnout by state, {record.last.year}
            </h2>
            <p className="text-[0.8125rem] text-dash-muted">Amber is under 22%</p>
          </header>
          <div className="px-4 py-3">
            {shapes ? (
              <MiniMap shapes={shapes} fills={fills} notes={notes} height={320} />
            ) : (
              <p className="px-4 py-12 text-center text-[0.875rem] text-dash-muted">No map for this contest.</p>
            )}
          </div>
        </section>

        <Panel
          title="Where the votes are sitting"
          figure={formatNumber(byState.reduce((sum, row) => sum + row.stayedHome, 0))}
          foot="Registered voters who did not vote, biggest first. Ranked by people rather than by rate: a rate finds small states, and a campaign wants the votes."
        >
          <Ranked
            rows={byState.slice(0, 10).map((row) => ({
              id: row.code,
              label: row.name,
              value: row.stayedHome,
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ candidates */

/**
 * The parties: their runs, and who holds what now.
 *
 * ── A PARTY WITH NO PRESIDENTIAL RUN HAS NO NATIONAL SHARE ─────────────────
 * Accord has held Osun since August 2026 and has never stood a presidential
 * candidate in this record. Drawing it at 0% would put it at the bottom of a
 * ranking as though it had contested and lost. It has a governorship and no
 * national share, and those are two different facts.
 */
function Candidates({ shapes, territory, ground, governing }) {
  const record = useMemo(() => partyRecord(), []);
  const contested = record.filter((party) => party.latest !== null);
  const seatsOnly = record.filter((party) => party.latest === null && party.governorships.length);
  const [half, setHalf] = useState("record");

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title="Presidential share, most recent"
          figure={`${contested.length} parties`}
          foot="Share of the valid vote at the last presidential election."
        >
          <Split
            segments={contested.slice(0, 5).map((party) => ({
              id: party.id,
              label: party.id,
              value: Math.round(party.latest * 10),
              color: PARTY_FILL[party.id] ?? "var(--color-party-other)",
            }))}
          />
          <ul className="mt-4 space-y-0.5">
            {contested.slice(0, 6).map((party) => (
              <li key={party.id}>
                <Readout
                  label={party.name}
                  value={formatShare(party.latest)}
                  sub={
                    party.drift === null
                      ? `${party.elections} election${party.elections === 1 ? "" : "s"}`
                      : `${party.drift > 0 ? "+" : "−"}${formatShare(Math.abs(party.drift))} since ${party.run[0].year}`
                  }
                />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Governorships in the record"
          figure={`${TIMELINE.filter((row) => row.kind === "GOVERNORSHIP").length} contests`}
          foot="Off-cycle governorships, November 2023 to the most recent. Counted apart from the presidential shares beside them: different office, different ballot."
        >
          <ul className="space-y-0.5">
            {TIMELINE.filter((row) => row.kind === "GOVERNORSHIP")
              .slice()
              .reverse()
              .map((row) => (
                <li key={row.id}>
                  <Readout
                    label={`${row.place} ${row.year}`}
                    value={row.winner}
                    sub={row.candidate}
                  />
                </li>
              ))}
          </ul>

          {seatsOnly.length > 0 && (
            <p className="mt-3 border-t border-dash-line pt-2.5 text-[0.75rem] leading-relaxed text-dash-muted">
              <strong className="text-dash-ink">
                {seatsOnly.map((party) => party.name).join(", ")}
              </strong>{" "}
              {seatsOnly.length === 1 ? "holds a state" : "hold states"} and has never stood a
              presidential candidate in this record, so {seatsOnly.length === 1 ? "it has" : "they have"}{" "}
              no national share — which is a different thing from a national share of nothing.
            </p>
          )}
        </Panel>
      </div>

      {/* The two big party surfaces, kept whole, behind a switch: one is a
          party's ground across the country, the other is who governs where. */}
      <div className="flex gap-1 rounded-dash border border-dash-line bg-dash-card p-1">
        {[
          { id: "record", label: "One party's ground" },
          { id: "ruling", label: "Who governs now" },
        ].map((item) => {
          const active = half === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setHalf(item.id)}
              aria-pressed={active}
              className={cn(
                "flex-1 rounded-dash-sm px-3 py-2 text-[0.8125rem] font-bold transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                active ? "bg-dash-ink text-white" : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {half === "record" ? (
        <PartyStrength shapes={shapes} territory={territory} ground={ground} />
      ) : governing ? (
        <RulingParty
          rows={governing.rows}
          shapes={shapes}
          fct={governing.fct}
          seats={governing.seats}
          moves={governing.moves}
        />
      ) : (
        <p className="rounded-dash border border-dash-line bg-dash-card px-4 py-8 text-center text-[0.875rem] text-dash-muted">
          Who governs each state is not loaded for this contest.
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ historical */

/**
 * Any two elections, held against each other.
 *
 * ── WHY THE CHOOSER REFUSES SOME PAIRS ─────────────────────────────────────
 * Two of the seven presidential elections — 2007 and 2011 — have no published
 * by-state table, so they cannot appear in a per-state comparison at all.
 * They are in the timeline above with their national figures, and the chooser
 * says why rather than silently omitting them.
 *
 * And a governorship is never on either side. See lib/record.js.
 */
function Historical({ shapes }) {
  const years = MAPPABLE.map((election) => election.year);
  const [from, setFrom] = useState(years[years.length - 2]);
  const [to, setTo] = useState(years[years.length - 1]);
  const [party, setParty] = useState("");

  const seen = useMemo(() => compare(from, to, party || null), [from, to, party]);
  const cover = useMemo(() => span(), []);

  const fills = useMemo(() => {
    if (!seen.ok) return {};
    const index = {};
    for (const row of seen.rows) {
      index[row.code] =
        row.change >= 10
          ? "var(--color-class-stronghold)"
          : row.change >= 2
            ? "var(--color-ink-500)"
            : row.change <= -10
              ? "var(--color-class-weak)"
              : row.change <= -2
                ? "var(--color-class-opportunity)"
                : "var(--color-dash-line)";
    }
    return index;
  }, [seen]);

  const notes = useMemo(() => {
    if (!seen.ok) return {};
    return Object.fromEntries(
      seen.rows.map((row) => [
        row.code,
        `${formatShare(row.was.share)} → ${formatShare(row.now.share)} (${row.change > 0 ? "+" : "−"}${formatShare(Math.abs(row.change))})`,
      ])
    );
  }, [seen]);

  const parties = useMemo(() => {
    const seenIds = new Set();
    for (const election of MAPPABLE) {
      for (const row of election.rows) {
        for (const id of Object.keys(row.votes)) if (id !== "OTH") seenIds.add(id);
      }
    }
    return [...seenIds].sort();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {/* ── THE WHOLE RECORD, AS ONE LINE ─────────────────────────────────
          Both series on one timeline, presidential and governorship, because
          this is the only place in the product that shows what is actually
          held. The two are told apart by their marks and never by position. */}
      <Panel
        title={`The record, ${cover.from} to ${cover.to}`}
        figure={`${cover.elections} elections`}
        foot={`${cover.presidential} presidential and ${cover.governorship} off-cycle governorships, ending with ${cover.lastLabel}. No by-state table is published for ${cover.missingStateTables.join(" or ")}, so neither can appear in a comparison below.`}
      >
        <ul className="flex flex-wrap gap-1.5">
          {TIMELINE.map((row) => (
            <li key={row.id}>
              <span
                title={`${row.label} · ${row.winner}${row.candidate ? ` · ${row.candidate}` : ""}`}
                className={cn(
                  "flex items-center gap-1.5 rounded-dash-sm border px-2 py-1.5 text-[0.75rem]",
                  row.kind === "PRESIDENTIAL"
                    ? "border-dash-ink/25 bg-dash-bg"
                    : "border-dash-line border-dashed"
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: PARTY_FILL[row.winner] ?? "var(--color-party-other)" }}
                />
                <span className="font-semibold text-dash-ink">{row.place === "Nigeria" ? row.year : row.place}</span>
                <span className="figure text-dash-muted tabular-nums">
                  {row.place === "Nigeria" ? row.winner : row.year}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-dash-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-4 rounded-[2px] border border-dash-ink/25 bg-dash-bg" />
            Presidential, whole country
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-4 rounded-[2px] border border-dashed border-dash-line" />
            Governorship, one state
          </span>
        </p>
      </Panel>

      {/* ------------------------------------------------------- the chooser */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-dash border border-dash-line bg-dash-card px-4 py-3">
        <Choose label="From" value={from} onChange={setFrom} options={years} />
        <Choose label="To" value={to} onChange={setTo} options={years} />
        <label className="flex items-center gap-2">
          <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Measuring
          </span>
          <select
            value={party}
            onChange={(event) => setParty(event.target.value)}
            className="rounded-dash-sm border border-dash-line bg-dash-bg px-2 py-1 text-[0.8125rem] font-semibold text-dash-ink"
          >
            <option value="">the winner&rsquo;s share</option>
            {parties.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!seen.ok ? (
        <p className="rounded-dash border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-[0.875rem] leading-relaxed text-dash-ink">
          {seen.why}
        </p>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
              <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dash-line px-5 py-3.5">
                <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
                  {seen.from.year} to {seen.to.year}
                  {party ? `, ${party}` : ", the winner in each state"}
                </h2>
                <p className="figure text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                  {seen.national.change > 0 ? "+" : "−"}
                  {formatShare(Math.abs(seen.national.change))} nationally
                </p>
              </header>
              <div className="px-4 py-3">
                {shapes ? (
                  <MiniMap shapes={shapes} fills={fills} notes={notes} height={340} />
                ) : (
                  <p className="px-4 py-12 text-center text-[0.875rem] text-dash-muted">No map available.</p>
                )}
              </div>
              <footer className="border-t border-dash-line px-5 py-3 text-[0.75rem] leading-relaxed text-dash-muted">
                Green is a gain of ten points or more, red a loss of ten or more; the pale states
                moved by under two either way. The national figure is the sum of the votes over the
                sum of the vote cast, never an average of the thirty-seven states — an average
                weights Bayelsa like Kano.
              </footer>
            </section>

            <div className="flex flex-col gap-3">
              <Panel title="Biggest gains" figure={party || "winner"}>
                <Ranked
                  rows={[...seen.rows]
                    .sort((a, b) => b.change - a.change)
                    .slice(0, 8)
                    .map((row) => ({
                      id: row.code,
                      label: row.name,
                      value: Math.round(row.change * 10) / 10,
                    }))}
                  showShare={false}
                  empty="Nothing moved."
                />
              </Panel>

              <Panel title="Biggest losses" figure={party || "winner"}>
                <Ranked
                  rows={[...seen.rows]
                    .sort((a, b) => a.change - b.change)
                    .slice(0, 8)
                    .map((row) => ({
                      id: row.code,
                      label: row.name,
                      value: Math.round(Math.abs(row.change) * 10) / 10,
                      tone: "alert",
                    }))}
                  showShare={false}
                  empty="Nothing moved."
                />
              </Panel>
            </div>
          </div>

          {/* The table the specification asked for, exactly: geography,
              election A, election B, change. */}
          <Panel title="Every state" figure={`${seen.rows.length}`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-[0.8125rem]">
                <thead>
                  <tr className="border-b border-dash-line text-left text-[0.625rem] tracking-[0.08em] text-dash-muted uppercase">
                    <th className="pb-2 font-semibold">State</th>
                    <th className="pb-2 text-right font-semibold">{seen.from.year}</th>
                    <th className="pb-2 text-right font-semibold">{seen.to.year}</th>
                    <th className="pb-2 text-right font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {seen.rows.map((row) => (
                    <tr key={row.code} className="border-b border-dash-line/60 last:border-0">
                      <td className="py-1.5 font-semibold text-dash-ink">
                        {row.name}
                        {row.flipped && (
                          <span className="ml-2 rounded-full bg-amber-50 px-1.5 py-0.5 text-[0.625rem] font-bold text-amber-700">
                            {row.was.party} → {row.now.party}
                          </span>
                        )}
                      </td>
                      <td className="figure py-1.5 text-right text-dash-muted tabular-nums">
                        {formatShare(row.was.share)}
                      </td>
                      <td className="figure py-1.5 text-right font-bold text-dash-ink tabular-nums">
                        {formatShare(row.now.share)}
                      </td>
                      <td
                        className={cn(
                          "figure py-1.5 text-right font-bold tabular-nums",
                          row.change > 0 ? "text-emerald-600" : row.change < 0 ? "text-red-600" : "text-dash-muted"
                        )}
                      >
                        {row.change > 0 ? "+" : row.change < 0 ? "−" : ""}
                        {formatShare(Math.abs(row.change))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function Choose({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rounded-dash-sm border border-dash-line bg-dash-bg px-2 py-1 text-[0.8125rem] font-semibold text-dash-ink"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ═══════════════════════════════════════════════════════════════════ trends */

/**
 * What has been moving, and which way.
 *
 * ── A REALIGNMENT IS NOT A MARGINAL ────────────────────────────────────────
 * A state that changed hands in 2015 and has been safe ever since is not a
 * swing state. Grading the two alike sends a campaign to defend a place that
 * needs no defending. So a swing here has either changed hands more than once
 * or is held on a knife edge right now — see lib/record.js.
 */
function Trends({ shapes, onOpen }) {
  const trends = useMemo(() => stateTrends(), []);

  const counts = useMemo(() => {
    const index = {};
    for (const key of Object.keys(TRENDS)) index[key] = trends.filter((row) => row.trend === key).length;
    return index;
  }, [trends]);

  const fills = useMemo(
    () => Object.fromEntries(trends.map((row) => [row.code, TREND_FILL[row.trend]])),
    [trends]
  );

  const notes = useMemo(
    () =>
      Object.fromEntries(
        trends.map((row) => [
          row.code,
          `${TRENDS[row.trend].label}, ${row.holder} by ${formatShare(row.margin)}`,
        ])
      ),
    [trends]
  );

  const moving = useMemo(
    () => [...trends].sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift)).slice(0, 10),
    [trends]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dash-line px-5 py-3.5">
            <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
              What each state has been doing
            </h2>
            <p className="text-[0.8125rem] text-dash-muted">
              Across {MAPPABLE.length} presidential elections with a state table
            </p>
          </header>
          <div className="px-4 py-3">
            {shapes ? (
              <MiniMap shapes={shapes} fills={fills} notes={notes} height={340} />
            ) : (
              <p className="px-4 py-12 text-center text-[0.875rem] text-dash-muted">No map available.</p>
            )}
          </div>
          <footer className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-dash-line px-5 py-3">
            {Object.values(TRENDS).map((item) => (
              <span key={item.id} className="flex items-center gap-1.5" title={item.why}>
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{ background: TREND_FILL[item.id] }}
                />
                <span className="text-[0.75rem] text-dash-muted">{item.label}</span>
                <span className="figure text-[0.75rem] font-bold text-dash-ink tabular-nums">
                  {counts[item.id]}
                </span>
              </span>
            ))}
          </footer>
        </section>

        <div className="flex flex-col gap-3">
          <Panel
            title="Moving fastest"
            figure="since the last election"
            foot="The change in the winner's margin between the last two elections. A widening lead is somewhere to stop spending."
          >
            <ul className="space-y-0.5">
              {moving.map((row) => (
                <li key={row.code}>
                  <Readout
                    label={row.name}
                    value={`${row.drift > 0 ? "+" : "−"}${formatShare(Math.abs(row.drift))}`}
                    sub={TRENDS[row.trend].label}
                    tone={row.drift > 0 ? "good" : "alert"}
                    onClick={onOpen ? () => onOpen({ code: row.code, name: row.name }) : undefined}
                  />
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="On a knife edge now"
            figure={`under ${COMPETITIVE} points`}
            foot="Whatever these states have done in the past, this is what they are today."
          >
            <Ranked
              rows={trends
                .filter((row) => row.margin < COMPETITIVE)
                .sort((a, b) => a.margin - b.margin)
                .slice(0, 8)
                .map((row) => ({
                  id: row.code,
                  label: row.name,
                  value: Math.round(row.margin * 10) / 10,
                  tone: "warn",
                }))}
              showShare={false}
              empty="Every state on record is held by more than that."
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
