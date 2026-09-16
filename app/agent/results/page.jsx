import { ScanLine } from "lucide-react";

import FileReturns from "@/components/dash/FileReturns";
import { AgentScreen, Notice } from "@/components/agent/AgentScreen";
import { fileAgentResult, readAgentSheetPhoto } from "@/app/agent/actions";
import { agentElection } from "@/lib/agent-election";
import { requireCoordinator } from "@/lib/coordinator-session";
import { results, units } from "@/lib/db";
import { RACES } from "@/lib/races";

export const metadata = { title: "Results", robots: { index: false } };
export const dynamic = "force-dynamic";

/* ── WHY THIS PAGE IS ALLOWED A LONG MINUTE ────────────────────────────────
   Set here rather than in the action, because the host reads the ceiling from
   the page a server action was called from. Filing carries a photograph to be
   read and held against the typed figures, and that takes seconds — more on a
   cold instance. A filing with no photograph is unaffected. */
export const maxDuration = 60;

/**
 * Results: scan the sheet, check the figures, send them — one ballot paper at
 * a time. The form is the same one the desks use, so the checks an agent's
 * figures pass are the checks every figure passes.
 */
export default async function AgentResultsPage() {
  const person = await requireCoordinator();
  const project = await agentElection(person.unitCode);

  const [unit, filedRows] = await Promise.all([
    person.unitCode ? units.at(person.unitCode) : null,
    project && person.unitCode ? results.forUnitAcrossRaces(person.unitCode, project.id) : {},
  ]);

  const filed = Object.fromEntries(
    RACES.filter((race) => filedRows[race.id]).map((race) => {
      const row = filedRows[race.id];
      return [
        race.id,
        {
          total: Object.values(row.votes ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0),
          status: row.status,
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
  const done = Object.keys(filed).length;

  return (
    <AgentScreen
      title="Results"
      icon={ScanLine}
      tone="ink"
      unitCode={person.unitCode}
      unitName={unit?.name}
      lead={
        done === 0
          ? `Photograph the result sheet, check the figures it reads, and send. ${RACES.length} ballot papers to file.`
          : `${done} of ${RACES.length} sent. Tap a position to send the next one, or to correct one already sent.`
      }
    >
      {!project ? (
        <Notice tone="warn">
          No election is running at the moment, so there is nowhere for a result to go yet. Come back on
          polling day.
        </Notice>
      ) : (
        <FileReturns
          unitCode={person.unitCode}
          filed={filed}
          action={fileAgentResult}
          /* The agent's own reader. The staff one authenticates against a
             table this account is not in. */
          readAction={readAgentSheetPhoto}
        />
      )}

      <p className="mt-5 text-[0.8125rem] leading-relaxed text-content-muted">
        Photograph the sheet for every result. The figures you type are checked against it, and if they do
        not match you will be asked to correct them — that check is what lets a result from this unit be
        defended later.
      </p>
    </AgentScreen>
  );
}
