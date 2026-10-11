import { Badge, Card, Empty } from "@/components/dash/DashCard";
import RoomShell from "@/components/room/RoomShell";
import ActionForm, { Area, Choice, Field, Submit } from "@/components/room/ActionForm";
import { Coverage, LightBadge, LightCounts } from "@/components/room/Light";
import { Handover, age, clock } from "@/components/room/Panels";
import { lightsFor, roomPage } from "@/lib/room/page";
import { notes, staff, tech, trail } from "@/lib/room/store";
import { cacheStats } from "@/lib/cache";
import { asWords, formatNumber } from "@/lib/utils";

export const metadata = { title: "Technical operations", robots: { index: false } };
export const dynamic = "force-dynamic";

const BASE = "/room/tech";
const STATUS = [["OPEN", "Open"], ["WORKING", "Being worked on"], ["WATCHING", "Fixed, being watched"], ["CLOSED", "Closed"]];

/**
 * The technical desk watches the thing running the count, not the count.
 *
 * So it is shown how much is flowing and from where, and never a vote
 * figure: no party totals, no sheet, no BVAS number. The lights are here as
 * counts of polling units, because a state that has gone silent is a
 * technical fact before it is an electoral one.
 */
export default async function TechPage({ searchParams }) {
  const { ctx, now } = await roomPage(BASE, searchParams);
  if (!ctx.project) return <RoomShell ctx={ctx} title="Technical operations" />;
  const security = ctx.holds("security:act");

  const [flow, incidents, states, light, sessions, blocked, lines, handovers] = await Promise.all([
    tech.flow(ctx.project.id),
    tech.list(),
    lightsFor(ctx, ""),
    tech.light(),
    security ? staff.sessions(150) : [],
    security ? tech.blocked() : [],
    trail.byKind(["security:", "access:denied", "capability:denied", "auth:"], 60),
    notes.list({ electionId: ctx.project.id, kind: "HANDOVER", desk: "tech", take: 5 }),
  ]);
  let cache = null;
  try {
    cache = cacheStats();
  } catch {
    cache = null;
  }
  const open = incidents.filter((row) => row.status !== "CLOSED");
  const figure = (label, value, note) => (
    <div key={label} className="rounded-dash border border-dash-line bg-dash-card p-4 shadow-e2">
      <p className="font-display text-[1.75rem] leading-none font-extrabold text-dash-ink tabular-nums">{value}</p>
      <p className="mt-1.5 text-[0.8125rem] font-semibold text-dash-ink">{label}</p>
      {note && <p className="text-[0.75rem] text-dash-muted">{note}</p>}
    </div>
  );

  return (
    <RoomShell ctx={ctx} title="Technical operations" openCount={open.length}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {figure("System light", light === "GREEN" ? "✔ Normal" : light === "AMBER" ? "▲ Incident" : "✖ Critical", "What every top bar in the room shows")}
          {figure("Results received", formatNumber(flow.results), flow.lastResult ? `latest ${clock(flow.lastResult)} · ${age(flow.lastResult, now)} ago` : "none yet")}
          {figure("Results a minute", flow.perMinute, "over the last ten minutes")}
          {figure("Sheets read", flow.sheetsRead == null ? "Not held" : formatNumber(flow.sheetsRead), flow.sheetsRecent != null ? `${formatNumber(flow.sheetsRecent)} in the last ten minutes` : null)}
          {figure("Waiting for Data Bank", flow.waitingForDataBank == null ? "Not held" : formatNumber(flow.waitingForDataBank), "kept, and sent again safely")}
          {figure("Open reports from the field", formatNumber(flow.openReports), "a count; the reports are not shown here")}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title={`Technical incidents (${open.length} open)`} subtitle="Anybody in the room can raise one. A critical one turns every system light red and reaches the Director.">
            <ActionForm what="techRaise" className="mb-4 grid gap-2 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
              <Field label="What is wrong, in a line" name="title" required maxLength={140} />
              <Choice label="How bad" name="severity" options={[["MINOR", "Minor"], ["MAJOR", "Major"], ["CRITICAL", "Critical"]]} />
              <Submit>Raise</Submit>
            </ActionForm>
            {incidents.length ? (
              <ul className="divide-y divide-dash-line">
                {incidents.map((row) => (
                  <li key={row.id} className="py-3">
                    <details open={row.status !== "CLOSED" && row.severity === "CRITICAL"}>
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-[0.875rem]">
                        <Badge tone={row.severity === "CRITICAL" ? "alert" : row.severity === "MAJOR" ? "warn" : "neutral"}>{asWords(row.severity)}</Badge>
                        <span className="min-w-0 flex-1 font-semibold text-dash-ink">{row.title}</span>
                        <span className="text-[0.8125rem] text-dash-muted">{asWords(row.status)} · {row.raisedName} · {age(row.at, now)}</span>
                      </summary>
                      <div className="mt-2 space-y-2 rounded-dash-sm bg-dash-bg p-3 text-[0.8125rem]">
                        {row.detail && <p className="whitespace-pre-wrap text-dash-ink">{row.detail}</p>}
                        {row.updates.map((update, index) => (
                          <p key={index} className="text-dash-muted">{clock(update.at)} · {update.by} · {asWords(update.status)}{update.note ? ` · ${update.note}` : ""}</p>
                        ))}
                        {row.status !== "CLOSED" && (
                          <ActionForm what="techUpdate" hidden={{ id: row.id }} className="grid gap-2 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
                            <Choice label="Where it stands" name="status" defaultValue={row.status} options={STATUS} />
                            <Area label="Update" name="note" rows={1} />
                            <Submit variant="dashOutline">Save</Submit>
                          </ActionForm>
                        )}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No technical incident has been raised.</Empty>
            )}
          </Card>

          <Card title="Flow by state" subtitle="Polling units reporting, as counts. No vote figure appears on this screen.">
            <ul className="max-h-[34rem] divide-y divide-dash-line overflow-auto">
              {states.below.map((row) => (
                <li key={row.code} className="py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[0.875rem] font-semibold text-dash-ink">{row.name}</span>
                    <span className="flex items-center gap-3"><LightCounts counts={row.counts} className="text-[0.75rem]" /><LightBadge light={row.light} short /></span>
                  </div>
                  <Coverage reported={row.reported} total={row.total} className="mt-1.5" />
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {cache && (
          <Card title="This server" subtitle="How the shared board cache is doing on the machine that answered this page.">
            <dl className="grid grid-cols-2 gap-3 text-[0.8125rem] sm:grid-cols-4">
              {Object.entries(cache).filter(([, value]) => typeof value === "number").map(([key, value]) => (
                <div key={key}><dt className="text-dash-muted">{asWords(key)}</dt><dd className="font-bold text-dash-ink tabular-nums">{formatNumber(Math.round(value * 100) / 100)}</dd></div>
              ))}
            </dl>
          </Card>
        )}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Security events" subtitle="Refused doors, ended sessions, blocked addresses.">
            {lines.length ? (
              <ul className="max-h-96 divide-y divide-dash-line overflow-auto text-[0.8125rem]">
                {lines.map((line) => (
                  <li key={line.id} className="py-2">
                    <span className="font-semibold text-dash-ink">{asWords(line.action.replace(":", " "))}</span>
                    <span className="text-dash-muted"> · {line.actor ?? "unknown"} · {line.subject} · {line.ip ?? "no address"} · {clock(line.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No security event has been recorded.</Empty>
            )}
          </Card>

          {security ? (
            <Card title="Sessions and addresses" subtitle="End every session a person has open, or stop an address reaching the product.">
              <ActionForm what="block" className="grid gap-2 sm:grid-cols-[11rem_1fr_auto] sm:items-end">
                <Field label="Internet address" name="ip" required placeholder="102.89.0.1" />
                <Field label="Why" name="reason" required />
                <Submit>Block</Submit>
              </ActionForm>
              {blocked.length > 0 && (
                <ul className="mt-3 divide-y divide-dash-line text-[0.8125rem]">
                  {blocked.map((row) => (
                    <li key={row.ip} className="flex flex-wrap items-center gap-x-3 py-2">
                      <span className="font-mono font-semibold text-dash-ink">{row.ip}</span>
                      <span className="min-w-0 flex-1 text-dash-muted">{row.reason} · {row.byName} · {clock(row.at)}</span>
                      <ActionForm what="unblock" hidden={{ ip: row.ip }}><Submit variant="dashOutline">Unblock</Submit></ActionForm>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="mt-5 mb-1 text-[0.875rem] font-bold text-dash-ink">Signed in now ({sessions.length})</h3>
              <ul className="max-h-80 divide-y divide-dash-line overflow-auto text-[0.8125rem]">
                {[...new Map(sessions.map((row) => [row.userId, row])).values()].map((row) => (
                  <li key={row.userId} className="flex flex-wrap items-center gap-x-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-dash-ink">{row.name}</span>
                      <span className="text-dash-muted"> · {asWords(row.role)} · {sessions.filter((each) => each.userId === row.userId).length} open · since {clock(row.since)}</span>
                    </span>
                    {row.userId !== ctx.user.id && (
                      <ActionForm what="endSessions" hidden={{ user: row.userId }} confirm={`End every session ${row.name} has open? They will have to sign in again.`}><Submit variant="dashOutline">End sessions</Submit></ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card title="Sessions and addresses">
              <Empty>Ending sessions and blocking addresses is for technical security and the Super Admin.</Empty>
            </Card>
          )}
        </div>

        <Handover desk="tech" notes={handovers} userId={ctx.user.id} />
      </div>
    </RoomShell>
  );
}
