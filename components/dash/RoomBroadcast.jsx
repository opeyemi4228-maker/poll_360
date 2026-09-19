"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Clock3,
  Megaphone,
  Monitor,
  Radio,
  ScrollText,
  Send,
  ShieldCheck,
  Sliders,
  Type,
  UserRound,
  Zap,
} from "lucide-react";

import { DeskProvider } from "./broadcast/Queue";
import LiveDesk from "./broadcast/LiveDesk";
import Contestants from "./broadcast/Contestants";
import GoLive from "./broadcast/GoLive";
import { Playout, Scheduler } from "./broadcast/Playout";
import BreakingNews from "./broadcast/BreakingNews";
import ControlRoom from "./broadcast/ControlRoom";
import LiveResults from "./broadcast/LiveResults";
import TickerDesk from "./broadcast/TickerDesk";
import { Delivery } from "./broadcast/SocialDesk";
import { Claims, DataViz, ResultsIntel, Trends } from "./broadcast/Intelligence";
import { Audit, Platforms, Team } from "./broadcast/Governance";
import { cn } from "@/lib/utils";

/**
 * The broadcast desk, inside the room.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FOUR DASHBOARDS, THIRTEEN SCREENS, NOTHING SHOWN TWICE
 *
 *  This desk grew to twenty-one sections, and the same things kept appearing
 *  in several of them: the queue waiting for an editor on five screens, the
 *  field's reports on four, "what went out" on three. A thing shown in five
 *  places is a thing nobody knows where to look for, and the five copies
 *  drift — one counts drafts, one does not — until they disagree on a wall.
 *
 *  So every screen now has one job that no other screen does:
 *
 *    CONTROL   Live         write an update, clear the queue, watch the night
 *              On air       the picture going out, now and next, the shelf
 *              Running order  what is scheduled, in time order
 *              Breaking     one story, every output drafted together
 *
 *    RESULTS   Clearance    whether the count may be read out
 *              Analysis     what the count says, and how to say it on air
 *              Claims       what is circulating, checked against the count
 *
 *    STUDIO    Go live      open the programme everywhere, and the stage
 *              Ticker       the lines along the bottom of the picture
 *              Candidates   the faces and names on every card
 *
 *    RECORD    Delivery     what each platform did with what was sent
 *              Audit        who did what, in order
 *              Setup        the platforms and this account
 *
 *  An item's life is split the same way, so it is in exactly one list at a
 *  time: waiting for an editor → Live; cleared → On air; out → the Live
 *  timeline and Delivery; everything, ever → Audit.
 *
 *  What was taken out, and why: a "Now" page that repeated four other
 *  screens; a stream-health page and a video-feed page that described what
 *  they would need rather than doing anything; a field roster that repeats
 *  the room's own watch; a listening page that repeated the claims list; and
 *  an approvals page that the Live queue replaces. Every old address still
 *  lands — see WHERE at the foot of this file.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ── THE FOUR, AND WHAT IS INSIDE EACH ─────────────────────────────────────
   Declared as a table so the room's tab row and this file cannot disagree
   about what exists: tests/broadcast-merge.test.js asserts every surface the
   desk ever carried still lands on a section named here. */
export const DESKS = {
  aircontrol: {
    label: "Control",
    sections: [
      { id: "live", label: "Live", icon: Megaphone },
      { id: "onair", label: "On air", icon: Radio },
      { id: "order", label: "Running order", icon: Clock3 },
      { id: "breaking", label: "Breaking", icon: Zap },
    ],
  },
  airresults: {
    label: "Results",
    sections: [
      { id: "clearance", label: "Clearance", icon: ShieldCheck },
      { id: "analysis", label: "Analysis", icon: BarChart3 },
      { id: "claims", label: "Claims", icon: ScrollText },
    ],
  },
  airstudio: {
    label: "Studio",
    sections: [
      { id: "golive", label: "Go live", icon: Monitor },
      { id: "ticker", label: "Ticker", icon: Type },
      { id: "candidates", label: "Candidates", icon: UserRound },
    ],
  },
  airrecord: {
    label: "Record",
    sections: [
      { id: "delivery", label: "Delivery", icon: Send },
      { id: "audit", label: "Audit", icon: Activity },
      { id: "setup", label: "Setup", icon: Sliders },
    ],
  },
};

/** Every desk id, for the room's tab table and the guard on `view`. */
export const DESK_IDS = Object.keys(DESKS);

export default function RoomBroadcast({
  /* Which of the four. The room owns this, because it is a tab in the room's
     own row — this component owns only the section within it. */
  view = "aircontrol",
  user,
  may,
  project,
  race,
  raceLabel,
  ground,
  items = [],
  audit = [],
  rows = [],
  places = [],
  national = null,
  trends = null,
  incidents = [],
  photoCount = 0,
  coordinators = [],
  watchSummary = null,
  declaredRows = [],
  capabilities = [],
  shapes = null,
  load = null,
  order = null,
  pipeline = null,
  suggestions = [],
  deliveries = {},
  channels = [],
  wire = null,
  stageUrl = null,
  liveChannels = [],
  contestants = [],
  timeline = null,
  onGo,
}) {
  const desk = DESKS[view] ?? DESKS.aircontrol;

  /* ── ONE REMEMBERED SECTION PER DESK, NOT ONE FOR ALL FOUR ──────────────
     Crossing from Control to Studio and back should land where somebody was,
     not on Control's first section. A single `section` string would reset
     every time the desk changed, which on a gallery wall is the difference
     between a control you use and one you re-navigate every time. */
  const [remembered, setRemembered] = useState({});
  const section = remembered[view] ?? desk.sections[0].id;
  const setSection = (id) => setRemembered((current) => ({ ...current, [view]: id }));

  const coverage = useMemo(
    () => ({
      filed: national?.filed ?? 0,
      reporting: national?.reporting ?? null,
      expected: places.reduce((sum, place) => sum + (place.expected ?? 0), 0),
    }),
    [national, places]
  );

  /* The desk's sub-surfaces call `onGo` with the old surface ids — a link from
     the command centre to the clearance queue, say. Those ids no longer name
     tabs, so they are translated to the desk that swallowed them and the
     section inside it, and the press lands where it always did. */
  const goInside = (target) => {
    const found = WHERE[target];
    if (!found) return onGo?.(target);
    if (found.desk === view) return setSection(found.section);
    setRemembered((current) => ({ ...current, [found.desk]: found.section }));
    onGo?.(found.desk);
  };

  return (
    <DeskProvider user={user} may={may} deliveries={deliveries} channels={channels} wire={wire}>
      <div className="flex flex-col gap-3">
        <div
          role="tablist"
          aria-label={`${desk.label} sections`}
          className="flex flex-wrap gap-1 rounded-dash border border-dash-line bg-dash-card p-1"
        >
          {desk.sections.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSection(item.id)}
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

        {/* ──────────────────────────────────────────────── CONTROL ───── */}
        {view === "aircontrol" && section === "live" && (
          <LiveDesk
            items={items}
            incidents={incidents}
            timeline={timeline}
            places={places}
            national={national}
            race={race}
            shapes={shapes}
          />
        )}
        {view === "aircontrol" && section === "onair" && (
          <div className="flex flex-col gap-3">
            {/* The picture first, then what is in it and what is ready to
                join it — one screen for the person holding the output. */}
            <ControlRoom items={items} load={load} national={national} raceLabel={raceLabel} onGo={goInside} />
            <Playout items={items} order={order} onGo={goInside} />
          </div>
        )}
        {view === "aircontrol" && section === "order" && <Scheduler items={items} />}
        {view === "aircontrol" && section === "breaking" && (
          <BreakingNews items={items} incidents={incidents} race={race} />
        )}

        {/* ──────────────────────────────────────────────── RESULTS ───── */}
        {view === "airresults" && section === "clearance" && (
          <LiveResults
            pipeline={pipeline}
            places={places}
            national={national}
            race={race}
            raceLabel={raceLabel}
            onGo={goInside}
          />
        )}
        {view === "airresults" && section === "analysis" && (
          <div className="flex flex-col gap-3">
            <ResultsIntel
              places={places}
              national={national}
              rows={rows}
              declaredRows={declaredRows}
              raceLabel={raceLabel}
            />
            <DataViz places={places} national={national} raceLabel={raceLabel} />
            <Trends trends={trends} raceLabel={raceLabel} />
          </div>
        )}
        {view === "airresults" && section === "claims" && (
          <Claims items={items} race={race} national={national} />
        )}

        {/* ───────────────────────────────────────────────── STUDIO ───── */}
        {view === "airstudio" && section === "golive" && (
          <GoLive items={items} liveChannels={liveChannels} project={project} stageUrl={stageUrl} wire={wire} />
        )}
        {view === "airstudio" && section === "ticker" && (
          <TickerDesk suggestions={suggestions} items={items} race={race} />
        )}
        {view === "airstudio" && section === "candidates" && (
          <Contestants race={race} raceLabel={raceLabel} contestants={contestants} />
        )}

        {/* ───────────────────────────────────────────────── RECORD ───── */}
        {view === "airrecord" && section === "delivery" && <Delivery items={items} />}
        {view === "airrecord" && section === "audit" && <Audit items={items} audit={audit} />}
        {view === "airrecord" && section === "setup" && (
          <div className="flex flex-col gap-3">
            <Platforms items={items} />
            <Team role={user.role} capabilities={capabilities} />
          </div>
        )}
      </div>
    </DeskProvider>
  );
}

/**
 * Where every screen this desk has ever had lives now.
 *
 * The screens that were taken out send their old addresses to the screen that
 * replaced them — the old "Now" page to Live, the stream page to the running
 * order — so a bookmark or a link in last week's briefing still lands.
 *
 * ── IT IS A REDIRECT TABLE, AND IT IS ALSO THE PROOF ───────────────────────
 * Two jobs from one table. `goInside` uses it so a press inside the desk —
 * "take me to the clearance queue" — still lands, though the surface it names
 * stopped being a tab. And the test uses it to assert that all twenty-eight
 * are accounted for: a surface missing here is a surface the merge dropped,
 * which is exactly the failure that would otherwise be found by a producer at
 * eleven at night looking for the approvals queue.
 */
export const WHERE = {
  /* Control */
  live: { desk: "aircontrol", section: "live" },
  centre: { desk: "aircontrol", section: "live" },
  approvals: { desk: "aircontrol", section: "live" },
  socialdesk: { desk: "aircontrol", section: "live" },
  content: { desk: "aircontrol", section: "live" },
  multi: { desk: "aircontrol", section: "live" },
  reporters: { desk: "aircontrol", section: "live" },
  feeds: { desk: "aircontrol", section: "live" },
  playout: { desk: "aircontrol", section: "onair" },
  control: { desk: "aircontrol", section: "onair" },
  scheduler: { desk: "aircontrol", section: "order" },
  breaking: { desk: "aircontrol", section: "breaking" },

  /* Results */
  liveresults: { desk: "airresults", section: "clearance" },
  resultsintel: { desk: "airresults", section: "analysis" },
  dataviz: { desk: "airresults", section: "analysis" },
  trends: { desk: "airresults", section: "analysis" },
  trending: { desk: "airresults", section: "analysis" },
  claims: { desk: "airresults", section: "claims" },
  listening: { desk: "airresults", section: "claims" },

  /* Studio */
  graphics: { desk: "aircontrol", section: "live" },
  mapstudio: { desk: "aircontrol", section: "live" },
  video: { desk: "airstudio", section: "golive" },
  stream: { desk: "airstudio", section: "golive" },
  ticker: { desk: "airstudio", section: "ticker" },
  contestants: { desk: "airstudio", section: "candidates" },

  /* Record */
  socialstats: { desk: "airrecord", section: "delivery" },
  audit: { desk: "airrecord", section: "audit" },
  team: { desk: "airrecord", section: "setup" },
  platforms: { desk: "airrecord", section: "setup" },
  health: { desk: "airrecord", section: "setup" },
};
