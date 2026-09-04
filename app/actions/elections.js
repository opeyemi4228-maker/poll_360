"use server";

import { revalidatePath } from "next/cache";

import { chooseElection, chooseRace, forgetRace } from "@/lib/election-scope";
import { elections } from "@/lib/elections";
import { requireUser, log } from "@/lib/guard";

/**
 * Starting and switching election projects.
 *
 * ── WHO MAY START ONE ──────────────────────────────────────────────────────
 * Creating a project is not a view preference: it is the thing every result
 * filed afterwards gets attached to, and a field agent who created one by
 * accident would be filing into a night nobody is watching. So it is limited
 * to the roles that run a room, while switching between existing projects is
 * open to anyone signed in, because looking is harmless.
 * ───────────────────────────────────────────────────────────────────────────
 */
const MAY_CREATE = new Set(["SUPER_ADMIN", "SITUATION_ROOM"]);

export async function createElection(_previous, formData) {
  /* No pathname: `requireUser` treats one as a route to authorise against, and
     a server action is not a route. Passing "/console" asked whether a
     situation-room account may open the viewer's console — it may not — so the
     guard redirected and the project was never created, silently. All that is
     wanted here is a signed-in user. */
  const user = await requireUser();

  if (!MAY_CREATE.has(user.role)) {
    return { error: "Your account cannot start an election project. Ask your situation room." };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return { error: "Give the project a title before it starts — you will be glad of it later." };
  }

  const kind = String(formData.get("kind") ?? "PRESIDENTIAL");
  const dayText = String(formData.get("votesOn") ?? "").trim();
  /* A date input gives YYYY-MM-DD, which is midnight UTC. Polling day is a day,
     not a moment, so that is the right resolution and no timezone maths is
     needed. */
  const votesOn = dayText ? new Date(`${dayText}T00:00:00Z`) : null;

  /* A contest fought in one state names it; a national one names nothing. The
     browser sends whatever the picker held, and a presidential project ignores
     it — a national contest covering "one state" is not a thing. */
  const scopeStates =
    kind === "PRESIDENTIAL"
      ? []
      : formData.getAll("scopeStates").map((code) => String(code)).filter(Boolean);

  if (kind !== "PRESIDENTIAL" && scopeStates.length === 0) {
    return { error: "Choose the state this election is fought in." };
  }

  try {
    const made = await elections.create({
      title,
      kind,
      votesOn,
      scopeStates,
      note: String(formData.get("note") ?? "").trim() || null,
      createdBy: user.id,
    });

    /* Whoever started it is looking at it. Anything else means filing into a
       project you are not watching. */
    await chooseElection(made.id);
    await log(user, "election:created", made.id, { title: made.title });

    revalidatePath("/", "layout");
    return { ok: true, id: made.id, title: made.title };
  } catch (error) {
    return { error: error.message ?? "That project could not be started." };
  }
}

export async function switchElection(formData) {
  await requireUser();

  const id = String(formData.get("electionId") ?? "");
  const found = await elections.get(id);
  /* An id that names nothing is ignored rather than stored: a cookie pointing
     at a project that does not exist would leave every dashboard querying a
     dead id. */
  if (!found) return;

  await chooseElection(found.id);

  /* ── A POSITION BELONGS TO THE PROJECT IT WAS CHOSEN IN ──────────────────
     The position is remembered in its own cookie, so without this it follows
     you from one project into the next. Somebody reading the governorship on
     an off-cycle project, switching to a presidential night, would land on a
     contest that project does not hold and see a correctly rendered, entirely
     empty map — the one screen state this product must never produce by
     accident, because "nothing has been filed" and "you are looking at the
     wrong contest" are indistinguishable on it.

     Cleared rather than translated: each project then opens on its own
     headline contest, and the position picker is one click away for anybody
     who wants a different one. */
  await forgetRace();

  revalidatePath("/", "layout");
}

/**
 * Which position on the ballot you are looking at.
 *
 * ── OPEN TO ANYBODY SIGNED IN, LIKE SWITCHING PROJECT ──────────────────────
 * It changes what is drawn and nothing else. Nothing is written, nothing is
 * counted differently, and every contest is equally readable by whoever
 * may read the room at all — so this is gated on being signed in and on the
 * position existing, which `chooseRace` checks before it writes the cookie.
 *
 * Every dashboard is revalidated rather than only the one that called: the
 * position is a property of the browser, so the desk, the broadcast frames and
 * the divergence room are all now showing a different contest too, and a stale
 * one left rendered is a screen quietly disagreeing with the room next door.
 */
export async function switchRace(formData) {
  await requireUser();
  await chooseRace(String(formData.get("race") ?? ""));
  revalidatePath("/", "layout");
}

/**
 * Removing a project.
 *
 * ── NARROWER THAN CREATING ONE ─────────────────────────────────────────────
 * A situation room may start a project, because starting one costs nothing
 * and getting it wrong is fixed by starting another. Only an administrator may
 * remove one, because removal is the single action in this product that
 * destroys a record rather than adding one, and the returns inside a project
 * may be the only independent copy of what a booth reported.
 *
 * ── AND IT ASKS FOR THE NAME ───────────────────────────────────────────────
 * Confirming by typing the title is not theatre. The failure this guards
 * against is not somebody who wants to delete the wrong project, it is
 * somebody who means to delete "Ekiti rehearsal" at two in the morning and has
 * the live presidential night selected. A yes/no dialog does not catch that.
 * Typing the name does, because you cannot type it without reading it.
 */
export async function deleteElection(_previous, formData) {
  const user = await requireUser();

  if (user.role !== "SUPER_ADMIN") {
    return { error: "Only an administrator can remove an election project." };
  }

  const id = String(formData.get("electionId") ?? "");
  const project = await elections.get(id);
  if (!project) return { error: "That project no longer exists." };

  const typed = String(formData.get("confirm") ?? "").trim();
  if (typed !== project.title) {
    return { error: `Type the title exactly to confirm: ${project.title}` };
  }

  const held = await elections.weight(id);
  const withContents = String(formData.get("withContents") ?? "") === "yes";

  if (!held.empty && !withContents) {
    return {
      error:
        `${project.title} holds ${held.results} returns, ${held.incidents} incidents and ` +
        `${held.declared} declared figures. Tick the box to remove them with it.`,
      held,
    };
  }

  /* Written before the deletion, not after: an audit entry describing rows
     that no longer exist is still the only record that they did. */
  await log(user, "election.delete", project.title, {
    id: project.id,
    results: held.results,
    incidents: held.incidents,
    declared: held.declared,
  });

  const gone = await elections.remove(id, { withContents: true });
  if (!gone.ok) return { error: "That project could not be removed." };

  /* The cookie may still name it. Left alone it would leave every dashboard
     querying a dead id, so the next read falls through to whatever remains. */
  const rest = await elections.list();
  if (rest[0]) await chooseElection(rest[0].id);

  revalidatePath("/", "layout");
  return { ok: true, title: project.title };
}
