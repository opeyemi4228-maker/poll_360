import DeskMonitor from "@/components/room/DeskMonitor";

export const metadata = { title: "Situation room", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The legal desk's copy: Results, Situation and Verification. */
export default function Page({ searchParams }) {
  return <DeskMonitor desk="legal" backName="Legal desk" searchParams={searchParams} />;
}
