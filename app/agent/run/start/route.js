import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { agentPath } from "@/lib/agent-address";
import { clientAddress, limiterKey } from "@/lib/client-ip";
import { currentCoordinator } from "@/lib/coordinator-session";
import { seal } from "@/lib/crypto";
import { attempt } from "@/lib/ratelimit";
import {
  buildAuthorizeUrl,
  challengeFor,
  createState,
  createVerifier,
  runConfigured,
  RUN_STATE_COOKIE,
  RUN_STATE_TTL_MS,
} from "@/lib/run-oauth";
import { writeCookie } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

/**
 * Step one of "Sign in with RUN": send the agent's browser to RUN's sign-in.
 *
 * ── THE SECRET STAYS ON THIS PHONE, SEALED ─────────────────────────────────
 * PKCE needs a verifier kept until the code comes back, and the flow needs a
 * `state` to recognise its own callback. Both are generated here and sealed
 * into a short-lived cookie — never into the database, never into the URL. The
 * callback opens it, uses it once, and clears it. A ten-minute life, because a
 * sign-in that takes longer than that has been abandoned, and a stale verifier
 * is a credential with nothing to spend it on.
 */
export async function GET() {
  /* A deployment with no RUN credentials cannot finish the flow, so it never
     starts one — the agent is sent back to the code sign-in with a word. */
  if (!runConfigured()) redirect(agentPath("/login?run=unavailable"));

  /* Already signed in on this phone — the normal case — goes straight in. */
  const person = await currentCoordinator();
  if (person?.canFile) redirect(agentPath("/"));

  const head = await headers();
  const gate = await attempt(`run-start:${limiterKey(clientAddress(head))}`, {
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });
  if (!gate.ok) redirect(agentPath("/login?run=throttled"));

  const verifier = createVerifier();
  const state = createState();

  const jar = await cookies();
  writeCookie(jar, RUN_STATE_COOKIE, seal(JSON.stringify({ verifier, state })), {
    expires: new Date(Date.now() + RUN_STATE_TTL_MS),
  });

  /* Outside any try/catch: redirect() works by throwing, and RUN's sign-in URL
     is the whole point of this handler. */
  redirect(buildAuthorizeUrl({ challenge: challengeFor(verifier), state }));
}
