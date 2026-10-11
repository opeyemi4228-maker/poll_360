import Link from "next/link";
import { Gavel } from "lucide-react";

import { Badge, Card, Empty } from "@/components/dash/DashCard";
import RoomShell from "@/components/room/RoomShell";
import UnitPanel from "@/components/room/UnitPanel";
import ActionForm, { Area, Field, Submit } from "@/components/room/ActionForm";
import { LightIcon } from "@/components/room/Light";
import { Crumbs, Handover, LightTable, RaiseTech, StatusCard, ThreeRecords, age, clock, hrefWith } from "@/components/room/Panels";
import { lightsFor, openUnit, roomPage } from "@/lib/room/page";
import { items, lights, notes, packs, trail } from "@/lib/room/store";
import { threeRecords } from "@/lib/room/desk";
import { asWords } from "@/lib/utils";

export const metadata = { title: "Legal and evidence", robots: { index: false } };
export const dynamic = "force-dynamic";

const BASE = "/room/legal";

/**
 * The legal desk reads everything and changes nothing in the count. Its one
 * act is building an evidence pack: chosen items, each with the result as it
 * stands, every correction made to it and the history of the place, sealed
 * with a hash of its own contents for the long wait before a tribunal.
 */
export default async function LegalPage({ searchParams }) {
  const { ctx, query, at, unit, trail: crumbs, now } = await roomPage(BASE, searchParams);
  if (!ctx.project) return <RoomShell ctx={ctx} title="Legal and evidence" />;
  const electionId = ctx.project.id;
  /* Reads sheets and figures. Holds no power to check, correct or resolve. */
  const caps = { sheets: ctx.holds("sheets:read") };

  const [here, marked, sent, red, built, record, lines, handovers, view] = await Promise.all([
    lightsFor(ctx, at),
    lights.malpractice({ electionId, race: ctx.race }),
    items.list({ electionId, race: ctx.race, status: null, legal: true, take: 200 }),
    items.list({ electionId, race: ctx.race, light: "RED", under: at, take: 200 }),
    packs.list(electionId),
    threeRecords(ctx, at),
    trail.byKind(["item:", "result:", "correction:", "evidence:", "assignment:"], 80),
    notes.list({ electionId, kind: "HANDOVER", desk: "legal", take: 5 }),
    openUnit(ctx, unit),
  ]);
  const choices = [...new Map([...sent, ...marked, ...red].map((item) => [item.id, item])).values()];

  return (
    <RoomShell ctx={ctx} title="Legal and evidence" openCount={sent.filter((item) => item.status === "OPEN").length}>
      <div className="space-y-6">
        {view && <UnitPanel view={view} caps={caps} base={BASE} query={query} userId={ctx.user.id} />}

        <div className="grid gap-6 xl:grid-cols-[24rem_1fr]">
          <StatusCard light={here.light} />
          <Card title="Places" action={<Crumbs trail={crumbs} base={BASE} query={query} />}>
            <LightTable rows={here.below} base={BASE} query={query} />
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title={`Malpractice confirmed (${marked.length})`} subtitle="A permanent marker. It stays on the polling unit after its light changes.">
            {marked.length ? (
              <ul className="max-h-96 divide-y divide-dash-line overflow-auto">
                {marked.map((item) => (
                  <li key={item.id} className="py-2.5 text-[0.8125rem]">
                    <Link href={hrefWith(BASE, query, { unit: item.level === "pu" ? item.areaCode : null, at: item.level === "pu" ? query.at : item.areaCode })} className="flex items-center gap-2 font-semibold text-dash-ink hover:underline">
                      <Gavel size={14} className="text-light-red" aria-hidden="true" /> {item.title}
                    </Link>
                    <p className="text-dash-muted">{item.place} · confirmed by {item.resolvedName} at {clock(item.resolvedAt)}</p>
                    {item.resolutionNote && <p className="text-dash-ink">{item.resolutionNote}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon={Gavel}>Nothing has been confirmed as malpractice.</Empty>
            )}
          </Card>

          <Card title="Three records" subtitle="Our agents, INEC's sheets and the announcement, on the polling units both sides hold.">
            <ThreeRecords account={record} base={BASE} query={query} />
          </Card>
        </div>

        <Card title="Build an evidence pack" subtitle="Tick what goes in. The pack is sealed when it is built and cannot be changed afterwards.">
          {choices.length ? (
            <ActionForm what="pack" className="space-y-3" done={"Built and sealed. It is in the list below."}>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Title" name="title" required maxLength={140} placeholder="Kano Municipal, over-voting, 14 polling units" />
                <Area label="Note for whoever opens it" name="note" rows={1} />
              </div>
              <ul className="max-h-96 divide-y divide-dash-line overflow-auto rounded-dash-sm border border-dash-line">
                {choices.map((item) => (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-[0.8125rem] hover:bg-dash-bg">
                      <input type="checkbox" name="items" value={item.id} className="mt-1" />
                      <LightIcon light={item.light} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-dash-ink">{item.title}</span>
                        <span className="block text-dash-muted">{item.place} · {item.says} · {item.status === "OPEN" ? `open ${age(item.openedAt, now)}` : `${asWords(item.resolution ?? "resolved")} by ${item.resolvedName ?? "Poll360"}`}</span>
                      </span>
                      {item.legal && <Badge tone="ink">Sent to legal</Badge>}
                    </label>
                  </li>
                ))}
              </ul>
              <Submit>Build and seal the pack</Submit>
            </ActionForm>
          ) : (
            <Empty>There is nothing to put in a pack yet. Red items, items sent to legal and confirmed malpractice appear here.</Empty>
          )}
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title={`Evidence packs (${built.length})`} subtitle="Each carries the fingerprint of its own contents.">
            {built.length ? (
              <ul className="divide-y divide-dash-line">
                {built.map((pack) => (
                  <li key={pack.id} className="py-2.5 text-[0.8125rem]">
                    <a href={`/api/room/pack/${pack.id}`} className="font-semibold text-blue-700 hover:underline">{pack.title}</a>
                    <p className="text-dash-muted">Sealed by {pack.builtName} at {clock(pack.at)}</p>
                    <p className="font-mono text-[0.75rem] break-all text-dash-muted">SHA-256 {pack.hash}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No pack has been built yet.</Empty>
            )}
          </Card>
          <Card title="Evidence trail" subtitle="Who did what to a result or an item, and when. Read only.">
            {lines.length ? (
              <ul className="max-h-96 divide-y divide-dash-line overflow-auto text-[0.8125rem]">
                {lines.map((line) => (
                  <li key={line.id} className="py-2">
                    <span className="font-semibold text-dash-ink">{asWords(line.action.replace(":", " "))}</span>
                    <span className="text-dash-muted"> · {line.subject} · {line.actor ?? "Poll360"} · {clock(line.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing has been recorded yet.</Empty>
            )}
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Handover desk="legal" notes={handovers} userId={ctx.user.id} />
          <RaiseTech />
        </div>
      </div>
    </RoomShell>
  );
}
