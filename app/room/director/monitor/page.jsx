import DeskMonitor from "@/components/room/DeskMonitor";

export const metadata = { title: "Situation room", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The Director's copy of the situation room: the whole project, and the broadcast head. */
export default function Page({ searchParams }) {
  return <DeskMonitor desk="director" backName="Director's console" searchParams={searchParams} />;
}
