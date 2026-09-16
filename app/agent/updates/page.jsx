import { Megaphone } from "lucide-react";

import CheckInPanel from "@/components/agent/day/CheckInPanel";
import { DayTimeline, EvidenceList, ScoreExplained } from "@/components/agent/day/DayRecord";
import { AgentScreen, Notice } from "@/components/agent/AgentScreen";
import { updateProgress } from "@/lib/agent-day";
import { agentElection } from "@/lib/agent-election";
import { agentDay } from "@/lib/agent360";
import { requireCoordinator } from "@/lib/coordinator-session";
import { unitUpdates, units } from "@/lib/db";

export const metadata = { title: "Updates", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Updates: the polling day, one step at a time, told to the room as it happens.
 *
 * ── KEPT HERE, SCORED THERE ────────────────────────────────────────────────
 * Every update is saved by this product first, so the room sees "voting has
 * started" whether or not Agent360 is connected. Where it is, the steps it
 * scores are also sent there, and the record it keeps of the agent's day is
 * shown underneath. Agent360 being down never stops an update being sent.
 */
export default async function AgentUpdatesPage() {
  const person = await requireCoordinator();
  const project = await agentElection(person.unitCode);

  const [unit, updates, day] = await Promise.all([
    person.unitCode ? units.at(person.unitCode) : null,
    project ? unitUpdates.forAgent(person.id, project.id) : [],
    agentDay(person.phone),
  ]);

  const ready = day.state === "ready";
  const progress = updateProgress(updates);

  return (
    <AgentScreen
      title="Updates"
      icon={Megaphone}
      tone="green"
      unitCode={person.unitCode}
      unitName={unit?.name ?? (ready ? day.unit?.name : null)}
      lead="Send each step as it happens at your unit. Your coordinator and the situation room see it straight away."
    >
      {!project ? (
        <Notice tone="warn">
          No election is running yet. Updates open when it does.
        </Notice>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-200" aria-hidden="true">
              <div
                className="h-full rounded-full bg-emerald-600 transition-[width]"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
            <p className="figure shrink-0 text-[0.875rem] font-bold text-ink-950">
              {progress.done} of {progress.total} sent
            </p>
          </div>

          <CheckInPanel
            updates={updates.map((update) => ({ step: update.step, at: update.at.toISOString() }))}
            windowOpen={ready ? day.election.windowOpen : true}
            windowReason={ready ? day.election.windowReason : null}
            unitName={unit?.name ?? (ready ? day.unit?.name : null)}
          />
        </>
      )}

      {ready && (
        <section className="mt-10">
          <h2 className="text-fluid-lg font-bold text-ink-950">Your record</h2>
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-content-muted">
            What was recorded about your day. You are the only person who can tell if something here is not
            what you sent.
          </p>

          <div className="mt-4">
            <DayTimeline events={day.events} />
          </div>

          {day.latest && (
            <div className="mt-6 rounded-dash border-2 border-ink-200 bg-white p-4">
              <ScoreExplained latest={day.latest} />
            </div>
          )}

          <h3 className="mt-8 text-[0.9375rem] font-bold text-ink-950">Sealed entries from your unit</h3>
          <div className="mt-3 rounded-dash border-2 border-ink-200 bg-white px-4 py-2">
            <EvidenceList record={day.record} />
          </div>
        </section>
      )}
    </AgentScreen>
  );
}
