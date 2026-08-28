import { UserRoundCheck } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card } from "@/components/dash/DashCard";
import ApprovalQueue from "@/components/dash/ApprovalQueue";
import { requireCapability } from "@/lib/guard";
import { coordinators } from "@/lib/coordinators";
import { lgaNameFor } from "@/lib/lga-names";
import { parseUnitCode } from "@/lib/units";

export const metadata = { title: "Coordinators", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Approving the people who file.
 *
 * ── WHY THIS IS A PAGE AND NOT A CARD ──────────────────────────────────────
 * The queue used to sit inline on the overview and disappear when it was
 * empty. That is a defensible way to keep a busy screen quiet and a poor way
 * to run a queue: an administrator who had never had a pending sign-up had
 * never seen it, did not know it existed, and had nowhere to look when the
 * first one arrived. Worse, there was no way to check whether anybody was
 * waiting other than loading the whole overview and scrolling.
 *
 * So it has a route, it is in the rail, and it is reachable when it is empty —
 * an empty queue that says "nobody is waiting" is information. The overview
 * keeps a banner that shouts when somebody actually is, because an approval
 * queue nobody works is an agent standing at a booth on polling morning unable
 * to file.
 *
 * ── AND WHY IT IS GATED ON accounts:issue ──────────────────────────────────
 * Approving a coordinator is issuing a credential that can put figures into
 * the count. It is the same power as creating an account and it is held by the
 * same role, rather than by anybody who can see the admin area.
 */
export default async function CoordinatorsPage() {
  const admin = await requireCapability("accounts:issue", "/admin");

  const [waiting, tally] = await Promise.all([
    coordinators.waiting(100),
    coordinators.tally(),
  ]);

  return (
    <DashLayout
      user={admin}
      screen="admin"
      title="Coordinators"
      lead="People who signed themselves up to file from a polling unit. Nothing they send enters the count until you approve them."
    >
      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-dash border border-dash-line bg-dash-line sm:grid-cols-4">
        <Count label="Waiting" value={tally.PENDING} tone={tally.PENDING ? "alert" : "ink"} />
        <Count label="Approved" value={tally.ACTIVE} />
        <Count label="Turned down" value={tally.DECLINED} />
        <Count label="Suspended" value={tally.SUSPENDED} />
      </dl>

      <Card
        title={
          waiting.length
            ? `${waiting.length} waiting to be approved`
            : "Nobody is waiting"
        }
        subtitle="Oldest first. Check the polling unit against your appointment list before approving — it can be corrected here."
        action={<UserRoundCheck size={16} className="shrink-0 text-dash-muted" />}
      >
        <ApprovalQueue waiting={waiting.map(shapeApplicant)} />
      </Card>

      <p className="mt-5 text-[0.8125rem] leading-relaxed text-dash-muted">
        Coordinators sign up at <span className="figure text-dash-ink">/agent/join</span>. They hold
        their own accounts, separate from the rooms issued here, and can do exactly one thing: file
        the returns from the single booth on their account.
      </p>
    </DashLayout>
  );
}

function Count({ label, value, tone = "ink" }) {
  return (
    <div className="bg-dash-card px-4 py-3.5">
      <dt className="text-[0.625rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
        {label}
      </dt>
      <dd
        className={`figure mt-1 text-[1.375rem] font-bold tabular-nums ${
          tone === "alert" ? "text-red-600" : "text-dash-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * What the queue renders.
 *
 * The waiting time is worked out here, on the server, for the same reason
 * every other clock in this product is: a duration computed in the browser
 * disagrees with the one rendered on the server and fails hydration.
 */
function shapeApplicant(person) {
  const hours = Math.floor((Date.now() - person.createdAt.getTime()) / 3_600_000);

  /* ── THE CODE, SAID IN WORDS ─────────────────────────────────────────────
     The queue used to print nine digits and ask somebody to approve them. The
     one thing an administrator can actually check is whether this person is on
     the appointment list for a named place, and 19/04/07/013 is not a named
     place to anybody. So the two halves we can name are named here, from the
     code itself rather than from anything the applicant typed, and appear
     beside it. A number that reads as the wrong town is a mistake caught
     before polling day rather than after the first return. */
  const at = person.unitCode ? parseUnitCode(person.unitCode) : null;

  return {
    id: person.id,
    name: person.name,
    email: person.email,
    /* Never the whole number on a screen read over somebody's shoulder. The
       last four digits are enough to match against an appointment list. */
    phoneTail: person.phoneTail,
    scope: person.unitCode,
    stateName: at?.stateName ?? null,
    lgaName: person.unitCode ? lgaNameFor(person.unitCode) : null,
    /* These two are the applicant's own words, not a lookup — we hold no ward
       or unit names. Shown as what they are, because an unchecked name printed
       as though it were the register is worse than no name at all. */
    wardName: person.wardName,
    unitName: person.unitName,
    waitingFor:
      hours < 1 ? "under an hour" : hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`,
  };
}
