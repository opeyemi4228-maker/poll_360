import RoomShell from "@/components/room/RoomShell";
import Overview, { OVERVIEW_TABS, overviewData } from "@/components/room/Overview";
import { roomPage } from "@/lib/room/page";

export const metadata = { title: "Director's console", robots: { index: false } };
export const dynamic = "force-dynamic";

const BASE = "/room/director";

const summaryOf = (light) =>
  light.reported
    ? `${light.reported.toLocaleString("en")} of ${light.total.toLocaleString("en")} polling units in, ${light.counts.red} red, ${light.counts.yellow} yellow, ${light.checked.toLocaleString("en")} checked`
    : "No returns yet. This fills as the first results arrive.";

/**
 * The Director's console. No analytics, no planning, no editing of a vote or
 * a BVAS figure, and no assigning of agents: those are other desks' work. A
 * Super Admin who opens it reads it with their own powers.
 */
export default async function DirectorPage({ searchParams }) {
  const { ctx, query, caps, at, unit, trail } = await roomPage(BASE, searchParams);
  if (!ctx.project) return <RoomShell ctx={ctx} title="Director's console" />;
  const data = await overviewData({ ctx, at, unit, deskName: "director" });
  return (
    <RoomShell ctx={ctx} title="Director's console" openCount={data.inbox.length} tabs={OVERVIEW_TABS(BASE)} current="command" summary={summaryOf(data.nation.light)}>
      <Overview ctx={ctx} base={BASE} query={query} caps={caps} at={at} crumbs={trail} deskName="director" data={data} />
    </RoomShell>
  );
}
