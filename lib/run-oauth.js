import { createHash, randomBytes } from "node:crypto";

/**
 * "Sign in with RUN" — the Rise Up Naija Partner API, as Poll360 uses it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT RUN IS, AND WHAT IT IS NOT
 *
 *  RUN holds the list of approved Polling Unit Agents. An agent signs in on
 *  RUN's own page — never typing their RUN password into Poll360 — and RUN
 *  hands this product the agent's *verified identity*: who they are, which
 *  booth they hold, and whether they are currently an active agent. That is
 *  the whole of what crosses. Nothing Poll360 sends can change RUN data, and
 *  RUN issues no token Poll360 keeps: the identity is swapped for a one-time
 *  code and then Poll360 mints its own coordinator session, exactly as the
 *  code sign-in does. See app/agent/run/callback/route.js.
 *
 *  So this is a second door onto the *same* session the agent code produces —
 *  an active agent, a booth, a phone — and everything downstream (filing a
 *  return, a situation report, an update, a position) is unchanged by which
 *  door was used.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE ONE THING THE CODE DOOR HAS THAT THIS ONE DOES NOT ─────────────────
 * Data Bank's updates and situation-report boards attribute a claim by the
 * agent's *code* (see lib/agent-code-vault.js). A RUN sign-in never sees that
 * code, so those two relays are skipped for a RUN-signed-in agent — which is
 * already a non-fatal, silent skip by design: the update and the report are
 * still saved by Poll360, still reach the situation room, and the agent's
 * position still reaches the Locations board (it is keyed by phone, not code).
 *
 * ── CONFIGURATION ──────────────────────────────────────────────────────────
 * Inert until the deployment is given RUN's credentials, so the button never
 * appears on a deployment that cannot complete the flow:
 *
 *   RUN_CLIENT_ID, RUN_CLIENT_SECRET   issued by RUN, server-side only
 *   RUN_REDIRECT_URI                   the callback, registered with RUN exactly
 *   RUN_PARTNER_API_URL                token + verify base (has a default)
 *   RUN_AUTHORIZE_URL                  the sign-in page   (has a default)
 *   RUN_ISSUER                         the `iss` to expect (has a default)
 *   RUN_SCOPE                          default "agents:read agents:contact"
 *
 * `agents:contact` is what returns the agent's phone number. The phone is how
 * a position reaches the Locations board and how a result is attributed, so it
 * is requested by default — but RUN grants that scope separately, and a flow
 * that comes back with no phone still signs the agent in and files returns.
 */

const trimSlashes = (value) => String(value ?? "").trim().replace(/\/+$/, "");

export const RUN_API_URL =
  trimSlashes(process.env.RUN_PARTNER_API_URL) ||
  "https://oxmkdcykfbzkuqgjfujv.supabase.co/functions/v1/partner-api";

export const RUN_AUTHORIZE_URL =
  trimSlashes(process.env.RUN_AUTHORIZE_URL) || "https://www.riseupnaija.org.ng/oauth/authorize";

/* The exact string RUN stamps into the redirect as `iss`, checked on every
   callback. A sign-in whose issuer is not this one is discarded rather than
   trusted — it is how a redirect from somewhere else is told from RUN's. */
export const RUN_ISSUER = trimSlashes(process.env.RUN_ISSUER) || "https://www.riseupnaija.org.ng";

export const RUN_SCOPE = String(process.env.RUN_SCOPE ?? "agents:read agents:contact").trim();

const CLIENT_ID = process.env.RUN_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.RUN_CLIENT_SECRET ?? "";
const REDIRECT_URI = String(process.env.RUN_REDIRECT_URI ?? "").trim();

const TIMEOUT_MS = 10_000;

/**
 * The transient cookie that carries the PKCE verifier and the `state` between
 * the start redirect and the callback. Sealed, http-only, ten minutes. Named
 * here so the two route handlers cannot drift about what it is called.
 */
export const RUN_STATE_COOKIE = "poll360_run_oauth";
export const RUN_STATE_TTL_MS = 10 * 60 * 1000;

/** Whether this deployment can run the flow at all. The button hides otherwise. */
export function runConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI && RUN_API_URL && RUN_AUTHORIZE_URL);
}

export function runRedirectUri() {
  return REDIRECT_URI;
}

/* ══════════════════════════════════════════════════════════════════════════
   PKCE + STATE — pure, so they can be tested without a network
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A fresh PKCE verifier: 43–128 characters of URL-safe randomness. 32 bytes of
 * entropy encodes to 43 base64url characters, comfortably inside the range and
 * well past guessing.
 */
export function createVerifier() {
  return randomBytes(32).toString("base64url");
}

/** The S256 challenge RUN expects: base64url( sha256( verifier ) ). */
export function challengeFor(verifier) {
  return createHash("sha256").update(String(verifier)).digest("base64url");
}

/** An opaque anti-forgery value, echoed back in the redirect and checked there. */
export function createState() {
  return randomBytes(24).toString("base64url");
}

/**
 * The address to send the agent's browser to. Built here so the one place that
 * states the parameters is the one place that can get them wrong.
 */
export function buildAuthorizeUrl({ challenge, state }) {
  const url = new URL(RUN_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", RUN_SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/* ══════════════════════════════════════════════════════════════════════════
   THE IDENTITY RUN RETURNS — mapping and the sign-in decision (pure)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Turn RUN's Agent object into what `coordinators.mirrorAgent` reads.
 *
 * ── THE RUN ID BECOMES THE DATA BANK AGENT ID, PREFIXED ────────────────────
 * `mirrorAgent` keys a coordinator row on a stable external id, so a RUN agent
 * signing in twice reuses one row rather than growing a new one each morning.
 * RUN's `run_id` is that stable key; it is prefixed `run:` so it can never be
 * mistaken for a Data Bank agent id on the same column.
 *
 * ── THE SERVING BOOTH, NEVER THE VOTING ONE ────────────────────────────────
 * RUN's sign-in response carries two polling units: `polling_unit`, the booth
 * the agent was *assigned to work*, and `voting.polling_unit`, where that
 * person happens to *cast their own vote*. The two can be different places, and
 * Poll360 files returns for the booth an agent is standing at — so this reads
 * `polling_unit` and only that. Taking the voting unit by mistake would file a
 * booth's result under the agent's home ward. Read explicitly here so the
 * distinction cannot be lost in a later edit.
 *
 * ── RUN's PUNCTUATION ──────────────────────────────────────────────────────
 * RUN writes a unit code with dashes (SS-LL-WW-PPP); Poll360 keys booths with
 * slashes. `parseUnitCode` in lib/units.js already normalises either, and it
 * fails closed on anything that is not four parts — which is the right answer,
 * because a booth that cannot be placed must not file against a guessed one.
 *
 * ── WHAT IS DELIBERATELY DROPPED ───────────────────────────────────────────
 * RUN may also return `email`, `voting.vin` and the voting unit. None are
 * needed to file a return, a report, an update or a position, and this product
 * holds the least identity it can — so they are read past, not stored. "Ignore
 * fields you don't know" from RUN's own guide, applied also to fields we do.
 */
export function mapAgentToIdentity(agent) {
  if (!agent || typeof agent !== "object") return null;
  const runId = String(agent.run_id ?? "").trim();
  /* The assigned/serving booth only — never agent.voting.polling_unit. */
  const unit = agent.polling_unit?.code ? String(agent.polling_unit.code).trim() : null;
  if (!runId || !unit) return null;

  return {
    id: `run:${runId}`,
    fullName: String(agent.full_name ?? "").trim() || `Agent ${runId}`,
    /* Only present with the agents:contact scope; null is fine downstream. */
    phone: agent.phone ? String(agent.phone).trim() : null,
    pollingUnitCode: unit,
  };
}

/**
 * May this agent file? Mirrors the rule RUN's own docs state.
 *
 *   active   → in.
 *   paused   → holds a seat but must not report; kept out, told to resume.
 *   inactive → not a current agent; kept out. (Also what RUN returns for a
 *              made-up id, so the message cannot be used to probe membership.)
 */
export function signInDecision(agent) {
  const status = String(agent?.status ?? "").toLowerCase();
  if (status === "active") return { allow: true, status };
  if (status === "paused") return { allow: false, status, reason: "paused" };
  return { allow: false, status: status || "inactive", reason: "inactive" };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE CODE EXCHANGE — server-to-server, the one network call here
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Swap the one-time code (with the PKCE verifier) for the agent's identity.
 *
 * HTTP Basic with client_id:client_secret, exactly as RUN's token endpoint
 * wants. Returns `{ ok: true, agent }` or `{ ok: false, reason }` — never
 * throws, so the callback has one shape to branch on and can always answer the
 * browser with a redirect rather than a stack trace. `reason` is a short slug
 * for the log and for a safe message; it never carries RUN's wording.
 */
export async function exchangeCode({ code, verifier }) {
  if (!runConfigured()) return { ok: false, reason: "not-configured" };
  if (!code || !verifier) return { ok: false, reason: "invalid-request" };

  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });

  let response;
  try {
    response = await fetch(`${RUN_API_URL}/oauth/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
      cache: "no-store",
      /* RUN refuses to follow a redirect off its token host; so do we. */
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, reason: error?.name === "TimeoutError" ? "timed-out" : "unreachable" };
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    /* invalid_grant is the expected one — an expired, reused or mismatched
       code — and it means "start again", not "something is broken". */
    return { ok: false, reason: data?.error === "invalid_grant" ? "expired" : data?.error ?? `http-${response.status}` };
  }

  const agent = data?.agent;
  if (!agent?.run_id || !agent?.status) return { ok: false, reason: "no-agent" };

  return { ok: true, agent };
}
