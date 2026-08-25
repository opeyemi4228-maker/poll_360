/* The ballot, not the presidential four: a party with a box on the form is
   a party whose figure must be compared against what the agent typed. */
import { countedParties } from "./races.js";

const parties = countedParties();

/**
 * Does what the agent typed match the sheet they photographed?
 *
 * ── THE FAILURE THIS EXISTS TO STOP ────────────────────────────────────────
 * Until now the two halves of a filing never met. lib/sheet-vision.js read the
 * photograph and checked it against *itself* — do these figures add up — and
 * the bot then filed whatever the agent had typed, having said "Sheet
 * received" without ever comparing the two. An agent could photograph a sheet
 * showing 90 for a party and type 190, and every check in the system passed:
 * the typed figures were arithmetically sound, the sheet was arithmetically
 * sound, and nothing anywhere asked whether they were the same figures.
 *
 * The picture and the numbers are the two halves of one claim. If they
 * disagree, the claim is not filed.
 *
 * ── WHY A DISAGREEMENT BLOCKS, AND EXACTLY WHEN IT DOES NOT ────────────────
 * The block is deliberate and it is hard: an agent who is told "these do not
 * match" re-enters the figures until they do, and no override files a return
 * the photograph contradicts.
 *
 * That is only defensible because of what counts as a disagreement. A reader
 * squinting at a creased form under a torch is wrong often enough that
 * blocking on its every objection would stop honest agents filing at all, and
 * a count nobody can file into is worse than no check. So a reading gets to
 * block a filing only when it has earned the standing to:
 *
 *   · it read the sheet at all — no reader configured, an image that would not
 *     download, a photograph of a wall: these produce no comparison, and no
 *     comparison is not a mismatch. The filing proceeds and is marked as
 *     having no corroborated sheet.
 *   · it is self-consistent — `usable` in sheet-vision.js means it found the
 *     figures it needs, read every party, and the arithmetic on the page holds
 *     together. A reading that contradicts itself has no business
 *     contradicting anybody else.
 *   · the field in question was actually read. A party the reader could not
 *     make out is in `missing`, and a figure nobody read is never evidence of
 *     anything. It is compared to nothing rather than compared to zero.
 *
 * What survives all three is a confident, arithmetically coherent reading of a
 * specific figure that differs from what a person typed. That is worth
 * stopping for, and it is the only thing here that does.
 * ───────────────────────────────────────────────────────────────────────────
 */

/** Nothing to compare, and why, in words the agent can be shown. */
const noComparison = (reason) => ({
  comparable: false,
  agrees: false,
  mismatches: [],
  checked: [],
  reason,
});

/**
 * Compare a reading against typed figures.
 *
 * `parsed` is whatever parseSheet returned, or null. `typed` carries
 * `accredited`, `rejected`, optionally `registered`, and `votes` — either
 * keyed by party or as an array in ballot order, because the bot builds one
 * and the web form builds the other.
 */
export function matchSheet(parsed, typed) {
  if (!parsed) return noComparison("no reading");

  /* The reading must hold together before it may contradict anybody. */
  if (!parsed.usable) {
    return noComparison(parsed.problems?.[0] ?? "the reading did not hold together");
  }

  const typedVotes = asVotes(typed?.votes);
  const readVotes = asVotes(parsed.votes);
  /* A party the reader did not produce a figure for. parseSheet stores 0 for
     these so the array keeps its shape, which makes these two lists the only
     way to tell an unread figure from a genuine nil.

     `absent` is in here as well as `missing`: a party with no row on the
     paper has not been read either, and comparing the agent's figure against
     the 0 standing in for it would manufacture a disagreement out of nothing
     — which is the whole failure this module was written to stop. */
  const unread = new Set([...(parsed.missing ?? []), ...(parsed.absent ?? [])]);

  const checked = [];
  const mismatches = [];

  const compare = (field, label, read, entered) => {
    if (read === null || read === undefined) return;
    if (entered === null || entered === undefined || Number.isNaN(entered)) return;
    checked.push(field);
    if (read !== entered) mismatches.push({ field, label, read, typed: entered });
  };

  compare("accredited", "Accredited voters", parsed.accredited, typed?.accredited);
  compare("registered", "Registered voters", parsed.registered, typed?.registered);
  compare("rejected", "Rejected ballots", parsed.rejected, typed?.rejected);

  for (const party of parties) {
    if (unread.has(party.id)) continue;
    compare(party.id, party.id, readVotes[party.id] ?? null, typedVotes[party.id] ?? null);
  }

  /* A reading that overlapped nothing the agent typed has told us nothing.
     It must not be recorded as agreement. */
  if (!checked.length) return noComparison("the reading and the figures had no field in common");

  return {
    comparable: true,
    agrees: mismatches.length === 0,
    mismatches,
    checked,
    reason: null,
  };
}

/**
 * What the agent is told, in the words they should hear.
 *
 * ── PLAIN, SPECIFIC, AND NOT AN ACCUSATION ─────────────────────────────────
 * "Validation failure: field mismatch" is not something to send to somebody
 * standing in a schoolyard at nine at night. The message names the figure, says
 * what the picture shows and what they typed, and asks for that figure again.
 * It never suggests they did it on purpose: the overwhelmingly likeliest
 * reading is a fat thumb on a phone keypad, which is precisely the thing this
 * check is for.
 */
export function mismatchMessage(match, { channel = "whatsapp" } = {}) {
  if (!match.mismatches.length) return "";

  const lines = match.mismatches.map(
    (item) => `· ${item.label}: the sheet shows ${fmt(item.read)}, you sent ${fmt(item.typed)}`
  );

  const opening =
    match.mismatches.length === 1
      ? "One figure does not match the sheet you photographed:"
      : `${match.mismatches.length} figures do not match the sheet you photographed:`;

  const closing =
    channel === "whatsapp"
      ? "Please check the sheet and send the figures again. If the picture is of a different unit's sheet, send CANCEL and start again."
      : "Check the sheet and correct the figures. If you photographed a different unit's sheet, choose the right picture and try again.";

  return `${opening}\n${lines.join("\n")}\n\n${closing}`;
}

/**
 * The record kept beside the return.
 *
 * Stored whether it matched or not, because "the picture and the figures were
 * compared and agreed" is itself worth being able to prove later, and a return
 * with no corroborated sheet needs to be distinguishable from one that has
 * one rather than silently looking the same.
 */
export function matchRecord(match) {
  return {
    compared: match.comparable,
    agrees: match.agrees,
    checked: match.checked,
    mismatched: match.mismatches.map((item) => item.field),
    reason: match.reason,
  };
}

/** Party figures keyed by id, from either shape the product stores them in. */
function asVotes(votes) {
  if (!votes) return {};
  if (Array.isArray(votes)) {
    const map = {};
    parties.forEach((party, index) => {
      if (votes[index] !== undefined && votes[index] !== null) map[party.id] = votes[index];
    });
    return map;
  }
  return votes;
}

const fmt = (value) => new Intl.NumberFormat("en-NG").format(value ?? 0);
