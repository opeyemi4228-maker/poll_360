import { ballotFor } from "./races.js";
import { parseUnitCode } from "./units.js";

/**
 * Data Bank's figures, as returns this room may count.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A SECOND SOURCE FOR THE SAME COUNT, AND THE FOUR WAYS IT COULD LIE
 *
 *  Poll360 knows every return filed *to Poll360*. Data Bank also holds figures
 *  that reached it another way: an agent filing through a different product,
 *  a keyed API call, a WhatsApp conversation the hub classified. On a night
 *  when this database is unreachable for twenty minutes and the relay is not,
 *  the hub has returns this product never saw.
 *
 *  Adding them to the command board is worth doing and is the single most
 *  dangerous thing in this file, because a count is not a feed: a mistake here
 *  does not show a wrong row, it shows a wrong national total under a real
 *  candidate's photograph. Four things would each produce one, and each is
 *  refused below by name.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── ① THE SAME RETURN, COUNTED TWICE ───────────────────────────────────────
 * Every return filed here is *also* relayed to Data Bank — that is what
 * lib/databank.js is for. So the overlap between the two sources is not an
 * edge case, it is the normal state: almost every hub figure is a copy of one
 * this product already holds. Adding both would double every vote in the
 * country.
 *
 * So a hub figure is counted only for a booth this product has no return for.
 * Poll360's own row always wins where both exist — not because it is better
 * evidence (it is the same evidence) but because it is the one the rest of
 * this room is built from, and a board that disagreed with the booth card
 * beside it would be worse than either.
 *
 * ── ② A MACHINE'S GUESS, COUNTED AS A VOTE ─────────────────────────────────
 * This is the one that would be hardest to see afterwards. A photographed
 * sheet read by a model is *also* forwarded as RESULT_FIGURES — see the
 * `poll360:read:` send in app/agent/actions.js — because the hub pairs the
 * reading with the picture. It is a proposal, not a return. lib/sheet-vision.js
 * says it plainly: nothing that comes out of a reader reaches the count until
 * the agent standing in front of the sheet has confirmed it.
 *
 * `intake.v_result_figures` carries no column saying which is which. What it
 * does carry is the shape of the payload: a confirmed filing sends `votes`
 * keyed by party, a machine reading sends `figures` and `ballot` and no
 * `votes` at all. So a row with no votes object cannot be counted, and that is
 * not a tolerance for missing data — it is the discriminator. A reading has
 * nothing to contribute to a total and is dropped here rather than guessed at.
 *
 * ── ③ A FIGURE THE HUB ITSELF SAYS CANNOT BE TRUE ──────────────────────────
 * The view carries `impossible`, which is the hub's own arithmetic screening —
 * more votes than ballots, accredited beyond the register. lib/anomalies.js
 * holds the same line on our side. A return that breaks arithmetic is not
 * added to a total and then flagged; it is not added.
 *
 * ── ④ A RETURN FROM SOMEBODY ELSE'S ELECTION ───────────────────────────────
 * The hub holds every race and every night. A presidential total built from
 * rows that included a governorship return describes nothing at all, so the
 * race is filtered at the query and the booth code is re-read here rather than
 * trusted from a second column. See `race` in lib/races.js.
 *
 * ── AND THE CHANNEL TRAVELS WITH EVERY ROW ─────────────────────────────────
 * lib/intake.js carries `channel` because a figure that arrived over WhatsApp
 * cannot be weighed like one from a signed-in browser: Meta strips EXIF, gives
 * a bare pin and offers no attestation. Nothing here weighs them — a vote is a
 * vote — but the count of each is returned so the screen can print where its
 * figures came from, which is the whole of this product's argument about
 * coverage applied to its own sources.
 */

/** A row the hub sent that this product could turn into a countable return. */
function countable(row, ballot) {
  /* ② A reading, not a return. No votes object, nothing to count. */
  const votes = row?.votes;
  if (!votes || typeof votes !== "object" || Array.isArray(votes)) return null;

  /* A votes object with nothing in it for any party on this paper is a row
     that would add zero to every figure and one to the booth count — which is
     coverage this product did not earn. */
  const total = ballot.reduce((sum, party) => sum + toCount(votes[party.id]), 0);
  if (total <= 0) return null;

  /* ④ A booth code that names no state we know is counted in no state. The
     same rule lib/live-board.js applies to our own rows, for the same reason:
     a return attributed to somewhere plausible is how twenty-two states ended
     up shifted by one on the broadcast desk. */
  const place = parseUnitCode(row.polling_unit_code);
  if (!place?.stateCode) return null;

  return {
    unitCode: row.polling_unit_code,
    votes,
    registered: toCount(row.registered_voters),
    accredited: toCount(row.accredited_voters),
    /* The hub's receiving clock. It is one server's, which makes it the only
       timestamp in the chain that orders honestly across channels. */
    submittedAt: row.received_at ?? row.recorded_at ?? null,
    /* No position: the view does not carry one, and a booth drawn at a
       coordinate this product invented is worse than a booth with none. */
    position: null,
    /* Kept so a screen can say where the figure came from. Nothing weighs it. */
    channel: row.channel ?? null,
    fromHub: true,
  };
}

const toCount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Fold Data Bank's figures in beside this product's own returns.
 *
 * `ours` is whatever `results.counted` returned — the rows lib/live-board.js
 * is already building from. `hub` is `{ available, rows }` from
 * `figuresFor` in lib/intake.js.
 *
 * Returns the extra rows to add and a plain account of what was left out, so
 * the screen can state its own provenance rather than implying one.
 */
export function hubReturns({ ours = [], hub = null, race } = {}) {
  const empty = {
    available: Boolean(hub?.available),
    rows: [],
    added: 0,
    duplicate: 0,
    readings: 0,
    impossible: 0,
    byChannel: {},
  };

  if (!hub?.available || !hub.rows?.length) return empty;

  const ballot = ballotFor(race);
  if (!ballot?.length) return empty;

  /* ① Every booth this product already holds a return for. */
  const held = new Set(ours.map((row) => row.unitCode).filter(Boolean));

  const best = new Map();
  let duplicate = 0;
  let readings = 0;
  let impossible = 0;

  for (const row of hub.rows) {
    const code = row?.polling_unit_code;
    if (!code) continue;

    /* ① Ours wins. Counted as a duplicate rather than skipped silently: the
       number is the overlap between the two sources, which is the thing an
       operator actually wants to know when asking whether the relay is
       working. */
    if (held.has(code)) {
      duplicate += 1;
      continue;
    }

    /* ③ The hub's own screening. */
    if (row.impossible) {
      impossible += 1;
      continue;
    }

    const made = countable(row, ballot);
    if (!made) {
      readings += 1;
      continue;
    }

    /* One row per booth. Where the hub holds several for the same booth — a
       reading and a filing, or a correction — the newest wins, on the hub's
       own receiving clock. */
    const seen = best.get(code);
    if (!seen || new Date(made.submittedAt ?? 0) > new Date(seen.submittedAt ?? 0)) {
      best.set(code, made);
    }
  }

  const rows = [...best.values()];

  const byChannel = {};
  for (const row of rows) {
    const key = row.channel ?? "unknown";
    byChannel[key] = (byChannel[key] ?? 0) + 1;
  }

  return { available: true, rows, added: rows.length, duplicate, readings, impossible, byChannel };
}
