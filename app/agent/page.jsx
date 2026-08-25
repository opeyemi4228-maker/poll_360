import { MapPin } from "lucide-react";

import FileReturns from "@/components/dash/FileReturns";
import { fileAgentResult, readAgentSheetPhoto, signOutAgent } from "@/app/agent/actions";
import { requireCoordinator } from "@/lib/coordinator-session";
import { currentElection } from "@/lib/election-scope";
import { elections } from "@/lib/elections";
import { results } from "@/lib/db";
import { RACES } from "@/lib/races";

export const metadata = { title: "File your returns", robots: { index: false } };
export const dynamic = "force-dynamic";

/* ── WHY THIS PAGE IS ALLOWED A LONG MINUTE ────────────────────────────────
   Set here rather than in the action, because the host reads the ceiling from
   the page a server action was called from. Filing carries a photograph to be
   read and held against the typed figures, and that takes seconds — more on a
   cold instance. Under the default ceiling the check is killed halfway and the
   coordinator sees a submission that never completes. A filing with no
   photograph is unaffected: this is a ceiling, not a reservation. */
export const maxDuration = 60;

/**
 * The coordinator's dashboard.
 *
 * ── ONE SCREEN, ONE JOB, AND NOTHING ELSE ON IT ────────────────────────────
 * This is not /field with different chrome. /field belongs to the Poll360
 * staff side: it sits inside DashLayout, it carries a rail of rooms, and it
 * serves accounts that may hold a booth or may be a desk uploading for one.
 * This page serves exactly one kind of account, which holds exactly one booth
 * and has exactly one thing to do, and the booth is printed as a fact rather
 * than offered as a choice — it comes from their account, and there is no
 * field on this page that could change it.
 *
 * Everything a staff dashboard would put around this — coverage, other rooms,
 * the count so far — is deliberately absent. A coordinator does not need to
 * know the national total to file their booth, and a screen that showed it
 * would be inviting somebody standing at a polling unit to form a view about
 * whether their own figures look right.
 */
export default async function AgentPage() {
  const person = await requireCoordinator();

  /* No cookie to read on this side: the switcher is a staff control. Whatever
     is running is what a booth is filing into. */
  const project = (await currentElection()) ?? (await elections.active());

  /* Every ballot paper this booth has sent, in one question. The screen needs
     it to tick what is in, open on the next one still to do, and put the
     figures back in the boxes if somebody is correcting one. */
  const filedRows =
    project && person.unitCode
      ? await results.forUnitAcrossRaces(person.unitCode, project.id)
      : {};

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
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-5">
      {/* ── THE BOOTH, AS A FACT ──────────────────────────────────────────
          First thing on the screen and not a form control. The single most
          expensive mistake this product can make is a real return filed
          against the wrong booth, and it does not fail loudly — the map looks
          entirely normal. So the code is printed large enough to be checked
          against the sheet in the other hand. */}
      <section className="rounded-dash border-2 border-ink-950 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="tag flex items-center gap-1.5 text-content-subtle">
              <MapPin size={12} strokeWidth={2.5} />
              Your polling unit
            </p>
            <p className="figure mt-2 text-fluid-2xl font-bold tracking-[-0.02em] text-ink-950">
              {person.unitCode}
            </p>
            <p className="mt-1 text-[0.875rem] text-content-muted">
              {person.name}
              {project ? ` · ${project.title}` : ""}
            </p>
          </div>

          <form action={signOutAgent} className="shrink-0">
            <button
              type="submit"
              className="h-10 rounded-dash-sm border-2 border-ink-300 px-3.5 text-[0.8125rem] font-bold text-ink-950 transition-colors hover:border-ink-950"
            >
              Sign out
            </button>
          </form>
        </div>

        <p className="mt-4 border-t border-ink-200 pt-4 text-[0.875rem] leading-relaxed text-content-muted">
          {done === 0
            ? `${RACES.length} ballot papers to file. The figures are checked as you type, and again when they arrive.`
            : `${done} of ${RACES.length} filed. Tap a position below to file the next one, or to correct one already sent.`}
        </p>
      </section>

      {!project ? (
        <p className="mt-5 rounded-dash border-2 border-amber-300 bg-amber-50 px-5 py-4 text-[0.9375rem] leading-relaxed text-amber-900">
          No election is running at the moment, so there is nowhere for a return to go yet. Sign in
          again on polling day.
        </p>
      ) : (
        <div className="mt-5">
          {/* The same form the staff side files through — same boxes, same
              arithmetic, same sheet check — pointed at this side's action. */}
          <FileReturns
            unitCode={person.unitCode}
            filed={filed}
            action={fileAgentResult}
            /* The coordinator's own reader. The staff one authenticates
               against a table this account is not in, and would send a
               signed-in agent to a login page. */
            readAction={readAgentSheetPhoto}
          />
        </div>
      )}

      <p className="mt-8 border-t border-ink-200 pt-5 text-[0.8125rem] leading-relaxed text-content-muted">
        Photograph the sheet for every return. The figures you type are checked against it, and if
        they do not match you will be asked to correct them — that check is the reason a return
        from this booth can be defended later.
      </p>
    </main>
  );
}
