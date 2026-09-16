import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The agents' door: how this app asks Agent360 about an agent's day.
 *
 * ── WHY THE AGENT APP DOES NOT WRITE CHECK-INS ITSELF ──────────────────────
 * Check-ins, the SOS and presence scores belong to Agent360, which scores
 * every one of them the same way whichever channel it came in on. The two
 * products share a database, and the rule that keeps that survivable is one
 * writer per table. So the agent app signs a request and Agent360 does the
 * writing.
 *
 * A signature rather than a key in a header: it covers this body at this
 * second, cannot be moved onto another phone number, and expires in five
 * minutes.
 *
 * Kept in step with Agent360's lib/agent-door.js. Both test suites check the
 * same fixed signature, so the two copies cannot drift without a failure.
 */

export const DOOR_HEADER = "x-agent-door-signature";

/** How old a signature may be, in seconds. */
export const DOOR_MAX_AGE_S = 300;

const mac = (secret, timestamp, body) =>
  createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8");

export function signDoor(secret, body, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${mac(secret, timestamp, body).digest("hex")}`;
}

export function verifyDoor(secret, body, header, now = Math.floor(Date.now() / 1000)) {
  if (!secret || !header) return false;

  const parts = {};
  for (const piece of String(header).split(",")) {
    const at = piece.indexOf("=");
    if (at > 0) parts[piece.slice(0, at).trim()] = piece.slice(at + 1).trim();
  }

  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > DOOR_MAX_AGE_S) return false;
  if (!/^[0-9a-f]{64}$/.test(parts.v1 ?? "")) return false;

  const expected = mac(secret, timestamp, body).digest();
  const given = Buffer.from(parts.v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
