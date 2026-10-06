"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Calculator,
  Check,
  ChevronRight,
  Equal,
  EqualNot,
  Eye,
  FileWarning,
  FileX2,
  GitCompareArrows,
  Hourglass,
  ListChecks,
  Loader2,
  MapPin,
  ShieldAlert,
  Table2,
  Volume2,
  VolumeX,
  Vote,
  X,
} from "lucide-react";

import RoomIntegrity from "./RoomIntegrity";
import DataQuality from "./DataQuality";
import InecFaults from "./InecFaults";
import { Nothing, Places, Progress, Spreadsheet, boxOf, plain } from "./RoomInec";
import { ACTIONS } from "@/lib/anomalies";
import { KINDS, KIND_ORDER, SOURCES, VERDICTS, verificationOf, within } from "@/lib/verification";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Verification: do our agents, INEC's sheets and the announced result agree?
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT WAS WRONG WITH THIS SCREEN
 *
 *  It was a desk queue with a map attached. It opened on a paragraph about
 *  what the screen was for, four boxes of things to do, and a map that had
 *  two switches on it and coloured a state by whichever of six statuses was
 *  worst. A room could not look at it from the door and know whether the
 *  count was holding, which is the only thing a room wants from it.
 *
 *  And the three records it exists to compare never met. INEC's sheets
 *  against our agents was on the map, our agents against the announcement
 *  was on another page, and INEC's sheets against INEC's own announcement
 *  was not asked anywhere.
 *
 *  ── SO IT IS BUILT LIKE THE RESULTS SCREEN, AND ASKS ONE QUESTION ───────
 *  The same shape the room already knows how to read: figures across the
 *  top, the map pinned on the left, what is happening down the right.
 *
 *    THE TOP        how many places agree, how many do not, and the exact
 *                   number of each kind of irregularity. Every box is a
 *                   button: press it and the list beside the map is that.
 *    THE MAP        green where the records agree and red where they do
 *                   not, and both of them move — slowly where it is fine,
 *                   a quick double beat where it is not — so it can be
 *                   read out of the corner of an eye and by somebody who
 *                   cannot tell the two colours apart.
 *    THE SIDE       the three comparisons in one line each, then every
 *                   finding as it arrives, worst first. Each one opens.
 *
 *  The verdict for a place is worked out once, in lib/verification.js, and
 *  only ever on polling units both sides hold. A place where nothing can be
 *  compared yet is drawn as exactly that, in its own colour, and never as
 *  agreement.
 *
 *  ── AND WHAT IT NEVER DOES ──────────────────────────────────────────────
 *  Nothing here changes a result, and nothing here accuses anybody. A
 *  finding is a question with its evidence attached. The sheet that opens
 *  says so, in the reader's own words, every time.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ── how each verdict is drawn ───────────────────────────────────────────── */

const FILL = {
  differs: "var(--color-red-500)",
  agrees: "var(--color-agree-500)",
  look: "var(--color-flag-500)",
  waiting: null,
};

/* On white: a lamp, and the words beside it. */
const LAMP = {
  differs: { dot: "bg-red-500", text: "text-red-600", tint: "bg-red-50", icon: X },
  agrees: { dot: "bg-agree-500", text: "text-agree-700", tint: "bg-agree-50", icon: Check },
  look: { dot: "bg-flag-500", text: "text-flag-700", tint: "bg-flag-50", icon: Eye },
  waiting: { dot: "bg-dash-line", text: "text-dash-muted", tint: "bg-dash-bg", icon: Hourglass },
};

const LEGEND = [
  ["agrees", "The records agree"],
  ["differs", "The records do not agree"],
  ["look", "Something to look at, nothing to compare yet"],
  ["waiting", "Nothing to compare yet"],
];

/* ── THE MAP'S SECOND LAYER: HOW MUCH OF A PLACE HAS NO SHEET ────────────────
   Whether the records agree can only be drawn where two of them can be held
   together. Until then the first layer is a blank country, and the one thing
   that is already known about every place — how many of its polling units
   INEC published nothing for — was nowhere on the map. This layer draws it.

   One measure, so one hue, darker to brighter as the share rises: on a dark
   board the bright end is the one the eye goes to. It is the amber of "worth
   a look" and never the red of "the records do not agree", which stays
   meaning exactly one thing on this screen. */
const SHARE_STEPS = [
  { upTo: 0, fill: null, label: "None" },
  { upTo: 2, fill: "var(--color-flag-950)", label: "Under 2%" },
  { upTo: 5, fill: "var(--color-flag-800)", label: "2 to 5%" },
  { upTo: 10, fill: "var(--color-flag-700)", label: "5 to 10%" },
  { upTo: 20, fill: "var(--color-flag-500)", label: "10 to 20%" },
  { upTo: Infinity, fill: "var(--color-flag-300)", label: "Over 20%" },
];

/** What share of a place's polling units have no sheet, as a number out of 100. */
function noSheetShare(raw) {
  const units = raw?.units ?? 0;
  return units > 0 ? ((raw.parts?.missing ?? 0) / units) * 100 : null;
}

const shareStep = (share) => SHARE_STEPS.find((step) => share <= step.upTo) ?? SHARE_STEPS.at(-1);
const percent = (value) => (value === 0 ? "0%" : value < 0.1 ? "under 0.1%" : `${value.toFixed(1)}%`);

const KIND_ICON = {
  rigging: Vote,
  fraud: FileWarning,
  mismatch: GitCompareArrows,
  error: Calculator,
  missing: FileX2,
  unusual: Eye,
};

/* What sits under each figure at the top. Short enough to read at a glance;
   the long form is in lib/verification.js and on the sheet that opens. */
const KIND_FOOT = {
  rigging: "More votes than voters, or a different winner",
  fraud: "Something wrong with the sheet itself",
  mismatch: "The same polling units, different figures",
  error: "Figures that do not add up",
};

const LEVEL = {
  CRITICAL: { label: "Critical", tile: "bg-red-500 text-white", pill: "bg-red-50 text-red-700", bar: "bg-red-500" },
  SERIOUS: { label: "Serious", tile: "bg-red-50 text-red-600", pill: "bg-red-50 text-red-700", bar: "bg-red-500" },
  WARNING: { label: "Check", tile: "bg-flag-50 text-flag-700", pill: "bg-flag-50 text-flag-800", bar: "bg-flag-500" },
  INFO: { label: "For the record", tile: "bg-dash-bg text-dash-muted", pill: "bg-dash-bg text-dash-muted", bar: "bg-dash-line" },
};

const SHORT = { agents: "Our agents", irev: "INEC's sheets", announced: "Announced" };
/* The same names in the middle of a sentence. Not `toLowerCase()`: INEC is
   a name, and "inec's sheets" is what that turns it into. */
const MID = { agents: "our agents", irev: "INEC's sheets", announced: "the announced result" };

const PLURAL = { state: "states", lga: "local governments", ward: "wards", unit: "polling units" };
const SINGULAR = { state: "state", lga: "local government", ward: "ward", unit: "polling unit" };
const TITLE = { state: "States", lga: "Local governments", ward: "Wards", unit: "Polling units" };

/** Worst first, then the busiest: the order a room reads a list of places in. */
const VERDICT_RANK = { differs: 0, look: 1, agrees: 2, waiting: 3 };

const COUNTRY = [{ key: "", name: "Nigeria" }];
const PAGE = 25;

const BOARD =
  "on-board flex min-h-[32rem] flex-col overflow-hidden rounded-dash border border-board-line bg-board xl:sticky xl:top-[calc(var(--dash-top,4.5rem)+0.75rem)] xl:h-[calc(100vh-var(--dash-top,4.5rem)-1.5rem)] xl:min-h-0";

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink";

/** Which two records a finding is between, in words. */
function betweenWords(update) {
  if (update.between.length === 2) return `${SHORT[update.between[0]]} and ${MID[update.between[1]]}`;
  return update.between[0] === "irev" ? "On INEC's sheet" : "On our agent's return";
}

/** Where a finding is, in the fewest words that still find it. */
function whereWords(update) {
  const at = update.where;
  if (at.level === "country") return "Across all returns";
  /* A state is its name. Its number means nothing to anybody reading. */
  if (at.level === "state") return at.name ?? at.stateName ?? at.code;
  return [at.name, at.code, at.stateName].filter(Boolean).join(" · ") || "Nigeria";
}

/** Why a place is the colour it is, in one line. */
function reasonFor(place) {
  const named = { "agents-irev": "our agents and INEC's sheets", "agents-announced": "our agents and the announcement", "irev-announced": "INEC's sheets and the announcement" };
  const of = (status) => Object.entries(place.pairs).filter(([, value]) => value === status).map(([id]) => named[id]);

  if (place.verdict === "differs") return `Differ: ${of("differs").join("; ")}`;
  if (place.verdict === "agrees") return `Agree: ${of("agrees").join("; ")}`;
  if (place.verdict === "look") return "Nothing to compare yet";
  return "Nothing to compare yet";
}

export default function RoomEvidence({
  integrity = { flags: [], impossible: 0, flagged: 0, screened: 0, clean: 0, work: [], counts: {} },
  sheetFindings = [],
  inec = null,
  sheetReads = null,
  pulse,
  divergence = null,
  shapes = null,
  ground = null,
  /* The country's picture, already worked out by the room for its alarm. Read
     rather than recomputed while nobody has opened a place. */
  base = null,
  /* The room's verification alarm — see ./useVerifyAlarm.js. */
  alarm = null,
  onGo,
  onUnit,
}) {
  /* A place the reader has opened, or null while they are on the country. The
     country is whatever the room last handed down, so it keeps moving with
     the room's own refresh without being copied into state. */
  const [opened, setOpened] = useState(null);
  const [busy, setBusy] = useState(false);
  /* The place that would not open, kept so it can be asked for again with one
     press. "Try again" with nothing to press was an instruction to do what? */
  const [failed, setFailed] = useState(null);
  /* Which of the map's two layers is up. Null leaves it to the screen: the
     verdict wherever anything can be compared, the publishing until then. */
  const [layerPick, setLayerPick] = useState(null);
  const published = useRef(null);
  /* One state's local governments, stamped with the state they are for. */
  const [outlines, setOutlines] = useState(null);

  /* What the list beside the map is narrowed to: a kind of finding, and a
     place one step down that cannot be opened any further. */
  const [kind, setKind] = useState(null);
  const [picked, setPicked] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [shown, setShown] = useState(PAGE);
  const [detail, setDetail] = useState(null);

  const [view, setView] = useState("places");
  const [reference, setReference] = useState(null);

  const account = opened ?? inec;
  const compared = Boolean(account?.children);
  const sheetFails = pulse?.sheets?.fails ?? null;

  const open = useCallback(async (under) => {
    setFailed(null);
    setPicked(null);
    setShown(PAGE);
    if (!under) {
      setOpened(null);
      return;
    }
    setBusy(true);
    try {
      const answer = await fetch(`/api/irev/verify?under=${encodeURIComponent(under)}`, { cache: "no-store" });
      const next = answer.ok ? await answer.json() : null;
      if (next?.children) setOpened(next);
      else setFailed(under);
    } catch {
      setFailed(under);
    } finally {
      setBusy(false);
    }
  }, []);

  /* ── AN OPENED PLACE KEEPS UP WITH THE ROOM ──────────────────────────────
     The country arrives fresh with every refresh of the room. A place that
     was opened was fetched once, and left alone it would sit there showing
     the count as it stood when somebody pressed it — on the one screen whose
     whole point is what has changed. So each time the room refreshes, the
     open place is asked for again, quietly: no spinner, and a failure leaves
     what is on screen where it is. */
  const openedUnder = opened?.under ?? null;
  const lastInec = useRef(inec);
  useEffect(() => {
    if (lastInec.current === inec) return undefined;
    lastInec.current = inec;
    if (!openedUnder) return undefined;

    let stale = false;
    fetch(`/api/irev/verify?under=${encodeURIComponent(openedUnder)}`, { cache: "no-store" })
      .then((answer) => (answer.ok ? answer.json() : null))
      .then((next) => {
        if (!stale && next?.children) setOpened(next);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [inec, openedUnder]);

  const picture = useMemo(
    () => (!opened && base ? base : verificationOf({ account, integrity, sheetFindings, divergence, sheetFails })),
    [opened, base, account, integrity, sheetFindings, divergence, sheetFails]
  );

  const crumbs = compared ? account.crumbs : COUNTRY;
  const here = crumbs.at(-1);
  const stateCode = crumbs[1]?.stateCode ?? null;
  const election = compared ? account.election : (inec?.election ?? null);
  const level = picture.level;
  const canOpen = compared && level !== "unit";

  useEffect(() => {
    if (!stateCode) return undefined;
    let cancelled = false;
    fetch(`/geo/lga/${stateCode}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setOutlines({ code: stateCode, lgas: data?.lgas ?? [] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [stateCode]);

  /** Pressing a place: go into it where there is an inside, mark it where there is not. */
  const choose = useCallback(
    (place) => {
      if (!place) return;
      if (canOpen) open(place.key);
      else {
        setPicked((was) => (was === place.key ? null : place.key));
        setShown(PAGE);
      }
    },
    [canOpen, open]
  );

  /* ── what the map draws ─────────────────────────────────────────────────
     The states of the country, or the local governments of the state that is
     open. Below that the ground has no outlines of its own, so the map stays
     on the state with the open local government lit. */
  const drawn = useMemo(() => {
    const nation = [0, 0, shapes?.width ?? 1000, shapes?.height ?? 812];

    if (!stateCode) {
      const byCode = new Map(picture.places.map((place) => [place.stateCode, place]));
      return {
        box: nation,
        shapes: (shapes?.states ?? []).map((state) => ({
          id: state.code,
          name: state.name,
          d: state.d,
          at: state.at,
          place: byCode.get(state.code) ?? null,
        })),
      };
    }

    if (outlines?.code !== stateCode) return null;
    const lgaCrumb = crumbs[2] ?? null;
    const byName = new Map((level === "lga" ? picture.places : []).map((place) => [plain(place.name), place]));

    return {
      box: boxOf(outlines.lgas.map((lga) => lga.d)),
      named: true,
      shapes: outlines.lgas.map((lga) => {
        const lit = lgaCrumb ? plain(lgaCrumb.name) === plain(lga.name) : false;
        return {
          id: lga.name,
          name: lga.name,
          d: lga.d,
          at: lga.at,
          place: byName.get(plain(lga.name)) ?? null,
          /* Inside a local government the map cannot go any deeper, so the
             one that is open carries the colour of everything under it. */
          verdict: lit ? picture.state : null,
          lit,
          dim: Boolean(lgaCrumb) && !lit,
        };
      }),
    };
  }, [stateCode, outlines, shapes, crumbs, level, picture]);

  const unit = Math.max(drawn?.box?.[2] ?? 1000, drawn?.box?.[3] ?? 812) / 100;

  /* ── the list beside the map ────────────────────────────────────────── */
  const scoped = useMemo(
    () => (picked ? picture.updates.filter((update) => within(update.where.code, picked)) : picture.updates),
    [picture.updates, picked]
  );
  const feed = useMemo(() => (kind ? scoped.filter((update) => update.kind === kind) : scoped), [scoped, kind]);

  const pickedPlace = picked ? (picture.places.find((place) => place.key === picked) ?? null) : null;
  const hoveredPlace = hovered ? (picture.places.find((place) => place.key === hovered) ?? null) : null;
  /* The figures at the top are for the ground on screen: the place that is
     marked where one is, the place that is open otherwise. */
  const counts = pickedPlace?.counts ?? picture.counts;

  const ranked = useMemo(
    () =>
      [...picture.places].sort(
        (a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || b.counts.total - a.counts.total || a.name.localeCompare(b.name)
      ),
    [picture.places]
  );

  const fresh = alarm?.fresh ?? null;
  const freshHere = fresh ? picture.updates.filter((update) => fresh.has(update.id)).length : 0;

  const openDetail = (update) => {
    setDetail(update);
    alarm?.seen?.(update.id);
  };

  const totals = picture.totals;
  const judged = totals.agrees + totals.differs;
  const word = PLURAL[level] ?? "places";
  const fills = useMemo(
    () => Object.fromEntries(picture.places.map((place) => [place.key, FILL[place.verdict] ?? "var(--color-dash-line)"])),
    [picture.places]
  );

  const screened = integrity.screened ?? 0;
  const held = integrity.counts?.HOLD ?? 0;
  const whole = compared ? account.whole : null;

  /* The publishing layer needs INEC's sheets; the verdict needs something to
     compare. Where there is nothing to compare the map opens on publishing,
     because a blank country is the one answer that tells a room nothing. */
  const layer = !compared ? "verdict" : (layerPick ?? (judged > 0 ? "verdict" : "published"));
  const showPublished = () => {
    setReference("published");
    /* After the section has been drawn, which is the frame after this one. */
    requestAnimationFrame(() => published.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* ════════════════════════════════════════════════ the figures on top */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(0,1.75fr)_repeat(5,minmax(0,1fr))]">
        <Verdict picture={picture} judged={judged} word={word} place={here.name} whole={whole} election={election} />

        <Tile
          icon={ShieldAlert}
          label="Irregularities"
          value={counts.total}
          foot={freshHere ? `${formatNumber(freshHere)} new since you opened this room` : pickedPlace ? `In ${pickedPlace.name}` : "Everything found so far"}
          tone={counts.total ? "alert" : "calm"}
          active={kind === null}
          onClick={() => {
            setKind(null);
            setShown(PAGE);
          }}
          hint="Show every kind"
        />
        {["rigging", "fraud", "mismatch", "error"].map((id) => (
          <Tile
            key={id}
            icon={KIND_ICON[id]}
            label={KINDS[id].label}
            value={counts[id]}
            foot={KIND_FOOT[id]}
            tone={counts[id] ? (id === "error" ? "warn" : "alert") : "calm"}
            active={kind === id}
            onClick={() => {
              setKind(kind === id ? null : id);
              setShown(PAGE);
            }}
            hint={kind === id ? "Show every kind again" : `Show only ${KINDS[id].label.toLowerCase()}`}
          />
        ))}
      </div>

      {compared && <Publishing counts={counts.published} name={pickedPlace?.name ?? here.name} open={reference === "published"} onOpen={showPublished} />}

      {/* ══════════════════════════════════════════════════════ map and side */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        {/* ───────────────────────────────────────────────────────── the map */}
        <div className={BOARD}>
          <div className="flex flex-wrap items-center gap-1 border-b border-board-line px-4 py-2.5">
            <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1">
              {crumbs.map((crumb, index) => (
                <span key={crumb.key || "nigeria"} className="flex items-center gap-1">
                  {index > 0 && <ChevronRight size={13} className="shrink-0 text-white/40" />}
                  <button
                    type="button"
                    onClick={() => open(crumb.key)}
                    disabled={index === crumbs.length - 1}
                    className={cn(
                      "rounded-dash-sm px-2 py-1 text-[0.8125rem] font-semibold transition-colors",
                      index === crumbs.length - 1 ? "text-white" : "text-white/55 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
              {busy && <Loader2 size={14} className="ml-2 animate-spin text-white/60" />}
              {failed && !busy && (
                <span role="alert" className="ml-2 flex items-center gap-2 text-[0.8125rem] text-red-300">
                  That place could not be opened.
                  <button type="button" onClick={() => open(failed)} className="rounded-dash-sm border border-red-300/60 px-2 py-0.5 font-semibold text-white hover:bg-white/10">
                    Try again
                  </button>
                </span>
              )}
            </nav>
            <span className="ml-auto hidden pl-1 text-[0.75rem] text-white/45 lg:inline">
              {canOpen ? `Press a ${SINGULAR[level]} to open it` : compared ? "Press a polling unit to see only its findings" : "Press a state to see only its findings"}
            </span>
            {compared && (
              <span className="ml-auto flex overflow-hidden rounded-dash-sm border border-board-line lg:ml-3" role="group" aria-label="What the map shows">
                {[
                  ["verdict", "Do the records agree"],
                  ["published", "Polling units with no sheet"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setLayerPick(id)}
                    aria-pressed={layer === id}
                    className={cn("px-3 py-1.5 text-[0.75rem] font-semibold transition-colors", layer === id ? "bg-white text-board" : "text-white/60 hover:text-white")}
                  >
                    {label}
                  </button>
                ))}
              </span>
            )}
          </div>

          {compared && <Progress election={election} />}

          <div className="relative min-h-0 flex-1 p-2">
            {drawn?.box ? (
              <svg
                viewBox={drawn.box.join(" ")}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label={`Map of ${crumbs[1]?.name ?? "Nigeria"}. Green where our agents, INEC's sheets and the announced result agree, red where they do not. The same places are listed beside it.`}
                className="block h-full min-h-[26rem] w-full"
              >
                {drawn.shapes.map((shape, index) => {
                  const verdict = shape.verdict ?? shape.place?.verdict ?? "waiting";
                  const share = layer === "published" ? noSheetShare(shape.place?.raw) : null;
                  const fill = layer === "published" ? (share === null ? null : shareStep(share).fill) : FILL[verdict];
                  const marked = shape.place && (picked === shape.place.key || hovered === shape.place.key);
                  return (
                    <path
                      key={shape.id}
                      d={shape.d}
                      fillRule="evenodd"
                      fill={fill ?? "var(--color-board-raised)"}
                      stroke={shape.lit || marked ? "#ffffff" : "rgba(255, 255, 255, 0.24)"}
                      strokeWidth={unit * (shape.lit || marked ? 0.42 : 0.16)}
                      strokeLinejoin="round"
                      opacity={shape.dim ? 0.3 : undefined}
                      onClick={shape.place ? () => choose(shape.place) : undefined}
                      onMouseEnter={shape.place ? () => setHovered(shape.place.key) : undefined}
                      onMouseLeave={shape.place ? () => setHovered(null) : undefined}
                      /* The heartbeat. Agreement breathes, each place a
                         little out of step with the next so the country
                         looks alive rather than switched on and off;
                         disagreement beats together, so every red place
                         lands on the eye at the same instant. */
                      style={verdict === "agrees" ? { animationDelay: `${(index % 7) * -0.45}s` } : undefined}
                      className={cn(
                        shape.place && "cursor-pointer",
                        layer === "verdict" && !shape.dim && verdict === "agrees" && "animate-verify-breathe",
                        layer === "verdict" && !shape.dim && verdict === "differs" && "animate-verify-beat"
                      )}
                    >
                      <title>
                        {layer === "published"
                          ? `${shape.name}: ${share === null ? "nothing gathered" : `${formatNumber(shape.place.raw.parts?.missing ?? 0)} of ${formatNumber(shape.place.raw.units)} polling units have no sheet (${percent(share)})`}`
                          : `${shape.name}: ${shape.place ? `${VERDICTS[verdict].says}. ${formatNumber(shape.place.counts.total)} to look at.` : VERDICTS[verdict].says}`}
                      </title>
                    </path>
                  );
                })}

                {/* The rings, and how many findings a place is holding. Drawn
                    over the fills and deaf to the pointer, so they never get
                    between a press and the place under it. */}
                <g pointerEvents="none" aria-hidden="true">
                  {drawn.shapes.map((shape, index) => {
                    /* The lamps count findings. On the publishing layer the
                       colour is the figure, and a lamp would be a second one. */
                    if (layer === "published" || !shape.at || shape.dim) return null;
                    const verdict = shape.verdict ?? shape.place?.verdict ?? "waiting";
                    const count = shape.place?.counts.total ?? 0;
                    const beats = verdict === "differs" || verdict === "agrees";
                    if (!beats && !count) return null;

                    const [x, y] = shape.at;
                    const lift = drawn.named ? unit * 2.6 : 0;
                    return (
                      <g key={`mark-${shape.id}`}>
                        {beats && (
                          <circle
                            cx={x}
                            cy={y - lift}
                            r={unit * 1.1}
                            fill="none"
                            stroke={verdict === "differs" ? "#ffffff" : "var(--color-agree-200)"}
                            strokeWidth={unit * (verdict === "differs" ? 0.3 : 0.18)}
                            style={{
                              transformBox: "fill-box",
                              transformOrigin: "center",
                              animationDelay: verdict === "agrees" ? `${(index % 7) * -0.45}s` : undefined,
                            }}
                            className={verdict === "differs" ? "animate-verify-ring-fast" : "animate-verify-ring"}
                          />
                        )}
                        {count > 0 && (
                          <>
                            <circle cx={x} cy={y - lift} r={unit * 1.35} fill="#ffffff" stroke="var(--color-board)" strokeWidth={unit * 0.18} />
                            <text
                              x={x}
                              y={y - lift}
                              dy="0.36em"
                              textAnchor="middle"
                              fontSize={unit * (count > 99 ? 0.95 : 1.4)}
                              fontWeight="700"
                              fill="var(--color-board)"
                            >
                              {/* Four digits do not fit a lamp. The exact figure
                                  is in the list beside the map and at the top. */}
                              {count > 999 ? `${Math.floor(count / 1000)}k+` : count}
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })}
                  {drawn.named &&
                    drawn.shapes.map((shape) =>
                      shape.at ? (
                        <text
                          key={`name-${shape.id}`}
                          x={shape.at[0]}
                          y={shape.at[1]}
                          dy="0.36em"
                          textAnchor="middle"
                          fontSize={unit * 1.55}
                          fill="#ffffff"
                          opacity={shape.dim ? 0.3 : 0.85}
                        >
                          {shape.name}
                        </text>
                      ) : null
                    )}
                </g>
              </svg>
            ) : (
              <p className="absolute inset-0 flex items-center justify-center gap-2 text-[0.875rem] text-white/60">
                <Loader2 size={16} className="animate-spin" /> Drawing {crumbs[1]?.name ?? "the map"}…
              </p>
            )}

            {/* What the pointer is over, said in full. The colour is the
                answer; this is the reason for it. */}
            {hoveredPlace && (
              <div className="pointer-events-none absolute top-3 right-3 z-10 w-[17rem] rounded-dash-sm bg-board/90 px-3.5 py-3 backdrop-blur-sm">
                <p className="flex items-center gap-2 text-[0.875rem] font-bold text-white">
                  <span className={cn("size-2.5 shrink-0 rounded-full", LAMP[hoveredPlace.verdict].dot)} />
                  {hoveredPlace.name}
                </p>
                <p className="mt-1 text-[0.75rem] leading-snug text-white/70">{VERDICTS[hoveredPlace.verdict].says}.</p>
                {hoveredPlace.verdict !== "waiting" && hoveredPlace.verdict !== "look" && (
                  <p className="mt-0.5 text-[0.75rem] leading-snug text-white/55">{reasonFor(hoveredPlace)}</p>
                )}
                <dl className="mt-2 space-y-0.5 border-t border-white/15 pt-2 text-[0.75rem] text-white/70">
                  <div className="flex justify-between gap-3"><dt>Findings to look at</dt><dd className="figure font-semibold text-white">{formatNumber(hoveredPlace.counts.total)}</dd></div>
                  {hoveredPlace.raw && (
                    <>
                      <div className="flex justify-between gap-3"><dt>Polling units</dt><dd className="figure font-semibold text-white">{formatNumber(hoveredPlace.raw.units)}</dd></div>
                      <div className="flex justify-between gap-3">
                        <dt>With no sheet</dt>
                        <dd className="figure font-semibold text-white">
                          {formatNumber(hoveredPlace.counts.published.missing)} · {percent(noSheetShare(hoveredPlace.raw) ?? 0)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3"><dt>Sheets up late</dt><dd className="figure font-semibold text-white">{formatNumber(hoveredPlace.counts.published.late)}</dd></div>
                    </>
                  )}
                </dl>
              </div>
            )}

            <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[18rem] rounded-dash-sm bg-board/85 px-3 py-2.5 backdrop-blur-sm">
              {layer === "published" ? (
                <>
                  <p className="text-[0.6875rem] font-semibold text-white/60">Share of polling units INEC published no sheet for</p>
                  <ul className="mt-1.5 flex gap-px" aria-hidden="true">
                    {SHARE_STEPS.map((step) => (
                      <li key={step.label} className="h-2.5 flex-1 first:rounded-l-[2px] last:rounded-r-[2px]" style={{ background: step.fill ?? "var(--color-board-raised)", outline: step.fill ? undefined : "1px solid rgba(255,255,255,0.25)", outlineOffset: "-1px" }} />
                    ))}
                  </ul>
                  <p className="mt-1 flex justify-between text-[0.625rem] text-white/60">
                    <span>None</span>
                    <span>2%</span>
                    <span>5%</span>
                    <span>10%</span>
                    <span>20%+</span>
                  </p>
                  <p className="mt-1.5 text-[0.6875rem] leading-tight text-white/55">
                    {judged > 0 ? "A measure of the publishing, not of whether the records agree." : "Shown because nothing can be compared yet. It is a measure of the publishing, not a finding."}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[0.6875rem] font-semibold text-white/60">Our agents, INEC&rsquo;s sheets, and the announced result</p>
                  <ul className="mt-1.5 space-y-1">
                    {LEGEND.map(([id, label]) => (
                      <li key={id} className="flex items-center gap-2 text-[0.6875rem] leading-tight text-white/75">
                        <span
                          className={cn(
                            "inline-block size-2.5 shrink-0 rounded-[2px]",
                            id === "agrees" && "animate-verify-breathe",
                            id === "differs" && "animate-verify-beat"
                          )}
                          style={{ background: FILL[id] ?? "var(--color-board-raised)", outline: FILL[id] ? undefined : "1px solid rgba(255,255,255,0.25)" }}
                        />
                        {label}
                      </li>
                    ))}
                    <li className="flex items-center gap-2 text-[0.6875rem] leading-tight text-white/75">
                      <span className="figure inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-white text-[0.5rem] font-bold text-board">3</span>
                      How many findings a place is holding
                    </li>
                  </ul>
                </>
              )}
            </div>
          </div>

          {/* The readout along the foot, as on the results map: what is on
              screen and how much of it has been checked. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-board-line px-4 py-2.5">
            <Readout label="Scope" value={here.name} />
            <Readout label="Agree" value={formatNumber(totals.agrees)} tone={totals.agrees ? "ok" : undefined} />
            <Readout label="Do not agree" value={formatNumber(totals.differs)} tone={totals.differs ? "bad" : undefined} />
            <Readout label="Returns checked" value={formatNumber(screened)} />
            {held > 0 && <Readout label="Held back" value={formatNumber(held)} tone="bad" />}
            {whole && <Readout label="Sheets read" value={`${formatNumber(whole.read)} of ${formatNumber(whole.sheets)}`} />}
            <span className="ml-auto flex items-center gap-2">
              <span aria-hidden="true" className="size-1.5 animate-pulse-live rounded-full bg-red-500" />
              <span className="figure text-[0.6875rem] text-white/55">Checking as results arrive</span>
            </span>
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────── the side */}
        <aside className="flex min-w-0 flex-col gap-3">
          <Pairs pairs={picture.pairs} place={here.name} />

          <section aria-label="Updates" className="overflow-hidden rounded-dash border border-dash-line bg-dash-card shadow-e2">
            <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5">
              <span aria-hidden="true" className="size-2 shrink-0 animate-pulse-live rounded-full bg-red-500" />
              <h2 className="font-display text-[1rem] leading-none font-bold tracking-[-0.01em] text-dash-ink">Updates</h2>
              <span className="figure text-[0.8125rem] text-dash-muted">{formatNumber(feed.length)}</span>

              {alarm && (
                <button
                  type="button"
                  onClick={alarm.toggle}
                  aria-pressed={!alarm.muted}
                  title={alarm.muted ? "The alarm is off. Press to turn it on." : "The alarm sounds when something new is found. Press to turn it off."}
                  className={cn(
                    "ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.75rem] font-semibold transition-colors",
                    FOCUS,
                    alarm.muted
                      ? "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                      : "border-dash-ink bg-dash-ink text-white"
                  )}
                >
                  {alarm.muted ? <VolumeX size={13} strokeWidth={2.5} /> : <Volume2 size={13} strokeWidth={2.5} />}
                  {alarm.muted ? "Alarm off" : "Alarm on"}
                </button>
              )}
            </header>

            {alarm?.blocked && !alarm.muted && (
              <button
                type="button"
                onClick={alarm.arm}
                className="block w-full border-y border-flag-200 bg-flag-50 px-4 py-2 text-left text-[0.75rem] leading-snug text-flag-900 hover:bg-flag-100"
              >
                Your browser is holding the sound back until you press something on this page. Press here to let it through.
              </button>
            )}

            {/* The kinds, with how many of each. The boxes at the top do the
                same thing; these are here because the boxes are off the top
                of the screen by the time somebody is ten findings down. */}
            <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Chip active={kind === null} onClick={() => { setKind(null); setShown(PAGE); }} count={scoped.length}>
                All
              </Chip>
              {KIND_ORDER.map((id) => {
                const count = scoped.filter((update) => update.kind === id).length;
                if (!count && kind !== id) return null;
                return (
                  <Chip key={id} active={kind === id} onClick={() => { setKind(kind === id ? null : id); setShown(PAGE); }} count={count}>
                    {KINDS[id].label}
                  </Chip>
                );
              })}
            </div>

            {pickedPlace && (
              <p className="flex items-center gap-2 border-t border-dash-line bg-dash-bg px-4 py-2 text-[0.8125rem] text-dash-ink">
                <MapPin size={13} strokeWidth={2.5} className="shrink-0 text-dash-muted" />
                Only {pickedPlace.name}
                <button type="button" onClick={() => setPicked(null)} className={cn("ml-auto font-semibold underline underline-offset-2", FOCUS)}>
                  Show everywhere
                </button>
              </p>
            )}

            {feed.length === 0 ? (
              <Quiet picture={picture} kind={kind} screened={screened} pickedPlace={pickedPlace} sheetsRead={whole?.read ?? 0} />
            ) : (
              <ul className="divide-y divide-dash-line border-t border-dash-line">
                {feed.slice(0, shown).map((update) => (
                  <li key={update.id}>
                    <UpdateRow update={update} isNew={Boolean(fresh?.has(update.id))} onOpen={() => openDetail(update)} />
                  </li>
                ))}
              </ul>
            )}

            {feed.length > shown && (
              <button
                type="button"
                onClick={() => setShown((count) => count + PAGE)}
                className={cn("block w-full border-t border-dash-line px-4 py-3 text-center text-[0.8125rem] font-semibold text-dash-ink hover:bg-dash-bg", FOCUS)}
              >
                Show {formatNumber(Math.min(PAGE, feed.length - shown))} more of {formatNumber(feed.length)}
              </button>
            )}

            {alarm && (
              <p className="flex flex-wrap items-center gap-x-2 border-t border-dash-line px-4 py-2.5 text-[0.75rem] leading-snug text-dash-muted">
                The room hears an alarm when something new is found, whichever screen is open.
                <button type="button" onClick={alarm.test} className={cn("font-semibold text-dash-ink underline underline-offset-2", FOCUS)}>
                  Hear it
                </button>
              </p>
            )}
          </section>

          {compared ? (
            <ThreeResults place={pickedPlace?.raw ?? null} whole={whole} name={pickedPlace?.name ?? here.name} election={election} />
          ) : (
            inec && <Nothing account={inec} />
          )}

          <section aria-label={TITLE[level]} className="overflow-hidden rounded-dash border border-dash-line bg-dash-card shadow-e2">
            <header className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-2.5">
              <h2 className="font-display text-[1rem] leading-none font-bold tracking-[-0.01em] text-dash-ink">{TITLE[level]}</h2>
              <p className="text-[0.75rem] text-dash-muted">Worst first</p>
            </header>
            <PlaceList
              places={ranked}
              picked={picked}
              hovered={hovered}
              onHover={setHovered}
              onOpen={choose}
              opens={canOpen}
            />
          </section>
        </aside>
      </div>

      {/* ═════════════════════════════════════════════ one step down, in full */}
      {compared && (
        <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card shadow-e2">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-dash-line px-4 py-3 sm:px-5">
            <h2 className="font-display text-[1rem] font-bold tracking-[-0.01em] text-dash-ink">
              {here.name}, {{ state: "state by state", lga: "by local government", ward: "ward by ward", unit: "polling unit by polling unit" }[level]}
            </h2>
            <span className="flex overflow-hidden rounded-dash-sm border border-dash-line" role="group" aria-label="How to lay these out">
              {[
                ["places", "What was checked", ListChecks],
                ["table", "The three results, side by side", Table2],
              ].map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  aria-pressed={view === key}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.8125rem] font-semibold",
                    view === key ? "bg-dash-ink text-white" : "text-dash-muted hover:text-dash-ink"
                  )}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </span>
          </header>

          {view === "table" ? <Spreadsheet account={account} onOpen={open} /> : <Places account={account} onOpen={open} fills={fills} />}

          <footer className="border-t border-dash-line px-4 py-2.5 text-[0.75rem] leading-relaxed text-dash-muted sm:px-5">
            A difference is not a verdict. Our agent may have mistyped, the reading of INEC&rsquo;s sheet may be wrong, or
            the sheet published may not be the one our agent saw; open the sheet to see which. A reading that does not
            add up is counted as in doubt and is never held against our return.
          </footer>
        </section>
      )}

      {/* ════════════════════════════════════════════════════ the long form */}
      {/* Shut on arrival, on purpose. Both are real and neither is what a
          room looks at this screen for; open, they doubled its length. */}
      {(screened > 0 || compared) && (
        <>
          <div className="flex flex-wrap gap-2">
            {[
              /* How the commission published: which polling units have no
                 sheet, which went up days late, and when. It has its own
                 drill and its own download — see ./InecFaults.jsx. */
              compared && { id: "published", label: "How INEC published its sheets", count: 0 },
              screened > 0 && { id: "findings", label: "Every finding on our own returns", count: integrity.flags?.length ?? 0 },
              screened > 0 && { id: "sheets", label: "What arrived with each return", count: sheetFindings.length },
            ].filter(Boolean).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setReference(reference === item.id ? null : item.id)}
                aria-expanded={reference === item.id}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[0.8125rem] font-semibold transition-colors",
                  FOCUS,
                  reference === item.id
                    ? "border-dash-ink bg-dash-ink text-white"
                    : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                )}
              >
                {item.label}
                {item.count > 0 && <span className="figure opacity-70">{formatNumber(item.count)}</span>}
              </button>
            ))}
          </div>

          {reference === "published" && compared && (
            <div ref={published} className="scroll-mt-24">
              <InecFaults />
            </div>
          )}
          {reference === "findings" && (
            <RoomIntegrity integrity={integrity} sheets={sheetFindings} pulse={pulse} divergence={divergence} onGo={onGo} />
          )}
          {reference === "sheets" && <DataQuality pulse={pulse} sheets={sheetReads} ground={ground} />}
        </>
      )}

      {detail && (
        <Detail
          update={detail}
          election={election}
          onClose={() => setDetail(null)}
          onUnit={onUnit}
          onShow={
            compared && detail.where.stateNumber
              ? () => {
                  setDetail(null);
                  open(detail.where.stateNumber);
                }
              : null
          }
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ the top row */

/**
 * The answer, before any number.
 *
 * A room reads one thing from the door: is the count holding. So the first
 * box is a sentence in the colour of its own answer, with the two figures it
 * was made from and the share of the places on screen each one is.
 */
function Verdict({ picture, judged, word, place, whole = null, election = null }) {
  const { totals, state } = picture;
  const lamp = LAMP[state === "look" ? "waiting" : state];
  const one = word.replace(/s$/, "");

  const says =
    state === "differs"
      ? `${formatNumber(totals.differs)} ${totals.differs === 1 ? `${one} does` : `${word} do`} not agree`
      : state === "agrees"
        ? totals.agrees === 1
          ? `The 1 ${one} compared so far agrees`
          : `All ${formatNumber(totals.agrees)} ${word} compared so far agree`
        : "Nothing to compare yet";

  const under =
    state === "differs"
      ? "Two of the three records say different things there. Open a red place to see which."
      : state === "agrees"
        ? "Wherever two of the three records can be held together, they say the same thing."
        : whole && whole.sheets > 0 && whole.read === 0
          ? /* The honest reason, where there is one: the sheets are here and
               are pictures. Nothing turns green by itself until they are read. */
            `INEC's ${formatNumber(whole.sheets)} sheets for ${place} are photographs and none has been read into figures${election?.reading ? " yet" : ""}, so there is nothing to hold our agents' results against.`
          : `As our agents file, INEC publishes its sheets and results are announced in ${place}, each place turns green or red by itself.`;

  const share = (count) => (totals.places ? `${(count / totals.places) * 100}%` : "0%");

  return (
    <section
      aria-label="Do the records agree"
      className="flex min-w-0 flex-col rounded-dash border border-dash-line bg-dash-card px-5 pt-4 pb-4 shadow-e2 sm:col-span-2 lg:col-span-3 xl:col-span-1"
    >
      <p className="flex items-center gap-2 text-[0.75rem] font-medium text-dash-muted">
        Our agents, INEC&rsquo;s sheets and the announced result
      </p>
      <h1 className={cn("mt-2 font-display text-[1.375rem] leading-tight font-extrabold tracking-[-0.02em]", state === "waiting" || state === "look" ? "text-dash-ink" : lamp.text)}>
        {says}
      </h1>
      <p className="mt-1 text-[0.8125rem] leading-snug text-dash-muted">{under}</p>

      <div className="mt-auto pt-3.5">
        <div className="flex h-2 overflow-hidden rounded-full bg-dash-bg" aria-hidden="true">
          <span className="block h-full bg-agree-500 transition-[width] duration-500" style={{ width: share(totals.agrees) }} />
          <span className="block h-full bg-red-500 transition-[width] duration-500" style={{ width: share(totals.differs) }} />
        </div>
        <dl className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <Lamp verdict="agrees" count={totals.agrees} label="agree" beat="animate-verify-ring" />
          <Lamp verdict="differs" count={totals.differs} label={totals.differs === 1 ? "does not agree" : "do not agree"} beat="animate-verify-ring-fast" />
          <span className="text-[0.75rem] text-dash-muted">
            {formatNumber(totals.places - judged)} of {formatNumber(totals.places)} {word} with nothing to compare yet
          </span>
        </dl>
      </div>
    </section>
  );
}

/**
 * How INEC published, in one line across the screen.
 *
 * Every polling unit is one of four things: its sheet went up in time, it
 * went up late, the portal lists a sheet that is not there, or there is no
 * sheet at all. One bar of the four, with the figures under it, and one
 * press to the place-by-place account of them (./InecFaults.jsx).
 *
 * It is here and not among the boxes above because it is not a finding. A
 * sheet that went up three days late is a fact about the publishing; nobody
 * has to decide anything about it tonight.
 */
function Publishing({ counts, name, open, onOpen }) {
  if (!counts?.units) return null;

  const onTime = Math.max(0, counts.sheets - counts.late - counts.gone);
  const parts = [
    { id: "ontime", label: "Sheet up in time", value: onTime, fill: "bg-dash-ink", note: "on polling day or the day after" },
    { id: "late", label: "Sheet up late", value: counts.late, fill: "bg-flag-500", note: "two or more days after" },
    { id: "gone", label: "Listed, but not there", value: counts.gone, fill: "bg-red-300", note: "no file where the portal says" },
    { id: "missing", label: "No sheet published", value: counts.missing, fill: "bg-red-500", note: "nothing on the portal" },
  ];
  const of = (value) => (value / counts.units) * 100;

  return (
    <section aria-label={`How INEC published its sheets in ${name}`} className="rounded-dash border border-dash-line bg-dash-card px-5 py-4 shadow-e2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="font-display text-[1rem] leading-tight font-bold tracking-[-0.01em] text-dash-ink">
          How INEC published its sheets in {name}
        </h2>
        <p className="text-[0.75rem] text-dash-muted">
          <span className="figure font-semibold text-dash-ink">{formatNumber(counts.units)}</span> polling units. A measure of the
          publishing, kept apart from the findings above.
        </p>
      </div>

      {/* One bar, four parts, a sliver of the page between each so two
          neighbours never read as one. */}
      <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {parts.map((part) =>
          part.value > 0 ? <span key={part.id} className={cn("block h-full min-w-[3px]", part.fill)} style={{ width: `${of(part.value)}%` }} /> : null
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
          {parts.map((part) => (
            <div key={part.id} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-[0.75rem] font-medium text-dash-muted">
                <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-[2px]", part.fill)} />
                {part.label}
              </dt>
              <dd className="mt-0.5 flex items-baseline gap-2">
                <span className="figure text-[1.25rem] leading-none font-bold text-dash-ink">{formatNumber(part.value)}</span>
                <span className="figure text-[0.75rem] text-dash-muted">{percent(of(part.value))}</span>
              </dd>
              <p className="mt-0.5 text-[0.6875rem] text-dash-muted">{part.note}</p>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-dash-sm border border-dash-ink bg-dash-ink px-3.5 text-[0.8125rem] font-semibold text-white hover:opacity-90", FOCUS)}
        >
          See it place by place <ChevronRight size={14} />
        </button>
      </div>
    </section>
  );
}

/** A lamp with its figure. It rings only while there is something to ring for. */
function Lamp({ verdict, count, label, beat }) {
  const lamp = LAMP[verdict];
  const Icon = lamp.icon;
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        {count > 0 && <span aria-hidden="true" className={cn("absolute inset-[5px] rounded-full opacity-0", lamp.dot, beat)} />}
        <span className={cn("relative flex size-5 items-center justify-center rounded-full text-white", count > 0 ? lamp.dot : "bg-dash-line")}>
          <Icon size={11} strokeWidth={3.5} aria-hidden="true" />
        </span>
      </span>
      <dd className={cn("figure text-[1.375rem] leading-none font-bold", count > 0 ? lamp.text : "text-dash-muted")}>{formatNumber(count)}</dd>
      <dt className="text-[0.8125rem] text-dash-muted">{label}</dt>
    </div>
  );
}

/** One exact figure, and a button that makes the list beside the map that. */
function Tile({ icon: Icon, label, value, foot, tone, active, onClick, hint }) {
  const tile = { alert: "bg-red-50 text-red-600", warn: "bg-flag-50 text-flag-700", calm: "bg-dash-bg text-dash-muted" }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={hint}
      className={cn(
        "group flex min-w-0 flex-col rounded-dash border bg-dash-card px-4 pt-3.5 pb-3.5 text-left shadow-e2 transition-[border-color,box-shadow]",
        FOCUS,
        active ? "border-dash-ink ring-1 ring-dash-ink" : "border-dash-line hover:border-dash-ink/40"
      )}
    >
      <span className="flex items-center gap-2.5">
        <span aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-dash-sm", tile)}>
          <Icon size={16} strokeWidth={2.25} />
        </span>
        <span className="min-w-0 text-[0.8125rem] leading-tight font-medium text-dash-ink">{label}</span>
      </span>
      {/* The row is as tall as the answer beside it. The figure and its line
          sit on the floor of the box, so six boxes of different lengths end
          on one line and none of them is half empty. */}
      <span className={cn("figure mt-auto pt-4 text-[1.875rem] leading-none font-bold tracking-[-0.02em]", tone === "alert" ? "text-red-600" : "text-dash-ink")}>
        {formatNumber(value)}
      </span>
      <span className="mt-2 min-h-[2.25rem] text-[0.75rem] leading-snug text-dash-muted">{foot}</span>
    </button>
  );
}

function Chip({ active, onClick, count, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[0.75rem] font-semibold whitespace-nowrap transition-colors",
        FOCUS,
        active ? "border-dash-ink bg-dash-ink text-white" : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
      )}
    >
      {children}
      <span className="figure opacity-70">{formatNumber(count)}</span>
    </button>
  );
}

function Readout({ label, value, tone }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[0.6875rem] text-white/45">{label}</span>
      <span className={cn("figure text-[0.8125rem] font-semibold", tone === "bad" ? "text-red-400" : tone === "ok" ? "text-agree-400" : "text-white")}>
        {value}
      </span>
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════ the side */

const PAIR_ICON = { agrees: Equal, differs: EqualNot, waiting: Hourglass };

/**
 * The three comparisons, one line each.
 *
 * The map says whether a place agrees. This says which two records it is
 * talking about — because "INEC's sheets do not match our agents" and
 * "INEC's sheets do not match INEC's announcement" are two very different
 * mornings.
 */
function Pairs({ pairs, place }) {
  return (
    <section aria-label={`The three comparisons in ${place}`} className="rounded-dash border border-dash-line bg-dash-card px-4 pt-3.5 pb-1.5 shadow-e2">
      <h2 className="font-display text-[1rem] leading-none font-bold tracking-[-0.01em] text-dash-ink">Do the three records agree?</h2>
      <p className="mt-1 text-[0.75rem] text-dash-muted">{place}, on the polling units both sides hold.</p>
      <ul className="mt-2 divide-y divide-dash-line">
        {pairs.map((pair) => {
          const lamp = LAMP[pair.status];
          const Icon = PAIR_ICON[pair.status];
          return (
            <li key={pair.id} className="flex items-start gap-3 py-2.5">
              <span aria-hidden="true" className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", pair.status === "waiting" ? "bg-dash-bg text-dash-muted" : cn(lamp.dot, "text-white"))}>
                <Icon size={14} strokeWidth={2.75} />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.8125rem] leading-snug font-semibold text-dash-ink">
                  {SHORT[pair.between[0]]} <span className="font-normal text-dash-muted">and</span> {MID[pair.between[1]]}
                </span>
                <span className={cn("mt-0.5 block text-[0.8125rem] leading-snug", pair.status === "waiting" ? "text-dash-muted" : lamp.text)}>{pair.says}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One finding in the list. The whole row is the button. */
function UpdateRow({ update, isNew, onOpen }) {
  const Icon = KIND_ICON[update.kind] ?? ShieldAlert;
  const tone = LEVEL[update.level] ?? LEVEL.INFO;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-dash-bg",
        FOCUS,
        isNew && "animate-verify-arrive bg-red-50/60"
      )}
    >
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-[3px]", tone.bar)} />
      <span aria-hidden="true" className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-dash-sm", tone.tile)}>
        <Icon size={15} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[0.75rem] font-semibold text-dash-muted">{KINDS[update.kind].one}</span>
          {isNew && <span className="rounded-full bg-red-500 px-1.5 py-px text-[0.625rem] font-bold text-white">New</span>}
        </span>
        <span className="mt-0.5 line-clamp-2 text-[0.875rem] leading-snug font-semibold text-dash-ink">{update.title}</span>
        <span className="mt-1 block truncate text-[0.75rem] text-dash-muted">{whereWords(update)}</span>
      </span>
      <ChevronRight size={15} aria-hidden="true" className="mt-2 shrink-0 text-dash-muted/50 transition-transform group-hover:translate-x-0.5 group-hover:text-dash-ink" />
    </button>
  );
}

/**
 * An empty list, which is four different things and says which.
 *
 * "Nothing found" after ten thousand returns were checked is the best news
 * this screen can carry. "Nothing found" because nothing has been filed is
 * no news at all. Drawn the same way they are the same sentence, and a room
 * would be reassured by an empty database.
 */
function Quiet({ picture, kind, screened, pickedPlace, sheetsRead = 0 }) {
  /* INEC's sheets being gathered is not a check. Until one has been read, or
     a return of ours screened, a tick here would be reassurance about
     nothing. */
  const checked = screened > 0 || (picture.compared && sheetsRead > 0);
  const says = kind
    ? `No ${KINDS[kind].label.toLowerCase()} ${pickedPlace ? `in ${pickedPlace.name}` : "here"}.`
    : !checked
      ? picture.compared
        ? "Nothing has been checked yet."
        : "Nothing has been filed yet, so there is nothing to check."
      : pickedPlace
        ? `Nothing has been found in ${pickedPlace.name}.`
        : "Everything checked so far is in order.";
  const more = kind
    ? null
    : !checked
      ? picture.compared
        ? "INEC's sheets are gathered and none has been read into figures, and none of our agents' results is in. Findings appear here once either is."
        : "Every result is checked the moment it arrives, and anything wrong appears here by itself. There is nothing to press."
      : "New findings appear here as they are made, and the alarm sounds.";

  return (
    <div className="border-t border-dash-line px-5 py-9 text-center">
      <span aria-hidden="true" className={cn("mx-auto flex size-10 items-center justify-center rounded-full", checked && !kind ? "bg-agree-50 text-agree-600" : "bg-dash-bg text-dash-muted")}>
        {checked ? <Check size={18} strokeWidth={2.75} /> : <Hourglass size={17} strokeWidth={2.25} />}
      </span>
      <p className="mt-3 text-[0.9375rem] font-semibold text-dash-ink">{says}</p>
      {more && <p className="mx-auto mt-1 max-w-[18rem] text-[0.8125rem] leading-snug text-dash-muted">{more}</p>}
    </div>
  );
}

const total = (votes) => Object.entries(votes ?? {}).reduce((sum, [party, value]) => (party === "OTH" ? sum : sum + Number(value ?? 0)), 0);

/**
 * The three results for one place, party by party.
 *
 * Set side by side because that is what a room asks to see, and labelled
 * with how much ground each one covers because the three are almost never
 * over the same polling units. Whether they agree is the card above; this is
 * the figures.
 */
function ThreeResults({ place, whole, name, election }) {
  const from = place ?? whole;
  const columns = [
    { id: "agents", label: "Our agents", votes: from.ours?.returns ? from.ours.votes : null, made: `${formatNumber(from.ours?.returns ?? 0)} results` },
    { id: "irev", label: "INEC's sheets", votes: from.sound ? from.inec.votes : null, made: `${formatNumber(from.sound ?? 0)} sheets read` },
    {
      id: "announced",
      label: "Announced",
      votes: place ? (place.announced?.votes ?? null) : whole.announced?.places ? whole.announced.votes : null,
      made: place ? (place.announced ? "announced" : "not yet") : whole.announced?.places ? `${formatNumber(whole.announced.places)} announced` : "not yet",
    },
  ];

  const parties = [...new Set(columns.flatMap((column) => Object.keys(column.votes ?? {})))]
    .filter((party) => party !== "OTH")
    .sort((a, b) => Math.max(...columns.map((column) => column.votes?.[b] ?? 0)) - Math.max(...columns.map((column) => column.votes?.[a] ?? 0)));
  const top = parties.slice(0, 6);

  return (
    <section aria-label={`The three results in ${name}`} className="overflow-hidden rounded-dash border border-dash-line bg-dash-card shadow-e2">
      <header className="px-4 pt-3.5 pb-2.5">
        <h2 className="font-display text-[1rem] leading-none font-bold tracking-[-0.01em] text-dash-ink">The three results</h2>
        <p className="mt-1 text-[0.75rem] text-dash-muted">{name}</p>
      </header>

      {top.length === 0 ? (
        <p className="border-t border-dash-line px-4 py-6 text-center text-[0.8125rem] text-dash-muted">
          No figures here yet from any of the three.
        </p>
      ) : (
        <table className="w-full border-t border-dash-line text-[0.8125rem]">
          <thead>
            <tr className="text-[0.6875rem] font-medium text-dash-muted">
              <th className="py-2 pr-2 pl-4 text-left font-medium">Party</th>
              {columns.map((column) => (
                <th key={column.id} className="px-2 py-2 text-right font-medium last:pr-4">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-dash-line border-t border-dash-line">
            {top.map((party) => (
              <tr key={party}>
                <th scope="row" className="py-2 pr-2 pl-4 text-left font-bold text-dash-ink">{party}</th>
                {columns.map((column) => (
                  <td key={column.id} className="figure px-2 py-2 text-right text-dash-ink last:pr-4">
                    {column.votes ? formatNumber(column.votes[party] ?? 0) : <span className="text-dash-muted">—</span>}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-dash-bg font-bold">
              <th scope="row" className="py-2 pr-2 pl-4 text-left text-dash-ink">All parties</th>
              {columns.map((column) => (
                <td key={column.id} className="figure px-2 py-2 text-right text-dash-ink last:pr-4">
                  {column.votes ? formatNumber(total(column.votes)) : <span className="font-normal text-dash-muted">—</span>}
                </td>
              ))}
            </tr>
            <tr className="text-[0.6875rem] text-dash-muted">
              <th scope="row" className="py-2 pr-2 pl-4 text-left font-medium">Made of</th>
              {columns.map((column) => (
                <td key={column.id} className="px-2 py-2 text-right last:pr-4">{column.made}</td>
              ))}
            </tr>
          </tbody>
        </table>
      )}

      <p className="border-t border-dash-line px-4 py-2.5 text-[0.75rem] leading-snug text-dash-muted">
        The three cover different numbers of polling units, so these totals are not expected to match. Whether they
        agree is judged above, only where both sides hold the same polling units.
      </p>
      {election && (
        <Link
          href={`/admin/irev/${election.id}`}
          className={cn("flex items-center justify-center gap-1.5 border-t border-dash-line px-4 py-2.5 text-[0.8125rem] font-semibold text-dash-ink hover:bg-dash-bg", FOCUS)}
        >
          Open every sheet INEC published <ArrowUpRight size={14} />
        </Link>
      )}
    </section>
  );
}

/** The places one step down, worst first. The map, for a keyboard. */
function PlaceList({ places, picked, hovered, onHover, onOpen, opens }) {
  const [all, setAll] = useState(false);
  const rows = all ? places : places.slice(0, 10);

  if (places.length === 0) {
    return <p className="border-t border-dash-line px-4 py-6 text-center text-[0.8125rem] text-dash-muted">INEC lists no polling unit here for this election.</p>;
  }

  return (
    <>
      <ul className="divide-y divide-dash-line border-t border-dash-line">
        {rows.map((place) => {
          const lamp = LAMP[place.verdict];
          const Icon = lamp.icon;
          return (
            <li key={place.key}>
              <button
                type="button"
                onClick={() => onOpen(place)}
                onMouseEnter={() => onHover(place.key)}
                onMouseLeave={() => onHover(null)}
                aria-pressed={opens ? undefined : picked === place.key}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-dash-bg",
                  FOCUS,
                  (picked === place.key || hovered === place.key) && "bg-dash-bg"
                )}
              >
                <span aria-hidden="true" className={cn("flex size-5 shrink-0 items-center justify-center rounded-full", place.verdict === "waiting" ? "bg-dash-bg text-dash-muted" : cn(lamp.dot, "text-white"))}>
                  <Icon size={11} strokeWidth={3.25} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] font-semibold text-dash-ink">{place.name}</span>
                  <span className={cn("block truncate text-[0.75rem]", place.verdict === "waiting" || place.verdict === "look" ? "text-dash-muted" : lamp.text)}>
                    {reasonFor(place)}
                  </span>
                </span>
                {place.counts.total > 0 && (
                  <span className="figure shrink-0 rounded-full bg-dash-ink px-2 py-0.5 text-[0.6875rem] font-bold text-white" title={`${formatNumber(place.counts.total)} to look at`}>
                    {formatNumber(place.counts.total)}
                  </span>
                )}
                {opens && <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-dash-muted/50" />}
              </button>
            </li>
          );
        })}
      </ul>
      {places.length > 10 && (
        <button
          type="button"
          onClick={() => setAll((was) => !was)}
          className={cn("block w-full border-t border-dash-line px-4 py-2.5 text-center text-[0.8125rem] font-semibold text-dash-ink hover:bg-dash-bg", FOCUS)}
        >
          {all ? "Show the first 10" : `Show all ${formatNumber(places.length)}`}
        </button>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════ one finding, open */

/**
 * Everything about one finding.
 *
 * It comes in from the right, over the list it came from, and leaves the map
 * where it was: somebody reading a finding is still watching the country.
 * Escape, the cross and a press anywhere outside all close it, and the press
 * that opened it gets the keyboard back.
 *
 * The order is the order of the questions somebody asks out loud: what is
 * it, where, between which records, what are the figures, why does it
 * matter, and what do I do now.
 */
function Detail({ update, election, onClose, onUnit, onShow }) {
  const close = useRef(null);
  const Icon = KIND_ICON[update.kind] ?? ShieldAlert;
  const tone = LEVEL[update.level] ?? LEVEL.INFO;
  const action = update.action ? ACTIONS[update.action] : null;

  useEffect(() => {
    const before = document.activeElement;
    close.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (before instanceof HTMLElement) before.focus();
    };
  }, [onClose]);

  /* The figures, in whichever of the three columns this finding has. */
  const rows = (update.gaps ?? []).map((gap) => ({
    what: gap.what,
    agents: gap.ours,
    irev: gap.inec ?? gap.irev,
    announced: gap.announced,
  }));
  const columns = ["agents", "irev", "announced"].filter((id) => rows.some((row) => typeof row[id] === "number"));

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-dash-ink/35 backdrop-blur-[1px]" />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="verify-detail-title"
        className="dash relative flex h-full w-full max-w-[30rem] animate-verify-sheet flex-col bg-dash-card shadow-e3"
      >
        <header className="flex items-start gap-3 border-b border-dash-line px-5 pt-5 pb-4">
          <span aria-hidden="true" className={cn("flex size-10 shrink-0 items-center justify-center rounded-dash-sm", tone.tile)}>
            <Icon size={19} strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-semibold text-dash-muted">
              {KINDS[update.kind].one}
              <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-bold", tone.pill)}>{tone.label}</span>
            </p>
            <h2 id="verify-detail-title" className="mt-1.5 font-display text-[1.1875rem] leading-snug font-extrabold tracking-[-0.015em] text-dash-ink">
              {update.title}
            </h2>
          </div>
          <button
            ref={close}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn("flex size-9 shrink-0 items-center justify-center rounded-full border border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink", FOCUS)}
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[0.875rem]">
            <dt className="text-dash-muted">Where</dt>
            <dd className="font-semibold text-dash-ink">{whereWords(update)}</dd>
            <dt className="text-dash-muted">Between</dt>
            <dd className="font-semibold text-dash-ink">{betweenWords(update)}</dd>
            <dt className="text-dash-muted">What it is</dt>
            <dd className="text-dash-ink">{KINDS[update.kind].what}</dd>
          </dl>

          {rows.length > 0 && columns.length > 0 && (
            <section>
              <h3 className="text-[0.8125rem] font-semibold text-dash-ink">The figures</h3>
              <table className="mt-2 w-full overflow-hidden rounded-dash-sm border border-dash-line text-[0.875rem]">
                <thead>
                  <tr className="bg-dash-bg text-[0.75rem] text-dash-muted">
                    <th className="px-3 py-2 text-left font-medium">Figure</th>
                    {columns.map((id) => (
                      <th key={id} className="px-3 py-2 text-right font-medium">{SHORT[id]}</th>
                    ))}
                    {columns.length === 2 && <th className="px-3 py-2 text-right font-medium">Gap</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dash-line">
                  {rows.map((row) => (
                    <tr key={row.what}>
                      <th scope="row" className="px-3 py-2 text-left font-bold text-dash-ink">{row.what}</th>
                      {columns.map((id) => (
                        <td key={id} className="figure px-3 py-2 text-right text-dash-ink">
                          {typeof row[id] === "number" ? formatNumber(row[id]) : "—"}
                        </td>
                      ))}
                      {columns.length === 2 && (
                        <td className="figure px-3 py-2 text-right font-bold text-red-600">
                          {formatNumber(Math.abs((row[columns[0]] ?? 0) - (row[columns[1]] ?? 0)))}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {update.why && (
            <section>
              <h3 className="text-[0.8125rem] font-semibold text-dash-ink">Why it matters</h3>
              <p className="mt-1.5 text-[0.875rem] leading-relaxed text-dash-ink">{update.why}</p>
            </section>
          )}

          {action && (
            <section className="rounded-dash-sm bg-dash-bg px-4 py-3.5">
              <h3 className="text-[0.8125rem] font-semibold text-dash-ink">What to do</h3>
              <p className="mt-1 text-[0.9375rem] font-bold text-dash-ink">{action.label}</p>
              <p className="mt-0.5 text-[0.8125rem] leading-snug text-dash-muted">{action.why}</p>
            </section>
          )}

          <p className="text-[0.8125rem] leading-relaxed text-dash-muted">
            This is a question with its evidence, not a verdict. Nothing here changes a result, and a person reads the
            sheet and decides.
          </p>
        </div>

        <footer className="flex flex-col gap-2 border-t border-dash-line px-5 py-4">
          {update.unitId && election && (
            <Link
              href={`/admin/irev/${election.id}/${update.unitId}`}
              className={cn("flex h-11 items-center justify-center gap-2 rounded-dash-sm bg-dash-ink px-4 text-[0.875rem] font-semibold text-white hover:opacity-90", FOCUS)}
            >
              Open the sheet INEC published <ArrowUpRight size={15} />
            </Link>
          )}
          {update.unitCode && onUnit && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onUnit(update.unitCode);
              }}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-dash-sm px-4 text-[0.875rem] font-semibold",
                FOCUS,
                update.unitId && election ? "border border-dash-line text-dash-ink hover:border-dash-ink" : "bg-dash-ink text-white hover:opacity-90"
              )}
            >
              Open everything on this polling unit
            </button>
          )}
          {onShow && update.where.stateName && (
            <button
              type="button"
              onClick={onShow}
              className={cn("flex h-11 items-center justify-center gap-2 rounded-dash-sm border border-dash-line px-4 text-[0.875rem] font-semibold text-dash-ink hover:border-dash-ink", FOCUS)}
            >
              <MapPin size={15} /> Show {update.where.stateName} on the map
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}
