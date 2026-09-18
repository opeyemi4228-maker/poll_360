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
 * does not land is written to `dumpsite_outbox` with the reason, and is sent
 * again — by the drain below, on its own, and by `npm run databank:replay` on
 * demand. A hub that quietly missed four thousand returns on the one night
 * that mattered is worse than no hub, and the difference between the two is
 * entirely this table.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT WAS ADDED, AND WHY EACH PIECE EARNS ITS PLACE
 *
 *  SIGNED           The body is signed, not merely accompanied by a key. A
 *                   key proves somebody knows the key; a signature proves
 *                   *this body* left *this product* within the last five
 *                   minutes. Evidence that can be altered in transit is not
 *                   evidence. See lib/databank-signature.js.
 *
 *  BOUNDED          Only so many forwards are in flight at once. "Not
 *                   awaited" never meant "costs nothing": each one holds a
 *                   socket for as long as the hub takes, and the hub's
 *                   measured tail is ten seconds. Unbounded, the hour every
 *                   booth finishes counting is every return of that hour
 *                   open at the same moment, competing with the agents'
 *                   own requests. See lib/circuit.js.
 *
 *  BROKEN OPEN      When the hub has failed enough times in a row that it is
 *                   plainly down, calling it stops for a while. A thousand
 *                   calls to a dead endpoint is a thousand ten-second
 *                   timeouts to learn something already known — and every one
 *                   of those is a socket the agents need.
 *
 *  DRAINED          The outbox retries itself, oldest first, with a growing
 *                   and jittered gap. It used to wait for somebody to run a
 *                   script, which means it waited until somebody noticed.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { backoff, breaker, gate } from "./circuit.js";
import { SIGNATURE_HEADER, sign, signingConfigured } from "./databank-signature.js";

/** Where the hub is, and the key that opens its door. */
const ENDPOINT = (process.env.DATABANK_URL ?? process.env.DUMPSITE_URL) ?? "";
const KEY = (process.env.DATABANK_API_KEY ?? process.env.DUMPSITE_API_KEY) ?? "";
/** Held by both ends, never sent. See lib/databank-signature.js. */
const SIGNING_SECRET = process.env.DATABANK_SIGNING_SECRET ?? "";

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
 * costs is a held socket — which is now bounded by the gate below, so the
 * reasoning that made twenty safe is enforced rather than assumed.
 */
const TIMEOUT_MS = 20000;

/**
 * How many forwards may be in the air at once.
 *
 * ── WHERE SIXTEEN COMES FROM ───────────────────────────────────────────────
 * The hub answers in one to ten seconds. At sixteen in flight that is between
 * one and a half and sixteen deliveries a second sustained, which comfortably
 * exceeds any arrival rate a single instance of this application will see —
 * returns arrive over hours from 176,846 booths, and the platform runs many
 * instances. So it is high enough never to be the bottleneck in practice, and
 * low enough that a hub having a bad night cannot hold hundreds of sockets
 * open on a machine that also has agents to serve.
 *
 * The queue behind it is five hundred, which at the worst observed latency is
 * about five minutes of backlog. Anything past that is refused into the
 * outbox rather than held in memory, because a queue with no ceiling is a
 * memory leak that presents as a working system.
 */
const inFlight = gate({ limit: 16, queueLimit: 500 });

/**
 * When to stop calling a hub that is plainly down.
 *
 * Five consecutive failures, then thirty seconds of not asking, doubling to
 * five minutes while it stays down. Five rather than three because the hub's
 * own tail is long and three slow nights in a row is not an outage; thirty
 * seconds rather than five minutes to start with because most of what this
 * catches is a deploy, and a deploy is over in under a minute.
 */
const hub = breaker({ failures: 5, coolOffMs: 30_000, maxCoolOffMs: 5 * 60_000 });

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
 * What the pipeline is doing, for the administrator's health screen.
 *
 * ── WHY THIS IS WORTH A SCREEN ─────────────────────────────────────────────
 * The whole design of this file is that a failure here is invisible from
 * every other screen in the product: a return files, a board updates, an
 * agent sees a tick, and the delivery to the hub quietly did not happen. The
 * outbox records it, and an outbox nobody looks at is a log.
 *
 * So the state is readable: whether anything is signed, whether the breaker
 * has given up on the hub, how many forwards are waiting for a slot.
 */
export function hubStats() {
  return {
    configured: configured(),
    signed: Boolean(SIGNING_SECRET),
    breaker: hub.stats(),
    gate: inFlight.stats(),
  };
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

  return deliver({ kind, externalId, body });
}

/**
 * Post one already-built body, through the gate and the breaker.
 *
 * Shared by the first attempt and by every replay, so the two cannot drift:
 * a retry that skipped the breaker would be a retry that hammers a hub the
 * first attempt had the sense to leave alone.
 */
async function deliver({ kind, externalId, body, hold: keep = true }) {
  /* ── REFUSED BEFORE A SOCKET IS OPENED ────────────────────────────────
     The hub has failed enough times in a row to be considered down. Calling
     it again costs a twenty-second timeout and tells nobody anything. */
  if (!hub.ready()) {
    if (keep) await hold({ kind, externalId, body, why: "hub-down" });
    return { sent: false, why: "hub-down" };
  }

  const text = JSON.stringify(body);

  const headers = {
    "content-type": "application/json",
    /* Both spellings, because the hub accepts either and this product has
       been deployed against both names of it. */
    "x-databank-key": KEY,
    "x-dumpsite-key": KEY,
  };

  /* ── SIGNED WHEN A SECRET IS SET, AND ONLY THEN ───────────────────────
     Added beside the key rather than instead of it, so this side can deploy
     before the hub is taught to require it. A receiver that does not know
     the header ignores it. See lib/databank-signature.js. */
  if (SIGNING_SECRET) {
    headers[SIGNATURE_HEADER] = sign(SIGNING_SECRET, text);
  }

  try {
    const response = await inFlight.run(() =>
      fetch(`${ENDPOINT.replace(/\/$/, "")}/api/intake`, {
        method: "POST",
        headers,
        body: text,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        /* Nothing about a delivery is cacheable, and a cached POST response
           would mean a second return told it had already landed. */
        cache: "no-store",
      })
    );

    if (!response.ok) {
      /* ── WHICH REFUSALS COUNT AGAINST THE HUB ──────────────────────────
         A 500 or a 503 is the hub being unwell and is worth opening the
         breaker over. A 401 or a 400 is *this product* being wrong — a key
         that was rotated, a body the hub will never accept — and retrying it
         a thousand times will not fix it. Both are held for replay, because
         a rotated key is fixed by setting the new one and running the drain;
         only the first kind is counted. */
      if (response.status >= 500) hub.failed();
      else hub.succeeded();

      if (keep) await hold({ kind, externalId, body, why: `http-${response.status}` });
      return { sent: false, why: `http-${response.status}` };
    }

    hub.succeeded();
    const seen = await response.json().catch(() => ({}));
    return { sent: true, id: seen.id ?? null, status: seen.status ?? null };
  } catch (error) {
    /* Unreachable, timed out, DNS, TLS, or turned away at the gate — all the
       same answer from here: the thing is kept and the caller carries on. */
    const why = reasonOf(error);
    /* A forward turned away because too much was already queued says nothing
       about whether the hub is well, so it must not open the breaker. */
    if (why !== "shed") hub.failed();

    if (keep) await hold({ kind, externalId, body, why });
    return { sent: false, why };
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

    /* ── ONE ROW PER THING, NOT ONE PER ATTEMPT ───────────────────────────
       An item that fails four times should be one row with four tries
       against it, not four rows that each get retried separately and each
       arrive at the hub to be told "redelivered". Without the conflict
       clause, a night of a flapping hub fills this table with copies of the
       same returns and the drain then spends its budget re-sending them.

       Keyed on the external id, which every forward that matters carries.
       Anything without one — there are a few — falls back to a plain insert,
       because there is nothing to recognise it by.

       ── AND WHY THIS IS A CTE AND NOT `ON CONFLICT` ──────────────────────
       `ON CONFLICT` needs a unique index to conflict *with*, and a unique
       index on the external id cannot be added to this table: it already
       holds rows from before this rule existed, several of which are the
       same return written twice by exactly the failure being fixed here, so
       building the index would fail on a live database at boot.

       Update-then-insert-if-nothing-was-updated needs no index. Two writers
       racing can still both find nothing and both insert, which is the same
       duplicate this was avoiding — but that is one duplicate in a rare race
       rather than one per retry, and the drain sends both to a hub that
       dedupes on the id anyway. */
    if (externalId) {
      await sql`
        WITH amended AS (
          UPDATE dumpsite_outbox
             SET why = ${why},
                 tries = tries + 1,
                 body = ${JSON.stringify(body)}
           WHERE external_id = ${externalId}
             AND delivered_at IS NULL
          RETURNING id
        )
        INSERT INTO dumpsite_outbox (kind, external_id, body, why, tries, next_try_at)
        SELECT ${kind}, ${externalId}, ${JSON.stringify(body)}, ${why}, 1, now()
         WHERE NOT EXISTS (SELECT 1 FROM amended)
      `;
      return;
    }

    await sql`
      INSERT INTO dumpsite_outbox (kind, external_id, body, why, tries, next_try_at)
      VALUES (${kind}, ${externalId}, ${JSON.stringify(body)}, ${why}, 1, now())
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
  if (name === "Shed") return "shed";
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

/**
 * Send again whatever is owed and due.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  AN OUTBOX THAT WAITS FOR SOMEBODY TO NOTICE IS A LOG WITH EXTRA STEPS
 *
 *  `npm run databank:replay` has always existed and works. What it needs is a
 *  person who knows that something did not land — and the entire design of
 *  this file is that nothing visible happens when a forward fails. So the
 *  backlog sits there until somebody opens the right screen, which on the
 *  night that matters is nobody.
 *
 *  This drains it without being asked. Safe to run from anywhere and from
 *  several instances at once: rows are claimed with a conditional update, so
 *  two drains running together take different work rather than sending the
 *  same return twice — and even if they did, the hub dedupes on the external
 *  id and answers "redelivered".
 * ══════════════════════════════════════════════════════════════════════════
 *
 * @param batch  how many to attempt in one pass. Small on purpose: this runs
 *               opportunistically off the back of ordinary requests, and a
 *               drain that tried to clear four thousand rows in one go would
 *               be a request that never finished.
 */
export async function drainOutbox({ batch = 25 } = {}) {
  if (!configured()) return { attempted: 0, delivered: 0, why: "not-configured" };
  /* The breaker's whole job is to stop this asking a dead hub four thousand
     times. Checked before the query as well as inside `deliver`, so a drain
     against a hub that is down costs nothing at all, not even a read. */
  if (hub.stats().state === "open") return { attempted: 0, delivered: 0, why: "hub-down" };

  let rows;
  try {
    const { sql } = await import("./sql.js");

    /* ── CLAIMED, NOT MERELY READ ─────────────────────────────────────────
       Two instances draining at once would otherwise both read the same
       oldest rows and both send them. Pushing `next_try_at` forward as part
       of the same statement that selects them means the second drain sees
       rows that are not due and takes the next ones instead.

       The push is the backoff for this row's next attempt, so a row that
       keeps failing is tried less and less often rather than spinning. */
    rows = await sql`
      UPDATE dumpsite_outbox
         SET next_try_at = now() + (interval '1 second' * LEAST(600, POWER(2, LEAST(tries, 9))))
       WHERE id IN (
         SELECT id FROM dumpsite_outbox
          WHERE delivered_at IS NULL
            AND (next_try_at IS NULL OR next_try_at <= now())
          ORDER BY created_at ASC
          LIMIT ${batch}
          FOR UPDATE SKIP LOCKED
       )
      RETURNING id, kind, external_id, body, tries
    `;
  } catch {
    /* No database, no schema, no drain. Never a thrown error: this is called
       from places that must not fail because the outbox is unavailable. */
    return { attempted: 0, delivered: 0, why: "unavailable" };
  }

  let delivered = 0;

  for (const row of rows ?? []) {
    let body;
    try {
      body = typeof row.body === "string" ? JSON.parse(row.body) : row.body;
    } catch {
      /* A row whose body is not readable will never be deliverable. Marked
         done with the reason, so it stops being retried forever and is still
         there to be looked at. */
      await markDone(row.id, "unreadable");
      continue;
    }

    const seen = await deliver({
      kind: row.kind,
      externalId: row.external_id,
      body,
      /* Already in the outbox: a failure updates this row rather than writing
         a second one describing the same failure. */
      hold: false,
    });

    if (seen.sent) {
      delivered += 1;
      await markDone(row.id, null);
      continue;
    }

    await markTried(row.id, seen.why);

    /* The hub has gone down mid-drain. Stop rather than working through the
       rest of the batch collecting identical timeouts. */
    if (seen.why === "hub-down") break;

    /* Space the attempts out, and not all at the same instant — see the note
       over `backoff` in lib/circuit.js. */
    await new Promise((resolve) => setTimeout(resolve, backoff(row.tries ?? 1, { base: 50, ceiling: 2000 })));
  }

  return { attempted: rows?.length ?? 0, delivered };
}

async function markDone(id, why) {
  try {
    const { sql } = await import("./sql.js");
    await sql`
      UPDATE dumpsite_outbox
         SET delivered_at = now(), why = COALESCE(${why}, why)
       WHERE id = ${id}
    `;
  } catch {
    /* It landed at the hub either way, and the hub dedupes. The worst case is
       one extra "redelivered" on the next drain. */
  }
}

async function markTried(id, why) {
  try {
    const { sql } = await import("./sql.js");
    await sql`UPDATE dumpsite_outbox SET tries = tries + 1, why = ${why} WHERE id = ${id}`;
  } catch {
    /* Nothing to do. The row stays owed and the next drain finds it. */
  }
}

/**
 * Drain in the background, at most every so often, off the back of a request
 * that was going to happen anyway.
 *
 * ── WHY NOT A CRON, OR A WORKER ────────────────────────────────────────────
 * Because this deploys somewhere with no long-lived process to put one in. A
 * scheduled function would work and is one more thing to configure, one more
 * thing to forget, and one more thing that is not running on the morning
 * somebody needs it. Hanging it off ordinary traffic means it runs exactly
 * when the product is being used, which is exactly when returns are arriving.
 *
 * Deliberately not awaited, rate-limited in this process, and silent about
 * everything: nothing here may delay or fail the request it is riding on.
 */
let lastDrain = 0;
const DRAIN_EVERY_MS = 30_000;

export function drainSoon() {
  const now = Date.now();
  if (now - lastDrain < DRAIN_EVERY_MS) return;
  lastDrain = now;
  void drainOutbox().catch(() => {});
}
