"use client";

import { useMemo, useState } from "react";
import { Crosshair, Map as MapIcon, Users } from "lucide-react";

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

/* ── PRIORITIES AND GRASSROOTS HAVE GONE ──────────────────────────────────
   Both were removed on the room's own instruction. Party Spread is the front
   door now: "how many of our people are in this ward" is the question this
   head is opened to answer, and it was two clicks behind a ranking nobody
   worked from. */
const TABS = [
  /* ── PARTY STRENGTH, WHICH IS A PLANNING QUESTION ──────────────────────
     Where a party's members actually are, from a state down to one polling
     unit, out of the party's own register — see lib/members.js.

     It is here rather than under Election Analytics on purpose. "How did this
     state vote" is analysis. "How many of our people are in this ward, and is
     that enough to work it" is a decision about where to send somebody, and
     it belongs beside the priorities and the resources it competes with. */
  { id: "party", label: "Party Spread", icon: Users },
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
}) {
  const [tab, setTab] = useState(TABS[0].id);
  const { brief, forParty } = briefState;

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

      {tab === "party" && <PartyGround shapes={shapes} />}

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
