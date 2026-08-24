import nation from "@/public/geo/map/nation.json";

import DashLayout from "@/components/dash/DashLayout";
import RulingParty from "@/components/dash/RulingParty";
import { requireUser } from "@/lib/guard";
import { FCT, crossedFloor, ruling, seatsBy } from "@/lib/governors";

export const metadata = {
  title: "Who governs | Poll360",
  description: "Every Nigerian state by governing party, as elected and as it stands.",
};

/**
 * Who governs each state.
 *
 * ── WHY THIS IS ITS OWN PAGE AND NOT A LAYER ON THE COUNT ──────────────────
 * Everything in the situation room is about one contest on one night. This is
 * about the standing map: who holds each state today, which parts of it were
 * decided at a ballot box and which were decided in a defection. Those are
 * different questions on different clocks, and folding this in as another
 * layer on a live count would invite a room to read a governing-party map as
 * a result.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default async function GovernorsPage() {
  const user = await requireUser("/governors");

  /* All of it is a pure function of a checked-in table, so there is nothing to
     await and nothing that can be slow. */
  const rows = ruling();

  return (
    <DashLayout
      user={user}
      screen="governors"
      title="Who governs"
      lead={
        "Every state by the party that holds it. Elections are matters of record; defections are " +
        "reported events, dated and graded here rather than asserted, and a state only changes " +
        "colour once a move is settled. Verify before broadcast."
      }
    >
      <RulingParty
        rows={rows}
        shapes={nation}
        fct={FCT}
        moves={crossedFloor()}
        seats={{ current: seatsBy("current"), elected: seatsBy("elected") }}
      />
    </DashLayout>
  );
}
