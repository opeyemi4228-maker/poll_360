import RoomScreen from "@/app/room/screen";
import DeskBar from "./DeskBar";
import { deskMonitor, deskPath, monitorPath } from "@/lib/room/monitor";

/**
 * A desk's copy of the situation room: the real screen, narrowed to the
 * desk's ground and to the heads and tabs that are the desk's business.
 */
export default async function DeskMonitor({ desk, backName, searchParams }) {
  const room = await deskMonitor(desk, searchParams);
  return (
    <RoomScreen
      view={room.view}
      heads={room.heads}
      views={room.views}
      inecUnder={room.inecUnder}
      /* A desk opens on the first dashboard it was given: Command, where it has it. */
      landing={room.views ? room.views[0] : "command"}
      deskBar={<DeskBar desk={{ name: backName, href: deskPath(desk) }} states={room.states} base={monitorPath(desk)} />}
    />
  );
}
