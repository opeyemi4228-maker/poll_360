import { currentUser } from "@/lib/session";
import { log } from "@/lib/guard";
import { isStranded, mayOpen } from "@/lib/roles";
import { resolveTerritory } from "@/lib/constituencies";
import { allow, modelToday } from "@/lib/ask/limits";
import { answer } from "@/lib/ask/answer";
import { readJson } from "@/lib/ask/http";

/**
 * Ask Poll360: a question in, an answer from the record out.
 *
 * ── WHO MAY ASK ────────────────────────────────────────────────────────────
 * Whoever may open the room. Ask Poll360 is a tab of its analytics head and
 * reads nothing that head does not already show, so it is granted exactly
 * where the room is — and it is narrowed to the account's ground the same way,
 * by the same function, inside the engine.
 *
 * ── HOW OFTEN ─────────────────────────────────────────────────────────────
 * Forty questions in ten minutes per account, counted across every instance,
 * and a daily ceiling on how many of them go to the model. See
 * lib/ask/limits.js.
 */

export const maxDuration = 60;

/* A question, a previous plan and three earlier turns. Anything larger was
   not sent by this product's own screen. */
const MAX_BODY = 32 * 1024;

export async function POST(request) {
  const started = Date.now();
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to ask Poll360." }, { status: 401 });
  if (user.status === "PENDING" || isStranded(user.role) || !mayOpen(user.role, "/room")) {
    return Response.json({ error: "This account cannot open the analytics room." }, { status: 403 });
  }

  const limited = await allow("question", user.id);
  if (!limited.ok) {
    return Response.json(
      { error: `That is a lot of questions at once. Ask again in ${Math.max(1, Math.ceil(limited.retryAfter / 60))} minutes.` },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const body = await readJson(request, MAX_BODY);
  if (!body) return Response.json({ error: "The question did not arrive in one piece." }, { status: 400 });

  const question = String(body?.question ?? "").replace(/\s+/g, " ").trim();
  if (question.length < 3) return Response.json({ error: "Ask a question first." }, { status: 400 });
  if (question.length > 500) return Response.json({ error: "Keep the question under 500 characters." }, { status: 400 });

  /* The conversation so far, as the browser holds it. Only its shape is
     trusted — a previous plan is re-validated by the engine before it runs,
     and the model reads earlier questions as data. */
  const previous = body?.previous && typeof body.previous === "object" ? body.previous : null;
  const history = Array.isArray(body?.history)
    ? body.history
        .slice(-3)
        .map((turn) => ({ question: String(turn?.question ?? "").slice(0, 500), headline: String(turn?.headline ?? "").slice(0, 400) }))
        .filter((turn) => turn.question)
    : [];

  /* ── THE ACCOUNT'S GROUND ─────────────────────────────────────────────
     A stored ground that no longer resolves reads nothing rather than the
     country — see lib/viewing.js for why. */
  const resolved = user.territory ? resolveTerritory(user.territory) : null;
  const territory =
    user.territory && !resolved
      ? { level: "UNRESOLVED", key: user.territory, name: "a place we no longer hold", stateCode: null, lgas: [] }
      : resolved;

  try {
    const useModel = await modelToday(user.id);
    const reply = await answer({ question, previous: safePlan(previous), history, territory, userId: user.id, useModel });
    await log(user, "ask:question", question.slice(0, 200), {
      engine: reply.engine,
      intent: reply.plans[0]?.intent ?? null,
      ms: Date.now() - started,
      dropped: reply.checked?.dropped ?? 0,
    });
    return Response.json(reply, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[ask] failed:", error);
    return Response.json({ error: "Poll360 could not answer that just now. Try asking it another way." }, { status: 500 });
  }
}

/** A previous plan only if it looks like one; the engine validates the rest. */
function safePlan(plan) {
  if (!plan || typeof plan !== "object" || !plan.intent || !plan.who || !Array.isArray(plan.levels)) return null;
  return plan;
}
