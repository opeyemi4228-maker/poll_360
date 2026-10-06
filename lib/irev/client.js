/**
 * The reader for INEC's Result Viewing Portal (IReV).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT ASKS THE SAME SERVICE THE PORTAL'S OWN PAGES ASK
 *
 *  IReV is a page that draws itself from a data service: a list of election
 *  types, the elections of each type, and for one election the tree of local
 *  governments, wards and polling units, each unit carrying the address of
 *  its scanned Form EC8A. Reading that service directly is the same data the
 *  page shows, without a browser, and it does not break when the page is
 *  restyled.
 *
 *  ── WHAT IT DOES NOT HOLD, AND NOTHING HERE PRETENDS OTHERWISE ───────────
 *  The commission publishes photographs of result sheets. It publishes no
 *  vote figures: every total the service carries reads zero. So what can be
 *  gathered automatically is which sheet is up for which polling unit, when
 *  it went up, and where the photograph is. The numbers are on the paper.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── IT IS A GUEST, AND BEHAVES LIKE ONE ────────────────────────────────────
 * Nothing here signs in, and nothing is asked for faster than a few requests
 * at a time. A whole nationwide election is 8,809 wards; read four at a time
 * that takes a while, and the service is still answering everybody else at
 * the end of it.
 */

/** The portal itself, which names the data service it is currently using. */
export const PORTAL = "https://www.inecelectionresults.ng/";

/** Where the data service was last seen. The commission has moved it before,
    which is why `discover()` exists and why a setting can override both. */
const KNOWN_SERVICE = "https://dolphin-app-sleqh.ondigitalocean.app/api/v1/";

const TIMEOUT_MS = 45000;
const ATTEMPTS = 4;

const HEADERS = {
  accept: "application/json, text/plain, */*",
  origin: PORTAL.replace(/\/$/, ""),
  referer: PORTAL,
  "user-agent": "Mozilla/5.0 (compatible; Poll360 results reader)",
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A failure worth trying again: the network, a busy server, a rate limit. */
function passing(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * Find the data service by reading the portal's own script.
 *
 * The address is written into the page's main script as the return value of
 * `getEndpoint()`. When the known address stops answering, this is how the
 * reader follows the portal to wherever it moved without anybody editing code
 * on an election night.
 */
export async function discover({ fetcher = fetch } = {}) {
  const page = await fetcher(PORTAL, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!page.ok) return null;

  const script = (await page.text()).match(/src="(main\.[a-z0-9]+\.js)"/i)?.[1];
  if (!script) return null;

  const body = await fetcher(new URL(script, PORTAL), {
    headers: HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!body.ok) return null;

  return serviceIn(await body.text());
}

/** The service address inside the portal's script, or null. */
export function serviceIn(script) {
  const found = String(script ?? "").match(/getEndpoint\(\)\{return"(https:\/\/[^"]+\/api\/v\d+\/)"\}/);
  return found?.[1] ?? null;
}

/**
 * A reader bound to one service address.
 *
 * `get(path, params)` returns the whole answer — some paths put what matters
 * beside `data` rather than inside it — and throws with a plain sentence when
 * the service cannot be read after every attempt.
 */
export function irev({
  service = process.env.IREV_API_URL || KNOWN_SERVICE,
  fetcher = fetch,
  wait = pause,
  /* How long one answer may take, and how many times it is asked for. The
     defaults suit a command with all night. A caller working to a clock —
     a turn that must end inside a minute — gives shorter ones, because four
     tries of forty-five seconds is three minutes spent on one stalled ward. */
  timeoutMs = TIMEOUT_MS,
  attempts = ATTEMPTS,
} = {}) {
  let base = service.endsWith("/") ? service : `${service}/`;
  let looked = false;

  async function once(path, params, patience = timeoutMs) {
    const url = new URL(path, base);
    for (const [name, value] of Object.entries(params ?? {})) {
      if (value !== null && value !== undefined && value !== "") url.searchParams.set(name, value);
    }

    const answer = await fetcher(url, { headers: HEADERS, signal: AbortSignal.timeout(patience) });
    if (!answer.ok) {
      const error = new Error(`IReV answered ${answer.status} for ${path}`);
      error.status = answer.status;
      throw error;
    }

    const body = await answer.json();
    if (body?.success === false) {
      const error = new Error(`IReV refused ${path}: ${body.message ?? "no reason given"}`);
      error.status = 400;
      throw error;
    }
    return body;
  }

  async function get(path, params, patience = timeoutMs) {
    let last;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await once(path, params, patience);
      } catch (error) {
        last = error;
        /* A refusal is an answer. Asking again gets the same one. */
        if (error.status && !passing(error.status)) break;
        if (attempt < attempts) await wait(600 * 2 ** (attempt - 1) + Math.random() * 400);
      }
    }

    /* Before giving up, ask the portal once whether the service has moved. */
    if (!looked && !(last?.status && !passing(last.status))) {
      looked = true;
      const moved = await discover({ fetcher }).catch(() => null);
      if (moved && moved !== base) {
        base = moved;
        return get(path, params, patience);
      }
    }

    /* Said in words a person can act on, not as the runtime's own name for it. */
    if (last?.name === "TimeoutError" || last?.name === "AbortError") {
      throw new Error("INEC's portal took too long to answer. It will be tried again.");
    }
    throw last;
  }

  return {
    get,
    service: () => base,
    types: async () => (await get("election-types")).data ?? [],
    /** Every election of one type, optionally in one state. Newest first. */
    elections: async (typeRef, stateId = null) =>
      (await get("elections", { election_type: typeRef, state_id: stateId })).data ?? [],
    /** Every local government the election covers, each with its wards. */
    /* One answer for the whole election: five megabytes and twenty seconds
       for a nationwide one, so it is given longer than anything else. */
    places: async (electionRef) => (await get(`elections/${electionRef}/lga`, null, Math.max(timeoutMs, 90000))).data ?? [],
    /** Every polling unit in one ward, each with its sheet where one is up. */
    ward: async (electionRef, wardRef) =>
      (await get(`elections/${electionRef}/pus`, { ward: wardRef })).data ?? [],
    /** How many units the election expects and how many sheets are up. */
    stats: async (electionRef) => (await get(`elections/${electionRef}/result/stats`)).data ?? null,
    /** The hundred most recently uploaded sheets. */
    recent: async (electionRef) => (await get(`elections/${electionRef}/pus/recent`)).data ?? [],
  };
}

/**
 * Run `work` over `items`, a few at a time, and keep going past a failure.
 *
 * One ward that will not load must not cost the other eight thousand, so a
 * failure is collected with the item it belongs to and handed back.
 */
export async function inTurn(items, work, { atOnce = 4, until = Infinity } = {}) {
  const failed = [];
  let next = 0;

  async function lane() {
    /* `until` is a time on the clock. Nothing new is begun after it; what is
       already under way is allowed to finish. */
    while (next < items.length && Date.now() < until) {
      const item = items[next];
      next += 1;
      try {
        await work(item);
      } catch (error) {
        failed.push({ item, error });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(atOnce, items.length)) }, lane));
  return failed;
}
