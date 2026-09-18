import { cache } from "react";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";

import { sessions } from "./db";
import { clearCookie, readCookie, writeCookie } from "./session-cookie.js";
import { forgetSession, recogniseWith } from "./session-cache.js";

/**
 * Sessions.
 *
 * ── THE COOKIE CARRIES NOTHING ─────────────────────────────────────────────
 * No user id, no role, no scope, no expiry the client can edit, just an
 * opaque random token. Everything about who is asking is read from the
 * database, which is what makes "revoke this session" and "disable this
 * account" take effect almost immediately rather than whenever a token
 * happens to expire.
 *
 * ── "ALMOST", AND EXACTLY HOW MUCH ─────────────────────────────────────────
 * It used to say "on the next click", because the lookup ran on every single
 * request. That is one database query per request from every signed-in
 * person, which is the busiest query in the product and does not survive a
 * hundred thousand people with a dashboard open. The answer is now held for
 * a few seconds — five in production, none in development — so revoking a
 * session or disabling an account takes effect within that window rather than
 * on the very next request. Signing out is unaffected: the browser no longer
 * has the cookie. lib/session-cache.js sets out each case and how to turn it
 * off.
 *
 * The token is stored *hashed*. A leaked database backup then contains no
 * usable session credentials, exactly as it contains no usable passwords.
 * ───────────────────────────────────────────────────────────────────────────
 */
/* The flags, the name and the `__Host-` prefix live in lib/session-cookie.js,
   shared with the coordinators' twin of this file. Only the table and the
   lifetime are decided here — see the note at the top of that module for why
   the split falls exactly there. */
const COOKIE = "poll360_session";
const TTL_DAYS = 14;

const digest = (token) => createHash("sha256").update(token).digest("hex");

/**
 * `remember` is honoured rather than decorative: unchecked, the cookie has no
 * expiry and dies with the browser, and the row behind it lasts a day instead
 * of a fortnight. On a shared laptop in a newsroom that is the difference
 * between signing out and staying signed in for two weeks.
 */
export async function createSession(userId, { userAgent, remember = true } = {}) {
  const token = randomBytes(32).toString("base64url");
  const days = remember ? TTL_DAYS : 1;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  await sessions.create({
    id: digest(token),
    userId,
    expiresAt,
    userAgent: userAgent?.slice(0, 255) ?? null,
  });

  const jar = await cookies();
  writeCookie(jar, COOKIE, token, remember ? { expires: expiresAt } : {});

  return token;
}

/**
 * Who is asking, or null.
 *
 * One query, and it checks the account is still enabled in the same statement
 * as the session lookup, so a disabled account and a missing session are the
 * same answer here rather than two code paths that can drift apart.
 */
/**
 * Who is asking, or null.
 *
 * Wrapped in React's `cache`, so the masthead, the page and anything else that
 * asks during one request share a single lookup instead of hitting the
 * database three times to answer the same question.
 */
export const currentUser = cache(async function currentUser() {
  const jar = await cookies();
  const token = readCookie(jar, COOKIE);
  if (!token) return null;

  const id = digest(token);

  /* ── AND, UNDER LOAD, SHARED FOR A FEW SECONDS ────────────────────────
     React's `cache` above shares this within one request. `recogniseWith`
     shares it across requests, for a few seconds, which is what makes a
     hundred thousand people with a dashboard open something other than five
     thousand database queries a second.

     It changes the guarantee stated above from "on the next click" to
     "within a few seconds", for the two cases that involve somebody still
     holding a valid cookie — an account being disabled and a session being
     revoked. Signing out is untouched, because the browser no longer has the
     cookie to present. lib/session-cache.js sets out exactly which case is
     affected and how to switch it off. It is off in development.

     Expiry and the account's disabled flag are both checked inside this
     lookup, so there is exactly one definition of "signed in". */
  return await recogniseWith(id, () => sessions.findWithUser(id));
});

export async function destroySession() {
  const jar = await cookies();
  const token = readCookie(jar, COOKIE);

  /* Deleting a session that has already expired and been swept must not
     throw, signing out is the one action that has to work unconditionally. */
  if (token) {
    const id = digest(token);
    forgetSession(id);
    await sessions.destroy(id);
  }

  clearCookie(jar, COOKIE);
}

/** Housekeeping, called opportunistically on sign-in. */
export async function sweepExpiredSessions() {
  await sessions.sweepExpired();
}
