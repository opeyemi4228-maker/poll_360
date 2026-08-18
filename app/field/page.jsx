import { MapPin, Wallet as WalletIcon } from "lucide-react";

import DashLayout, { Card, StatCard, Empty } from "@/components/dash/DashLayout";
import FileResultForm from "@/components/dash/FileResultForm";
import IncidentForm from "@/components/dash/IncidentForm";
import Wallet from "@/components/dash/Wallet";
import { requireUser } from "@/lib/guard";
import { results } from "@/lib/db";
import { ledger } from "@/lib/ledger";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "File a result", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The agent's dashboard.
 *
 * One screen, one task. No navigation into the middle of a job, no list of
 * booths, nothing above the fold but the unit they hold and the form. The
 * booth is printed at the top as a fact — confirmed, never selected — because
 * it comes from their appointment and not from anything on this page.
 */
export default async function FieldPage() {
  const user = await requireUser("/field");
  const existing = user.scope ? results.forUnit(user.scope) : null;

  /* Everything about the account is derived from the ledger on read: the
     balance is a sum, never a stored figure that could drift from its own
     statement. */
  const balance = ledger.balanceFor(user.id);
  const pending = ledger.pendingFor(user.id);
  const entries = ledger.forUser(user.id, 12);
  const chain = ledger.verify();

  return (
    <DashLayout
      user={user}
      title={existing ? "Amend your return" : "File your return"}
      lead={
        existing
          ? "This booth has already reported. Changing it updates that return rather than adding a second one — and sends it back for checking."
          : "One booth, one return. The figures are checked as you type, and again when they arrive."
      }
    >
      {!user.scope ? (
        <Card title="No booth assigned">
          <p className="text-[0.9375rem] leading-relaxed text-dash-muted">
            This account is not tied to a polling unit yet, so there is nothing for it to file. Your
            ward coordinator assigns the unit; until they do, the form stays closed rather than
            letting you file for a booth nobody appointed you to.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* The booth, printed. Not a field, not a dropdown. */}
          <div className="rounded-dash border-2 border-dash-ink bg-dash-card px-5 py-5">
            <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
              <MapPin size={13} strokeWidth={2.5} />
              Your polling unit
            </p>
            <p className="figure mt-2.5 text-[2rem] leading-none font-bold tracking-[-0.02em] text-dash-ink">
              {user.scope}
            </p>
            <p className="mt-2.5 text-[0.8125rem] text-dash-muted">
              State {user.scope.slice(0, 2)} · LGA {user.scope.slice(3, 5)} · Ward{" "}
              {user.scope.slice(6, 8)} · Unit {user.scope.slice(9)}
            </p>
          </div>

          {existing && (
            <div className="rounded-dash border border-dash-line bg-dash-card px-5 py-4">
              <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">Already filed</p>
              <p className="figure mt-2 text-[0.9375rem] text-dash-ink">
                {formatNumber(Object.values(existing.votes).reduce((a, b) => a + b, 0))} votes ·{" "}
                {existing.status.toLowerCase()} ·{" "}
                {existing.submittedAt.toISOString().slice(11, 16)}
              </p>
            </div>
          )}

          <Card title={existing ? "Amend the figures" : "The figures"} subtitle="Checked as you type, and again when they arrive">
            <FileResultForm unitCode={user.scope} existing={existing} />
          </Card>

          <Card
            id="wallet"
            title="Your account"
            subtitle="Derived from the ledger, and provably unaltered"
            action={<WalletIcon size={16} className="shrink-0 text-dash-muted" />}
          >
            <Wallet balance={balance} pending={pending} entries={entries} chain={chain} />
          </Card>

          <Card id="incident" title="Report something that is not a number" subtitle="A queue, a delay, an obstruction — encrypted before it is stored">
            <IncidentForm />
          </Card>
        </div>
      )}
    </DashLayout>
  );
}
