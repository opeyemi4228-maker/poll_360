import { at } from "./when.js";
import { db } from "./db.js";
import { secondDatabaseReport } from "./second-database.js";
import { reader, readsHandwriting } from "./sheet-vision.js";
import { register } from "./site.js";

/**
 * What this deployment knows about itself.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE CONSOLE IS NOT A SECOND DASHBOARD, IT IS THE OTHER QUESTION
 *
 *  Every other screen in the product answers "what is the count?". Every
 *  screen fed from this file answers "what is the thing doing the counting?"
 *  — who holds a key to it, which bodies those keys were issued to, where
 *  each figure entered from, what it is wired to, what it has recorded about
 *  itself, and whether any of that is currently broken.
 *
 *  ── EVERY FIGURE HERE IS MEASURED ───────────────────────────────────────
 *  Nothing on these screens is asserted from a config file or a README. The
 *  integrations page does not say WhatsApp is connected because somebody
 *  wrote that down; it says so because four named variables are present and
 *  a message arrived at 19:41. The health page does not claim the database is
 *  up, it times a query and prints the milliseconds. A console that reports
 *  its own intentions rather than its own state is worse than no console: it
 *  is the thing somebody checks at 2am and is reassured by while the count is
 *  quietly failing.
 *
 *  ── AND NOTHING HERE PRINTS A SECRET ────────────────────────────────────
 *  Keys are reported as set or not set, never as a value, not even truncated.
 *  A console is the one screen somebody photographs to show a colleague what
 *  is wrong, and the whole product's threat model assumes that photograph
 *  ends up in a WhatsApp group. `presence()` below is the only way this file
 *  is allowed to look at an environment variable, and it returns a boolean.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** The only way this file reads the environment: does it exist, yes or no. */
function presence(name) {
  return Boolean(process.env[name] && String(process.env[name]).trim());
}

const asNumber = (value) => Number(value ?? 0);
const asDate = (value) => (value ? at(value) : null);

/* ═════════════════════════════════════════════════════════════ organisations
 *
 * ── WHY THERE IS NO ORGANISATIONS TABLE ────────────────────────────────────
 * Because there is no moment in this product where somebody creates one. A
 * body arrives by asking for access — a newsroom, a campaign, an observer
 * mission — and it arrives as a name typed into a form. Inventing a table
 * would mean inventing a screen to maintain it, and then two names for the
 * same newsroom: the one it typed and the one somebody tidied.
 *
 * So a body is what it has always been: everything ever asked for under one
 * name, plus the accounts that were actually issued against those requests.
 * That is the question an administrator is really asking — "who are these
 * people, what did they ask for, and what do they hold?" — and it is
 * answerable from the two tables that already exist.
 *
 * Names are folded case-insensitively, because "Channels TV" and "Channels
 * tv" are one newsroom and only a database thinks otherwise. The spelling
 * shown is the one used most recently, on the grounds that the newest is the
 * one they currently call themselves.
 */
export async function bodies(take = 80) {
  const rows = await db
    .prepare(
      `SELECT LOWER(TRIM(r.organisation))                                    AS key,
              MAX(r.organisation)                                            AS name,
              COUNT(*)::int                                                  AS requests,
              COUNT(*) FILTER (WHERE r.status = 'NEW')::int                  AS waiting,
              COUNT(*) FILTER (WHERE r.status = 'APPROVED')::int             AS approved,
              COUNT(*) FILTER (WHERE r.status = 'DECLINED')::int             AS declined,
              COUNT(DISTINCT r.issued_user_id)::int                          AS accounts,
              STRING_AGG(DISTINCT r.kind, ', ')                              AS kinds,
              MIN(r.created_at)                                              AS first_at,
              MAX(r.created_at)                                              AS last_at,
              SUM(COALESCE(r.units, 0))::int                                 AS booths
         FROM access_requests r
        WHERE r.organisation IS NOT NULL AND TRIM(r.organisation) <> ''
        GROUP BY LOWER(TRIM(r.organisation))
        ORDER BY waiting DESC, last_at DESC
        LIMIT ?`
    )
    .all(Math.min(Math.max(1, take), 200));

  /* The accounts each body actually holds, and what state they are in. Asked
     as one query over every body rather than one query per body: a table of
     forty newsrooms is forty round trips to a database that is no longer on
     this machine, and it is the same answer. */
  const held = await db
    .prepare(
      `SELECT LOWER(TRIM(r.organisation)) AS key,
              u.id, u.name, u.role, u.status, u.disabled_at, u.last_login_at
         FROM access_requests r
         JOIN users u ON u.id = r.issued_user_id
        ORDER BY u.created_at DESC`
    )
    .all();

  const accountsByBody = new Map();
  for (const row of held) {
    const list = accountsByBody.get(row.key) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      role: row.role,
      /* Disabled outranks the status word. An account row can say ACTIVE and
         still be shut off — that is exactly what `disabled_at` is for — and a
         console that reported the word alone would show a retired credential
         as live. */
      state: row.disabled_at ? "DISABLED" : (row.status ?? "ACTIVE"),
      lastLoginAt: asDate(row.last_login_at),
    });
    accountsByBody.set(row.key, list);
  }

  return rows.map((row) => ({
    key: row.key,
    name: row.name,
    requests: asNumber(row.requests),
    waiting: asNumber(row.waiting),
    approved: asNumber(row.approved),
    declined: asNumber(row.declined),
    /* What they asked to cover, summed across every request. Zero where
       nobody said, which is not the same as "no booths" and is drawn as a
       dash rather than a nought on the screen that shows it. */
    booths: asNumber(row.booths),
    kinds: row.kinds ? String(row.kinds).split(", ").filter(Boolean) : [],
    firstAt: asDate(row.first_at),
    lastAt: asDate(row.last_at),
    accounts: accountsByBody.get(row.key) ?? [],
  }));
}

/* ══════════════════════════════════════════════════════════════ data sources
 *
 * Where every figure in the count entered the building.
 *
 * ── WHY THIS SCREEN EXISTS AT ALL ──────────────────────────────────────────
 * Because "473 booths counted" is four different claims depending on how
 * those booths arrived, and the product's whole argument is that a total
 * without its provenance is not a number anybody should read out. A return
 * typed by the agent standing at the booth, a return read down the phone to a
 * desk, and a return uploaded in a spreadsheet before polling day are three
 * different kinds of evidence. They are all counted the same, and they should
 * never be *trusted* the same, so somebody has to be able to see the mix.
 */

/** What each `source` value on a return actually means, in words. */
export const SOURCE_LABEL = {
  APP: {
    name: "The agent's phone",
    what: "Typed and sent by the named coordinator standing at the booth.",
    trust: "strongest",
  },
  AGENT: {
    name: "Coordinator app",
    what: "Filed from a coordinator's own signed-in session, against their appointed booth.",
    trust: "strongest",
  },
  WHATSAPP: {
    name: "WhatsApp",
    what: "Sent as messages from a phone number tied to a real account by the desk.",
    trust: "strong",
  },
  UPLOAD: {
    name: "Entered by a desk",
    what: "Typed by somebody who was not at the booth — read down a phone, or loaded before the day.",
    trust: "weakest",
  },
};

/** What each sheet reader is, said in terms of what its readings are worth. */
export const READER_LABEL = {
  claude: "Handwriting reader",
  google: "Hosted optical reader",
  ocrspace: "Free optical reader",
  local: "Reader built into this server",
};

export async function dataSources(electionId) {
  if (!electionId) {
    return { returns: [], readers: [], declared: null, units: 0, register };
  }

  const [returns, readers, declaredRow, unitRow] = await Promise.all([
    db
      .prepare(
        `SELECT source,
                COUNT(*)::int                                       AS n,
                COUNT(*) FILTER (WHERE status = 'VERIFIED')::int     AS verified,
                COUNT(*) FILTER (WHERE status = 'DISPUTED')::int     AS disputed,
                MIN(submitted_at)                                    AS first_at,
                MAX(submitted_at)                                    AS last_at
           FROM results
          WHERE election_id = ?
          GROUP BY source
          ORDER BY n DESC`
      )
      .all(electionId),

    /* The readers, and how they are scoring. `accepted` is the only honest
       measure of a reader: not what it thought it saw, but how often a human
       looked at the proposal and let it stand. */
    db
      .prepare(
        `SELECT COALESCE(reader, 'local')                    AS reader,
                COUNT(*)::int                                AS n,
                COUNT(*) FILTER (WHERE accepted <> 0)::int    AS accepted,
                MAX(created_at)                              AS last_at
           FROM sheet_reads
          WHERE election_id = ?
          GROUP BY COALESCE(reader, 'local')
          ORDER BY n DESC`
      )
      .all(electionId),

    db
      .prepare(
        `SELECT COUNT(*)::int AS n,
                STRING_AGG(DISTINCT source, ', ') AS sources,
                MAX(created_at) AS last_at
           FROM declared
          WHERE election_id = ?`
      )
      .get(electionId),

    db
      .prepare("SELECT COUNT(*)::int AS n FROM polling_units WHERE election_id = ?")
      .get(electionId),
  ]);

  return {
    returns: returns.map((row) => ({
      source: row.source,
      ...(SOURCE_LABEL[row.source] ?? {
        name: row.source,
        what: "Filed with a source this build does not have a name for.",
        trust: "unknown",
      }),
      count: asNumber(row.n),
      verified: asNumber(row.verified),
      disputed: asNumber(row.disputed),
      firstAt: asDate(row.first_at),
      lastAt: asDate(row.last_at),
    })),

    readers: readers.map((row) => ({
      reader: row.reader,
      name: READER_LABEL[row.reader] ?? row.reader,
      count: asNumber(row.n),
      accepted: asNumber(row.accepted),
      lastAt: asDate(row.last_at),
    })),

    declared: {
      count: asNumber(declaredRow?.n),
      sources: declaredRow?.sources ? String(declaredRow.sources).split(", ") : [],
      lastAt: asDate(declaredRow?.last_at),
    },

    /* The booths this project knows about, against the national register the
       whole product is sized to. The denominator is the point: a project
       carrying 4,000 units is not covering Nigeria, whatever its dial says. */
    units: asNumber(unitRow?.n),
    register,
  };
}

/* ═════════════════════════════════════════════════════════════ integrations
 *
 * What this deployment is wired to, and whether the wire is live.
 *
 * ── A KEY BEING SET IS NOT THE SAME AS A THING WORKING ─────────────────────
 * Every entry below carries two independent facts: whether it is configured,
 * which is read from the environment, and when it last actually did
 * something, which is read from the database. They disagree more often than
 * anybody expects — a WhatsApp token expires after twenty-four hours and
 * nothing about the configuration changes when it does. "Configured, and
 * nothing has arrived since Tuesday" is the sentence this screen exists to be
 * able to say.
 */
const INTEGRATIONS = [
  {
    id: "database",
    name: "The database",
    what: "Every return, message, payment and audit line is kept here.",
    keys: ["DATABASE_URL"],
    essential: true,
    missing: "Nothing works at all. The product cannot read or write a single row.",
  },
  {
    id: "sealing",
    name: "Encryption at rest",
    what: "Seals phone numbers, incident narratives and message bodies, so a stolen copy of the database is not a targeting list.",
    keys: ["ENCRYPTION_KEY"],
    essential: true,
    missing:
      "The product falls back to a key printed in its own source. Sealed fields are then not secret from anybody who has the code.",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    what: "How agents in places with no app and no signal for it still file a result.",
    /* All four, or none. Three of four is the state worth shouting about:
       it looks configured and it cannot deliver. */
    keys: [
      "WHATSAPP_VERIFY_TOKEN",
      "WHATSAPP_APP_SECRET",
      "WHATSAPP_TOKEN",
      "WHATSAPP_PHONE_ID",
    ],
    missing:
      "The channel still runs end to end and replies are held on the desk instead of being sent. Nothing leaves the building.",
  },
  {
    id: "claude",
    name: "Handwriting reader",
    what: "Reads the figures off a photographed result sheet. The only reader here that can read handwriting, which is what every figure on a Form EC8A is.",
    keys: ["ANTHROPIC_API_KEY"],
    missing: "Photographs are still kept with every return, and the figures are typed by hand.",
  },
  {
    id: "ask",
    name: "Ask Poll360's reader",
    what: "Understands a question asked any way at all and writes the answer in Poll360's voice. Every figure it writes is checked against the record before anybody reads it.",
    keys: ["ANTHROPIC_API_KEY"],
    missing:
      "Ask Poll360 still answers, from the same record, with its own plain-English reader. It understands the common questions — reach, wins, targets, swings, scenarios, party strength — and fewer ways of asking them.",
  },
  {
    id: "google",
    name: "Hosted optical reader",
    what: "The fallback reader, used when there is no handwriting key.",
    keys: ["GOOGLE_VISION_API_KEY"],
    missing: "Not in use.",
  },
  {
    id: "ocrspace",
    name: "Free optical reader",
    what: "The reader that can be switched on against an email address alone, with no card and no cloud account.",
    keys: ["OCRSPACE_API_KEY"],
    missing: "Not in use.",
  },
  {
    id: "site",
    name: "Public address",
    what: "Every shared link, the sitemap and the WhatsApp callback are built from it.",
    keys: ["NEXT_PUBLIC_SITE_URL"],
    missing: "Shared links point at the wrong host, which nobody notices until somebody clicks one.",
  },
];

/**
 * Every integration, with its configuration and its last sign of life.
 *
 * The live evidence is one query, not one per integration, and it is allowed
 * to fail: an integrations page that will not render because the database is
 * down is the page you most needed on the day the database went down.
 */
export async function integrations() {
  let signs = {};
  try {
    const row = await db
      .prepare(
        /* 'IN' and 'OUT', in capitals — see lib/whatsapp-bot.js, which is
           what writes these rows. Spelled in lower case this query is
           perfectly valid, returns nothing, and reports a working channel as
           one that has never carried a message. That is the exact failure the
           note at the top of this file warns about, and it was written here
           before being caught by running it. */
        `SELECT (SELECT MAX(created_at) FROM wa_messages WHERE direction = 'IN')  AS wa_in,
                (SELECT MAX(created_at) FROM wa_messages WHERE direction = 'OUT') AS wa_out,
                (SELECT COUNT(*)::int FROM wa_contacts)                           AS wa_contacts,
                (SELECT MAX(created_at) FROM sheet_reads WHERE reader = 'claude') AS claude_at,
                (SELECT MAX(created_at) FROM sheet_reads WHERE reader = 'google') AS google_at,
                (SELECT MAX(created_at) FROM sheet_reads WHERE reader = 'ocrspace') AS ocrspace_at,
                (SELECT MAX(created_at) FROM audit)                               AS audit_at`
      )
      .get();
    signs = row ?? {};
  } catch {
    /* Reported below as "could not be checked", never as "never used". A
       console that turns an unreachable database into a confident negative is
       a console that lies in exactly the moment it matters. */
    signs = null;
  }

  const evidence = signs === null
    ? null
    : {
        database: { at: asDate(signs.audit_at), what: "last line written to the audit trail" },
        whatsapp: {
          at: asDate(signs.wa_in),
          what: `last message received${signs.wa_contacts ? ` · ${asNumber(signs.wa_contacts)} numbers known` : ""}`,
        },
        claude: { at: asDate(signs.claude_at), what: "last sheet read" },
        google: { at: asDate(signs.google_at), what: "last sheet read" },
        ocrspace: { at: asDate(signs.ocrspace_at), what: "last sheet read" },
      };

  return INTEGRATIONS.map((entry) => {
    const keys = entry.keys.map((name) => ({ name, set: presence(name) }));
    const set = keys.filter((key) => key.set).length;

    return {
      ...entry,
      keys,
      /* Three states, and the middle one is the whole reason this is not a
         boolean: half-configured looks configured from every other screen in
         the product and cannot deliver a single message. */
      state: set === 0 ? "off" : set === keys.length ? "on" : "partial",
      lastSeen: evidence ? (evidence[entry.id] ?? null) : null,
      checked: evidence !== null,
    };
  });
}

/**
 * Which sheet reader is actually doing the work, and whether it can read
 * handwriting. Read from the same functions the reader itself consults, so
 * this screen cannot disagree with what happens to the next photograph.
 */
export function sheetReading() {
  const which = reader();
  return {
    reader: which,
    name: which ? (READER_LABEL[which] ?? which) : null,
    handwriting: readsHandwriting(),
    off: which === null,
    overridden: presence("SHEET_READER"),
  };
}

/* ════════════════════════════════════════════════════════════════════ health
 *
 * ── WHY LATENCY IS TIMED HERE AND NOT INFERRED ─────────────────────────────
 * The database is across a network now, and the failure everybody meets on
 * election night is not "down", it is "slow enough that a page times out and
 * an agent files the same result three times". A dot that says UP tells
 * nobody that. A number in milliseconds, measured on this request, does.
 */
export async function health() {
  const started = Date.now();
  let reachable = true;
  let latency = null;
  let complaint = null;

  try {
    await db.prepare("SELECT 1 AS ok").get();
    latency = Date.now() - started;
  } catch (error) {
    reachable = false;
    complaint = error?.message ?? "The database did not answer.";
  }

  let counts = null;
  let freshness = [];

  if (reachable) {
    try {
      const row = await db
        .prepare(
          `SELECT (SELECT COUNT(*)::int FROM users)                                  AS users,
                  (SELECT COUNT(*)::int FROM sessions WHERE expires_at > now())      AS live_sessions,
                  (SELECT COUNT(*)::int FROM elections)                              AS elections,
                  (SELECT COUNT(*)::int FROM results)                                AS results,
                  (SELECT COUNT(*)::int FROM incidents)                              AS incidents,
                  (SELECT COUNT(*)::int FROM coordinators)                           AS coordinators,
                  (SELECT COUNT(*)::int FROM wa_messages)                            AS messages,
                  (SELECT COUNT(*)::int FROM media)                                  AS media,
                  (SELECT COUNT(*)::int FROM audit)                                  AS audit,
                  /* COALESCE on the column, not on the bytes: a photograph
                     whose bytes were moved to the second database still
                     weighs what it weighed, and this figure is the one the
                     screen calls the deciding number. See lib/db.js. */
                  (SELECT COALESCE(SUM(COALESCE(size, OCTET_LENGTH(bytes))), 0) FROM media)
                                                                                    AS media_bytes,
                  (SELECT MAX(submitted_at) FROM results)                            AS last_result,
                  (SELECT MAX(created_at) FROM incidents)                            AS last_incident,
                  (SELECT MAX(created_at) FROM wa_messages)                          AS last_message,
                  (SELECT MAX(created_at) FROM audit)                                AS last_audit,
                  (SELECT MAX(last_login_at) FROM users)                             AS last_login`
        )
        .get();

      counts = {
        users: asNumber(row.users),
        liveSessions: asNumber(row.live_sessions),
        elections: asNumber(row.elections),
        results: asNumber(row.results),
        incidents: asNumber(row.incidents),
        coordinators: asNumber(row.coordinators),
        messages: asNumber(row.messages),
        media: asNumber(row.media),
        audit: asNumber(row.audit),
        /* Photographs are the only thing here that grows without bound, and
           they are held as bytes in the database rather than in object
           storage. That is a deliberate trade documented in STRUCTURE.md, and
           it is the number that decides when it has to stop being one. */
        mediaBytes: asNumber(row.media_bytes),
      };

      freshness = [
        { label: "A result was filed", at: asDate(row.last_result) },
        { label: "An incident was raised", at: asDate(row.last_incident) },
        { label: "A message arrived or left", at: asDate(row.last_message) },
        { label: "Somebody signed in", at: asDate(row.last_login) },
        { label: "A line was written to the audit trail", at: asDate(row.last_audit) },
      ];
    } catch (error) {
      complaint = error?.message ?? "The database answered, and then refused a query.";
    }
  }

  /* ── AND THE SECOND DATABASE, IF THERE IS ONE ────────────────────────
     Its own call, on purpose. It is a different database at a different
     address, and folding it into the query above would mean one of them
     being slow made the other look broken. Unconfigured, this is a single
     field saying so and costs not one round trip. See lib/second-database.js. */
  const secondDatabase = await secondDatabaseReport();

  return { reachable, latency, complaint, counts, freshness, secondDatabase };
}

/* ══════════════════════════════════════════════════════════════ the API edge
 *
 * The table of addresses lives in lib/endpoints.js, which touches nothing —
 * no database, no driver, no connection string. That is not tidiness: the
 * test that keeps the table honest walks `app/api` off disk and must run on a
 * machine with no database at all, which is the whole reason this product's
 * tests need nothing installed and nothing configured. What stays here is the
 * part that has to ask the database a question.
 */

/**
 * What has actually come through the webhook, and what could not go back out.
 *
 * ── THE QUEUED COUNT IS THE ONE THAT MATTERS ───────────────────────────────
 * A reply this product could not send is recorded as QUEUED and shown on the
 * desk rather than thrown away, which is what makes the channel demonstrable
 * without a Meta account at all. It is also, on a real deployment, the exact
 * symptom of an expired token: messages keep arriving, replies keep being
 * written, and not one of them leaves the building. Nothing else on any
 * screen goes red when that happens.
 */
export async function webhookTraffic() {
  try {
    const row = await db
      .prepare(
        `SELECT COUNT(*) FILTER (WHERE direction = 'IN')::int                       AS inbound,
                COUNT(*) FILTER (WHERE direction = 'OUT')::int                      AS outbound,
                COUNT(*) FILTER (WHERE direction = 'OUT' AND status = 'QUEUED')::int AS queued,
                COUNT(*) FILTER (WHERE direction = 'IN'
                                   AND created_at > now() - INTERVAL '24 hours')::int AS inbound_day,
                MAX(created_at) FILTER (WHERE direction = 'IN')                     AS last_in
           FROM wa_messages`
      )
      .get();

    return {
      checked: true,
      inbound: asNumber(row?.inbound),
      outbound: asNumber(row?.outbound),
      queued: asNumber(row?.queued),
      inboundDay: asNumber(row?.inbound_day),
      lastIn: asDate(row?.last_in),
    };
  } catch {
    return { checked: false, inbound: 0, outbound: 0, queued: 0, inboundDay: 0, lastIn: null };
  }
}

/* ══════════════════════════════════════════════════════════════════ settings
 *
 * The configuration this deployment is actually running on, as opposed to the
 * configuration somebody believes it is running on. Names and states only —
 * see the note at the top of this file about photographs.
 */
export function configuration() {
  const named = INTEGRATIONS.flatMap((entry) =>
    entry.keys.map((name) => ({ name, set: presence(name), essential: Boolean(entry.essential), why: entry.name }))
  );

  return {
    environment: process.env.NODE_ENV ?? "development",
    runtime: typeof process !== "undefined" ? process.version : null,
    /* Whether this deployment is allowed to change its own schema on the
       first query after a deploy. Off in production, and the one setting here
       whose wrong value is silent and expensive — see lib/db.js. */
    autoMigrate:
      process.env.NODE_ENV !== "production" || process.env.POLL360_AUTO_MIGRATE === "1",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    sheetReader: sheetReading(),
    keys: named,
    register,
  };
}
