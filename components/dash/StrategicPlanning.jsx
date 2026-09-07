"use client";

import { useMemo, useState } from "react";
import { Crosshair, Map as MapIcon, Sprout, Target, Users } from "lucide-react";

import AddToPlan from "./AddToPlan";
import PlanningMap from "./PlanningMap";
import PartyGround from "./PartyGround";
import SampleDesign from "./SampleDesign";
import Analytics from "./Analytics";
import { Gauge, Meter, MiniMap, Panel, Ranked, Readout } from "./Figures";
import { CLASS_OF, swingScenario, turnoutScenario } from "@/lib/executive";
import { turnoutByState } from "@/lib/record";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * Strategic Planning: where should we focus.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS NOT A TAB OF ELECTION ANALYTICS
 *
 *  Analysis and planning look like the same activity and are not. Analysis
 *  ends in a finding — "turnout in Kaduna fell nineteen points" — and a
 *  finding costs nothing to be wrong about for an afternoon. Planning ends in
 *  a commitment: agents deployed, money spent, a director told that these
 *  four hundred booths are where the fortnight goes.
 *
 *  Mixed into one dashboard, the second quietly inherits the authority of the
 *  first. A ranked list on an analytics screen reads as a fact; the same list
 *  on a planning screen reads as a decision somebody has to sign, which is
 *  what it actually is. Keeping them apart is the difference between a room
 *  that argues about a plan and a room that assumes one.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE FIVE QUESTIONS, IN THE ORDER THEY GET ASKED ────────────────────────
 *   Priorities    which states, local governments, wards and booths, ranked
 *   Party Spread  where a party's members actually are, on a map you walk
 *                 down from the country to one polling unit
 *   Ground        how strong we actually are where we say we are strong
 *   Deployment    what covering that costs, and whether it can be afforded
 *   Scenarios     what changes if turnout moves, or if we move these places
 *   Target        what we are aiming at, and how far off it we are
 *
 * Every list here writes into the one coverage plan — see lib/coverage.js —
 * so a priority accepted on this screen is a priority the cost model on the
 * map beside it immediately has to account for.
 */

const TABS = [
  { id: "priorities", label: "Priorities", icon: Target },
  /* ── PARTY STRENGTH, WHICH IS A PLANNING QUESTION ──────────────────────
     Where a party's members actually are, from a state down to one polling
     unit, out of the party's own register — see lib/members.js.

     It is here rather than under Election Analytics on purpose. "How did this
     state vote" is analysis. "How many of our people are in this ward, and is
     that enough to work it" is a decision about where to send somebody, and
     it belongs beside the priorities and the resources it competes with. */
  { id: "party", label: "Party Spread", icon: Users },
  { id: "ground", label: "Grassroots", icon: Sprout },
  /* ── WHAT WAS CALLED "RESOURCES" ──────────────────────────────────────
     Named for what it actually is. It is the deployment map — choose the
     ground you can cover, then find out whether the deployment you just drew
     is big enough for a projection to be quoted off. "Resources" said
     nothing about either half, and the name was taken by the party spread,
     which is the screen people were coming to this head to find. */
  { id: "map", label: "Deployment", icon: MapIcon },
  { id: "scenarios", label: "Scenarios", icon: Crosshair },
];

export default function StrategicPlanning({
  /* The brief and its assumptions — the same call the analytics dashboard
     reads, so a priority here and a classification there cannot disagree. */
  brief: briefState,
  place = "Nigeria",
  shapes = null,
  states = [],
  pulse = null,
  territory = null,
  ground = null,
  scopeStates = [],
  race = null,
  stateResults = {},
  subState = false,
  onOpen,
  pathOf,
}) {
  const [tab, setTab] = useState("priorities");
  const { brief, forParty, targetShare } = briefState;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Strategic planning"
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

      {tab === "priorities" && (
        <Priorities
          brief={brief}
          forParty={forParty}
          targetShare={targetShare}
          place={place}
          shapes={shapes}
          onOpen={onOpen}
          pathOf={pathOf}
        />
      )}

      {tab === "party" && <PartyGround shapes={shapes} />}

      {tab === "ground" && <Grassroots pulse={pulse} shapes={shapes} brief={brief} ground={ground} />}

      {tab === "map" && (
        <div className="flex flex-col gap-3">
          <PlanningMap shapes={shapes} territory={territory} ground={ground} />
          {/* The arithmetic that decides whether anything on this screen may
              be said out loud: a projection is only a projection off a sample
              drawn at random at a size fixed beforehand. It belongs with the
              deployment it constrains, not on an analysis screen. */}
          <SampleDesign states={states} pulse={pulse} ground={ground} />
        </div>
      )}

      {tab === "scenarios" && (
        <Scenarios
          brief={brief}
          forParty={forParty}
          place={place}
          scopeStates={scopeStates}
          race={race}
          stateResults={stateResults}
          territory={territory}
          ground={ground}
          subState={subState}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ priorities */

/**
 * Which places, ranked, at whatever tier the room is standing on.
 *
 * ── ONE RANKING, NOT FOUR ──────────────────────────────────────────────────
 * The specification asks for priority states, local governments, wards and
 * polling units. They are not four rankings: they are one ranking applied at
 * whichever tier the map is on, which is what makes a state director and a
 * ward organiser able to use the same screen. Drill into Kaduna and this
 * ranks Kaduna's local governments by exactly the arithmetic that ranked the
 * states a moment ago — see `opportunityOf` in lib/executive.js, whose five
 * terms are printed on every row so a ranking can be argued with.
 */
function Priorities({ brief, forParty, targetShare, place, shapes, onOpen, pathOf }) {
  const [band, setBand] = useState("all");

  const rows = useMemo(() => {
    if (band === "all") return brief.growth;
    return brief.growth.filter((row) => row.class === band);
  }, [brief, band]);

  const fills = useMemo(() => {
    const index = {};
    const top = new Set(brief.growth.slice(0, 12).map((row) => row.code));
    for (const row of brief.places) {
      if (!row.code) continue;
      index[row.code] = top.has(row.code)
        ? "var(--color-class-opportunity)"
        : CLASS_OF[row.class]?.id === "UNKNOWN"
          ? "var(--color-dash-bg)"
          : "var(--color-dash-line)";
    }
    return index;
  }, [brief]);

  const notes = useMemo(
    () =>
      Object.fromEntries(
        brief.growth
          .filter((row) => row.code)
          .map((row) => [row.code, `priority score ${row.opportunity.score}`])
      ),
    [brief]
  );

  const bands = [
    { id: "all", label: "Everywhere" },
    { id: "COMPETITIVE", label: "Battlegrounds" },
    { id: "OPPORTUNITY", label: "Opportunities" },
    { id: "STRONGHOLD", label: "Hold" },
    { id: "WEAK", label: "Behind" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dash-line px-5 py-3.5">
            <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
              Where the next fortnight goes in {place}
            </h2>
            <p className="text-[0.8125rem] text-dash-muted">
              Top {Math.min(12, brief.growth.length)} of {formatNumber(brief.growth.length)}
            </p>
          </header>
          <div className="px-4 py-3">
            {shapes && Object.keys(fills).length ? (
              <MiniMap shapes={shapes} fills={fills} notes={notes} height={300} />
            ) : (
              <p className="px-4 py-10 text-center text-[0.875rem] leading-relaxed text-dash-muted">
                No outline is published at this tier. The ranking below is the same either way.
              </p>
            )}
          </div>
          <footer className="border-t border-dash-line px-5 py-3 text-[0.75rem] leading-relaxed text-dash-muted">
            Orange is the top twelve by priority score. The score is a weighted sum of five terms —
            how many voters are there, how winnable it is, how many stayed home, how much of the
            vote is not ours, and whether it is moving our way — and every row prints all five, so
            a ranking can be argued with rather than taken on trust.
          </footer>
        </section>

        <div className="flex flex-col gap-3">
          <Panel
            title="Target"
            figure={brief.target ? formatShare(targetShare) : "not set"}
            foot={
              brief.target
                ? brief.target.met
                  ? `On course. ${formatNumber(-brief.target.gap)} votes clear of the target.`
                  : `${formatNumber(brief.target.gap)} votes short at the projected turnout.`
                : "Set a target share on the Overview tab of Election Analytics."
            }
          >
            {brief.target ? (
              <Gauge
                share={Math.min(100, brief.target.progress)}
                figure={formatShare(Math.min(100, brief.target.progress))}
                sub={`of ${formatNumber(brief.target.votes)} votes`}
                tone={brief.target.met ? "good" : "ink"}
              />
            ) : (
              <p className="py-4 text-center text-[0.875rem] text-dash-muted">No target set.</p>
            )}
          </Panel>

          <Panel title="The ground, in one line" figure={forParty ?? "—"}>
            <ul className="space-y-0.5">
              {["STRONGHOLD", "COMPETITIVE", "OPPORTUNITY", "WEAK", "UNKNOWN"].map((id) => (
                <li key={id}>
                  <Readout
                    label={`${CLASS_OF[id].dot} ${CLASS_OF[id].label}`}
                    value={formatNumber(brief.counts[id])}
                  />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {/* ------------------------------------------------------- the ranking */}
      <div className="flex flex-wrap gap-1 rounded-dash border border-dash-line bg-dash-card p-1">
        {bands.map((item) => {
          const active = band === item.id;
          const count = item.id === "all" ? brief.growth.length : brief.counts[item.id] ?? 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setBand(item.id)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-2 rounded-dash-sm px-3 py-1.5 text-[0.8125rem] font-bold transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                active ? "bg-dash-ink text-white" : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
              )}
            >
              {item.label}
              <span className="figure text-[0.6875rem] tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}

        {pathOf && rows.length > 0 && (
          <div className="ml-auto">
            <AddToPlan
              paths={rows.slice(0, 20).map((row) => pathOf(row)).filter(Boolean)}
              reason={`Priority ranking for ${forParty} in ${place}`}
              from="Strategic planning"
              label={`Add top ${Math.min(20, rows.length)} to plan`}
            />
          </div>
        )}
      </div>

      <Panel title="Ranked by priority" figure={`${formatNumber(rows.length)} places`}>
        {rows.length === 0 ? (
          <p className="text-[0.875rem] text-dash-muted">Nothing in that band on screen.</p>
        ) : (
          <ol className="space-y-3">
            {rows.slice(0, 25).map((row, index) => (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => onOpen?.(row)}
                  className="w-full rounded-dash-sm px-2 py-1.5 text-left transition-colors hover:bg-dash-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[0.875rem] font-bold text-dash-ink">
                      <span className="mr-2 text-dash-muted tabular-nums">{index + 1}.</span>
                      {CLASS_OF[row.class]?.dot} {row.name}
                    </span>
                    <span className="figure shrink-0 text-[0.875rem] font-bold text-dash-ink tabular-nums">
                      {row.opportunity.score}
                    </span>
                  </span>
                  <Meter share={row.opportunity.score} height={5} className="mt-1.5" />

                  {/* The five terms, on the row, because a planner who cannot
                      see why a ward ranks fourth will not act on it being
                      fourth. */}
                  <span className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[0.6875rem] text-dash-muted sm:grid-cols-5">
                    <Term label="Voters" value={row.opportunity.reach} />
                    <Term label="Winnable" value={row.opportunity.closeness} />
                    <Term label="Stayed home" value={row.opportunity.turnoutRoom} />
                    <Term label="Headroom" value={row.opportunity.headroom} />
                    <Term label="Momentum" value={row.opportunity.momentum} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

function Term({ label, value }) {
  return (
    <span className="flex items-baseline gap-1">
      <span>{label}</span>
      <span className="figure font-bold text-dash-ink tabular-nums">{value}</span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════ grassroots */

/**
 * How strong we actually are where we say we are strong.
 *
 * ── THE ONE CHECK A PLAN NEEDS AND NEVER GETS ──────────────────────────────
 * A priority list assumes the organisation can act on it. That assumption is
 * usually wrong in one specific way: the places a campaign most wants are the
 * places it has fewest people in, because if it had people there it would
 * already know them. Every figure here is about the organisation rather than
 * the electorate, so a plan can be checked against what actually exists.
 */
function Grassroots({ pulse, shapes, brief, ground }) {
  const byState = useMemo(() => turnoutByState(), []);
  /* Memoised at its source: `pulse?.states ?? []` is a fresh array whenever
     the pulse has none, so every memo reading it would re-run on every
     render of the room — which is every fifteen seconds, all night. */
  const states = useMemo(() => pulse?.states ?? [], [pulse]);

  const fills = useMemo(() => {
    const index = {};
    for (const row of states) {
      if (!row.assigned) continue;
      const rate = (row.filed / row.assigned) * 100;
      index[row.code] =
        rate >= 80
          ? "var(--color-class-stronghold)"
          : rate >= 50
            ? "var(--color-ink-600)"
            : rate >= 20
              ? "var(--color-class-opportunity)"
              : "var(--color-class-weak)";
    }
    return index;
  }, [states]);

  const notes = useMemo(
    () =>
      Object.fromEntries(
        states
          .filter((row) => row.assigned)
          .map((row) => [
            row.code,
            `${formatNumber(row.assigned)} assigned · ${formatShare((row.filed / row.assigned) * 100)} filed`,
          ])
      ),
    [states]
  );

  const deployed = states.filter((row) => row.assigned > 0);
  const assigned = states.reduce((sum, row) => sum + row.assigned, 0);
  const filed = states.reduce((sum, row) => sum + row.filed, 0);

  /* Where we want to be and are not: a place high on the register with nobody
     assigned to it. The gap between ambition and organisation, in one list. */
  const uncovered = useMemo(() => {
    const has = new Set(deployed.map((row) => row.code));
    return byState.filter((row) => !has.has(row.code)).slice(0, 10);
  }, [byState, deployed]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Panel
          title="People on the ground"
          figure={`${formatNumber(deployed.length)} state${deployed.length === 1 ? "" : "s"}`}
          foot={
            assigned
              ? `${formatNumber(filed)} of ${formatNumber(assigned)} assigned booths have filed`
              : "Nobody has been assigned a booth in this project yet"
          }
        >
          <Gauge
            share={assigned ? (filed / assigned) * 100 : 0}
            figure={formatNumber(assigned)}
            sub={ground ? `assigned in ${ground}` : "booths assigned"}
            tone={assigned ? "ink" : "warn"}
          />
        </Panel>

        <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dash-line px-5 py-3.5">
            <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
              Organisational strength
            </h2>
            <p className="text-[0.8125rem] text-dash-muted">Green is filing; red is deployed and silent</p>
          </header>
          <div className="px-4 py-3">
            {shapes ? (
              <MiniMap shapes={shapes} fills={fills} notes={notes} height={260} />
            ) : (
              <p className="px-4 py-10 text-center text-[0.875rem] text-dash-muted">No map for this contest.</p>
            )}
          </div>
          <footer className="border-t border-dash-line px-5 py-3 text-[0.75rem] leading-relaxed text-dash-muted">
            A blank state is one nobody was deployed to. That is not weakness in the field — it is
            the absence of a field, and it is a different decision.
          </footer>
        </section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title="Deployed and not reporting"
          figure={`${formatNumber(pulse?.silence?.length ?? 0)} booths`}
          foot="People we have, in places we chose, who have not filed. The first call list of any plan."
        >
          <Ranked
            rows={deployed
              .filter((row) => row.assigned > row.filed)
              .map((row) => ({ id: row.code, label: row.name, value: row.assigned - row.filed }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 8)}
            tone="warn"
            empty="Everyone deployed has filed."
          />
        </Panel>

        <Panel
          title="Big registers, nobody there"
          figure={`${formatNumber(uncovered.length)} states`}
          foot="Ranked by voters who stayed home at the last election. The gap between where a plan wants to win and where the organisation actually is."
        >
          <Ranked
            rows={uncovered.map((row) => ({
              id: row.code,
              label: row.name,
              value: row.stayedHome,
            }))}
            empty="Somebody is assigned in every state on the register."
          />
        </Panel>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ scenarios */

/**
 * What changes if.
 *
 * ── EVERY FIGURE HERE IS CONDITIONAL AND SAYS SO ───────────────────────────
 * The assumptions are controls rather than constants buried in a model, so
 * the room argues about the assumptions, which is the argument worth having.
 * Nothing on this tab is a forecast; all of it is arithmetic on a stated "if".
 */
function Scenarios({
  brief,
  forParty,
  place,
  scopeStates,
  race,
  stateResults,
  territory,
  ground,
  subState,
}) {
  const [points, setPoints] = useState(5);
  const [picked, setPicked] = useState([]);

  const turnout = useMemo(() => turnoutScenario(brief, points), [brief, points]);
  const swing = useMemo(
    () => (picked.length ? swingScenario(brief, picked, points) : null),
    [brief, picked, points]
  );

  const candidates = useMemo(
    () => brief.battlegrounds.concat(brief.growth.filter((row) => row.class === "OPPORTUNITY")).slice(0, 14),
    [brief]
  );

  const toggle = (key) =>
    setPicked((held) => (held.includes(key) ? held.filter((item) => item !== key) : [...held, key]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-dash border border-dash-line bg-dash-card px-4 py-3">
        <label className="flex items-center gap-2">
          <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Move by
          </span>
          <input
            type="number"
            min={0}
            max={30}
            step={1}
            value={points}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next) && next >= 0 && next <= 30) setPoints(next);
            }}
            className="figure w-14 rounded-dash-sm border border-dash-line bg-dash-bg px-2 py-1 text-[0.8125rem] font-bold text-dash-ink tabular-nums"
          />
          <span className="text-[0.8125rem] text-dash-muted">points</span>
        </label>
        <p className="text-[0.8125rem] text-dash-muted">
          Every figure below is arithmetic on that assumption, for {forParty ?? "this campaign"} in{" "}
          {place}. None of it is a forecast.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title={`If turnout rises ${points} points`}
          figure={turnout ? `+${formatNumber(turnout.mine)} votes` : "—"}
          foot="Assuming the extra voters split the way the counted vote has split. That is not a claim about who stayed home — nobody knows that — it is the neutral case, which makes this a floor rather than a forecast."
        >
          {turnout ? (
            <div className="space-y-2.5">
              <Readout label="More people voting" value={formatNumber(turnout.extraVotes)} />
              <Readout label={`Of those, to ${forParty}`} value={formatNumber(turnout.mine)} tone="good" />
              {turnout.closes !== null && (
                <>
                  <Readout
                    label="Share of the gap it closes"
                    value={formatShare(turnout.closes * 100)}
                    tone={turnout.closes >= 1 ? "good" : "warn"}
                  />
                  <Meter share={Math.min(100, turnout.closes * 100)} tone={turnout.closes >= 1 ? "good" : "warn"} />
                </>
              )}
            </div>
          ) : (
            <p className="text-[0.875rem] text-dash-muted">No register on screen to work from.</p>
          )}
        </Panel>

        <Panel
          title={`If we put ${points} points on in the places chosen`}
          figure={swing ? `+${formatNumber(swing.gained)} votes` : `${picked.length} chosen`}
          foot="A swing inside a few places does not move the total by the same amount, because the total vote does not change. That gap is the single most useful thing this panel says."
        >
          {swing ? (
            <div className="space-y-2.5">
              <Readout label="Places moved" value={formatNumber(swing.places)} />
              <Readout label="Votes gained" value={formatNumber(swing.gained)} tone="good" />
              <Readout
                label={`Shift in the ${place} share`}
                value={`${swing.shift > 0 ? "+" : ""}${formatShare(swing.shift)}`}
                sub={`asked for ${points}`}
              />
            </div>
          ) : (
            <p className="text-[0.875rem] text-dash-muted">
              Choose places below to see what moving them is worth.
            </p>
          )}
        </Panel>
      </div>

      <Panel
        title="Which places to move"
        figure={`${picked.length} chosen`}
        foot="The battlegrounds and opportunities on screen. Choosing here changes only the panel above; nothing is committed to the plan."
      >
        {candidates.length === 0 ? (
          <p className="text-[0.875rem] text-dash-muted">Nothing on screen is close enough to move.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {candidates.map((row) => {
              const on = picked.includes(row.key);
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    onClick={() => toggle(row.key)}
                    aria-pressed={on}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[0.75rem] font-semibold transition-colors",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                      on
                        ? "border-dash-ink bg-dash-ink text-white"
                        : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                    )}
                  >
                    {CLASS_OF[row.class]?.dot}
                    {row.name}
                    <span className="figure tabular-nums opacity-70">
                      {row.margin === null ? "—" : `${row.margin > 0 ? "+" : "−"}${formatShare(Math.abs(row.margin))}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* The national projection model, which answers the other half of "what
          if": not what one campaign does, but what the whole result does under
          a stated swing and turnout. */}
      <Analytics
        scopeStates={scopeStates}
        race={race}
        title={territory?.stateName ?? ground ?? null}
        ground={ground}
        subState={subState}
        results={stateResults}
      />
    </div>
  );
}
