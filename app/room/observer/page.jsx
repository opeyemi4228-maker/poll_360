import Link from "next/link";

import { Badge, Card, Empty } from "@/components/dash/DashCard";
import RoomShell from "@/components/room/RoomShell";
import UnitPanel from "@/components/room/UnitPanel";
import Tabs from "@/components/room/Tabs";
import ActionForm, { Area, Submit } from "@/components/room/ActionForm";
import { Crumbs, Handover, IncidentList, ItemList, LightMap, LightTable, RaiseTech, Roster, StatusCard, age, clock, hrefWith } from "@/components/room/Panels";
import { lightsFor, openUnit, roomPage, rosterFor } from "@/lib/room/page";
import { field, items, notes } from "@/lib/room/store";
import { statesOf, touches } from "@/lib/ground";
import { STATES } from "@/lib/units";
import { asWords, cn, formatNumber } from "@/lib/utils";

export const metadata = { title: "State observer", robots: { index: false } };
export const dynamic = "force-dynamic";

const BASE = "/room/observer";

/**
 * The observer's view: the room's eyes on a state. Their ground and nothing
 * beside it, worked from coverage down to a single polling unit.
 *
 * An observer checks a result somebody else filed and resolves yellow items.
 * They do not correct figures and do not resolve red: those go to a verifier
 * and a zone lead, by the buttons that send them there.
 */
export default async function ObserverPage({ searchParams }) {
  const page = await roomPage(BASE, searchParams);
  const { ctx, query, caps, unit, trail, now } = page;
  if (!ctx.project) return <RoomShell ctx={ctx} title="State observer" />;
  const electionId = ctx.project.id;

  const mine = statesOf(ctx.ground) ?? STATES.map((state) => state.number);
  const at = page.at || mine[0] || "";
  const state = at.slice(0, 2);
  const tab = ["items", "silent", "situations", "verification", "timeline", "notes"].includes(query.tab) ? query.tab : "items";
  const scope = { zones: [], codes: at ? [at] : [] };
  const narrowed = at ? { electionId, race: ctx.race, ground: ctx.ground, under: at } : { electionId, race: ctx.race, ground: ctx.ground };

  const [here, whole, open, silent, reports, people, lines, shared, handovers, view] = await Promise.all([
    lightsFor(ctx, at),
    lightsFor(ctx, state),
    items.list({ ...narrowed, take: 300 }),
    tab === "silent" ? field.notReporting({ electionId, race: ctx.race, ground: ctx.ground, under: at }) : [],
    field.incidents({ electionId, ground: at ? scope : ctx.ground, open: tab !== "situations", take: 60 }),
    rosterFor({ at: state, roles: ["STATE_OBSERVER"] }),
    tab === "timeline" ? field.timeline({ electionId, race: ctx.race, ground: at ? scope : ctx.ground }) : null,
    tab === "notes" ? notes.list({ electionId, ground: { zones: [], codes: [state] }, take: 40 }) : [],
    notes.list({ electionId, kind: "HANDOVER", desk: `observer:${state}`, take: 5 }),
    openUnit(ctx, unit),
  ]);
  const visible = reports.filter((row) => touches(ctx.ground, row.unitCode));
  const sent = open.filter((item) => item.desk === "verify");
  const asked = open.filter((item) => item.code === "Y_FIELD_CONFIRM");
  const others = people.filter((person) => person.id !== ctx.user.id);
  const total = here.light?.total ?? 0;
  const q = { ...query, at };

  return (
    <RoomShell ctx={ctx} title="State observer" openCount={open.filter((item) => item.light === "RED").length}>
      {!mine.length ? (
        <Empty>No ground has been assigned to you yet. Your zone lead or the Super Admin does that, and this screen fills as soon as they have.</Empty>
      ) : (
        <div className="space-y-6">
          {mine.length > 1 && (
            <nav aria-label="Your states" className="flex flex-wrap gap-1">
              {mine.map((number) => (
                <Link key={number} href={hrefWith(BASE, {}, { at: number })} className={cn("rounded-dash-sm px-3 py-2 text-[0.875rem] font-semibold", number === state ? "bg-dash-ink text-white" : "bg-dash-bg text-dash-muted hover:text-dash-ink")}>
                  {STATES.find((each) => each.number === number)?.name}
                </Link>
              ))}
            </nav>
          )}

          {view && <UnitPanel view={view} caps={caps} base={BASE} query={q} userId={ctx.user.id} />}

          <div className="grid gap-6 xl:grid-cols-[24rem_1fr]">
            <div className="space-y-6">
              <StatusCard light={here.light} />
              <Card title="Also on this state" subtitle="Other observers covering it now.">
                <Roster people={others} describe={(person) => person.groundLabel} />
              </Card>
            </div>
            <Card title="Places" subtitle="Open a place to go down a level. A polling unit opens its own panel." action={<Crumbs trail={trail.length > 1 ? trail : [{ code: "", name: "Nigeria" }, { code: state, name: whole.light?.name }]} base={BASE} query={q} />}>
              <LightTable rows={[...here.below].sort((a, b) => ({ RED: 3, YELLOW: 2, GREEN: 1, GREY: 0 })[b.light] - ({ RED: 3, YELLOW: 2, GREEN: 1, GREY: 0 })[a.light])} base={BASE} query={q} />
              {at.length === 2 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-[0.8125rem] font-semibold text-blue-700">Show the country map</summary>
                  <div className="mx-auto mt-3 max-w-xl"><LightMap rows={[whole.light].filter(Boolean)} base={BASE} query={q} /></div>
                </details>
              )}
            </Card>
          </div>

          <Card padded={false}>
            <div className="px-5 pt-4 sm:px-6">
              <Tabs
                base={BASE}
                query={q}
                current={tab}
                tabs={[["items", "Items", open.length], ["silent", "Not reporting"], ["situations", "Situations", visible.filter((row) => row.status === "OPEN").length], ["verification", "Verification", sent.length], ["timeline", "Timeline"], ["notes", "Notes"]]}
              />
            </div>
            <div className="p-5 sm:p-6">
              {tab === "items" && <ItemList items={open} caps={caps} base={BASE} query={q} userId={ctx.user.id} empty="Nothing is open on this ground." now={now} />}

              {tab === "silent" && (
                silent.length ? (
                  <ul className="divide-y divide-dash-line">
                    {silent.map((row) => (
                      <li key={row.unitCode} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[0.8125rem]">
                        <span className="min-w-0 flex-1">
                          <Link href={hrefWith(BASE, q, { unit: row.unitCode })} className="block font-semibold text-dash-ink hover:underline">{row.place}</Link>
                          <span className="block text-dash-muted">
                            {row.name} · {row.lastStep ? `last sent "${asWords(row.lastStep)}" at ${clock(row.lastUpdate)}` : "nothing sent today"}
                            {row.lastContact ? ` · last call: ${asWords(row.lastContact)}` : ""}
                          </span>
                        </span>
                        {row.phone && (
                          <>
                            <a href={`tel:+${row.phone}`} className="font-semibold text-blue-700 hover:underline">Call</a>
                            <a href={`https://wa.me/${row.phone}`} className="font-semibold text-blue-700 hover:underline">WhatsApp</a>
                          </>
                        )}
                        <Link href={hrefWith(BASE, q, { unit: row.unitCode })} className="font-semibold text-blue-700 hover:underline">Log a call</Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>Every assigned polling unit here has sent its result, or no agent is assigned here yet.</Empty>
                )
              )}

              {tab === "situations" && <IncidentList rows={visible} caps={caps} base={BASE} query={q} now={now} />}

              {tab === "verification" && (
                <div className="space-y-5">
                  <p className="text-[0.875rem] text-dash-muted">
                    <b className="text-dash-ink tabular-nums">{formatNumber(sent.length)}</b> on the verification desk for this ground. You can read them here; a verifier works them.
                  </p>
                  <section>
                    <h3 className="mb-1 text-[0.875rem] font-bold text-dash-ink">A verifier is waiting on the field ({asked.length})</h3>
                    <ItemList items={asked} caps={caps} base={BASE} query={q} userId={ctx.user.id} empty="No verifier is waiting on you." now={now} />
                  </section>
                </div>
              )}

              {tab === "timeline" && lines && (
                <ol className="space-y-3">
                  {[...lines.steps.sort((a, b) => new Date(a.last) - new Date(b.last)), { step: "Result in", units: lines.results, last: lines.lastResult }].map((row) => {
                    const share = total ? Math.min(100, (row.units / total) * 100) : 0;
                    return (
                      <li key={row.step} className="text-[0.875rem]">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-semibold text-dash-ink">{asWords(row.step)}</span>
                          <span className="tabular-nums text-dash-muted">{formatNumber(row.units)} of {formatNumber(total)} units ({share.toFixed(1)}%){row.last ? ` · latest ${clock(row.last)}` : ""}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-dash-bg"><div className="h-full rounded-full bg-dash-ink" style={{ width: `${share}%` }} /></div>
                      </li>
                    );
                  })}
                  {!lines.steps.length && !lines.results && <Empty>Nothing has been sent from this ground yet today.</Empty>}
                </ol>
              )}

              {tab === "notes" && (
                <div className="space-y-4">
                  <ActionForm what="note" hidden={{ area: state }} className="space-y-2">
                    <Area label={`A note on ${whole.light?.name}, shared with the other observers and your zone lead`} name="body" rows={2} required />
                    <Submit>Add note</Submit>
                  </ActionForm>
                  {shared.length ? (
                    <ul className="divide-y divide-dash-line">
                      {shared.map((note) => (
                        <li key={note.id} className="py-2.5 text-[0.875rem]">
                          <p className="whitespace-pre-wrap text-dash-ink">{note.body}</p>
                          <p className="mt-0.5 text-[0.75rem] text-dash-muted">{note.byName} · {clock(note.at)} · {age(note.at, now)} ago</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>No notes on this state yet.</Empty>
                  )}
                </div>
              )}
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Handover desk={`observer:${state}`} notes={handovers} userId={ctx.user.id} />
            <div className="space-y-4">
              {caps.phonedIn && <p className="text-[0.875rem] text-dash-muted"><Badge tone="ink">Granted</Badge> You may enter a result read out over the phone. Open the polling unit under Not reporting and use the button there.</p>}
              <RaiseTech />
            </div>
          </div>
        </div>
      )}
    </RoomShell>
  );
}
