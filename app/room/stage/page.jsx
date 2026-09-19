import { viewing } from "@/lib/viewing";
import { can } from "@/lib/roles";
import { redirect } from "next/navigation";
import { results, broadcastItems } from "@/lib/db";
import { byState, rollUp, clearance } from "@/lib/broadcast";
import { states2023 } from "@/lib/election2023";
import { STATES } from "@/lib/units";
import { raceLabel as labelFor } from "@/lib/races";
import { nowWAT } from "@/lib/stamp";
import LiveRefresh from "@/components/dash/LiveRefresh";
import Stage from "@/components/dash/broadcast/Stage";

export const metadata = { title: "Stage", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The stage: the picture a camera, an encoder or a projector points at.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A STUDIO NEEDS ONE SCREEN THAT IS NOT A DASHBOARD
 *
 *  Everything else in this product is built to be worked at: tabs, filters,
 *  buttons, queues. None of that can go out on a broadcast. What a programme
 *  needs is the opposite — one full-bleed picture at sixteen by nine, with
 *  nothing on it that is not meant to be seen by an audience, updating itself
 *  without anybody touching the machine.
 *
 *  That is this page. Open it in a second window, drop it into OBS as a
 *  browser source at 1920×1080, or put it on the wall behind a presenter.
 *
 *  ── WHAT IT MAY SHOW, AND WHAT IT MAY NOT ────────────────────────────────
 *  Only figures that have been cleared for air, and only items an editor has
 *  taken to air. A stage that drew the live count directly would put a figure
 *  on a transmitter that nobody had checked — which is the one thing this
 *  whole product is built to prevent. Where nothing is cleared, it says so
 *  rather than falling back to the raw count.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default async function StagePage() {
  const { user, project, race, territory, ground } = await viewing("/room/stage");
  /* The stage renders what goes out, so it takes the grant that renders
     frames rather than merely reading the room. */
  if (!can(user.role, "broadcast:render")) redirect("/room");

  /* The clock is read before the picture is described, not while it is being
     described: reading it during render is the thing the rules of a component
     forbid, and a stage is re-rendered every twenty seconds. */
  const at = await nowWAT();

  const [rows, items] = await Promise.all([
    project ? results.counted(project.id, race, territory) : [],
    project ? broadcastItems.all(project.id) : [],
  ]);

  const booths = Object.fromEntries(
    STATES.map((state) => [state.number, states2023.find((row) => row.code === state.code)?.booths ?? 0])
  );
  const places = byState({ rows, booths });
  const national = rollUp(places, ground);
  const expected = places.reduce((sum, place) => sum + (place.expected ?? 0), 0);

  /* What may be said out loud: the places an editor has cleared, and the
     items that are on air right now. */
  const pipeline = clearance({
    rows,
    clearances: items.filter((item) => item.kind === "CLEARANCE"),
    expected,
  });
  const onAir = items.filter((item) => item.state === "ON_AIR");

  return (
    <main className="min-h-screen bg-blue-950 text-white">
      {/* The refresh is the only moving part, and it is invisible on the
          stage itself: it sits in the corner for the operator and is small
          enough to crop out of a capture. */}
      <div className="pointer-events-auto fixed top-2 right-2 z-50 opacity-40 transition-opacity hover:opacity-100">
        <LiveRefresh seconds={20} label="Stage" />
      </div>
      <Stage
        project={project}
        raceLabel={labelFor(race)}
        ground={ground}
        national={national}
        places={places}
        pipeline={pipeline}
        onAir={onAir}
        at={at}
      />
    </main>
  );
}
