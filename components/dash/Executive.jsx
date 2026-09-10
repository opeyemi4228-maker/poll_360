"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Crosshair,
  Flag,
  Percent,
  Scale,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Vote,
} from "lucide-react";

import AddToPlan from "./AddToPlan";
import { PARTY_FILL } from "./Charts";
import { Meter, Panel, Readout, Split, Tile } from "./Figures";
import {
  CLASS_OF,
  baselineFrom,
  classBreakdown,
  executiveBrief,
  turnoutScenario,
} from "@/lib/executive";
import { MAPPABLE, electionOf } from "@/lib/behaviour";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * The strategic brief: one party's whole position on one screen.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHO THIS IS FOR, AND WHY IT IS THE FIRST TAB IN THE HEAD
 *
 *  Everything else under Analytics answers a question about the election.
 *  This answers the question about the campaign, and it is the only screen
 *  here written for somebody who will not open a second one: a candidate, a
 *  political director, a director-general with four minutes between meetings.
 *
 *  That reader has one question — where do we stand and what do we do — and
 *  answering it used to mean reading four screens and reconciling them by
 *  hand, at night, before speaking in public. Every figure below comes out of
 *  a single call to lib/executive.js, so the share here and the share on the
 *  map are the same subtraction and cannot drift apart.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE THREE KINDS OF NUMBER, KEPT APART ON PURPOSE ───────────────────────
 * The screen is banded, and the bands are not decoration:
 *
 *   COUNTED    votes, share, turnout, margin. Arithmetic on returns.
 *   RECORDED   the same ground last time, and the swing between them.
 *   MODELLED   the projection and anything derived from it, including the
 *              target, which is only a number once you assume a turnout.
 *
 * A reader who takes a modelled figure for a counted one will say it out
 * loud as a fact. So the model never shares a tile with a measurement, and
 * the band it sits in says what it is in words.
 * ───────────────────────────────────────────────────────────────────────────
 */

/* What the reader chose last time, so a director does not re-pick their own
   party every morning. One key, versioned, because the shape below is allowed
   to change and a stale object must not decide what a screen shows. */
const KEPT = "poll360.executive.v1";

/** Sensible openings. Both are arguments the screen lets you change. */
const DEFAULTS = { targetShare: 50, expectedTurnout: 35 };

/**
 * The brief, and the four assumptions it is drawn under.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS A HOOK IN THE ROOM AND NOT STATE INSIDE THE SCREEN
 *
 *  Two surfaces draw this classification: the brief below, and the map that
 *  colours every place green, yellow, orange or red. They have to be one
 *  computation. If the screen owned the party picker, the map would either
 *  need its own — and a map saying "stronghold" about a party the brief is
 *  not written for is the worst kind of wrong, because every figure on it is
 *  real — or it would need the same state threaded through a second path that
 *  somebody has to remember to keep in step.
 *
 *  So the room calls this once, hands the answer to both, and the two cannot
 *  disagree by construction.
 * ══════════════════════════════════════════════════════════════════════════
 */
export function useBrief({ rows = [], slots = [], level = "nation" } = {}) {
  /* ── WHOSE BRIEF IS THIS ────────────────────────────────────────────────
     There is no "our party" recorded against a project, and there should not
     be: the same deployment is read by a campaign that has one and by a
     newsroom that must not. So it is a choice on the screen, it opens on
     whoever is leading, and it is remembered per browser. */
  const [forParty, setForParty] = useState(null);
  const [targetShare, setTargetShare] = useState(DEFAULTS.targetShare);
  const [expectedTurnout, setExpectedTurnout] = useState(DEFAULTS.expectedTurnout);
  const [compareTo, setCompareTo] = useState(null);

  /* ── RESTORED AFTER THE FIRST PAINT, NEVER DURING IT ────────────────────
     Local storage does not exist on the server, so what this restores and
     what the server rendered disagree, and reading it while rendering is
     exactly how a hydration mismatch is made. Deferred by a timeout rather
     than written straight into the effect body for the second reason: four
     setState calls in an effect that runs on mount is four cascading
     renders of the whole room. This is the same restore the whiteboard does
     a few hundred lines away in SituationRoom, for the same two reasons. */
  useEffect(() => {
    const restore = setTimeout(() => {
      try {
        const kept = JSON.parse(window.localStorage.getItem(KEPT) ?? "null");
        if (!kept) return;
        if (kept.forParty) setForParty(kept.forParty);
        if (Number.isFinite(kept.targetShare)) setTargetShare(kept.targetShare);
        if (Number.isFinite(kept.expectedTurnout)) setExpectedTurnout(kept.expectedTurnout);
        if (Number.isFinite(kept.compareTo)) setCompareTo(kept.compareTo);
      } catch {
        /* A browser with storage switched off is not a broken screen. */
      }
    }, 0);
    return () => clearTimeout(restore);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        KEPT,
        JSON.stringify({ forParty, targetShare, expectedTurnout, compareTo })
      );
    } catch {
      /* As above. Nothing on this screen depends on the write succeeding. */
    }
  }, [forParty, targetShare, expectedTurnout, compareTo]);

  /* ── THE ELECTION THIS IS MEASURED AGAINST ──────────────────────────────
     Only presidential elections with a published state table can serve as a
     baseline, and only at national level: nothing below a state is recorded
     anywhere for any past election, so at a deeper level the comparison is
     switched off rather than drawn flat at zero. See lib/history.js. */
  const comparable = level === "nation" ? MAPPABLE : [];
  const baselineYear =
    level === "nation" ? (compareTo ?? comparable.at(-2)?.year ?? comparable.at(-1)?.year ?? null) : null;

  const baseline = useMemo(
    () => (baselineYear && forParty ? baselineFrom(electionOf(baselineYear), forParty) : null),
    [baselineYear, forParty]
  );

  const brief = useMemo(
    () =>
      executiveBrief({
        rows,
        slots,
        forParty,
        baseline,
        baselineLabel: baselineYear ? String(baselineYear) : null,
        targetShare,
        expectedTurnout,
      }),
    [rows, slots, forParty, baseline, baselineYear, targetShare, expectedTurnout]
  );

  /* Nobody has chosen a party yet, so the brief opens on whoever is winning.
     Adjusted during render, which is React's documented way to react to a
     changed value, and it settles in one pass because the next render has a
     party and takes the branch above. */
  if (forParty === null && brief.leader) setForParty(brief.leader.id);

  return {
    brief,
    forParty,
    setForParty,
    targetShare,
    setTargetShare,
    expectedTurnout,
    setExpectedTurnout,
    comparable,
    baselineYear,
    setCompareTo,
  };
}

export default function Executive({
  /* The brief and its assumptions, from `useBrief` above. The room owns them
     because the map draws the same classification. */
  state,
  /* Where we are standing, in words. */
  place = "Nigeria",
  /* What position in each row's `votes` means which party, from the board.
     Only for the picker; the arithmetic already has them. */
  slots = [],
  /* Drill the map to a place. Every row on this screen is a door. */
  onOpen,
  /* Cross to another surface — the classification map, the projection. */
  onGo,
  /* The path to a place, for the plan. Built by the room, which is the only
     thing that knows where it is standing. */
  pathOf,
}) {
  const {
    brief,
    forParty,
    setForParty,
    targetShare,
    setTargetShare,
    expectedTurnout,
    setExpectedTurnout,
    comparable,
    baselineYear,
    setCompareTo,
  } = state;

  const classes = useMemo(() => classBreakdown(brief), [brief]);
  const mobilise = useMemo(() => turnoutScenario(brief, 5), [brief]);

  const party = slots.find((item) => item.id === forParty) ?? null;
  const colour = PARTY_FILL[forParty] ?? "var(--color-dash-ink)";

  /* Nothing has reported anywhere. Every figure below would be a zero, and a
     wall of zeroes on an executive screen is read as a result. */
  if (!brief.reporting.reported) {
    return (
      <div className="rounded-dash border border-dash-line bg-dash-card p-8 text-center">
        <p className="text-[1.125rem] font-bold text-dash-ink">Nothing has been counted yet</p>
        <p className="mx-auto mt-2 max-w-prose text-[0.875rem] leading-relaxed text-dash-muted">
          This brief is built from returns as they arrive. {brief.reporting.places === 0
            ? "There are no places on screen to report from."
            : `None of the ${formatNumber(brief.reporting.places)} places on screen has reported.`}{" "}
          It fills in on its own as the count comes in — nothing here needs to be refreshed by hand.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ─────────────────────────────────────────────────── the assumptions */}
      {/* Every conditional figure on this screen depends on these three, so
          they are at the top where they can be argued with, rather than
          buried in a model nobody can see. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-dash border border-dash-line bg-dash-card px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Brief for
          </span>
          <div className="flex flex-wrap gap-1">
            {slots.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setForParty(item.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[0.75rem] font-bold transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                  item.id === forParty
                    ? "text-white"
                    : "border border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                )}
                style={item.id === forParty ? { background: PARTY_FILL[item.id] ?? "var(--color-dash-ink)" } : undefined}
              >
                {item.id}
              </button>
            ))}
          </div>
        </div>

        <Assumption
          label="Target share"
          value={targetShare}
          onChange={setTargetShare}
          hint="The share this campaign is aiming at. Turned into votes against the projected turnout below."
        />
        <Assumption
          label="Expected turnout"
          value={expectedTurnout}
          onChange={setExpectedTurnout}
          hint="What turnout this contest should reach. Every projected figure is counted against it."
        />

        {comparable.length > 0 && (
          <label className="flex items-center gap-2">
            <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
              Against
            </span>
            <select
              value={baselineYear ?? ""}
              onChange={(event) => setCompareTo(Number(event.target.value))}
              className="rounded-dash-sm border border-dash-line bg-dash-bg px-2 py-1 text-[0.8125rem] font-semibold text-dash-ink"
            >
              {comparable.map((election) => (
                <option key={election.year} value={election.year}>
                  {election.year}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────── counted */}
      <Band
        title="Counted"
        note={`${formatNumber(brief.reporting.reported)} of ${formatNumber(brief.reporting.places)} places reporting · ${formatShare(brief.reporting.coverage)} of booths in`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label={`${forParty ?? "—"} votes`}
          value={brief.onBallot ? formatNumber(brief.votes) : "—"}
          of={formatNumber(brief.cast)}
          icon={Vote}
          foot={
            brief.onBallot
              ? `${party?.name ?? forParty} · counted, not projected`
              : `${forParty} is not on this ballot`
          }
        />
        <Tile
          label="Vote share"
          value={brief.share === null ? "—" : formatShare(brief.share)}
          share={brief.share ?? 0}
          icon={Percent}
          foot={`of the ${formatNumber(brief.cast)} votes counted so far`}
        />
        <Tile
          label="Turnout"
          value={brief.turnout === null ? "—" : formatShare(brief.turnout)}
          share={brief.turnout ?? 0}
          icon={Users}
          foot={`${formatNumber(brief.registered)} on the register where returns arrived`}
        />
        <Tile
          label="Margin"
          value={
            brief.margin === null
              ? "—"
              : `${brief.margin.share > 0 ? "+" : "−"}${formatShare(Math.abs(brief.margin.share))}`
          }
          tone={brief.standing === "leading" ? "good" : brief.standing === "trailing" ? "alert" : "ink"}
          icon={Scale}
          foot={
            brief.margin === null
              ? "No rival to measure against"
              : `${brief.standing === "leading" ? "ahead of" : "behind"} ${brief.margin.against} by ${formatNumber(Math.abs(brief.margin.votes))} votes`
          }
        />
      </div>

      {/* Who is where, over everything on screen. The bar rather than a table
          because the only question it answers is relative size. */}
      <Panel title={`The count in ${place}`} figure={`${formatNumber(brief.cast)} votes`}>
        <Split
          segments={brief.ranked.map((item) => ({
            id: item.id,
            label: item.id,
            value: item.votes,
            color: PARTY_FILL[item.id] ?? "var(--color-party-other)",
          }))}
          total={brief.cast}
        />
      </Panel>

      {/* ─────────────────────────────────────────────────────────── recorded */}
      {brief.historical ? (
        <>
          <Band
            title="Recorded"
            note={`The same ${formatNumber(brief.historical.places)} place${brief.historical.places === 1 ? "" : "s"} in ${brief.historical.label}, so the comparison is like for like`}
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              label={`${brief.historical.label} share`}
              value={formatShare(brief.historical.share)}
              icon={Flag}
              foot={`${formatNumber(brief.historical.votes)} of ${formatNumber(brief.historical.cast)} votes`}
            />
            <Tile
              label="Swing"
              value={`${brief.swing > 0 ? "+" : brief.swing < 0 ? "−" : ""}${formatShare(Math.abs(brief.swing))}`}
              tone={brief.swing > 0 ? "good" : brief.swing < 0 ? "alert" : "ink"}
              icon={TrendingUp}
              foot={`against ${brief.historical.label}, in points of vote share`}
            />
            <Tile
              label="Places improved"
              value={formatNumber(brief.places.filter((row) => row.swing > 0).length)}
              of={formatNumber(brief.places.filter((row) => row.swing !== null).length)}
              icon={ArrowUpRight}
              foot="doing better here than last time"
            />
            <Tile
              label="Places gone back"
              value={formatNumber(brief.places.filter((row) => row.swing < 0).length)}
              of={formatNumber(brief.places.filter((row) => row.swing !== null).length)}
              tone="alert"
              icon={TrendingDown}
              foot="doing worse here than last time"
            />
          </div>
        </>
      ) : (
        <p className="rounded-dash border border-dash-line bg-dash-card px-4 py-3 text-[0.8125rem] leading-relaxed text-dash-muted">
          <strong className="text-dash-ink">No history at this level.</strong> Past results are
          published by state and no deeper, so there is nothing recorded to compare{" "}
          {place} against. The swing, and everything derived from it, is left out rather than drawn
          at zero — a flat line here would say these places have not moved, and the truth is that
          nobody knows.
        </p>
      )}

      {/* ─────────────────────────────────────────────────────────── modelled */}
      <Band
        title="Modelled"
        note={
          brief.projected
            ? `Assuming the ground still to report votes like the ground that has, on ${brief.projected.basis}`
            : "Not enough has reported to project from"
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Projected votes"
          value={brief.projected ? formatNumber(brief.projected.votes) : "—"}
          icon={Crosshair}
          foot={
            brief.projected && brief.projected.low !== null
              ? `between ${formatNumber(brief.projected.low)} and ${formatNumber(brief.projected.high)}`
              : "an estimate, not a count"
          }
        />
        <Tile
          label="Projected share"
          value={brief.projected ? formatShare(brief.projected.share) : "—"}
          icon={Percent}
          foot={
            brief.projected && brief.projected.shareLow !== null
              ? `${formatShare(brief.projected.shareLow)} to ${formatShare(brief.projected.shareHigh)}, narrowing as booths report`
              : "an estimate, not a count"
          }
        />
        <Tile
          label="Target votes"
          value={brief.target ? formatNumber(brief.target.votes) : "—"}
          share={brief.target ? Math.min(100, brief.target.progress) : null}
          icon={Target}
          foot={
            brief.target
              ? brief.target.met
                ? `on course, ${formatNumber(-brief.target.gap)} clear`
                : `${formatNumber(brief.target.gap)} short at ${formatShare(targetShare)}`
              : "Set a target share above"
          }
        />
        <Tile
          label="Five points of turnout"
          value={mobilise ? formatNumber(mobilise.mine) : "—"}
          icon={Users}
          foot={
            mobilise
              ? `votes to ${forParty} if ${formatNumber(mobilise.extraVotes)} more people vote and split as today`
              : "No register to work from"
          }
        />
      </div>

      {/* ────────────────────────────────────────────────────────── the ground */}
      <Band title="The ground" note="Every place on screen, in one of five classes. The map draws the same five." />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel
          title={`${place}, classified`}
          figure={`${formatNumber(brief.reporting.places)} place${brief.reporting.places === 1 ? "" : "s"}`}
          foot={`Held by more than ${brief.bounds.commanding} points is a stronghold; inside ${brief.bounds.competitive} either way is a contest.`}
        >
          <Split
            segments={classes
              .filter((row) => row.places > 0)
              .map((row) => ({
                id: row.id,
                label: row.label,
                value: row.places,
                color: row.fill,
              }))}
            total={brief.reporting.places}
          />

          <ul className="mt-4 space-y-1">
            {classes.map((row) => (
              <li key={row.id}>
                <Readout
                  label={`${row.dot} ${row.label}`}
                  value={formatNumber(row.places)}
                  sub={row.registered ? `${formatNumber(row.registered)} registered` : undefined}
                  onClick={onGo ? () => onGo("parties") : undefined}
                />
              </li>
            ))}
          </ul>
        </Panel>

        {/* The one press this whole screen exists to produce. */}
        <Panel
          title="Where the next week goes"
          figure={`top ${Math.min(10, brief.growth.length)}`}
          foot="Ranked by register, closeness, missing turnout, headroom and momentum — the workings are on every row."
        >
          {brief.growth.length === 0 ? (
            <p className="text-[0.875rem] text-dash-muted">Nothing has reported to rank yet.</p>
          ) : (
            <>
              <ol className="space-y-2.5">
                {brief.growth.slice(0, 10).map((row, index) => (
                  <li key={row.key}>
                    <button
                      type="button"
                      onClick={() => onOpen?.(row)}
                      className={cn(
                        "w-full rounded-dash-sm px-1.5 py-1 text-left transition-colors",
                        "hover:bg-dash-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[0.8125rem] font-semibold text-dash-ink">
                          <span className="mr-1.5 text-dash-muted tabular-nums">{index + 1}.</span>
                          {row.name}
                        </span>
                        <span className="figure shrink-0 text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                          {row.opportunity.score}
                        </span>
                      </span>
                      <Meter share={row.opportunity.score} height={4} className="mt-1" />
                      <span className="mt-1 block truncate text-[0.6875rem] text-dash-muted">
                        {CLASS_OF[row.class].dot} {formatNumber(row.registered)} registered ·{" "}
                        {row.turnout === null ? "no turnout" : `${formatShare(row.turnout)} out`} ·{" "}
                        {row.margin === null
                          ? "no margin"
                          : `${row.margin > 0 ? "+" : "−"}${formatShare(Math.abs(row.margin))}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>

              {pathOf && (
                <div className="mt-3">
                  <AddToPlan
                    paths={brief.growth.slice(0, 10).map((row) => pathOf(row)).filter(Boolean)}
                    reason={`Top of the opportunity ranking for ${forParty} in ${place}`}
                    from="Strategic brief"
                    label={`Add the top ${Math.min(10, brief.growth.length)} to plan`}
                  />
                </div>
              )}
            </>
          )}
        </Panel>
      </div>

      {/* The three lists a campaign argues over, side by side, because the
          argument is always about the trade between them. */}
      <div className="grid gap-3 lg:grid-cols-3">
        <PlaceList
          klass="STRONGHOLD"
          rows={brief.strongholds}
          note="Held comfortably. The work here is turnout, not persuasion."
          onOpen={onOpen}
          pathOf={pathOf}
          forParty={forParty}
        />
        <PlaceList
          klass="COMPETITIVE"
          rows={brief.battlegrounds}
          note="Closest first. These decide the result."
          onOpen={onOpen}
          pathOf={pathOf}
          forParty={forParty}
        />
        <PlaceList
          klass="WEAK"
          rows={brief.weak}
          note="Behind by a distance and not moving. Costed before it is committed to."
          onOpen={onOpen}
          pathOf={pathOf}
          forParty={forParty}
        />
      </div>

      <p className="px-1 text-[0.75rem] leading-relaxed text-dash-muted">
        Counted figures are our agents&rsquo; returns and nothing else — they are never merged with
        the commission&rsquo;s. Recorded figures are the published result of the election named
        above. Everything under <strong className="text-dash-ink">Modelled</strong> is an estimate
        under the assumptions at the top of this screen, and changes when they do.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

/**
 * The rule that separates counted from recorded from modelled.
 *
 * A heading rather than a colour, because the distinction has to survive a
 * photograph of the screen, a projector, and a reader who is colour blind.
 */
function Band({ title, note }) {
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-dash-line pb-1.5">
      <h3 className="text-[0.6875rem] font-bold tracking-[0.16em] text-dash-ink uppercase">
        {title}
      </h3>
      {note && <p className="text-[0.75rem] text-dash-muted">{note}</p>}
    </div>
  );
}

/** One of the assumptions, as a number somebody can type over. */
function Assumption({ label, value, onChange, hint }) {
  return (
    <label className="flex items-center gap-2" title={hint}>
      <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
        {label}
      </span>
      <span className="flex items-baseline">
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            /* An empty box reads as 0 and would silently retarget the whole
               screen at nothing. Out-of-range is refused rather than clamped,
               so the figure on screen is always the one that was typed. */
            if (Number.isFinite(next) && next >= 0 && next <= 100) onChange(next);
          }}
          className="figure w-14 rounded-dash-sm border border-dash-line bg-dash-bg px-2 py-1 text-[0.8125rem] font-bold text-dash-ink tabular-nums"
        />
        <span className="ml-1 text-[0.8125rem] text-dash-muted">%</span>
      </span>
    </label>
  );
}

/** One class's places, as a list somebody can act on. */
function PlaceList({ klass, rows, note, onOpen, pathOf, forParty }) {
  const meta = CLASS_OF[klass];
  const shown = rows.slice(0, 8);

  return (
    <Panel title={`${meta.dot} ${meta.label}`} figure={formatNumber(rows.length)} foot={note}>
      {rows.length === 0 ? (
        <p className="text-[0.875rem] text-dash-muted">None on screen.</p>
      ) : (
        <>
          <ul className="space-y-0.5">
            {shown.map((row) => (
              <li key={row.key}>
                <Readout
                  label={row.name}
                  value={
                    row.margin === null
                      ? "—"
                      : `${row.margin > 0 ? "+" : "−"}${formatShare(Math.abs(row.margin))}`
                  }
                  sub={row.swing === null ? undefined : `${row.swing > 0 ? "+" : "−"}${formatShare(Math.abs(row.swing))} vs last`}
                  tone={meta.tone === "muted" ? "ink" : meta.tone}
                  onClick={onOpen ? () => onOpen(row) : undefined}
                />
              </li>
            ))}
          </ul>

          {rows.length > shown.length && (
            <p className="mt-2 text-[0.75rem] text-dash-muted">
              and {formatNumber(rows.length - shown.length)} more
            </p>
          )}

          {pathOf && (
            <div className="mt-3">
              <AddToPlan
                paths={rows.map((row) => pathOf(row)).filter(Boolean)}
                reason={`${meta.label} for ${forParty}: ${meta.why}`}
                from="Strategic brief"
                label={`Add ${rows.length} to plan`}
              />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
