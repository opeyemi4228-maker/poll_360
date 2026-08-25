import { Wallet as WalletIcon } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card } from "@/components/dash/DashCard";
import FileReturns from "@/components/dash/FileReturns";
import IncidentForm from "@/components/dash/IncidentForm";
import Wallet from "@/components/dash/Wallet";
import { requireUser } from "@/lib/guard";
import { currentElection } from "@/lib/election-scope";
import { results } from "@/lib/db";
import { ledger } from "@/lib/ledger";
import { can } from "@/lib/roles";
import { RACES } from "@/lib/races";

export const metadata = { title: "File a result", robots: { index: false } };
export const dynamic = "force-dynamic";

/* ── WHY THIS PAGE IS ALLOWED A LONG MINUTE ────────────────────────────────
   Set here rather than in the action because the host reads the ceiling from
   the page a server action was called from. Filing a result may carry a
   photograph to be checked against the typed figures, and reading it on the
   server takes seconds — more on a cold instance, which fetches its language
   file first. Under the host's default ceiling the check is killed halfway
   and the agent sees a submission that never completes. A filing with no
   photograph is unaffected: this is a ceiling, not a reservation. */
export const maxDuration = 60;

/**
 * The agent's dashboard.
 *
 * One screen, one task. No navigation into the middle of a job, no list of
 * booths, nothing above the fold but the unit they hold and the form. The
 * booth is printed at the top as a fact, confirmed, never selected, because
 * it comes from their appointment and not from anything on this page.
 */
export default async function FieldPage() {
  const user = await requireUser("/field");
  const project = await currentElection();

  /* ── EVERY BALLOT THIS BOOTH HAS SENT, IN ONE QUESTION ───────────────────
     Five positions, one query. The screen needs to know which of them are in
     so it can tick them, open on the next one still to do, and put the figures
     back in the boxes if somebody is correcting one. */
  const filedRows = user.scope && project
    ? await results.forUnitAcrossRaces(user.scope, project.id)
    : {};

  const filed = Object.fromEntries(
    RACES.filter((race) => filedRows[race.id]).map((race) => {
      const row = filedRows[race.id];
      return [
        race.id,
        {
          total: Object.values(row.votes ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0),
          status: row.status,
          /* The figures themselves, so a correction opens on what is already
             on file rather than on an empty form somebody has to retype from a
             sheet they may no longer be holding. */
          row: {
            registered: row.registered,
            accredited: row.accredited,
            rejected: row.rejected,
            votes: row.votes,
          },
        },
      ];
    })
  );

  /* A desk or an administrator has no booth of its own and may name one. An
     agent may not, and the server enforces that regardless of what this says. */
  const canNameUnit = !user.scope && can(user.role, "results:upload");

  /* Everything about the account is derived from the ledger on read: the
     balance is a sum, never a stored figure that could drift from its own
     statement.

     Four separate questions of the same table, so they are asked together.
     In sequence they were four round trips deep on the one page an agent
     opens at a polling unit, on a phone, on whatever signal there is. */
  const [balance, pending, entries, chain] = await Promise.all([
    ledger.balanceFor(user.id),
    ledger.pendingFor(user.id),
    ledger.forUser(user.id, 12),
    ledger.verify(),
  ]);

  return (
    <DashLayout
      user={user}
      screen="field"
      title="File your returns"
      lead={
        project
          ? `${project.title}. One return per ballot paper: the figures are checked as you type, and again when they arrive.`
          : "One return per ballot paper. The figures are checked as you type, and again when they arrive."
      }
    >
      {!user.scope && !canNameUnit ? (
        <Card title="No booth assigned">
          <p className="text-[0.9375rem] leading-relaxed text-dash-muted">
            This account is not tied to a polling unit yet, so there is nothing for it to file. Your
            ward coordinator assigns the unit; until they do, the form stays closed rather than
            letting you file for a booth nobody appointed you to.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* The booth, the five ballot papers, and the form for whichever one
              is open. All of it in one client component because which position
              is selected, and which have been sent, are the same piece of
              state. */}
          <FileReturns unitCode={user.scope} filed={filed} canNameUnit={canNameUnit} />

          <Card
            id="wallet"
            title="Your account"
            subtitle="Derived from the ledger, and provably unaltered"
            action={<WalletIcon size={16} className="shrink-0 text-dash-muted" />}
          >
            <Wallet balance={balance} pending={pending} entries={entries} chain={chain} />
          </Card>

          <Card id="incident" title="Report something that is not a number" subtitle="A queue, a delay, an obstruction, encrypted before it is stored">
            <IncidentForm />
          </Card>
        </div>
      )}
    </DashLayout>
  );
}
