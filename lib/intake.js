import { sql } from "./sql.js";

/**
 * What comes back from DumpSite.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE OTHER HALF OF lib/dumpsite.js
 *
 *  That file is the door out: every return, sheet, registration and report
 *  this product receives is also delivered to the hub. This is the door back
 *  in — the figures, sheets and situation reports that reached DumpSite from
 *  somewhere *other* than Poll360, and the one thing only the hub can answer:
 *  which booths it has heard from at all, through which channel.
 *
 *  That last question is the reason this file exists. Poll360 knows which
 *  booths have filed *to Poll360*. It cannot know that a booth sent a
 *  photograph over WhatsApp that is sitting unclassified, or that a report
 *  came in from a unit whose figures never arrived. Silence is where rigging
 *  hides, and half the silence is invisible from inside this product.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── READ THROUGH VIEWS, NEVER TABLES ───────────────────────────────────────
 * DumpSite owns the `dumpsite` schema and publishes `intake`. Everything below
 * reads `intake.v_*` and nothing else. That is not politeness about someone
 * else's tables: the views are a minimisation boundary. They carry figures,
 * gradings, unit codes, hashes and the channel — never a sealed body, never a
 * narrative, never a name, never a NIN. Reading the tables directly would
 * pull identity into a product that has no grant to hold it, and would couple
 * these screens to a schema whose owner is entitled to change it.
 *
 * ── AND THE CHANNEL TRAVELS WITH EVERY FIGURE ──────────────────────────────
 * A figure that arrived over WhatsApp cannot score above 62: Meta strips EXIF,
 * delivers a location as a bare pin with no accuracy radius, and offers no
 * device attestation. One from a signed-in browser or a keyed API call can
 * reach 100. Every row below carries `channel` for that reason, and no screen
 * may weigh the two alike.
 *
 * ── IT NEVER THROWS, FOR THE SAME REASON THE OUTBOUND DOOR NEVER THROWS ────
 * The hub's schema may not exist yet. It has not been migrated in this
 * deployment, and until it is, every view below is a relation that is not
 * there. A situation room that goes blank because a *second* system has not
 * been set up is worse than one that says so — so a missing schema is a
 * reported state, not an exception, and every reader returns an empty result
 * with `available: false` beside it. The screens print that in words.
 */

/* ── WHETHER THE HUB HAS PUBLISHED ANYTHING TO READ ────────────────────────
   Cached for the life of the process. This is a question about whether a
   migration has been run, which does not change between two requests, and
   asking the catalogue on every render of every dashboard would put a query
   in front of every panel to answer "yes" four hundred times a minute.

   Null means "not asked yet" — deliberately distinct from false, so a failed
   probe is retried on the next request rather than remembered as absence for
   the life of the deployment. */
let present = null;

export async function available() {
  if (present !== null) return present;
  try {
    const [row] = await sql`
      SELECT count(*)::int AS n
        FROM information_schema.views
       WHERE table_schema = 'intake'
         AND table_name IN ('v_result_figures', 'v_result_sheet',
                            'v_situation_report', 'v_coverage_pulse')
    `;
    /* All four, not any: a half-migrated schema is a state every reader below
       would half-work in, which is the hardest kind of fault to see. */
    present = row?.n === 4;
  } catch {
    /* The database is unreachable, or the role cannot read the catalogue.
       Left as null so the next request asks again. */
    return false;
  }
  return present;
}

/** An answer shaped the same whether the hub is there or not. */
const nothing = (extra = {}) => ({ available: false, rows: [], ...extra });

/**
 * Figures the hub holds, for the booths this room is watching.
 *
 * `codes` scopes the read to the polling units the room may see. Passing none
 * returns nothing rather than everything: this is called from screens that are
 * already narrowed to a territory, and a reader that answered an empty scope
 * with the whole federation would quietly widen every narrowed room.
 */
export async function figuresFor(codes = [], { race = null, limit = 2000 } = {}) {
  if (!codes.length) return nothing();
  if (!(await available())) return nothing();

  /* ── THE OPTIONAL FILTER IS A PARAMETER, NOT A FRAGMENT ─────────────────
     The obvious shape — interpolating a nested sql fragment when a race is
     given — does not work here. This is Neon's tagged template, and an
     interpolated value is always bound as a *parameter*: a nested tag would be
     bound as an object rather than spliced as text, and the query would fail
     at the driver rather than at review.

     "$1 IS NULL OR column = $1" is the standard way to say "filter only if
     asked". It keeps one parameter list and cannot be injected into. The cast
     is needed because Postgres cannot infer a type for a parameter whose only
     use is an IS NULL test.

     Written here rather than beside the clause because the clause lives inside
     a template literal, and a comment there containing a backtick ends the
     string — which is exactly how this comment broke the file once already. */
  try {
    const rows = await sql`
      SELECT polling_unit_code, race, registered_voters, accredited_voters,
             rejected_ballots, valid_votes, votes, channel, source,
             findings, balances, impossible, recorded_at, received_at,
             content_hash, sheet_id
        FROM intake.v_result_figures
       WHERE polling_unit_code = ANY(${codes})
         AND (${race}::text IS NULL OR race = ${race})
       ORDER BY received_at DESC
       LIMIT ${limit}
    `;
    return { available: true, rows };
  } catch {
    return nothing();
  }
}

/**
 * Which booths the hub has heard from, and how.
 *
 * ── THE READING THIS PRODUCT CANNOT PRODUCE FOR ITSELF ─────────────────────
 * Poll360's coverage screens answer "which booths have filed a return here".
 * This answers "which booths have been heard from at all" — including the ones
 * that sent a photograph nobody has classified yet, and the ones that filed a
 * situation report and no figures.
 *
 * The difference between the two lists is the useful thing: a booth in this
 * one and not in Poll360's has sent something that has not become a return,
 * which is a booth to ring rather than a booth to wait for.
 */
export async function coverageFor(codes = []) {
  if (!codes.length) return nothing({ heard: new Map() });
  if (!(await available())) return nothing({ heard: new Map() });

  try {
    const rows = await sql`
      SELECT polling_unit_code, last_seen, inputs,
             channel_a_inputs, channel_b_inputs, figures, sheets, situations
        FROM intake.v_coverage_pulse
       WHERE polling_unit_code = ANY(${codes})
    `;
    return {
      available: true,
      rows,
      /* Keyed, because every caller joins this against its own unit list. */
      heard: new Map(rows.map((row) => [row.polling_unit_code, row])),
    };
  } catch {
    return nothing({ heard: new Map() });
  }
}

/**
 * Situation reports the hub holds.
 *
 * No narrative — the view does not carry one and must not. What crosses is
 * that a report of this category and severity exists for this booth, at this
 * time, over this channel. A room that needs the words asks the product that
 * owns them, under an access log.
 */
export async function situationsFor(codes = [], { limit = 200 } = {}) {
  if (!codes.length) return nothing();
  if (!(await available())) return nothing();

  try {
    const rows = await sql`
      SELECT polling_unit_code, category, severity, occurred_at, recorded_at,
             media_count, channel, source, received_at, narrative_hash
        FROM intake.v_situation_report
       WHERE polling_unit_code = ANY(${codes})
       ORDER BY received_at DESC
       LIMIT ${limit}
    `;
    return { available: true, rows };
  } catch {
    return nothing();
  }
}

/**
 * Result sheets the hub is holding, by booth.
 *
 * `object_ref` names where the image lives; the bytes are not pulled across.
 * A room that wants to look at a sheet opens it through DumpSite, which writes
 * an access-log line naming who opened it and why — and that line is the
 * point. A copy fetched into this product would be a copy nobody logged.
 */
export async function sheetsFor(codes = [], { race = null, limit = 500 } = {}) {
  if (!codes.length) return nothing();
  if (!(await available())) return nothing();

  try {
    const rows = await sql`
      SELECT polling_unit_code, race, form_type, image_hash, object_ref,
             read_state, recorded_at, channel, source, received_at
        FROM intake.v_result_sheet
       WHERE polling_unit_code = ANY(${codes})
         AND (${race}::text IS NULL OR race = ${race})
       ORDER BY received_at DESC
       LIMIT ${limit}
    `;
    return { available: true, rows };
  } catch {
    return nothing();
  }
}

/**
 * What the hub is holding that this product has not turned into a return.
 *
 * ── THE ONE FIGURE THIS FILE EXISTS FOR ────────────────────────────────────
 * Given the booths a room is watching and the ones it has returns for, this
 * names the booths DumpSite has heard from and Poll360 has not. Each is
 * something that arrived, was sealed and chained, and never became a count —
 * an unread photograph, a report with no figures behind it, a WhatsApp
 * conversation that stalled at the third question.
 *
 * They are not errors and they are not losses. They are the work queue, and
 * without this join they are invisible from inside the situation room.
 */
export async function unclaimed({ watching = [], filed = [] } = {}) {
  const coverage = await coverageFor(watching);
  if (!coverage.available) return nothing({ heard: 0 });

  const has = new Set(filed);
  const rows = coverage.rows
    .filter((row) => !has.has(row.polling_unit_code))
    .sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));

  return { available: true, rows, heard: coverage.rows.length };
}

/**
 * Forget what was learned about the schema.
 *
 * For the migration script and for tests. Nothing on a request path should
 * call this: the whole point of the cache is that a deployment does not ask
 * the catalogue four hundred times a minute.
 */
export function forget() {
  present = null;
}
