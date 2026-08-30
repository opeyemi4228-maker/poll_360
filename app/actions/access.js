"use server";

import { headers } from "next/headers";

import { accessRequests } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { resolveTerritory } from "@/lib/constituencies";
import { isRace, raceLabel } from "@/lib/races";
import { describeTerritory, levelForRace } from "@/lib/territory";

/**
 * "Request access", the front door.
 *
 * Accounts are issued to named people by the room they work for, so this is
 * not a sign-up: it starts a conversation and records the facts that make the
 * first meeting useful — who you are, which of the day's contests you are
 * covering, which piece of Nigeria, when it votes, and how many booths you can
 * actually put a named agent in.
 *
 * ── TWO OF THOSE ARE CHOSEN, NOT DESCRIBED ─────────────────────────────────
 * The contest and the place used to be one text box headed "Which election",
 * and what came back was prose. Nobody could issue an account from prose
 * without writing back to ask, and the account eventually issued had no
 * recorded relationship to what had been asked for — so "they asked for
 * Kaduna Central and were given Kaduna" was not a mistake anybody could find.
 * Both are now chosen from the same tables the approval screen issues against.
 *
 * ── WHY IT ASKS FOR SO LITTLE ──────────────────────────────────────────────
 * No job title, no company size, no "how did you hear about us". Every field
 * on this form is one somebody has to type on a phone, and every one that is
 * not used in the reply is a field that should not exist. A product that tells
 * agents not to collect more than they need has to hold itself to it first.
 * ───────────────────────────────────────────────────────────────────────────
 */

const KINDS = new Set(["situation-room", "broadcaster", "observer", "campaign", "other"]);

/* Said as somebody asking would say it, because this is the sentence they
   read when the two answers do not go together. */
const LEVEL_ASKED = {
  NATION: "the whole federation",
  STATE: "one state",
  SENATORIAL: "one senatorial district",
  FEDERAL: "one federal constituency",
  LGA: "one local government",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(value, max) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

export async function requestAccess(_previous, formData) {
  const list = await headers();
  const ip = (list.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();

  /* Three a day from one address is a generous ceiling for a form nobody needs
     to submit twice, and a low one for anybody filling the table with noise. */
  const limit = rateLimit(`access:${ip}`, { limit: 3, windowMs: 24 * 60 * 60 * 1000 });
  if (!limit.ok) {
    return {
      error: "We already have a request from you today. We will come back to you shortly.",
    };
  }

  const values = {
    organisation: clean(formData.get("organisation"), 160),
    name: clean(formData.get("name"), 120),
    email: clean(formData.get("email"), 160).toLowerCase(),
    phone: clean(formData.get("phone"), 40) || null,
    kind: clean(formData.get("kind"), 40),
    election: clean(formData.get("election"), 160) || null,
    message: clean(formData.get("message"), 2000) || null,
  };

  const unitsRaw = clean(formData.get("units"), 12).replace(/[^\d]/g, "");
  values.units = unitsRaw ? Math.min(Number(unitsRaw), 176623) : null;

  /* ── WHICH CONTEST, AND OVER WHAT GROUND ────────────────────────────────
     Both are chosen from lists on the form and both are checked again here,
     because a server action is a public endpoint: "the form only offers real
     districts" is a description of the form, not a property of the request.

     They are checked against each other as well as separately. A senatorial
     district is a perfectly good territory and a nonsensical answer to a
     governorship, and an account issued on that pairing would cover a third
     of the state it was supposed to cover with nothing anywhere saying so. */
  values.race = clean(formData.get("race"), 40).toUpperCase() || null;
  values.territory = clean(formData.get("territory"), 80) || null;

  /* Honeypot. A field no human sees and every naive bot fills. Answered with
     the same success state as a real submission, so whatever filled it learns
     nothing and goes away satisfied. */
  if (clean(formData.get("website"), 100)) return { ok: true };

  const errors = {};
  if (!values.organisation) errors.organisation = "Tell us which room this is for.";
  if (!values.name) errors.name = "Tell us who you are.";
  if (!values.email) errors.email = "We need an email address to reply to.";
  else if (!EMAIL.test(values.email)) errors.email = "That does not look like an email address.";
  if (!KINDS.has(values.kind)) errors.kind = "Pick the one that fits best.";

  if (!values.race || !isRace(values.race)) {
    errors.race = "Choose the contest you are covering.";
  } else {
    const wanted = levelForRace(values.race);
    const place = values.territory ? resolveTerritory(values.territory) : null;

    if (!place) {
      errors.territory = "Choose the place you are covering.";
    } else if (place.level !== wanted) {
      /* Only reachable by a request that did not come from this form, or by
         one that came from it before the contest was changed underneath. */
      errors.territory = `A ${raceLabel(values.race).toLowerCase()} is counted over ${LEVEL_ASKED[wanted]}, and ${describeTerritory(place)} is not one.`;
    }
  }

  if (Object.keys(errors).length) return { errors, values };

  try {
    await accessRequests.create(values);
  } catch {
    return {
      error:
        "Something went wrong saving that. Please try again, or write to access@poll360.ng and a person will pick it up.",
    };
  }

  return { ok: true, name: values.name };
}
