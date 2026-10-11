import { AlertOctagon, EyeOff, Gauge, Megaphone, Radio, Scale, ShieldCheck, Users } from "lucide-react";

import Link from "next/link";

import { Card, Empty } from "@/components/dash/DashCard";
import BigMap from "./BigMap";
import BvasBlock from "./BvasBlock";
import Stage, { Side, StatRow } from "./Stage";
import { LightCounts } from "./Light";
import UnitPanel from "./UnitPanel";
import BroadcastPanel, { CallControl } from "./BroadcastPanel";
import Count from "./Count";
import { LightBadge } from "./Light";
import { Crumbs, Handover, IncidentList, ItemList, LightTable, Roster, StateGrid, ThreeRecords, age, clock, gapRows, hrefWith } from "./Panels";
import { groundStats, lightsFor, mapFor, openUnit, rosterFor, unobservedStates } from "@/lib/room/page";
import { touches } from "@/lib/ground";
import { field, items, lights, notes, settings, trail } from "@/lib/room/store";
import { broadcastDesk, runningCount, threeRecords } from "@/lib/room/desk";
import { ballotFor } from "@/lib/races";
import { asWords, formatNumber } from "@/lib/utils";

/**
 * The overview the Director and the Super Admin both work from: the whole
 * project in one look, only the decisions that need them, and control of
 * what goes on air.
 *
 * One component, mounted on both consoles, so the two cannot show different
 * figures for the same night. What each reader may press follows `caps` and
 * their own account; nothing here edits a vote or a BVAS figure.
 */
export async function overviewData({ ctx, at, unit, deskName, view = "command" }) {
  const electionId = ctx.project.id;
  const is = (...views) => views.includes(view);
  /* Only what the dashboard being looked at draws. A console that loaded
     every dashboard's figures to show one of them was a console that took
     four seconds to open a state. */
  const [nation, here, inbox, sos, people, rate, records, desk, count, log, rules, handovers, opened, redHere, redOpen] = await Promise.all([
    lightsFor(ctx, ""),
    at ? lightsFor(ctx, at) : null,
    items.list({ electionId, race: ctx.race, escalatedTo: "DIRECTOR", take: 60 }),
    is("command") ? field.incidents({ electionId, ground: ctx.ground, open: false, critical: true, hours: 2, take: 30 }) : [],
    rosterFor(),
    is("command") ? lights.rate(electionId, ctx.race) : 0,
    is("records") ? threeRecords(ctx, at) : null,
    is("broadcast") || is("command") ? broadcastDesk(ctx.project) : { posts: [], deliveries: {}, live: null },
    is("broadcast", "count") ? runningCount(ctx, at) : { units: 0, checked: 0, all: 0, parties: [] },
    is("log") ? trail.byActor(ctx.user.id, 60) : [],
    settings.get(electionId),
    is("log") ? notes.list({ electionId, kind: "HANDOVER", desk: deskName, take: 5 }) : [],
    openUnit(ctx, unit),
    at && is("states") ? items.list({ electionId, race: ctx.race, under: at, light: "RED", take: 40 }) : [],
    is("command") ? items.list({ electionId, race: ctx.race, light: "RED", take: 200 }) : [],
  ]);
  const map = await mapFor(ctx, at, nation, here);
  const unobserved = unobservedStates(people, nation.below.map((row) => row.code));
  const deskCaps = { clear: ctx.holds("broadcast:clear"), call: ctx.holds("broadcast:call"), hold: ctx.holds("broadcast:hold"), air: ctx.holds("broadcast:air") };
  const lightByCode = new Map((here?.below ?? nation.below).map((row) => [row.code, row.light]));
  const now = Date.now();
  const focus = here?.light ?? nation.light;
  const covering = at ? people.filter((person) => person.groundRead && touches(person.groundRead, at) && person.roles.some((role) => role === "STATE_OBSERVER" || role === "ZONE_LEAD")) : [];
  return { nation, here, inbox, sos, people, rate, records, desk, count, log, rules, handovers, view: opened, redHere, unobserved, deskCaps, lightByCode, now, focus, covering, map, redOpen };
}

/* The console's dashboards. Each tab in the top bar is one of these: its own
   four figures, its own question asked of the map, its own panels. */
export const OVERVIEW_VIEWS = [
  ["command", "Command"],
  ["states", "States"],
  ["records", "Three records"],
  ["broadcast", "Broadcast"],
  ["team", "Team"],
  ["count", "Count"],
  ["log", "Log"],
];

export const OVERVIEW_TABS = (base, at = "", counts = {}) =>
  OVERVIEW_VIEWS.map(([id, name]) => ({ id, name, count: counts[id] ?? null, href: hrefWith(base, { at: at || null }, { tab: id === "command" ? null : id }) }));

export const overviewView = (tab) => (OVERVIEW_VIEWS.some(([id]) => id === tab) ? tab : "command");

export default function Overview({ ctx, base, query, caps, at, crumbs, deskName, data, view = "command" }) {
  const { nation, here, inbox, sos, people, rate, records, desk, count, log, rules, handovers, view: unit, redHere, unobserved, deskCaps, lightByCode, now, focus, covering, map, redOpen } = data;
  const q = { ...query, tab: view === "command" ? null : view };
  const oldestRed = redOpen.length ? redOpen.reduce((old, item) => (item.openedAt < old.openedAt ? item : old)) : null;
  const waiting = sos.filter((row) => row.status === "OPEN" && !row.acknowledgedAt).length;
  const mapEl = (props = {}) => <BigMap rows={map.rows} base={base} query={q} at={map.at} title={map.title} {...props} />;
  const LightSide = (
    <Side label={`The light on ${focus.name}`} headline={<LightBadge light={focus.light} coverage={focus.coveragePct} />} note={rate > 0 ? `${rate} results a minute over the last ten minutes` : "No results in the last ten minutes"}>
      <LightCounts counts={focus.counts} />
      <BvasBlock bvas={focus.bvas} total={focus.total} className="mt-3 border-0 bg-dash-bg p-4" />
      {at && <div className="mt-3"><Crumbs trail={crumbs} base={base} query={q} /></div>}
    </Side>
  );
  const UnitOpen = unit && <UnitPanel view={unit} caps={caps} base={base} query={q} userId={ctx.user.id} roster={people} />;

  if (view === "states") {
    const rows = here?.below ?? nation.below;
    const by = (light) => rows.filter((row) => row.light === light).length;
    return (
      <div className="space-y-3">
        <StatRow stats={[
          { label: "Red", value: String(by("RED")), note: "malpractice or critical, needs action now", tone: by("RED") ? "red" : "green" },
          { label: "Yellow", value: String(by("YELLOW")), note: "errors or unfinished checks", tone: by("YELLOW") ? "yellow" : "green" },
          { label: "Cleared so far", value: String(by("GREEN")), note: "everything received is checked", tone: "green" },
          { label: "No returns yet", value: String(by("GREY")), note: `of ${rows.length} ${at ? "places" : "states"}` },
        ]} />
        {UnitOpen}
        <Stage map={mapEl()}>
          {LightSide}
          <Side label={at ? `Places under ${focus.name}` : "Worst first"} headline={`${rows.length} ${at ? "places" : "states"}`} note="Press one to open it on the map.">
            <ul className="max-h-[30rem] divide-y divide-dash-line overflow-auto">
              {[...rows].sort((a, b) => RANK[b.light] - RANK[a.light] || b.counts.red - a.counts.red || a.coveragePct - b.coveragePct).map((row) => (
                <li key={row.code}>
                  <Link href={hrefWith(base, q, row.level === "pu" ? { unit: row.code } : { at: row.code, unit: null })} className="flex items-center gap-2 py-2 text-[0.8125rem] hover:bg-dash-bg">
                    <LightBadge light={row.light} short />
                    <span className="min-w-0 flex-1 truncate font-semibold text-dash-ink">{row.name}{unobserved.has(row.code) ? " · ▲ no observer" : ""}</span>
                    <span className="tabular-nums text-dash-muted">{row.reported ? `${row.coveragePct.toFixed(1)}%` : "silent"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Side>
        </Stage>
        {!at && <StateGrid rows={nation.below} base={base} query={q} unobserved={unobserved} />}
        {at && here && (
          <Card title={`${here.light.name}, place by place`} subtitle="Open a place to go down a level. A polling unit opens its own panel.">
            <LightTable rows={here.below} base={base} query={q} />
            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <section>
                <h3 className="mb-1 text-[0.875rem] font-bold text-dash-ink">Open red items here</h3>
                <ItemList items={redHere} caps={caps} base={base} query={q} roster={people} userId={ctx.user.id} empty="No red item is open here." now={now} />
              </section>
              <section>
                <h3 className="mb-1 text-[0.875rem] font-bold text-dash-ink">Who covers it</h3>
                <Roster people={covering} describe={(person) => `${asWords(person.role)} · ${person.groundLabel}`} />
              </section>
            </div>
          </Card>
        )}
      </div>
    );
  }

  if (view === "records") {
    const gaps = gapRows(records, 200);
    const byKey = new Map(gaps.map((row) => [row.key, row]));
    const wrong = (row) => row.oursLead && row.inecLead && row.oursLead !== row.inecLead;
    const layer = {
      id: "records",
      name: "Do the records agree",
      tone: (row) => { const gap = byKey.get(row.code); return !gap || !gap.compared ? "GREY" : wrong(gap) ? "RED" : gap.gap ? "YELLOW" : "GREEN"; },
      label: (row) => { const gap = byKey.get(row.code); return gap?.compared ? `${formatNumber(gap.gap)} gap` : "nothing"; },
      says: (row) => { const gap = byKey.get(row.code); return !gap?.compared ? "Nothing to compare yet" : wrong(gap) ? `Different winners: ours ${gap.oursLead}, INEC ${gap.inecLead}` : gap.gap ? `Figures differ by ${formatNumber(gap.gap)}, same winner` : "The records agree"; },
      show: (row) => Boolean(byKey.get(row.code)?.compared),
      facts: (row) => { const gap = byKey.get(row.code); return gap?.compared ? [["Units both hold", formatNumber(gap.compared)], ["Units that differ", formatNumber(gap.differ)]] : []; },
      legend: { RED: "Different winners", YELLOW: "Figures differ", GREEN: "Records agree", GREY: "Nothing to compare yet" },
    };
    return (
      <div className="space-y-3">
        <StatRow stats={[
          { label: "Places compared", value: String(gaps.filter((row) => row.compared).length), note: "held by both our agents and INEC's sheets", icon: Scale },
          { label: "Different winners", value: String(gaps.filter(wrong).length), note: "our agents and INEC's sheets disagree on who leads", tone: gaps.some(wrong) ? "red" : "green" },
          { label: "Figures that differ", value: String(gaps.filter((row) => row.gap && !wrong(row)).length), note: "same winner, different numbers", tone: gaps.some((row) => row.gap) ? "yellow" : "green" },
          { label: "Announced results held", value: String(gaps.filter((row) => row.announced != null).length), note: "entered under Announced figures" },
        ]} />
        {UnitOpen}
        <Stage map={mapEl({ layers: [layer] })}>
          <Side label="Three records of one election" headline={records?.none || !gaps.some((row) => row.compared) ? "Nothing to compare yet" : `${gaps.filter((row) => row.gap).length} places with a gap`} note="Compared only on the polling units both sides hold. A place one side has not reached is coverage, not a gap.">
            <ul className="space-y-2 text-[0.8125rem] text-dash-ink">
              <li><b>Our agents</b>: what the person we sent wrote down.</li>
              <li><b>INEC&apos;s sheets</b>: what the commission photographed and published.</li>
              <li><b>Announced</b>: what the commission then declared.</li>
            </ul>
          </Side>
          {LightSide}
        </Stage>
        <Card title={`Gaps${at ? ` in ${focus.name}` : ""}, largest first`}>
          <ThreeRecords account={records} base={base} query={q} lights={lightByCode} />
        </Card>
      </div>
    );
  }

  if (view === "broadcast") {
    const posts = desk.posts;
    const layer = {
      id: "call",
      name: "Can it be called",
      tone: (row) => (!row.reported ? "GREY" : row.coveragePct >= rules.callFloorPercent ? "GREEN" : "YELLOW"),
      label: (row) => `${row.coveragePct.toFixed(row.coveragePct < 10 ? 1 : 0)}%`,
      says: (row) => (!row.reported ? "No returns yet" : row.coveragePct >= rules.callFloorPercent ? "Enough is counted to call" : `Too early: under ${rules.callFloorPercent}% counted`),
      show: (row) => row.reported > 0,
      legend: { GREEN: `${rules.callFloorPercent}% or more counted`, YELLOW: "Too early to call", GREY: "No returns yet" },
    };
    return (
      <div className="space-y-3">
        <StatRow stats={[
          { label: "Waiting for clearance", value: String(posts.filter((item) => item.state === "REVIEW").length), note: "nobody clears what they wrote", tone: posts.some((item) => item.state === "REVIEW") ? "yellow" : "green", icon: Megaphone },
          { label: "Race calls and corrections waiting", value: String(posts.filter((item) => item.state === "REVIEW" && item.payload?.call).length), note: "only you or the Super Admin clear these", tone: posts.some((item) => item.state === "REVIEW" && item.payload?.call) ? "red" : "green" },
          { label: "Cleared, not sent", value: String(posts.filter((item) => item.state === "CLEARED").length), note: "can still be held" },
          { label: "Live broadcast", value: desk.live ? "On air" : "Off", note: desk.live ? `since ${clock(desk.live.airedAt)}` : "nothing is on air", tone: desk.live ? "red" : "ink", icon: Radio },
        ]} />
        <Stage map={mapEl({ layers: [layer] })}>
          {deskCaps.call && <CallControl light={focus} floor={rules.callFloorPercent} parties={ballotFor(ctx.race)} at={at} />}
          <Side label={`The count · ${focus.name}`} headline={<LightBadge light={focus.light} coverage={focus.coveragePct} />} note="What a post about this place would carry.">
            <Count count={count} light={focus} />
          </Side>
        </Stage>
        <Card title="The desk" subtitle="What is waiting, what is cleared, and where each post landed. A platform counts as sent only when it has answered.">
          <BroadcastPanel items={posts} deliveries={desk.deliveries} caps={deskCaps} userId={ctx.user.id} live={desk.live} now={now} take={20} />
        </Card>
      </div>
    );
  }

  if (view === "team") {
    const watchers = (code) => people.filter((person) => person.groundRead && person.roles.includes("STATE_OBSERVER") && touches(person.groundRead, code));
    const layer = {
      id: "watch",
      name: "Who is watching",
      tone: (row) => { const on = watchers(row.code); return on.some((person) => person.online) ? "GREEN" : on.length ? "YELLOW" : "RED"; },
      label: (row) => { const on = watchers(row.code); return on.length ? `${on.filter((person) => person.online).length}/${on.length} on` : "nobody"; },
      says: (row) => { const on = watchers(row.code); return on.some((person) => person.online) ? "An observer is online" : on.length ? "Assigned, but nobody is online" : "No observer is assigned"; },
      show: () => true,
      facts: (row) => [["Observers", watchers(row.code).map((person) => person.name).join(", ") || "none"]],
      legend: { GREEN: "An observer is online", YELLOW: "Assigned, nobody online", RED: "Nobody assigned" },
    };
    const online = people.filter((person) => person.online);
    const desks = [...new Set(people.map((person) => person.role))];
    return (
      <div className="space-y-3">
        <StatRow stats={[
          { label: "People online", value: `${online.length}`, note: `of ${people.length} accounts in the room`, icon: Users },
          { label: "Observers online", value: `${online.filter((person) => person.roles.includes("STATE_OBSERVER")).length}`, note: `of ${people.filter((person) => person.roles.includes("STATE_OBSERVER")).length} observers` },
          { label: "States with no observer online", value: String(unobserved.size), note: unobserved.size ? "nobody is watching them" : "every state is watched", tone: unobserved.size ? "yellow" : "green", icon: EyeOff },
          { label: "Items people hold", value: String(people.reduce((sum, person) => sum + person.openItems, 0)), note: "taken or assigned, still open" },
        ]} />
        <Stage map={mapEl({ layers: [layer] })}>
          <Side label="Online now" headline={online.length ? `${online.length} at their desks` : "Nobody is online"}>
            <div className="max-h-[34rem] overflow-auto"><Roster people={[...people].sort((a, b) => Number(b.online) - Number(a.online))} describe={(person) => `${asWords(person.role)} · ${person.groundLabel}`} /></div>
          </Side>
        </Stage>
        <div className="grid gap-3 xl:grid-cols-3">
          {desks.map((role) => (
            <Card key={role} title={asWords(role)} subtitle={`${people.filter((person) => person.role === role && person.online).length} of ${people.filter((person) => person.role === role).length} online`}>
              <Roster people={people.filter((person) => person.role === role)} describe={(person) => person.groundLabel} />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (view === "count") {
    const lead = count.parties[0];
    const second = count.parties[1];
    return (
      <div className="space-y-3">
        <StatRow stats={[
          { label: "Polling units counted", value: formatNumber(count.units), note: `${focus.coveragePct.toFixed(1)}% of ${formatNumber(focus.total)} in ${focus.name}`, icon: Gauge },
          { label: "Checked by a second person", value: count.units ? `${((count.checked / count.units) * 100).toFixed(1)}%` : "0%", note: `${formatNumber(count.checked)} of ${formatNumber(count.units)}`, icon: ShieldCheck },
          { label: "In front", value: lead ? lead.party : "Nobody yet", note: lead ? `${lead.share.toFixed(1)}% of ${formatNumber(count.all)} votes counted` : "no votes counted here yet" },
          { label: "Margin", value: lead && second ? `${(lead.share - second.share).toFixed(1)} pts` : "None", note: lead && second ? `${formatNumber(lead.votes - second.votes)} votes over ${second.party}` : "needs two parties with votes" },
        ]} />
        <Stage map={mapEl()}>
          <Side label={`Running count · ${focus.name}`} headline={<LightBadge light={focus.light} coverage={focus.coveragePct} />} note="Our own count. The announced figures are a separate column and are never added to it.">
            <Count count={count} light={focus} />
          </Side>
          <BvasBlock bvas={focus.bvas} total={focus.total} />
        </Stage>
      </div>
    );
  }

  if (view === "log") {
    return (
      <div className="grid gap-3 xl:grid-cols-2">
        <Card title="Decision log" subtitle="Everything you have done here, from the audit record.">
          {log.length ? (
            <ul className="divide-y divide-dash-line text-[0.8125rem]">
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
        <Handover desk={deskName} notes={handovers} userId={ctx.user.id} />
      </div>
    );
  }

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
      {UnitOpen}
      <Stage map={mapEl()}>
        {LightSide}
        <Side id="escalations" label="Escalations" headline={inbox.length ? `${inbox.length} need you` : "Nothing needs you"} note="Sent to you, or red with no owner past the limit. Oldest first.">
          <div className="max-h-80 overflow-auto"><ItemList items={inbox} caps={caps} base={base} query={q} roster={people} userId={ctx.user.id} empty="Nothing has been escalated." now={now} /></div>
        </Side>
        <Side id="sos" label="SOS and critical reports" headline={waiting ? `${waiting} not acknowledged` : "Nobody waiting"} note="The last two hours.">
          <div className="max-h-80 overflow-auto"><IncidentList rows={sos} caps={caps} base={base} query={q} empty="No SOS and no critical report in the last two hours." now={now} /></div>
        </Side>
      </Stage>
      <StateGrid rows={nation.below} base={base} query={q} unobserved={unobserved} compact />
    </div>
  );
}

const RANK = { RED: 3, YELLOW: 2, GREEN: 1, GREY: 0 };
