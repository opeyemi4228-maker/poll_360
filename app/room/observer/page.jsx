import DeskMonitor from "@/components/room/DeskMonitor";

export const metadata = { title: "State observer", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The state observer's home: the situation room's own dashboards, for their state alone. */
export default function Page({ searchParams }) {
  return <DeskMonitor desk="observer" backName="Items and checks" searchParams={searchParams} />;
}
