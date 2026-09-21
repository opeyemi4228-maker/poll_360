import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * A seal on an answer, so a file can only print what Poll360 said.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY A DOWNLOAD NEEDS ONE
 *
 *  A branded PDF is a claim with Poll360's name on it. The figures in it are
 *  recomputed on the server from the plan, so they cannot be forged — but the
 *  words around them came from the answer on the screen, and a route that
 *  printed whatever words a browser posted would print a forged headline
 *  under the product's mark for anybody who asked.
 *
 *  So the answer is sealed when it is made, for the account that asked, and a
 *  file is only drawn from an answer whose seal holds.
 * ══════════════════════════════════════════════════════════════════════════
 */

const SECRET = (() => {
  const configured = process.env.ASK_SIGNING_SECRET || process.env.ENCRYPTION_KEY;
  if (configured) return createHmac("sha256", "poll360:ask").update(configured).digest();
  /* No secret configured: seals hold for the life of this process, which is
     enough for development and never silently weaker than that. */
  return randomBytes(32);
})();

/** Seven days: a brief is downloaded again when it is argued over, not months later. */
const LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function seal(payload, userId) {
  return createHmac("sha256", SECRET).update(`${userId}\n${canonical(payload)}`).digest("base64url");
}

export function holds(payload, userId, token) {
  if (typeof token !== "string" || !payload) return false;
  const want = Buffer.from(seal(payload, userId));
  const have = Buffer.from(token);
  if (want.length !== have.length || !timingSafeEqual(want, have)) return false;
  const at = Date.parse(payload.askedAt ?? "");
  return Number.isFinite(at) && Date.now() - at < LIFETIME_MS;
}
