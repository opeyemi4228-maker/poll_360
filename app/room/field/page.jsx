import BigMap from "@/components/room/BigMap";
import Stage, { Side, StatRow } from "@/components/room/Stage";
import { LightBadge, LightCounts } from "@/components/room/Light";
import { mapFor } from "@/lib/room/page";
import Link from "next/link";

import { Card, Empty } from "@/components/dash/DashCard";
import RoomShell from "@/components/room/RoomShell";
import UnitPanel from "@/components/room/UnitPanel";
import { Handover, IncidentList, ItemList, RaiseTech, age, clock, hrefWith } from "@/components/room/Panels";
import { lightsFor, openUnit, roomPage } from "@/lib/room/page";
import { assignments } from "@/lib/room/assign";
import { field, items, notes, settings, submissions } from "@/lib/room/store";
import { asWords, formatNumber } from "@/lib/utils";

export const metadata = { title: "Field operations", robots: { index: false } };
export const dynamic = "force-dynamic";

const BASE = "/room/field";
const TAB_NAME = { silent: "Assigned units not reporting", situations: "Situations", confirm: "Verifiers waiting on the field", checkins: "Check-ins", drafts: "Drafts left behind" };

/**
 * The field desk: the people standing at polling units, and whoever in the
 * room is on the phone to them. Who has not reported, who has not checked
 * in, what trouble has been reported, and what a verifier is waiting on the
 * field to confirm.
 */
export default async function FieldPage({ searchParams }) {
  const { ctx, query, caps, at, unit, now } = await roomPage(BASE, searchParams);
  if (!ctx.project) return <RoomShell ctx={ctx} title="Field operations" />;
  const electionId = ctx.project.id;
  const tab = ["silent", "situations", "confirm", "checkins", "drafts"].includes(query.tab) ? query.tab : "silent";

  const [here, silent, reports, queue, agents, left, rules, handovers, view] = await Promise.all([
    lightsFor(ctx, at),
    field.notReporting({ electionId, race: ctx.race, ground: ctx.ground, under: at, take: 200 }),
    field.incidents({ electionId, ground: ctx.ground, open: true, take: 80 }),
    items.list({ electionId, race: ctx.race, ground: ctx.ground, under: at, desk: "field", take: 300 }),
    tab === "checkins" ? assignments.agentsOn(at ? { zones: [], codes: [at] } : ctx.ground, 400) : [],
    submissions.open({ electionId, ground: ctx.ground }),
    settings.get(electionId),
    notes.list({ electionId, kind: "HANDOVER", desk: "field", take: 5 }),
    openUnit(ctx, unit),
  ]);
  const confirm = queue.filter((item) => item.code === "Y_FIELD_CONFIRM");
  const drafts = left.filter((row) => row.kind === "ORPHANED_DRAFT");
  const urgent = reports.filter((row) => !row.acknowledgedAt && (row.sos || row.severity === "CRITICAL")).length;
  const nation = at ? await lightsFor(ctx, "") : here;
  const map = await mapFor(ctx, at, nation, at.length === 2 ? here : null);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(now);
  const cutoff = new Date(`${today}T${/^\d\d:\d\d$/.test(rules.checkInBy) ? rules.checkInBy : "09:00"}:00+01:00`).getTime();
  const checkedIn = (person) => person.lastSeen && new Date(person.lastSeen).getTime() >= new Date(`${today}T00:00:00+01:00`).getTime();

  return (
    <RoomShell ctx={ctx} title="Field operations" openCount={urgent} current={tab}
      summary={`${formatNumber(silent.length)} assigned units not reporting, ${formatNumber(reports.length)} reports open, ${formatNumber(urgent)} not acknowledged`}
      tabs={[["silent", "Not reporting", silent.length], ["situations", "Situations", reports.length], ["confirm", "Verifiers waiting", confirm.length], ["checkins", "Check-ins"], ["drafts", "Left-behind drafts", drafts.length]].map(([id, name, count]) => ({ id, name, count, href: hrefWith(BASE, { at: query.at }, { tab: id }) }))}>
      <div className="space-y-3">
        <StatRow stats={[
          { label: "Assigned units not reporting", value: formatNumber(silent.length), note: silent.length ? "ring the agent" : "every assigned unit is in", tone: silent.length ? "yellow" : "green" },
          { label: "People in trouble, not acknowledged", value: formatNumber(urgent), note: urgent ? "pick up a phone" : "nobody waiting", tone: urgent ? "red" : "green" },
          { label: "Reports open from the field", value: formatNumber(reports.length), note: "of every kind" },
          { label: "Verifiers waiting on the field", value: formatNumber(confirm.length), note: confirm.length ? "they asked you to confirm" : "nothing asked", tone: confirm.length ? "yellow" : "green" },
        ]} />

        {view && <UnitPanel view={view} caps={caps} base={BASE} query={query} userId={ctx.user.id} />}

        <Stage map={<BigMap rows={map.rows} base={BASE} query={query} at={map.at} title={map.title} measure={(row) => `${row.counts.grey} silent`} />}>
          <Side label={`The light on ${here.light.name}`} headline={<LightBadge light={here.light.light} coverage={here.light.coveragePct} />}>
            <LightCounts counts={here.light.counts} />
          </Side>
          <Side label="Trouble in the field" headline={urgent ? `${urgent} not acknowledged` : reports.length ? `${reports.length} open, all acknowledged` : "Nothing reported"} note="Critical and unacknowledged first.">
            <div className="max-h-96 overflow-auto"><IncidentList rows={reports.slice(0, 12)} caps={caps} base={BASE} query={query} empty="No report from the field is open." now={now} /></div>
          </Side>
          <Side label="Places" headline={`${here.below.length} under ${here.light.name}`}>
            <ul className="max-h-72 divide-y divide-dash-line overflow-auto">
              {here.below.map((row) => (
                <li key={row.code}>
                  <Link href={hrefWith(BASE, query, row.level === "pu" ? { unit: row.code } : { at: row.code, unit: null })} className="flex items-center gap-2 py-2 text-[0.8125rem] hover:bg-dash-bg">
                    <LightBadge light={row.light} short />
                    <span className="min-w-0 flex-1 truncate font-semibold text-dash-ink">{row.name}</span>
                    <span className="tabular-nums text-dash-muted">{row.level === "pu" ? (row.reported ? "in" : "silent") : `${formatNumber(row.counts.grey)} silent`}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Side>
        </Stage>

        <Card padded={false} id="work" title={TAB_NAME[tab]}>
          <div className="p-5 sm:p-6">
            {tab === "silent" && (
              silent.length ? (
                <ul className="divide-y divide-dash-line">
                  {silent.map((row) => (
                    <li key={row.unitCode} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[0.8125rem]">
                      <span className="min-w-0 flex-1">
                        <Link href={hrefWith(BASE, query, { unit: row.unitCode })} className="block font-semibold text-dash-ink hover:underline">{row.place}</Link>
                        <span className="block text-dash-muted">
                          {row.name} · {row.lastStep ? `last sent "${asWords(row.lastStep)}" at ${clock(row.lastUpdate)}` : "nothing sent today"}
                          {row.lastContact ? ` · last call: ${asWords(row.lastContact)}` : " · not called yet"}
                        </span>
                      </span>
                      {row.phone && (
                        <>
                          <a href={`tel:+${row.phone}`} className="font-semibold text-blue-700 hover:underline">Call +{row.phone}</a>
                          <a href={`https://wa.me/${row.phone}`} className="font-semibold text-blue-700 hover:underline">WhatsApp</a>
                        </>
                      )}
                      <Link href={hrefWith(BASE, query, { unit: row.unitCode })} className="font-semibold text-blue-700 hover:underline">Log a call</Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Every assigned polling unit here has sent its result, or no agent is assigned here yet.</Empty>
              )
            )}
            {tab === "situations" && <IncidentList rows={reports} caps={caps} base={BASE} query={query} now={now} />}
            {tab === "confirm" && <ItemList items={confirm} caps={caps} base={BASE} query={query} userId={ctx.user.id} empty="No verifier is waiting on the field." now={now} />}
            {tab === "checkins" && (
              agents.length ? (
                <>
                  <p className="mb-3 text-[0.8125rem] text-dash-muted">
                    {formatNumber(agents.filter(checkedIn).length)} of {formatNumber(agents.length)} assigned agents have signed in today. Check-in is expected by {rules.checkInBy}{now > cutoff ? ", which has passed" : ""}.
                  </p>
                  <ul className="divide-y divide-dash-line">
                    {[...agents].sort((a, b) => Number(checkedIn(a)) - Number(checkedIn(b))).map((person) => (
                      <li key={person.id} className="flex flex-wrap items-center gap-x-3 py-2 text-[0.8125rem]">
                        <span className={checkedIn(person) ? "size-2.5 rounded-full bg-light-green" : "size-2.5 rounded-full border border-light-grey"} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold text-dash-ink">{person.name}</span>
                          <span className="text-dash-muted"> · {asWords(person.role)} · {person.targetCode} · {checkedIn(person) ? `signed in ${age(person.lastSeen, now)} ago` : "not signed in today"}</span>
                        </span>
                        {person.phone && <a href={`tel:+${person.phone}`} className="font-semibold text-blue-700 hover:underline">Call</a>}
                        <Link href={hrefWith(BASE, query, { unit: person.targetCode })} className="font-semibold text-blue-700 hover:underline">Open unit</Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <Empty>No agent is assigned on this ground yet.</Empty>
              )
            )}
            {tab === "drafts" && (
              drafts.length ? (
                <ul className="divide-y divide-dash-line">
                  {drafts.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-x-3 py-2.5 text-[0.8125rem]">
                      <span className="min-w-0 flex-1"><b className="text-dash-ink">{row.place}</b> <span className="text-dash-muted">· left by {row.personName ?? "an agent"} at {clock(row.createdAt)}. It is not a result.</span></span>
                      <Link href={hrefWith(BASE, query, { unit: row.unitCode })} className="font-semibold text-blue-700 hover:underline">Open the polling unit</Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No draft has been left behind by an agent moved off a unit.</Empty>
              )
            )}
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Handover desk="field" notes={handovers} userId={ctx.user.id} />
          <div className="space-y-4">
            {ctx.holds("whatsapp:read") && (
              <Link href="/whatsapp" className="block rounded-dash border border-dash-line bg-dash-card p-4 text-[0.875rem] font-bold text-dash-ink shadow-e2 hover:border-dash-ink">
                Open the WhatsApp desk <span className="block text-[0.8125rem] font-normal text-dash-muted">Every conversation with an agent filing over WhatsApp.</span>
              </Link>
            )}
            <RaiseTech />
          </div>
        </div>
      </div>
    </RoomShell>
  );
}
