import DeskMonitor from "@/components/room/DeskMonitor";

export const metadata = { title: "Situation room", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The verifier's copy: Results, Booth and Verification, for one of their states. */
export default function Page({ searchParams }) {
  return <DeskMonitor desk="verify" backName="Verification desk" searchParams={searchParams} />;
}
