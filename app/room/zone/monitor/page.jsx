import DeskMonitor from "@/components/room/DeskMonitor";

export const metadata = { title: "Situation room", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The zone lead's copy of the situation room, one state of the zone at a time. */
export default function Page({ searchParams }) {
  return <DeskMonitor desk="zone" backName="Zone lead desk" searchParams={searchParams} />;
}
