import { Inbox } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card, Empty } from "@/components/dash/DashCard";
import RequestQueue from "@/components/dash/RequestQueue";
import { requireCapability } from "@/lib/guard";
import { accessRequests } from "@/lib/db";
import { allPlaces, lgasOf, resolveTerritory } from "@/lib/constituencies";
import { RACES, raceLabel } from "@/lib/races";
import { describeTerritory } from "@/lib/territory";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Access requests", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The front door, from the inside.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Somebody asked for an account. This is where one is issued, and the point
 *  of the page is that the two are the same act rather than two acts that
 *  happen to be about the same person.
 *
 *  Before this, a request was a row on the overview showing an organisation
 *  and an email, and issuing the account was a separate form somewhere else
 *  that had never heard of it. Everything in between — which contest, how
 *  much of the country — was retyped from memory or from prose in a message
 *  field, and nothing recorded whether what was issued matched what was
 *  asked for. "They asked for Kaduna Central and were given Kaduna" was not
 *  a mistake anybody could find afterwards.
 *
 *  So the form under each request opens already filled in with what that
 *  request said, the ground is printed out in full underneath — every local
 *  government it contains, by name — and issuing writes the account id back
 *  onto the request.
 *
 *  ── WHY THE LOCAL GOVERNMENTS ARE LISTED AND NOT COUNTED ────────────────
 *  "Kaduna Central · 7 local governments" is checkable only by somebody who
 *  already knows the answer. The list is what an administrator reads against
 *  what the organisation told them on the phone, and it is the only thing on
 *  this page that would catch a district picked one row out in a dropdown.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default async function RequestsPage() {
  const admin = await requireCapability("accounts:issue", "/admin");

  /* Read once and passed to every form on the page. The tables are the same
     for all of them, and reading them per request would be forty reads of one
     file to render one screen. */
  const [requests, places] = await Promise.all([accessRequests.recent(50), allPlaces()]);

  const races = RACES.map((race) => ({ id: race.id, label: race.label }));

  const shaped = requests.map(shapeRequest);
  const waiting = shaped.filter((row) => row.status === "NEW");
  const answered = shaped.filter((row) => row.status !== "NEW");

  return (
    <DashLayout
      user={admin}
      screen="admin"
      title="Access requests"
      lead="Rooms and newsrooms asking to be let in. Issuing an account here ties it to the contest and the ground they asked for."
    >
      <Card
        title={waiting.length ? `${waiting.length} waiting` : "Nothing waiting"}
        subtitle="Newest first. Check the ground against what they told you before issuing — it is the half of this decision the name does not show."
        action={<Inbox size={16} className="shrink-0 text-dash-muted" />}
      >
        {waiting.length === 0 ? (
          <Empty>
            Nobody has asked since the last one was answered. Requests arrive from the form at the
            foot of the home page.
          </Empty>
        ) : (
          <RequestQueue requests={waiting} places={places} races={races} />
        )}
      </Card>

      {answered.length > 0 && (
        <Card className="mt-6" title="Already answered" subtitle="Kept, because a decision nobody can look up is a decision nobody can question.">
          <ul className="divide-y divide-dash-line">
            {answered.map((request) => (
              <li key={request.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <span className="text-[0.875rem] font-bold text-dash-ink">{request.organisation}</span>
                <span className="text-[0.8125rem] text-dash-muted">
                  {request.raceLabel ? `${request.raceLabel} · ` : ""}
                  {request.ground ?? "no ground recorded"}
                </span>
                <span
                  className={`text-[0.6875rem] font-semibold tracking-[0.1em] uppercase ${
                    request.status === "APPROVED" ? "text-emerald-600" : "text-dash-muted"
                  }`}
                >
                  {request.status === "APPROVED" ? "Issued" : "Turned down"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </DashLayout>
  );
}

/**
 * A request, with its territory resolved into places somebody can check.
 *
 * ── DONE HERE BECAUSE ONLY HERE CAN ────────────────────────────────────────
 * `resolveTerritory` and the local government names both read from disk, so
 * neither can run in the browser — the same reason the waiting time on the
 * coordinators' queue is computed on the server. The queue below is handed
 * names and renders them.
 */
function shapeRequest(request) {
  const territory = request.territory ? resolveTerritory(request.territory) : null;

  return {
    id: request.id,
    organisation: request.organisation,
    name: request.name,
    email: request.email,
    phone: request.phone,
    kind: request.kind,
    message: request.message,
    election: request.election,
    booths: request.units ? formatNumber(request.units) : null,
    status: request.status,
    race: request.race,
    raceLabel: request.race ? raceLabel(request.race) : null,
    territory: request.territory,
    /* Null where the request predates the picker, or names a district that no
       longer resolves. Both read on screen as "no ground recorded", which is
       true and is not the same as the federation. */
    ground: territory ? describeTerritory(territory) : null,
    level: territory?.level ?? null,
    lgas: territory ? lgasOf(territory).map((row) => row.name) : [],
    shared: territory?.shared ?? null,
    waitingSince: request.createdAt.toISOString().slice(0, 10),
  };
}
