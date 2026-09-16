/**
 * The door to Data Bank.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE PLACE EVERYTHING THIS PRODUCT RECEIVES IS ALSO SENT
 *
 *  Poll360 answers "what was the result". Agent360 answers "was somebody
 *  actually standing there". Data Bank answers the question underneath both —
 *  what arrived, from whom, when, and what happened to it — and it is where
 *  the evidence lives, sealed and chained, for the eighteen months between a
 *  polling day and a tribunal.
 *
 *  Three things this product takes in have to reach it:
 *
 *    REGISTRATION    an agent signing up, and their photograph
 *    RESULT_SHEET    the picture of Form EC8A, before anybody read it
 *    RESULT_FIGURES  the numbers, whether typed or read off that picture
 *    SITUATION_REPORT / MESSAGE   what arrives over WhatsApp
 *
 *  They all go through this one function, because the alternative is four
 *  call sites each with their own idea of what a payload looks like, and the
 *  day one of them is wrong is the day somebody needs the record.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── IT NEVER BLOCKS AND IT NEVER THROWS ────────────────────────────────────
 * This is the single most important property in the file.
 *
 * An agent standing at a booth at nine at night, on a handset, on a network
 * that is barely there, presses "file". If forwarding that return to Data Bank
 * is on the path between them and a saved result, then Data Bank being slow,
 * unreachable, unconfigured or simply not yet deployed becomes an agent who
 * cannot file — and the count loses a polling unit to a piece of plumbing.
 *
 * So every send is fire-and-forget. The caller's work is already committed to
 * Poll360's own database before this is called, the result of this call is
 * never awaited on a user's path, and a failure is written to the outbox
 * rather than raised. Poll360 is the system of record for its own returns;
 * Data Bank is the hub they are *also* delivered to.
 *
 * ── AND A FAILED SEND IS KEPT, NOT DROPPED ─────────────────────────────────
 * Fire-and-forget is only honest if the forgetting is recorded. Anything that
 * does not land is written to `dumpsite_outbox` with the reason, and can be
 * replayed by `npm run databank:replay`. A hub that quietly missed four
 * thousand returns on the one night that mattered is worse than no hub, and
 * the difference between the two is entirely this table.
 */

/** Where the hub is, and the key that opens its door. */
const ENDPOINT = (process.env.DATABANK_URL ?? process.env.DUMPSITE_URL) ?? "";
const KEY = (process.env.DATABANK_API_KEY ?? process.env.DUMPSITE_API_KEY) ?? "";

/**
 * How long to wait before giving up on the hub.
 *
 * ── FOUR SECONDS WAS MEASURED AND WAS WRONG ────────────────────────────────
 * It was four, on the reasoning that this is off a user's path, so a long
 * timeout buys nothing and costs a held connection per return on the busiest
 * hour of the year. The first half is right and the second half had the cost
 * backwards.
 *
 * Measured against the hub on a shared Neon database, over HTTPS:
 *
 *   a plain message      6.3s cold, then 1.6, 1.6, 2.2
 *   a situation report   10.9, 2.5, 4.5, 9.8
 *
 * The door does four round trips before it answers — a redelivery check, an
 * insert, the sealing update that binds the ciphertext to the row's id, and
 * the chain link — and a report classifies and routes on top of that. The
 * spread is what matters more than the median: the tail is long and it is not
 * rare, because a pooled serverless connection has no warm socket to reuse.
 *
 * So four seconds did not shed load, it manufactured it. Every forward past
 * the ceiling reported failure for an item that had in fact landed, wrote an
 * outbox row, and bought a replay round trip later to be told "redelivered".
 * A timeout short enough to fire routinely costs strictly more connections
 * than one that waits.
 *
 * Twenty sits above every figure observed, with room for a worse night. It is
 * still short enough to give up long before anything queues behind it, and
 * since nothing here is awaited on a user's path, the only thing patience
 * costs is a held socket.
 *
 * ── AND A TIMEOUT IS NOT A LOSS ────────────────────────────────────────────
 * It means the answer did not arrive, never that the item did not. Replay is
 * safe regardless: `externalId` is the hub's dedupe key, and a replayed item
 * comes back `redelivered: true` rather than becoming a second record.
 */
const TIMEOUT_MS = 20000;

/** The kinds Data Bank sorts into — see lib/taxonomy.js in that project. */
export const KIND = {
  SITUATION_REPORT: "SITUATION_REPORT",
  RESULT_SHEET: "RESULT_SHEET",
  RESULT_FIGURES: "RESULT_FIGURES",
  REGISTRATION: "REGISTRATION",
  MEDIA: "MEDIA",
  MESSAGE: "MESSAGE",
};

/** Whether the hub is wired up at all. */
export function configured() {
  return Boolean(ENDPOINT && KEY);
}

/**
 * Send one thing to the hub.
 *
 * Returns what happened rather than throwing, so a caller that wants to know
 * can look and a caller that does not can ignore it. Nothing in this product
 * should ever branch on the answer on a user's path.
 *
 * @param kind        one of KIND
 * @param payload     the body. Sealed and chained by Data Bank on receipt.
 * @param externalId  this product's own id for the thing, so a replay cannot
 *                    create a second copy — Data Bank dedupes on it.
 * @param sender      who it came from, where that is known and meaningful.
 * @param mediaHashes hashes of any images, so the hub can pair a figure with
 *                    the photograph it was read off without holding the bytes.
 */
export async function sendToDataBank({
  kind,
  payload,
  externalId = null,
  sender = null,
  mime = null,
  mediaHashes = [],
} = {}) {
  if (!configured()) {
    /* Not an error and not worth an outbox row: nobody has connected a hub.
       Said plainly so a deployment that meant to have one can tell. */
    return { sent: false, why: "not-configured" };
  }

  const body = {
    source: "API",
    kind,
    externalId,
    sender,
    mime,
    mediaHashes,
    payload: {
      ...payload,
      /* Which product and which deployment this came from. The hub serves
         more than one and a row with no origin is a row nobody can trace. */
      origin: "POLL360",
      sentAt: new Date().toISOString(),
    },
  };

  try {
    const response = await fetch(`${ENDPOINT.replace(/\/$/, "")}/api/intake`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-databank-key": KEY, "x-dumpsite-key": KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      await hold({ kind, externalId, body, why: `http-${response.status}` });
      return { sent: false, why: `http-${response.status}` };
    }

    const seen = await response.json().catch(() => ({}));
    return { sent: true, id: seen.id ?? null, status: seen.status ?? null };
  } catch (error) {
    /* Unreachable, timed out, DNS, TLS — all the same answer from here: the
       thing is kept and the caller carries on. */
    await hold({ kind, externalId, body, why: reasonOf(error) });
    return { sent: false, why: reasonOf(error) };
  }
}

/**
 * Send without making the caller wait.
 *
 * The shape every call site on a user's path should use. The promise is
 * deliberately not returned: a caller that cannot await it cannot accidentally
 * put it on the path between an agent and a saved return.
 */
export function forwardToDataBank(input) {
  /* Errors inside `sendToDataBank` are already caught and held; this catch is
     the belt to that braces, because an unhandled rejection in a server action
     can take a request down and this must never be able to. */
  void sendToDataBank(input).catch(() => {});
}

/* ─────────────────────────────────────────────────────────────── the outbox */

/**
 * Keep what did not land.
 *
 * ── WHY A TABLE AND NOT A LOG LINE ─────────────────────────────────────────
 * A log line is a thing somebody reads afterwards to find out what was lost. A
 * row is a thing a script can send again. On the morning after an election the
 * difference between those two is whether the evidence exists.
 */
async function hold({ kind, externalId, body, why }) {
  try {
    /* ── IMPORTED WHERE IT IS USED, NOT AT THE TOP ────────────────────────
       lib/sql.js refuses to load without a connection string, which is right
       for a module whose whole job is a database and wrong to inherit here:
       it would mean this file — the one thing that must never fail — could
       not even be imported on a deployment that has no database configured
       yet, and could not be tested without one.

       The happy path never touches it either. A send that lands does not open
       a connection at all. */
    const { sql } = await import("./sql.js");
    await sql`
      INSERT INTO dumpsite_outbox (kind, external_id, body, why)
      VALUES (${kind}, ${externalId}, ${JSON.stringify(body)}, ${why})
    `;
  } catch {
    /* The outbox itself is unavailable — a database that is down, or a schema
       that has not been migrated yet. There is nowhere left to put this, and
       taking the caller's request down over it would turn a delivery problem
       into a lost return. */
  }
}

/** What went wrong, in a word, for the outbox and the console. */
function reasonOf(error) {
  const name = error?.name ?? "";
  if (name === "TimeoutError" || name === "AbortError") return "timeout";
  if (name === "TypeError") return "unreachable";
  return name || "failed";
}

/**
 * Everything still waiting to be delivered.
 *
 * Read by the replay script and by the admin console, so a room can see that
 * the hub has a backlog rather than discovering it later.
 */
export async function pending({ limit = 100 } = {}) {
  try {
    const { sql } = await import("./sql.js");
    return await sql`
      SELECT id, kind, external_id, why, tries, created_at
      FROM dumpsite_outbox
      WHERE delivered_at IS NULL
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
  } catch {
    return [];
  }
}
