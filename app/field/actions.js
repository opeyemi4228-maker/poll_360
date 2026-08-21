"use server";

import { revalidatePath } from "next/cache";

import { results, incidents, media } from "@/lib/db";
import { seal } from "@/lib/crypto";
import { requireCapability, log } from "@/lib/guard";
import { parties } from "@/lib/election2023";
import { validateReturn } from "@/lib/results";

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

  const position = formData.get("lat")
    ? {
        lat: Number(formData.get("lat")),
        lon: Number(formData.get("lon")),
        accuracy: Number(formData.get("accuracy")) || null,
        distance: Number(formData.get("distance")) || null,
      }
    : null;

  const { amended } = await results.file({
    unitCode: agent.scope,
    stateCode: agent.scope.slice(0, 2),
    registered,
    accredited,
    rejected,
    votes,
    position,
    note: String(formData.get("note") ?? "").trim().slice(0, 500) || null,
    submittedBy: agent.id,
  });

  await log(agent, amended ? "result:amended" : "result:filed", agent.scope, {
    cast: check.cast,
    positioned: Boolean(position),
  });

  revalidatePath("/field");
  revalidatePath("/admin");

  return { ok: true, amended, cast: check.cast };
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

  const incidentId = await incidents.create({
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
