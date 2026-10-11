import BigMap from "@/components/room/BigMap";
import BvasBlock from "@/components/room/BvasBlock";
import Stage, { Side, StatRow } from "@/components/room/Stage";
import { LightCounts } from "@/components/room/Light";
import { countLayer, mapFor } from "@/lib/room/page";
import Link from "next/link";

import { Card, Empty } from "@/components/dash/DashCard";
import RoomShell from "@/components/room/RoomShell";
import UnitPanel from "@/components/room/UnitPanel";
import GroundForm from "@/components/room/Ground";
import { LightBadge } from "@/components/room/Light";
import { Handover, ItemList, RaiseTech, hrefWith } from "@/components/room/Panels";
import { lightsFor, openUnit, roomPage, rosterFor } from "@/lib/room/page";
import { field, items, notes, submissions } from "@/lib/room/store";
import { rolesOf } from "@/lib/roles";
import { cn, formatNumber } from "@/lib/utils";

export const metadata = { title: "Verification", robots: { index: false } };
export const dynamic = "force-dynamic";

const BASE = "/room/verify";
const TAB_NAME = { queue: "The queue", second: "Corrections awaiting a second check", mine: "Taken by me", disputed: "Disputed and escalated", agents: "Sent by agents, not counted", team: "Verifiers" };

/**
 * The verification desk: a queue, and beside each row the sheet it is about.
 *
 * A verifier takes an item (which locks it to them for a few minutes), opens
 * the polling unit, reads the photographed sheet against the figures, and
 * either says they match, corrects a figure, or sends it up. A correction
 * waits for a different verifier. A lead verifier also holds the disputed
 * results, the second-check backlog and where each verifier works.
 */
export default async function VerifyPage({ searchParams }) {
  const { ctx, query, caps, at, unit, now } = await roomPage(BASE, searchParams);
  if (!ctx.project) return <RoomShell ctx={ctx} title="Verification" />;
  const electionId = ctx.project.id;
  const lead = rolesOf(ctx.user).some((role) => role === "LEAD_VERIFIER" || role === "SUPER_ADMIN");
  const tab = ["queue", "second", "mine", "disputed", "agents", "team"].includes(query.tab) ? query.tab : "queue";

  const [states, queue, waiting, speed, verifiers, handovers, view] = await Promise.all([
    lightsFor(ctx, ""),
    items.list({ electionId, race: ctx.race, ground: ctx.ground, under: at, desk: "verify", take: 400 }),
    submissions.open({ electionId, ground: ctx.ground }),
    field.throughput({ electionId, race: ctx.race, ground: ctx.ground }),
    lead ? rosterFor({ roles: ["VERIFIER", "LEAD_VERIFIER"] }) : [],
    notes.list({ electionId, kind: "HANDOVER", desk: "verify", take: 5 }),
    openUnit(ctx, unit),
  ]);
  const second = queue.filter((item) => item.code === "Y_AWAITING_SECOND_CHECK");
  const disputed = queue.filter((item) => item.code === "R_DISPUTED" || item.escalatedTo === "LEAD_VERIFIER");
  const mine = queue.filter((item) => item.ownerId === ctx.user.id);
  const first = queue.filter((item) => item.code !== "Y_AWAITING_SECOND_CHECK" && item.code !== "R_DISPUTED");
  const shown = { queue: first, second, mine, disputed }[tab] ?? [];
  const here = at ? await lightsFor(ctx, at) : null;
  const focus = here?.light ?? states.light;
  const map = await mapFor(ctx, at, states, at.length === 2 ? here : null);

  return (
    <RoomShell ctx={ctx} title="Verification" openCount={first.length + second.length} current={tab}
      summary={`${formatNumber(first.length)} in the queue, ${formatNumber(second.length)} corrections awaiting a second check, ${formatNumber(mine.length)} taken by you`}
      tabs={[["queue", "Queue", first.length], ["second", "Second checks", second.length], ["mine", "Taken by me", mine.length], ...(lead ? [["disputed", "Disputed and escalated", disputed.length]] : []), ["agents", "From agents", waiting.length], ...(lead ? [["team", "Verifiers"]] : [])].map(([id, name, count]) => ({ id, name, count, href: hrefWith(BASE, { at: query.at }, { tab: id }) }))}>
      <div className="space-y-3">
        <StatRow stats={[
          { label: "Waiting in the queue", value: formatNumber(first.length), note: at ? `in ${focus.name}` : "across your states", tone: first.length ? "yellow" : "green" },
          { label: "Corrections awaiting a second check", value: formatNumber(second.length), note: "a different verifier must look", tone: second.length ? "yellow" : "green" },
          { label: "Results checked, last hour", value: formatNumber(speed.checked), note: "by everybody on this ground" },
          { label: "Items resolved, last hour", value: formatNumber(speed.closed), note: `${formatNumber(mine.length)} taken by you now` },
        ]} />

        <Stage map={<BigMap rows={map.rows} base={BASE} query={query} at={map.at} title={map.title} layers={[countLayer({ id: "queue", name: TAB_NAME[tab], codes: (tab === "agents" ? waiting.map((row) => row.unitCode) : (tab === "team" ? first : shown).map((item) => item.areaCode)), word: "waiting", many: 10 })]} />}>
          <Side label={`The light on ${focus.name}`} headline={<LightBadge light={focus.light} coverage={focus.coveragePct} />}>
            <LightCounts counts={focus.counts} />
            <BvasBlock bvas={focus.bvas} total={focus.total} className="mt-3 border-0 bg-dash-bg p-4" />
          </Side>
          <Side label="Backlog by state" headline={speed.backlog.length ? `${formatNumber(speed.backlog.reduce((sum, row) => sum + row.waiting, 0))} waiting to be checked` : "Nothing waiting"} note="Tap a state on the map or here to narrow the queue.">
            <ul className="max-h-72 divide-y divide-dash-line overflow-auto text-[0.8125rem]">
              <li><Link href={hrefWith(BASE, query, { at: null, unit: null })} className={cn("flex justify-between py-2 font-semibold", !at ? "text-dash-ink" : "text-blue-700")}>All my states</Link></li>
              {speed.backlog.map((row) => (
                <li key={row.state}>
                  <Link href={hrefWith(BASE, query, { at: row.state, unit: null })} className="flex justify-between py-2 hover:bg-dash-bg">
                    <span className={cn("font-semibold", at === row.state ? "text-dash-ink underline" : "text-dash-ink")}>{row.name}</span>
                    <span className="tabular-nums text-dash-muted">{formatNumber(row.waiting)} waiting</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Side>
        </Stage>

        {view && <UnitPanel view={view} caps={caps} base={BASE} query={query} userId={ctx.user.id} roster={verifiers} />}

        <Card padded={false} id="work" title={TAB_NAME[tab]}>
          <div className="p-5 sm:p-6">
            {tab === "agents" ? (
              waiting.length ? (
                <ul className="divide-y divide-dash-line">
                  {waiting.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-x-3 py-2.5 text-[0.8125rem]">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-dash-ink">{row.kind === "CONFLICTING_SUBMISSION" ? "A second agent filed different figures" : row.kind === "ORPHANED_DRAFT" ? "Draft left by an agent moved off the unit" : "An agent asked for a correction"}</span>
                        <span className="block text-dash-muted">{row.place} · {row.personName ?? "An agent"}</span>
                      </span>
                      <Link href={hrefWith(BASE, query, { unit: row.unitCode })} className="font-semibold text-blue-700 hover:underline">Open the polling unit</Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Nothing from agents is waiting. A second agent&apos;s differing figures, and requests to correct, appear here. None of them is ever counted as a result.</Empty>
              )
            ) : tab === "team" ? (
              <div className="space-y-5">
                <section>
                  <h3 className="mb-1 text-[0.875rem] font-bold text-dash-ink">Backlog by state</h3>
                  {speed.backlog.length ? (
                    <ul className="text-[0.8125rem]">
                      {speed.backlog.map((row) => <li key={row.state} className="flex justify-between border-b border-dash-line py-1.5 last:border-0"><span className="font-semibold text-dash-ink">{row.name}</span><span className="tabular-nums text-dash-muted">{formatNumber(row.waiting)} waiting</span></li>)}
                    </ul>
                  ) : (
                    <p className="text-[0.8125rem] text-dash-muted">Nothing is waiting to be checked.</p>
                  )}
                </section>
                <section>
                  <h3 className="mb-1 text-[0.875rem] font-bold text-dash-ink">Where each verifier works</h3>
                  <ul className="divide-y divide-dash-line">
                    {verifiers.map((person) => (
                      <li key={person.id} className="py-3">
                        <details>
                          <summary className="cursor-pointer list-none text-[0.875rem]"><b className="text-dash-ink">{person.name}</b> <span className="text-dash-muted">· {person.online ? "online" : "away"} · {person.groundLabel} · {person.openItems} open</span></summary>
                          <div className="mt-3 rounded-dash-sm bg-dash-bg p-3"><GroundForm person={person} states={states.below.map((row) => ({ code: row.code, name: row.name }))} /></div>
                        </details>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            ) : (
              <ItemList items={shown} caps={caps} base={BASE} query={query} roster={verifiers} userId={ctx.user.id} now={now}
                empty={tab === "second" ? "No correction is waiting for a second check." : tab === "mine" ? "You have not taken anything. Take an item from the queue to lock it to you." : "The queue is empty."} />
            )}
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Handover desk="verify" notes={handovers} userId={ctx.user.id} />
          <RaiseTech />
        </div>
      </div>
    </RoomShell>
  );
}
