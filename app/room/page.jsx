import { AlertTriangle, Gauge, Scale, ShieldAlert, Users } from "lucide-react";


import { PartyBars, CoverageBar } from "@/components/dash/Charts";
import SituationRoom from "@/components/dash/SituationRoom";
import LiveRefresh from "@/components/dash/LiveRefresh";
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

  const board = buildBoard();
  const feed = incidents.recent(40).map((item) => ({
    ...item,
    /* Decrypted here and nowhere else: the situation room is one of the two
       roles permitted to read an incident narrative. */
    detail: item.detailSealed ? unseal(item.detailSealed) : null,
  }));

  const coordinators = watch.coordinators();
  const watchSummary = watch.summary(coordinators);
  const photoMap = Object.fromEntries(media.forIncidents(feed.map((item) => item.id)));

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
    />
  );
}
