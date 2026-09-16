"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Download,
  Layers,
  Loader2,
  MapPin,
  Percent,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import AddToPlan from "./AddToPlan";
import UnitMap from "./UnitMap";
import { ShapeMap } from "./Strongholds";
import { PARTY_FILL } from "./Charts";
import { download, stamped, toCsv } from "@/lib/csv";
import {
  CLASSES,
  CLASS_OF,
  baselineFrom,
  classBreakdown,
  executiveBrief,
  turnoutScenario,
} from "@/lib/executive";
import { MAPPABLE, electionOf } from "@/lib/behaviour";
import { lastGovernorships } from "@/lib/record";
import { ADAMAWA, DECLARED as ADAMAWA_DECLARED } from "@/lib/adamawa";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/* The last governorship in every state we hold figures for, built once. The
   off-cycle table plus the states transcribed one by one. */
const GOVERNORSHIPS = lastGovernorships({
  extra: ADAMAWA_DECLARED.filter((row) => row.race === "GOVERNORSHIP").map((row) => ({
    code: ADAMAWA.code,
    state: "Adamawa",
    votes: row.votes,
    votesOn: row.votesOn,
  })),
});

/* How each contest is named in a sentence on this screen. */
const CONTEST_WORD = {
  PRESIDENTIAL: "presidential",
  GOVERNORSHIP: "governorship",
  SENATE: "Senate",
  REPRESENTATIVES: "House of Representatives",
  ASSEMBLY: "House of Assembly",
  LGA: "local government",
};

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
 * ── LAID OUT LIKE STRONGHOLDS, ON PURPOSE ───────────────────────────────────
 * The choices on a rail, the ground on one big dark map that walks down the
 * same levels the room does, the figures a reader quotes along the top, and
 * the places to act on in a list underneath. A reader who has learnt one of
 * the two analytics screens has learnt the other.
 *
 * ── THE THREE KINDS OF NUMBER, KEPT APART ON PURPOSE ───────────────────────
 *   COUNTED    votes, share, turnout, margin. Arithmetic on returns.
 *   RECORDED   the same ground last time, and the swing between them.
 *   MODELLED   the projection and anything derived from it, including the
 *              target, which is only a number once you assume a turnout.
 *
 * A reader who takes a modelled figure for a counted one will say it out
 * loud as a fact. So the three sit in three separately headed groups, and the
 * heading says what each is in words.
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
export function useBrief({ rows = [], slots = [], level = "nation", race = "PRESIDENTIAL" } = {}) {
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
        if (Number.isFinite(kept.compareTo) || typeof kept.compareTo === "string") setCompareTo(kept.compareTo);
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
     Always the same kind of contest as the count on screen. A presidential
     count is held against a past presidential election; a governorship count
     against the last governorship in each state. No Senate, House or council
     vote is published anywhere, so those have nothing to compare against and
     say so rather than borrowing another election's swing.

     And only at national level: past results are recorded by state and no
     deeper, so below a state the comparison is switched off rather than drawn
     flat at zero. See lib/history.js and lib/record.js. */
  const contest = String(race ?? "PRESIDENTIAL").toUpperCase();
  const comparable = useMemo(() => {
    if (level !== "nation") return [];
    if (contest === "PRESIDENTIAL") return MAPPABLE.map((election) => ({ id: election.year, label: String(election.year) }));
    if (contest === "GOVERNORSHIP" && GOVERNORSHIPS.rows.length) {
      return [{ id: "GOVERNORSHIP", label: "Last governorship" }];
    }
    return [];
  }, [level, contest]);

  /* A choice remembered from another contest is not a choice about this one,
     so it only counts when it is on this list. */
  const baselineYear =
    comparable.find((option) => option.id === compareTo)?.id ??
    comparable.at(-2)?.id ??
    comparable.at(-1)?.id ??
    null;

  const baseline = useMemo(() => {
    if (!baselineYear || !forParty) return null;
    return baselineFrom(baselineYear === "GOVERNORSHIP" ? GOVERNORSHIPS : electionOf(baselineYear), forParty);
  }, [baselineYear, forParty]);

  const baselineLabel =
    baselineYear === "GOVERNORSHIP" ? "last governorship" : baselineYear ? String(baselineYear) : null;

  const brief = useMemo(
    () =>
      executiveBrief({
        rows,
        slots,
        forParty,
        baseline,
        baselineLabel,
        targetShare,
        expectedTurnout,
      }),
    [rows, slots, forParty, baseline, baselineLabel, targetShare, expectedTurnout]
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
    race: contest,
    level,
  };
}

/* ═══════════════════════════════════════════════════════════════ the lenses */

const LENSES = [
  {
    id: "class",
    label: "Classification",
    icon: Layers,
    why: "Stronghold, competitive, opportunity or weak — for the party chosen above.",
  },
  { id: "share", label: "Vote share", icon: Percent, why: "The party's share of the votes counted in each place." },
  { id: "swing", label: "Swing", icon: TrendingUp, why: "Better or worse than the election it is compared against." },
  { id: "turnout", label: "Turnout", icon: Users, why: "How much of the register came out to vote." },
  {
    id: "growth",
    label: "Where next week goes",
    icon: Target,
    why: "Register, closeness, turnout gap, room to grow and momentum, scored out of 100.",
  },
];

const LENS_OF = Object.fromEntries(LENSES.map((lens) => [lens.id, lens]));

/* Lifted clear of the board, so a silent place is still a shape on the map.
   The same value the stronghold map uses. */
const SILENT = "oklch(31% 0.014 266.6)";
const UP = "var(--color-class-stronghold)";
const DOWN = "var(--color-class-weak)";
const TURNOUT_FILL = "oklch(74.6% 0.16 232.7)";
const GROWTH_FILL = "var(--color-class-opportunity)";

/** More is darker, and nothing is ever drawn so faint it reads as silent. */
const ramp = (fraction) => 0.22 + 0.78 * Math.max(0, Math.min(1, fraction));

const signed = (value) =>
  value === null || value === undefined ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatShare(Math.abs(value))}`;

/* The opportunity score's five parts, named the way a director says them. */
const PARTS = [
  { id: "reach", label: "Registered voters" },
  { id: "closeness", label: "Close contest" },
  { id: "turnoutRoom", label: "Turnout gap" },
  { id: "headroom", label: "Room to grow" },
  { id: "momentum", label: "Moving our way" },
];

const PAGE = 25;

/* ═════════════════════════════════════════════════════════════════ screen */

export default function Executive({
  /* The brief and its assumptions, from `useBrief` above. The room owns them
     because the map draws the same classification. */
  state,
  /* Where we are standing, in words. */
  place = "Nigeria",
  /* What position in each row's `votes` means which party, from the board.
     Only for the picker; the arithmetic already has them. */
  slots = [],
  /* Show a place on the room's results map. */
  onOpen,
  /* The path to a place, for the plan. Built by the room, which is the only
     thing that knows where it is standing. */
  pathOf,
  /* The room's own map at the depth it is standing: the outlines, the trail,
     and how to walk one level down. The brief's places are the room's rows,
     so whatever the room can draw, this can colour. */
  map = null,
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
    race = "PRESIDENTIAL",
  } = state;

  const contestWord = CONTEST_WORD[race] ?? "past";

  const [lens, setLens] = useState("class");
  const [shown, setShown] = useState(CLASSES.map((item) => item.id));
  const [hovered, setHovered] = useState(null);
  const [list, setList] = useState("growth");
  const [paging, setPaging] = useState({ key: "", count: PAGE });

  const classes = useMemo(() => classBreakdown(brief), [brief]);
  const mobilise = useMemo(() => turnoutScenario(brief, 5), [brief]);

  const party = slots.find((item) => item.id === forParty) ?? null;
  const colour = PARTY_FILL[forParty] ?? "var(--color-dash-ink)";
  const level = map?.level ?? "nation";

  /* Swing needs a baseline, and below a state there is none. The lens falls
     back rather than drawing a map of blanks under a button that looks live. */
  const hasSwing = brief.places.some((row) => row.swing !== null);
  const active = lens === "swing" && !hasSwing ? "class" : lens;

  /* ── THE PLACES ON THE MAP, JOINED TO THEIR OUTLINES ──────────────────── */
  const mapRows = useMemo(() => {
    const outlines =
      level === "nation"
        ? new Map((map?.shapes?.states ?? []).map((shape) => [shape.code, shape.d]))
        : level === "state"
          ? new Map((map?.shapes?.paths ?? []).map((shape) => [shape.name, shape.d]))
          : null;

    return brief.places.map((row) => ({
      key: row.key,
      name: row.name,
      place: row,
      d: outlines ? (outlines.get(level === "nation" ? (row.code ?? row.key) : row.name) ?? null) : null,
    }));
  }, [brief, level, map?.shapes]);

  /* The top of each scale is the top of what is on screen, so the darkest
     shade always means "the most, here". */
  const extent = useMemo(() => {
    const top = (pick) =>
      Math.max(0.0001, ...brief.places.filter((row) => row.reported).map((row) => Math.abs(pick(row) ?? 0)));
    return {
      share: top((row) => row.share),
      swing: top((row) => row.swing),
      turnout: top((row) => row.turnout),
      growth: top((row) => row.opportunity?.score),
    };
  }, [brief]);

  const paintOf = (row) => {
    const here = row.place;
    if (!here.reported) return { fill: SILENT, opacity: 1 };
    if (active === "class") {
      return shown.includes(here.class) && here.class !== "UNKNOWN"
        ? { fill: CLASS_OF[here.class].fill, opacity: 1 }
        : { fill: SILENT, opacity: 1 };
    }
    if (active === "share") {
      return here.share === null ? { fill: SILENT, opacity: 1 } : { fill: colour, opacity: ramp(here.share / extent.share) };
    }
    if (active === "swing") {
      return here.swing === null
        ? { fill: SILENT, opacity: 1 }
        : { fill: here.swing >= 0 ? UP : DOWN, opacity: ramp(Math.abs(here.swing) / extent.swing) };
    }
    if (active === "turnout") {
      return here.turnout === null
        ? { fill: SILENT, opacity: 1 }
        : { fill: TURNOUT_FILL, opacity: ramp(here.turnout / extent.turnout) };
    }
    return here.opportunity
      ? { fill: GROWTH_FILL, opacity: ramp(here.opportunity.score / extent.growth) }
      : { fill: SILENT, opacity: 1 };
  };

  const noteOf = (here) => {
    if (!here.reported) return "nothing reported";
    if (active === "share") return `${forParty} ${here.share === null ? "—" : formatShare(here.share)}`;
    if (active === "swing") return `swing ${signed(here.swing)}`;
    if (active === "turnout") return `turnout ${here.turnout === null ? "—" : formatShare(here.turnout)}`;
    if (active === "growth") return `score ${here.opportunity?.score ?? "—"}`;
    return `${CLASS_OF[here.class].label} · margin ${signed(here.margin)}`;
  };

  /* ── THE LIST ─────────────────────────────────────────────────────────── */
  const lists = useMemo(
    () => [
      { id: "growth", label: "Where next week goes", rows: brief.growth },
      { id: "STRONGHOLD", label: CLASS_OF.STRONGHOLD.label, rows: brief.strongholds },
      { id: "COMPETITIVE", label: CLASS_OF.COMPETITIVE.label, rows: brief.battlegrounds },
      {
        id: "OPPORTUNITY",
        label: CLASS_OF.OPPORTUNITY.label,
        rows: brief.places
          .filter((row) => row.class === "OPPORTUNITY")
          .sort((a, b) => (b.opportunity?.score ?? 0) - (a.opportunity?.score ?? 0)),
      },
      { id: "WEAK", label: CLASS_OF.WEAK.label, rows: brief.weak },
      {
        id: "UNKNOWN",
        label: "Not reported",
        rows: brief.places.filter((row) => !row.reported).sort((a, b) => (b.registered ?? 0) - (a.registered ?? 0)),
      },
    ],
    [brief]
  );
  const current = lists.find((entry) => entry.id === list) ?? lists[0];
  const listKey = `${list}|${forParty}|${place}`;
  const count = paging.key === listKey ? paging.count : PAGE;

  const hoverRow = mapRows.find((row) => row.key === hovered) ?? null;
  const canDrill = Boolean(map?.onDrill) && (map?.canDrill ?? true);

  const openPlace = (here) => {
    if (canDrill) {
      setHovered(null);
      map.onDrill(here);
    } else {
      setHovered(here.key);
    }
  };

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

  const exportList = () => {
    download(
      stamped(`brief-${(forParty ?? "party").toLowerCase()}-${current.id.toLowerCase()}`),
      toCsv(
        current.rows.map((row, index) => ({ ...row, rank: index + 1 })),
        [
          ["Rank", (row) => row.rank],
          ["Place", (row) => row.name],
          ["Class", (row) => CLASS_OF[row.class]?.label ?? ""],
          [`${forParty} share`, (row) => row.share ?? ""],
          ["Margin", (row) => row.margin ?? ""],
          ["Swing", (row) => row.swing ?? ""],
          ["Turnout", (row) => row.turnout ?? ""],
          ["Registered", (row) => row.registered ?? ""],
          ["Opportunity score", (row) => row.opportunity?.score ?? ""],
        ]
      )
    );
  };

  const crumbs = map?.crumbs?.length ? map.crumbs : [{ label: place, go: () => {} }];
  const LensIcon = LENS_OF[active].icon;

  return (
    <div className="flex flex-col gap-3">
      {/* ═════════════════════════════════════════════════════ the headline */}
      <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr_1fr]">
        <Group title="Counted" note={`${formatNumber(brief.reporting.reported)} of ${formatNumber(brief.reporting.places)} places in`}>
          <Big
            label={`${forParty ?? "—"} votes`}
            value={brief.onBallot ? formatNumber(brief.votes) : "—"}
            sub={brief.onBallot ? `of ${formatNumber(brief.cast)} counted` : `${forParty} is not on this ballot`}
            accent={colour}
          />
          <Big label="Vote share" value={brief.share === null ? "—" : formatShare(brief.share)} sub="of votes counted" />
          <Big label="Turnout" value={brief.turnout === null ? "—" : formatShare(brief.turnout)} sub="where returns arrived" />
          <Big
            label="Margin"
            value={brief.margin === null ? "—" : signed(brief.margin.share)}
            tone={brief.standing === "leading" ? "good" : brief.standing === "trailing" ? "alert" : "ink"}
            sub={
              brief.margin === null
                ? "no rival to measure"
                : `${brief.standing === "leading" ? "ahead of" : "behind"} ${brief.margin.against}`
            }
          />
        </Group>

        <Group
          title="Recorded"
          note={brief.historical ? `the same places in ${brief.historical.label}` : "no past result at this level"}
        >
          {brief.historical ? (
            <>
              <Big label={`${brief.historical.label} share`} value={formatShare(brief.historical.share)} sub="last time" />
              <Big
                label="Swing"
                value={signed(brief.swing)}
                tone={brief.swing > 0 ? "good" : brief.swing < 0 ? "alert" : "ink"}
                sub="points of share"
              />
              <Big
                label="Improved"
                value={formatNumber(brief.places.filter((row) => row.swing > 0).length)}
                sub={`of ${formatNumber(brief.places.filter((row) => row.swing !== null).length)} places`}
                tone="good"
              />
              <Big
                label="Gone back"
                value={formatNumber(brief.places.filter((row) => row.swing < 0).length)}
                sub={`of ${formatNumber(brief.places.filter((row) => row.swing !== null).length)} places`}
                tone="alert"
              />
            </>
          ) : (
            <p className="col-span-2 text-[0.8125rem] leading-relaxed text-dash-muted">
              {race === "PRESIDENTIAL"
                ? `Past results are published by state and no deeper, so nothing in ${place} can be compared.`
                : race === "GOVERNORSHIP"
                  ? comparable.length
                    ? `None of the states counted here has a past governorship result on record yet.`
                    : `Governorship results are declared for a whole state and nothing below it, so nothing in ${place} can be compared.`
                  : `No past ${contestWord} vote is published for these places, so there is nothing to compare against.`}{" "}
              The swing is left out rather than drawn at zero — it is never measured against a different
              kind of election.
            </p>
          )}
        </Group>

        <Group
          title="Modelled"
          note={brief.projected ? "an estimate, under the assumptions on the left" : "not enough in to project"}
        >
          <Big
            label="Projected share"
            value={brief.projected ? formatShare(brief.projected.share) : "—"}
            sub={
              brief.projected && brief.projected.shareLow !== null
                ? `${formatShare(brief.projected.shareLow)} to ${formatShare(brief.projected.shareHigh)}`
                : "estimate"
            }
          />
          <Big
            label="Projected votes"
            value={brief.projected ? formatNumber(brief.projected.votes) : "—"}
            sub="estimate"
          />
          <Big
            label="Target votes"
            value={brief.target ? formatNumber(brief.target.votes) : "—"}
            sub={
              brief.target
                ? brief.target.met
                  ? `on course, ${formatNumber(-brief.target.gap)} clear`
                  : `${formatNumber(brief.target.gap)} short`
                : "set a target"
            }
            bar={brief.target ? Math.min(100, brief.target.progress) : null}
            tone={brief.target?.met ? "good" : "ink"}
          />
          <Big
            label="+5 points turnout"
            value={mobilise ? `+${formatNumber(mobilise.mine)}` : "—"}
            sub={mobilise ? `votes to ${forParty}` : "no register"}
          />
        </Group>
      </div>

      <div className="grid gap-3 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:items-start">
        {/* ═══════════════════════════════════════════════════════ the rail */}
        <aside className="flex flex-col gap-3" aria-label="What the brief is for">
          <RailCard step="1" title="Brief for">
            <div className="grid grid-cols-3 gap-1.5">
              {slots.map((item) => {
                const on = item.id === forParty;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setForParty(item.id)}
                    title={item.name}
                    className={cn(
                      "rounded-dash-sm border px-2 py-2 text-[0.75rem] font-bold transition-colors",
                      on ? "border-transparent text-white" : "border-dash-line text-dash-ink hover:border-dash-ink"
                    )}
                    style={on ? { background: PARTY_FILL[item.id] ?? "var(--color-dash-ink)" } : undefined}
                  >
                    {item.id}
                  </button>
                );
              })}
            </div>
            {party?.name && <p className="mt-1.5 truncate text-[0.6875rem] text-dash-muted">{party.name}</p>}
          </RailCard>

          <RailCard step="2" title="Assumptions">
            <div className="flex flex-col gap-2">
              <Assumption
                label="Target share"
                value={targetShare}
                onChange={setTargetShare}
                hint="The share this campaign is aiming at, turned into votes against the expected turnout."
              />
              <Assumption
                label="Expected turnout"
                value={expectedTurnout}
                onChange={setExpectedTurnout}
                hint="The turnout this contest should reach. Every projected figure is counted against it."
              />
              {comparable.length > 0 && (
                <label className="flex items-center justify-between gap-2">
                  <span className="text-[0.75rem] font-bold text-dash-ink">Compare with</span>
                  <select
                    value={baselineYear ?? ""}
                    onChange={(event) => {
                      const picked = comparable.find((option) => String(option.id) === event.target.value);
                      if (picked) setCompareTo(picked.id);
                    }}
                    className="rounded-dash-sm border border-dash-line bg-dash-bg px-2 py-1 text-[0.8125rem] font-bold text-dash-ink"
                  >
                    {comparable.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </RailCard>

          <RailCard step="3" title="Map shows">
            <div className="flex flex-col gap-1.5">
              {LENSES.map((item) => {
                const Icon = item.icon;
                const on = active === item.id;
                const off = item.id === "swing" && !hasSwing;
                return (
                  <div key={item.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={off}
                      onClick={() => setLens(item.id)}
                      title={off ? "No past result at this level to compare against." : item.why}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-dash-sm border px-2.5 py-2 text-left text-[0.8125rem] font-bold transition-colors",
                        on
                          ? "border-dash-ink bg-dash-ink text-white"
                          : "border-dash-line text-dash-ink hover:border-dash-ink disabled:cursor-not-allowed disabled:opacity-40"
                      )}
                    >
                      <Icon size={14} aria-hidden="true" />
                      {item.label}
                    </button>

                    {on && item.id === "class" && (
                      <div className="mt-1.5 flex flex-col gap-1">
                        {classes
                          .filter((row) => row.id !== "UNKNOWN")
                          .map((row) => {
                            const lit = shown.includes(row.id);
                            return (
                              <button
                                key={row.id}
                                type="button"
                                aria-pressed={lit}
                                title={row.why}
                                onClick={() =>
                                  setShown((was) =>
                                    was.includes(row.id)
                                      ? was.length === 1
                                        ? CLASSES.map((entry) => entry.id)
                                        : was.filter((id) => id !== row.id)
                                      : [...was, row.id]
                                  )
                                }
                                className={cn(
                                  "flex items-center gap-2 rounded-dash-sm px-2 py-1.5 text-left transition-colors hover:bg-dash-bg",
                                  !lit && "opacity-45"
                                )}
                              >
                                <span aria-hidden="true" className="size-3 shrink-0 rounded-[3px]" style={{ background: row.fill }} />
                                <span className="flex-1 text-[0.75rem] font-bold text-dash-ink">{row.label}</span>
                                <span className="figure text-[0.75rem] font-bold text-dash-ink tabular-nums">
                                  {formatNumber(row.places)}
                                </span>
                              </button>
                            );
                          })}
                        <p className="px-2 text-[0.6875rem] leading-snug text-dash-muted">
                          Click a class to hide or show it.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </RailCard>
        </aside>

        {/* ════════════════════════════════════════════════════════ the map */}
        <section className="on-board order-first flex h-[min(78dvh,40rem)] flex-col overflow-hidden rounded-dash border border-board-line bg-board lg:sticky lg:top-[calc(var(--dash-top,4.5rem)+0.75rem)] lg:order-none lg:h-[calc(100dvh-var(--dash-top,4.5rem)-1.5rem)] lg:min-h-[34rem]">
          <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1 border-b border-board-line px-4 py-2.5">
            {crumbs.map((crumb, index) => (
              <span key={`${index}-${crumb.label}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={13} className="shrink-0 text-white/40" />}
                <button
                  type="button"
                  onClick={crumb.go}
                  className={cn(
                    "rounded-dash-sm px-2 py-1 text-[0.8125rem] font-semibold transition-colors",
                    index === crumbs.length - 1 ? "text-white" : "text-white/55 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
            <span className="ml-auto flex items-center gap-1.5 pl-2 text-[0.75rem] text-white/55">
              <LensIcon size={13} aria-hidden="true" />
              {LENS_OF[active].label}
              {canDrill ? " · tap a place to go in" : ""}
            </span>
          </nav>

          <div className="relative flex min-h-0 flex-1">
            <div className="relative min-h-0 min-w-0 flex-1">
              <div className="absolute inset-0 p-2 xl:p-4">
                {map?.loading ? (
                  <p className="flex h-full items-center justify-center gap-2 text-[0.875rem] text-white/60">
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    Loading boundaries…
                  </p>
                ) : level === "nation" || level === "state" ? (
                  <ShapeMap
                    rows={mapRows}
                    paintOf={paintOf}
                    hovered={hovered}
                    onHover={setHovered}
                    onOpen={(row) => openPlace(row.place)}
                    describe={(row) => `${row.name}: ${noteOf(row.place)}`}
                  />
                ) : map?.outline?.length ? (
                  <UnitMap
                    outline={map.outline}
                    parentLabel={crumbs.at(-1)?.label}
                    childWord={level === "lga" ? "ward" : "polling unit"}
                    tint={colour}
                    hovered={hovered}
                    onHover={setHovered}
                    onOpen={(cell) => {
                      const row = mapRows.find((entry) => entry.key === cell.key);
                      if (row) openPlace(row.place);
                    }}
                    rows={mapRows.map((row) => ({
                      key: row.key,
                      name: row.name,
                      value: row.place.registered,
                      note: noteOf(row.place),
                      paint: paintOf(row),
                    }))}
                  />
                ) : (
                  <p className="flex h-full items-center justify-center px-6 text-center text-[0.875rem] text-white/60">
                    No outline is held for this place. The list below has every figure.
                  </p>
                )}
              </div>
            </div>

            {/* The key and the figures beside the map on a wide screen, over its
                corners on a narrower one — the same arrangement as Strongholds. */}
            <div className="contents xl:flex xl:w-[17.5rem] xl:shrink-0 xl:flex-col xl:gap-4 xl:overflow-y-auto xl:border-l xl:border-board-line xl:p-4">
              {hoverRow ? (
                <PlaceCard place={hoverRow.place} forParty={forParty} active={active} />
              ) : (
                <ScopeCard brief={brief} place={place} classes={classes} />
              )}
              <Legend active={active} shown={shown} classes={classes} extent={extent} colour={colour} bounds={brief.bounds} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-board-line px-4 py-2.5">
            <Strip label="Showing" value={place} />
            <Strip label="Reporting" value={`${formatNumber(brief.reporting.reported)} of ${formatNumber(brief.reporting.places)}`} />
            <Strip label="Votes counted" value={formatNumber(brief.cast)} />
            <Strip label="Registered" value={formatNumber(brief.registered)} />
          </div>
        </section>
      </div>

      {/* ═══════════════════════════════════════════════════════════ the list */}
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <header className="flex flex-wrap items-center gap-3 border-b border-dash-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
              {current.id === "growth" ? `Where next week goes, for ${forParty}` : `${current.label} places for ${forParty}`}
            </h2>
            <p className="text-[0.75rem] text-dash-muted">
              {current.id === "growth"
                ? "Ranked by register, closeness, turnout gap, room to grow and momentum"
                : CLASS_OF[current.id]?.why}
              {canDrill ? " · click a place to open it on the map" : ""}
            </p>
          </div>

          <div role="tablist" aria-label="Which places" className="ml-auto flex flex-wrap gap-1 rounded-dash-sm border border-dash-line p-1">
            {lists.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={list === entry.id}
                onClick={() => setList(entry.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[0.75rem] font-bold transition-colors",
                  list === entry.id ? "bg-dash-ink text-white" : "text-dash-muted hover:text-dash-ink"
                )}
              >
                {entry.id !== "growth" && (
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-[2px]"
                    style={{ background: entry.id === "UNKNOWN" ? "var(--color-ink-300)" : CLASS_OF[entry.id].fill }}
                  />
                )}
                {entry.label}
                <span className="figure opacity-70 tabular-nums">{entry.rows.length}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {pathOf && current.rows.length > 0 && (
              <AddToPlan
                paths={current.rows.slice(0, current.id === "growth" ? 10 : current.rows.length).map((row) => pathOf(row)).filter(Boolean)}
                reason={
                  current.id === "growth"
                    ? `Top of the opportunity ranking for ${forParty} in ${place}`
                    : `${current.label} for ${forParty}: ${CLASS_OF[current.id]?.why ?? ""}`
                }
                from="Strategic brief"
                label={current.id === "growth" ? `Add top ${Math.min(10, current.rows.length)} to plan` : `Add ${current.rows.length} to plan`}
              />
            )}
            <button
              type="button"
              onClick={exportList}
              disabled={!current.rows.length}
              className="flex items-center gap-1.5 rounded-dash-sm border border-dash-line px-3 py-2 text-[0.75rem] font-bold text-dash-ink transition-colors hover:border-dash-ink disabled:opacity-40"
            >
              <Download size={14} aria-hidden="true" />
              Download
            </button>
          </div>
        </header>

        {current.rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[0.875rem] text-dash-muted">No places in this group.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-[0.8125rem]">
                <thead>
                  <tr className="border-b border-dash-line text-left text-[0.625rem] tracking-[0.08em] text-dash-muted uppercase">
                    <th className="w-10 py-2 pl-4 font-semibold">#</th>
                    <th className="py-2 font-semibold">Place</th>
                    <th className="py-2 font-semibold">Class</th>
                    <th className="py-2 text-right font-semibold">{forParty} share</th>
                    <th className="py-2 text-right font-semibold">Margin</th>
                    <th className="py-2 text-right font-semibold">Swing</th>
                    <th className="py-2 text-right font-semibold">Turnout</th>
                    <th className="py-2 text-right font-semibold">Registered</th>
                    <th className="py-2 pr-4 text-right font-semibold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {current.rows.slice(0, count).map((row, index) => {
                    const klass = CLASS_OF[row.class];
                    return (
                      <tr
                        key={row.key}
                        onClick={() => openPlace(row)}
                        onPointerEnter={() => setHovered(row.key)}
                        onPointerLeave={() => setHovered(null)}
                        className={cn(
                          "cursor-pointer border-b border-dash-line/60 transition-colors last:border-0 hover:bg-dash-bg",
                          hovered === row.key && "bg-dash-bg"
                        )}
                      >
                        <td className="figure py-2 pl-4 text-dash-muted tabular-nums">{index + 1}</td>
                        <td className="py-2">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-bold text-dash-ink">{row.name}</span>
                            {onOpen && (
                              <button
                                type="button"
                                title="Show on the results map"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onOpen(row);
                                }}
                                className="shrink-0 rounded-dash-sm p-1 text-dash-muted hover:bg-dash-well hover:text-dash-ink"
                              >
                                <MapPin size={13} aria-hidden="true" />
                              </button>
                            )}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className="flex items-center gap-1.5 text-dash-ink">
                            <span
                              aria-hidden="true"
                              className="size-2.5 rounded-[2px]"
                              style={{ background: row.class === "UNKNOWN" ? "var(--color-ink-300)" : klass.fill }}
                            />
                            {klass.label}
                          </span>
                        </td>
                        <td className="figure py-2 text-right font-bold text-dash-ink tabular-nums">
                          {row.share === null ? "—" : formatShare(row.share)}
                        </td>
                        <td
                          className={cn(
                            "figure py-2 text-right tabular-nums",
                            row.margin > 0 ? "text-emerald-700" : row.margin < 0 ? "text-red-700" : "text-dash-muted"
                          )}
                        >
                          {signed(row.margin)}
                        </td>
                        <td
                          className={cn(
                            "figure py-2 text-right tabular-nums",
                            row.swing > 0 ? "text-emerald-700" : row.swing < 0 ? "text-red-700" : "text-dash-muted"
                          )}
                        >
                          {signed(row.swing)}
                        </td>
                        <td className="figure py-2 text-right text-dash-ink tabular-nums">
                          {row.turnout === null ? "—" : formatShare(row.turnout)}
                        </td>
                        <td className="figure py-2 text-right text-dash-muted tabular-nums">
                          {formatNumber(row.registered)}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {row.opportunity ? (
                            <span className="figure inline-block min-w-[2.5rem] rounded-dash-sm bg-dash-ink px-1.5 py-0.5 text-center text-[0.75rem] font-bold text-white tabular-nums">
                              {Math.round(row.opportunity.score)}
                            </span>
                          ) : (
                            <span className="text-dash-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {current.rows.length > count && (
              <button
                type="button"
                onClick={() => setPaging({ key: listKey, count: count + PAGE })}
                className="w-full border-t border-dash-line px-4 py-3 text-[0.8125rem] font-bold text-dash-ink hover:bg-dash-bg"
              >
                Show {Math.min(PAGE, current.rows.length - count)} more of {formatNumber(current.rows.length - count)}
              </button>
            )}
          </>
        )}
      </section>

      <p className="px-1 text-[0.75rem] leading-relaxed text-dash-muted">
        Counted figures are our agents&rsquo; {race === "PRESIDENTIAL" ? "" : `${contestWord} `}returns and
        nothing else — they are never merged with the commission&rsquo;s. Recorded figures are the published
        result of the {race === "PRESIDENTIAL" ? "election" : `${contestWord} election`} chosen on the left, and
        only ever the same kind of contest.
        Everything under <strong className="text-dash-ink">Modelled</strong> is an estimate under the
        assumptions on the left, and changes when they do. A place is a stronghold when held by more than{" "}
        {brief.bounds.commanding} points, and competitive inside {brief.bounds.competitive} either way.
      </p>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ pieces */

/** One of the three headline groups: counted, recorded, modelled. */
function Group({ title, note, children }) {
  return (
    <section className="rounded-dash border border-dash-line bg-dash-card p-4">
      <header className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-dash-line pb-2">
        <h3 className="text-[0.6875rem] font-bold tracking-[0.16em] text-dash-ink uppercase">{title}</h3>
        {note && <p className="text-[0.6875rem] text-dash-muted">{note}</p>}
      </header>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </section>
  );
}

function Big({ label, value, sub, tone = "ink", accent = null, bar = null }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 truncate text-[0.625rem] font-bold tracking-[0.08em] text-dash-muted uppercase">
        {accent && <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: accent }} />}
        {label}
      </p>
      <p
        className={cn(
          "figure mt-0.5 truncate text-[1.375rem] leading-tight font-extrabold tracking-[-0.02em] tabular-nums",
          tone === "good" ? "text-emerald-700" : tone === "alert" ? "text-red-700" : "text-dash-ink"
        )}
      >
        {value}
      </p>
      {bar !== null && (
        <span aria-hidden="true" className="mt-1 block h-1 overflow-hidden rounded-full bg-dash-well">
          <span className="block h-full rounded-full bg-dash-ink" style={{ width: `${bar}%` }} />
        </span>
      )}
      {sub && <p className="mt-0.5 truncate text-[0.6875rem] text-dash-muted">{sub}</p>}
    </div>
  );
}

function RailCard({ step, title, children }) {
  return (
    <div className="rounded-dash border border-dash-line bg-dash-card p-3">
      <p className="mb-2 flex items-center gap-2 text-[0.6875rem] font-bold tracking-[0.08em] text-dash-muted uppercase">
        <span className="figure flex size-4 items-center justify-center rounded-full bg-dash-well text-[0.625rem] text-dash-ink">
          {step}
        </span>
        {title}
      </p>
      {children}
    </div>
  );
}

/** One of the assumptions, as a number somebody can type over. */
function Assumption({ label, value, onChange, hint }) {
  return (
    <label className="flex items-center justify-between gap-2" title={hint}>
      <span className="text-[0.75rem] font-bold text-dash-ink">{label}</span>
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
          className="figure w-16 rounded-dash-sm border border-dash-line bg-dash-bg px-2 py-1 text-right text-[0.8125rem] font-bold text-dash-ink tabular-nums"
        />
        <span className="ml-1 text-[0.8125rem] text-dash-muted">%</span>
      </span>
    </label>
  );
}

/** The whole ground on screen, before anything is hovered. Docked only. */
function ScopeCard({ brief, place, classes }) {
  const counted = classes.filter((row) => row.id !== "UNKNOWN");
  return (
    <div className="hidden xl:block">
      <p className="truncate text-[0.9375rem] font-extrabold text-white">{place}</p>
      <p className="text-[0.6875rem] text-white/50">Hover or tap a place for its figures</p>

      <div className="mt-3 border-t border-board-line pt-2.5">
        <p className="text-[0.625rem] font-bold tracking-[0.1em] text-white/55 uppercase">The count</p>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/10">
          {brief.ranked.map((item) => (
            <span
              key={item.id}
              style={{
                width: `${brief.cast ? (item.votes / brief.cast) * 100 : 0}%`,
                background: PARTY_FILL[item.id] ?? "var(--color-party-other)",
              }}
            />
          ))}
        </div>
        <ul className="mt-2 space-y-1">
          {brief.ranked.slice(0, 5).map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-[0.6875rem] text-white/70">
              <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: PARTY_FILL[item.id] ?? "var(--color-party-other)" }} />
              {item.id}
              <span className="figure ml-auto font-bold text-white tabular-nums">
                {formatShare(brief.cast ? (item.votes / brief.cast) * 100 : 0)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 border-t border-board-line pt-2.5">
        <p className="text-[0.625rem] font-bold tracking-[0.1em] text-white/55 uppercase">
          Registered voters by class
        </p>
        <ul className="mt-2 space-y-1">
          {counted.map((row) => (
            <li key={row.id} className="flex items-center gap-2 text-[0.6875rem] text-white/70">
              <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: row.fill }} />
              {row.label}
              <span className="figure ml-auto font-bold text-white tabular-nums">{formatNumber(row.registered)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PlaceCard({ place, forParty, active }) {
  const klass = CLASS_OF[place.class];
  return (
    <div className="pointer-events-none absolute top-3 right-3 z-10 w-[16.5rem] rounded-dash-sm border border-board-line bg-board/90 px-3.5 py-3 backdrop-blur-sm xl:static xl:w-auto xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0 xl:backdrop-blur-none">
      <p className="truncate text-[0.9375rem] font-extrabold text-white">{place.name}</p>
      <p className="mt-2 flex items-center gap-2 text-[0.75rem] font-bold text-white">
        <span
          aria-hidden="true"
          className="block size-3 rounded-[2px]"
          style={{ background: place.class === "UNKNOWN" ? SILENT : klass.fill }}
        />
        {klass.label}
      </p>
      <p className="text-[0.6875rem] leading-snug text-white/55">{klass.why}</p>

      {place.reported && (
        <>
          <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-board-line pt-2.5">
            <Figure label={`${forParty} share`} value={place.share === null ? "—" : formatShare(place.share)} />
            <Figure label="Margin" value={signed(place.margin)} />
            <Figure label="Swing" value={signed(place.swing)} />
            <Figure label="Turnout" value={place.turnout === null ? "—" : formatShare(place.turnout)} />
            <Figure label="Registered" value={formatNumber(place.registered)} />
            <Figure label="Leading" value={place.leader ? `${place.leader.id} ${formatShare(place.leader.share)}` : "—"} />
          </dl>

          {place.opportunity && (
            <div className="mt-2.5 border-t border-board-line pt-2.5">
              <p className="flex items-baseline justify-between">
                <span className="text-[0.625rem] font-bold tracking-[0.1em] text-white/55 uppercase">
                  Opportunity score
                </span>
                <span className="figure text-[1.125rem] font-extrabold text-white">
                  {Math.round(place.opportunity.score)}
                </span>
              </p>
              {active === "growth" && (
                <ul className="mt-1.5 space-y-1">
                  {PARTS.map((part) => (
                    <li key={part.id} className="flex items-center gap-2 text-[0.625rem] text-white/60">
                      <span className="w-[6.5rem] shrink-0 truncate">{part.label}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${place.opportunity[part.id] ?? 0}%`, background: GROWTH_FILL }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Legend({ active, shown, classes, extent, colour, bounds }) {
  return (
    <div className="pointer-events-none absolute right-3 bottom-3 left-3 z-10 rounded-dash-sm bg-board/85 px-3 py-2 backdrop-blur-sm sm:right-auto sm:max-w-[17rem] xl:static xl:mt-auto xl:max-w-none xl:rounded-none xl:border-t xl:border-board-line xl:bg-transparent xl:px-0 xl:pt-4 xl:pb-0 xl:backdrop-blur-none">
      <p className="text-[0.625rem] font-bold tracking-[0.1em] text-white/55 uppercase">{LENS_OF[active].label}</p>

      {active === "class" ? (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 xl:mt-2 xl:block xl:space-y-1.5">
          {classes.map((row) => (
            <Swatch
              key={row.id}
              fill={row.id === "UNKNOWN" ? SILENT : row.fill}
              opacity={row.id === "UNKNOWN" || shown.includes(row.id) ? 1 : 0.2}
              label={`${row.label} · ${formatNumber(row.places)}`}
              sub={
                {
                  STRONGHOLD: `Ahead by more than ${bounds.commanding} points`,
                  COMPETITIVE: `Within ${bounds.competitive} points either way`,
                  OPPORTUNITY: "Behind, but close or moving our way",
                  WEAK: "Behind by a distance, not improving",
                  UNKNOWN: "Nothing reported yet",
                }[row.id]
              }
            />
          ))}
        </ul>
      ) : active === "swing" ? (
        <div className="mt-1.5">
          <div className="flex gap-[2px]">
            {[1, 0.66, 0.33].map((step) => (
              <span key={`d${step}`} className="block h-3 w-5 rounded-[1px]" style={{ background: DOWN, opacity: ramp(step) }} />
            ))}
            {[0.33, 0.66, 1].map((step) => (
              <span key={`u${step}`} className="block h-3 w-5 rounded-[1px]" style={{ background: UP, opacity: ramp(step) }} />
            ))}
          </div>
          <p className="mt-1 flex justify-between text-[0.5625rem] text-white/55">
            <span>−{formatShare(extent.swing)} worse</span>
            <span>better +{formatShare(extent.swing)}</span>
          </p>
          <ul className="mt-1.5">
            <Swatch fill={SILENT} opacity={1} label="Nothing to compare" />
          </ul>
        </div>
      ) : (
        <div className="mt-1.5">
          <div className="flex gap-[2px]">
            {[0, 0.25, 0.5, 0.75, 1].map((step) => (
              <span
                key={step}
                className="block h-3 w-7 rounded-[1px]"
                style={{
                  background: active === "share" ? colour : active === "turnout" ? TURNOUT_FILL : GROWTH_FILL,
                  opacity: ramp(step),
                }}
              />
            ))}
          </div>
          <p className="mt-1 flex justify-between text-[0.5625rem] text-white/55">
            <span>{active === "growth" ? "0" : "0%"}</span>
            <span>
              {active === "share"
                ? formatShare(extent.share)
                : active === "turnout"
                  ? formatShare(extent.turnout)
                  : Math.round(extent.growth)}
            </span>
          </p>
          <p className="mt-0.5 text-[0.5625rem] leading-tight text-white/45">
            {active === "growth" ? "Darker is a better place to spend the next week" : "Darker is higher; the top is the highest on screen"}
          </p>
          <ul className="mt-1.5">
            <Swatch fill={SILENT} opacity={1} label="Nothing reported" />
          </ul>
        </div>
      )}
    </div>
  );
}

function Swatch({ fill, opacity, label, sub = null }) {
  return (
    <li className="flex items-start gap-2 text-[0.6875rem] text-white/80">
      <span aria-hidden="true" className="relative mt-px block size-3 shrink-0 overflow-hidden rounded-[2px] bg-board-raised">
        <span className="absolute inset-0" style={{ background: fill, opacity }} />
      </span>
      <span className="leading-tight">
        <span className="block font-bold">{label}</span>
        {sub && <span className="hidden text-[0.625rem] text-white/50 xl:block">{sub}</span>}
      </span>
    </li>
  );
}

function Figure({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.5625rem] font-bold tracking-[0.08em] text-white/45 uppercase">{label}</dt>
      <dd className="figure truncate text-[0.8125rem] font-bold text-white tabular-nums">{value}</dd>
    </div>
  );
}

function Strip({ label, value }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className="text-[0.625rem] font-bold tracking-[0.1em] text-white/45 uppercase">{label}</span>
      <span className="figure text-[0.8125rem] font-bold text-white tabular-nums">{value}</span>
    </p>
  );
}
