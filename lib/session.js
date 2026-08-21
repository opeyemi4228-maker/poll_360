import { cache } from "react";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";

import { sessions } from "./db";

/**
 * Sessions.
 *
 * ── THE COOKIE CARRIES NOTHING ─────────────────────────────────────────────
 * No user id, no role, no scope, no expiry the client can edit, just an
 * opaque random token. Everything about who is asking is read from the
 * database on every request, which is what makes "revoke this session" and
 * "disable this account" take effect on the next click rather than whenever a
 * token happens to expire.
 *
 * The token is stored *hashed*. A leaked database backup then contains no
 * usable session credentials, exactly as it contains no usable passwords.
 * ───────────────────────────────────────────────────────────────────────────
 */
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
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { expires: expiresAt } : {}),
  });

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
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  /* Expiry and the account's disabled flag are both checked inside this
     lookup, so there is exactly one definition of "signed in". */
  return await sessions.findWithUser(digest(token));
});

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;

  /* Deleting a session that has already expired and been swept must not
     throw, signing out is the one action that has to work unconditionally. */
  if (token) await sessions.destroy(digest(token));

  jar.delete(COOKIE);
}

/** Housekeeping, called opportunistically on sign-in. */
export async function sweepExpiredSessions() {
  await sessions.sweepExpired();
}
