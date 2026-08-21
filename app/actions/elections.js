"use server";

import { revalidatePath } from "next/cache";

import { chooseElection } from "@/lib/election-scope";
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
  revalidatePath("/", "layout");
}
