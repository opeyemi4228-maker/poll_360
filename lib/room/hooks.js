/**
 * Where the rest of Poll360 tells the situation room that something happened.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Four callers, one line each: the agents' app, the desk's filing screen,
 *  the WhatsApp bot and the checking action. None of them knows what a light
 *  is. They say "this unit changed" or "this was reported", and the room
 *  works out the rest after the response has gone, so a slow room never
 *  slows an agent standing at a booth.
 *
 *  Everything here is loaded on first use. These functions are imported by
 *  modules that are also loaded in tests with no database and no request, and
 *  importing them must cost nothing and reach for nothing.
 * ══════════════════════════════════════════════════════════════════════════
 */

async function later(work) {
  const run = async () => {
    try {
      await work();
    } catch (error) {
      console.error("situation room hook failed:", error?.message ?? error);
    }
  };
  try {
    const { after } = await import("next/server");
    after(run);
  } catch {
    /* Outside a request (a script, a test): do it now and do not wait. */
    void run();
  }
}

/** A result was filed, amended, checked or disputed at this unit. */
export async function roomSaw({ project, race, unitCode, actor = null, cause = "" }) {
  if (!project?.id || !race || !unitCode) return;
  await later(async () => {
    const { refreshUnit, sweep } = await import("./store.js");
    await refreshUnit({ project, race, unitCode, actor, cause });
    /* And the night's sweep: overdue returns, red items nobody picked up,
       results that have no light yet. It limits itself to once a minute, so
       on a busy night the filings themselves keep it running, and the lights
       do not depend on somebody having a room screen open. */
    await sweep(project, race);
  });
}

/** A report came in from the field. An SOS is marked as one. */
export async function roomHeard({ project, unitCode, incidentId, sos = false, critical = false, name = null }) {
  if (!project?.id || !unitCode) return;
  await later(async () => {
    const [{ field, events }, { refreshEveryRace }, { pathName }] = await Promise.all([
      import("./store.js"),
      import("./assign.js"),
      import("./places.js"),
    ]);
    if (sos && incidentId) await field.markSos(incidentId);
    await refreshEveryRace(project, unitCode, { cause: "Report from the field" });
    await events.emit(project.id, "incident.reported", unitCode, { id: incidentId, sos, critical: sos || critical, name, place: pathName(unitCode) });
  });
}

/**
 * May this agent's figures become the result for this unit?
 *
 * Asked of storage on every filing, so an agent moved off a unit a minute
 * ago cannot file for it whatever their phone still shows.
 *
 *   { allow: true }                      file it
 *   { allow: false, code, error }        refuse it, in words for the agent
 *
 * The first accepted filing is the result. A second assigned agent's figures
 * are kept beside it for the verification desk and never become a second
 * result.
 */
export async function agentMayFile({ person, project, race, unitCode, figures }) {
  const [{ assignments }, { results }, { submissions }] = await Promise.all([
    import("./assign.js"),
    import("../db.js"),
    import("./store.js"),
  ]);
  if (!(await assignments.mayFile(person.id, unitCode))) {
    return {
      allow: false,
      status: 403,
      code: "NOT_ASSIGNED",
      error: "You are not assigned to this polling unit any more, so this cannot be filed. Speak to your coordinator.",
    };
  }
  const existing = await results.forUnit(unitCode, project.id, race);
  if (!existing || existing.coordinatorId === person.id) return { allow: true };

  const same =
    Number(existing.accredited) === Number(figures.accredited) &&
    Number(existing.rejected) === Number(figures.rejected) &&
    Object.keys(figures.votes ?? {}).every((party) => Number(existing.votes?.[party] ?? 0) === Number(figures.votes[party] ?? 0));
  if (same) {
    return { allow: false, status: 409, code: "ALREADY_FILED", error: "The result for this polling unit has already been filed, with the same figures as yours. Nothing more is needed." };
  }
  await submissions.keep({ electionId: project.id, race, unitCode, kind: "CONFLICTING_SUBMISSION", person, figures });
  await roomSaw({ project, race, unitCode, cause: "A second agent filed different figures" });
  return {
    allow: false,
    status: 409,
    code: "ALREADY_FILED",
    error: "A result for this polling unit was already filed by another assigned agent, and your figures differ from it. Yours have been sent to the verification desk, who will compare both with the sheet.",
  };
}
