"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Activity,
  AlertTriangle,
  Target,
  ChevronRight,
  Gauge,
  LineChart,
  Loader2,
  Clock,
  MapPin,
  ShieldCheck,
  Percent,
  Store,
  TrendingDown,
  TrendingUp,
  Users,
  Vote,
} from "lucide-react";

import TopShell from "./TopShell";
import { useGreeting } from "./useGreeting";
import ScopeMap, { CATEGORICAL, LABEL, PARTY_LAYERS, legendFor, describe, magnitude, partyCode, heatPointsFor } from "./ScopeMap";
import GoogleLayer, { googleAvailable } from "./GoogleLayer";
import TargetList from "./TargetList";
import UnitMap, { latLon } from "./UnitMap";
import ScopePanel from "./ScopePanel";
import PartyBreakdown from "./PartyBreakdown";
import CoordinatorWatch from "./CoordinatorWatch";
import RoomTimeline from "./RoomTimeline";
/* ── THE THREE MERGED CONSOLES ─────────────────────────────────────────────
   Each wraps two surfaces that were tabs of their own and had no business
   being apart: alerts with the field reports that explain them, coverage with
   the booth card every one of its findings ends at, and the verification
   checks with the evidence that decides what to do about them. The halves
   they wrap are unchanged and still their own files; what these add is the
   band of pictures across the top and the fact that the two are on one
   screen. */
import RoomSituations from "./RoomSituations";
import { CommandBrief, CommandLedger } from "./CommandDashboard";
import RoomBooth from "./RoomBooth";
import { placeIn, under } from "@/lib/reporting-board";
import { clockLabel } from "@/lib/pulse";
import RoomEvidence from "./RoomEvidence";
import { useBrief } from "./Executive";
/* ── THE TWO ANALYTICAL DASHBOARDS ─────────────────────────────────────────
   Seven surfaces became one dashboard with six tabs, and planning kept a door
   of its own. The halves they wrap — the brief, party ground, the ruling
   party, the projection, the planning map, the sample — are unchanged and
   still their own files; what these add is the tab bar over them and the
   record behind it. See components/dash/ElectionAnalytics.jsx. */
import ElectionAnalytics from "./ElectionAnalytics";
import StrategicPlanning from "./StrategicPlanning";
import SampleDesign from "./SampleDesign";
import DivergencePanel from "./DivergencePanel";
import Analytics from "./Analytics";
import ElectionSwitcher from "./ElectionSwitcher";
import PartyStrength from "./PartyStrength";
import Behaviour from "./Behaviour";
import PlanningMap from "./PlanningMap";
import RulingParty from "./RulingParty";
import LiveRefresh from "./LiveRefresh";
import RaceSwitcher from "./RaceSwitcher";
import GroundBanner from "./GroundBanner";
import SeatBrief from "./SeatBrief";
import Sparkline from "./Sparkline";
import { PARTY_FILL } from "./Charts";
import { partyFill } from "@/lib/party-pattern";
import { snapshot, parties, allParties } from "@/lib/replay";
import { LEVELS } from "@/lib/alerts";
import { rememberViewCookie } from "@/lib/last-view";
import { LANDING } from "@/lib/room-views";
/* What the whole record covers — 1999 to the last election held. */
import { span } from "@/lib/record";
import { normalise } from "@/lib/assistant";
import { apportion, wardCount, liveRowsFrom, liveNodeFor } from "@/lib/drill";
import { COMMERCIAL_CENTRES, coordinate, unproject } from "@/lib/geo";
import { ruling, seatsBy, crossedFloor, FCT } from "@/lib/governors";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";
import PartyMark from "./PartyMark";
import { partyLogo } from "@/lib/party-register";

/**
 * The situation room.
 *
 * ── ONE FRAME, FOUR LEVELS, FOUR LAYERS ────────────────────────────────────
 * The top bar never leaves. Clicking a state does not open a panel or navigate
 * anywhere, the country in the frame is replaced by the state, at the same
 * size, and the list beside it narrows from 37 states to that state's local
 * governments. Again for wards, again for polling units.
 *
 * The layer and the level are independent. Voters, Turnout and Clusters each
 * drill on their own terms and show their own statistics; they do not fall
 * back to the election result. Changing layer keeps your place, and changing
 * place keeps your layer.
 * ───────────────────────────────────────────────────────────────────────────
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ROOM HAS THREE HEADS, AND EVERY SURFACE HANGS UNDER ONE OF THEM
 *
 *  This was one flat set of eleven tabs, then two heads of eleven and seven,
 *  and it is three now for the same reason it stopped being one: a row of
 *  tabs is a row somebody reads at three metres inside a live bulletin, and
 *  past about eight of them the row stops being read and starts being
 *  scanned. Twenty-two surfaces do not fit in two rows of eight.
 *
 *  The split is not by size. It is by the question being asked, because the
 *  question decides who is standing at the screen:
 *
 *    COMMAND       what needs attention in the next ten minutes, where it is,
 *                  and when it happened. Read by somebody with a phone in
 *                  their hand who is about to ring a coordinator.
 *
 *    ELECTION      the count itself: what arrived, where it stalled, whether
 *                  it can be true, and what one booth is doing. Read by the
 *                  desk that processes returns, all night, without looking up.
 *
 *    INTELLIGENCE  what happened over twenty-seven years and what is likely to
 *                  happen next. Read by somebody with a spreadsheet open,
 *                  usually not during a bulletin.
 *
 *  Mixed together they compete for the same row, and the cost falls on the
 *  urgent side every time: the person watching a stalled count should not be
 *  one slip away from a swing model, and the analyst should not scroll past
 *  fourteen live surfaces to reach one.
 *
 *  Groups survive inside each head, because which group a view sits in is half
 *  of what its label means. Nothing is hidden behind a "more" control: on a
 *  desk where somebody has to reach a screen inside a live broadcast, a tab
 *  two clicks deep is a tab that does not get used.
 * ══════════════════════════════════════════════════════════════════════════
 */
export const MODES = [
  {
    id: "monitor",
    label: "Election Monitor",
    icon: Activity,
    why: "Tonight: what needs attention, where it is, and whether the count can be true.",
    groups: [
      {
        id: "now",
        label: "Command",
        /* ── THE FRONT DOOR, AND THE MAP BESIDE IT ───────────────────────
           Command is first because it is the only surface that answers the
           question the people in this room are actually in it to ask — are
           *we* winning — and being first is also what makes it the screen the
           room lands on, because `FIRST_OF` reads the first tab of the first
           group. See components/dash/CommandDashboard.jsx.

           The three map layers sit beside it rather than in a group of their
           own. They are one map with three things drawn on it, and the map is
           what Command's own figures are a summary of: a room reading "18 of
           24 states" reaches for Results in the same movement, and a group
           boundary between them was a wall through one thought. The level and
           the layer stay independent — changing layer keeps your place, and
           changing place keeps your layer. */
        tabs: [
          { value: "command", label: "Command" },
          { value: "results", label: "Results" },
          { value: "register", label: "Voters" },
          { value: "turnout", label: "Turnout" },
        ],
      },
      {
        id: "watchfloor",
        label: "Situation",
        tabs: [
          /* ── ALERTS AND FIELD REPORTS, WHICH WERE ONE QUESTION ────────
             What this product noticed and what a person standing in a field
             noticed were two tabs, and the wall between them ran through the
             middle of "is anything wrong right now". The two halves
             corroborate each other — a silence threshold is a machine
             noticing a gap, an agent at that booth is a human being
             explaining it — and nobody could see both at once. See
             components/dash/RoomSituations.jsx.

             Singular, because it is one question. "Situations" named the
             plumbing; a room asks what the situation is. */
          { value: "situations", label: "Situation" },
          /* When, as opposed to what. Nothing on it is scheduled: every time
             is a moment this product watched happen — see lib/timeline.js. */
          { value: "timeline", label: "Timeline" },
        ],
      },
      {
        id: "count",
        label: "Booth",
        tabs: [
          /* ══════════════════════════════════════════════════════════════
             BOOTHS AND OPERATIONS WERE ONE QUESTION ASKED FROM TWO ENDS

             "Booths" asked how much of the ground had spoken and drew the
             places that had not. "Operations" asked where a return had
             stopped on the ladder between arriving and being allowed into a
             bulletin. Both are the same sentence — this booth has not
             produced a usable figure yet — read once from the geography and
             once from the desk, and split across two tabs neither could
             finish it.

             One screen now — see components/dash/RoomBooth.jsx. It renders
             through the map frame below rather than carrying a map of its
             own, so the country it draws drills state, local government,
             ward, booth on exactly the machinery the other map layers use.
             ══════════════════════════════════════════════════════════════ */
          { value: "booth", label: "Booth" },
          /* ── THE FINDING AND THE EVIDENCE FOR IT, TOGETHER ────────────
             "Verification" asked whether a return's figures can be true.
             "Result sheets" asked what the return arrived carrying. Split
             across two tabs, neither could decide anything: a failed sum with
             no photograph is a return nobody can check, and the same failed
             sum with a clear photograph is a five-minute desk job. Identical
             on the first screen, opposite instructions, and the thing that
             told them apart was on the other tab. See
             components/dash/RoomEvidence.jsx. */
          { value: "integrity", label: "Verification" },
        ],
      },
      /* ── COORDINATORS IS NOT A TAB IN THIS HEAD ─────────────────────
         It was a fourth group of one. The Election Monitor is specified as
         three: Command, Results, Voters, Turnout · Situation, Timeline ·
         Booth, Verification. A fourth group holding a single tab made the row
         longer without making the night's questions clearer.

         The screen itself is not gone — `watch` is still a layer and
         /room#coordinators and #grassroots still open it, so every link ever
         shared still lands. It simply does not spend a slot on the one row a
         room reads under a bulletin. */
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: LineChart,
    why: "The ground, the record, and what the count is entitled to claim.",
    groups: [
      {
        id: "strategy",
        label: "Analysis",
        /* ══════════════════════════════════════════════════════════════
           THE HEAD'S FRONT DOOR, AND WHY IT IS NOT THE PROJECTION

           Everything else under Analytics is written for somebody doing
           analysis. These two are written for the person the analysis is
           for — a candidate, a political director, a director-general —
           and that reader has one question, four minutes, and no
           intention of opening a second screen.

           Answering it used to take four of them: the map for the share,
           Trends for the last election, Projection for the model,
           Planning for the ground. Four screens computed against four
           denominators, reconciled by hand, at night, before speaking in
           public. They are one call now — see lib/executive.js — and the
           map beside them draws the classification that call produced,
           so the two cannot drift apart.
           ══════════════════════════════════════════════════════════════ */
        tabs: [{ value: "analytics", label: "Election Analytics" }],
      },
      {
        id: "ground",
        label: "The ground",
        /* ── WHERE THE PEOPLE ARE, BEFORE ANYBODY VOTES ─────────────────
           Registered voters per polling unit, drilling the country into
           states, a state into its local governments, a ward into its booths
           — the same frame every other map layer uses, so the drill is the
           one the room already knows.

           It answers the question a deployment is planned from and a queue is
           predicted from: where is the register concentrated tightly enough
           to matter, and where is it spread so thin that covering it costs
           more agents per vote than anywhere else. Both ends are the finding;
           the ramp is read from either direction. */
        tabs: [{ value: "clusters", label: "Clusters" }],
      },
      {
        id: "focus",
        label: "Where to focus",
        /* ══════════════════════════════════════════════════════════════
           WHY PLANNING KEEPS A GROUP OF ITS OWN

           Analysis ends in a finding, and a finding costs nothing to be
           wrong about for an afternoon. Planning ends in a commitment:
           agents deployed, money spent, a director told that these four
           hundred booths are where the fortnight goes.

           Folded into one dashboard the second quietly inherits the
           authority of the first — a ranked list on an analytics screen
           reads as a fact, and the identical list on a planning screen
           reads as a decision somebody has to sign, which is what it is.
           So they are two doors, and the wall between them is the point.
           ══════════════════════════════════════════════════════════════ */
        tabs: [{ value: "planning", label: "Strategic Planning" }],
      },
    ],
  },
];

/** Every tab, flat, each carrying the head and the group it came from. */
const TABS = MODES.flatMap((mode) =>
  mode.groups.flatMap((group) =>
    group.tabs.map((tab) => ({ ...tab, group: group.id, mode: mode.id }))
  )
);

/** Which head a surface belongs to. The one lookup the switch is driven from. */
const MODE_OF = Object.fromEntries(TABS.map((tab) => [tab.value, tab.mode]));

/**
 * A pulse with nothing in it.
 *
 * Every field the two monitoring surfaces read, at zero, so a caller that has
 * not been given one draws an empty room rather than throwing. Zeroes are safe
 * here for the one reason they usually are not: this object is only ever the
 * absence of data, never a measurement, and both screens that read it say in
 * words when there is nothing to show.
 */
const EMPTY_PULSE = {
  at: null,
  filed: 0,
  verified: 0,
  awaiting: 0,
  assigned: 0,
  unitsRegistered: 0,
  funnel: [
    { id: "assigned", label: "Assigned a booth", count: 0, why: "Nobody is assigned yet." },
    { id: "signed", label: "Signed in", count: 0, why: "" },
    { id: "reported", label: "Filed a return", count: 0, why: "" },
    { id: "verified", label: "Verified", count: 0, why: "" },
  ],
  channels: [],
  arrivals: [],
  movement: { minutes: 15, filed: 0, verified: 0, incidents: 0, states: [] },
  clocks: { first: null, last: null, quietMinutes: null, verify: { counted: 0, p50: null, p90: null } },
  silence: [],
  positions: { matched: 0, near: 0, far: 0, unmatched: 0, unknown: 0 },
  capture: { total: 0, compared: 0, photographed: 0, boxes: 0, serial: 0, position: 0, signatures: 0 },
  sheets: { audited: 0, balances: 0, fails: 0 },
  states: [],
  incidents: { total: 0, bySeverity: {} },
};

/** Where a head lands when nothing has been opened in it yet. */
const FIRST_OF = Object.fromEntries(
  MODES.map((mode) => [mode.id, mode.groups[0].tabs[0].value])
);

/* ── WHAT RENDERS THROUGH THE MAP FRAME ────────────────────────────────────
   Not "which tabs sit in the map group" — that is a different question and
   the two are deliberately not the same set. Booth lives under The count,
   because that is the question it answers, and it draws through this frame
   because the thing it most needs is the one asset in this room that already
   drills a state into its local governments, a local government into its
   wards, and a ward into its booths. Giving it a map of its own would have
   meant a second map to keep in step with the first, and the second one
   would always have been the one nobody remembered to fix. */
/* ── COMMAND DRAWS THROUGH THIS FRAME TOO ──────────────────────────────────
   It was a branch of its own carrying a second, static map of the country.
   That map could not drill: clicking a state did nothing, and the room already
   owns a map that goes state, local government, ward, polling unit. Two maps
   in one room is two maps to keep in step, and the one that could not drill
   was the wrong one to keep. Command is a map layer now — it draws "who
   leads", exactly as Results does — with the command panels above the frame. */
/* ── COMMAND DRAWS ON THIS FRAME, BUT NOT FROM THIS BOARD ─────────────────
   It needs the drill — state, local government, ward, polling unit — and this
   frame is the one asset in the room that has it. What it must not inherit is
   the frame's *data*: `board` is the 2023 replay whenever the open project is
   a demonstration, and a live campaign's figures beside a replay's map is two
   elections in one screen.

   So the frame is shared and the board is swapped. See `activeBoard` below. */
const MAP_LAYERS = new Set(["command", "results", "register", "turnout", "density", "booth", "clusters"]);

/**
 * The layers that get no heat field.
 *
 * ── A HEAT FIELD UNDER A PERCENTAGE IS TWO SCALES ARGUING ──────────────────
 * The field is a density: it blooms where the quantity is concentrated, which
 * is the right second reading for a register or a vote total, where "a lot,
 * here" is a real fact about the ground.
 *
 * Booth draws a completion percentage on a pinned scale, and a percentage has
 * no density — a ward that is 90% reported is not "more" than a state that is
 * 90% reported, it is the same fraction of a smaller thing. Bloomed anyway,
 * the field made big places look further along than small ones, which is the
 * exact misreading the pinned decile scale was introduced to stop. Two scales
 * on one map, disagreeing, and the louder one wins.
 *
 * Turnout is here for the same reason and always was — see the note by the
 * toggle below, which said so while the code did it anyway.
 *
 * Clusters is here because it is already a density: voters per polling unit is
 * concentration, drawn as the fill. Blooming a second density field over the
 * top of it draws the same fact twice in two encodings that do not agree at
 * the edges, and the brighter one wins.
 */
const NO_HEAT = new Set(["booth", "turnout", "clusters"]);

/** 1,240 -> "1.2k". The legend's labels are sixteen pixels wide. */
const compact = (value) =>
  value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(Math.round(value ?? 0));

/**
 * Arriving here from the rail, pointed at one view.
 *
 * This room's views are local state, not routes, so a link from anywhere else
 * in the product could only ever land on "Results". "Incident feed" in the
 * sidebar did exactly that: it went to /room#incidents, there was no such
 * anchor, and the reader arrived at the map wondering where the reports were.
 * A hash is the one thing a link can carry into a screen that does not put its
 * views in the URL.
 *
 * It sets the view on arrival and then gets out of the way: the tabs are the
 * control of this screen, and a hash left in the address bar must never argue
 * with the last thing somebody pressed.
 */
const HASH_LAYERS = {
  /* ── THE COMMAND CENTRE'S NAMES OUTLIVE THE COMMAND CENTRE ─────────────
     That screen is gone. The links to it are not: they are in bookmarks, in
     the sidebar, and in WhatsApp messages somebody sent last week. Each one
     lands on the screen holding what it was being followed to find: the old
     overview names on Booth, which is the room's front door now, and
     "#command" on the Command dashboard that took the name back. Deleting
     the entries instead would have dropped every one of them onto the map. */
  "#overview": "booth",
  "#command": "command",
  "#pulse": "booth",
  "#situations": "situations",
  "#alerts": "situations",
  "#timeline": "timeline",
  "#map": "results",
  /* Booths and Operations were two tabs and are one screen. Both names, and
     both of their old anchors, still arrive at it. */
  "#coverage": "booth",
  "#operations": "booth",
  "#pipeline": "booth",
  /* ── THE COORDINATOR WATCH NO LONGER HAS A TAB ────────────────────────
     The Election Monitor is three groups now and Coordinators is not one of
     them. This hash is in the rail, in bookmarks and in messages sent last
     week, so it keeps a door: Booth is where it lands, because "who has filed
     and who has not, by place" is the question the coordinator watch was
     mostly opened to answer.

     The `watch` layer is still rendered further down this file and is now
     reachable by nothing. It is left standing rather than deleted because
     restoring its tab is one line and deleting a screen is not. */
  "#coordinators": "booth",
  /* ── THE MERGED CONSOLES, AND EVERY NAME THAT USED TO REACH A HALF ──────
     Four surfaces became two, and none of the old names is dropped. A link,
     a bookmark or a WhatsApp message carrying #unit, #incidents, #evidence or
     #declared was written when those were tabs of their own; each now lands
     on the console that swallowed it, which is the screen holding what the
     reader was looking for. A dead hash falls through to the map, and
     arriving at a map when you asked for the incident feed is the one
     outcome this table exists to prevent. */
  "#unit": "booth",
  "#booth": "booth",
  "#incidents": "situations",
  "#stream": "situations",
  "#reports": "situations",
  "#declared": "integrity",
  "#integrity": "integrity",
  "#verification": "integrity",
  "#quality": "integrity",
  "#sheets": "integrity",
  "#evidence": "integrity",
  "#analytics": "analytics",
  "#planning": "planning",
  "#sample": "planning",
  /* ── THE ANALYTICAL HEAD, AND EVERY NAME THAT USED TO REACH A PART ─────
     Seven surfaces became one dashboard with six tabs, and none of the old
     names is dropped. The brief, the classified map, party ground, the ruling
     party, clusters and trends were each a tab with a hash of its own, and
     every one of those hashes has been written into a link, a bookmark or a
     WhatsApp message. They all land on Election Analytics, which is holding
     what the reader was looking for.

     A hash is a door, not a taxonomy. A door that turns out to be the room
     next to the one you expected is much better than one that opens on the
     map, which is what a dead hash does. */
  "#executive": "analytics",
  "#strategy": "analytics",
  "#strategic": "analytics",
  /* ── "#overview" IS NOT LISTED HERE, AND THAT IS THE FIX ───────────────
     It was, and it was also listed at the top of this table. Two identical
     keys in one object literal is not two doors, it is one: the later wins
     silently. So the sidebar's own "Overview" link — /room#overview, in
     components/dash/DashNav.jsx — had been landing on the analytics
     dashboard rather than on the room's front door, and nothing anywhere
     said so, because a duplicate key is not an error in JavaScript.

     The name belongs to the room's landing screen, which is where the link
     that carries it is trying to go. Analytics keeps every name that is
     actually its own. */
  "#classify": "analytics",
  "#geography": "analytics",
  "#geographic": "analytics",
  "#parties": "analytics",
  "#candidates": "analytics",
  "#ruling": "analytics",
  "#historical": "analytics",
  /* Clusters is a map layer again and has its own entries below — see
     "#clusters" there. These two pointed at the analytics head from the
     period when the layer had no tab of its own. */
  /* Geography's four tiers. All four are the same record at a different
     depth, and the depth is set beside this — see HASH_LEVELS below. */
  "#states": "analytics",
  "#lgas": "analytics",
  "#wards": "analytics",
  "#units": "analytics",
  /* Intelligence. Grassroots strength is a tab of Strategic Planning now,
     because knowing how strong the organisation is where it claims to be
     strong is a planning question and not an analytical one. Community
     reports are what the field files; trend detection and anomaly screening
     each already had a room. */
  "#grassroots": "planning",
  "#clusters": "clusters",
  "#density": "clusters",
  "#resources": "planning",
  "#scenarios": "planning",
  "#priorities": "planning",
  "#community": "situations",
  "#turnout-analytics": "analytics",
  "#trends": "analytics",
  "#behaviour": "analytics",
  "#anomalies": "integrity",
  /* ══════════════════════════════════════════════════════════════════════
     THE DOOR /governors USED TO BE, AND WHY IT LED NOWHERE

     There were two routes to the standing governorship map: a tab in this
     room, and a page of its own at /governors rendering the same component
     from the same three functions. The tab was made the survivor and
     /governors was pointed at it — and then the tab itself was folded into
     Election Analytics, where components/dash/RulingParty.jsx is rendered
     today. These three names were never moved with it.

     They pointed at "ruling", which has not been a layer since. There is no
     branch for it in the render below, so it fell through to the map: every
     account that can open the room — a super administrator, a situation room —
     pressed "Who governs" in the sidebar, was redirected here by
     app/governors/page.jsx, and arrived at a map of the count instead. The
     accounts that *cannot* open the room were served the page correctly, so
     the break was invisible to exactly the people least likely to report it.

     Nothing announced it. A hash naming a layer that does not exist is not an
     error, it is a silent fallthrough, which is the failure mode this whole
     table was written to prevent — see the note at its head.

     "#ruling" was also declared twice in this object, here and in the
     analytics block above. Two identical keys in one object literal is not
     two doors: the later wins silently, so the correct entry above was being
     overwritten by this one. The correct entry stays; these do not.

     "#command" is declared once, up with the other names from the era this
     room called its landing screen a command centre. It was here as well,
     with the same value — harmless today, and the same trap: the day one of
     the two is changed, the other silently wins.
     ══════════════════════════════════════════════════════════════════════ */
  "#governs": "analytics",
  "#governors": "analytics",
};

/**
 * How deep a link asks the map to go.
 *
 * ── WHY A HASH CAN SET THE LEVEL AND USUALLY MUST NOT ──────────────────────
 * "Wards" in the rail means the ward tier of the map, and arriving at the
 * country with a ward label lit would be a lie. But the level is not a free
 * choice: a ward belongs to a local government, which belongs to a state, and
 * the room cannot invent which. So this only ever asks, and the room grants it
 * as far as the place already on screen allows — see `deepen` below. A room
 * pinned to one state can reach its local governments; a room looking at the
 * whole federation cannot reach a ward without being told which one.
 */
const HASH_LEVELS = {
  "#states": 0,
  "#lgas": 1,
  "#wards": 2,
  "#units": 3,
};

/* ── THE READER THAT USED TO STAND HERE ────────────────────────────────────
   A `useSyncExternalStore` pair read the remembered view out of local storage
   after hydration, plus a PENDING sentinel to tell "the server has not looked"
   apart from "nothing was stored" — a distinction that existed only because
   the server genuinely could not look.

   It can now. The view arrives as a prop, already validated, and is the
   component's initial state. The store, the sentinel and the subscribe-to-
   nothing stub all existed to work around a value the server could not see,
   and none of them has anything left to do. See lib/last-view.js.
   ─────────────────────────────────────────────────────────────────────────── */

function subscribeHash(onChange) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const readHash = () => window.location.hash;
const noHash = () => "";

/**
 * What the map is drawing, said in words on the screen itself.
 *
 * Four things, and the last two are the ones worth separating: a grey map
 * because nobody has filed anything yet and a grey map because nothing was
 * ever declared look identical and mean completely different things. A room
 * that cannot tell them apart cannot tell whether to ring somebody.
 */
const BOARD_SOURCE = {
  replay: "Demonstration · 2023 replay",
  returns: "Our agents' returns",
  declared: "Declared figures",
  empty: "Nothing filed yet",
};

const TICK = 220;

export default function SituationRoom({
  user,
  board,
  /* ── WHOSE ROOM THIS IS ─────────────────────────────────────────────────
     Built on the server (lib/principal.js) because it reads the environment,
     which a browser cannot. Every figure on the command dashboard is computed
     for this party; a room that reported a share without saying whose would
     one day have it read as the leader's. */
  principal = null,
  /* The whole command dashboard, built on the server from the live count and
     never from the replay — see the note above `commandBoard` in
     app/room/page.jsx. Null where no project is open. */
  command = null,
  /* The share the last presidential election was won on, from the 2023
     declared record. Passed rather than written into the component, so the
     benchmark cannot drift from the record it came from. */
  benchmark = null,
  shapes,
  states,
  incidents = [],
  incidentCount,
  /* ── DATA BANK'S REPORTS BOARD, AND WHY IT IS A SEPARATE PROP ───────────
     Not merged into `incidents`. These two lists know different things: ours
     carries the agent's own account of what happened, sealed; the hub's
     carries that a report of some category and severity exists for a booth,
     over a channel, and deliberately never carries the words. Blending them
     would put rows with no narrative beside rows with one and read as missing
     data rather than as a different kind of evidence. See lib/intake.js. */
  hubReports = null,

  /* Who has not sent their result, rolled up down the whole country on the
     server — see lib/reporting.js. Indexed by the same place names the map's
     trail is built from, so the Booth layer can colour any level without a
     second fetch and without a vocabulary of its own. */
  /* Which dashboard to open on, decided on the server from the cookie the
     room writes — see lib/last-view.js. Arriving as a prop is the whole
     point: the first paint is already the right screen, so there is no moment
     where the wrong one is on the wall. */
  initialView = LANDING,
  booth = null,
  coordinators = [],
  watchSummary = { total: 0, filed: 0, located: 0, far: 0, silent: 0 },
  photos = {},
  /* The election switcher, built on the server and handed down: this is a
     client component and cannot read the cookie that names the current
     project, nor query the list. */
  projects = null,
  /* The states this election is actually fought in. Empty means the whole
     federation. */
  scopeStates = [],
  /* ── AND THE GROUND THIS PARTICULAR ROOM MAY READ ────────────────────────
     Not the same thing as the line above, and the difference is the whole
     point: `scopeStates` is what the contest covers, this is what this account
     holds of it. A project running the governorship in six states may be
     watched by a newsroom that holds one, and by a campaign that holds a
     single senatorial district inside it.

     Resolved on the server — the district tables and the local government
     names are both read from disk — and arrives carrying the names of the
     local governments it contains, because the boundary files are keyed by
     name and turning a code back into one is an assumption that lives in
     lib/lga-names.js and must not be made a second time in a browser. */
  territory = null,
  ground = null,
  racePinned = false,
  territoryUnresolved = false,
  /* Who holds this ground in this contest, and the last election for it.
     Built on the server — see app/room/page.jsx. */
  seat = null,
  /* The last declared governorship in each state on screen, keyed by state
     code, from lib/seats.js. The analytics screen's baseline. */
  stateResults = {},
  /* Our count held against what was announced. Built on the server by
     lib/gap-report.js — the same function /gap uses, so the headline here and
     the list there can never disagree. */
  divergence = null,
  /* ── THE NIGHT'S VITAL SIGNS ────────────────────────────────────────────
     Assembled on the server by lib/pulse.js out of rows this page already
     fetched: the funnel, the channels, the clocks, the silence list. Not one
     figure in it costs a query of its own, which is the reason the overview
     can sit on a wall refreshing every fifteen seconds without falling over.

     Defaulted to an empty pulse rather than to null so the two monitoring
     surfaces render an honest empty state instead of throwing on a caller
     that has not been updated. */
  pulse = EMPTY_PULSE,
  /* What the anomaly rules found across our returns — lib/anomalies.js, the
     same screening the administrator's ledger runs, so a room and a desk can
     never be looking at two different counts of the same thing. */
  integrity = { flags: [], impossible: 0, flagged: 0, screened: 0, clean: 0 },
  /* The returns whose own EC8A boxes disagree with each other, worst first. */
  sheetFindings = [],
  /* ── THE THREE SURFACES THAT WERE MISSING, ALL ASSEMBLED ON THE SERVER ──
     The pipeline, the warning list and the night's clock. Every one of them
     is a pure function over rows this page already fetched — lib/operations.js,
     lib/alerts.js, lib/timeline.js — for exactly the reason the pulse is: a
     browser on a wall refreshing every fifteen seconds should be drawing, not
     screening four thousand returns.

     Null rather than an empty default, because each of these screens says in
     words when it has nothing, and a fabricated empty object would let one
     draw a confident zero where the truth is "this was never built". */
  operations = null,
  /* Named `escalations` and not `alerts`: the bell already owns that word in
     this component — it carries the gap findings and the incident feed — and
     two different lists under one name in one file is a bug waiting for
     somebody in a hurry. This is the ranked warning list, from lib/alerts.js. */
  escalations = null,
  timeline = null,
  /* Everything the room holds about each booth, keyed by unit code. Built once
     on the server so that clicking a booth — the commonest interaction in the
     room, at the busiest hour — costs no round trip at all. See
     lib/unit-card.js. */
  unitCards = {},
  /* How the machine readers have done on this project, by reader. */
  sheetReads = null,
  /* ── THE RETURNS, FOLDED INTO THE PLACES THEY CAME FROM ─────────────────
     Present only for a live project. The board above draws the country; this
     draws everything underneath a state, and it holds what was filed and
     nothing else. Null on the 2023 replay, which apportions instead and says
     so on the screen. */
  liveTree = null,
  /* The project being watched, for the one line on screen that has to say
     whether this is a count or a worked example. */
  project = null,
  /* Where the figures on the map came from: "replay", "returns", "declared"
     or "empty". Decided on the server, which is the only place that can tell
     an empty count from an undeclared one. */
  boardSource = "replay",
  /* Which contest is on screen, and the others available on this project with
     how much of each has arrived. */
  race = "PRESIDENTIAL",
  races = [],
  filedByRace = {},
  onRace,
}) {
  /* ── ONE PIECE OF STATE, NOT TWO ────────────────────────────────────────
     The head is derived from the open surface rather than stored beside it.
     Two copies of "where am I" is how a room ends up with Analytics lit while
     a map is on the screen, and every route into this component — a tab, a
     hash, the search, the assistant, the alarm bell — would have had to
     remember to update both. There is one, and the switch reads it. */
  /* ── WHERE THE ROOM OPENS ────────────────────────────────────────────
     Whatever the server settled on: the view this reader was last on, or the
     landing screen when there is nothing to remember. Both arrive as one
     already-validated prop, so this component has no opinion about either and
     nothing here can disagree with what was rendered. */
  const [layer, setLayer] = useState(initialView);
  const mode = MODE_OF[layer] ?? MODES[0].id;

  /* ── WHICH BOOTH THE INTELLIGENCE CARD IS SHOWING ───────────────────────
     Kept here rather than inside the card, because a booth code is the thing
     every other surface in this room ends in and following one should never
     take two presses. The stuck list on Results operations is wired today;
     the incident feed, the coordinator watch and the map each end in a code
     as well, and each is one `onUnit={openUnit}` away from opening it. */
  const [unit, setUnit] = useState(null);

  const openUnit = useCallback((unitCode) => {
    setUnit(unitCode);
    setLayer("unit");
  }, []);

  /* Where each head was left. Crossing back should return somebody to the
     surface they were reading, not to the head's front door — the analyst who
     steps over to check a stalled count and comes back has not finished with
     the projection they were on. Adjusted during render, which is React's
     documented way to react to a changed value. */
  /* `FIRST_OF` alone. This carried `{ [MODE_OF.pulse]: "pulse" }` to force the
     monitor head onto its command centre, and "pulse" stopped being a tab in
     an earlier pass — so `MODE_OF.pulse` was `undefined` and the override
     wrote a key literally named "undefined". Command is the first tab of the
     first group now, which is what `FIRST_OF` means. */
  const [recent, setRecent] = useState(() => ({ ...FIRST_OF }));
  if (recent[mode] !== layer) setRecent({ ...recent, [mode]: layer });

  /* Adjusted during render when the hash changes, which is React's documented
     way to react to a changed value and the only one that cannot paint the
     wrong view for a frame first. The server snapshot is empty because a hash
     never reaches the server, so a cold load of /room#incidents corrects
     itself immediately after hydration and a click from another room, which
     fires no hash event at all, is caught by the same comparison. */
  const hash = useSyncExternalStore(subscribeHash, readHash, noHash);
  const [seenHash, setSeenHash] = useState("");

  /* ══════════════════════════════════════════════════════════════════════
     COMING BACK TO WHERE YOU WERE

     Nothing is restored here any more, because there is nothing left to
     restore: the server already rendered the remembered view. What used to
     stand here read local storage after the first paint and then corrected
     the screen, which is why every reload showed the front door for a moment
     first. A correction that happens after paint is a flash, however fast it
     is, and this room is read across a room.

     All that remains is the write. On every change rather than on unload: a
     tab closed by a crash, a kernel panic or a pulled power lead never fires
     an unload handler, and those are precisely the reloads this exists for.
     ══════════════════════════════════════════════════════════════════════ */
  useEffect(() => {
    /* The unit card is a place somebody is reading and is remembered like any
       other. Writing is the "update an external system" case an effect is
       actually for, and a failed write costs nothing but the front door. */
    rememberViewCookie(layer);
  }, [layer]);



  /**
   * The states this contest is fought in.
   *
   * ── A GOVERNORSHIP IS NOT A FEDERATION ─────────────────────────────────
   * Every project used to draw all 37 states. On an Ekiti governorship that
   * meant 36 of them sitting grey — and grey, everywhere else in this product,
   * means "nobody has reported yet". Nobody is ever going to report from Kano
   * in an Ekiti election. Not-yet and not-applicable are different facts, and
   * a board that draws them the same way is quietly wrong all night.
   */
  const inScope = useMemo(() => {
    /* The account's own ground wins over the project's, because it is always
       the narrower of the two: an account inside a six-state contest holding
       one state must not be shown the other five, and one holding a district
       is inside exactly one state by construction. */
    if (territory?.stateCode) return states.filter((row) => row.code === territory.stateCode);
    if (!scopeStates?.length) return states;
    const wanted = new Set(scopeStates);
    return states.filter((row) => wanted.has(row.code));
  }, [states, scopeStates, territory]);

  /* The state the map has no reason to leave: the one this account's ground is
     inside, or the single state this contest is fought in. */
  const pinnedCode = territory?.stateCode ?? (scopeStates?.length === 1 ? scopeStates[0] : null);
  const pinnedState = pinnedCode
    ? { code: pinnedCode, name: states.find((row) => row.code === pinnedCode)?.name ?? pinnedCode }
    : null;

  /* A contest in one state, or an account inside one, opens on that state.
     There is no country to zoom out to, so the map starts where the election
     — or the account — actually is. */
  const [path, setPath] = useState(() => (pinnedState ? [pinnedState] : [])); // [state, lga, ward]
  const [hovered, setHovered] = useState(null);

  /* ── AND WHAT A LINK FROM OUTSIDE THIS ROOM IS ALLOWED TO SET ────────────
     Read above the state it changes, but applied here, because a hash can now
     ask for a depth as well as a surface and the trail is what answers that.

     The depth is a request, never an instruction. "Wards" in the rail means
     the ward tier, and the room grants as much of it as the place already on
     screen supports: a room pinned to a state can be taken down to its local
     governments, and a room looking at the whole federation cannot be taken
     to a ward, because nobody has said which ward. Truncating rather than
     inventing means the worst outcome is arriving one tier shallower than
     asked, which the breadcrumb then explains for itself. */
  if (hash !== seenHash) {
    setSeenHash(hash);
    if (HASH_LAYERS[hash]) setLayer(HASH_LAYERS[hash]);

    const wanted = HASH_LEVELS[hash];
    if (wanted !== undefined) {
      /* ── AND NEVER OUT PAST THE GROUND THIS ACCOUNT HOLDS ─────────────
         A room pinned to one state opens on that state and has no country to
         zoom out to. Without this floor, /room#states would walk a district
         campaign out to all 37 — every figure on it real, none of it theirs.
         The pin is the floor for the same reason the voice command refuses
         to leave it. */
      const floor = pinnedState ? 1 : 0;
      const depth = Math.max(floor, wanted);
      /* Only ever shallower than where we are. Going deeper needs the name of
         a place, and a link from the rail does not carry one. */
      if (depth < path.length) setPath(path.slice(0, depth));
    }
  }

  /* ── THE FIELD, AND WHOSE GROUND IT IS ON ─────────────────────────────
     Voters, Turnout and Clusters are questions about concentration, and a
     choropleth cannot answer one: it paints Nasarawa and Kano the same size.
     So those three carry a density field by default. Results never does —
     "who won" is not a quantity and has no density.

     The ground under it is a separate choice. Our own map always works;
     Google's is offered only where a key is configured, because a room on a
     venue's wifi cannot fix somebody else's outage at nine at night. */
  const [heat, setHeat] = useState(true);

  /**
   * ── WHICH GROUND, AND WHY EARTH IS THE DEFAULT HERE ──────────────────────
   * Null means "whatever this layer should open on", and for Voters, Turnout
   * and Clusters that is the satellite imagery whenever a key is configured.
   * Those three ask questions a drawn map cannot answer — where the people
   * are, and what is physically under a crowd — so the ground is the answer
   * rather than the backdrop. Results opens on our own map, because who won
   * is not a question about terrain.
   *
   * Once the reader picks a ground it is kept, including across a change of
   * layer: somebody who has deliberately gone back to the drawn board should
   * not be returned to imagery by clicking a tab.
   */
  /* Named `basemap`, not `ground`: this room already has a `ground`, and it
     means the political territory an account covers. Two grounds in one
     component is a bug waiting for somebody in a hurry. */
  const [basemap, setBasemap] = useState(null); // null = the layer's own default
  const [picked, setPicked] = useState(null); // the jurisdiction whose full card is open
  const [boundaries, setBoundaries] = useState(null); // { code, data } for one state
  const [cursor, setCursor] = useState(board.opening);
  const [reduced, setReduced] = useState(false);


  /**
   * A place named out loud that we could hear but could not yet place.
   *
   * "Take me to Ikeja in Lagos" arrives before Lagos's local governments do,
   * and all 774 names are not worth shipping to every browser to cover it.
   * So the name is held here and spent the moment the boundary file lands.
   * A ref rather than state: nothing on screen depends on it, and it must not
   * cause a render of its own.
   */
  const pendingDrill = useRef(null);

  const [state, lga, ward] = path;
  const level = ["nation", "state", "lga", "ward"][path.length];

  /* ------------------------------------------------------------ the replay */
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(query.matches);
      if (query.matches) setCursor(board.events.length);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [board.events.length]);

  useEffect(() => {
    if (reduced || cursor >= board.events.length) return;
    const timer = setTimeout(() => setCursor((value) => value + 1), TICK);
    return () => clearTimeout(timer);
  }, [reduced, cursor, board.events.length]);

  /* ══════════════════════════════════════════════════════════════════════
     WHICH BOARD THE ROOM IS READING

     Every tab but one reads `board`, which is the replay on a demonstration
     project and the live count otherwise. Command always reads the live count
     — built on the server and handed down whole, see `commandBoard` in
     app/room/page.jsx — because it reports a named campaign's own standing
     and must never report the 2023 replay's figures as that campaign's.

     The cursor goes with it. `cursor` is the replay's scrubber, which a live
     count has no use for: there is nothing to play back, only everything
     filed so far, so Command sits at the end of its own events.
     ══════════════════════════════════════════════════════════════════════ */
  const onCommand = layer === "command" && Boolean(command?.board);
  const activeBoard = onCommand ? command.board : board;
  const activeCursor = onCommand ? command.board.events.length : cursor;

  /* ── AND COMMAND IS A CLEAN SLATE ALL THE WAY DOWN ───────────────────────
     The board swap above only ever covered the country. Every level beneath
     it was built from `liveTree`, and where there was none — a demonstration
     project — from the replay's declared state totals divided down through
     real local governments, wards and booths. So a double click on a state
     under Command opened last election's figures, which is exactly what this
     screen must never show.

     Command drills its own tree now, built on the server from the same feed
     as its board, and never falls back to dividing anything: a place nobody
     has filed from is empty. Past figures stay on Results. */
  const activeTree = onCommand ? (command.tree ?? null) : liveTree;
  const drillFiled = onCommand || Boolean(liveTree);

  const view = useMemo(
    () => snapshot(activeBoard, activeCursor),
    [activeBoard, activeCursor]
  );

  /* The spread is computed on the server now, off the live board rather than
     off `view` — see `commandSpread` in app/room/page.jsx. Computing it here
     would have read whichever board the room happens to be drawing, which on
     a demonstration project is the 2023 replay. */
  const spread = command?.spread ?? null;

  /* What this board's vote arrays mean, position by position. A governorship
     board carries the parties that actually contested it — Accord won Osun and
     APGA won Anambra, and neither is one of the presidential four — so every
     screen that turns a position back into a party name has to read this and
     not the fixed list. See lib/replay.js and ScopeMap.partyCode. */
  const slots = activeBoard.parties ?? allParties;

  /* The places a return has just landed in, the last handful of batches.
     Drives the expanding rings on the map, which is the only thing on the
     screen that answers "where is it coming from right now". */
  const pulsing = useMemo(() => {
    const recent = activeBoard.events.slice(Math.max(0, activeCursor - 4), activeCursor);
    /* `activeBoard`, not `board`: an event's `state` is an index into the
       board it came from, and reading it against a different board is how a
       return lands on the wrong shape. */
    return new Set(recent.map((event) => activeBoard.states[event.state]?.code).filter(Boolean));
  }, [activeBoard, activeCursor]);

  /* -------------------------------------------------------- the boundaries
     What arrives is stamped with the state it was fetched for, and whether the
     map is still waiting is then read off that stamp rather than kept in a
     second flag of its own. A flag has to be switched on and off in the right
     order; a stamp cannot disagree with the shapes sitting next to it, so the
     spinner cannot be left running over a map that has already drawn. */
  const stateCode = state?.code ?? null;

  useEffect(() => {
    if (!stateCode) return;
    let cancelled = false;
    fetch(`/geo/lga/${stateCode}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        setBoundaries({ code: stateCode, data });

        /* ── FINISHING A DRILL THAT WAS ASKED FOR OUT LOUD ──────────────
           Somebody said a local government by name a moment ago and the
           names have only just arrived. Matched loosely in both directions,
           because "Ikeja" should find "Ikeja" and "Oshodi Isolo" should find
           "Oshodi-Isolo", and a spoken name is never punctuated the way a
           boundary file is. No match means the word was not a place here,
           and the map stays on the state rather than picking something
           arbitrary a second after the person stopped talking. */
        const wanted = pendingDrill.current;
        pendingDrill.current = null;
        if (!wanted || !data?.lgas) return;

        const hit = data.lgas.find((row) => {
          const name = normalise(row.name);
          return name === wanted || name.includes(wanted) || wanted.includes(name);
        });
        if (hit) setPath((previous) => (previous.length === 1 ? [previous[0], { name: hit.name }] : previous));
      })
      .catch(() => !cancelled && setBoundaries({ code: stateCode, data: null }));
    return () => {
      cancelled = true;
    };
  }, [stateCode]);

  /* Only ever the boundaries of the state being looked at now. A reply for the
     state just left stays invisible, and so does one that has not landed. */
  const lgaShapes = boundaries?.code === stateCode ? boundaries.data : null;
  const loading = Boolean(stateCode) && boundaries?.code !== stateCode;

  /* ------------------------------------------------------------- the rows
     Each level's figures come from the level above and always sum back to it. */
  const stateData = useMemo(
    () => (state ? states.find((row) => row.code === state.code) : null),
    [state, states]
  );

  /**
   * The states, as they stand right now.
   *
   * ── EVERY LAYER IS LIVE ────────────────────────────────────────────────
   * An earlier pass only animated Results and left the other three reading
   * the static register, which made three of the four dashboards a printed
   * table. They are all derived from the same moving snapshot now:
   *
   *   Voters   how much of the register has actually reported, the register
   *            itself does not change, but its coverage does, all evening.
   *   Turnout  votes counted against the register of the booths that have
   *            reported. It is meaningless against the whole register at 10%
   *            counted, and this is the figure a room actually quotes.
   *   Clusters votes per reporting unit, where the volume is landing right
   *            now, which moves as the cities come in late.
   *
   * A place that has not reported returns null rather than zero, so it stays
   * grey on the map: silence is not a low number.
   */
  const nationRows = useMemo(
    () =>
      inScope.map((row) => {
        const live = view.byState.find((item) => item.code === row.code);
        const reported = live?.reported ?? false;
        const boothsIn = live?.units ?? 0;

        /* ── A LIVE COUNT IS NOT SCALED, BECAUSE THERE IS NOTHING TO SCALE ──
           The replay holds each state's finished 2023 result and shows the
           slice of it that has "arrived", which is the only way to play back an
           election that is already over. A live project has no finished result
           to take a slice of: the figures are the returns that were filed, and
           multiplying them by coverage would show a fraction of a fraction.

           So the same row is built two ways, from the same snapshot, and which
           one is used is decided by the board rather than by the caller
           remembering. */
        const factor = reported ? boothsIn / Math.max(row.booths, 1) : 0;
        const scaled = activeBoard.live
          ? (live?.votes ?? [0, 0, 0, 0, 0])
          : reported
            ? row.votes.map((value) => Math.round(value * factor))
            : [0, 0, 0, 0, 0];
        const scaledTotal = scaled.reduce((sum, value) => sum + value, 0);

        /* The slice of this state's register that has actually reported. Added
           up from the returns on a live board; estimated from coverage on the
           replay, which has no per-booth registers to add. */
        const registerIn = activeBoard.live
          ? (live?.registered ?? 0)
          : reported
            ? Math.round(row.registered * (boothsIn / Math.max(row.booths, 1)))
            : 0;

        return {
          key: row.code,
          name: row.name,
          reported,
          /* ── VOTES AND TOTAL MUST BE THE SAME COUNT ──────────────────
             This used to hand back the full declared votes alongside a total
             scaled to coverage, so any share computed as votes/total ran over
             100% mid-count and the stacked bars overflowed their track.

             Every party is now scaled by the same coverage factor and the
             total is the sum of exactly those scaled figures, so the two can
             never disagree. Scaling everyone identically also preserves the
             order of finish, which is what keeps a two-thousand-vote margin
             like Benue's from flipping as the count comes in. */
          votes: scaled,
          total: scaledTotal,
          /* Voters: the register that has reported, not the whole register. */
          registered: registerIn,
          fullRegister: row.registered,
          /* ── ACCREDITATION IS ITS OWN FIGURE, NOT A DERIVED ONE ───────
             How many people were accredited to vote, added up from the
             returns. It is not votes and it is not the register: the gap
             between accredited and votes cast is spoiled and unused ballots,
             and the gap between accredited and registered is who stayed
             home. Both are real signals and neither survives being folded
             into a turnout percentage.

             Only a live board has it. The replay is built from declared
             state totals, which do not carry an accreditation figure, so it
             is left null there rather than estimated — an invented
             accreditation figure on an election night is exactly the kind of
             number that gets quoted. */
          accredited: activeBoard.live ? (live?.accredited ?? 0) : null,
          booths: boothsIn,
          fullBooths: row.booths,
          coverage: live?.coverage ?? 0,
          /* Turnout: against the reporting register, which is the only
             denominator that means anything mid-count. */
          turnout: registerIn > 0 ? (scaledTotal / registerIn) * 100 : 0,
          /* Clusters: votes per unit that has reported, the live density of
             where the count is actually coming from. */
          density: boothsIn > 0 ? Math.round(scaledTotal / boothsIn) : 0,
        };
      }),
    [inScope, view.byState, activeBoard.live]
  );

  /* ── UNDERNEATH A STATE: FILED, OR APPORTIONED, NEVER BOTH ───────────────
     On a live project every level below the country is built from the returns
     themselves — a place with nothing filed in it simply is not there. On the
     2023 replay there are no per-booth returns to build from, so the state's
     declared total is divided down through its real local governments on a
     stable seed, exactly as before, and the screen says so underneath the map.

     The branch is on the tree being present rather than on a flag somebody has
     to remember to pass with it. */
  const liveStateNode = useMemo(
    () => (activeTree && state ? liveNodeFor(activeTree, state.name) : null),
    [activeTree, state]
  );

  const lgaRows = useMemo(() => {
    if (drillFiled) return liveRowsFrom(liveStateNode);
    if (!stateData || !lgaShapes) return [];

    /* ── DIVIDED ACROSS THE STATE, THEN NARROWED. NOT THE OTHER WAY ROUND ──
       `apportion` splits a parent's total across the names it is handed, so
       handing it seven names splits the WHOLE STATE's votes across seven local
       governments — every figure inflated by three, on a screen whose entire
       purpose is that its figures are real. Adamawa Central came out holding
       Adamawa's 731,140 votes.

       The split has to happen over all 21 for each one to get its own share,
       and the narrowing happens to the answer. A panel ranking 21 beside a map
       drawing 7 is two answers to one question; a panel ranking 7 that add up
       to 21 places' votes is one answer and it is wrong. */
    const all = apportion({
      names: lgaShapes.lgas.map((row) => row.name),
      votes: stateData.votes,
      booths: stateData.booths,
      registered: stateData.registered,
      parentKey: stateData.code,
    });

    return territory?.lgaNames?.length
      ? all.filter((row) => territory.lgaNames.includes(row.name))
      : all;
  }, [drillFiled, liveStateNode, stateData, lgaShapes, territory]);

  const liveLgaNode = useMemo(
    () => (liveStateNode && lga ? liveNodeFor(liveStateNode, lga.name) : null),
    [liveStateNode, lga]
  );

  const wardRows = useMemo(() => {
    if (drillFiled) return liveRowsFrom(liveLgaNode);
    if (!lga) return [];
    const parent = lgaRows.find((row) => row.name === lga.name);
    if (!parent) return [];
    return apportion({
      names: Array.from({ length: wardCount(lga.name) }, (_, i) => `Ward ${String(i + 1).padStart(2, "0")}`),
      votes: parent.votes,
      booths: parent.booths,
      registered: parent.registered,
      parentKey: `${state.code}:${lga.name}`,
    });
  }, [drillFiled, liveLgaNode, lga, lgaRows, state]);

  const unitRows = useMemo(() => {
    if (drillFiled) {
      return liveRowsFrom(liveLgaNode && ward ? liveNodeFor(liveLgaNode, ward.name) : null);
    }
    if (!ward) return [];
    const parent = wardRows.find((row) => row.name === ward.name);
    if (!parent) return [];
    const key = `${state.code}:${lga.name}:${ward.name}`;

    /* One row per booth, because a polling unit is a booth. Drawing the unit
       count from the ward's name instead — which is what the generic drill
       does when nothing better is known — let the two disagree, and a ward of
       29 booths split into 26 units left some units holding none of them. */
    const count = Math.max(1, parent.booths);

    return apportion({
      names: Array.from({ length: count }, (_, i) => `PU ${String(i + 1).padStart(3, "0")}`),
      votes: parent.votes,
      booths: count,
      registered: parent.registered,
      parentKey: key,
    }).map((row) => ({ ...row, booths: 1, density: row.registered }));
  }, [drillFiled, liveLgaNode, ward, wardRows, state, lga]);

  const counts =
    level === "nation" ? nationRows : level === "state" ? lgaRows : level === "lga" ? wardRows : unitRows;

  /* The trail as plain names, which is the key the booth rollup is indexed
     by. `path` carries objects because the map needs a code for the state to
     fetch boundaries with; this is the same journey said the other way. */
  const boothPath = useMemo(() => path.map((step) => step.name).filter(Boolean), [path]);

  /* Where this level stands, as one row: the figure the metrics strip and the
     readout under the map both print, so they cannot disagree. */
  const boothHere = useMemo(() => placeIn(booth, boothPath), [booth, boothPath]);


  /* ══════════════════════════════════════════════════════════════════════
     ONE CAMPAIGN'S STANDING, COMPUTED ONCE FOR BOTH THINGS THAT DRAW IT

     The strategic brief and the geographic-intelligence map are the same
     classification seen two ways — a list and a choropleth — and they must be
     one computation. Two would mean two party pickers, and a map saying
     "stronghold" about a party the brief is not written for is the worst kind
     of wrong: every figure on it would be real.

     So the room owns the assumptions, calls lib/executive.js once, and the
     class it works out is written back onto the rows every surface below
     already reads. See useBrief in components/dash/Executive.jsx.
     ══════════════════════════════════════════════════════════════════════ */
  const briefState = useBrief({ rows: counts, slots, level, race });

  const rows = useMemo(() => {
    const intel = new Map(briefState.brief.places.map((place) => [place.key, place]));

    /* `class` and `margin` are added, nothing is replaced: every layer other
       than this one reads the same row it always did, and the two new fields
       are simply not looked at. */
    /* ── AND WHO HAS ACTUALLY SPOKEN, AT WHATEVER LEVEL THIS IS ─────────
       Keyed by name, because that is what the flat index is keyed by and
       what the trail below holds — see lib/reporting.js. A place the roster has
       never heard of gets nothing rather than a zero: `reporting` stays
       undefined, and the map leaves it blank, which is the whole distinction
       between a booth we are waiting on and a booth we never staffed. */
    const spoken = new Map(
      under(booth, boothPath).map((place) => [place.name, place])
    );

    /* `class`, `margin` and the reporting fields are added, nothing is
       replaced: every other layer reads the same row it always did and simply
       does not look at them. */
    return counts.map((row) => {
      const place = intel.get(row.key ?? row.code ?? row.name);
      const spoke = spoken.get(row.name);
      const merged = place ? { ...row, class: place.class, margin: place.margin } : { ...row };
      return spoke
        ? {
            ...merged,
            reporting: spoke.reporting,
            assignedBooths: spoke.assigned,
            filedBooths: spoke.filed,
            silentBooths: spoke.silent,
            stuckBooths: spoke.stuck,
            verifiedBooths: spoke.verified,
          }
        : merged;
    });
  }, [counts, briefState.brief, booth, boothPath]);

  /* ------------------------------------------------------------- the search
     Every state, always, plus the local governments of whichever state is
     open, because "go to Jigawa" and "go to Birnin Kudu once I am in Jigawa"
     are the two questions a room actually asks, and neither is easy to answer
     by hunting for a shape on a map that is also changing colour. Wards and
     units are left out on purpose: they are numbered rather than named, so
     "Ward 07" would return thirty-seven identical rows. */
  const searchItems = useMemo(() => {
    const items = inScope.map((row) => ({
      key: `state:${row.code}`,
      label: row.name,
      hint: "State",
      go: () => setPath([{ code: row.code, name: row.name }]),
    }));

    if (state) {
      for (const row of lgaRows) {
        items.push({
          key: `lga:${state.code}:${row.key ?? row.name}`,
          label: row.name,
          hint: `Local government · ${state.name}`,
          go: () => setPath([state, { name: row.name }]),
        });
      }
    }

    return items;
  }, [inScope, state, lgaRows]);

  /* Searching from Coordinators or Reports means you want to see the place, so
     the map comes back with you rather than leaving you on a tab that cannot
     show it. */
  /* Reports, counted against the place they came from, so the map can say
     "three reports from here" in the same breath as the figures. Only at
     national level: an incident carries a state, not a ward. */
  const incidentsByPlace = useMemo(() => {
    if (level !== "nation") return null;
    const index = {};
    for (const item of incidents) {
      if (!item.stateCode) continue;
      const entry = (index[item.stateCode] ??= { count: 0, worst: "INFO" });
      entry.count += 1;
      if (item.severity === "CRITICAL") entry.worst = "CRITICAL";
      else if (item.severity === "SERIOUS" && entry.worst !== "CRITICAL") entry.worst = "SERIOUS";
    }
    return index;
  }, [incidents, level]);

  const searchPick = (item) => {
    if (!MAP_LAYERS.has(layer)) setLayer("results");
    setPicked(null);
    item.go();
  };

  /* The shapes for the current level. Only two levels have boundaries of
     their own: the country's states, and a state's local governments. */
  const mapShapes = useMemo(() => {
    if (level === "nation") return shapes;
    if (level === "state" && lgaShapes) {
      /* ── A DISTRICT IS DRAWN AS ITS OWN PLACES, NOT AS ITS STATE ───────
         The boundary file holds every local government in the state. An
         account holding a senatorial district holds seven of Kaduna's 23, and
         drawing the other sixteen — grey, with no figures, inside the frame —
         would say that sixteen places have not reported when the truth is
         that they are not this room's to see. Matched by name because that is
         what the boundary files are keyed by; the names come down already
         resolved from the codes. See lib/lga-names.js. */
      const paths = territory?.lgaNames?.length
        ? lgaShapes.lgas.filter((row) => territory.lgaNames.includes(row.name))
        : lgaShapes.lgas;

      return { title: territory ? (ground ?? territory.name) : state.name, paths };
    }
    return null;
  }, [level, shapes, lgaShapes, state, territory, ground]);

  /* ── AND THE TWO LEVELS THAT HAVE NONE ──────────────────────────────────
     A ward has no published boundary and a polling unit is a table under a
     tree, so neither can be drawn as a shape. What they can be drawn inside
     is the local government they are in, which is real and which we hold.
     That outline is what UnitMap packs its tiles into and what any booth
     reporting a real position is plotted on. See components/dash/UnitMap. */
  /* One computation, two renderers: our own field and Google's draw the same
     figures at the same places or they are two maps of two countries. */
  /**
   * The states, as the Google layer wants them: a real code, the figure this
   * layer is about, and that figure normalised so a fill and a pin can be
   * sized by it. Built from the same rows the choropleth draws, so the two
   * grounds can never disagree about a number.
   */
  const googlePlaces = useMemo(() => {
    if (level !== "nation") return [];
    const ceiling = Math.max(...rows.map((row) => magnitude(row, layer)), 1);

    return rows
      .filter((row) => row.code)
      .map((row) => {
        const value = magnitude(row, layer);
        return {
          code: row.code,
          name: row.name,
          value,
          label:
            layer === "turnout"
              ? `${formatShare(value)} turnout`
              : layer === "density"
                ? `${formatNumber(value)} voters per unit`
                : `${formatNumber(value)} registered`,
          weight: value / ceiling,
        };
      });
  }, [level, rows, layer]);

  /* Null means the layer's own default; Voters, Turnout and Clusters open on
     the imagery wherever a key exists, and everything else on our own map. */
  const activeBasemap =
    basemap ??
    (googleAvailable && !CATEGORICAL.has(layer) && level === "nation" ? "earth" : "board");

  /**
   * Where a row on screen sits in the plan.
   *
   * ── ONE DEFINITION, BECAUSE THE PLAN IS ONE PLAN ───────────────────────
   * The coverage plan is keyed by a path of names from the state down, and
   * two screens writing two shapes of path into it produce a plan that
   * silently double-counts: lib/coverage.js treats "Kaduna / Zaria" and
   * "Kaduna / Zaria / Ward 04" as an ancestor and a descendant, and it can
   * only do that if everybody builds the path the same way.
   *
   * This was a closure inside the layer's own target lists. The strategic
   * brief writes into the same plan from the same rows, and giving it a
   * second copy of these four lines is exactly how the two would drift.
   */
  const planPathFor = useCallback(
    (row) =>
      level === "nation"
        ? [row.code ?? row.key ?? row.name]
        : level === "state"
          ? [state.code, row.name]
          : level === "lga"
            ? [state.code, lga.name, row.name]
            : [state.code, lga.name, ward.name, row.name],
    [level, state, lga, ward]
  );

  /**
   * ── WHAT THIS LAYER IS FOR, AS A LIST OF PLACES ──────────────────────────
   * Each layer answers a different question and therefore produces a
   * different target list, from whatever rows are on screen at whatever level
   * is open. Voters finds the biggest untapped register; turnout finds where
   * the fewest people came; clusters finds where the queues will be; results
   * finds what has not reported yet. All four write into the same plan.
   *
   * Six, because a target list is something a person reads out and argues
   * with, and a list of thirty is a spreadsheet nobody reads.
   */
  const layerTargets = useMemo(() => {
    const named = rows.filter((row) => row.name);
    if (!named.length) return null;

    /* The place being stood in, named without reaching for the breadcrumb
       trail, which is built further down this component. */
    const here =
      level === "nation"
        ? "Nigeria"
        : level === "state"
          ? state.name
          : level === "lga"
            ? lga.name
            : ward.name;

    const path = planPathFor;

    const take = (sorted, count = 6) => sorted.slice(0, count);

    if (layer === "register") {
      const top = take([...named].sort((a, b) => (b.registered ?? 0) - (a.registered ?? 0)));
      return {
        title: "The biggest registers here",
        figure: formatNumber(top.reduce((sum, row) => sum + (row.registered ?? 0), 0)),
        unit: "registered voters across " + top.length + " places",
        note: top.map((row) => row.name).join(", "),
        here,
        rows: top,
        reason: `Among the largest registers in ${here}`,
        paths: top.map(path),
      };
    }

    if (layer === "turnout") {
      const worst = take([...named].sort((a, b) => (a.turnout ?? 0) - (b.turnout ?? 0)));
      return {
        title: "Where fewest people came",
        figure: formatShare(worst[0]?.turnout ?? 0),
        unit: `lowest turnout of ${named.length} places`,
        note: worst.map((row) => `${row.name} ${formatShare(row.turnout ?? 0)}`).join(" · "),
        here,
        rows: worst,
        reason: `Among the lowest turnouts in ${here}`,
        paths: worst.map(path),
      };
    }

  if (layer === "density") {
      const worst = take([...named].sort((a, b) => (b.density ?? 0) - (a.density ?? 0)));
      return {
        title: "Where the queues will be",
        figure: formatNumber(worst[0]?.density ?? 0),
        unit: "voters per unit at the worst of them",
        note: worst.map((row) => `${row.name} ${formatNumber(row.density ?? 0)}`).join(" · "),
        here,
        rows: worst,
        reason: `Among the most crowded polling units in ${here}`,
        paths: worst.map(path),
      };
    }

    /* Results: what has not reported. Only meaningful on a live board, where
       `reported` is a fact rather than a replay artefact. */
    const silent = named.filter((row) => row.reported === false);
    if (!silent.length) return null;
    const biggest = take([...silent].sort((a, b) => (b.registered ?? 0) - (a.registered ?? 0)));
    return {
      title: "Nothing counted here yet",
      figure: `${silent.length}`,
      unit: `of ${named.length} places have not reported`,
      note: biggest.map((row) => row.name).join(", "),
      here,
      rows: biggest,
      reason: `Had not reported from ${here} when this was added`,
      paths: biggest.map(path),
    };
  }, [rows, layer, level, state, lga, ward, planPathFor]);

  /* The legend's bands, from the same array the shapes are filled from — see
     `bandsFor` in ScopeMap. Null on every layer whose scale is relative,
     because a key on a scale that moves would be a key that lies. */
  const bands = useMemo(() => legendFor(layer, rows), [layer, rows]);

  const heatPoints = useMemo(
    /* Not computed at all where it is not drawn: this walks every row on
       every render of the map, and a field nobody will see is the most
       expensive thing on a wall display refreshing all night. */
    () => (mapShapes && !NO_HEAT.has(layer) ? heatPointsFor({ shapes: mapShapes, rows, layer }) : []),
    [mapShapes, rows, layer]
  );

  /**
   * Where the thing under the pointer is, in degrees.
   *
   * ── TWO KINDS OF COORDINATE, NEVER THE SAME KIND ────────────────────────
   * A booth that filed with a position has a MEASURED one: somebody stood
   * there and a phone said where. Everywhere else the best that can be
   * offered is the CENTRE of the place's own drawn shape, recovered through
   * the inverse of the projection the boundary files were made with. Both are
   * true and they are not the same fact, so the strip labels which it is
   * holding rather than printing two numbers that look alike.
   */
  const focusCoord = useMemo(() => {
    if (!hovered) return null;
    const row = rows.find((item) => (item.key ?? item.name) === hovered);
    if (row?.fix) return { label: "GPS", text: coordinate(row.fix.lon, row.fix.lat) };

    const shown = mapShapes?.paths ?? mapShapes?.states ?? [];
    const shape = shown.find((item) => (item.code ?? item.name) === hovered);
    if (!shape?.at) return null;
    const [lon, lat] = unproject(shape.at[0], shape.at[1]);
    return { label: "Centre", text: coordinate(lon, lat) };
  }, [hovered, rows, mapShapes]);

  const unitOutline = useMemo(() => {
    if (level !== "lga" && level !== "ward") return null;
    const shape = lgaShapes?.lgas?.find((row) => row.name === lga?.name);
    return shape ? [shape.d] : null;
  }, [level, lgaShapes, lga]);

  /* -------------------------------------------------------------- summary */
  const scope = useMemo(() => {
    const registered = rows.reduce((sum, row) => sum + (row.registered ?? 0), 0);
    const votes = rows.reduce((sum, row) => sum + (row.total ?? 0), 0);
    const booths = rows.reduce((sum, row) => sum + (row.booths ?? 0), 0);
    /* Null, not zero, where no row carries one: zero would draw an empty
       accreditation bar on a replay that simply does not have the figure. */
    const withAccreditation = rows.filter((row) => row.accredited !== null && row.accredited !== undefined);
    const accredited = withAccreditation.length
      ? withAccreditation.reduce((sum, row) => sum + row.accredited, 0)
      : null;
    return {
      registered,
      accredited,
      votes,
      booths,
      turnout: registered ? (votes / registered) * 100 : 0,
      /* The share of accredited voters whose ballot ended up in the count.
         Short of 100% is normal — rejected ballots live in that gap — but a
         long way short of it at one place and not its neighbours is the
         single most useful anomaly on this screen. */
      counted: accredited ? (votes / accredited) * 100 : null,
      density: booths ? Math.round(registered / booths) : 0,
    };
  }, [rows]);

  const trend = useMemo(() => {
    const points = [];
    for (let index = 1; index <= 16; index += 1) {
      points.push(snapshot(board, Math.min(Math.round((board.events.length * index) / 16), cursor)).unitsReported);
    }
    return points;
  }, [board, cursor]);

  /* A single-state contest has no country above it. Offering "Nigeria" as a
     breadcrumb would invite the reader to zoom out to 36 states that are not
     in this election, and then wonder why they are all empty. */
  const pinned = Boolean(pinnedState);

  /**
   * ── THE TRAIL ALWAYS HAS A ROOT ──────────────────────────────────────────
   * A single-state contest has no country above it, so "Nigeria" is dropped:
   * offering it would invite the reader to zoom out to 36 states that are not
   * in this election and then wonder why they are empty.
   *
   * Dropping it left the trail with nothing in it at all until somebody
   * selected something, and four places read `crumbs.at(-1).label` on the way
   * to first paint. Opening a governorship project threw before it rendered a
   * single pixel. So the root is replaced rather than removed: in a pinned
   * contest the state itself is the top of the trail, which is also what it
   * is on the map. The array is never empty by construction.
   */
  const rootLabel = territory
    ? /* A room holding Kaduna Central holds a district, not Kaduna. Naming
         the state at the top of the trail would say the wrong thing about
         what these figures are of. */
      (ground ?? territory.name)
    : pinned
      ? (inScope[0]?.name ?? pinnedState?.name ?? "This election")
      : "Nigeria";

  const crumbs = [
    /* ── AND THE ROOT GOES TO THE ROOT, NOT ABOVE IT ────────────────────
         This sent a pinned view back to `[]`, which is the country — the
         exact 36 empty states the label was dropped to avoid, one click
         away and reachable by the only control that looked like "start
         again". A pinned trail's first stop is its own state. */
    { label: rootLabel, go: () => setPath(pinnedState ? [pinnedState] : []) },
    /* In a pinned contest the root already names the state, so adding it
       again would read "Ekiti / Ekiti". */
    !pinned && state && { label: state.name, go: () => setPath([state]) },
    lga && { label: lga.name, go: () => setPath([state, lga]) },
    ward && { label: ward.name, go: () => setPath([state, lga, ward]) },
  ].filter(Boolean);

  /* First click opens the place's full card; clicking the place that is
     already open drills into it. One gesture does both jobs in the order
     people actually want them: nobody drills into a state before looking at
     it, and having to hunt for a separate "open" control to see the numbers
     was the complaint. */
  const select = (shape) => {
    const key = shape.code ?? shape.key ?? shape.name;
    if (picked === key) {
      drill(shape);
      return;
    }
    setPicked(key);
  };

  const drill = (shape) => {
    setPicked(null);
    if (level === "nation") setPath([{ code: shape.code ?? shape.key, name: shape.name }]);
    else if (level === "state") setPath([state, { name: shape.name }]);
    else if (level === "lga") setPath([state, lga, { name: shape.name }]);
  };

  /* Whatever card is showing: the picked child, or the scope itself. */
  /* Matched on either identity. A shape hands back `code ?? name`, and a live
     row is keyed by its booth code — so a local government clicked on the map
     came back as `"Binji"` and was looked for among rows keyed `"33/01"`,
     which found nothing and left the card empty. See `byPlace` in
     lib/drill.js. */
  const pickedRow = picked
    ? (rows.find((row) => row.key === picked) ?? rows.find((row) => row.name === picked) ?? null)
    : null;

  /* ════════════════════════════════════════════════════════════════════════
  /* ── THE ASSISTANT'S HANDS, AND THE BOARD THEY WROTE ON, ARE OFF ────────
     What stood here was `run` — the switch the assistant handed an intention
     to, the one place that knew how to move this room by voice — together
     with `goTo`, the board's card list, and the `voice` object that carried
     all of it down to components/dash/Assistant.jsx.

     Withdrawn together because they were one feature. The board was where
     the assistant put things; without the assistant it was a tab somebody
     filled in by hand, which is not what it was for. lib/whiteboard.js,
     components/dash/Whiteboard.jsx and Assistant.jsx are all intact on disk,
     and nothing here has been rewritten around their absence — restoring
     them is putting this block back and re-adding the two lines named in
     components/dash/TopShell.jsx. */


  /**
   * Everything the alarm should make a noise about.
   *
   * ── WHY DIVERGENCE RIDES THE ALARM THAT ALREADY EXISTS ──────────────────
   * The room has one alarm, and it is the only thing in this product designed
   * to be heard rather than read — because this screen is on a wall at 1am
   * while the people in the room are on the phone. A second, separate alert
   * for declared figures would be a second thing to mute, a second thing to
   * miss, and two competing sounds in one room. So a finding becomes an alert
   * of the same shape and goes through the same bell, with the same mute and
   * the same unread count.
   *
   * ── AND WHY NOT EVERY FINDING ───────────────────────────────────────────
   * Only what lib/divergence.js calls urgent: impossible arithmetic and a
   * changed winner. The figure-by-figure differences are worth reading and are
   * not worth interrupting a room for. An alarm that fires for everything is
   * an alarm somebody unplugs the speakers to escape, and then it is off for
   * the rest of the night.
   *
   * The incident feed itself is left untouched: these are alerts, not reports
   * from the field, and folding them into `incidents` would put them in the
   * stream as though a coordinator had filed them.
   */
  const gapAlerts = useMemo(
    () =>
      (divergence?.urgent ?? []).map((flag) => ({
        /* Prefixed so it can never collide with an incident id, and stable
           across refreshes so the bell announces each finding exactly once. */
        id: `declared:${flag.id}`,
        severity: "CRITICAL",
        kind: flag.says,
        unitCode: flag.key,
        /* When the declared figure that produced this was entered. The finding
           itself has no clock of its own: it is a comparison, and it came into
           existence the moment the second of its two figures did. */
        createdAt: divergence?.at ?? new Date(),
      })),
    [divergence?.urgent, divergence?.at]
  );

  const alerts = useMemo(() => [...gapAlerts, ...incidents], [gapAlerts, incidents]);

  const greeting = useGreeting(user.name);

  /* Who holds each state. Static for the life of the page: this is a matter of
     record plus a short list of settled defections, not something the night
     changes. See lib/governors.js for why there are two answers. */
  /* What the record covers, for the one line on screen that has to say it.
     Static for the life of the page: it is a fact about lib/record.js, not
     about the night. */
  const recordSpan = useMemo(() => span(), []);

  const governing = useMemo(
    () => ({
      rows: ruling(),
      seats: { current: seatsBy("current"), elected: seatsBy("elected") },
      moves: crossedFloor(),
    }),
    []
  );

  /* The board's count, carried on its own pill. Only the open head's groups
     are handed to the bar; the other head's surfaces are one press away and
     are not in this row. */
  const tabGroups = useMemo(
    () =>
      (MODES.find((item) => item.id === mode) ?? MODES[0]).groups.map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) => {
          /* ── A TAB NAMED FOR WHAT IS UNDER IT ────────────────────────
             "Ruling party" is the national map's name. In a narrowed room
             the same tab holds this seat and the last election for it, and
             calling that "Ruling party" would send somebody looking for a
             map of the country. */
          if (tab.value === "ruling" && territory) return { ...tab, label: "The seat" };
          return tab;
        }),
      })),
    [territory, mode]
  );

  /* ── WHAT EACH HEAD IS CARRYING, ON THE HEAD ITSELF ────────────────────
     A monitoring room whose alarm is on the other side of a switch is a room
     that misses it. The count on Election Monitor is everything that would
     have rung the bell, so the analyst working on a projection can see that
     something happened without leaving the screen they are on. Analytics
     carries no badge: nothing over there is urgent, and a badge that means
     "there is content here" is a badge people learn to ignore. */
  const modes = useMemo(
    () =>
      MODES.map((item) =>
        item.id === "monitor" && alerts.length
          ? { ...item, badge: alerts.length > 99 ? "99+" : alerts.length }
          : item
      ),
    [alerts.length]
  );

  return (
    <TopShell
      user={user}
      tabs={TABS}
      tabGroups={tabGroups}
      modes={modes}
      mode={mode}
      /* Crossing between heads returns to whatever was last open in the one
         being entered — see `recent` above. */
      onMode={(id) => setLayer(recent[id] ?? FIRST_OF[id])}
      active={layer}
      onTab={setLayer}
      greeting={greeting}
      searchItems={searchItems}
      onSearchPick={searchPick}
      searchPlaceholder={state ? `Search ${state.name}…` : "Search a state…"}
      alerts={alerts}
      /* ── THE BELL HAS ONE DESTINATION NOW ─────────────────────────────
         It used to guess between the incident stream and the declared
         comparison from whichever alert was newest, which meant the same
         press did two different things and neither was the list of what is
         wrong. There is a screen for that — see lib/alerts.js — and every
         line on it carries a door to the surface holding its detail. */
      onOpenAlerts={() => setLayer("situations")}
      subtitle={
        layer === "pulse"
          ? `${formatNumber(pulse.filed)} return${pulse.filed === 1 ? "" : "s"} in, ${formatNumber(pulse.silence.length)} booth${pulse.silence.length === 1 ? "" : "s"} not heard from`
        : layer === "situations"
          ? escalations
            ? `${LEVELS[escalations.level].label}${escalations.level === "NORMAL" ? "" : ` · ${formatNumber(escalations.alerts.length)} above the line`}${incidentCount ? `, ${formatNumber(incidentCount)} from the field` : ""}`
            : "Nothing to raise"
        : layer === "timeline"
          ? timeline?.quietFor != null
            ? `Quiet for ${Math.round(timeline.quietFor)} minute${Math.round(timeline.quietFor) === 1 ? "" : "s"}`
            : "Nothing has happened yet today"
        /* ── BOTH HALVES OF THE MERGED SCREEN, IN ONE LINE ──────────────
           A wall display is read by people who did not press the tab, so the
           subtitle has to carry the finding rather than the screen's name.
           Silent and stuck are named separately because they are separate
           phone calls: one to a coordinator, one to our own desk. */
        : layer === "booth"
          ? boothHere?.assigned
            ? `${formatNumber(boothHere.filed)} of ${formatNumber(boothHere.assigned)} booths in${
                boothHere.silent ? `, ${formatNumber(boothHere.silent)} silent` : ""
              }${boothHere.stuck ? `, ${formatNumber(boothHere.stuck)} stuck at a desk` : ""}`
            : "Nobody has been assigned a booth in this scope"
        : layer === "integrity"
          ? integrity.screened
            ? `${formatNumber(integrity.screened)} screened, ${formatNumber(integrity.flags.length)} finding${integrity.flags.length === 1 ? "" : "s"}${
                divergence?.ready ? `, ${formatNumber(divergence.places)} place${divergence.places === 1 ? "" : "s"} differing from the declaration` : ""
              }`
            : "Nothing filed yet to screen"
        : MAP_LAYERS.has(layer)
          ? `${crumbs.at(-1).label} · ${LABEL[layer]}`
          : layer === "watch"
            ? `${watchSummary.filed} of ${watchSummary.total} coordinators reporting`
            /* ── THE TWO ANALYTICAL DASHBOARDS ──────────────────────────
               Both subtitles name the ground and the campaign rather than the
               dashboard, because the dashboard's name is already on the tab
               and a wall display is read by people who did not press it. */
            : layer === "analytics"
              ? `${briefState.forParty ?? "This campaign"} in ${crumbs.at(-1).label}${
                  race !== "PRESIDENTIAL" ? ` · ${seat?.raceLabel ?? race}` : ""
                } · 1999 to ${recordSpan.lastLabel}`
              : layer === "planning"
                ? territory
                  ? `Where to focus inside ${ground ?? territory.name}, and what covering it costs`
                  : "Where to focus, and what covering it costs"
                  : `${incidentCount ?? 0} report${incidentCount === 1 ? "" : "s"} from the field`
      }
      aside={
        /* Rendered here rather than handed in from the page: both this and
           LiveRefresh are client components, so passing a ready-made element
           across the server boundary gained nothing and made these two into an
           unkeyed array that React could not reconcile. */
        <>
          {projects && <ElectionSwitcher {...projects} />}
          {/* Which of the day's contests is on the wall. Beside the
              project switcher because it is the same kind of decision: both
              answer "which count am I looking at". */}
          <RaceSwitcher race={race} races={races} filed={filedByRace} pinned={racePinned} ground={ground} />
          <LiveRefresh seconds={15} label="Live" />
          {/* ── WHAT THE MAP IS ACTUALLY DRAWING ─────────────────────────
              Three different things can be on this screen and they must never
              be mistaken for one another: a demonstration, our agents' own
              returns, or the figures the commission declared. The chip says
              which, in words, on the same row as the switch that changes it.
              A wall display somebody walks past has nothing else to go on. */}
          <span className="flex items-center gap-2 rounded-full border border-dash-line bg-dash-card px-4 py-2.5 text-[0.8125rem] text-dash-muted">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                boardSource === "returns" ? "animate-pulse-live bg-red-500" : "bg-dash-muted"
              )}
            />
            {BOARD_SOURCE[boardSource] ?? BOARD_SOURCE.replay}
          </span>
        </>
      }
    >
      {/* ── WHAT THIS WALL IS OF, BEFORE ANY FIGURE ON IT ────────────────
          A room narrowed to a district looks exactly like a room that is not,
          and the coverage dial below reads the same either way. This is the
          line that makes the percentage mean something. */}
      <GroundBanner
        territory={territory}
        ground={ground}
        unresolved={territoryUnresolved}
        lgaNames={territory?.lgaNames ?? []}
      />

      {/* ── THE COMMAND CENTRE IS NOT HERE ANY MORE ──────────────────────
          It was the first branch of this chain and the room's landing
          surface, and it was a tour: every figure on it was the headline of
          a screen that already existed, restated. Removing it cost the room
          nothing it did not have somewhere better, and it took a whole
          screen's worth of figures out of the business of agreeing with the
          screens they were copied from.

          Booth is the front door now, and it draws through the map frame at
          the bottom of this chain rather than as a branch of its own. */}
      {layer === "situations" ? (
        <RoomSituations
          alerts={escalations}
          incidents={incidents}
          hubReports={hubReports}
          photos={photos}
          shapes={shapes}
          onGo={setLayer}
        />
      ) : layer === "timeline" ? (
        <RoomTimeline
          timeline={timeline}
          onGo={setLayer}
          /* ── A PLACE NAMED ON THE CLOCK IS A PLACE SOMEBODY WANTS TO OPEN ──
             The timeline names the states a phase's returns came from. Each
             one is a door: it takes the map to that state, on the results
             layer, from where the room's own drill goes on to the local
             government, the ward and the polling unit. The timeline does not
             need a drill of its own — it needs to hand the room a place, and
             the room already knows what to do with one. */
          onPlace={(name) => {
            const found = states.find(
              (row) => row.name.toLowerCase() === String(name).toLowerCase()
            );
            if (!found) return;
            setPicked(null);
            setPath([{ code: found.code, name: found.name }]);
            setLayer("results");
          }}
        />
      /* Booths and Operations were two branches here. They are one screen
         now, and it renders through the map frame below — see the note on
         MAP_LAYERS — because the thing it most needed was the drill this
         room already had. */
      ) : layer === "integrity" ? (
        <RoomEvidence
          integrity={integrity}
          sheetFindings={sheetFindings}
          sheetReads={sheetReads}
          pulse={pulse}
          divergence={divergence}
          /* Where the questionable returns are. This screen answers "where"
             the way every other one in the room does, off the booth codes the
             findings already carry. */
          shapes={shapes}
          ground={ground ?? territory?.name ?? null}
          onGo={setLayer}
          /* Every row in the verification queue is a booth code, and a booth
             code is the one thing on that screen somebody wants to open. It
             opens, into the card holding everything else known about it. */
          onUnit={openUnit}
        />
      ) : layer === "analytics" ? (
        /* ── SIX QUESTIONS, ONE DASHBOARD ────────────────────────────────
           The brief, the classified map, turnout, the parties, any two
           elections held against each other, and what has been moving. Every
           one of them used to be a tab of its own in this head. See
           components/dash/ElectionAnalytics.jsx for why they are not any
           more, and lib/record.js for the record they read — 1999 to the
           Osun governorship of August 2026. */
        <ElectionAnalytics
          brief={briefState}
          slots={slots}
          place={crumbs.at(-1).label}
          shapes={shapes}
          territory={territory}
          ground={ground ?? territory?.name ?? null}
          governing={{ ...governing, fct: FCT }}
          /* The contest on the wall, and who holds this ground in it. Every
             tab inside follows the same count the race switcher chose. */
          race={race}
          seat={seat}
          /* The Overview draws on this room's own map: the same outlines,
             the same trail, and the same walk one level down, so the brief
             drills exactly where the results map does. */
          map={{
            level,
            shapes: mapShapes,
            outline: unitOutline,
            loading,
            crumbs,
            onDrill: drill,
            canDrill: level !== "ward",
          }}
          onOpen={(row) => {
            /* Every row is a door, and the door leads to the map: the
               question after "which places" is always "where are they". */
            setPicked(row.code ?? row.key ?? row.name);
            setLayer("results");
          }}
          onGo={setLayer}
          pathOf={(row) => planPathFor(row)}
        />
      ) : layer === "planning" ? (
        /* ── AND THE OTHER HALF, DELIBERATELY BEHIND ITS OWN DOOR ────────
           "Where should we focus" is not an analytical question, it is a
           commitment: agents deployed and money spent. See the note over
           its group in MODES. */
        <StrategicPlanning
          brief={briefState}
          place={crumbs.at(-1).label}
          shapes={shapes}
          states={states}
          pulse={pulse}
          territory={territory}
          ground={ground ?? territory?.name ?? null}
          /* The ground rather than the project's scope: a campaign in one
             state does not want a projection over the six a project covers. */
          scopeStates={territory?.stateCode ? [territory.stateCode] : scopeStates}
          race={racePinned ? race : (projects?.current?.kind ?? null)}
          stateResults={stateResults}
          subState={Boolean(territory) && !["NATION", "STATE"].includes(territory.level)}
        />
      ) : layer === "watch" ? (
        <CoordinatorWatch
          shapes={shapes}
          coordinators={coordinators}
          summary={watchSummary}
          territory={territory}
          ground={ground}
        />
      ) : (
      <>
      {/* --------------------------------------------------------- metrics
          Each dashboard answers its own question. Voters, Turnout and Clusters
          describe the register and the geography, none of them reports who is
          winning, because that is the Results dashboard's job and duplicating
          it here would make three copies of one screen. */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {metricsFor({ layer, level, scope, rows, view, trend, incidentCount, place: crumbs.at(-1).label, here: boothHere, pulse, principal, spread, benchmark: onCommand ? null : benchmark }).map(
          (metric) => (
            <Metric key={metric.label} {...metric} />
          )
        )}
      </div>

      {/* ------------------------------------------------------ map + list */}
      {/* ------------------------------------------------------ map + list
          ── THE MAP DOES NOT MOVE ────────────────────────────────────────────
          The panels beside it change length constantly: four parties or five,
          twenty local governments or twenty-nine, an incident feed that grows
          all evening. If the page scrolls as one document, every one of those
          pushes the map off screen and the reader has to hunt for it again.

          The first attempt at that was a fixed-height region with a scrollbar
          inside each column, and it was wrong in one specific way: the region
          began below the figures, so scrolling the *page* — which is what a
          wheel does when the pointer is anywhere else, and what every browser
          does on a keyboard PageDown — still carried the map up and off. The
          map only held still if you were already careful where you pointed.

          It is pinned now instead. The map is stuck to the top of the
          viewport, under the bar, at exactly the height of what is left of the
          screen; the column beside it is ordinary page flow and scrolls the
          ordinary way. Scroll anywhere, by any means, and the map stays where
          it was. `--dash-top` is the bar's measured height, published by
          TopShell, because the bar is not the same height on every screen.

          Below xl it stacks and the page scrolls normally, because on a phone
          a pinned half-screen map leaves nothing to read the figures in. */}
      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
        {/* ── THE ONE DARK OBJECT ON A LIGHT SHEET ─────────────────────────
            The panels are working surfaces and stay white. The map is the
            instrument, and it goes dark: a saturated fill reads far better
            against near-black than against white, the country stops competing
            with the cards around it, and the eye lands here first because it
            is the only high-contrast object on the page. This is the same
            reason a trading desk is dark and its paperwork is not. */}
        <div className="on-board flex min-h-[32rem] flex-col overflow-hidden rounded-dash border border-board-line bg-board xl:sticky xl:top-[calc(var(--dash-top,4.5rem)+0.75rem)] xl:h-[calc(100vh-var(--dash-top,4.5rem)-1.5rem)] xl:min-h-0">
          {/* Breadcrumb, inside the frame, you never leave the page, so this
              is the only thing that tells you how deep you are. */}
          <nav
            aria-label="Where you are"
            className="flex flex-wrap items-center gap-1 border-b border-board-line px-4 py-2.5"
          >
            {/* Keyed by depth, not by name: Nasarawa State contains a
                Nasarawa LGA, so the labels collide the moment you drill into
                it. Position in the trail is the thing that is actually
                unique here. */}
            {crumbs.map((crumb, index) => (
              <span key={`${index}-${crumb.label}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={13} className="shrink-0 text-dash-muted" />}
                <button
                  type="button"
                  onClick={crumb.go}
                  className={cn(
                    "rounded-dash-sm px-2 py-1 text-[0.8125rem] font-semibold transition-colors",
                    index === crumbs.length - 1
                      ? "text-white"
                      : "text-white/55 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {/* ── THE FIELD AND ITS GROUND ──────────────────────────────
                  Only on the magnitude layers. Results has no density to
                  draw, and offering the control there would teach the reader
                  that it does. Google appears only where a key is configured;
                  see components/dash/GoogleLayer. */}
              {!CATEGORICAL.has(layer) && (
                <>
                  {/* The field belongs to our own map. On Google the layer
                      draws its own, tuned to what that dashboard is about —
                      and turnout gets none at all, there or here, because a
                      rate has no density. See components/dash/GoogleLayer. */}
                  {activeBasemap === "board" && !NO_HEAT.has(layer) && (
                    <MapToggle on={heat} onClick={() => setHeat((was) => !was)}>
                      Heat
                    </MapToggle>
                  )}

                  {/* Only where it can actually draw: the outlines are states,
                      so inside a state there is nothing for Google to put
                      under the figures and the control would be a switch that
                      appears to do nothing. */}
                  {googleAvailable && level === "nation" && (
                    <>
                      <MapToggle on={activeBasemap === "earth"} onClick={() => setBasemap("earth")}>
                        Earth
                      </MapToggle>
                      <MapToggle on={activeBasemap === "map"} onClick={() => setBasemap("map")}>
                        Map
                      </MapToggle>
                      <MapToggle on={activeBasemap === "board"} onClick={() => setBasemap("board")}>
                        Board
                      </MapToggle>
                    </>
                  )}
                </>
              )}
              <span className="pl-1 text-[0.75rem] text-white/45">
                {level === "ward" ? "Polling units" : `Tap a ${unitWord(level, true)}`}
              </span>
            </div>
          </nav>

          <div className="relative min-h-0 flex-1 p-1.5">
            {/* ── WHAT THE COLOURS MEAN, ON THE MAP ITSELF ────────────────
                A ramp with no key is decoration: a reader can see that one
                ward is lighter than another and cannot say whether that is
                the difference between 5% and 15% or between 5% and 95%.

                It sits on the map rather than in the panel beside it because
                that is where the question is asked — somebody looking at a
                dark ward is looking at the map, and a key eighteen inches
                away is a key they will not cross the screen for. Bottom left,
                over the sea, which is the one part of this frame no state is
                ever drawn in. */}
            {bands && (
              <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-dash-sm bg-board/85 px-3 py-2.5 backdrop-blur-sm">
                <p className="text-[0.625rem] font-bold tracking-[0.1em] text-white/55 uppercase">
                  {LABEL[layer] ?? "Scale"}
                </p>
                <div className="mt-1.5 flex items-end gap-[2px]">
                  {bands.map((band) => (
                    <span key={band.index} className="flex flex-col items-center gap-1">
                      <span
                        className="block h-3 w-4 rounded-[1px]"
                        style={{ background: band.colour }}
                        title={
                          band.unit === "%"
                            ? `${band.from}% to ${band.to}%`
                            : band.to == null
                              ? `${formatNumber(band.from)} and above`
                              : `${formatNumber(band.from)} to ${formatNumber(band.to)}`
                        }
                      />
                      {/* Every other tick: ten labels under forty pixels of
                          swatch collide into a grey smear. */}
                      <span className="figure text-[0.5625rem] leading-none text-white/45 tabular-nums">
                        {band.index % 2 === 0
                          ? band.unit === "%"
                            ? band.from
                            : compact(band.from)
                          : ""}
                      </span>
                    </span>
                  ))}
                  <span className="figure ml-1 self-start text-[0.625rem] leading-none text-white/55 tabular-nums">
                    {bands[0]?.unit === "%" ? "100%" : "high"}
                  </span>
                </div>

                {/* ── WHAT AN EQUAL STEP OF COLOUR IS WORTH ──────────────
                    On a ranked scale it is not an equal step of quantity, and
                    a reader who assumes otherwise will misread the map by a
                    factor. Said once, plainly, under the key. */}
                {bands[0]?.unit !== "%" && (
                  <p className="mt-1 text-[0.5625rem] leading-tight text-white/40">
                    Ranked: each band holds about a tenth of the places on screen.
                  </p>
                )}

                {layer === "booth" && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[0.625rem] text-white/45">
                    <span
                      aria-hidden="true"
                      className="block size-2.5 rounded-[1px]"
                      style={{ background: "var(--color-silent)" }}
                    />
                    Nobody assigned here
                  </p>
                )}
              </div>
            )}

            {loading && (
              <p className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-board/80 text-[0.875rem] text-white/60">
                <Loader2 size={16} className="animate-spin" />
                Loading boundaries…
              </p>
            )}

            {activeBasemap !== "board" && !CATEGORICAL.has(layer) && googlePlaces.length ? (
              /* Somebody else's ground under our own figures. Nothing is
                 computed differently here; the points are the ones the layer
                 above draws. */
              <GoogleLayer
                places={googlePlaces}
                layer={layer}
                ground={activeBasemap}
                onOpen={(code) => setHovered(code)}
              />
            ) : mapShapes ? (
              <ScopeMap
                level={level}
                shapes={mapShapes}
                rows={rows}
                layer={layer}
                slots={slots}
                hovered={hovered}
                onHover={setHovered}
                onOpen={select}
                incidentsByPlace={incidentsByPlace}
                pulsing={level === "nation" && PARTY_LAYERS.has(layer) ? pulsing : null}
                heat={heat && !CATEGORICAL.has(layer) && !NO_HEAT.has(layer)}
                heatTint={
                  layer === "turnout"
                    ? "var(--color-emerald-400)"
                    : layer === "density"
                      ? "var(--color-amber-400)"
                      : "var(--color-red-500)"
                }
              />
            ) : unitOutline ? (
              /* ── WARDS AND BOOTHS, INSIDE THE PLACE THEY ARE IN ────────
                  This was a grid of boxes, which claimed nothing and showed
                  nothing: at the two levels where a room is actually deciding
                  where to send somebody, the map stopped being a map. It is
                  the local government's real outline now, with a tile for
                  every place inside it and a plotted point for every booth
                  that has reported where it is. What each of those two means
                  is written across the foot of the frame. */
              <UnitMap
                outline={unitOutline}
                parentLabel={lga?.name}
                childWord={unitWord(level, true)}
                tint={layer === "turnout" ? "var(--color-emerald-400)" : "var(--color-red-500)"}
                hovered={hovered}
                picked={picked}
                onHover={setHovered}
                onOpen={select}
                rows={rows.map((row) => {
                  /* ── A WARD IS COLOURED THE WAY A STATE IS ─────────────
                     On the results layer these cells carry the party that
                     carried them, in the same fill, with the same hatch on
                     LP, as the choropleth two levels up. A reader who has
                     learnt the country's colours does not have to learn a
                     second language to read a booth. Grey stays what it is
                     everywhere here: nobody has reported, never a low score.

                     Every other layer is a magnitude, and a magnitude gets
                     the single-hue ramp rather than a party colour it has
                     nothing to do with. */
                  const code = PARTY_LAYERS.has(layer) ? partyCode(row, slots) : null;

                  return {
                    key: row.key ?? row.name,
                    name: row.name,
                    value: magnitude(row, layer),
                    note: describe(row, layer, slots),
                    fix: row.fix ?? null,
                    paint:
                      /* ── A WARD IS COLOURED THE WAY A STATE IS ─────────
                         Every layer on this frame is a magnitude except the
                         result, and a magnitude gets the ramp. The result
                         gets the party that carried it, in the same fill
                         with the same hatch on LP as the choropleth two
                         levels up, so a reader who has learnt the country's
                         colours does not have to learn a second language to
                         read a booth.

                         The classification used to be painted here too. It
                         has gone to Party ground, which draws it on its own
                         map beside the share it is derived from — see
                         components/dash/PartyStrength.jsx. */
                      !PARTY_LAYERS.has(layer)
                        ? null
                        : code
                          ? { fill: partyFill(code, "unit", PARTY_FILL[code]), opacity: 1 }
                          : { fill: "var(--color-silent)", opacity: 1 },
                  };
                })}
              />
            ) : (
              /* Only while a state's boundaries are still in flight: without
                 an outline there is nothing to pack tiles into. */
              <div className="grid h-full grid-cols-2 content-start gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
                {rows.map((row) => (
                  <button
                    key={row.name}
                    type="button"
                    onMouseEnter={() => setHovered(row.name)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => select(row)}
                    className={cn(
                      "rounded-dash-sm border p-3 text-left transition-colors",
                      hovered === row.name ? "border-white bg-white/10" : "border-board-line",
                      level === "lga" ? "cursor-pointer" : "cursor-default"
                    )}
                  >
                    <p className="text-[0.8125rem] font-bold text-white">{row.name}</p>
                    <p className="figure mt-1.5 text-[1.125rem] leading-none font-bold text-white">
                      {layer === "turnout"
                        ? formatShare(row.turnout)
                        : formatNumber(magnitude(row, layer))}
                    </p>
                    <p className="mt-1 truncate text-[0.6875rem] text-white/45">
                      {describe(row, layer, slots)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── THE TELEMETRY STRIP ────────────────────────────────────────
              A readout along the foot of the instrument: what is on screen,
              how much of it has spoken, how many places are still silent, and
              the clock. All monospaced and all fixed-width, so nothing shifts
              as the digits roll, the strip should be readable out of the
              corner of the eye without ever pulling it. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-board-line px-4 py-2.5">
            <Readout label="Scope" value={crumbs.at(-1).label} />
            <Readout label="Showing" value={LABEL[layer]} />
            <Readout label="In" value={formatShare(view.coverage)} />
            <Readout
              label="Silent"
              value={`${view.byState.filter((row) => !row.reported).length}`}
              tone={view.byState.some((row) => !row.reported) ? "warn" : "ok"}
            />
            <Readout label="Units" value={formatNumber(view.unitsReported)} />
            {/* ── WHERE, IN DEGREES ────────────────────────────────────────
                A room that is directing people to places needs the coordinate
                of the place it is pointing at, and it needs to know whether
                that coordinate was measured at a booth or is the centre of a
                drawn shape. Both are printed here; the label says which. */}
            {focusCoord && <Readout label={focusCoord.label} value={focusCoord.text} />}
            {/* Only on a live board. The replay has no accreditation figure
                and a dash on the strip is better than a zero that reads as a
                measurement somebody took. */}
            {scope.accredited != null && (
              <>
                <Readout label="Accredited" value={formatNumber(scope.accredited)} />
                {scope.counted != null && (
                  <Readout
                    label="Counted"
                    value={formatShare(scope.counted)}
                    /* Ballots counted well short of voters accredited is the
                       shape of a problem, not of a slow night. */
                    tone={scope.counted < 85 ? "warn" : "ok"}
                  />
                )}
              </>
            )}
            <span className="ml-auto flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  cursor < board.events.length ? "animate-pulse-live bg-red-500" : "bg-white/40"
                )}
              />
              <span className="figure text-[0.6875rem] text-white/55 tabular-nums">
                {cursor < board.events.length ? "COLLATING" : "COMPLETE"}
              </span>
            </span>
          </div>
        </div>

        {/* Ordinary flow: this column is what the page scroll is for now. */}
        <div className="flex flex-col gap-4">
          {/* ══════════════════════════════════════════════════════════════
              WHAT SITS BESIDE THE MAP DEPENDS ON WHAT THE MAP IS ASKING

              Every other layer here is about the count, so the column beside
              it is the contest in full. Booth is not about the count — it is
              about which booths have not produced one — and a party
              breakdown beside it would be answering a question nobody on
              that screen is asking, while the list they came for sat below
              the fold.

              So the column swaps. The map keeps its place, its size and its
              drill; only the thing being read next to it changes.
              ══════════════════════════════════════════════════════════════ */}
          {layer === "booth" ? (
            <RoomBooth
              here={boothHere}
              places={rows}
              path={boothPath}
              level={level}
              childWord={childWord(level)}
              operations={operations}
              pulse={pulse}
              ground={ground ?? territory?.name ?? null}
              /* Drills rather than merely selecting: somebody pressing a
                 place on the behind list is asking to go there, and one
                 press should take them. */
              onOpen={(row) => drill(row)}
              onUnit={openUnit}
              onGo={setLayer}
            />
          ) : onCommand && principal ? (
            /* ── OUR COLUMN, NOT THE STANDINGS ────────────────────────────
               PartyBreakdown answers "who is winning here" for whatever place
               is selected. Command answers "where do we stand", which is a
               different column, and showing both would be the room arguing
               with itself in two panels a hand's width apart. */
            <CommandBrief
              principal={principal}
              spread={command.spread}
              /* No benchmark: "what won in 2023" is a past result, and past
                 results live on Results. Command reports this campaign's own
                 count and nothing it did not file. */
              standings={view.standings}
              ballot={slots}
              total={view.total}
              margin={view.margin}
              isDemoProject={command.isDemoProject}
              awaiting={command.awaiting}
              /* Where the figures came from, ours and the hub's. */
              sources={command.sources}
            />
          ) : (
          <PartyBreakdown
            /* Only a presidential project has presidential candidates. */
            candidates={projects?.current?.kind === "PRESIDENTIAL"}
            /* The board's own ballot, so a live count names ADC, APM, NDC and
               everyone else who stood rather than folding them into "other". */
            slots={slots}
            place={pickedRow?.name ?? crumbs.at(-1).label}
            level={pickedRow ? childWord(level) : levelWord(level)}
            row={
              pickedRow ?? {
                votes: rows.reduce(
                  (sum, row) => sum.map((value, i) => value + (row.votes?.[i] ?? 0)),
                  [0, 0, 0, 0, 0]
                ),
                registered: scope.registered,
                turnout: scope.turnout,
                booths: scope.booths,
              }
            }
            coverage={level === "nation" && !pickedRow ? view.coverage : undefined}
          />
          )}

          {/* The places under this one, whatever the layer. It reads the
              layer's own sentence for each row — see `describe` in
              components/dash/ScopeMap.jsx — so on Booth it lists "12 of 20
              filed · 8 silent" rather than a party and a vote total, and it
              stays the way you drill one level deeper. */}
          <ScopePanel
            title={titleFor(level)}
            rows={rows}
            layer={layer}
            slots={slots}
            hovered={hovered}
            onHover={setHovered}
            onOpen={select}
            canOpen={level !== "ward"}
          />

          {/* ── THE LAYER'S OWN ACTION ────────────────────────────────────
              Every map layer now ends in a list of places rather than in a
              colour. See layerTargets. */}
          {layerTargets && (
            <section className="rounded-dash border border-dash-line bg-dash-card">
              <TargetList
                title={layerTargets.title}
                figure={layerTargets.figure}
                unit={layerTargets.unit}
                note={layerTargets.note}
                paths={layerTargets.paths}
                reason={layerTargets.reason}
                from={`${LABEL[layer] ?? layer} · ${layerTargets.here}`}
              />
            </section>
          )}

          <SidePanel
            layer={layer}
            level={level}
            rows={rows}
            view={view}
            scope={scope}
            onHover={setHovered}
          />
        </div>
      </div>

      {/* ── THE COMMAND BAND, UNDER THE MAP ────────────────────────────────
          Full width rather than squeezed into the column beside the map: the
          returns feed, the states nearest a quarter and the state table are
          all lists somebody reads across, and a list read across in a third
          of the screen is a list of truncated rows.

          Under the map rather than over it, so the map stays the largest
          object on the screen. An earlier version put all of this above the
          frame and pushed the map off the bottom, which is the opposite of
          what a wall display is for. */}
      {onCommand && principal && (
        <CommandLedger
          className="mt-5"
          principal={principal}
          spread={command.spread}
          ticker={view.ticker}
          ballot={slots}
          byState={view.byState}
          standings={view.standings}
          total={view.total}
        />
      )}
      </>
      )}
    </TopShell>
  );
}

/* -------------------------------------------------------------------------- */

const titleFor = (level) =>
  level === "nation"
    ? "States"
    : level === "state"
      ? "Local governments"
      : level === "lga"
        ? "Wards"
        : "Polling units";

const levelWord = (level) =>
  level === "nation" ? "Federation" : level === "state" ? "State" : level === "lga" ? "Local government" : "Ward";

const childWord = (level) =>
  level === "nation" ? "State" : level === "state" ? "Local government" : level === "lga" ? "Ward" : "Polling unit";

const unitWord = (level, singular = false) =>
  level === "nation"
    ? singular ? "state" : "states"
    : level === "state"
      ? singular ? "local government" : "local governments"
      : level === "lga"
        ? singular ? "ward" : "wards"
        : "polling units";

function Metric({ icon: Icon, label, value, foot, spark, tone = "ink", small = false }) {
  return (
    <div className="rounded-dash border border-dash-line bg-dash-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon size={14} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
        <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
          {label}
        </p>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <p
          className={cn(
            "figure leading-none font-bold tracking-[-0.03em] tabular-nums",
            small ? "truncate text-[1.0625rem]" : "text-[1.5rem]",
            tone === "red" ? "text-red-600" : "text-dash-ink"
          )}
        >
          {value}
        </p>
        {spark && <Sparkline values={spark} tone={tone} />}
      </div>
      <p className="mt-1 truncate text-[0.6875rem] text-dash-muted">{foot}</p>
    </div>
  );
}

/* -------------------------------------------------------- per-layer metrics */

/**
 * The four figures each dashboard leads with.
 *
 * Written out per layer rather than parameterised, because the interesting
 * part is exactly what differs: the Voters dashboard cares about how many
 * people can vote and how thinly they are spread, and cares not at all who is
 * ahead. Sharing one metric row across all four is what made three of them
 * look like weaker copies of the first.
 */
function metricsFor({
  layer,
  level,
  scope,
  rows,
  view,
  trend,
  incidentCount,
  place,
  here = null,
  pulse = null,
  /* Whose room this is, where our party stands against section 134, and what
     won last time. Passed in rather than read from a module because this
     helper is pure: given the same figures it must produce the same strip,
     and a newsroom with no principal gets the leader instead. */
  principal = null,
  spread = null,
  benchmark = null,
}) {
  const most = (key) => [...rows].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))[0];
  const least = (key) => [...rows].sort((a, b) => (a[key] ?? 0) - (b[key] ?? 0))[0];

  /* ══════════════════════════════════════════════════════════════════════
     BOOTH: FOUR FACTS THE BAR BESIDE THE MAP CANNOT CARRY

     This strip used to be four counts — reporting, checked, silent, stuck —
     and the panel beside the map is now a bar showing exactly those four as
     bands of one whole. Four tiles restating four bands is not emphasis; it
     is eight numbers where there are four facts, and the first time a tile
     and a band disagree after some future narrowing, a desk stops trusting
     both.

     So the two surfaces divide the work by *kind* rather than by subject. The
     bar carries the counts, because a count is what you press to filter. This
     strip carries the three things a count cannot say — a rate, a duration
     and a place — plus the one headline percentage the panel deliberately
     does not print.
     ══════════════════════════════════════════════════════════════════════ */
  if (layer === "booth") {
    const thinnest = [...rows]
      .filter((row) => (row.silentBooths ?? 0) > 0)
      .sort((a, b) => (b.silentBooths ?? 0) - (a.silentBooths ?? 0))[0];

    const quietFor = pulse?.clocks?.quietMinutes ?? null;

    return [
      {
        icon: Gauge,
        label: "Booths reporting",
        value: here?.reporting == null ? "—" : formatShare(here.reporting),
        foot: here?.assigned
          ? `${formatNumber(here.filed)} of ${formatNumber(here.assigned)} we hold`
          : "Nobody assigned in this scope",
        spark: trend,
      },
      {
        icon: ShieldCheck,
        label: "Of that, checked",
        /* A rate, not a count: how much of what arrived is actually usable in
           a bulletin. The bar shows how many; this shows how well. */
        value: here?.through == null ? "—" : formatShare(here.through),
        foot: here?.filed
          ? `${formatNumber(here.verified)} of ${formatNumber(here.filed)} that arrived`
          : "Nothing has arrived yet",
      },
      {
        icon: Clock,
        /* A duration. The one measure on this screen that says whether the
           night is live or has stalled, and no count anywhere can say it: a
           room at 94% that has heard nothing for fifty minutes is in a
           different situation from one at 94% still filling. */
        label: "Since the last return",
        value: quietFor == null ? "—" : clockLabel(quietFor),
        foot: quietFor == null ? "Nothing filed yet" : quietFor > 45 ? "The count has stalled" : "Still arriving",
        tone: quietFor != null && quietFor > 45 ? "warn" : undefined,
      },
      {
        icon: MapPin,
        /* A place, not a number. "8 silent" is on the bar; the question that
           follows it is always *where*, and that answer lives nowhere else. */
        /* Not "Thinnest state": the tile holds one place, and the level
           word pluralises. This reads correctly at every depth. */
        label: "Where it is thinnest",
        value: thinnest?.name ?? "—",
        foot: thinnest
          ? `${formatNumber(thinnest.silentBooths)} silent of ${formatNumber(thinnest.assignedBooths ?? 0)}`
          : "Nothing is behind here",
        small: true,
      },
    ];
  }

  if (layer === "register") {
    const top = most("registered");
    return [
      { icon: Users, label: "On the register", value: formatNumber(scope.registered), foot: place },
      { icon: Gauge, label: "Polling units", value: formatNumber(scope.booths), foot: `across ${rows.length} ${unitWord(level)}` },
      { icon: Store, label: "Voters per unit", value: formatNumber(scope.density), foot: "Average across this scope" },
      { icon: TrendingUp, label: "Largest", value: top?.name ?? "n/a", foot: top ? `${formatNumber(top.registered)} registered` : "", small: true },
    ];
  }

  if (layer === "turnout") {
    const high = most("turnout");
    const low = least("turnout");
    return [
      { icon: Percent, label: "Turnout", value: formatShare(scope.turnout), foot: `${formatNumber(scope.votes)} of ${formatNumber(scope.registered)}` },
      { icon: Users, label: "Did not vote", value: formatNumber(Math.max(0, scope.registered - scope.votes)), foot: "Register minus votes cast" },
      { icon: TrendingUp, label: "Highest", value: high?.name ?? "n/a", foot: high ? formatShare(high.turnout) : "", small: true },
      { icon: TrendingDown, label: "Lowest", value: low?.name ?? "n/a", foot: low ? formatShare(low.turnout) : "", small: true },
    ];
  }

  if (layer === "clusters") {
    /* Both ends, because both are the finding. The tightest place is where the
       queues and the pressure will be; the thinnest is where covering the
       ground costs the most agents per vote. A screen naming only the densest
       answers half the question a deployment is planned from.

       Ranked by `magnitude` rather than by a row key: clusters is derived from
       two fields — the register and the full booth count — and is not stored
       on a row, so sorting on `row.clusters` would sort on undefined and
       return whichever place happened to be first. */
    const rank = (dir) =>
      [...rows].sort(
        (a, b) => dir * (magnitude(b, "clusters") - magnitude(a, "clusters"))
      )[0];
    const packed = rank(1);
    const spread = rank(-1);
    const perUnit = scope.booths ? Math.round((scope.registered ?? 0) / scope.booths) : 0;

    return [
      {
        icon: Users,
        label: "Voters per unit",
        value: formatNumber(perUnit),
        foot: `Across ${place}`,
      },
      {
        icon: TrendingUp,
        label: "Most packed",
        value: packed?.name ?? "n/a",
        foot: packed ? `${formatNumber(magnitude(packed, "clusters"))} per unit` : "",
        small: true,
      },
      {
        icon: TrendingDown,
        label: "Most spread",
        value: spread?.name ?? "n/a",
        foot: spread ? `${formatNumber(magnitude(spread, "clusters"))} per unit` : "",
        small: true,
      },
      {
        icon: MapPin,
        label: "Polling units",
        value: formatNumber(scope.booths ?? 0),
        foot: `${formatNumber(scope.registered ?? 0)} registered`,
      },
    ];
  }

  if (layer === "density") {
    const dense = most("density");
    const sparse = least("density");
    const inScope = level === "nation" ? COMMERCIAL_CENTRES.length : null;
    return [
      { icon: Store, label: "Voters per unit", value: formatNumber(scope.density), foot: "Average across this scope" },
      { icon: TrendingUp, label: "Densest", value: dense?.name ?? "n/a", foot: dense ? `${formatNumber(dense.density)} per unit` : "", small: true },
      { icon: TrendingDown, label: "Most spread", value: sparse?.name ?? "n/a", foot: sparse ? `${formatNumber(sparse.density)} per unit` : "", small: true },
      { icon: MapPin, label: "Commercial centres", value: inScope ? formatNumber(inScope) : "n/a", foot: inScope ? "Principal markets nationwide" : "Shown at national level" },
    ];
  }

  return [
    { icon: Gauge, label: "Booths counted", value: formatShare(view.coverage), foot: `${formatNumber(view.unitsReported)} of ${formatNumber(view.booths)}`, spark: trend },
    { icon: Vote, label: "Votes counted", value: formatNumber(level === "nation" ? view.total : scope.votes), foot: place },
    /* ══════════════════════════════════════════════════════════════════
       OUR SHARE, WHERE "LEADING" USED TO BE

       This tile printed the leading party and its margin. In a campaign's
       situation room that is somebody else's headline most of the night, and
       it is the one figure on the strip nobody in the room needed: the board
       is two feet away and says the same thing in colour.

       What a campaign watches is its own share climbing, against the share
       that actually won last time — 36.6% in 2023 — and how many states it
       has a quarter of, because that is the half of section 134 no total can
       show. Both come from lib/spread.js, computed once for the whole room
       and read here and on Command, so the strip and the dashboard cannot
       disagree.

       ── AND IT IS STILL A DASH UNTIL A VOTE EXISTS ────────────────────────
       The old tile read the top of the standings whatever was in them, so a
       room with nothing filed printed "LEADING — APC — by 0%": a claim about
       an election, made from an empty table, in the largest type on screen.
       That guard is kept.
       ══════════════════════════════════════════════════════════════════ */
    ...(() => {
      const counted = view.standings.reduce((sum, row) => sum + (row.votes ?? 0), 0);
      if (!spread || !principal) {
        /* No principal configured — a newsroom rather than a campaign. The
           leader is the right headline for them, so it stays. */
        return [
          {
            icon: TrendingUp,
            label: "Leading",
            value: counted ? (view.leader?.id ?? "n/a") : "—",
            foot: counted
              ? view.standings[1]
                ? `by ${formatShare(view.standings[0].share - view.standings[1].share)}`
                : ""
              : "Nothing counted here yet",
          },
        ];
      }

      return [
        {
          icon: TrendingUp,
          label: `${principal.party} share`,
          value: counted ? formatShare(spread.share) : "—",
          foot: counted
            ? benchmark != null
              ? `${formatShare(benchmark)} won in 2023`
              : `${formatNumber(spread.votes)} votes`
            : "Nothing counted here yet",
        },
        {
          icon: Target,
          label: "States at a quarter",
          value: counted ? `${spread.quarterStates}/${spread.statesRequired}` : "—",
          foot: counted
            ? spread.clearsSpread
              ? "Clears the spread test"
              : `${spread.statesShort} short · ${spread.statesWon} led outright`
            : "The other half of winning",
        },
      ];
    })(),
    /* ── INCIDENTS ARE NOT A FIGURE ON THIS STRIP ──────────────────────
       The count of open reports sat here on every tab. It is the wrong shape
       for the strip: the other tiles are the count, and "3 incidents" is a
       queue of things somebody has to read, not a measurement of the
       election. It has a screen of its own — Situation — with the severity,
       the place, the photograph and the alarm, and the tab carries the count
       when there is one to carry. */
  ];
}

/**
 * The panel under the list, which is also the layer's own.
 */
function SidePanel({ layer, level, rows, view, onHover }) {
  /* ── NOTHING FROM THIS PANEL ON COMMAND ────────────────────────────────
     It draws the national standings and the register/turnout arithmetic under
     them. Both are already answered on Command — the parties in its own
     column, the coverage on the strip at the top of the room — and a screen
     that says the same thing twice, a hand's width apart, teaches a reader
     that one of the two is the real one and they have to work out which. */
  if (layer === "command") return null;

  if (PARTY_LAYERS.has(layer)) {
    if (level !== "nation") return null;
    return (
      <Section title="Standings">
        <ul className="space-y-3">
          {view.standings.map((party) => (
            <li key={party.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <PartyMark id={party.id} size={20} title={Boolean(partyLogo(party.id))} />
                  {!partyLogo(party.id) && (
                    <span className="figure text-[0.8125rem] font-bold text-dash-ink">
                      {party.id}
                    </span>
                  )}
                </span>
                <span className="figure text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                  {formatShare(party.share)}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-dash-bg">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.min(100, party.share)}%`, background: PARTY_FILL[party.id] }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Section>
    );
  }

  if (layer === "clusters") {
    /* The panel beside a ramp exists so a reader can find a place by name
       instead of hunting for its colour on the map. */
    return (
      <Section title="Most packed" foot="Registered voters per polling unit">
        <ul className="space-y-2">
          {[...rows]
            .sort((a, b) => magnitude(b, "clusters") - magnitude(a, "clusters"))
            .slice(0, 12)
            .map((row) => (
              <li
                key={row.key ?? row.name}
                onPointerEnter={() => onHover?.(row.key ?? row.name)}
                className="flex items-baseline gap-2.5"
              >
                <span className="min-w-0 truncate text-[0.8125rem] font-semibold text-dash-ink">
                  {row.name}
                </span>
                <span className="figure ml-auto shrink-0 text-[0.8125rem] text-dash-muted tabular-nums">
                  {formatNumber(magnitude(row, "clusters"))}
                </span>
              </li>
            ))}
        </ul>
      </Section>
    );
  }

  if (layer === "density" && level === "nation") {
    return (
      <Section title="Commercial centres" foot="Principal markets">
        <ul className="space-y-2">
          {COMMERCIAL_CENTRES.filter((city) => city.tier === 1).map((city) => (
            <li key={city.name} className="flex items-center gap-2.5">
              <Store size={13} strokeWidth={2.5} className="shrink-0 text-red-500" />
              <span className="text-[0.8125rem] font-semibold text-dash-ink">{city.name}</span>
              <span className="ml-auto truncate text-[0.6875rem] text-dash-muted">{city.note}</span>
            </li>
          ))}
        </ul>
      </Section>
    );
  }

  /* Voters and Turnout get the distribution of the thing they measure, the
     shape of the spread, which a ranked list alone does not show. */
  const key = layer === "register" ? "registered" : layer === "turnout" ? "turnout" : "density";
  const sorted = [...rows].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));
  const top = sorted.slice(0, 5);
  const max = Math.max(...sorted.map((row) => row[key] ?? 0), 1);

  return (
    <Section title={layer === "turnout" ? "Highest turnout" : "Biggest registers"}>
      <ul className="space-y-2.5">
        {top.map((row) => (
          <li
            key={row.name}
            onMouseEnter={() => onHover?.(row.key ?? row.name)}
            onMouseLeave={() => onHover?.(null)}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[0.8125rem] font-semibold text-dash-ink">{row.name}</span>
              <span className="figure shrink-0 text-[0.75rem] text-dash-muted">
                {layer === "turnout" ? formatShare(row.turnout) : formatNumber(row[key])}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-dash-bg">
              <div
                className="h-full rounded-full bg-dash-ink"
                style={{ width: `${((row[key] ?? 0) / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Section({ title, foot, children }) {
  return (
    <section className="rounded-dash border border-dash-line bg-dash-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-dash-line px-4 py-3">
        <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">{title}</h3>
        {foot && <span className="figure text-[0.6875rem] text-dash-muted">{foot}</span>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * One field of the telemetry strip.
 *
 * Fixed-width monospaced value with the label above it in small caps: the
 * layout must not move when a figure gains a digit, because a strip that
 * shuffles is a strip nobody can read peripherally, and peripheral is the
 * only way anybody reads it during a count.
 */
/**
 * A switch on the instrument.
 *
 * Pill-shaped and on the map's own header rather than in a settings panel:
 * these change what the map in front of you is drawing, so they belong where
 * the reader is already looking. Pressed state is carried by `aria-pressed`
 * as well as by colour, because "is the heat on" must be answerable without
 * seeing the difference between two greys.
 */
function MapToggle({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-full px-2.5 py-1 text-[0.75rem] font-semibold transition-colors",
        on ? "bg-white text-ink-950" : "text-white/55 hover:bg-white/10 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

function Readout({ label, value, tone = "ink" }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[0.5625rem] font-semibold tracking-[0.14em] text-white/35 uppercase">
        {label}
      </span>
      <span
        className={cn(
          "figure text-[0.75rem] font-bold tabular-nums",
          tone === "warn" ? "text-amber-400" : tone === "ok" ? "text-emerald-400" : "text-white"
        )}
      >
        {value}
      </span>
    </span>
  );
}
