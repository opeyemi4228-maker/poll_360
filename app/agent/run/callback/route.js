import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { agentPath } from "@/lib/agent-address";
import { clientAddress, limiterKey } from "@/lib/client-ip";
import { coordinators } from "@/lib/coordinators";
import {
  createCoordinatorSession,
  currentCoordinator,
  sweepExpiredCoordinatorSessions,
} from "@/lib/coordinator-session";
import { seal, unseal } from "@/lib/crypto";
import { audit } from "@/lib/db";
import { attempt, spend } from "@/lib/ratelimit";
import {
  exchangeCode,
  mapAgentToIdentity,
  RUN_ISSUER,
  RUN_STATE_COOKIE,
  runConfigured,
  signInDecision,
} from "@/lib/run-oauth";
import { clearCookie, readCookie } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

/**
 * Step two of "Sign in with RUN": RUN has sent the agent's browser back here
 * with a one-time code. Verify it is our own flow, swap the code for the
 * agent's identity, and — if they are an active agent — mint the very same
 * coordinator session the code sign-in mints, so nothing downstream can tell
 * which door was used.
 *
 * ── EVERY FAILURE IS A REDIRECT, NEVER A STACK TRACE ───────────────────────
 * Someone is standing at a booth holding a phone. Whatever goes wrong — a
 * tampered callback, an expired code, RUN unreachable, a paused agent — they
 * are sent back to the sign-in page with one plain word in `?run=`, which the
 * page turns into a sentence. The detail goes to the server log, never to the
 * browser, so the callback cannot be used to probe what RUN said.
 */

/* The signed-in reason words the login page understands. Anything else becomes
   a generic "could not sign in", so a new slug never leaks out raw. */
function back(reason) {
  redirect(agentPath(`/login?run=${encodeURIComponent(reason)}`));
}

export async function GET(request) {
  if (!runConfigured()) back("unavailable");

  /* Already signed in? Then a replayed or stale callback has nothing to do. */
  const already = await currentCoordinator();
  if (already?.canFile) redirect(agentPath("/"));

  const head = await headers();
  const address = clientAddress(head);
  const limiterId = `run-callback:${limiterKey(address)}`;
  const gate = await attempt(limiterId, { limit: 20, windowMs: 15 * 60 * 1000 });
  if (!gate.ok) back("throttled");

  const params = new URL(request.url).searchParams;
  const userAgent = head.get("user-agent") ?? undefined;

  /* Open and immediately clear the one-time flow cookie: used once, whatever
     the outcome, so a code cannot be replayed against the same verifier. */
  const jar = await cookies();
  const sealed = readCookie(jar, RUN_STATE_COOKIE);
  clearCookie(jar, RUN_STATE_COOKIE);

  let flow = null;
  if (sealed) {
    try {
      flow = JSON.parse(unseal(sealed));
    } catch {
      flow = null;
    }
  }

  /* Decide the destination first, then redirect once at the very end — outside
     every try/catch, because redirect() works by throwing. */
  let destination = null;

  try {
    /* RUN redirects with an error when the agent cancels or is refused. Its own
       words name which, and they map to the login page's reasons. A browser-
       driven decision by RUN is not a brute-force attempt, so it is not spent
       against the limiter — a hesitant agent who cancels twice is not locked
       out of their own sign-in. */
    const runError = params.get("error");
    if (runError) {
      const description = String(params.get("error_description") ?? "").toLowerCase();
      destination =
        description.includes("not_an_agent")
          ? "inactive"
          : description.includes("agent_paused")
            ? "paused"
            : runError === "access_denied"
              ? "cancelled"
              : "error";
    } else {
      const code = params.get("code");
      const state = params.get("state");
      const issuer = params.get("iss");

      /* ── THE CHECKS BEFORE THE CODE IS EVER SPENT ────────────────────────
         A missing flow cookie means the sign-in was not started here (or it
         expired); a state that does not match ours means this callback is not
         the one we sent; an issuer that is not exactly RUN's means the redirect
         did not come from RUN (RFC 9207 — RUN stamps `iss` on every redirect,
         so a missing or wrong one is rejected, not tolerated). Any of these and
         the code is discarded unused, and the attempt is spent, because a
         forged or replayed callback is exactly what the limiter is for. */
      if (!flow?.state || !flow?.verifier) {
        await spend(limiterId, { windowMs: 15 * 60 * 1000 });
        destination = "expired";
      } else if (!state || state !== flow.state) {
        await spend(limiterId, { windowMs: 15 * 60 * 1000 });
        console.warn("run sign-in callback: state did not match the flow cookie");
        destination = "mismatch";
      } else if (issuer !== RUN_ISSUER) {
        await spend(limiterId, { windowMs: 15 * 60 * 1000 });
        console.warn(`run sign-in callback: issuer ${issuer || "(none)"} is not ${RUN_ISSUER}`);
        destination = "mismatch";
      } else if (!code) {
        destination = "error";
      } else {
        const result = await exchangeCode({ code, verifier: flow.verifier });
        if (!result.ok) {
          await spend(limiterId, { windowMs: 15 * 60 * 1000 });
          /* No PII — the reason is a slug, never RUN's wording or the agent. */
          console.warn(`run sign-in callback: token exchange failed (${result.reason})`);
          destination = result.reason === "expired" ? "expired" : "error";
        } else {
          const decision = signInDecision(result.agent);
          if (!decision.allow) {
            destination = decision.reason; // "paused" | "inactive"
          } else {
            const identity = mapAgentToIdentity(result.agent);
            /* A booth that cannot be placed fails closed — RUN said active, but
               an unplaceable code must not file against a guessed booth. */
            const person = identity ? await coordinators.mirrorAgent(identity) : null;

            if (!person?.canFile) {
              destination = "error";
            } else {
              await createCoordinatorSession(person.id, { userAgent });
              await coordinators.markSignedIn(person.id);
              await sweepExpiredCoordinatorSessions();

              await audit.record({
                actorId: null,
                actorName: person.name,
                action: "coordinator:signed-in",
                subject: person.unitCode,
                meta: { by: "run", confirmedBy: "riseupnaija", runId: result.agent.run_id },
                ip: address.trusted ? address.ip : null,
              });

              destination = "ok";
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("run sign-in callback failed:", error?.name ?? "", error?.message ?? error);
    destination = "error";
  }

  if (destination === "ok") redirect(agentPath("/"));
  back(destination ?? "error");
}
