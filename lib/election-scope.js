import { cookies } from "next/headers";
import { cache } from "react";

import { elections } from "./elections.js";

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

  const [first] = await elections.list();
  return first ?? null;
});

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
