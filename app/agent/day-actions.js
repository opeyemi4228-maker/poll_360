"use server";

import { revalidatePath } from "next/cache";

import { after } from "next/server";

import {
  AGENT360_STEPS,
  DATABANK_CATEGORY,
  DATABANK_SEVERITY,
  DATABANK_STAGE,
  SOS_CATEGORY,
  SOS_KIND,
  situationKind,
  updateStep,
  urgency,
} from "@/lib/agent-day";
import { currentAgentCode } from "@/lib/agent-code-vault";
import { sendAgentPosition, sendAgentReport, sendAgentUpdate } from "@/lib/databank-agents";
import { agentElection } from "@/lib/agent-election";
import { currentAgent } from "@/lib/agent-identity";
import { agent360Configured, sendAgentEvent } from "@/lib/agent360";
import { seal } from "@/lib/crypto";
import { audit, incidents, media, unitUpdates } from "@/lib/db";
import { sniffImage } from "@/lib/image-bytes";
import { rateLimit } from "@/lib/ratelimit";

/**
 * What an agent sends from Updates and Situations.
 *
 * Both return rather than redirect, like the result actions: a form post that
 * redirected to a sign-in page would throw away a position somebody stood
 * outside for thirty seconds to get, or a report typed while it was happening.
 */

const number = (formData, key) => {
  const raw = formData.get(key);
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

/* ══════════════════════════════════════════════════════════════════════════
   ON TO DATA BANK'S BOARDS, AFTER THE AGENT HAS BEEN ANSWERED

   Everything below is relayed with `after()`, which runs once the response has
   already gone to the phone. An agent standing at a booth on two bars of
   signal must never wait on a second system to be told their update was sent,
   and Poll360 has already written its own record by the time these run.

   A position rides with whatever the agent was doing rather than on a timer of
   its own. Their phone reads it for an update or a report; sending it on is
   one more request and it is what puts them on the Locations board.
   ══════════════════════════════════════════════════════════════════════════ */

function relay({ code, stage, agent, latitude, longitude, accuracy, at = null }) {
  after(async () => {
    const jobs = [];
    if (code && stage) jobs.push(sendAgentUpdate({ code, stage, at }));
    if (latitude != null && longitude != null) {
      jobs.push(
        sendAgentPosition({ phone: agent.phone, latitude, longitude, accuracy, unitCode: agent.unitCode, at })
      );
    }
    if (jobs.length) await Promise.allSettled(jobs);
  });
}

/* ── updates ──────────────────────────────────────────────────────────────── */

/**
 * One step of the polling day — materials here, voting started, counting begun.
 *
 * ── SAVED HERE FIRST, THEN SENT TO AGENT360 ────────────────────────────────
 * The step is kept by this product before anything else is tried, so the room
 * has it even when Agent360 is not connected or not answering. Where Agent360
 * is connected, the steps it scores are sent on and what it made of them —
 * how sure it is the agent was at the booth — comes back to the screen. A
 * failure there is not a failure of the update.
 */
export async function sendDayEvent(_previous, formData) {
  const agent = await currentAgent();
  if (!agent) return { ok: false, error: "Your sign-in has ended. Sign in again, then send this.", sentAt: Date.now() };

  /* Enough for a whole day sent twice over, and for a nervous thumb. Not
     enough to fill somebody's record with noise. */
  const limit = rateLimit(`agent-day:${agent.id}`, { limit: 40, windowMs: 15 * 60 * 1000 });
  if (!limit.ok) {
    return { ok: false, error: "That is a lot in a short time. Wait a few minutes, then try again.", sentAt: Date.now() };
  }

  const step = updateStep(String(formData.get("eventType") ?? ""));
  if (!step) return { ok: false, error: "That update was not recognised. Reload the page and try again.", sentAt: Date.now() };

  const latitude = number(formData, "latitude");
  const longitude = number(formData, "longitude");
  const accuracy = number(formData, "accuracy");
  if (step.needsLocation && (latitude == null || longitude == null)) {
    return { ok: false, error: "Find your location first, then send this.", sentAt: Date.now() };
  }

  const project = await agentElection(agent.unitCode);
  if (!project) return { ok: false, error: "No election is running, so there is nowhere to send this yet.", sentAt: Date.now() };

  try {
    await unitUpdates.record({
      electionId: project.id,
      unitCode: agent.unitCode,
      coordinatorId: agent.id,
      step: step.type,
      lat: latitude,
      lon: longitude,
      accuracy,
    });
  } catch (error) {
    console.error("agent update could not be saved:", error?.code ?? "", error?.message ?? error);
    return { ok: false, error: "That could not be saved just now. Wait a minute and try again.", sentAt: Date.now() };
  }

  let scored = {};
  if (agent360Configured() && AGENT360_STEPS.has(step.type)) {
    const answer = await sendAgentEvent(agent.phone, { eventType: step.type, latitude, longitude, accuracy });
    if (answer.ok) {
      scored = { level: answer.level, distanceM: answer.distanceM, insideArea: answer.insideArea };
    }
  }

  /* The stage, for the Updates board inside Data Bank's Situation dashboard,
     and the position for the Locations board. A step this hub has no stage for
     — there is none it does not — is simply not relayed. */
  relay({
    code: await currentAgentCode(),
    stage: DATABANK_STAGE[step.type] ?? null,
    agent,
    latitude,
    longitude,
    accuracy,
  });

  revalidatePath("/agent", "layout");
  revalidatePath("/room");
  return { ok: true, label: step.label, ...scored, sentAt: Date.now() };
}

/* ── situations ───────────────────────────────────────────────────────────── */

/**
 * A situation at the unit, or an SOS.
 *
 * ── THE SAME FEED THE ROOM ALREADY WATCHES ─────────────────────────────────
 * Filed as an incident, with the agent as its author, so it lands in the
 * situation room, the alarm bell and the broadcast desk exactly as a report
 * from a staff account does. The account of what happened is sealed, the
 * photograph is checked byte by byte, and the hub is told a report exists
 * without being handed the narrative — the same rules as the staff form in
 * app/field/actions.js, kept in step by hand.
 *
 * ── AN SOS IS A SITUATION THAT SKIPS THE QUESTIONS ─────────────────────────
 * Always "needs it now", filed under its own name so the room cannot mistake
 * it for anything else, and sent to Agent360 as a distress call too where it
 * is connected, with the location if the agent had time to add one.
 */
export async function reportSituation(_previous, formData) {
  const agent = await currentAgent();
  if (!agent) {
    return { ok: false, error: "Your sign-in has ended. Sign in again, then send this.", sentAt: Date.now() };
  }
  if (!agent.unitCode) {
    return { ok: false, error: "Your account is not tied to a polling unit. Call your coordinator.", sentAt: Date.now() };
  }

  const sos = formData.get("sos") === "1";

  /* Generous — a bad evening can bring several reports in a few minutes — but
     an SOS is never held back by it. */
  if (!sos) {
    const limit = rateLimit(`agent-situation:${agent.id}`, { limit: 20, windowMs: 15 * 60 * 1000 });
    if (!limit.ok) {
      return { ok: false, error: "That is a lot of reports in a short time. Wait a few minutes, then try again.", sentAt: Date.now() };
    }
  }

  const kind = sos ? { label: SOS_KIND } : situationKind(String(formData.get("kind") ?? ""));
  if (!kind) return { ok: false, errors: { kind: "Choose what is happening." }, sentAt: Date.now() };

  const severity = sos ? "CRITICAL" : String(formData.get("severity") ?? "");
  if (!urgency(severity)) return { ok: false, errors: { severity: "Choose how urgent it is." }, sentAt: Date.now() };

  const detail = String(formData.get("detail") ?? "").trim().slice(0, 1500);
  const latitude = number(formData, "latitude");
  const longitude = number(formData, "longitude");
  const accuracy = number(formData, "accuracy");

  const project = await agentElection(agent.unitCode);
  if (!project) {
    return {
      ok: false,
      error: sos
        ? "No election is running, so this could not be sent. Call your coordinator now."
        : "No election is running, so there is nowhere to send a report yet.",
      sentAt: Date.now(),
    };
  }

  const stateCode = agent.unitCode.slice(0, 2);
  let incidentId;
  try {
    incidentId = await incidents.create({
      electionId: project.id,
      unitCode: agent.unitCode,
      stateCode,
      kind: kind.label,
      severity,
      /* Sealed: a narrative names people and places, and it is the most
         sensitive thing this system stores. */
      detailSealed: detail ? seal(detail) : null,
      coordinatorId: agent.id,
    });
  } catch (error) {
    console.error("agent situation could not be saved:", error?.code ?? "", error?.message ?? error);
    return {
      ok: false,
      error: sos
        ? "The SOS could not be sent just now. Call your coordinator now, then try again."
        : "Your report could not be sent just now. Wait a minute and try again. If anyone is in danger, call your coordinator.",
      sentAt: Date.now(),
    };
  }

  /* The photograph. Never trusted by its name — the first bytes decide — and
     never allowed to cost the report: a bad camera file is dropped silently. */
  const photo = formData.get("photo");
  if (photo && typeof photo.arrayBuffer === "function" && photo.size > 0) {
    try {
      if (photo.size > 6_000_000) throw new Error("too large");
      const bytes = Buffer.from(await photo.arrayBuffer());
      const mime = sniffImage(bytes);
      if (mime) await media.attach({ incidentId, mime, bytes });
    } catch {
      /* The report is what matters. */
    }
  }

  if (sos && agent360Configured()) {
    await sendAgentEvent(agent.phone, { eventType: "distress", latitude, longitude, accuracy });
  }

  await audit.record({
    actorId: null,
    actorName: agent.name,
    action: "incident:reported",
    subject: agent.unitCode,
    meta: { kind: kind.label, severity, by: "agent", sos },
    ip: null,
  });

  /* ── STRAIGHT ONTO DATA BANK'S SITUATION BOARD ─────────────────────────
     Through the agents' door rather than the general intake. This is a
     category chosen from a list by somebody holding an approved agent's code,
     not prose to be guessed at, so the hub takes it at its word: sealed,
     chained, and standing on the Reports board rather than held for a human.
     The position goes with it, which is also what puts this agent on the
     Locations board at the moment it matters most.

     The agent's account travels, because a category on its own cannot be
     dispatched to — "ballot box snatched" does not say how many people or
     which way they went. Data Bank seals it at rest under its own key, and
     Poll360's copy stays sealed here. Where nothing was typed, a plain
     sentence says so rather than an invented account. */
  const code = await currentAgentCode();
  const category = sos ? SOS_CATEGORY : (DATABANK_CATEGORY[kind.id] ?? "OTHER");
  const narrative = detail || `${kind.label}. Reported from the agents' app with no further account.`;

  after(async () => {
    await Promise.allSettled(
      [
        sendAgentReport({
          code,
          category,
          severity: DATABANK_SEVERITY[severity] ?? "LOW",
          narrative,
          latitude,
          longitude,
          accuracyM: accuracy,
          externalId: `poll360:incident:${incidentId}`,
        }),
        latitude != null && longitude != null
          ? sendAgentPosition({ phone: agent.phone, latitude, longitude, accuracy, unitCode: agent.unitCode })
          : null,
      ].filter(Boolean)
    );
  });

  revalidatePath("/agent", "layout");
  revalidatePath("/room");
  revalidatePath("/admin");

  return { ok: true, kind: kind.label, severity, sos, sentAt: Date.now() };
}
