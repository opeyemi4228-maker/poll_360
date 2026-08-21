"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";

import { users, results } from "@/lib/db";
import { ledger, CREDIT_KINDS } from "@/lib/ledger";
import { hashPassword } from "@/lib/password";
import { requireCapability, log } from "@/lib/guard";
import { ROLE_KEYS } from "@/lib/roles";

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

/**
 * Four words from a small list beats twelve random characters: it survives
 * being read down a phone line to a newsroom at 2am, which is exactly how this
 * credential will actually be delivered.
 */
const WORDS = [
  "ballot", "booth", "collate", "counted", "declare", "district", "federal", "gazette",
  "harmony", "ledger", "margin", "monitor", "notice", "observer", "polling", "quorum",
  "record", "return", "sealed", "station", "tally", "turnout", "unit", "verify",
  "warrant", "witness", "zonal", "coverage", "register", "mandate",
];

function passphrase() {
  const bytes = randomBytes(4);
  const words = [...bytes].map((byte) => WORDS[byte % WORDS.length]);
  /* A number on the end so it clears "must contain a digit" policies without
     making the whole thing unsayable. */
  return `${words.join("-")}-${10 + (randomBytes(1)[0] % 90)}`;
}

export async function issueAccount(_previous, formData) {
  const admin = await requireCapability("accounts:issue", "/admin");

  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 160);
  const phone = String(formData.get("phone") ?? "").replace(/[^\d]/g, "").slice(0, 15) || null;
  const role = String(formData.get("role") ?? "");
  const scope = String(formData.get("scope") ?? "").trim().slice(0, 40) || null;

  const errors = {};
  if (!name) errors.name = "Give the account a name.";
  if (!email && !phone) errors.email = "An email or a phone number is required to sign in.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = "That is not an email address.";
  if (!ROLE_KEYS.includes(role)) errors.role = "Pick a room.";
  if (role === "PU_AGENT" && !scope) errors.scope = "A coordinator must be tied to one polling unit.";

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
    passwordHash: await hashPassword(password),
  });

  await log(admin, "account:issued", user.id, { role, scope });
  revalidatePath("/admin");

  /* Returned to the screen once, and to nowhere else. */
  return { issued: { name: user.name, email: user.email, phone: user.phone, role, password } };
}

/** Verify or dispute a filed return. Never by the person who filed it. */
export async function reviewResult(_previous, formData) {
  const admin = await requireCapability("results:verify", "/admin");

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!["VERIFIED", "DISPUTED", "SUBMITTED"].includes(status)) {
    return { error: "Unknown status." };
  }

  const row = (await results.recent(500)).find((r) => r.id === id);
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
