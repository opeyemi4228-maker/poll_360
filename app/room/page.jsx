import { AlertTriangle, Gauge, Scale, ShieldAlert, Users } from "lucide-react";


import { PartyBars, CoverageBar } from "@/components/dash/Charts";
import SituationRoom from "@/components/dash/SituationRoom";
import { currentElection } from "@/lib/election-scope";
import { elections } from "@/lib/elections";
import { requireUser } from "@/lib/guard";
import { results, incidents, media } from "@/lib/db";
import { watch } from "@/lib/watch";
import { unseal } from "@/lib/crypto";
import { parties, others, DECLARED, states2023 } from "@/lib/election2023";
import { buildBoard } from "@/lib/replay";
import nation from "@/public/geo/map/nation.json";
import { register } from "@/lib/site";
import { formatNumber, formatShare } from "@/lib/utils";

export const metadata = { title: "Situation room", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The party or coalition situation room.
 *
 * It gets everything the broadcast desk gets, plus the two things a campaign
 * needs and a newsroom is not given: the incident feed in full, unsealed, and
 * the gap between what our agents filed and what has been declared.
 *
 * ── WHY THE GAP IS THE POINT ───────────────────────────────────────────────
 * A parallel count is not useful because it is faster. It is useful because it
 * is a second, independently sourced number to hold the declared one against.
 * Averaging the two destroys the only thing worth having, so they sit in
 * separate columns and the difference is computed rather than smoothed.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default async function RoomPage() {
  const user = await requireUser("/room");

  const [project, allProjects] = await Promise.all([currentElection(), elections.list()]);

  const board = buildBoard();

  /* ── ONE WAIT, NOT THREE ────────────────────────────────────────────────
     The database is across a network now, and these three ask it different
     questions that have nothing to do with each other. Awaited in sequence
     they cost the sum of three round trips; awaited together they cost the
     slowest one. On a warm connection that is the difference between a page
     in half a second and a page in two, and on a cold one it was the
     difference between twelve seconds and sixty.

     Only the photographs have to wait, because they are fetched by the ids
     of the incidents above and cannot be asked for until those are known. */
  const [rawFeed, coordinators] = await Promise.all([
    incidents.recent(40, project?.id),
    watch.coordinators(),
  ]);

  const feed = rawFeed.map((item) => ({
    ...item,
    /* Decrypted here and nowhere else: the situation room is one of the two
       roles permitted to read an incident narrative. */
    detail: item.detailSealed ? unseal(item.detailSealed) : null,
  }));

  const watchSummary = watch.summary(coordinators);
  const photoMap = Object.fromEntries(await media.forIncidents(feed.map((item) => item.id)));

  return (
    <SituationRoom
      user={user}
      board={board}
      shapes={nation}
      states={states2023}
      incidents={feed}
      coordinators={coordinators}
      watchSummary={watchSummary}
      photos={photoMap}
      incidentCount={feed.length}
      scopeStates={project?.scopeStates ?? []}
      /* ── DATA, NOT A READY-MADE ELEMENT ────────────────────────────────
         This used to hand the switcher across already rendered. The switcher
         is a client component, so building it here bought nothing, and the
         element arrived on the other side as a plain child in an array React
         could not key, warning on every render of the room. The same mistake
         was made once before with LiveRefresh and fixed the same way: send
         the data and let the client component that needs it build the
         element. */
      projects={{
        current: project,
        all: allProjects,
        canCreate: ["SUPER_ADMIN", "SITUATION_ROOM"].includes(user.role),
      }}
    />
  );
}
