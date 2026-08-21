"use server";

import { revalidatePath } from "next/cache";

import { currentUser } from "@/lib/session";
import { ledger } from "@/lib/ledger";
import { audit } from "@/lib/db";
import { rateLimit, consume } from "@/lib/ratelimit";

/**
 * An agent asking for what they are owed.
 *
 * ── THIS RECORDS AN INSTRUCTION, IT DOES NOT MOVE MONEY ────────────────────
 * There is no payment provider wired up, so nothing here transfers naira. It
 * writes a request into the ledger, which somebody with the authority to pay
 * then settles. That is stated on the screen too, because a button that says
 * "Withdraw" and quietly does nothing is the single most damaging thing this
 * product could show a field agent on election day.
 *
 * When a provider is added, exactly one thing changes: a settlement step
 * writes the matching WITHDRAWAL entry. The request, the audit line and the
 * hash chain are already correct.
 * ───────────────────────────────────────────────────────────────────────────
 */
const MINIMUM = 100_000; // ₦1,000 in kobo, below this the fees eat it

export async function requestWithdrawal(_previous, formData) {
  const user = await currentUser();
  if (!user) return { error: "Your session has ended. Sign in again." };

  /* One request at a time is plenty; this stops a double-tap on a bad
     connection turning into two instructions to pay. */
  const key = `withdraw:${user.id}`;
  if (!rateLimit(key, { limit: 3, windowMs: 60 * 60 * 1000 }).ok) {
    return { error: "You have already asked a few times this hour. Give it a moment." };
  }

  const naira = String(formData.get("amount") ?? "").replace(/[^\d]/g, "");
  const amount = Number(naira) * 100;

  if (!amount) return { error: "Enter how much you want to withdraw." };
  if (amount < MINIMUM) return { error: "The smallest withdrawal is ₦1,000." };

  const available = await ledger.balanceFor(user.id) - await ledger.pendingFor(user.id);
  if (amount > available) {
    return {
      error: `That is more than you have available. You can ask for up to ₦${(
        available / 100
      ).toLocaleString("en-NG")}.`,
    };
  }

  const entry = await ledger.append({
    userId: user.id,
    kind: "WITHDRAWAL_REQUESTED",
    amount,
    note: "Requested by the agent",
    actorId: user.id,
  });

  consume(key, { windowMs: 60 * 60 * 1000 });

  await audit.record({
    actorId: user.id,
    action: "wallet:withdrawal-requested",
    subject: entry.reference,
    meta: { amount },
  });

  revalidatePath("/field");
  return { ok: true, reference: entry.reference };
}
