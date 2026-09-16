/**
 * The agent list, which Data Bank holds.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  POLL360 DOES NOT KEEP A LIST OF AGENTS
 *
 *  Who the agents are lives in Data Bank, beside the party files they came
 *  from. This product asks it three things: who is waiting (for the approval
 *  screen), what an administrator decided (which is what issues a code), and
 *  whether a code someone typed belongs to an approved agent (every sign-in).
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── A SIGN-IN NEEDS DATA BANK; FILING DOES NOT ─────────────────────────────
 * A code cannot be checked without asking the list, so when Data Bank cannot
 * be reached nobody new can sign in, and the form says so rather than calling
 * a good code wrong. An agent already signed in keeps filing: their session is
 * this product's own, and nothing on the filing path calls out.
 *
 * Needs DATABANK_URL (or the older DUMPSITE_URL) and DATABANK_AGENTS_KEY — an
 * issued key carrying agents:register, agents:approve and agents:confirm.
 */

const BASE = String((process.env.DATABANK_URL ?? process.env.DUMPSITE_URL) ?? "")
  .trim()
  .replace(/\/+$/, "");
const KEY = process.env.DATABANK_AGENTS_KEY ?? "";
const TIMEOUT_MS = 10000;
/* The relays run after the agent has already been answered, so waiting costs
   them nothing — and the first call into a cold instance is the commonest
   reason one of these is slow. */
const RELAY_TIMEOUT_MS = 25000;

export function agentListConfigured() {
  return Boolean(BASE && KEY);
}

async function call(method, path, body, timeoutMs = TIMEOUT_MS) {
  if (!agentListConfigured()) {
    const error = new Error("Data Bank's agent list is not connected.");
    error.slug = "not-configured";
    throw error;
  }

  const response = await fetch(`${BASE}${path}`, {
    method,
    /* Both header names while Data Bank still answers to its old one. */
    headers: { "content-type": "application/json", "x-databank-key": KEY, "x-dumpsite-key": KEY },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.detail ?? `Data Bank answered ${response.status}`);
    error.slug = data?.error ?? `http-${response.status}`;
    throw error;
  }
  return data;
}

const reason = (error) => error?.slug ?? error?.name ?? "unavailable";

/** `{ state: "matched", agent }`, `{ state: "no-match" }`, or `{ state: "unavailable" }`. */
export async function confirmAgentCode(code) {
  try {
    const data = await call("POST", "/api/v1/agents/confirm", { code: String(code ?? "").slice(0, 40) });
    return data.matched ? { state: "matched", agent: data.agent } : { state: "no-match" };
  } catch (error) {
    console.error("databank agent confirm:", reason(error));
    return { state: "unavailable" };
  }
}

/** A sign-up from the agents' site. `{ ok, id, outcome }` or `{ ok: false, error }`. */
export async function applyAsAgent(candidate) {
  try {
    const data = await call("POST", "/api/v1/agents", { source: "AGENT_SITE", agents: [candidate] });
    const [result] = data.results ?? [];
    return result && result.outcome !== "refused" ? { ok: true, ...result } : { ok: false, error: "refused" };
  } catch (error) {
    console.error("databank agent apply:", reason(error));
    return { ok: false, error: reason(error) };
  }
}

/** Who is waiting, with names, and the counts. */
export async function agentsWaiting({ limit = 100 } = {}) {
  try {
    const data = await call("GET", `/api/v1/agents?limit=${limit}`);
    return { ok: true, waiting: data.waiting ?? [], tally: data.tally ?? null };
  } catch (error) {
    console.error("databank agents waiting:", reason(error));
    return { ok: false, waiting: [], tally: null, error: reason(error) };
  }
}

/** How many agents are waiting, approved and so on. Opens no names; null if unreachable. */
export async function agentCounts() {
  try {
    const data = await call("GET", "/api/v1/agents?counts=1");
    return data.tally ?? null;
  } catch (error) {
    console.error("databank agent counts:", reason(error));
    return null;
  }
}

/** APPROVE, DECLINE, SUSPEND or REISSUE. Approving returns the code, once. */
export async function decideAgent({ id, decision, unitCode = null, by = null }) {
  try {
    const data = await call("POST", "/api/v1/agents/decide", { id, decision, unitCode, by });
    return { ...data, ok: true };
  } catch (error) {
    console.error("databank agent decision:", reason(error));
    return { ok: false, error: reason(error) };
  }
}

/** Move existing accounts onto the list. Throws, because it is only run from a script. */
export async function moveAgents({ agents, approve, by }) {
  const data = await call("POST", "/api/v1/agents", { source: "POLL360_MOVE", approve, by, agents });
  return data.results ?? [];
}

/* ══════════════════════════════════════════════════════════════════════════
   WHAT AN AGENT SENDS, ON ITS WAY TO THE BOARDS

   Three doors, three boards. An update reaches the Updates view of Data Bank's
   Situation dashboard; a situation report reaches the Reports view of the same
   dashboard; a position reaches the Locations dashboard. Each one is attributed
   to the agent — by their code at the first two doors, by the number the
   register already indexes at the third — so no board has to take this
   product's word for who was where.

   None of them ever throws, and none of them is on the path between an agent
   and a saved update: Poll360 writes its own record first and relays after.
   A hub that is down costs the boards a few minutes of freshness and costs the
   agent nothing.
   ══════════════════════════════════════════════════════════════════════════ */

/** One stage of the polling day, for the Updates board. */
export async function sendAgentUpdate({ code, stage, at = null, source = "WEB" }) {
  if (!code || !stage) return { ok: false, error: "nothing-to-send" };
  try {
    const data = await call("POST", "/api/v1/agents/updates", { code, stage, at, source }, RELAY_TIMEOUT_MS);
    return { ok: true, stage: data.stage, regressed: Boolean(data.regressed), at: data.at };
  } catch (error) {
    console.error("databank agent update:", reason(error));
    return { ok: false, error: reason(error) };
  }
}

/** A situation report or an SOS, for the Reports board. */
export async function sendAgentReport({
  code,
  category,
  severity,
  narrative,
  latitude = null,
  longitude = null,
  accuracyM = null,
  externalId = null,
  at = null,
  source = "WEB",
}) {
  if (!code || !category) return { ok: false, error: "nothing-to-send" };
  try {
    const data = await call("POST", "/api/v1/agents/report", {
      code,
      category,
      severity,
      narrative,
      latitude,
      longitude,
      accuracyM,
      externalId,
      at,
      source,
    }, RELAY_TIMEOUT_MS);
    return { ok: true, onTheBoard: Boolean(data.onTheBoard), severity: data.severity, id: data.id };
  } catch (error) {
    console.error("databank agent report:", reason(error));
    return { ok: false, error: reason(error) };
  }
}

/**
 * Where the agent is, for the Locations board.
 *
 * ── A DIFFERENT DOOR, AND A DIFFERENT KEY ──────────────────────────────────
 * The position heartbeat is the busiest endpoint Data Bank has, and it takes
 * the deployment key rather than an issued one: it writes a fix and reads
 * nothing. The agent is named by their phone number, which Data Bank indexes
 * with the same keyed hash its register already stores — so a position filed
 * here lands under the same agent as their updates and their reports, and no
 * board ends up holding a number.
 */
export async function sendAgentPosition({ phone, latitude, longitude, accuracy = null, unitCode = null, at = null }) {
  const endpoint = BASE;
  const key = process.env.DATABANK_API_KEY ?? process.env.DUMPSITE_API_KEY ?? "";
  if (!endpoint || !key) return { ok: false, error: "not-configured" };
  if (!phone || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    return { ok: false, error: "nothing-to-send" };
  }

  try {
    const response = await fetch(`${endpoint}/api/location`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-databank-key": key, "x-dumpsite-key": key },
      body: JSON.stringify({
        agent: phone,
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracyM: accuracy == null ? null : Number(accuracy),
        /* Channel B is the companion app: a browser fix with an accuracy
           radius. Data Bank grades it on what actually arrives, so this is a
           statement about the transport and not a claim about quality. */
        channel: "B",
        source: "WEB",
        pollingUnitCode: unitCode,
        capturedAt: at,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });

    if (!response.ok) return { ok: false, error: `http-${response.status}` };
    const data = await response.json().catch(() => ({}));
    return { ok: true, fixQuality: data.fixQuality, distanceM: data.distanceM, withinFence: data.withinFence };
  } catch (error) {
    console.error("databank agent position:", reason(error));
    return { ok: false, error: reason(error) };
  }
}
