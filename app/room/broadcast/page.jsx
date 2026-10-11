import { Card } from "@/components/dash/DashCard";
import RoomShell from "@/components/room/RoomShell";
import BigMap from "@/components/room/BigMap";
import BroadcastPanel, { WritePost } from "@/components/room/BroadcastPanel";
import BvasBlock from "@/components/room/BvasBlock";
import Count from "@/components/room/Count";
import GoLive from "@/components/room/GoLive";
import Stage, { Side, StatRow } from "@/components/room/Stage";
import { LightBadge } from "@/components/room/Light";
import { Crumbs, Handover, RaiseTech, hrefWith } from "@/components/room/Panels";
import { lightsFor, mapFor, roomPage } from "@/lib/room/page";
import { notes } from "@/lib/room/store";
import { broadcastDesk, runningCount } from "@/lib/room/desk";

export const metadata = { title: "Broadcast team", robots: { index: false } };
export const dynamic = "force-dynamic";

const BASE = "/room/broadcast";

/**
 * The broadcast team's view: the count as it may be said, on the map, and
 * the posts that say it.
 *
 * A writer writes and cannot clear. A clearer clears routine posts somebody
 * else wrote and takes the programme live. A race call or a correction is
 * shown here and cleared only by the Director or the Super Admin. No sheet
 * and no report from the field appears on this screen.
 */
export default async function BroadcastPage({ searchParams }) {
  const { ctx, query, at, trail, now } = await roomPage(BASE, searchParams);
  if (!ctx.project) return <RoomShell ctx={ctx} title="Broadcast team" />;

  const [nation, here, desk, count, handovers] = await Promise.all([
    lightsFor(ctx, ""),
    at ? lightsFor(ctx, at) : null,
    broadcastDesk(ctx.project),
    runningCount(ctx, at),
    notes.list({ electionId: ctx.project.id, kind: "HANDOVER", desk: "broadcast", take: 5 }),
  ]);
  const focus = here?.light ?? nation.light;
  const map = await mapFor(ctx, at, nation, at.length === 2 ? here : null);
  const caps = { draft: ctx.holds("broadcast:draft"), clear: ctx.holds("broadcast:clear"), call: ctx.holds("broadcast:call"), hold: ctx.holds("broadcast:hold"), air: ctx.holds("broadcast:air") };
  const waiting = desk.posts.filter((item) => item.state === "REVIEW");
  const cleared = desk.posts.filter((item) => item.state === "CLEARED");
  const out = desk.posts.filter((item) => item.state === "ON_AIR");
  const leader = count.parties[0];
  const tab = query.tab === "desk" ? "desk" : "count";

  return (
    <RoomShell
      ctx={ctx}
      title="Broadcast team"
      openCount={waiting.filter((item) => item.createdBy !== ctx.user.id).length}
      current={tab}
      summary={count.units ? `${focus.name}: ${focus.coveragePct.toFixed(1)}% counted${leader ? `, ${leader.party} in front on ${leader.share.toFixed(1)}%` : ""}. ${waiting.length} waiting for clearance.` : "No returns yet. The count starts with the first result."}
      tabs={[["count", "The count"], ["desk", caps.draft ? "Desk and writing" : "The desk", waiting.length]].map(([id, name, count]) => ({ id, name, count, href: hrefWith(BASE, { at: query.at }, { tab: id === "count" ? null : id }) }))}
    >
      <div className="space-y-3">
        <StatRow
          stats={[
            { label: `Counted in ${focus.name}`, value: `${focus.coveragePct.toFixed(1)}%`, note: `${focus.reported.toLocaleString("en")} of ${focus.total.toLocaleString("en")} polling units` },
            { label: "Waiting for clearance", value: String(waiting.length), note: waiting.length ? "somebody other than the writer clears" : "nothing waiting", tone: waiting.length ? "yellow" : "green" },
            { label: "Cleared, not sent", value: String(cleared.length), note: cleared.length ? "ready to publish" : "nothing held" },
            { label: "Published", value: String(out.length), note: desk.live ? "a live broadcast is on" : "no live broadcast is on" },
          ]}
        />

        {tab === "count" && (
          <>
            <Stage map={<BigMap rows={map.rows} base={BASE} query={query} at={map.at} title={map.title} hint="Tap a place to make its card" measure={(row) => `${row.coveragePct.toFixed(row.coveragePct < 10 ? 1 : 0)}% in`} />}>
              <Side label={`The count · ${focus.name}`} headline={<LightBadge light={focus.light} coverage={focus.coveragePct} />} note="Every figure a post carries is built from this.">
                <Crumbs trail={trail} base={BASE} query={query} />
                <div className="mt-3"><Count count={count} light={focus} /></div>
              </Side>
              <BvasBlock bvas={focus.bvas} total={focus.total} />
            </Stage>
          </>
        )}

        {tab === "desk" && (
          <>
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_23.5rem]">
              <Card id="desk" title="The desk" subtitle="Nobody clears what they wrote. A platform counts as sent only when it has answered.">
                <BroadcastPanel items={desk.posts} deliveries={desk.deliveries} caps={caps} userId={ctx.user.id} live={desk.live} now={now} take={20} />
              </Card>
              <div className="space-y-3">
                {caps.draft && (
                  <Card id="write" title="Write a post">
                    <WritePost at={at} placeLabel={focus.name} />
                  </Card>
                )}
                {caps.air && (
                  <Card id="live" title="Live broadcast" subtitle="Opens the programme on Facebook and YouTube.">
                    <GoLive projectTitle={ctx.project.title} />
                  </Card>
                )}
                <Handover desk="broadcast" notes={handovers} userId={ctx.user.id} />
                <RaiseTech />
              </div>
            </div>
          </>
        )}
      </div>
    </RoomShell>
  );
}
