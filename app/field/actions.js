"use server";

import { revalidatePath } from "next/cache";

import { results, incidents, media } from "@/lib/db";
import { seal } from "@/lib/crypto";
import { requireCapability, log } from "@/lib/guard";
import { currentElection } from "@/lib/election-scope";
import { parties } from "@/lib/election2023";
import { validateReturn } from "@/lib/results";
import { parseSheet, readImage, visionAvailable } from "@/lib/sheet-vision";
import { matchSheet, matchRecord, mismatchMessage } from "@/lib/sheet-match";

/**
 * Filing from a booth.
 *
 * ── THE BOOTH IS NEVER READ FROM THE REQUEST ───────────────────────────────
 * It comes from `user.scope`, the unit on the agent's own account, resolved
 * on the server on every submission. There is no unit field in this form and
 * no dropdown, because a booth you can choose is a booth somebody can choose
 * wrongly, and a form field naming it is a field somebody can change.
 *
 * The device's position is recorded beside the figures as corroboration. It
 * never decides which booth is being filed for, and a reading that looks wrong
 * never blocks a filing: rural fixes drift, buildings block sky, and a booth
 * moved fifty metres up the road is not fraud. It is stored, and it is visible
 * to whoever checks the return.
 *
 * ── THE SHEET IS THE ONE THING THAT DOES BLOCK ─────────────────────────────
 * Position corroborates; the photographed sheet *is* the return. Where the
 * agent attaches one and it can be read confidently, the figures they typed
 * are held against it and a disagreement stops the filing, with no override.
 * A return and its own photograph are two halves of one claim, and half a
 * claim is not filed.
 *
 * The strictness is bounded by what counts as a disagreement, not by mercy
 * afterwards: lib/sheet-match.js requires the reading to be self-consistent
 * before it may contradict anybody, and a figure the reader could not make out
 * is compared to nothing rather than to zero. A sheet nobody could read does
 * not block anything — it files with the attempt recorded and no corroboration
 * claimed, which is a different thing from having sent no sheet at all and is
 * stored as a different thing.
 * ───────────────────────────────────────────────────────────────────────────
 */

export async function fileResult(_previous, formData) {
  const agent = await requireCapability("results:file", "/field");

  if (!agent.scope) {
    return { error: "This account is not tied to a polling unit. Your coordinator must set one." };
  }

  const number = (name) => {
    const raw = String(formData.get(name) ?? "").replace(/[^\d]/g, "");
    return raw === "" ? Number.NaN : Number(raw);
  };

  const registered = number("registered");
  const accredited = number("accredited");
  const rejected = Number.isNaN(number("rejected")) ? 0 : number("rejected");

  const votes = {};
  for (const party of parties) {
    const value = number(`votes_${party.id}`);
    votes[party.id] = Number.isNaN(value) ? 0 : value;
  }

  if (Number.isNaN(registered) || Number.isNaN(accredited)) {
    return { errors: { figures: "Registered and accredited are both required." } };
  }

  /* The same function the browser ran. The client copy is a courtesy that
     saves a round trip; this is the one that counts. */
  const check = validateReturn({ registered, accredited, rejected, votes });
  if (!check.ok) return { errors: check.errors };

  /* ── THE SHEET, AND WHAT IT IS ALLOWED TO DO ──────────────────────────────
     Read before anything is written, because a return that contradicts its own
     photograph must never reach the results table even briefly. */
  const sheet = await checkAgainstSheet(formData.get("sheet"), {
    registered,
    accredited,
    rejected,
    votes,
  });

  if (sheet.blocked) {
    return {
      errors: { sheet: sheet.message },
      mismatches: sheet.match.mismatches,
    };
  }

  const position = formData.get("lat")
    ? {
        lat: Number(formData.get("lat")),
        lon: Number(formData.get("lon")),
        accuracy: Number(formData.get("accuracy")) || null,
        distance: Number(formData.get("distance")) || null,
      }
    : null;

  /* Filed against the project the agent is looking at, not "the results". A
     booth reports once per election, and the unique index is on the pair. */
  const project = await currentElection();

  const { amended } = await results.file({
    electionId: project?.id,
    unitCode: agent.scope,
    stateCode: agent.scope.slice(0, 2),
    registered,
    accredited,
    rejected,
    votes,
    position,
    note: String(formData.get("note") ?? "").trim().slice(0, 500) || null,
    submittedBy: agent.id,
    /* Null only where no sheet was sent. An unreadable one records the
       attempt and why, so the desk can tell "nobody photographed it" from
       "somebody did and we could not read it" — the second is worth a phone
       call and the first is not. */
    sheetMatch: sheet.record,
  });

  await log(agent, amended ? "result:amended" : "result:filed", agent.scope, {
    cast: check.cast,
    positioned: Boolean(position),
    /* Three different facts about a return, and an audit trail that recorded
       all of them as silence could not tell them apart afterwards. */
    sheet: !sheet.record
      ? "none"
      : sheet.record.agrees
        ? "agreed"
        : `not compared: ${sheet.record.reason ?? "unknown"}`,
  });

  revalidatePath("/field");
  revalidatePath("/admin");
  /* The divergence room reads returns as they arrive, so a new one changes
     what it is showing. */
  revalidatePath("/gap");

  return { ok: true, amended, cast: check.cast, sheet: sheet.record };
}

/**
 * Read the attached sheet and hold the typed figures against it.
 *
 * ── EVERY FAILURE PATH ENDS IN "FILE IT ANYWAY" EXCEPT ONE ─────────────────
 * No sheet attached, no reader configured, bytes that are not a photograph, a
 * page the reader could not make sense of: all of these produce a filing with
 * no comparison recorded. The single path that stops a filing is a confident,
 * arithmetically coherent reading of a figure that differs from what the agent
 * typed.
 *
 * That asymmetry is the whole design. Blocking on a reader's every objection
 * would stop honest agents filing under a torch, and a count nobody can file
 * into is worse than a count with some uncorroborated rows in it.
 */
async function checkAgainstSheet(photo, typed) {
  /* ── THREE STATES, NOT TWO ───────────────────────────────────────────────
     No sheet at all is `null`. A sheet that was attached and could not be
     compared records the attempt and why. A sheet that was compared records
     what it found. Collapsing the first two would make "nobody sent a
     photograph" and "somebody sent one and it was unreadable" identical
     afterwards, and only one of those is worth ringing an agent about. */
  const none = { blocked: false, record: null, match: null, message: null };
  const uncompared = (reason) => ({
    blocked: false,
    match: null,
    message: null,
    record: { compared: false, agrees: false, checked: [], mismatched: [], reason },
  });

  if (!photo || typeof photo.arrayBuffer !== "function" || photo.size === 0) return none;
  /* The framework caps the request body as well; this is the check that can
     say something useful rather than dropping the whole submission. */
  if (photo.size > 6_000_000) return uncompared("the picture was too large to read");
  if (!visionAvailable()) return uncompared("no reader configured");

  let bytes;
  try {
    bytes = Buffer.from(await photo.arrayBuffer());
  } catch {
    return uncompared("the picture could not be opened");
  }

  /* The declared type is a claim; the leading bytes are a fact. */
  if (!sniff(bytes)) return uncompared("the file was not a photograph");

  const read = await readImage(bytes);
  if (!read.ok) return uncompared(read.reason ?? "the picture could not be read");

  const match = matchSheet(parseSheet(read.text), typed);

  if (match.comparable && !match.agrees) {
    return {
      blocked: true,
      match,
      record: matchRecord(match),
      message: mismatchMessage(match, { channel: "web" }),
    };
  }

  return { blocked: false, match, record: matchRecord(match), message: null };
}

/** Raise something that is not a number: a queue, a delay, an obstruction. */
export async function reportIncident(_previous, formData) {
  const agent = await requireCapability("incidents:file", "/field");

  const kind = String(formData.get("kind") ?? "").trim().slice(0, 80);
  const severity = String(formData.get("severity") ?? "INFO");
  const detail = String(formData.get("detail") ?? "").trim().slice(0, 1500);

  if (!kind) return { errors: { kind: "Say what happened." } };
  if (!["INFO", "SERIOUS", "CRITICAL"].includes(severity)) {
    return { errors: { severity: "Pick how serious it is." } };
  }

  const project = await currentElection();

  const incidentId = await incidents.create({
    electionId: project?.id,
    unitCode: agent.scope ?? "unassigned",
    stateCode: (agent.scope ?? "00").slice(0, 2),
    kind,
    severity,
    /* Sealed: an incident narrative names people and places, and it is the
       most sensitive thing this system stores. */
    detailSealed: seal(detail),
    reportedBy: agent.id,
  });

  /* ------------------------------------------------------------- the photo
     The browser has already downscaled this to ~1280px, so what arrives is a
     few hundred kilobytes rather than eight megabytes over a rural signal.

     What arrives is still never trusted: the declared type is checked against
     the actual magic bytes, because a file called photo.jpg is a claim and the
     first four bytes are a fact. Anything that is not a real JPEG or PNG is
     dropped and the incident is still filed, losing the picture must never
     lose the report. */
  const photo = formData.get("photo");
  if (photo && typeof photo.arrayBuffer === "function" && photo.size > 0) {
    try {
      if (photo.size > 6_000_000) throw new Error("too large");
      const bytes = Buffer.from(await photo.arrayBuffer());
      const mime = sniff(bytes);
      if (mime) {
        await media.attach({ incidentId, mime, bytes });
      }
    } catch {
      /* Deliberately silent: the report is the thing that matters, and an
         agent standing in a queue must not be blocked by a bad camera file. */
    }
  }

  await log(agent, "incident:reported", agent.scope, { kind, severity });
  revalidatePath("/field");
  revalidatePath("/admin");
  revalidatePath("/room");

  return { ok: true };
}

/**
 * What these bytes actually are.
 *
 * The Content-Type a browser sends is a claim; the leading bytes are a fact.
 * Only two formats are accepted, both of which every phone camera produces,
 * and anything else, including an SVG, which is a script in a trench coat, * is refused.
 */
function sniff(bytes) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  return null;
}
