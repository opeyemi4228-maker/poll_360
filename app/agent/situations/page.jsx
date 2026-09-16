import { Camera, ShieldAlert } from "lucide-react";

import SituationForm from "@/components/agent/SituationForm";
import SosPanel from "@/components/agent/SosPanel";
import { AgentScreen, Notice } from "@/components/agent/AgentScreen";
import { timeOf } from "@/components/agent/day/DayRecord";
import { SOS_KIND, urgency } from "@/lib/agent-day";
import { agentElection } from "@/lib/agent-election";
import { requireCoordinator } from "@/lib/coordinator-session";
import { incidents, units } from "@/lib/db";
import { cn } from "@/lib/utils";

export const metadata = { title: "Situations", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Situations: what is going wrong at the unit, sent to the situation room.
 *
 * ── THE SOS FIRST, THE FORM SECOND ─────────────────────────────────────────
 * Somebody in danger has no time for a list of categories, so the SOS is the
 * top of the page and is one press. Everything else — a threat, a snatched
 * box, a card reader that will not read — goes through the form under it,
 * which files into the same incident feed the situation room already watches.
 *
 * ── AND WHAT WAS SENT, UNDERNEATH ──────────────────────────────────────────
 * So an agent can see their report arrived, and whether the room has picked
 * it up, without phoning anybody to ask.
 */
export default async function AgentSituationsPage() {
  const person = await requireCoordinator();
  const project = await agentElection(person.unitCode);

  const [unit, reports] = await Promise.all([
    person.unitCode ? units.at(person.unitCode) : null,
    project ? incidents.forAgent(person.id, project.id) : [],
  ]);

  return (
    <AgentScreen
      title="Situations"
      icon={ShieldAlert}
      tone="red"
      unitCode={person.unitCode}
      unitName={unit?.name}
      lead="Report anything that puts people or votes at risk. The situation room sees it the moment you send it."
    >
      {!project ? (
        <Notice tone="warn">No election is running yet, so there is nowhere to send a report.</Notice>
      ) : (
        <>
          <SosPanel />

          <section className="mt-9">
            <h2 className="text-fluid-lg font-bold text-ink-950">Report a situation</h2>
            <p className="mt-1 text-[0.9375rem] leading-relaxed text-content-muted">
              Choose what is happening, say how urgent it is, and add what you saw.
            </p>
            <div className="mt-5">
              <SituationForm />
            </div>
          </section>
        </>
      )}

      <section className="mt-10">
        <h2 className="text-fluid-lg font-bold text-ink-950">Reported from your unit</h2>
        {reports.length === 0 ? (
          <p className="mt-3 rounded-dash-sm bg-ink-100 px-4 py-3.5 text-[0.9375rem] text-content-muted">
            Nothing reported yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-200 overflow-hidden rounded-dash border-2 border-ink-200 bg-white">
            {reports.map((report) => {
              const level = urgency(report.severity);
              const sos = report.kind === SOS_KIND;
              return (
                <li key={report.id} className="flex items-start gap-3 px-4 py-3.5">
                  <span className="figure w-11 shrink-0 pt-0.5 text-[0.875rem] font-bold text-ink-950">
                    {timeOf(report.createdAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[0.9375rem] font-bold", sos ? "text-red-700" : "text-ink-950")}>
                      {report.kind}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-content-muted">
                      {level && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 font-bold",
                            report.severity === "CRITICAL"
                              ? "bg-red-100 text-red-800"
                              : report.severity === "SERIOUS"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-ink-100 text-ink-800"
                          )}
                        >
                          {level.label}
                        </span>
                      )}
                      <span>{report.status === "OPEN" ? "Waiting for the room" : "Picked up by the room"}</span>
                      {report.hasPhoto && (
                        <span className="inline-flex items-center gap-1">
                          <Camera size={13} strokeWidth={2.5} aria-hidden="true" />
                          Photo
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AgentScreen>
  );
}
