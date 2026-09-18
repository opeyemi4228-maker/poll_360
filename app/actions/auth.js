"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { users } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession, destroySession, sweepExpiredSessions } from "@/lib/session";
import { attempt, spend, clear } from "@/lib/ratelimit";
import { clientAddress, limiterKey } from "@/lib/client-ip";
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

/**
 * Which caller this is, for the purpose of counting their failures.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS READ THE FIRST ENTRY OF X-FORWARDED-FOR, WHICH THE CALLER SENDS
 *
 *  A header anybody can set was the key the sign-in limiter counted against.
 *  Set it to something different on every request and every request is a new
 *  caller: the limiter kept counting, kept firing, kept looking like it
 *  worked, and stopped nobody. Eight attempts per account was unlimited
 *  attempts per account for anybody who thought to try.
 *
 *  `limiterKey` returns an address only when it can be established — counted
 *  in past the proxies we actually run, or taken from a header the platform
 *  sets and strips from anything inbound. When it cannot be established,
 *  every such caller shares one bucket, which is blunt and is the safe
 *  direction to be blunt in. See lib/client-ip.js.
 * ══════════════════════════════════════════════════════════════════════════
 */
async function callerKey() {
  return limiterKey(clientAddress(await headers()));
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

  /* ── COUNTED ACROSS EVERY INSTANCE, NOT JUST THIS ONE ──────────────────
     The limiter's counters used to live in one process's memory, so on a
     platform that runs the application in as many instances as the traffic
     asks for, "eight attempts" was eight attempts per instance — and a
     caller working through a password list was handed a fresh budget every
     time they were routed somewhere new. On a quiet night there is one
     instance and it worked. On the night somebody is actually attacking it,
     there are forty. See lib/shared-counter.js.

     Asked in parallel because they are two independent questions and this is
     on the path between a person and their dashboard. */
  const [byIp, byIdentity] = await Promise.all([
    attempt(ipKey, { limit: 30 }),
    attempt(idKey, { limit: 8 }),
  ]);

  if (!byIp.ok || !byIdentity.ok) {
    const wait = Math.max(byIp.retryAfter, byIdentity.retryAfter);
    const minutes = Math.ceil(wait / 60);
    return {
      error:
        `Too many failed attempts for this account. Try again in ${minutes} minute` +
        `${minutes === 1 ? "" : "s"}, or ask whoever issued your account to reset it.`,
    };
  }

  /* ── AN OUTAGE IS NOT A WRONG PASSWORD ────────────────────────────────
     The database is across a network now, and when it could not be reached
     this threw, the action returned nothing, and the form re-rendered with no
     message at all. To the person signing in that is indistinguishable from
     mistyping, so they try again, and again, and the only place the real
     cause appears is a server log they cannot see.

     A failure to reach the database is therefore reported as itself. It is
     also deliberately NOT counted against their rate limit: being unable to
     reach the database is not a failed attempt, and locking somebody out for
     an outage they did not cause is the last thing this should do. */
  let found;
  try {
    found = identity.email
      ? await users.findByEmail(identity.email)
      : await users.findByPhone(identity.phone);
  } catch (error) {
    console.error("sign in could not reach the database:", error);
    return {
      error:
        "We cannot reach the database at the moment, so we could not check your details. " +
        "Try again in a few seconds. Nothing is wrong with your account.",
    };
  }

  const user = found;

  /* Verify even when there is no user, against a throwaway hash, so a missing
     account and a wrong password take the same time to answer. Without this
     the response time alone enumerates the register. */
  const hash =
    user?.passwordHash ??
    "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
      "Ly8gbm90IGEgcmVhbCBoYXNoLCBqdXN0IHNvbWV0aGluZyB0byBzcGVuZCB0aGUgc2FtZSB0aW1lIG9uLg==";

  const ok = await verifyPassword(password, hash);

  /* ── STAFF ONLY ───────────────────────────────────────────────────────────
     This is Poll360's sign-in, for staff. Agents sign in to their own app, on
     their own domain, with a code — never here, and never with a password. An
     agent account is refused with the same sentence as a wrong password, so
     this form cannot be used to learn which numbers belong to agents. */
  if (!user || !ok || user.disabledAt || user.role === "PU_AGENT") {
    /* Only now is the attempt spent — and it is awaited, because a failure
       that is not recorded before the answer goes back is a failure the next
       attempt does not see. That is the whole of what a limiter is. */
    await Promise.all([spend(ipKey), spend(idKey)]);
    return { error: "Those details do not match an account." };
  }

  /* A correct sign-in wipes the failures before it, for this account and for
     the address it came from. */
  await Promise.all([clear(idKey), clear(ipKey)]);

  const list = await headers();

  await createSession(user.id, {
    userAgent: list.get("user-agent") ?? undefined,
    remember: formData.get("remember") != null,
  });
  await users.markSignedIn(user.id);
  await sweepExpiredSessions();

  /* Each role has its own room, and signing in should land in it rather than
     in a lobby with links to it. An account still waiting to be approved has
     no room yet, and is told so rather than being dropped into one it cannot
     use. */
  redirect(user.status === "PENDING" ? "/pending" : homeFor(user.role));
}

export async function signOut() {
  await destroySession();
  redirect("/");
}
