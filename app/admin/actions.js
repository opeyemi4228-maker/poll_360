"use server";

import { revalidatePath } from "next/cache";

import { users, results, accessRequests } from "@/lib/db";
import { ledger, CREDIT_KINDS } from "@/lib/ledger";
import { hashPassword, passphrase } from "@/lib/password";
import { requireCapability, log } from "@/lib/guard";
import { decideAgent } from "@/lib/databank-agents";
import { currentElection, currentRace } from "@/lib/election-scope";
import { ISSUABLE_ROLES } from "@/lib/roles";
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
  /* ── ISSUABLE, NOT MERELY A ROLE THAT EXISTS ──────────────────────────
     Checked against the shorter list on purpose. `ROLE_KEYS` includes two
     entries nobody issues — a viewer, which is what an account is before it
     is given a room, and the retired staff booth role, which cannot sign in
     at all. Validating against the long list let a form post name either of
     them and produced an account that authenticates and then opens nothing,
     which reads to the person holding it as a broken product rather than as a
     mistake at issue time. */
  if (!ISSUABLE_ROLES.includes(role)) errors.role = "Pick a room.";
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

/* What went wrong, said to the administrator holding the appointment list. */
const DECISION_ERRORS = {
  "already-decided": "Somebody else dealt with this agent a moment ago. Reload the page.",
  "not-found": "That agent is no longer on the list.",
  "bad-unit": "That is not a polling unit code. Four parts, nine digits.",
  duplicate: "This person is already on the list at that polling unit.",
  "not-configured": "This deployment is not connected to Data Bank's agent list yet.",
};
const DECISION_FALLBACK = "Data Bank could not be reached, so nothing was decided. Try again in a minute.";

/**
 * Approve an agent on Data Bank's list, and issue their code.
 *
 * ── THE LIST IS DATA BANK'S; THE DECISION IS MADE HERE ─────────────────────
 * The agent is not a row in this product. Approving sends the decision to
 * Data Bank, which marks them approved and issues the code they will sign in
 * with, and hands that code back exactly once — to this screen, for the
 * administrator to give to the agent.
 *
 * A corrected polling unit is checked here before it is sent, because the
 * unit becomes the first half of the code and a wrong one would put every
 * figure that agent files against a booth in the wrong ward.
 */
export async function approveCoordinator(_previous, formData) {
  const admin = await requireCapability("accounts:issue", "/admin");

  const id = String(formData.get("id") ?? "");
  const typed = String(formData.get("scope") ?? "").trim();

  let unitCode = null;
  if (typed) {
    if (!isUnitCode(typed)) {
      return { errors: { scope: "That is not a polling unit code. Four parts, nine digits." } };
    }
    unitCode = parseUnitCode(typed).code;
  }

  const result = await decideAgent({ id, decision: "APPROVE", unitCode, by: admin.name ?? admin.id });
  if (!result.ok) return { error: DECISION_ERRORS[result.error] ?? DECISION_FALLBACK };

  await log(admin, "agent:approved", id, { unit: result.pollingUnitCode });
  revalidatePath("/admin");
  revalidatePath("/admin/coordinators");

  return { ok: true, name: result.fullName, scope: result.pollingUnitCode, code: result.code };
}

/**
 * Turn an agent down.
 *
 * They stay on Data Bank's list, marked. A refusal that deleted them is one
 * nobody can see afterwards, and the same person arriving again in the next
 * party file would look like a name nobody had seen.
 */
export async function declineCoordinator(_previous, formData) {
  const admin = await requireCapability("accounts:issue", "/admin");

  const id = String(formData.get("id") ?? "");
  const result = await decideAgent({ id, decision: "DECLINE", by: admin.name ?? admin.id });
  if (!result.ok) return { error: DECISION_ERRORS[result.error] ?? DECISION_FALLBACK };

  await log(admin, "agent:declined", id, { unit: result.pollingUnitCode });
  revalidatePath("/admin");
  revalidatePath("/admin/coordinators");

  return { ok: true, declined: result.fullName };
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
