import { Card, Empty } from "@/components/dash/DashCard";
import UnitPanel from "./UnitPanel";
import BroadcastPanel, { CallControl } from "./BroadcastPanel";
import Count from "./Count";
import { LightBadge } from "./Light";
import { Crumbs, Handover, IncidentList, ItemList, LightMap, LightTable, Roster, StateGrid, StatusCard, ThreeRecords, age, clock } from "./Panels";
import { lightsFor, openUnit, rosterFor, unobservedStates } from "@/lib/room/page";
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

  return { nation, here, inbox, sos, people, rate, records, desk, count, log, rules, handovers, view, redHere, unobserved, deskCaps, lightByCode, now, focus, covering };
}

export default function Overview({ ctx, base, query, caps, at, crumbs, deskName, data }) {
  const { nation, here, inbox, sos, people, rate, records, desk, count, log, rules, handovers, view, redHere, unobserved, deskCaps, lightByCode, now, focus, covering } = data;
  return (
      <div className="space-y-6">
        {view && <UnitPanel view={view} caps={caps} base={base} query={query} userId={ctx.user.id} roster={people} />}

        {/* The national picture and every state, on one screen without a
            scroll. The map and the two inboxes follow. */}
        <div className="grid gap-6 xl:grid-cols-[21rem_1fr]">
          <StatusCard light={nation.light} title="National status" rate={rate} />
          <StateGrid rows={nation.below} base={base} query={query} unobserved={unobserved} compact />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card title="Map" subtitle="Each state is filled with its light and marked with the light's own shape.">
            <LightMap rows={nation.below} base={base} query={query} />
          </Card>
          <Card title={`Escalations (${inbox.length})`} subtitle="Sent to you, or red with no owner past the limit. Oldest first.">
            <ItemList items={inbox} caps={caps} base={base} query={query} roster={people} userId={ctx.user.id} empty="Nothing needs you right now." now={now} />
          </Card>
          <Card title="SOS and critical reports" subtitle="The last two hours. Unacknowledged first.">
            <IncidentList rows={sos} caps={caps} base={base} query={query} empty="No SOS and no critical report in the last two hours." now={now} />
          </Card>
        </div>

        {at && here && (
          <Card id="place" title={here.light.name} subtitle="The place you opened. Everything below narrows to it." action={<LightBadge light={here.light.light} coverage={here.light.coveragePct} />}>
            <Crumbs trail={crumbs} base={base} query={query} />
            <div className="mt-4 grid gap-6 xl:grid-cols-[22rem_1fr]">
              <StatusCard light={here.light} className="shadow-none" />
              <div className="space-y-5">
                <LightTable rows={here.below} base={base} query={query} />
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

        <div className="grid gap-6 xl:grid-cols-3">
          <Card title="Three-record gaps" subtitle={`Our agents, INEC's sheets and the announcement${at ? ` in ${focus.name}` : ""}, largest gap first.`}>
            <ThreeRecords account={records} base={base} query={query} lights={lightByCode} />
          </Card>

          <Card title="Broadcast oversight" subtitle="What is waiting, what is cleared, and where each post landed.">
            <BroadcastPanel items={desk.posts} deliveries={desk.deliveries} caps={deskCaps} userId={ctx.user.id} live={desk.live} now={now} take={5} />
            {deskCaps.call && <div className="mt-4"><CallControl light={focus} floor={rules.callFloorPercent} parties={ballotFor(ctx.race)} at={at} /></div>}
          </Card>

          <Card title="Team and system" subtitle="Who is on, what they cover and how much they hold.">
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

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title={`Running count${at ? ` · ${focus.name}` : ""}`} subtitle="Our own count. The announced figures are a separate column and are never added to it.">
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
