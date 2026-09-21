import { rateLimit, consume } from "../ratelimit.js";
import { increment } from "../shared-counter.js";

/**
 * How much Ask Poll360 one account may ask, across every server at once.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO LIMITS, FOR TWO DIFFERENT REASONS
 *
 *  QUESTIONS   forty in ten minutes, per account, counted across every
 *              instance through lib/shared-counter.js. A person asking and
 *              reading never meets it; a script looping on the desk does.
 *              The in-process limiter sits underneath, so a caller is still
 *              slowed on one instance if the shared count is unreachable.
 *
 *  THE MODEL   a daily number of questions per account that may go to the
 *              model (ASK_MODEL_DAILY, default 300). Past it the question is
 *              still answered — by Poll360's own reader, from the same
 *              record — because a campaign on election morning must never be
 *              told to come back tomorrow. The ceiling protects the bill, not
 *              the answer.
 * ══════════════════════════════════════════════════════════════════════════
 */

const WINDOW_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const QUESTION_LIMIT = Number(process.env.ASK_LIMIT ?? 40);
export const FILE_LIMIT = 60;
export const MODEL_DAILY = Number(process.env.ASK_MODEL_DAILY ?? 300);

/** Is this account under its limit? Counts the attempt either way. */
export async function allow(kind, userId, limit = kind === "file" ? FILE_LIMIT : QUESTION_LIMIT) {
  const key = `ask-${kind}:${userId}`;
  const near = rateLimit(key, { limit, windowMs: WINDOW_MS });
  if (!near.ok) return { ok: false, retryAfter: near.retryAfter };
  consume(key, { windowMs: WINDOW_MS });

  const window = Math.floor(Date.now() / WINDOW_MS);
  const seen = await increment(`${key}:${window}`, WINDOW_MS);
  if (seen > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil(((window + 1) * WINDOW_MS - Date.now()) / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

/** May this question go to the model today? */
export async function modelToday(userId) {
  if (!(MODEL_DAILY > 0)) return false;
  const day = Math.floor(Date.now() / DAY_MS);
  const seen = await increment(`ask-model:${userId}:${day}`, DAY_MS);
  return seen <= MODEL_DAILY;
}
