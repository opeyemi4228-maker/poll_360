import WhatsAppDesk from "@/components/dash/WhatsAppDesk";
import { requireCapability } from "@/lib/guard";
import { positions, sheetReads, units, whatsapp } from "@/lib/db";
import { groupUnits } from "@/lib/units";
import { nameUnits } from "@/lib/lga-names";
import { can } from "@/lib/roles";

export const metadata = { title: "WhatsApp desk", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The WhatsApp desk.
 *
 * ── WHAT THIS SCREEN IS FOR ────────────────────────────────────────────────
 * Agents file from the app they already have, over the data plan they already
 * pay for, on the phone they already own. That removes almost every reason a
 * return does not arrive. What it adds is a channel anybody can send anything
 * to, so this is the room where a human reads it: every conversation, every
 * half-finished return, every photograph, and every number that has not yet
 * been matched to a real person.
 *
 * ── THE GATE IS HERE, NOT IN THE COMPONENT ─────────────────────────────────
 * Checked on the server before a single row is read. A capability check that
 * lives in the browser is a suggestion.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default async function WhatsAppPage() {
  const user = await requireCapability("whatsapp:read", "/whatsapp");

  return (
    <WhatsAppDesk
      user={user}
      /* Spread, not passed. `node:sqlite` hands back rows with a null
         prototype, and a null prototype cannot cross into a client component:
         the page renders 500 with "only plain objects can be passed", which
         says nothing about sqlite and takes a while to place. */
      summary={{ ...whatsapp.summary() }}
      contacts={whatsapp.contacts(80).map(withTime)}
      messages={whatsapp.recent(80).map(withTime)}
      open={whatsapp.openSessions().map(withTime)}
      canClaim={can(user.role, "whatsapp:claim")}
      /* The hierarchy is folded on the server. It is a pure function of rows
         we have already fetched, and doing it here keeps the tree out of the
         browser bundle and off the main thread on a desk machine that is also
         running four other dashboards. */
      tree={groupUnits(nameUnits(units.all()))}
      unitCount={units.count()}
      reportedCount={units.reported()}
      places={positions.latest().map(withTime)}
      reads={sheetReads.recent(30).map(withTime)}
      readSummary={{ ...sheetReads.summary() }}
    />
  );
}

/**
 * Clocks are stamped here, on the server, once.
 *
 * Formatting a time in the browser reads the *viewer's* timezone, while the
 * server rendered the same row in its own, so the two disagreed and every
 * message row failed hydration. A desk in Abuja and a desk in London should
 * also see the same clock as each other, because they are discussing the same
 * booth: election time is the count's time, not the reader's.
 */
function withTime(row) {
  const at = row.createdAt ?? row.updatedAt ?? row.lastSeen;
  return { ...row, at: at ? new Date(at).toTimeString().slice(0, 5) : "" };
}
