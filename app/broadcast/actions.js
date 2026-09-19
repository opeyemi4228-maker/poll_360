"use server";

import { revalidatePath } from "next/cache";

import { requireUser, log } from "@/lib/guard";
import { can } from "@/lib/roles";
import { broadcastDispatches, broadcastItems, contestants } from "@/lib/db";
import { viewing } from "@/lib/viewing";
import { socialPayload } from "@/lib/post-payload";
import { isRace } from "@/lib/races";
import { currentElection } from "@/lib/election-scope";
import { KINDS, mayMove, stateLabel } from "@/lib/broadcast";
import { captionFor, stampFor } from "@/lib/stamp";
import { CHANNELS, readiness, sendEverywhere, verifyChannel } from "@/lib/publish";
import { closeLive, openLive } from "@/lib/live-video";
import { seal, unseal } from "@/lib/crypto";
import { postImageBytes } from "@/lib/graphic";
import { site } from "@/lib/site";

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
    payload: kind === "SOCIAL" ? await socialPayload(values) : values?.payload ?? null,
    platforms: values?.platforms ?? [],
    verdict: null,
    scheduledFor: values?.scheduledFor ? new Date(values.scheduledFor) : null,
    createdBy: user.id,
    createdName: user.name,
  });

  await log(user, "broadcast:drafted", id, { kind, title });
  revalidatePath("/room");
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

  const moved = await broadcastItems.setState(item.id, to, {
    actorId: user.id,
    actorName: user.name,
    note: note ? String(note).trim() : null,
    from: item.state,
  });
  if (!moved) {
    revalidatePath("/room");
    return { error: "Somebody else moved this a moment ago. The desk has been refreshed — look again before pressing anything." };
  }

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

  /* ── A SOCIAL POST ON AIR IS A SOCIAL POST PUBLISHED ────────────────────
     Taking it to air is the press that sends it everywhere it is aimed. And
     a post its writer marked "send the moment it is cleared" goes out on the
     clearance itself — but only when the person clearing it may also put
     things on air, because the rule is that two people have looked, not that
     the second one has been skipped. */
  let sent = null;
  let also = null;
  if (item.kind === "SOCIAL" && to === "ON_AIR") {
    sent = await publishPost({ ...item, state: "ON_AIR" }, user);
  } else if (item.kind === "SOCIAL" && to === "CLEARED" && item.payload?.sendOnClear) {
    if (can(user.role, "broadcast:air")) {
      const aired = await broadcastItems.setState(item.id, "ON_AIR", { actorId: user.id, actorName: user.name, from: "CLEARED" });
      if (aired) {
        await log(user, "broadcast:on_air", item.id, { kind: item.kind, title: item.title, from: "CLEARED", automatic: true });
        sent = await publishPost({ ...item, state: "ON_AIR" }, user);
      }
    } else {
      also = "Cleared. Its writer asked for it to go out on clearance, but your account cannot put things on air — somebody who can must send it.";
    }
  }

  revalidatePath("/room");
  return { ok: true, sent, said: also ?? (sent ? sentSummary(sent) : null) };
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

  /* A post's figures and stamp are decided on the server, on an edit as on
     a draft, so an edit is not a way round `socialPayload`. */
  const payload =
    item.kind === "SOCIAL" && values.payload
      ? await socialPayload({ scope: item.scope, race: item.race, payload: { ...(item.payload ?? {}), ...values.payload } })
      : values.payload ?? null;

  await broadcastItems.update(item.id, {
    title: values.title ? String(values.title).trim() : null,
    body: values.body != null ? String(values.body) : null,
    payload,
    platforms: values.platforms ?? null,
    scheduledFor: values.scheduledFor ? new Date(values.scheduledFor) : null,
  });

  await log(user, "broadcast:edited", item.id, { kind: item.kind });
  revalidatePath("/room");
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
  revalidatePath("/room");
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════════════
   PUBLISHING
   ══════════════════════════════════════════════════════════════════════════ */

/** The public address of a post, and of its picture. */
const postLink = (id) => `${site.url}/live/${id}`;

/**
 * Send one post everywhere it is aimed, and write down what happened.
 *
 * @param only  on a resend, just these platforms
 */
async function publishPost(item, user, only = null) {
  const payload = item.payload ?? {};
  /* Posts written before stamps existed get one from the moment they were
     written: late, but true, rather than none. */
  const stamp = payload.stamp ?? stampFor({ scope: item.scope, at: item.createdAt });
  const figures = payload.figures ?? null;
  const link = postLink(item.id);
  const aimed = only ?? item.platforms ?? [];

  const text = { default: captionFor({ platform: "relay", body: item.body, figures, stamp, link }) };
  for (const platform of aimed) text[platform] = captionFor({ platform, body: item.body, figures, stamp, link });

  let bytes;
  try {
    bytes = await postImageBytes({ ...item, payload: { ...payload, stamp } });
  } catch (error) {
    /* No picture, no post: every platform here is sent a card, and a caption
       that says "see the card" with no card is a worse post than none. */
    const rows = aimed.map((platform) => ({ platform, status: "FAILED", error: `The card could not be drawn: ${error?.message ?? error}` }));
    await recordRows(item, user, rows);
    return rows;
  }

  const rows = await sendEverywhere({
    post: {
      id: item.id,
      title: item.title,
      text,
      link,
      imageUrl: `${link}/image?format=jpg`,
      place: stamp.place,
      at: stamp.at,
      time: stamp.time,
      figures,
    },
    bytes,
    platforms: aimed,
  });

  await recordRows(item, user, rows);
  return rows;
}

async function recordRows(item, user, rows) {
  for (const row of rows) {
    await broadcastDispatches.record({
      itemId: item.id,
      electionId: item.electionId,
      platform: row.platform,
      status: row.status,
      remoteId: row.remoteId,
      remoteUrl: row.remoteUrl,
      error: row.error,
      note: row.note,
      byId: user.id,
      byName: user.name,
    });
  }
  await log(user, "broadcast:sent", item.id, {
    title: item.title,
    results: rows.map((row) => `${row.platform}:${row.status}`),
  });
}

/** One sentence the desk can read at a glance. */
function sentSummary(rows) {
  if (!rows?.length) return "On air. It was not aimed at any platform.";
  const out = rows.filter((row) => row.status === "SENT" || row.status === "RELAYED").length;
  const failed = rows.filter((row) => row.status === "FAILED").length;
  const waiting = rows.length - out - failed;
  return [
    `Out on ${out} of ${rows.length}.`,
    failed ? `${failed} failed — see the post for why, and resend.` : null,
    waiting ? `${waiting} not connected or to be posted by hand.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Resend a post that is on air to the platforms it did not reach.
 *
 * Only the ones asked for, and never one whose last attempt succeeded: a
 * double post of a result is its own small crisis, so "resend everything" is
 * not a button this desk has.
 */
export async function resendPost({ id, platforms = [] }) {
  const { user, error } = await desk("broadcast:air");
  if (error) return { error };

  const item = await broadcastItems.get(String(id ?? ""));
  if (!item || item.kind !== "SOCIAL") return { error: "That post is no longer on the desk." };
  if (item.state !== "ON_AIR") return { error: "Only a post that is on air can be sent again." };

  const history = await broadcastDispatches.forItem(item.id);
  const last = {};
  for (const row of history) last[row.platform] = row.status;
  const asked = [...new Set(platforms.map(String))].filter((platform) => (item.platforms ?? []).includes(platform));
  const again = asked.filter((platform) => last[platform] !== "SENT" && last[platform] !== "RELAYED");
  if (!again.length) return { error: "Everything asked for has already gone out." };

  /* Two people pressing "send again" together would resend twice. The first
     to touch the row claims the resend; the second is told it is under way. */
  if (!(await broadcastItems.claim(item.id))) {
    return { error: "Somebody is already resending this. Give it a moment." };
  }

  let sent;
  try {
    sent = await publishPost(item, user, again);
  } finally {
    await broadcastItems.release(item.id);
  }
  revalidatePath("/room");
  return { ok: true, sent, said: sentSummary(sent) };
}

/**
 * Is each platform set up, and does it answer? Posts nothing.
 */
export async function checkChannels() {
  const { error } = await desk("broadcast:draft");
  if (error) return { error };

  const ready = readiness(process.env, { siteUrl: site.url });
  const checks = await Promise.all(
    ready.map(async (row) => (row.configured ? verifyChannel(row.id) : { id: row.id, ok: false, error: `Not set up: ${row.missing.join(", ")}.` }))
  );
  return {
    ok: true,
    channels: ready.map((row) => ({ ...row, check: checks.find((check) => check.id === row.id) ?? null })),
    direct: CHANNELS.map((row) => row.id),
    checkedAt: new Date().toISOString(),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   CONTESTANTS
   ══════════════════════════════════════════════════════════════════════════ */

/* A portrait arrives as a JPEG data address, already resized in the browser.
   Anything else, or anything large, is refused here: this is stored in the
   database and drawn into every card. */
const PORTRAIT = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const PORTRAIT_MAX = 400_000;

/**
 * Add or change the candidate standing for a party in the current contest.
 *
 * @param photo  a data address; null removes the portrait; undefined keeps it
 */
export async function saveContestant({ party, name, runningMate = null, photo = undefined, race: asked = null }) {
  const { user, error } = await desk("broadcast:draft");
  if (error) return { error };

  const { project, race: roomRace } = await viewing("/room");
  if (!project) return { error: "No election project is open." };
  const race = isRace(asked) ? asked : roomRace;

  const id = String(party ?? "").trim().toUpperCase();
  if (!/^[A-Z]{1,8}$/.test(id)) return { error: "Choose a party." };
  const who = String(name ?? "").trim().slice(0, 80);
  if (!who) return { error: "Give the candidate's name as it should appear on the cards." };
  if (photo != null && (!PORTRAIT.test(photo) || photo.length > PORTRAIT_MAX)) {
    return { error: "That picture could not be used. Choose a JPEG or PNG photograph." };
  }

  await contestants.save({
    electionId: project.id,
    race,
    party: id,
    name: who,
    runningMate: runningMate ? String(runningMate).trim().slice(0, 80) : null,
    photo,
    by: user.id,
  });
  await log(user, "broadcast:contestant", id, { race, name: who, photo: photo === undefined ? "kept" : photo ? "set" : "removed" });
  revalidatePath("/room");
  return { ok: true };
}

export async function removeContestant({ party, race: asked = null }) {
  const { user, error } = await desk("broadcast:draft");
  if (error) return { error };
  const { project, race: roomRace } = await viewing("/room");
  if (!project) return { error: "No election project is open." };
  const race = isRace(asked) ? asked : roomRace;
  await contestants.remove(project.id, race, String(party ?? "").toUpperCase());
  await log(user, "broadcast:contestant-removed", String(party), { race });
  revalidatePath("/room");
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════════════
   ONE PRESS: THE NEXT STEP, FOR ONE POST OR MANY
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Take each chosen item as far towards live as this person may take it.
 *
 *   a draft                      → sent to an editor
 *   waiting, written by someone
 *   else, and you may clear      → approved and put live in one press
 *   cleared                      → put live (published everywhere it is aimed)
 *
 * The two-person rule is not loosened by doing it in bulk: an item you wrote
 * stops at the editor, and is reported back as such, however many others in
 * the same press go out. Each item goes through `moveItem`, so every check
 * and every log line is the one a single press would make.
 *
 * @param ids     the items ticked
 * @param action  "live" (as far as allowed) or "withdraw"
 */
export async function pressMany({ ids = [], action = "live" }) {
  const user = await requireUser();
  const chosen = [...new Set(ids.map(String))].slice(0, 50);
  if (!chosen.length) return { error: "Tick at least one post." };

  const done = { live: 0, editor: 0, withdrawn: 0, held: [], failed: 0 };
  for (const id of chosen) {
    const item = await broadcastItems.get(id);
    if (!item) continue;
    const step = async (to) => {
      const answer = await moveItem({ id, to });
      if (answer?.error) {
        done.held.push(`${item.title}: ${answer.error}`);
        return false;
      }
      if (answer?.sent?.some((row) => row.status === "FAILED")) done.failed += 1;
      return true;
    };

    if (action === "withdraw") {
      if (item.state === "ON_AIR" && (await step("OFF_AIR"))) done.withdrawn += 1;
      continue;
    }

    if (item.state === "DRAFT" || item.state === "REJECTED") {
      if (item.state === "REJECTED" && !(await step("DRAFT"))) continue;
      if (await step("REVIEW")) done.editor += 1;
      continue;
    }
    if (item.state === "REVIEW") {
      if (item.createdBy === user.id) {
        done.held.push(`${item.title}: you wrote it, so another editor has to approve it.`);
        continue;
      }
      if (!(await step("CLEARED"))) continue;
      /* A post marked to publish on clearing went out with the clearance. */
      const now = await broadcastItems.get(id);
      if (now?.state === "ON_AIR") {
        done.live += 1;
        continue;
      }
    }
    const current = await broadcastItems.get(id);
    if (current?.state === "CLEARED" && (await step("ON_AIR"))) done.live += 1;
  }

  const said = [
    done.live ? `${done.live} live.` : null,
    done.editor ? `${done.editor} sent to an editor.` : null,
    done.withdrawn ? `${done.withdrawn} withdrawn.` : null,
    done.failed ? `${done.failed} did not reach every platform — see Problems.` : null,
    done.held.length ? `${done.held.length} held back: ${done.held.slice(0, 3).join(" ")}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  revalidatePath("/room");
  return { ok: true, done, said: said || "Nothing to do for those." };
}

/* ══════════════════════════════════════════════════════════════════════════
   GOING LIVE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Open tonight's live programme on every platform that can open one.
 *
 * ── WHY THIS ONE DOES NOT WAIT FOR AN EDITOR ───────────────────────────────
 * Clearance exists because a figure that goes out cannot be recalled. Opening
 * a live broadcast publishes no figure: it opens an empty channel that shows
 * whatever the gallery points at, and everything that then appears on the
 * stage is itself cleared — the stage draws on-air items and nothing else.
 * What opening a channel does need is the grant that takes things to air, and
 * a line in the log saying who opened it and when.
 */
export async function startLive({ title, description = "", platforms = [] }) {
  const { user, error } = await desk("broadcast:air");
  if (error) return { error };

  const project = await currentElection();
  if (!project) return { error: "No election project is open." };

  const name = String(title ?? "").trim() || `${project.title} — live results`;
  const live = await openLive({
    title: name.slice(0, 100),
    description: String(description ?? "").slice(0, 500),
    platforms,
  });

  /* ── THE STREAM KEY IS A CREDENTIAL ──────────────────────────────────
     Anyone holding it can broadcast into the organisation's own programme
     for as long as it is open. It is sealed on the way into the database and
     is handed back only to an account that may take things to air, one press
     at a time — see `liveKeys` below. */
  const kept = live.map((row) => (row.ingest ? { ...row, ingest: null, ingestSealed: seal(row.ingest) } : row));

  const id = await broadcastItems.create({
    electionId: project.id,
    kind: "VIDEO",
    /* On air from the moment it is open: this row *is* the programme, and a
       programme that is running while the desk shows it as a draft is the
       one state nobody can act on. */
    state: "ON_AIR",
    title: name,
    body: description ? String(description).slice(0, 500) : null,
    payload: { live: kept, startedAt: new Date().toISOString(), stage: `${site.url}/room/stage` },
    createdBy: user.id,
    createdName: user.name,
  });
  await broadcastItems.setState(id, "ON_AIR", { actorId: user.id, actorName: user.name });

  await log(user, "broadcast:live-open", id, {
    title: name,
    results: live.map((row) => `${row.platform}:${row.status}`),
  });
  revalidatePath("/room");
  return { ok: true, id, said: liveSummary(live) };
}

/**
 * The stream addresses for a programme that is open, unsealed for one press.
 *
 * Not included in the page's own data: a key that is in the HTML is a key in
 * every browser cache and every screen recording of the gallery. It is asked
 * for when somebody is actually setting up an encoder.
 */
export async function liveKeys({ id }) {
  const { user, error } = await desk("broadcast:air");
  if (error) return { error };

  const item = await broadcastItems.get(String(id ?? ""));
  if (!item || item.kind !== "VIDEO") return { error: "That programme is not on the desk." };
  if (item.state !== "ON_AIR") return { error: "That programme is not open." };

  const keys = (item.payload?.live ?? [])
    .filter((row) => row.ingestSealed)
    .map((row) => ({ platform: row.platform, ingest: unseal(row.ingestSealed) }));

  await log(user, "broadcast:live-keys", item.id, { platforms: keys.map((row) => row.platform) });
  return { ok: true, keys };
}

/** Close the programme on every platform it was opened on. */
export async function endLive({ id }) {
  const { user, error } = await desk("broadcast:air");
  if (error) return { error };

  const item = await broadcastItems.get(String(id ?? ""));
  if (!item || item.kind !== "VIDEO") return { error: "That programme is not on the desk." };

  const closed = await closeLive({ open: (item.payload?.live ?? []).filter((row) => row.status === "OPEN") });
  await broadcastItems.update(item.id, {
    payload: { ...(item.payload ?? {}), closed, endedAt: new Date().toISOString() },
  });
  await broadcastItems.setState(item.id, "OFF_AIR", { actorId: user.id, actorName: user.name, from: "ON_AIR" });
  await log(user, "broadcast:live-close", item.id, { results: closed.map((row) => `${row.platform}:${row.status}`) });
  revalidatePath("/room");
  return { ok: true, closed };
}

function liveSummary(live) {
  const open = live.filter((row) => row.status === "OPEN");
  const announce = live.filter((row) => row.status === "ANNOUNCE");
  const failed = live.filter((row) => row.status === "FAILED" || row.status === "NOT_SET_UP");
  return [
    open.length ? `Open on ${open.map((row) => row.platform).join(", ")} — point your encoder at the address below and press start.` : "No platform could be opened.",
    announce.length ? `${announce.length} can only be started in their own app; announce the link instead.` : null,
    failed.length ? `${failed.length} could not be opened.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}
