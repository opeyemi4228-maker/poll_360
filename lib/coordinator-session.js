import { cache } from "react";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { redirect } from "next/navigation";

import { coordinators, coordinatorSessions } from "./coordinators.js";

/**
 * Coordinator sessions.
 *
 * ── A TWIN OF lib/session.js, AND DELIBERATELY NOT A SHARED ONE ────────────
 * Every rule in there applies here: the cookie carries an opaque random token
 * and nothing else, the token is stored hashed so a leaked backup holds no
 * usable credentials, and who is asking is read from the database on every
 * request so that revoking a session or suspending an account takes effect on
 * the next click.
 *
 * What is not shared is the cookie name and the table. That is the whole point
 * of the separation: a coordinator's token is meaningless to lib/session.js
 * and a staff token is meaningless here, so neither can ever be presented to
 * the other's lookup. Parameterising one module over a table name would have
 * saved perhaps forty lines and made a single mistyped argument into a
 * privilege escalation.
 *
 * ── THE COST, WHICH IS REAL ────────────────────────────────────────────────
 * Two sweepers, two cookies, two sign-out paths. A change to how sessions work
 * has to be made twice, and the second one is the one that gets forgotten.
 * That is the trade this design makes on purpose; it is written here so that
 * whoever changes lib/session.js next sees where its twin lives.
 * ───────────────────────────────────────────────────────────────────────────
 */

/* A different name from `poll360_session`, so a browser can hold both at once
   without either overwriting the other. An administrator checking what an
   agent sees does not get signed out of the console to do it. */
const COOKIE = "poll360_agent";
const TTL_DAYS = 30;

const digest = (token) => createHash("sha256").update(token).digest("hex");

/**
 * ── WHY THIS LASTS LONGER THAN A STAFF SESSION ─────────────────────────────
 * A newsroom session is a fortnight because a newsroom laptop is shared and a
 * desk is staffed in shifts. A coordinator's phone is theirs alone, they sign
 * up days or weeks before polling day, and the single worst moment for this
 * product is an agent standing at a booth at 8am being asked for a password
 * they set a fortnight ago and cannot remember. Thirty days covers the gap
 * between signing up and polling day, which is the whole life of the account.
 */
export async function createCoordinatorSession(coordinatorId, { userAgent } = {}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

  await coordinatorSessions.create({
    id: digest(token),
    coordinatorId,
    expiresAt,
    userAgent: userAgent?.slice(0, 255) ?? null,
  });

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

/**
 * Who is filing, or null.
 *
 * Wrapped in React's `cache` so the header, the page and anything else asking
 * during one request share a single lookup, exactly as `currentUser` does.
 */
export const currentCoordinator = cache(async function currentCoordinator() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return await coordinatorSessions.find(digest(token));
});

export async function destroyCoordinatorSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;

  /* Signing out is the one action that has to work unconditionally, so a
     token that has already expired and been swept must not throw. */
  if (token) await coordinatorSessions.destroy(digest(token));
  jar.delete(COOKIE);
}

/**
 * The way into the filing screens.
 *
 * ── THREE ANSWERS, NOT TWO ─────────────────────────────────────────────────
 * Signed out goes to the sign-in page. Signed in but not yet approved goes to
 * the waiting page, which says where they stand — refusing them the way a
 * wrong password is refused is exactly how somebody decides their sign-up
 * failed and does it four more times. Only an account that may actually file
 * is returned.
 *
 * Checked here rather than in each page, because "may this account do anything
 * at all" is the question this function exists to answer, and a screen that
 * forgot to ask would be a screen a pending account could file from.
 */
export async function requireCoordinator() {
  const person = await currentCoordinator();
  if (!person) redirect("/agent/login");
  if (!person.canFile) redirect("/agent/pending");
  return person;
}

/** Housekeeping, called opportunistically on sign-in. Twin of the staff sweep. */
export async function sweepExpiredCoordinatorSessions() {
  await coordinatorSessions.sweepExpired();
}
