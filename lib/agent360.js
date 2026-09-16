import { DOOR_HEADER, signDoor } from "./agent-door.js";

/**
 * Asking Agent360 about an agent's day, and sending it their check-ins.
 *
 * ── FILING A RESULT NEVER WAITS ON THIS ────────────────────────────────────
 * Two deployments are two things that can be down at 19:00. Every call here
 * has a short timeout and turns a failure into a state the agent app can put
 * into words, and nothing about filing a return depends on any of it. An agent
 * whose check-in cannot be sent is told so, next to a results form that still
 * works.
 *
 * Unset AGENT360_URL or AGENT_DOOR_SECRET and the agent app simply has no
 * check-in section, which is right for local work and for a deployment that
 * runs without Agent360.
 */

const BASE = String(process.env.AGENT360_URL ?? "").trim().replace(/\/+$/, "");
const SECRET = process.env.AGENT_DOOR_SECRET ?? "";

export function agent360Configured() {
  return Boolean(BASE && SECRET);
}

async function call(path, payload, timeoutMs) {
  const body = JSON.stringify(payload);
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", [DOOR_HEADER]: signDoor(SECRET, body) },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Agent360 answered ${response.status} on ${path}`);
  return response.json();
}

/**
 * The agent's day. Always resolves, to one of:
 *   off · unreachable · unknown · pending · disabled · no_election · no_unit · ready
 */
export async function agentDay(phone) {
  if (!agent360Configured()) return { state: "off" };
  if (!phone) return { state: "unknown" };
  try {
    return await call("/api/agent/day", { phone }, 6000);
  } catch (error) {
    console.error("agent360 day:", error?.message ?? error);
    return { state: "unreachable" };
  }
}

/** Send one event. Always resolves, to `{ ok: true, ... }` or `{ ok: false, error }`. */
export async function sendAgentEvent(phone, { eventType, latitude, longitude, accuracy }) {
  if (!agent360Configured()) {
    return { ok: false, error: "Check-in is not switched on for this election." };
  }
  try {
    const answer = await call(
      "/api/agent/presence",
      { phone, eventType, latitude, longitude, accuracy },
      15000
    );
    if (answer?.state) return { ok: false, error: STATE_MESSAGES[answer.state] ?? STATE_MESSAGES.unknown };
    return answer;
  } catch (error) {
    console.error("agent360 presence:", error?.message ?? error);
    return {
      ok: false,
      error:
        "We could not send that just now. Your results are not affected. Wait a minute and try again.",
    };
  }
}

/** What each state means to the person holding the phone. */
export const STATE_MESSAGES = {
  unreachable:
    "Check-in is not available right now. You can still file your results. Try again in a few minutes.",
  unknown:
    "Check-in is not set up for your phone number yet. Your coordinator adds you. You can still file your results.",
  pending: "Your check-in is waiting to be approved by your coordinator. You can still file your results.",
  disabled: "Check-in is switched off for your account. Speak to your coordinator.",
  no_election: "No election is open for check-in yet.",
  no_unit:
    "You have not been given a polling unit for check-in yet. Your coordinator does that. You can still file your results.",
};
