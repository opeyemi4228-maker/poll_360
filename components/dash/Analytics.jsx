"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CloudRain,
  RotateCcw,
  Scale,
  ShieldAlert,
  Target,
  TrendingUp,
  X,
} from "lucide-react";

import { PARTY_FILL } from "./Charts";
import {
  FACTOR_ROWS,
  FACTORS,
  battlegrounds,
  byZone,
  opportunities,
  project,
  turnoutSensitivity,
  winCondition,
} from "@/lib/forecast";
import { EFFECTS, MEANS, adjustedTurnout } from "@/lib/factors";
import { parties } from "@/lib/election2023";
import { raceFor } from "@/lib/races";
import StateAnalytics from "./StateAnalytics";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Projection and analysis.
 *
 * ── EVERY NUMBER HERE IS CONDITIONAL, AND SAYS SO ──────────────────────────
 * This screen answers "what happens if", never "what will happen". The
 * assumptions are controls at the top rather than constants buried in a
 * model, so the room argues about the assumptions, which is the argument
 * actually worth having. Reset returns to the real 2023 result, so there is
 * always a known-true anchor one click away.
 * ───────────────────────────────────────────────────────────────────────────
 */
const STEP = 0.5;

/** The synthetic columns, in the order they read best. */
const PROFILE = [
  { key: "population", label: "Population", format: (row) => formatNumber(row.population) },
  { key: "under30", label: "Under 30", format: (row) => `${row.under30}%` },
  { key: "religion", label: "Muslim / Christian", format: (row) => `${row.religion.muslim} / ${row.religion.christian}` },
  { key: "rainfall", label: "Rainfall mm", format: (row) => formatNumber(row.rainfall) },
  { key: "rainRisk", label: "Rain risk", format: (row) => `${row.rainRisk}%` },
  { key: "urban", label: "Urban", format: (row) => `${row.urban}%` },
  { key: "security", label: "Security", format: (row) => String(row.security) },
  { key: "hardship", label: "Hardship", format: (row) => String(row.hardship) },
];

/**
 * ── WHY THIS TAKES THE CONTEST AND NOT JUST THE SLIDERS ────────────────────
 * It used to take nothing at all, and computed the presidential projection
 * over all 37 states whatever the room had open. On an Ekiti governorship
 * that made every panel on the screen wrong in the same quiet way the map was
 * before it learned about scope: the win condition tested a spread across 36
 * states nobody was voting in, the closest-states table ranked Kano against
 * Ekiti, and six zones were drawn for a contest held in one.
 *
 * The contest is now handed in. Nothing else about the screen changes: with
 * every lever off it still reduces exactly to the declared 2023 figures — for
 * the states actually in this election.
 */
/**
 * The chooser. Deliberately holds no state of its own, so the two screens
 * below never share a hook order and neither can be rendered conditionally
 * inside the other.
 */
export default function Analytics({ scopeStates = [], race = null, title = null }) {
  /**
   * ── A STATE CONTEST GETS A DIFFERENT SCREEN, NOT A NARROWER ONE ──────────
   * Scoping the presidential projection to one state made every figure on it
   * arithmetically correct and analytically useless: it answered how the 2023
   * presidential result in Ekiti would move under a national swing, which is
   * not a question anybody planning an Ekiti governorship has ever asked.
   *
   * A state election turns on incumbency, the split ticket, a turnout that
   * collapses off-cycle, and a floor that moves between elections. None of
   * those is a slider on a national forecast, and all of them are recorded
   * data this product already holds. So the contest chooses the screen.
   */
  if (scopeStates?.length && race && race !== "PRESIDENTIAL") {
    return (
      <StateAnalytics
        scopeStates={scopeStates}
        title={title}
        raceLabel={raceFor(race)?.label ?? "State contest"}
      />
    );
  }

  return <FederalAnalytics scopeStates={scopeStates} race={race} title={title} />;
}

/**
 * The national projection: a swing model over every state in the contest,
 * against the constitutional win condition.
 */
function FederalAnalytics({ scopeStates = [], race = null, title = null }) {
  const [swing, setSwing] = useState({ APC: 0, PDP: 0, LP: 0, NNPP: 0 });
  const [turnout, setTurnout] = useState(1);
  const [focus, setFocus] = useState("APC");
  /* Every condition starts switched off, so the screen opens on the declared
     2023 result and nothing generated is in the number until somebody asks
     for it. */
  const [levers, setLevers] = useState({
    rainRisk: 0,
    security: 0,
    hardship: 0,
    urban: 0,
    under30: 0,
  });
  const [sortBy, setSortBy] = useState("move");

  const anyLever = Object.values(levers).some((value) => value > 0);

  /* Stable across renders so the memos below do not recompute on identity
     alone: the array arrives fresh from the server component each time. */
  const scope = useMemo(() => scopeStates ?? [], [scopeStates]);

  const projection = useMemo(
    () => project({ swing, turnout, levers: anyLever ? levers : null, scopeStates: scope }),
    [swing, turnout, levers, anyLever, scope]
  );
  const outcome = useMemo(() => winCondition(projection), [projection]);
  const close = useMemo(() => battlegrounds(projection, 8), [projection]);
  const zones = useMemo(() => byZone(projection), [projection]);
  const targets = useMemo(() => opportunities(projection, focus), [projection, focus]);
  const sensitivity = useMemo(() => turnoutSensitivity(swing, scope), [swing, scope]);

  const untouched =
    turnout === 1 && !anyLever && Object.values(swing).every((value) => value === 0);

  /* Every state's synthetic profile with the turnout it implies, ranked by how
     far the conditions actually moved it. */
  const conditioned = useMemo(() => {
    /* `levers` is passed whatever its state, never swapped for an empty object:
       a missing weight reads as full weight, so an empty object would apply
       every effect at 100% and the table would show movement while the
       controls all said off. */
    return FACTOR_ROWS.map((row) => ({ row, model: adjustedTurnout(row, levers) })).sort((a, b) =>
      sortBy === "move"
        ? Math.abs(b.model.delta) - Math.abs(a.model.delta)
        : (b.row[sortBy] ?? 0) - (a.row[sortBy] ?? 0)
    );
  }, [levers, sortBy]);

  /* Nobody clearing the spread test is a constitutional run-off, and it is the
     single most important thing this screen can tell a room. */
  const anyPasses = outcome.some((party) => party.spreadPlain);
  /* Whether the two-thirds spread test governs this contest at all. */
  const spread = outcome[0]?.spreadApplies ?? true;
  const leader = outcome[0];

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------- assumptions */}
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <header className="flex flex-wrap items-center gap-3 border-b border-dash-line px-4 py-3">
          <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
            Assumptions
          </h2>
          <span className="text-[0.75rem] text-dash-muted">
            {untouched
              ? "Showing the real 2023 result. Move a slider to project from it."
              : "Projected from 2023 under the settings below."}
          </span>
          {!untouched && (
            <button
              type="button"
              onClick={() => {
                setSwing({ APC: 0, PDP: 0, LP: 0, NNPP: 0 });
                setTurnout(1);
                setLevers({ rainRisk: 0, security: 0, hardship: 0, urban: 0, under30: 0 });
              }}
              className="ml-auto flex items-center gap-1.5 rounded-full border border-dash-line px-3 py-1.5 text-[0.75rem] font-semibold text-dash-ink transition-colors hover:border-dash-ink"
            >
              <RotateCcw size={13} strokeWidth={2.5} />
              Back to 2023
            </button>
          )}
        </header>

        <div className="grid gap-5 p-4 lg:grid-cols-[1fr_16rem]">
          <div className="grid gap-3 sm:grid-cols-2">
            {parties.map((party) => (
              <label key={party.id} className="block">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-full"
                      style={{ background: PARTY_FILL[party.id] }}
                    />
                    <span className="figure text-[0.8125rem] font-bold text-dash-ink">
                      {party.id}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "figure text-[0.8125rem] font-bold tabular-nums",
                      swing[party.id] > 0
                        ? "text-emerald-700"
                        : swing[party.id] < 0
                          ? "text-red-600"
                          : "text-dash-muted"
                    )}
                  >
                    {swing[party.id] > 0 ? "+" : ""}
                    {swing[party.id].toFixed(1)} pts
                  </span>
                </span>
                <input
                  type="range"
                  min={-15}
                  max={15}
                  step={STEP}
                  value={swing[party.id]}
                  onChange={(event) =>
                    setSwing((current) => ({
                      ...current,
                      [party.id]: Number(event.target.value),
                    }))
                  }
                  aria-label={`National swing for ${party.name}`}
                  className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-dash-bg"
                  style={{ accentColor: "var(--color-dash-ink)" }}
                />
              </label>
            ))}
          </div>

          <label className="block rounded-dash-sm bg-dash-bg p-4">
            <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
              Turnout
            </span>
            <span className="figure mt-1 block text-[1.75rem] leading-none font-bold text-dash-ink tabular-nums">
              {Math.round(turnout * 100)}%
            </span>
            <span className="mt-1 block text-[0.75rem] text-dash-muted">
              of the 2023 level
            </span>
            <input
              type="range"
              min={0.6}
              max={1.4}
              step={0.05}
              value={turnout}
              onChange={(event) => setTurnout(Number(event.target.value))}
              aria-label="Turnout, as a multiple of 2023"
              className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-dash-card"
              style={{ accentColor: "var(--color-dash-ink)" }}
            />
          </label>
        </div>
      </section>

      {/* ------------------------------------------------- the win condition */}
      <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
        <header className="flex flex-wrap items-center gap-3 border-b border-dash-line px-4 py-3.5">
          <Scale size={17} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
          <div className="min-w-0">
            <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
              The win condition
            </h2>
            <p className="text-[0.75rem] text-dash-muted">
              {/* The rule being applied, named. Two different contests are
                  won two different ways, and a panel that says "the win
                  condition" without saying which one is inviting somebody to
                  read a governorship against a presidential threshold. */}
              {spread
                ? "Most votes, and a quarter of the vote in two thirds of the states"
                : `Most votes ${raceFor(race)?.collatedInto ? `across ${raceFor(race).collatedInto}` : "in this contest"}${title ? ` · ${title}` : ""}`}
            </p>
          </div>

          <span
            className={cn(
              "ml-auto shrink-0 rounded-full px-3 py-1.5 text-[0.6875rem] font-bold uppercase",
              anyPasses ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
            )}
          >
            {anyPasses ? `${leader.id} elected` : "Run-off"}
          </span>
        </header>

        {spread && !anyPasses && (
          /* The finding this whole panel exists to surface. */
          <p className="flex gap-2.5 border-b border-dash-line bg-red-50 px-4 py-3 text-[0.8125rem] leading-relaxed text-dash-ink">
            <AlertTriangle size={16} strokeWidth={2.5} className="mt-px shrink-0 text-red-600" />
            <span>
              <span className="font-bold">Nobody meets the threshold.</span> {leader.id} leads on
              votes with {formatShare(leader.share)} but reaches a quarter of the vote in only{" "}
              {leader.quarterStates} states, {leader.shortBy} short of the twenty-four required.
              On these assumptions the election goes to a second round.
            </span>
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left">
            <thead>
              <tr className="border-b border-dash-line">
                {(spread
                  ? ["Party", "Share", "Votes", "States won", "Quarter in", "Threshold"]
                  : ["Party", "Share", "Votes", "States won", "Standing", "Outcome"]
                ).map(
                  (head, index) => (
                    <th
                      key={head}
                      className={cn(
                        "px-4 py-2.5 text-[0.625rem] font-semibold tracking-[0.1em] text-dash-muted uppercase",
                        index > 0 && index < 5 && "text-right"
                      )}
                    >
                      {head}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {outcome.map((party) => (
                <tr key={party.id} className="border-b border-dash-line last:border-0">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: PARTY_FILL[party.id] }}
                      />
                      <span className="figure text-[0.875rem] font-bold text-dash-ink">
                        {party.id}
                      </span>
                      <span className="hidden truncate text-[0.75rem] text-dash-muted sm:inline">
                        {party.candidate}
                      </span>
                    </span>
                  </td>
                  <td className="figure px-4 py-3 text-right text-[0.875rem] font-bold text-dash-ink tabular-nums">
                    {formatShare(party.share)}
                  </td>
                  <td className="figure px-4 py-3 text-right text-[0.875rem] text-dash-muted tabular-nums">
                    {formatNumber(party.votes)}
                  </td>
                  <td className="figure px-4 py-3 text-right text-[0.875rem] text-dash-ink tabular-nums">
                    {party.states}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* Where the spread test governs, the bar is the point:
                        how far off twenty-four they are. Where it does not,
                        drawing "1/24" beside a governorship would report a
                        rule that does not apply as though it had been failed,
                        so the share of the vote goes here instead — which is
                        the whole condition in that contest. */}
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-dash-bg">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: spread
                              ? `${Math.min(100, (party.quarterStates / 24) * 100)}%`
                              : `${Math.min(100, party.share)}%`,
                            background:
                              spread && !party.spreadPlain
                                ? "var(--color-dash-muted)"
                                : PARTY_FILL[party.id],
                          }}
                        />
                      </span>
                      <span className="figure w-10 text-right text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                        {spread ? `${party.quarterStates}/24` : formatShare(party.share)}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {/* Where there is no threshold, there is nothing to have
                        met: the column reports who is ahead, which is the
                        only condition this contest has. */}
                    {!spread ? (
                      party.id === leader.id ? (
                        <span className="inline-flex items-center gap-1.5 text-[0.75rem] font-bold text-emerald-700">
                          <Check size={13} strokeWidth={3} />
                          Leads
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[0.75rem] text-dash-muted">
                          {formatShare(Math.max(0, leader.share - party.share))} behind
                        </span>
                      )
                    ) : party.spreadPlain ? (
                      <span className="inline-flex items-center gap-1.5 text-[0.75rem] font-bold text-emerald-700">
                        <Check size={13} strokeWidth={3} />
                        Met
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[0.75rem] text-dash-muted">
                        <X size={13} strokeWidth={3} />
                        {party.shortBy} short
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="border-t border-dash-line px-4 py-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
          {spread ? (
            <>
              Section 134 requires the highest number of votes and at least a quarter of the votes
              in two thirds of the states. Whether the Federal Capital Territory counts as a
              thirty-seventh state for that test was litigated to the Supreme Court in 2023, so the
              count above is of the 36 states, and the FCT is reported separately in each state row.
            </>
          ) : (
            <>
              This contest is decided on the votes cast in it — the most votes wins, and there is no
              spread test to meet. The two-thirds rule in Section 134 applies to electing a
              President, not to this. The baseline below every figure here is the declared 2023
              presidential result in {scope.length === 1 ? "this state" : `these ${scope.length} states`},
              which is the last real vote on record for {scope.length === 1 ? "it" : "them"} — a
              starting point, not a forecast of a different office.
            </>
          )}
        </p>
      </section>

      {/* ------------------------------------------- battlegrounds and zones */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Closest states" foot="Margin under 8 points" icon={TrendingUp}>
          {close.length === 0 ? (
            <p className="text-[0.8125rem] text-dash-muted">
              Nothing within 8 points on these assumptions.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {close.slice(0, 8).map((row) => (
                <li key={row.code} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: PARTY_FILL[row.winner] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold text-dash-ink">
                    {row.name}
                  </span>
                  <span className="figure shrink-0 text-[0.75rem] text-dash-muted">
                    {row.winner} over {row.runnerUp}
                  </span>
                  <span className="figure w-12 shrink-0 text-right text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                    {row.margin.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="By zone" foot="Six geopolitical zones" icon={Scale}>
          <ul className="space-y-2.5">
            {zones.map((zone) => (
              <li key={zone.zone} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: PARTY_FILL[zone.leader] }}
                />
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold text-dash-ink">
                  {zone.zone}
                </span>
                <span className="figure shrink-0 text-[0.75rem] text-dash-muted">
                  {zone.states} states
                </span>
                <span className="figure w-14 shrink-0 text-right text-[0.8125rem] text-dash-ink tabular-nums">
                  {formatShare(zone.turnout)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* ------------------------------------------------- turnout sensitivity */}
      <Panel
        title="If only turnout changed"
        foot="Same swing, different turnout"
        icon={TrendingUp}
      >
        <div className="grid gap-2 sm:grid-cols-5">
          {sensitivity.map((point) => (
            <div
              key={point.label}
              className={cn(
                "rounded-dash-sm border p-3",
                point.level === turnout ? "border-dash-ink bg-dash-bg" : "border-dash-line"
              )}
            >
              <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                {point.label}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ background: PARTY_FILL[point.winner] }}
                />
                <span className="figure text-[0.9375rem] font-bold text-dash-ink">
                  {point.winner}
                </span>
              </p>
              <p className="figure mt-1 text-[0.75rem] text-dash-muted">
                {formatShare(point.share)}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[0.75rem] leading-relaxed text-dash-muted">
          If the leader changes across this row, turnout decides the election and the effort
          belongs in mobilisation rather than persuasion.
        </p>
      </Panel>

      {/* ------------------------------------------------------- where to work */}
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <header className="flex flex-wrap items-center gap-3 border-b border-dash-line px-4 py-3">
          <Target size={16} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
          <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
            Where the next hour is worth most
          </h2>
          <div className="ml-auto flex gap-1">
            {parties.map((party) => (
              <button
                key={party.id}
                type="button"
                onClick={() => setFocus(party.id)}
                aria-pressed={focus === party.id}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[0.75rem] font-bold transition-colors",
                  focus === party.id
                    ? "bg-dash-ink text-white"
                    : "bg-dash-bg text-dash-muted hover:text-dash-ink"
                )}
              >
                {party.id}
              </button>
            ))}
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left">
            <thead>
              <tr className="border-b border-dash-line">
                {["State", "Zone", "Gap", "Votes to draw level", "Votes per booth", "Not voting"].map(
                  (head, index) => (
                    <th
                      key={head}
                      className={cn(
                        "px-4 py-2.5 text-[0.625rem] font-semibold tracking-[0.1em] text-dash-muted uppercase",
                        index > 1 && "text-right"
                      )}
                    >
                      {head}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {targets
                .filter((row) => !row.held)
                .slice(0, 8)
                .map((row) => (
                  <tr key={row.code} className="border-b border-dash-line last:border-0">
                    <td className="px-4 py-2.5 text-[0.8125rem] font-semibold text-dash-ink">
                      {row.name}
                    </td>
                    <td className="px-4 py-2.5 text-[0.75rem] text-dash-muted">{row.zone}</td>
                    <td className="figure px-4 py-2.5 text-right text-[0.8125rem] text-dash-ink tabular-nums">
                      {row.gap.toFixed(1)}
                    </td>
                    <td className="figure px-4 py-2.5 text-right text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                      {formatNumber(row.votesToFlip)}
                    </td>
                    <td className="figure px-4 py-2.5 text-right text-[0.8125rem] text-dash-muted tabular-nums">
                      {formatNumber(row.yield)}
                    </td>
                    <td className="figure px-4 py-2.5 text-right text-[0.8125rem] text-dash-muted tabular-nums">
                      {formatNumber(row.headroom)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <p className="border-t border-dash-line px-4 py-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
          Ranked by how few votes would change the outcome against how many booths must be covered
          to find them. &ldquo;Not voting&rdquo; is the register that stayed home, which is almost always a
          larger pool than the voters anybody expects to persuade.
        </p>
      </section>


      {/* ------------------------------------------------------- conditions */}
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-dash-line px-4 py-3">
          <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
            Conditions on the ground
          </h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-amber-900">
            Synthetic inputs
          </span>
          <p className="w-full text-[0.75rem] text-dash-muted sm:w-auto sm:flex-1">
            Each lever moves turnout state by state, then the result follows the turnout
          </p>
          {anyLever && (
            <button
              type="button"
              onClick={() => setLevers({ rainRisk: 0, security: 0, hardship: 0, urban: 0, under30: 0 })}
              className="flex shrink-0 items-center gap-1.5 rounded-dash border border-dash-line px-2.5 py-1 text-[0.6875rem] font-bold text-dash-ink transition-colors hover:bg-dash-bg"
            >
              <X size={12} strokeWidth={2.5} />
              All off
            </button>
          )}
        </header>

        {/* ── WHY A DIAL AND NOT A SWITCH ────────────────────────────────────
            A switch says the factor is either believed completely or not at
            all, and nobody in a room believes a coefficient completely. The
            dial is how much weight to put on this assumption, which is the
            thing people actually disagree about, and it lets two analysts who
            disagree meet at 50% instead of arguing to a standstill. */}
        <div className="grid gap-px bg-dash-line sm:grid-cols-2 xl:grid-cols-3">
          {Object.entries(EFFECTS).map(([key, effect]) => {
            const weight = levers[key];
            const on = weight > 0;
            return (
              <div key={key} className="bg-dash-card p-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-[0.8125rem] font-bold text-dash-ink">{effect.label}</span>
                  <span
                    className={cn(
                      "figure ml-auto shrink-0 text-[0.75rem] tabular-nums",
                      on ? "text-dash-ink" : "text-dash-muted"
                    )}
                  >
                    {on ? `${Math.round(weight * 100)}%` : "off"}
                  </span>
                </div>

                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={weight}
                  onChange={(event) =>
                    setLevers((previous) => ({ ...previous, [key]: Number(event.target.value) }))
                  }
                  aria-label={`Weight on ${effect.label}`}
                  className="mt-2 w-full accent-brand-red"
                />

                <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-dash-muted">
                  {effect.note}
                </p>
                <p className="figure mt-1 text-[0.625rem] text-dash-muted">
                  {effect.turnout > 0 ? "+" : ""}
                  {effect.turnout} points of turnout per 20 above {MEANS[key]}
                </p>
              </div>
            );
          })}

          {/* The honesty panel sits in the grid rather than under it, because a
              caveat below the fold is a caveat nobody read. */}
          <div className="flex flex-col justify-center gap-1.5 bg-amber-50 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} strokeWidth={2.5} className="shrink-0 text-amber-700" />
              <span className="text-[0.8125rem] font-bold text-amber-950">
                These inputs are generated
              </span>
            </div>
            <p className="text-[0.6875rem] leading-relaxed text-amber-900">
              Population, religion, rainfall, security and hardship are synthetic: modelled from
              the real register, the real geopolitical zone and real latitude so the pattern is
              coherent, but they are not a census and must not be quoted as one. Swap in a
              licensed source and every figure on this screen updates with nothing else changing.
            </p>
          </div>
        </div>

        <p className="border-t border-dash-line px-4 py-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
          With every lever off the projection reproduces the declared 2023 turnout exactly, so the
          real result is always the thing you fall back to.
        </p>
      </section>

      {/* -------------------------------------------------- the state profile */}
      <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-dash-line px-4 py-3">
          <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
            State profile
          </h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-amber-900">
            Synthetic
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[0.6875rem] text-dash-muted">Rank by</span>
            {[{ key: "move", label: "Turnout move" }, ...PROFILE.filter((column) => column.key !== "religion")].map(
              (column) => (
                <button
                  key={column.key}
                  type="button"
                  onClick={() => setSortBy(column.key)}
                  className={cn(
                    "rounded-dash px-2 py-1 text-[0.6875rem] font-bold transition-colors",
                    sortBy === column.key
                      ? "bg-dash-ink text-white"
                      : "text-dash-muted hover:bg-dash-bg"
                  )}
                >
                  {column.label}
                </button>
              )
            )}
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-[0.75rem]">
            <thead>
              <tr className="border-b border-dash-line text-left">
                <th className="px-4 py-2 font-bold text-dash-muted">State</th>
                {PROFILE.map((column) => (
                  <th key={column.key} className="px-3 py-2 text-right font-bold text-dash-muted">
                    {column.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-bold text-dash-muted">2023</th>
                <th className="px-4 py-2 text-right font-bold text-dash-muted">Modelled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dash-line">
              {conditioned.map(({ row, model }) => {
                const moved = Math.abs(model.delta) >= 0.05;
                const driver = model.parts?.[0];
                return (
                  <tr key={row.code} className="hover:bg-dash-bg">
                    <td className="px-4 py-2">
                      <span className="font-bold text-dash-ink">{row.name}</span>
                      <span className="ml-1.5 text-[0.625rem] text-dash-muted">{row.zone}</span>
                    </td>
                    {PROFILE.map((column) => (
                      <td
                        key={column.key}
                        className="figure px-3 py-2 text-right text-dash-ink tabular-nums"
                      >
                        {column.format(row)}
                      </td>
                    ))}
                    <td className="figure px-3 py-2 text-right text-dash-muted tabular-nums">
                      {row.turnout.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="figure font-bold text-dash-ink tabular-nums">
                        {model.adjusted.toFixed(1)}%
                      </span>
                      {moved && (
                        <span
                          className={cn(
                            "figure ml-1.5 tabular-nums",
                            model.delta > 0 ? "text-emerald-700" : "text-brand-red"
                          )}
                          title={driver ? `Mostly ${driver.label}` : undefined}
                        >
                          {model.delta > 0 ? "+" : ""}
                          {model.delta.toFixed(1)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dash-line px-4 py-2.5 text-[0.6875rem] text-dash-muted">
          <span className="flex items-center gap-1.5">
            <ShieldAlert size={12} strokeWidth={2.5} className="shrink-0" />
            Security and hardship read 0 to 100, higher is worse
          </span>
          <span className="flex items-center gap-1.5">
            <CloudRain size={12} strokeWidth={2.5} className="shrink-0" />
            Rain risk is the chance of rain during polling hours
          </span>
          <span>Register, booths and the 2023 turnout are real. Everything else on this table is generated.</span>
        </div>
      </section>

      {/* ------------------------------------------------------- the factors */}
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <header className="border-b border-dash-line px-4 py-3">
          <h2 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
            What the model is standing on
          </h2>
          <p className="text-[0.75rem] text-dash-muted">
Every factor it can take, where the data comes from, and how far it can be trusted
          </p>
        </header>

        <ul className="divide-y divide-dash-line">
          {FACTORS.map((factor) => (
            <li key={factor.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[0.5625rem] font-bold uppercase",
                  factor.loaded
                    ? factor.generated
                      ? "bg-amber-100 text-amber-900"
                      : "bg-emerald-50 text-emerald-800"
                    : "bg-dash-bg text-dash-muted"
                )}
              >
                {factor.loaded ? (factor.generated ? "Synthetic" : "Real") : "Not loaded"}
              </span>
              <span className="text-[0.8125rem] font-bold text-dash-ink">{factor.name}</span>
              <span className="figure text-[0.6875rem] text-dash-muted">{factor.weight}</span>
              <span className="w-full text-[0.75rem] leading-relaxed text-dash-muted sm:w-auto sm:flex-1">
                {factor.note}
              </span>
            </li>
          ))}
        </ul>

        <p className="border-t border-dash-line px-4 py-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
          The badge is the whole point of this table. A real factor was measured: the register, the
          booth count, the 2023 result. A synthetic one was generated so the model has a full set of
          levers to move, and a projection resting on it is a scenario rather than a finding. The two
          are never blended into one confident number, because a room that cannot tell which is which
          cannot tell how much to believe. Supply a licensed source for a synthetic row and it turns
          real with nothing else in the product changing.
        </p>
      </section>
    </div>
  );
}

function Panel({ title, foot, icon: Icon, children }) {
  return (
    <section className="rounded-dash border border-dash-line bg-dash-card">
      <header className="flex items-baseline gap-2.5 border-b border-dash-line px-4 py-3">
        {Icon && <Icon size={15} strokeWidth={2.25} className="shrink-0 self-center text-dash-muted" />}
        <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">{title}</h3>
        {foot && <span className="ml-auto text-[0.6875rem] text-dash-muted">{foot}</span>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
