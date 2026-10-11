import { AlertOctagon, EyeOff, Gauge, ShieldCheck } from "lucide-react";

import { Card, Empty } from "@/components/dash/DashCard";
import BigMap from "./BigMap";
import BvasBlock from "./BvasBlock";
import Stage, { Side, StatRow } from "./Stage";
import { LightCounts } from "./Light";
import UnitPanel from "./UnitPanel";
import BroadcastPanel, { CallControl } from "./BroadcastPanel";
import Count from "./Count";
import { LightBadge } from "./Light";
import { Crumbs, Handover, IncidentList, ItemList, LightMap, LightTable, Roster, StateGrid, StatusCard, ThreeRecords, age, clock } from "./Panels";
import { groundStats, lightsFor, mapFor, openUnit, rosterFor, unobservedStates } from "@/lib/room/page";
import { touches } from "@/lib/ground";
import { field, items, lights, notes, settings, trail } from "@/lib/room/store";
import { broadcastDesk, runningCount, threeRecords } from "@/lib/room/desk";
import { ballotFor } from "@/lib/races";
import { asWords } from "@/lib/utils";

/**
 * The overview the Director and the Super Admin both work from: the whole
 * project in one look, only the decisions that need them, and control of
 * what goes on air.
 *
 * One component, mounted on both consoles, so the two cannot show different
 * figures for the same night. What each reader may press follows `caps` and
 * their own account; nothing here edits a vote or a BVAS figure.
 */
export async function overviewData({ ctx, at, unit, deskName }) {
  const electionId = ctx.project.id;

  const [nation, here, inbox, sos, people, rate, records, desk, count, log, rules, handovers, view] = await Promise.all([
    lightsFor(ctx, ""),
    at ? lightsFor(ctx, at) : null,
    items.list({ electionId, race: ctx.race, escalatedTo: "DIRECTOR", take: 60 }),
    field.incidents({ electionId, ground: ctx.ground, open: false, critical: true, hours: 2, take: 30 }),
    rosterFor(),
    lights.rate(electionId, ctx.race),
    threeRecords(ctx, at),
    broadcastDesk(ctx.project),
    runningCount(ctx, at),
    trail.byActor(ctx.user.id, 30),
    settings.get(electionId),
    notes.list({ electionId, kind: "HANDOVER", desk: deskName, take: 5 }),
    openUnit(ctx, unit),
  ]);
  const redHere = at ? await items.list({ electionId, race: ctx.race, under: at, light: "RED", take: 40 }) : [];
  const unobserved = unobservedStates(people, nation.below.map((row) => row.code));
  const deskCaps = { clear: ctx.holds("broadcast:clear"), call: ctx.holds("broadcast:call"), hold: ctx.holds("broadcast:hold"), air: ctx.holds("broadcast:air") };
  const lightByCode = new Map((here?.below ?? nation.below).map((row) => [row.code, row.light]));
  const now = Date.now();
  const focus = here?.light ?? nation.light;
  const covering = at ? people.filter((person) => person.groundRead && touches(person.groundRead, at) && person.roles.some((role) => role === "STATE_OBSERVER" || role === "ZONE_LEAD")) : [];

  const map = await mapFor(ctx, at, nation, here);
  const redOpen = await items.list({ electionId, race: ctx.race, light: "RED", take: 200 });
  return { nation, here, inbox, sos, people, rate, records, desk, count, log, rules, handovers, view, redHere, unobserved, deskCaps, lightByCode, now, focus, covering, map, redOpen };
}

export default function Overview({ ctx, base, query, caps, at, crumbs, deskName, data }) {
  const { nation, here, inbox, sos, people, rate, records, desk, count, log, rules, handovers, view, redHere, unobserved, deskCaps, lightByCode, now, focus, covering, map, redOpen } = data;
  const oldestRed = redOpen.length ? redOpen.reduce((old, item) => (item.openedAt < old.openedAt ? item : old)) : null;
  const waiting = sos.filter((row) => row.status === "OPEN" && !row.acknowledgedAt).length;
  const stats = groundStats(nation.light, [
    { label: "Red items open", value: String(redOpen.length), note: oldestRed ? `oldest open ${age(oldestRed.openedAt, now)}` : "nothing needs action now", tone: redOpen.length ? "red" : "green", icon: AlertOctagon },
    waiting
      ? { label: "People in trouble, not acknowledged", value: String(waiting), note: "pick up a phone", tone: "red", icon: AlertOctagon }
      : { label: "States with no observer online", value: String(unobserved.size), note: unobserved.size ? "nobody is watching them" : "every state is watched", tone: unobserved.size ? "yellow" : "green", icon: EyeOff },
  ]);
  stats[0].icon = Gauge;
  stats[1].icon = ShieldCheck;

  return (
    <div className="space-y-3">
      <StatRow stats={stats} />

      {view && <UnitPanel view={view} caps={caps} base={base} query={query} userId={ctx.user.id} roster={people} />}

      <Stage map={<BigMap rows={map.rows} base={base} query={query} at={map.at} title={map.title} />}>
        <Side label={`The light on ${focus.name}`} headline={<LightBadge light={focus.light} coverage={focus.coveragePct} />} note={rate > 0 ? `${rate} results a minute over the last ten minutes` : "No results in the last ten minutes"}>
          <LightCounts counts={focus.counts} />
          <BvasBlock bvas={focus.bvas} total={focus.total} className="mt-3 border-0 bg-dash-bg p-4" />
          {at && <div className="mt-3"><Crumbs trail={crumbs} base={base} query={query} /></div>}
        </Side>
        <Side id="escalations" label="Escalations" headline={inbox.length ? `${inbox.length} need you` : "Nothing needs you"} note="Sent to you, or red with no owner past the limit. Oldest first.">
          <div className="max-h-80 overflow-auto"><ItemList items={inbox} caps={caps} base={base} query={query} roster={people} userId={ctx.user.id} empty="Nothing has been escalated." now={now} /></div>
        </Side>
        <Side id="sos" label="SOS and critical reports" headline={waiting ? `${waiting} not acknowledged` : "Nobody waiting"} note="The last two hours.">
          <div className="max-h-80 overflow-auto"><IncidentList rows={sos} caps={caps} base={base} query={query} empty="No SOS and no critical report in the last two hours." now={now} /></div>
        </Side>
      </Stage>

      <div id="states" className="scroll-mt-24">
        <StateGrid rows={nation.below} base={base} query={query} unobserved={unobserved} compact />
      </div>

      {at && here && (
        <Card id="place" title={here.light.name} subtitle="The place you opened, and the places under it." action={<LightBadge light={here.light.light} coverage={here.light.coveragePct} />}>
          <div className="space-y-5">
            <LightTable rows={here.below} base={base} query={query} />
            <div className="grid gap-5 xl:grid-cols-2">
              <section>
                <h3 className="mb-1 text-[0.875rem] font-bold text-dash-ink">Open red items here</h3>
                <ItemList items={redHere} caps={caps} base={base} query={query} roster={people} userId={ctx.user.id} empty="No red item is open here." now={now} />
              </section>
              <section>
                <h3 className="mb-1 text-[0.875rem] font-bold text-dash-ink">Who covers it</h3>
                <Roster people={covering} describe={(person) => `${asWords(person.role)} · ${person.groundLabel}`} />
              </section>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-3 xl:grid-cols-3">
        <Card id="records" title="Three-record gaps" subtitle={`Our agents, INEC's sheets and the announcement${at ? ` in ${focus.name}` : ""}, largest gap first.`}>
          <ThreeRecords account={records} base={base} query={query} lights={lightByCode} />
        </Card>

        <Card id="broadcast" title="Broadcast oversight" subtitle="What is waiting, what is cleared, and where each post landed.">
          <BroadcastPanel items={desk.posts} deliveries={desk.deliveries} caps={deskCaps} userId={ctx.user.id} live={desk.live} now={now} take={5} />
          {deskCaps.call && <div className="mt-4"><CallControl light={focus} floor={rules.callFloorPercent} parties={ballotFor(ctx.race)} at={at} /></div>}
        </Card>

        <Card id="team" title="Team and system" subtitle="Who is on, what they cover and how much they hold.">
          {unobserved.size > 0 && (
            <p className="mb-3 rounded-dash-sm bg-light-yellow-soft px-3 py-2 text-[0.8125rem] font-semibold text-light-yellow-ink">
              ▲ {unobserved.size} {unobserved.size === 1 ? "state has" : "states have"} no observer online.
            </p>
          )}
          <div className="max-h-96 overflow-auto">
            <Roster people={people.filter((person) => person.id !== ctx.user.id)} describe={(person) => `${asWords(person.role)} · ${person.groundLabel}`} />
          </div>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card id="count" title={`Running count${at ? ` · ${focus.name}` : ""}`} subtitle="Our own count. The announced figures are a separate column and are never added to it.">
          <Count count={count} light={focus} />
        </Card>
        <Card title="Decision log" subtitle="Everything you have done here, from the audit record.">
          {log.length ? (
            <ul className="max-h-96 divide-y divide-dash-line overflow-auto text-[0.8125rem]">
              {log.map((line) => (
                <li key={line.id} className="py-2">
                  <span className="font-semibold text-dash-ink">{asWords(line.action.replace(":", " "))}</span>
                  <span className="text-dash-muted"> · {line.subject} · {clock(line.at)} ({age(line.at, now)} ago)</span>
                  {line.meta?.note && <span className="block text-dash-muted">{line.meta.note}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing yet. Each decision you take appears here as you take it.</Empty>
          )}
        </Card>
      </div>

      <Handover desk={deskName} notes={handovers} userId={ctx.user.id} />
    </div>
  );
}

/** The tabs in the top bar for a console built on this overview. */
export const OVERVIEW_TABS = (base) => [
  { id: "command", name: "Command", href: base },
  { id: "states", name: "States", href: `${base}#states` },
  { id: "records", name: "Three records", href: `${base}#records` },
  { id: "broadcast", name: "Broadcast", href: `${base}#broadcast` },
  { id: "team", name: "Team", href: `${base}#team` },
  { id: "count", name: "Count", href: `${base}#count` },
];
