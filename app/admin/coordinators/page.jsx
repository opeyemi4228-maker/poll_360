import { UserRoundCheck } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card } from "@/components/dash/DashCard";
import { Split } from "@/components/dash/SystemCharts";
import ApprovalQueue from "@/components/dash/ApprovalQueue";
import { requireCapability } from "@/lib/guard";
import { agentsWaiting } from "@/lib/databank-agents";
import { agentUrl } from "@/lib/agent-address";
import { lgaNameFor } from "@/lib/lga-names";
import { parseUnitCode } from "@/lib/units";

export const metadata = { title: "Polling unit agents", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Approving the people who file.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE LIST IS DATA BANK'S; THE DECISION IS MADE HERE
 *
 *  Agents reach Data Bank's list from a party's uploaded file or by signing up
 *  on the agents' site, and every one of them arrives waiting. This screen
 *  reads the waiting agents back — names included, and every read logged in
 *  Data Bank — and approving one is what issues the code they sign in with.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── AND WHY IT IS GATED ON accounts:issue ──────────────────────────────────
 * Approving an agent is issuing a credential that can put figures into the
 * count. It is the same power as creating an account and it is held by the
 * same role, rather than by anybody who can see the admin area.
 */
export default async function CoordinatorsPage() {
  const admin = await requireCapability("accounts:issue", "/admin");

  const list = await agentsWaiting({ limit: 100 });
  const tally = list.tally ?? { PENDING: 0, APPROVED: 0, DECLINED: 0, SUSPENDED: 0 };

  return (
    <DashLayout
      user={admin}
      screen="admin"
      title="Polling unit agents"
      lead="Agents on Data Bank's list, from party files and from sign-ups. Approving an agent issues the code they sign in with."
    >
      {!list.ok && (
        <Card className="mb-6" title="The agent list cannot be read right now">
          <p className="text-[0.9375rem] leading-relaxed text-dash-muted">
            {list.error === "not-configured"
              ? "This deployment is not connected to Data Bank's agent list yet, so there is nobody to approve and no agent can sign in."
              : "Data Bank did not answer. Nobody waiting has been lost — reload this page in a minute."}
          </p>
        </Card>
      )}

      <Card className="mb-6" title="Everybody on the agent list">
        <Split
          segments={[
            { label: "waiting on you", value: tally.PENDING ?? 0, tone: "warn" },
            { label: "approved", value: tally.APPROVED ?? 0, tone: "good" },
            { label: "turned down", value: tally.DECLINED ?? 0, tone: "neutral" },
            { label: "suspended", value: tally.SUSPENDED ?? 0, tone: "alert" },
          ]}
          caption={
            tally.PENDING
              ? "An agent cannot sign in or file anything until they are approved and given their code."
              : "Nobody is waiting. Every agent on the list has been answered."
          }
        />
      </Card>

      <Card
        title={list.waiting.length ? `${list.waiting.length} waiting to be approved` : "Nobody is waiting"}
        subtitle="Oldest first. Check the polling unit against your appointment list before approving. It can be corrected here, and it becomes the first half of the agent's code."
        action={<UserRoundCheck size={16} className="shrink-0 text-dash-muted" />}
      >
        <ApprovalQueue waiting={list.waiting.map(shapeApplicant)} signUpAddress={agentUrl("/join")} />
      </Card>

      <p className="mt-5 text-[0.8125rem] leading-relaxed text-dash-muted">
        Party agent lists are uploaded at Data Bank&rsquo;s input desk, using the agent list template.
        Agents can also sign up at <span className="figure text-dash-ink">{agentUrl("/join")}</span>.
        Approved agents sign in with their code alone — there are no agent passwords.
      </p>
    </DashLayout>
  );
}

/**
 * What the queue renders. The waiting time and the place names are worked out
 * here, on the server: a duration computed in the browser disagrees with the
 * server's and fails hydration, and the local government names come off disk.
 */
function shapeApplicant(person) {
  const created = person.createdAt ? new Date(person.createdAt) : null;
  const hours = created ? Math.floor((Date.now() - created.getTime()) / 3_600_000) : null;
  const at = person.pollingUnitCode ? parseUnitCode(person.pollingUnitCode) : null;

  return {
    id: person.id,
    name: person.fullName,
    phoneTail: person.phoneTail,
    party: person.party,
    sourceLabel: person.sourceLabel,
    scope: at?.code ?? person.pollingUnitCode,
    stateName: at?.stateName ?? null,
    lgaName: at ? lgaNameFor(at.code) : null,
    waitingFor:
      hours == null ? null : hours < 1 ? "under an hour" : hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`,
  };
}
