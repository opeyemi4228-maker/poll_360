"use server";

import { headers } from "next/headers";

import { accessRequests } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";

/**
 * "Request access" — the front door.
 *
 * Accounts are issued to named people by the room they work for, so this is
 * not a sign-up: it starts a conversation and records the four facts that make
 * the first meeting useful — who you are, what you are covering, when, and how
 * many booths you can actually put a named agent in.
 *
 * ── WHY IT ASKS FOR SO LITTLE ──────────────────────────────────────────────
 * No job title, no company size, no "how did you hear about us". Every field
 * on this form is one somebody has to type on a phone, and every one that is
 * not used in the reply is a field that should not exist. A product that tells
 * agents not to collect more than they need has to hold itself to it first.
 * ───────────────────────────────────────────────────────────────────────────
 */

const KINDS = new Set(["situation-room", "broadcaster", "observer", "campaign", "other"]);

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

  if (Object.keys(errors).length) return { errors, values };

  try {
    accessRequests.create(values);
  } catch {
    return {
      error:
        "Something went wrong saving that. Please try again, or write to access@poll360.ng and a person will pick it up.",
    };
  }

  return { ok: true, name: values.name };
}
