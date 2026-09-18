import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proving that a delivery to Data Bank came from this product, unaltered.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A KEY IN A HEADER ANSWERS ONE QUESTION AND THIS PIPELINE ASKS THREE
 *
 *  Every registration, result sheet, set of figures and situation report this
 *  product receives is also posted to Data Bank, where it is sealed and
 *  chained as evidence for the eighteen months between a polling day and a
 *  tribunal. The only thing on that request today is a shared key.
 *
 *  A key says "whoever is calling knows the key". It does not say:
 *
 *    IS THIS THE BODY WE SENT?   A key is the same on every request, so it
 *                                proves nothing about the request it is on.
 *                                Anyone positioned to alter the body — a
 *                                proxy, a compromised egress, anything that
 *                                terminates TLS — can change a figure and
 *                                the key still checks out.
 *
 *    IS THIS RECENT?             A captured request can be replayed a year
 *                                later and is indistinguishable from a fresh
 *                                one. The hub dedupes on the external id, so
 *                                a replay of an *unchanged* item is caught —
 *                                but a replay with the id edited is not.
 *
 *    IS THE KEY STILL OURS?      A key lifted from a log, a screenshot or an
 *                                environment listing is full authority until
 *                                somebody rotates it. A signing secret never
 *                                travels on the wire at all, so there is no
 *                                log, screenshot or listing to lift it from.
 *
 *  Evidence that can be altered in transit is not evidence. That is the whole
 *  reason this exists.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE SCHEME IS THE ONE THIS CODEBASE ALREADY USES ───────────────────────
 * Deliberately identical to lib/agent-door.js, which signs every request
 * between this product and Agent360: an HMAC over "<timestamp>.<body>", the
 * timestamp carried alongside so the receiver can refuse anything stale, and
 * a constant-time comparison. One scheme in a codebase is a scheme people
 * get right; two is a scheme people get right once.
 *
 * ── AND IT IS ADDED BESIDE THE KEY, NOT IN PLACE OF IT ─────────────────────
 * The hub keeps accepting the key it accepts today. A signature is an extra
 * header, which a receiver that has not been taught about it ignores, so this
 * can be deployed on this side first and switched to required on the hub's
 * side afterwards. A change that requires two deployments to land at the same
 * instant is a change that will be made on an election morning.
 */

/** The header the signature travels in. */
export const SIGNATURE_HEADER = "x-databank-signature";

/**
 * How old a signature may be, in seconds.
 *
 * Five minutes, matching the agents' door. Long enough that a clock a minute
 * out at either end is fine, short enough that a captured request is useless
 * by the time anybody has read it.
 */
export const MAX_AGE_S = 300;

const mac = (secret, timestamp, body) =>
  createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8");

/**
 * Sign a body.
 *
 * @param secret     DATABANK_SIGNING_SECRET, held by both ends and never sent
 * @param body       the exact bytes that will be posted, as a string
 * @param timestamp  seconds since the epoch; overridable for tests only
 */
export function sign(secret, body, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${mac(secret, timestamp, body).digest("hex")}`;
}

/**
 * Check a signature against the body it claims to cover.
 *
 * Returns a plain boolean, and returns false for every kind of wrong: no
 * secret, no header, a malformed header, a stale timestamp, a signature over
 * different bytes. A receiver branching on *why* it failed is a receiver
 * telling an attacker which part they got right.
 */
export function verify(secret, body, header, now = Math.floor(Date.now() / 1000)) {
  if (!secret || !header) return false;

  const parts = {};
  for (const piece of String(header).split(",")) {
    const at = piece.indexOf("=");
    if (at > 0) parts[piece.slice(0, at).trim()] = piece.slice(at + 1).trim();
  }

  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > MAX_AGE_S) return false;
  /* Checked for shape before being decoded, because Buffer.from with a
     malformed hex string silently returns a short buffer rather than
     throwing, and a short buffer compared against a long one is a comparison
     that could be arranged to succeed. */
  if (!/^[0-9a-f]{64}$/.test(parts.v1 ?? "")) return false;

  const expected = mac(secret, timestamp, body).digest();
  const given = Buffer.from(parts.v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Whether this deployment is signing at all. */
export function signingConfigured() {
  return Boolean(process.env.DATABANK_SIGNING_SECRET);
}
