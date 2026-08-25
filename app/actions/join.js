"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { users } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { isNigerianMobile, normalisePhone } from "@/lib/phone";
import { isUnitCode, parseUnitCode } from "@/lib/units";

/**
 * A polling unit coordinator asking to be let in.
 *
 * ── WHY THERE IS A SIGN-UP AT ALL ──────────────────────────────────────────
 * Until now every account was issued by an administrator, one at a time, with
 * a passphrase read down a phone line. That is exactly right for a newsroom
 * desk and hopeless for four thousand booth agents recruited in the fortnight
 * before polling day. The bottleneck was never the decision — it was the
 * typing, and the person best placed to type an agent's name, phone number and
 * unit code is the agent.
 *
 * ── AND WHY APPROVAL IS STILL A HUMAN ──────────────────────────────────────
 * The decision stays with the administrator, because it is the decision that
 * matters: an approved account can put figures into the count. So a sign-up
 * creates a real account in a real state — PENDING — that can sign in, can see
 * exactly where it stands, and can file nothing at all. Nothing it does before
 * approval reaches a single total.
 *
 * That is deliberately not "create a disabled account". Disabled means somebody
 * turned it off; pending means nobody has looked yet. A queue that could not
 * tell those apart would either bury real applicants among revoked accounts or
 * quietly reinstate somebody who was removed last week.
 *
 * ── WHAT IS CHECKED HERE AND NOWHERE ELSE ──────────────────────────────────
 * The form checks the same things in the browser as a courtesy. This is the
 * copy that counts, because a server action is a public endpoint and "the form
 * requires it" is a suggestion to whoever is using the form.
 * ───────────────────────────────────────────────────────────────────────────
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Long enough to matter, short enough to type on a phone in the dark. Length
   is the only rule: a composition rule ("one capital, one symbol") produces
   Password1! and a false sense of having asked for something. */
const MIN_PASSWORD = 10;

export async function joinAsCoordinator(_previous, formData) {
  const list = await headers();
  const ip = (list.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();

  /* Five from one address in an hour. A coordinator signing up their whole
     ward from one phone is a real thing and this leaves room for it; a script
     filling the approval queue with noise is not. */
  const limit = rateLimit(`join:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return {
      error:
        "That is several sign-ups from this connection in the last hour. " +
        "Wait a few minutes and try again.",
    };
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 160);
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const unitRaw = String(formData.get("unitCode") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  /* `normalisePhone` puts a number into one shape; it does not judge whether
     it is a number. A Nigerian mobile is 234 plus ten digits, and anything
     that does not come out that length is a typo rather than a phone. Left
     unchecked, "0803" became "0803" and sat in the queue as a contact nobody
     could ring. */
  const cleaned = rawPhone ? normalisePhone(rawPhone) : null;
  /* The rule itself is in lib/phone.js, so the two sign-up paths and every
     script that takes a number agree on what one is. */
  const phone = isNigerianMobile(cleaned) ? cleaned : null;

  const errors = {};
  if (!name) errors.name = "Tell us your name, as your coordinator knows it.";
  if (!phone && !email) {
    errors.phone = "A phone number or an email address is needed to sign in.";
  }
  if (rawPhone && !phone) errors.phone = "That does not look like a Nigerian phone number.";
  if (email && !EMAIL.test(email)) errors.email = "That does not look like an email address.";
  if (!isUnitCode(unitRaw)) {
    errors.unitCode =
      "Type your polling unit code as it is printed on the sheet, for example 01/01/04/006.";
  }
  if (password.length < MIN_PASSWORD) {
    errors.password = `Choose a password of at least ${MIN_PASSWORD} characters. Length is what makes it hard to guess.`;
  }

  if (Object.keys(errors).length) return { errors, values: { name, email, phone: rawPhone, unitCode: unitRaw } };

  /* ── AN ACCOUNT THAT ALREADY EXISTS IS NOT A SIGN-UP ─────────────────────
     Told plainly rather than answered with a generic failure. This is not a
     sign-in form and the address is not a secret worth protecting here: the
     alternative is somebody signing up four times, wondering why nothing
     happens, and ringing the desk on polling morning. */
  if (email && (await users.findByEmail(email))) {
    return { errors: { email: "An account already uses that email. Sign in instead." } };
  }
  if (phone && (await users.findByPhone(phone))) {
    return { errors: { phone: "An account already uses that number. Sign in instead." } };
  }

  const unit = parseUnitCode(unitRaw);

  const user = await users.request({
    name,
    email: email || null,
    phone,
    passwordHash: await hashPassword(password),
    /* The booth they say they are at. It is a claim until an administrator
       agrees with it, which is the entire point of the queue — and the
       approval screen can correct it, because the likeliest thing on this
       form to be wrong is nine digits typed off a form in the dark. */
    scope: unit.code,
  });

  /* Signed in immediately, on purpose. There is nothing to protect — the
     account can read nothing and file nothing — and the alternative is telling
     somebody their application went somewhere they cannot see. They land on a
     page that says exactly where it is. */
  await createSession(user.id, {
    userAgent: list.get("user-agent") ?? undefined,
    remember: true,
  });

  redirect("/pending");
}
