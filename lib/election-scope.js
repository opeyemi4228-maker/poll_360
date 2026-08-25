import { cookies } from "next/headers";
import { cache } from "react";

import { elections } from "./elections.js";
import { defaultRace, isRace } from "./races.js";

/**
 * Which election project this browser is looking at.
 *
 * ── WHY THIS IS A SEPARATE MODULE ──────────────────────────────────────────
 * `cookies()` comes from next/headers, which exists only in server components
 * and server actions. lib/elections.js is reached from the switcher's action,
 * and that action is imported by the switcher itself, which is a client
 * component — so a next/headers import over there is pulled into the browser
 * bundle and the build refuses it. The data accessors stay portable; anything
 * cookie-shaped lives here, and only servers import it.
 *
 * ── AND WHY A COOKIE RATHER THAN A COLUMN ──────────────────────────────────
 * A session is an identity. This is a view preference, and two people signed
 * in to the same room account may reasonably be watching different nights.
 * ───────────────────────────────────────────────────────────────────────────
 */
const COOKIE = "poll360_election";

/**
 * Every project, once per request.
 *
 * ── WHY THIS IS WRAPPED AND `elections.list` IS NOT ────────────────────────
 * Three things want this list on a single render: the page, the shell that
 * frames it, and the fallback below. Un-deduplicated that is three identical
 * round trips to a database that is no longer on this machine, which cost
 * nothing when it was a file and cost a second each when it stopped being one.
 *
 * React's `cache` scopes the answer to the request, so the three callers share
 * one query and a later request still sees a project created since. The
 * accessor itself stays uncached, because a script or a job outside a request
 * has no such scope and should not inherit a stale list.
 */
export const listElections = cache(async function listElections() {
  return elections.list();
});

/** What the reader is looking at, falling back to whatever exists. */
export const currentElection = cache(async function currentElection() {
  const jar = await cookies();
  const chosen = jar.get(COOKIE)?.value;

  if (chosen) {
    const found = await elections.get(chosen);
    /* A cookie naming a project that has since been removed must not leave
       every dashboard querying a dead id — it falls through instead. */
    if (found) return found;
  }

  /* No preference stated. Open on the night that is actually happening,
     rather than on whichever project happens to sort first. */
  const busiest = await elections.mostActive();
  if (busiest) return busiest;

  const [first] = await listElections();
  return first ?? null;
});

/**
 * Which position on the ballot this browser is looking at.
 *
 * ── WHY THE POSITION IS A VIEW AND NOT A PROJECT ───────────────────────────
 * A project is the election day. The five contests held on it are read one at
 * a time, because they are five separate counts that must never be summed —
 * so which one is on screen is a property of the reader, exactly like which
 * project they are watching, and it lives in exactly the same place.
 *
 * ── AND WHY A COOKIE FOR A PROJECT IT MAY NOT BELONG TO ────────────────────
 * A browser left on Governorship and then switched to a presidential-only
 * project would otherwise be reading a contest that project does not hold, and
 * every screen would show a perfectly formatted zero. There is nothing to
 * repair on the way in: the fallback is the project's own headline contest,
 * which is what the day is named after and the one thing certain to have
 * returns in it.
 */
const RACE_COOKIE = "poll360_race";

export const currentRace = cache(async function currentRace(project) {
  const jar = await cookies();
  const chosen = jar.get(RACE_COOKIE)?.value;
  if (chosen && isRace(chosen)) return String(chosen).toUpperCase();

  return defaultRace(project ?? (await currentElection()));
});

/** Remember the position for this browser. */
export async function chooseRace(race) {
  if (!isRace(race)) return;
  const jar = await cookies();
  jar.set(RACE_COOKIE, String(race).toUpperCase(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

/**
 * Forget the position, so the next project opens on its own headline contest.
 *
 * Called when the project changes. A position is meaningful inside a project
 * and meaningless across them: the five contests of one election day are not
 * the five contests of another, and carrying a choice over is how somebody
 * ends up reading an empty map that is empty for the wrong reason.
 */
export async function forgetRace() {
  const jar = await cookies();
  jar.delete(RACE_COOKIE);
}

/** Remember the choice for this browser. */
export async function chooseElection(id) {
  const jar = await cookies();
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}
