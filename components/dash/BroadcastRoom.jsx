"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  BarChart3,
  Clapperboard,
  Radio,
  Share2,
  ShieldCheck,
  Tv,
} from "lucide-react";

import TopShell from "./TopShell";
import { useGreeting } from "./useGreeting";
import LiveRefresh from "./LiveRefresh";
import RaceSwitcher from "./RaceSwitcher";
import GroundBanner from "./GroundBanner";
import ElectionSwitcher from "./ElectionSwitcher";

import { DeskProvider } from "./broadcast/Queue";
import CommandCentre from "./broadcast/CommandCentre";
import { Playout, Scheduler } from "./broadcast/Playout";
import BreakingNews from "./broadcast/BreakingNews";
import ControlRoom, { StreamControl } from "./broadcast/ControlRoom";
import LiveResults from "./broadcast/LiveResults";
import GraphicsStudio from "./broadcast/GraphicsStudio";
import MapStudio from "./broadcast/MapStudio";
import TickerDesk from "./broadcast/TickerDesk";
import {
  ContentStudio,
  MultiPlatform,
  SocialAnalytics,
  SocialCommand,
} from "./broadcast/SocialDesk";
import { FieldFeeds, Reporters, VideoStudio } from "./broadcast/Production";
import { Claims, DataViz, Listening, ResultsIntel, Trending, Trends } from "./broadcast/Intelligence";
import { Approvals, Audit, Health, Platforms, Team } from "./broadcast/Governance";

import { clearance, deskLoad, runningOrder, tickerLines } from "@/lib/broadcast";

/**
 * The broadcast arm.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  SIX HEADS, TWENTY-EIGHT SURFACES, ONE QUEUE UNDERNEATH ALL OF THEM
 *
 *  A broadcast operation is genuinely six different jobs sharing one election:
 *  a gallery, a television bench, a social desk, a production unit, an
 *  analysis desk and the people who sign things off. They do not want each
 *  other's screens — a master control operator scrolling past a swing chart to
 *  reach the running order is a master control operator who stops using the
 *  product — so the heads are separated at the top and everything hangs under
 *  whichever one is chosen, exactly as the situation room separates monitoring
 *  from analytics.
 *
 *  What is *not* separated is the thing underneath. Every one of those
 *  twenty-eight surfaces writes into a single queue, with one journey and one
 *  rule: DRAFT → REVIEW → CLEARED → ON AIR, and nobody clears their own work.
 *  Six benches with six workflows would be six approval screens, and the one
 *  that would quietly go unread is the clearance queue for the figures — which
 *  is the only one that can put a wrong result on a transmitter.
 *
 *  ── AND WHY THIS ROOM LOSES THE RAIL ────────────────────────────────────
 *  The same reason the situation room does. This screen is read on a wall in a
 *  gallery, and 16rem of permanent sidebar is 16rem the composite preview and
 *  the running order do not get. The navigation goes up top, the same links, a
 *  fifth of the footprint. See components/dash/TopShell.jsx.
 * ══════════════════════════════════════════════════════════════════════════
 */
export const MODES = [
  {
    id: "command",
    label: "Command",
    icon: Radio,
    why: "What the desk should know and broadcast right now.",
    groups: [
      {
        id: "now",
        label: "Now",
        tabs: [
          { value: "centre", label: "Command centre" },
          { value: "playout", label: "Master control" },
        ],
      },
      {
        id: "ahead",
        label: "Ahead",
        tabs: [
          { value: "scheduler", label: "Scheduler" },
          { value: "breaking", label: "Breaking" },
        ],
      },
    ],
  },
  {
    id: "tv",
    label: "Television",
    icon: Tv,
    why: "The picture: results, frames, maps and everything keyed over them.",
    groups: [
      {
        id: "output",
        label: "Output",
        tabs: [
          { value: "control", label: "Control room" },
          /* ── THE ONE SURFACE THIS WHOLE ARM EXISTS TO PROTECT ──────────
             RAW → VERIFIED → CLEARED → ON AIR. It sits second rather than
             buried in a group of its own because a control that only gets
             used when somebody remembers it is a control that does not
             work. See components/dash/broadcast/LiveResults.jsx. */
          { value: "liveresults", label: "Live results" },
        ],
      },
      {
        id: "build",
        label: "Build",
        tabs: [
          { value: "graphics", label: "Graphics" },
          { value: "mapstudio", label: "Maps" },
          { value: "ticker", label: "Ticker" },
        ],
      },
      { id: "live", label: "Live", tabs: [{ value: "stream", label: "Streams" }] },
    ],
  },
  {
    id: "social",
    label: "Social",
    icon: Share2,
    why: "Everything that leaves the building as a file somebody posts.",
    groups: [
      {
        id: "publishing",
        label: "Publishing",
        tabs: [
          { value: "socialdesk", label: "Command" },
          { value: "content", label: "Content" },
          { value: "multi", label: "Adapt" },
        ],
      },
      {
        id: "listening",
        label: "Listening",
        tabs: [
          { value: "trending", label: "Trending" },
          { value: "listening", label: "Listening" },
          { value: "socialstats", label: "Analytics" },
        ],
      },
    ],
  },
  {
    id: "production",
    label: "Production",
    icon: Clapperboard,
    why: "Packages, incoming material, and the people who are out there.",
    groups: [
      { id: "make", label: "Make", tabs: [{ value: "video", label: "Video" }] },
      {
        id: "field",
        label: "Field",
        tabs: [
          { value: "reporters", label: "Reporters" },
          { value: "feeds", label: "Feeds" },
        ],
      },
    ],
  },
  {
    id: "intel",
    label: "Intelligence",
    icon: BarChart3,
    why: "What is true right now that is worth saying, with its denominator.",
    groups: [
      {
        id: "figures",
        label: "Figures",
        tabs: [
          { value: "dataviz", label: "Charts" },
          { value: "trends", label: "Trends" },
          { value: "resultsintel", label: "The count" },
        ],
      },
      { id: "checking", label: "Checking", tabs: [{ value: "claims", label: "Claims" }] },
    ],
  },
  {
    id: "manage",
    label: "Management",
    icon: ShieldCheck,
    why: "Who passed what, and the record of it.",
    groups: [
      {
        id: "editorial",
        label: "Editorial",
        tabs: [
          { value: "approvals", label: "Approvals" },
          { value: "audit", label: "Audit" },
        ],
      },
      {
        id: "setup",
        label: "Setup",
        tabs: [
          { value: "team", label: "Team" },
          { value: "platforms", label: "Platforms" },
          { value: "health", label: "Health" },
        ],
      },
    ],
  },
];

/** Every surface, flat, each carrying the head it belongs to. */
const TABS = MODES.flatMap((mode) =>
  mode.groups.flatMap((group) => group.tabs.map((tab) => ({ ...tab, mode: mode.id, group: group.id })))
);

const MODE_OF = Object.fromEntries(TABS.map((tab) => [tab.value, tab.mode]));
const FIRST_OF = Object.fromEntries(MODES.map((mode) => [mode.id, mode.groups[0].tabs[0].value]));

/**
 * Where a link from outside lands.
 *
 * The room's surfaces are local state rather than routes, so a hash is the
 * only thing the rail can carry in — the same arrangement the situation room
 * uses. Only the handful somebody actually arrives looking for are listed:
 * this is a door, not a site map.
 */
const HASH_LAYERS = {
  "#centre": "centre",
  "#results": "liveresults",
  "#graphics": "graphics",
  "#ticker": "ticker",
  "#breaking": "breaking",
  "#playout": "playout",
  "#approvals": "approvals",
  "#audit": "audit",
  /* Kept because the rail pointed here before this room existed, and a link
     that used to work should not start doing nothing. */
  "#analysis": "dataviz",
  "#post": "content",
};

function subscribeHash(onChange) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readHash = () => window.location.hash;
const noHash = () => "";

export default function BroadcastRoom({
  user,
  project,
  projects,
  race,
  raceLabel,
  races,
  filedByRace,
  racePinned,
  ground,
  territory,
  territoryUnresolved,
  lgaNames,
  shapes,
  items,
  audit,
  rows,
  places,
  national,
  trends,
  incidents,
  photoCount,
  coordinators,
  watchSummary,
  declaredRows,
  capabilities,
  may,
}) {
  const [layer, setLayer] = useState("centre");
  const [mode, setMode] = useState("command");

  /* Which surface each head was last left on, so crossing between them and
     back does not throw away where somebody was. The same behaviour the
     situation room has, for the same reason: a desk that loses your place
     every time you check the running order is a desk you stop crossing. */
  const [recent, setRecent] = useState(() => ({ ...FIRST_OF, command: "centre" }));

  const go = useCallback((value) => {
    setLayer(value);
    const head = MODE_OF[value];
    if (head) {
      setMode(head);
      setRecent((current) => ({ ...current, [head]: value }));
    }
  }, []);

  const crossTo = useCallback(
    (head) => {
      setMode(head);
      setLayer(recent[head] ?? FIRST_OF[head]);
    },
    [recent]
  );

  /* ── ARRIVING FROM THE RAIL ──────────────────────────────────────────────
     A hash is somebody else's state, so it is subscribed to rather than copied
     in and kept in step by hand — see the same note in components/dash/DashNav.
     `seen` stops the hash from dragging the room back to where the link
     pointed every time anything else re-renders. */
  const hash = useSyncExternalStore(subscribeHash, readHash, noHash);
  const [seen, setSeen] = useState("");

  /* Applied during render rather than in an effect, which is what the
     situation room does for the same job: the hash is already state React
     is subscribed to, and reacting to it in an effect means the room draws
     once at the wrong surface and then corrects itself. */
  if (hash !== seen) {
    setSeen(hash);
    if (HASH_LAYERS[hash]) go(HASH_LAYERS[hash]);
  }

  const greeting = useGreeting(user.name);

  const load = useMemo(() => deskLoad(items), [items]);
  const order = useMemo(() => runningOrder(items), [items]);

  const pipeline = useMemo(() => {
    const built = clearance({
      rows,
      clearances: items.filter((item) => item.kind === "CLEARANCE"),
      expected: places.reduce((sum, place) => sum + (place.expected ?? 0), 0),
    });
    /* The approval side of the same thing, so the results screen does not have
       to filter the queue itself and reach a different answer. */
    return {
      ...built,
      pending: items.filter((item) => item.kind === "CLEARANCE" && item.state === "REVIEW"),
    };
  }, [items, rows, places]);

  const suggestions = useMemo(
    () => tickerLines({ places, incidents, national, race }),
    [places, incidents, national, race]
  );

  const mode_ = MODES.find((row) => row.id === mode) ?? MODES[0];

  /* ── BADGES ARE ON THE HEAD THAT OWNS THE WORK ─────────────────────────
     A surface that fills up while somebody is looking at a different one has
     to say so where they already are, or the queue is invisible until they
     happen to wander over. Clearance is the one that matters, so it rides on
     Management, which is where it is dealt with. */
  const modes = MODES.map((row) => ({
    ...row,
    badge: row.id === "manage" && load.review.length > 0 ? load.review.length : null,
  }));

  const coverage = {
    filed: national?.filed ?? 0,
    reporting: national?.reporting ?? null,
    expected: places.reduce((sum, place) => sum + (place.expected ?? 0), 0),
  };

  return (
    <DeskProvider user={user} may={may}>
      <TopShell
        user={user}
        modes={modes}
        mode={mode}
        onMode={crossTo}
        tabs={mode_.groups.flatMap((group) => group.tabs)}
        tabGroups={mode_.groups}
        active={layer}
        onTab={go}
        greeting={greeting}
        subtitle={`${raceLabel} · ${ground}${project ? ` · ${project.title}` : ""}`}
        alerts={incidents}
        onOpenAlerts={() => go("breaking")}
        aside={
          <>
            <LiveRefresh />
            <RaceSwitcher
              race={race}
              races={races}
              filed={filedByRace}
              pinned={racePinned}
              ground={ground}
            />
            <ElectionSwitcher
              current={projects.current}
              all={projects.all}
              canCreate={projects.canCreate}
              canDelete={projects.canDelete}
            />
          </>
        }
      >
        <GroundBanner
          territory={territory}
          ground={ground}
          unresolved={territoryUnresolved}
          lgaNames={lgaNames}
        />

        <div className="mt-3">
          {layer === "centre" ? (
            <CommandCentre
              load={load}
              order={order}
              clearance={pipeline}
              coverage={coverage}
              incidents={incidents}
              reporters={{
                assigned: watchSummary.total,
                signedIn: coordinators.filter((row) => row.lastSeen).length,
                filed: watchSummary.filed,
              }}
              project={project}
              raceLabel={raceLabel}
              ground={ground}
              onGo={go}
            />
          ) : layer === "playout" ? (
            <Playout items={items} order={order} onGo={go} />
          ) : layer === "scheduler" ? (
            <Scheduler items={items} />
          ) : layer === "breaking" ? (
            <BreakingNews items={items} incidents={incidents} race={race} />
          ) : layer === "control" ? (
            <ControlRoom
              items={items}
              load={load}
              national={national}
              raceLabel={raceLabel}
              onGo={go}
            />
          ) : layer === "liveresults" ? (
            <LiveResults
              pipeline={pipeline}
              places={places}
              national={national}
              race={race}
              raceLabel={raceLabel}
              onGo={go}
            />
          ) : layer === "graphics" ? (
            <GraphicsStudio
              race={race}
              raceLabel={raceLabel}
              places={places}
              filed={national?.filed ?? 0}
              registered={national?.registered ?? 0}
              incidentCount={incidents.length}
              items={items}
            />
          ) : layer === "mapstudio" ? (
            <MapStudio
              shapes={shapes}
              places={places}
              items={items}
              race={race}
              raceLabel={raceLabel}
            />
          ) : layer === "ticker" ? (
            <TickerDesk suggestions={suggestions} items={items} race={race} />
          ) : layer === "stream" ? (
            <StreamControl items={items} onGo={go} />
          ) : layer === "socialdesk" ? (
            <SocialCommand items={items} onGo={go} />
          ) : layer === "content" ? (
            <ContentStudio items={items} race={race} national={national} places={places} />
          ) : layer === "multi" ? (
            <MultiPlatform items={items} race={race} />
          ) : layer === "trending" ? (
            <Trending trends={trends} items={items} places={places} />
          ) : layer === "listening" ? (
            <Listening items={items} onGo={go} />
          ) : layer === "socialstats" ? (
            <SocialAnalytics items={items} />
          ) : layer === "video" ? (
            <VideoStudio items={items} race={race} />
          ) : layer === "reporters" ? (
            <Reporters coordinators={coordinators} summary={watchSummary} ground={ground} />
          ) : layer === "feeds" ? (
            <FieldFeeds incidents={incidents} photoCount={photoCount} items={items} />
          ) : layer === "dataviz" ? (
            <DataViz places={places} national={national} raceLabel={raceLabel} />
          ) : layer === "trends" ? (
            <Trends trends={trends} raceLabel={raceLabel} />
          ) : layer === "resultsintel" ? (
            <ResultsIntel
              places={places}
              national={national}
              rows={rows}
              declaredRows={declaredRows}
              raceLabel={raceLabel}
            />
          ) : layer === "claims" ? (
            <Claims items={items} race={race} national={national} />
          ) : layer === "approvals" ? (
            <Approvals items={items} load={load} />
          ) : layer === "audit" ? (
            <Audit items={items} audit={audit} />
          ) : layer === "team" ? (
            <Team role={user.role} capabilities={capabilities} />
          ) : layer === "platforms" ? (
            <Platforms items={items} />
          ) : layer === "health" ? (
            <Health
              project={project}
              race={raceLabel}
              load={load}
              counts={{ filed: rows.length }}
              ground={ground}
            />
          ) : null}
        </div>
      </TopShell>
    </DeskProvider>
  );
}
