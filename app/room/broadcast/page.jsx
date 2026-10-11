import { Card } from "@/components/dash/DashCard";
import RoomShell from "@/components/room/RoomShell";
import BroadcastPanel, { WritePost } from "@/components/room/BroadcastPanel";
import Count from "@/components/room/Count";
import GoLive from "@/components/room/GoLive";
import BvasBlock from "@/components/room/BvasBlock";
import { LightBadge } from "@/components/room/Light";
import { Crumbs, Handover, LightTable, RaiseTech } from "@/components/room/Panels";
import { lightsFor, roomPage } from "@/lib/room/page";
import { notes } from "@/lib/room/store";
import { broadcastDesk, runningCount } from "@/lib/room/desk";

export const metadata = { title: "Broadcast team", robots: { index: false } };
export const dynamic = "force-dynamic";

const BASE = "/room/broadcast";

/**
 * The broadcast team's view: the count as it may be said, and the posts
 * that say it.
 *
 * A writer writes and cannot clear. A clearer clears routine posts somebody
 * else wrote and takes the programme live. A race call or a correction is
 * shown here and cleared only by the Director or the Super Admin. No sheet
 * and no report from the field appears on this screen.
 */
export default async function BroadcastPage({ searchParams }) {
  const { ctx, query, at, trail, now } = await roomPage(BASE, searchParams);
  if (!ctx.project) return <RoomShell ctx={ctx} title="Broadcast team" />;

  const [here, desk, count, handovers] = await Promise.all([
    lightsFor(ctx, at),
    broadcastDesk(ctx.project),
    runningCount(ctx, at),
    notes.list({ electionId: ctx.project.id, kind: "HANDOVER", desk: "broadcast", take: 5 }),
  ]);
  const caps = { draft: ctx.holds("broadcast:draft"), clear: ctx.holds("broadcast:clear"), call: ctx.holds("broadcast:call"), hold: ctx.holds("broadcast:hold"), air: ctx.holds("broadcast:air") };

  return (
    <RoomShell ctx={ctx} title="Broadcast team" openCount={desk.posts.filter((item) => item.state === "REVIEW" && item.createdBy !== ctx.user.id).length}>
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
          <Card title={`The count · ${here.light.name}`} subtitle="Every figure a post carries is built from this, with the share of polling units it rests on." action={<LightBadge light={here.light.light} coverage={here.light.coveragePct} />}>
            <Crumbs trail={trail} base={BASE} query={query} />
            <div className="mt-4"><Count count={count} light={here.light} /></div>
            <details className="mt-5">
              <summary className="cursor-pointer text-[0.8125rem] font-semibold text-blue-700">Choose another place</summary>
              <LightTable rows={here.below} base={BASE} query={query} className="mt-3" />
            </details>
          </Card>
          <BvasBlock bvas={here.light.bvas} total={here.light.total} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
          <Card title="The desk" subtitle="Nobody clears what they wrote. A platform counts as sent only when it has answered.">
            <BroadcastPanel items={desk.posts} deliveries={desk.deliveries} caps={caps} userId={ctx.user.id} live={desk.live} now={now} take={20} />
          </Card>
          <div className="space-y-6">
            {caps.draft && (
              <Card title="Write a post">
                <WritePost at={at} placeLabel={here.light.name} />
              </Card>
            )}
            {caps.air && (
              <Card title="Live broadcast" subtitle="Opens the programme on Facebook and YouTube.">
                <GoLive projectTitle={ctx.project.title} />
              </Card>
            )}
            <Handover desk="broadcast" notes={handovers} userId={ctx.user.id} />
            <RaiseTech />
          </div>
        </div>
      </div>
    </RoomShell>
  );
}
