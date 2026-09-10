import { redirect } from "next/navigation";

import nation from "@/public/geo/map/nation.json";

import DashLayout from "@/components/dash/DashLayout";
import RulingParty from "@/components/dash/RulingParty";
import { requireUser } from "@/lib/guard";
import { mayOpen } from "@/lib/roles";
import { FCT, crossedFloor, ruling, seatsBy } from "@/lib/governors";

export const metadata = {
  title: "Who governs | Poll360",
  description: "Every Nigerian state by governing party, as elected and as it stands.",
};

/**
 * Who governs each state.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS SCREEN EXISTED TWICE, AND THE FIX IS NOT TO DELETE ONE OF THEM
 *
 *  It rendered `RulingParty` from `ruling()`, `crossedFloor()` and
 *  `seatsBy()`. So does the situation room's "Ruling party" tab, from the
 *  same three calls. For anybody holding the room that was two doors onto one
 *  screen, and the room's door is the better one: it knows whose ground the
 *  account is on, so it renames itself "The seat" and shows the last election
 *  for that ground. This page never knew, and could not. A viewer holding one
 *  senatorial district was shown the whole federation here and their own
 *  district there, from the same product, on the same evening.
 *
 *  ── SO WHY IS THE PAGE STILL HERE ───────────────────────────────────────
 *  Because the duplication and the access are not the same question, and
 *  answering the first by deleting the route would have quietly answered the
 *  second as well. `/governors` is granted to every signed-in role — see
 *  `dashboardsFor` in lib/roles.js, which adds it unconditionally and says
 *  why: the standing governorship map is public record, it carries no count,
 *  no agent and no incident, and withholding it protects nothing. `/room` is
 *  granted to almost nobody. A blanket redirect would therefore have turned a
 *  screen every viewer, broadcaster and coordinator could read into a screen
 *  that bounced them home.
 *
 *  So the merge is conditional on the thing that actually made it a
 *  duplicate: holding both doors. An account that can open the room is sent
 *  to the tab, because for them this page is the worse copy of a screen they
 *  already have. An account that cannot is served here, because for them this
 *  page is not a duplicate of anything — it is the only door there was.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default async function GovernorsPage() {
  const user = await requireUser("/governors");

  /* Not `redirect` on a capability alone: the room is reached through
     `mayOpen`, which is the same function the route guard itself consults, so
     this can never send somebody to a room the guard will then refuse. That
     failure — a redirect into a room you are then sent home from — is the
     exact one lib/roles.js documents twice above `dashboardsFor`. */
  if (mayOpen(user.role, "/room")) redirect("/room#governs");

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
