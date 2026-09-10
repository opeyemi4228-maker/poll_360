"use server";

import { revalidatePath } from "next/cache";

import { requireUser, log } from "@/lib/guard";
import { can } from "@/lib/roles";
import { broadcastItems } from "@/lib/db";
import { currentElection } from "@/lib/election-scope";
import { KINDS, mayMove, stateLabel } from "@/lib/broadcast";

/**
 * Everything the broadcast desk can change.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE RULE THIS FILE EXISTS TO ENFORCE
 *
 *  Nobody clears their own work.
 *
 *  It is the same rule the count already lives under — `results:verify` is
 *  deliberately not held by the person who files — and it matters more here,
 *  not less, because what comes out of this desk is a sentence in the
 *  organisation's name that cannot be recalled once it has been said.
 *
 *  It is enforced on the item rather than on the role, and that is the whole
 *  design. A newsroom running a night with four people will have all four
 *  holding the same account role; a table that granted "clear" to a role and
 *  stopped there would let any of them wave their own strap through. So the
 *  test is `item.createdBy === user.id`, and it holds however the permissions
 *  are configured, including for the super administrator.
 *
 *  ── AND WHY THE STATE MACHINE IS CHECKED HERE AS WELL AS DRAWN THERE ─────
 *  The room only offers the moves `MOVES` allows. An action that trusted the
 *  screen to have done that would be an action that takes a draft straight to
 *  air for anybody who can post a form — which, on a product whose entire
 *  claim is that nothing unverified reaches the output, is the only bug that
 *  really matters. See lib/broadcast.js.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** Signed in, on this desk, holding this capability. */
async function desk(capability) {
  /* No pathname. `requireUser` reads one as a route to authorise against, and
     a server action is not a route — see app/actions/elections.js, where
     passing one silently redirected instead of doing the work. */
  const user = await requireUser();
  if (!can(user.role, capability)) return { user: null, error: "Your account cannot do that on this desk." };
  return { user, error: null };
}

/**
 * Draft something.
 *
 * Everything arrives as a draft, whatever it is and whoever made it. There is
 * no path that creates an item already cleared: a "create and air" convenience
 * would be the exact hole this desk is built to not have.
 */
export async function draftItem(values) {
  const { user, error } = await desk("broadcast:draft");
  if (error) return { error };

  const kind = String(values?.kind ?? "");
  if (!KINDS[kind]) return { error: "That is not something this desk makes." };

  const title = String(values?.title ?? "").trim();
  if (!title) return { error: "Give it a title. A queue of untitled items is a queue nobody reads." };

  const project = await currentElection();
  if (!project) return { error: "No election project is open." };

  const id = await broadcastItems.create({
    electionId: project.id,
    kind,
    state: "DRAFT",
    race: values?.race ?? null,
    scope: values?.scope ?? null,
    title,
    body: values?.body ? String(values.body) : null,
    payload: values?.payload ?? null,
    platforms: values?.platforms ?? [],
    verdict: null,
    scheduledFor: values?.scheduledFor ? new Date(values.scheduledFor) : null,
    createdBy: user.id,
    createdName: user.name,
  });

  await log(user, "broadcast:drafted", id, { kind, title });
  revalidatePath("/broadcast");
  return { ok: true, id };
}

/**
 * Move an item along.
 *
 * One action for every transition rather than one per verb, because the checks
 * that matter — is this move legal, is this person allowed to make it, are
 * they the author — are the same checks every time, and four copies of them is
 * three chances to leave one out.
 */
export async function moveItem({ id, to, note = null, verdict = null }) {
  const user = await requireUser();

  const item = await broadcastItems.get(String(id ?? ""));
  if (!item) return { error: "That item is no longer on the desk." };

  if (!mayMove(item.state, to)) {
    return { error: `${stateLabel(item.state)} does not go to ${stateLabel(to)}.` };
  }

  /* Which grant each move needs. Submitting your own work for review is
     drafting; passing or refusing somebody's work is clearing; putting a
     cleared thing out and pulling it back is air. */
  const needed =
    to === "REVIEW" || to === "DRAFT"
      ? "broadcast:draft"
      : to === "CLEARED" || to === "REJECTED"
        ? "broadcast:clear"
        : "broadcast:air";

  if (!can(user.role, needed)) return { error: "Your account cannot do that on this desk." };

  /* ── THE RULE ────────────────────────────────────────────────────────────
     Applies to the super administrator too. An exception for the highest role
     would be an exception used every night, because the highest role is the
     one that is always signed in when it is late. */
  if ((to === "CLEARED" || to === "REJECTED") && item.createdBy && item.createdBy === user.id) {
    return {
      error:
        "You wrote this, so you cannot clear it. Somebody else on the desk has to look at it.",
    };
  }

  /* A rejection with no reason is a rejection the author cannot act on, and
     it is the one this desk will produce most often at 11pm. */
  if (to === "REJECTED" && !String(note ?? "").trim()) {
    return { error: "Say why it was refused. The person who wrote it has to be able to fix it." };
  }

  await broadcastItems.setState(item.id, to, {
    actorId: user.id,
    actorName: user.name,
    note: note ? String(note).trim() : null,
  });

  /* A verdict is the claim desk's answer and belongs to the item, not to the
     transition — it is set alongside the clearance that carries it. */
  if (verdict && item.kind === "CLAIM") {
    await broadcastItems.update(item.id, { payload: { ...(item.payload ?? {}), verdict } });
  }

  /* ── EVERY MOVE IS LOGGED, NOT ONLY THE INTERESTING ONES ────────────────
     The audit surface's whole value is that it can answer "how did that get
     on air" without anybody having to have anticipated the question. A log
     that records clearances and not submissions answers half of it. */
  await log(user, `broadcast:${to.toLowerCase()}`, item.id, {
    kind: item.kind,
    title: item.title,
    from: item.state,
    note: note ?? null,
  });

  revalidatePath("/broadcast");
  return { ok: true };
}

/**
 * Edit a draft.
 *
 * Only a draft, and only ever a draft. An item that has been cleared and is
 * then edited is an item that went to air carrying somebody's approval of
 * different words — which is worse than no approval, because the audit trail
 * says it was checked.
 */
export async function editDraft({ id, ...values }) {
  const { user, error } = await desk("broadcast:draft");
  if (error) return { error };

  const item = await broadcastItems.get(String(id ?? ""));
  if (!item) return { error: "That item is no longer on the desk." };

  if (item.state !== "DRAFT" && item.state !== "REJECTED") {
    return {
      error: `This has been through an editor. Send it back to draft before changing the words.`,
    };
  }

  await broadcastItems.update(item.id, {
    title: values.title ? String(values.title).trim() : null,
    body: values.body != null ? String(values.body) : null,
    payload: values.payload ?? null,
    platforms: values.platforms ?? null,
    scheduledFor: values.scheduledFor ? new Date(values.scheduledFor) : null,
  });

  await log(user, "broadcast:edited", item.id, { kind: item.kind });
  revalidatePath("/broadcast");
  return { ok: true };
}

/**
 * Discard a draft.
 *
 * Drafts only. Nothing that has been seen by an editor is ever deleted from
 * this desk — a rejected strap is kept with its reason, and a strap that went
 * out is kept because it went out. A newsroom that can delete the record of
 * what it broadcast has no record of what it broadcast.
 */
export async function discardDraft(id) {
  const { user, error } = await desk("broadcast:draft");
  if (error) return { error };

  const item = await broadcastItems.get(String(id ?? ""));
  if (!item) return { ok: true };

  if (item.state !== "DRAFT") {
    return { error: "Only a draft can be discarded. Everything else is part of the record." };
  }
  if (item.createdBy && item.createdBy !== user.id && !can(user.role, "broadcast:clear")) {
    return { error: "That is somebody else's draft." };
  }

  await broadcastItems.remove(item.id);
  await log(user, "broadcast:discarded", item.id, { kind: item.kind, title: item.title });
  revalidatePath("/broadcast");
  return { ok: true };
}
