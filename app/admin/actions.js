"use server";

import { revalidatePath } from "next/cache";

import { users, results, accessRequests } from "@/lib/db";
import { ledger, CREDIT_KINDS } from "@/lib/ledger";
import { hashPassword, passphrase } from "@/lib/password";
import { requireCapability, log } from "@/lib/guard";
import { coordinators } from "@/lib/coordinators";
import { currentElection, currentRace } from "@/lib/election-scope";
import { ROLE_KEYS } from "@/lib/roles";
import { isRace, raceLabel } from "@/lib/races";
import { resolveTerritory } from "@/lib/constituencies";
import { describeTerritory, levelForRace } from "@/lib/territory";
import { isUnitCode, parseUnitCode } from "@/lib/units";

/**
 * Issue an account for a room.
 *
 * ── THE PASSWORD IS SHOWN ONCE ─────────────────────────────────────────────
 * Generated here, hashed immediately, and returned to the administrator's
 * screen exactly once. It is never stored in the clear, never emailed by this
 * action, and cannot be retrieved later, losing it means issuing a new one.
 *
 * That is deliberately slightly inconvenient. The alternative, a password the
 * system can show you again, is a password the system is keeping, and the
 * whole point of a credential for a broadcaster's election-night desk is that
 * only the broadcaster has it.
 * ───────────────────────────────────────────────────────────────────────────
 */

export async function issueAccount(_previous, formData) {
  const admin = await requireCapability("accounts:issue", "/admin");

  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 160);
  const phone = String(formData.get("phone") ?? "").replace(/[^\d]/g, "").slice(0, 15) || null;
  const role = String(formData.get("role") ?? "");
  const scope = String(formData.get("scope") ?? "").trim().slice(0, 40) || null;
  const requestId = String(formData.get("requestId") ?? "").trim() || null;

  /* ── WHAT THIS ACCOUNT MAY READ, AND OVER WHAT ──────────────────────────
     A coordinator's ground is their booth: they stand in one place, and the
     unit code above is the whole of it. Every other room is a reader, and a
     reader is defined by a contest and a territory.

     Both are resolved against the same tables the picker was filled from, and
     checked against each other. The pairing check is the one that matters:
     a senatorial district is a perfectly valid territory and a nonsensical
     answer to a governorship, and an account issued on that pairing would
     quietly hold a third of the state it was meant to hold. */
  const wantsGround = role !== "PU_AGENT";
  const race = wantsGround ? String(formData.get("race") ?? "").trim().toUpperCase() || null : null;
  const territoryRaw = wantsGround ? String(formData.get("territory") ?? "").trim().slice(0, 80) || null : null;

  const errors = {};
  if (!name) errors.name = "Give the account a name.";
  if (!email && !phone) errors.email = "An email or a phone number is required to sign in.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = "That is not an email address.";
  if (!ROLE_KEYS.includes(role)) errors.role = "Pick a room.";
  if (role === "PU_AGENT" && !scope) errors.scope = "A coordinator must be tied to one polling unit.";

  let territory = null;
  if (wantsGround) {
    if (!race || !isRace(race)) {
      errors.race = "Say which contest this account is for.";
    } else if (!territoryRaw) {
      errors.territory = "Say how much of the country this account covers.";
    } else {
      territory = resolveTerritory(territoryRaw);
      if (!territory) errors.territory = "That is not a place we hold. Choose it from the list.";
      else if (territory.level !== levelForRace(race)) {
        errors.territory = `A ${raceLabel(race).toLowerCase()} is not counted over ${describeTerritory(territory)}.`;
      }
    }
  }

  if (Object.keys(errors).length) return { errors };

  if (email && await users.findByEmail(email)) {
    return { errors: { email: "An account already uses that email." } };
  }
  if (phone && await users.findByPhone(phone)) {
    return { errors: { phone: "An account already uses that phone number." } };
  }

  const password = passphrase();

  const user = await users.upsert({
    name,
    email: email || null,
    phone,
    role,
    scope,
    race,
    territory: territoryRaw,
    passwordHash: await hashPassword(password),
  });

  /* ── THE REQUEST AND THE ACCOUNT, TIED TOGETHER ─────────────────────────
     Written before the audit line rather than after, because the one question
     anybody asks afterwards is "what were they actually given?" — and a
     request marked approved with no account attached cannot answer it. A room
     that asked for Kaduna Central and was issued Kaduna is a mistake that has
     to be findable, and this is the only place the two halves meet. */
  if (requestId) {
    await accessRequests.decide(requestId, { status: "APPROVED", userId: user.id });
    revalidatePath("/admin/requests");
  }

  await log(admin, "account:issued", user.id, {
    role,
    scope,
    race,
    territory: territoryRaw,
    fromRequest: requestId,
  });
  revalidatePath("/admin");

  /* Returned to the screen once, and to nowhere else. */
  return {
    issued: {
      name: user.name,
      email: user.email,
      phone: user.phone,
      role,
      password,
      /* Printed back on the confirmation, because the ground is the half of
         this decision that cannot be checked by reading the name. */
      ground: territory ? describeTerritory(territory) : null,
      race: race ? raceLabel(race) : null,
    },
  };
}

/**
 * Turn a request down.
 *
 * ── WHY THIS IS A BUTTON AND NOT AN OMISSION ───────────────────────────────
 * A queue that can only be added to is a queue that grows until nobody reads
 * it, and the requests that matter are then behind the ones already answered
 * by email months ago. Declining writes no account, sends nothing, and
 * changes only which list the row appears in — it is housekeeping, and it is
 * recorded like every other decision an administrator makes.
 */
export async function declineRequest(_previous, formData) {
  const admin = await requireCapability("accounts:issue", "/admin");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "No request named." };

  const request = await accessRequests.get(id);
  if (!request) return { error: "That request is no longer there." };

  await accessRequests.decide(id, { status: "DECLINED" });
  await log(admin, "access:declined", id, { organisation: request.organisation });
  revalidatePath("/admin/requests");
  revalidatePath("/admin");

  return { ok: true };
}

/** Verify or dispute a filed return. Never by the person who filed it. */
export async function reviewResult(_previous, formData) {
  const admin = await requireCapability("results:verify", "/admin");

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!["VERIFIED", "DISPUTED", "SUBMITTED"].includes(status)) {
    return { error: "Unknown status." };
  }

  const project = await currentElection();
  const race = await currentRace(project);
  const row = (await results.recent(500, project?.id, race)).find((r) => r.id === id);
  if (!row) return { error: "That return no longer exists." };

  /* The one check that must hold however senior the account: nobody marks
     their own work checked. */
  if (status === "VERIFIED" && row.submittedBy === admin.id) {
    return { error: "You filed this return. Somebody else has to check it." };
  }

  await results.setStatus(id, status, admin.id);
  await log(admin, `result:${status.toLowerCase()}`, row.unitCode);
  revalidatePath("/admin");

  return { ok: true };
}

/* --------------------------------------------------------------- approvals */

/**
 * Let a coordinator in, or turn them down.
 *
 * ── THE DECISION THAT DECIDES WHAT COUNTS ──────────────────────────────────
 * Approving an account is not administration. It is the moment somebody
 * becomes able to put figures into the count, which is the only thing this
 * product is for, so it sits behind the same capability as issuing an account
 * by hand and every call is written to the audit log with the actor on it.
 *
 * ── THE BOOTH CAN BE CORRECTED ON THE WAY THROUGH ──────────────────────────
 * The single likeliest error on the sign-up form is the unit code: nine digits
 * copied off a form on a phone. The person approving is usually the person who
 * knows what it should have been, so they can put it right here rather than
 * declining somebody for a typo and asking them to sign up again.
 */
export async function approveCoordinator(_previous, formData) {
  const admin = await requireCapability("accounts:issue", "/admin");

  const id = String(formData.get("id") ?? "");
  const applicant = await coordinators.byId(id);
  if (!applicant) return { error: "That application no longer exists." };
  if (applicant.status !== "PENDING") {
    return { error: `${applicant.name} has already been dealt with.` };
  }

  /* Blank means "leave it as they typed it". A correction is checked to be a
     real unit code before it replaces one, because an approval that quietly
     wrote nonsense into the booth would produce a coordinator who can file and
     a unit that matches nothing on the map. */
  const typed = String(formData.get("scope") ?? "").trim();
  let unitCode = null;

  if (typed && typed !== applicant.unitCode) {
    if (!isUnitCode(typed)) {
      return { errors: { scope: "That is not a polling unit code. Four parts, nine digits." } };
    }
    unitCode = parseUnitCode(typed).code;
  }

  const person = await coordinators.approve(id, { by: admin.id, unitCode });

  /* ── THE UPDATE IS CONDITIONAL, SO THE RESULT HAS TO BE CHECKED ─────────
     `approve` only touches a row that is still PENDING, which is what stops
     two administrators working the queue at once from each approving the same
     person and the second silently overwriting the first's correction to the
     booth. That guard is worth nothing if nobody looks at what came back. */
  if (!person || person.status !== "ACTIVE") {
    return { error: `${applicant.name} was approved by somebody else a moment ago.` };
  }

  await log(admin, "coordinator:approved", person.id, {
    unit: person.unitCode,
    corrected: Boolean(unitCode),
  });
  revalidatePath("/admin");
  revalidatePath("/admin/coordinators");

  return { ok: true, name: person.name, scope: person.unitCode };
}

/**
 * Turn somebody down.
 *
 * The row stays, marked. A refusal that deleted the application is a refusal
 * nobody can see afterwards, and the same person signing up again an hour
 * later would arrive in the queue looking like a name nobody had seen.
 */
export async function declineCoordinator(_previous, formData) {
  const admin = await requireCapability("accounts:issue", "/admin");

  const id = String(formData.get("id") ?? "");
  const applicant = await coordinators.byId(id);
  if (!applicant) return { error: "That application no longer exists." };

  await coordinators.decline(id, { by: admin.id });
  await log(admin, "coordinator:declined", applicant.id, { unit: applicant.unitCode });
  revalidatePath("/admin");
  revalidatePath("/admin/coordinators");

  return { ok: true, declined: applicant.name };
}


/* ---------------------------------------------------------------- payments */

/**
 * Credit an agent, or settle what they have asked for.
 *
 * ── WHY THIS IS THE ONLY WAY MONEY ENTERS THE LEDGER ───────────────────────
 * Agents can ask; only this action can pay. It is gated on the same capability
 * that issues accounts, every call is written to the audit log with the actor
 * on it, and the entry itself goes into the hash chain, so "who paid this
 * agent, when, and has the figure been touched since" has one answer that
 * cannot be edited afterwards, including by whoever runs the database.
 *
 * Settling a request writes a second entry rather than modifying the first.
 * The request stays in the chain forever, which is the point: the history of a
 * payment is part of the payment.
 * ───────────────────────────────────────────────────────────────────────────
 */
export async function payAgent(_previous, formData) {
  const admin = await requireCapability("accounts:issue", "/admin");

  const contact = String(formData.get("contact") ?? "").trim().toLowerCase();
  const kind = String(formData.get("kind") ?? "STIPEND");
  const naira = String(formData.get("amount") ?? "").replace(/[^\d]/g, "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

  if (!CREDIT_KINDS.includes(kind) && kind !== "WITHDRAWAL") {
    return { error: "That is not a kind of payment this can write." };
  }
  if (!contact) return { errors: { contact: "Who is being paid?" } };
  if (!naira || Number(naira) <= 0) return { errors: { amount: "How much?" } };

  const agent = contact.includes("@")
    ? await users.findByEmail(contact)
    : await users.findByPhone(contact.replace(/[^\d]/g, ""));

  if (!agent) return { errors: { contact: "No account with that email or phone." } };

  const amount = Number(naira) * 100;

  /* Paying out more than an agent has earned is almost always a typo, and the
     one case where it is not can be done as two entries deliberately. */
  if (kind === "WITHDRAWAL" && amount > await ledger.balanceFor(agent.id)) {
    return { error: "That is more than the agent has earned. Credit them first." };
  }

  const entry = await ledger.append({
    userId: agent.id,
    kind,
    amount,
    note,
    actorId: admin.id,
  });

  await log(admin, "wallet:paid", entry.reference, { kind, amount, to: agent.id });

  revalidatePath("/admin");
  revalidatePath("/field");

  return { ok: true, reference: entry.reference, name: agent.name };
}
