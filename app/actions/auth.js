"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { users } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession, destroySession, sweepExpiredSessions } from "@/lib/session";
import { rateLimit, consume, clearLimit } from "@/lib/ratelimit";
import { homeFor } from "@/lib/roles";

/**
 * Sign in.
 *
 * ── ONE ERROR MESSAGE ──────────────────────────────────────────────────────
 * Wrong password, no such account, disabled account: all answer "those details
 * do not match an account". Distinguishing them turns the form into a way of
 * asking whether a given phone number belongs to an agent, which, for a
 * product whose users are named political operatives in a live election, is a
 * question we must not answer.
 *
 * The one exception is being rate-limited, which the person genuinely needs
 * told, and which reveals nothing about whether the account exists.
 * ───────────────────────────────────────────────────────────────────────────
 */

/** "+234 803 000 0000" and "08030000000" are the same person. */
function normalise(contact) {
  const value = contact.trim();
  if (value.includes("@")) return { email: value.toLowerCase() };

  const digits = value.replace(/[^\d]/g, "");
  /* Nigerian numbers arrive as 0803…, 234803… and +234803…; store and match
     the local 0-prefixed form. */
  const local = digits.startsWith("234") ? `0${digits.slice(3)}` : digits;
  return { phone: local };
}

async function callerKey() {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? list.get("x-real-ip") ?? "local").trim();
}

export async function signIn(_previous, formData) {
  const contact = String(formData.get("contact") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!contact || !password) {
    return { error: "Enter your email or phone number and your password." };
  }

  const ip = await callerKey();
  const identity = normalise(contact);
  const identityKey = identity.email ?? identity.phone ?? contact.toLowerCase();

  /* Two buckets: this machine, and this account. Checked, not spent, only a
     failed attempt below costs anything, so getting it right on the third try
     leaves the budget intact and a shared newsroom address is not exhausted by
     six people simply arriving for work.

     The address limit is the looser of the two because an office, a campus or
     a phone network is one address to us; the per-account limit is what
     actually stops somebody grinding a single known agent. */
  const ipKey = `signin:ip:${ip}`;
  const idKey = `signin:id:${identityKey}`;

  const byIp = rateLimit(ipKey, { limit: 30 });
  const byIdentity = rateLimit(idKey, { limit: 8 });

  if (!byIp.ok || !byIdentity.ok) {
    const wait = Math.max(byIp.retryAfter, byIdentity.retryAfter);
    const minutes = Math.ceil(wait / 60);
    return {
      error:
        `Too many failed attempts for this account. Try again in ${minutes} minute` +
        `${minutes === 1 ? "" : "s"}, or ask whoever issued your account to reset it.`,
    };
  }

  const found = identity.email
    ? users.findByEmail(identity.email)
    : users.findByPhone(identity.phone);
  const user = found;

  /* Verify even when there is no user, against a throwaway hash, so a missing
     account and a wrong password take the same time to answer. Without this
     the response time alone enumerates the register. */
  const hash =
    user?.passwordHash ??
    "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
      "Ly8gbm90IGEgcmVhbCBoYXNoLCBqdXN0IHNvbWV0aGluZyB0byBzcGVuZCB0aGUgc2FtZSB0aW1lIG9uLg==";

  const ok = await verifyPassword(password, hash);

  if (!user || !ok || user.disabledAt) {
    /* Only now is the attempt spent. */
    consume(ipKey);
    consume(idKey);
    return { error: "Those details do not match an account." };
  }

  /* A correct sign-in wipes the failures before it, for this account and for
     the address it came from. */
  clearLimit(idKey);
  clearLimit(ipKey);

  const list = await headers();
  await createSession(user.id, {
    userAgent: list.get("user-agent") ?? undefined,
    remember: formData.get("remember") != null,
  });
  users.markSignedIn(user.id);
  await sweepExpiredSessions();

  /* Each role has its own room, and signing in should land in it rather than
     in a lobby with links to it. */
  redirect(homeFor(user.role));
}

export async function signOut() {
  await destroySession();
  redirect("/");
}
