import RoomScreen from "./screen";
import { viewing } from "@/lib/viewing";

export const metadata = { title: "Situation room", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The situation room itself: the whole screen, over the ground this account holds. */
export default async function RoomPage() {
  return <RoomScreen view={await viewing("/room")} />;
}
