import DeskMonitor from "@/components/room/DeskMonitor";

export const metadata = { title: "Situation room", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The field desk's copy: Command, Situation, Timeline and Booth, for one of their states. */
export default function Page({ searchParams }) {
  return <DeskMonitor desk="field" backName="Field desk" searchParams={searchParams} />;
}
