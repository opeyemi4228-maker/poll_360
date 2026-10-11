import { Card } from "@/components/dash/DashCard";
import RoomShell from "@/components/room/RoomShell";
import UnitPanel from "@/components/room/UnitPanel";
import GroundForm from "@/components/room/Ground";
import { Crumbs, Handover, IncidentList, ItemList, LightMap, LightTable, RaiseTech, StateGrid, StatusCard, ThreeRecords } from "@/components/room/Panels";
import { lightsFor, openUnit, roomPage, rosterFor } from "@/lib/room/page";
import { field, items, notes } from "@/lib/room/store";
import { threeRecords } from "@/lib/room/desk";
import { touches } from "@/lib/ground";

export const metadata = { title: "Zone lead", robots: { index: false } };
export const dynamic = "force-dynamic";

const BASE = "/room/zone";

/**
 * The zone lead's view: the states of their zones, the observers who watch
 * them, and what those observers could not settle themselves. What is
 * resolved here never reaches the Director's inbox.
 */
export default async function ZonePage({ searchParams }) {
  const { ctx, query, caps, at, unit, trail, now } = await roomPage(BASE, searchParams);
  if (!ctx.project) return <RoomShell ctx={ctx} title="Zone lead" />;
  const electionId = ctx.project.id;

  const [zone, here, inbox, sos, overdue, everyone, records, handovers, view] = await Promise.all([
    lightsFor(ctx, ""),
    at ? lightsFor(ctx, at) : null,
    items.list({ electionId, race: ctx.race, ground: ctx.ground, escalatedTo: "ZONE_LEAD", take: 80 }),
    field.incidents({ electionId, ground: ctx.ground, critical: true, take: 30 }),
    items.list({ electionId, race: ctx.race, ground: ctx.ground, under: at, take: 500 }),
    rosterFor({ roles: ["STATE_OBSERVER", "LEAD_VERIFIER", "VERIFIER", "FIELD_OPS"] }),
    threeRecords(ctx, at),
    notes.list({ electionId, kind: "HANDOVER", desk: "zone", take: 5 }),
    openUnit(ctx, unit),
  ]);
  const mine = everyone.filter((person) => person.groundRead && zone.below.some((state) => touches(person.groundRead, state.code)));
  const observers = mine.filter((person) => person.roles.includes("STATE_OBSERVER"));
  const late = overdue.filter((item) => item.code === "Y_OVERDUE_RETURN");
  const lateBy = new Map();
  for (const item of late) lateBy.set(item.areaCode.slice(0, 5), (lateBy.get(item.areaCode.slice(0, 5)) ?? 0) + 1);

  return (
    <RoomShell ctx={ctx} title="Zone lead" openCount={inbox.length}>
      <div className="space-y-6">
        {view && <UnitPanel view={view} caps={caps} base={BASE} query={query} userId={ctx.user.id} roster={mine} />}

        <div className="grid gap-6 xl:grid-cols-[22rem_1fr_24rem]">
          <StatusCard light={zone.light} title="Zone status" />
          <Card title="Map" subtitle="Only the states of your zones are filled.">
            <LightMap rows={zone.below} base={BASE} query={query} />
          </Card>
          <div className="space-y-6">
            <Card title={`Escalations (${inbox.length})`} subtitle="From observers, verifiers and field operations in your zones.">
              <ItemList items={inbox} caps={caps} base={BASE} query={query} roster={mine} userId={ctx.user.id} empty="Nothing has been escalated to you." now={now} />
            </Card>
            <Card title="SOS and critical reports" subtitle="Open in your zones. Unacknowledged first.">
              <IncidentList rows={sos} caps={caps} base={BASE} query={query} empty="No SOS and no critical report is open." now={now} />
            </Card>
          </div>
        </div>

        <StateGrid rows={zone.below} base={BASE} query={query} />

        {at && here && (
          <Card title={here.light.name} subtitle="The places under it, worst first where you sort them.">
            <Crumbs trail={trail} base={BASE} query={query} />
            <div className="mt-4 grid gap-6 xl:grid-cols-[22rem_1fr]">
              <StatusCard light={here.light} className="shadow-none" />
              <LightTable rows={here.below} base={BASE} query={query} />
            </div>
          </Card>
        )}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Three-record gaps" subtitle="Our agents, INEC's sheets and the announcement, largest gap first.">
            <ThreeRecords account={records} base={BASE} query={query} lights={new Map((here?.below ?? zone.below).map((row) => [row.code, row.light]))} />
          </Card>
          <Card title={`Overdue returns (${late.length})`} subtitle="Polling units past the deadline with nothing filed, by local government.">
            {late.length ? (
              <ul className="max-h-80 divide-y divide-dash-line overflow-auto text-[0.8125rem]">
                {[...lateBy.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => (
                  <li key={code} className="flex justify-between py-2">
                    <a href={`${BASE}?at=${encodeURIComponent(code)}`} className="font-semibold text-dash-ink hover:underline">{late.find((item) => item.areaCode.startsWith(code))?.place.split(" › ").slice(0, 2).join(" › ")}</a>
                    <span className="tabular-nums text-dash-muted">{count} overdue</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.875rem] text-dash-muted">Nothing is overdue. This fills once the Super Admin sets a deadline and it passes.</p>
            )}
          </Card>
        </div>

        <Card title="Observers in your zones" subtitle="Who is on, what they hold, and where they watch. Change an observer's ground here.">
          {observers.length ? (
            <ul className="divide-y divide-dash-line">
              {observers.map((person) => (
                <li key={person.id} className="py-3">
                  <details>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 text-[0.875rem]">
                      <span className={person.online ? "size-2.5 rounded-full bg-light-green" : "size-2.5 rounded-full border border-light-grey"} aria-hidden="true" />
                      <span className="font-semibold text-dash-ink">{person.name}</span>
                      <span className="text-dash-muted">{person.online ? "online" : "away"} · {person.groundLabel} · {person.openItems} open</span>
                    </summary>
                    <div className="mt-3 rounded-dash-sm bg-dash-bg p-3">
                      <GroundForm person={person} states={zone.below.map((state) => ({ code: state.code, name: state.name }))} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.875rem] text-dash-muted">No observer has been placed in your zones yet. The Super Admin issues their accounts.</p>
          )}
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Handover desk="zone" notes={handovers} userId={ctx.user.id} />
          <RaiseTech />
        </div>
      </div>
    </RoomShell>
  );
}
