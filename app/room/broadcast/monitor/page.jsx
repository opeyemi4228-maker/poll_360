import DeskMonitor from "@/components/room/DeskMonitor";

export const metadata = { title: "Situation room", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The broadcast team's copy: Command, Results, Turnout, and the broadcast head. */
export default function Page({ searchParams }) {
  return <DeskMonitor desk="broadcast" backName="Broadcast desk" searchParams={searchParams} />;
}
