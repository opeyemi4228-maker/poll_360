import { partyById } from "./party-register.js";

/**
 * Whose room this is.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A SITUATION ROOM IS NOT NEUTRAL, AND PRETENDING OTHERWISE COSTS SOMETHING
 *
 *  The broadcast desk is neutral: it reports the count. A campaign's
 *  situation room is not, and should not be — it is staffed by people
 *  working for one candidate, and every question asked in it is asked on
 *  that candidate's behalf. "Are we winning" is a different question from
 *  "who is winning", and a room that can only answer the second makes its
 *  own staff do the subtraction in their heads at two in the morning.
 *
 *  So the room has a principal: the party whose room it is, and the person
 *  on the ballot. Naming it is what lets every other surface say "us" and
 *  "our" without ambiguity, and lets the spread test in lib/spread.js be
 *  computed for a nominated party rather than for whoever happens to lead.
 *
 *  ── WHY THIS IS CONFIGURATION AND NOT A CONSTANT IN A COMPONENT ─────────
 *  Two reasons, and the second is the serious one.
 *
 *  The dull reason: Poll360 is not a single-campaign product. A second
 *  campaign, a party primary, an observer mission running a parallel count
 *  for somebody else — each needs its own principal, and none of them should
 *  need a code change to get one.
 *
 *  The serious reason: who is standing for which party is a live political
 *  fact that changes, is disputed while it is changing, and is not this
 *  file's to assert. A candidate defects, a primary is annulled, a coalition
 *  names somebody else. Source code that hard-codes it becomes a product
 *  making a political claim of its own — and the claim goes stale silently,
 *  which is the worst way for it to be wrong. Configuration is a statement
 *  by the people running the room, which is what it should be.
 *
 *  ── AND NOTHING HERE IS A CLAIM ABOUT THE COUNT ─────────────────────────
 *  The principal decides whose figures are highlighted. It never decides
 *  what those figures are. No surface may weight, favour or round anything
 *  because a party is the principal — see the note at the head of
 *  lib/spread.js, which computes the same arithmetic for every party and
 *  merely reports one of them first.
 * ══════════════════════════════════════════════════════════════════════════
 */

/**
 * The default principal for this deployment.
 *
 * Overridden per deployment by the environment, and the ADC entry below is a
 * default rather than an assertion — see the note above. Changing it is one
 * variable, not a rebuild of the room.
 */
const FALLBACK = {
  party: "ADC",
  candidate: "Atiku Abubakar",
  /* ── WHO THE ROOM IS ACTUALLY RUNNING AGAINST ─────────────────────────
     The paper carries eighteen parties. A command dashboard that ranks all
     eighteen is a spreadsheet: fifteen of those rows are zero all night, and
     the three that decide the election are pushed down among them.

     So the dashboard names the contenders and sums the rest. This is a
     presentation choice and not an accounting one — every party keeps its own
     box on the filing form, its own column in an export and its own figure in
     the state table. Nothing is folded away from the count, only from one
     ranked list on one screen.

     The principal is always shown whatever it is polling, and does not need
     to be repeated here. */
  contenders: ["APC", "PDP"],
  /* What the room calls itself, where a party code would read oddly in a
     sentence: "the ADC situation room" rather than "the African Democratic
     Congress situation room". */
  room: "Situation room",
};

/**
 * Where a principal's photograph is looked for.
 *
 * ── A FIXED PATH, AND A MONOGRAM WHEN IT IS EMPTY ──────────────────────────
 * The product ships with no photographs of anybody, deliberately: a picture
 * of a real person is somebody's copyright and somebody's likeness, and
 * neither belongs in a repository by default. So the room looks for a file at
 * a predictable path and draws a monogram when there is not one.
 *
 * The monogram is not a placeholder to be embarrassed about. A room that
 * shows initials is complete; a room that shows a broken image is not, and
 * the difference is that this path is allowed to be empty forever.
 */
export function portraitFor(name) {
  return `/people/${slug(name)}.jpg`;
}

/** "Atiku Abubakar" -> "atiku-abubakar". */
export function slug(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    /* Strip accents rather than percent-encoding them: a filename somebody
       has to type into a terminal should be ASCII. */
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The initials a monogram draws.
 *
 * First and last, never the middle: "Atiku Abubakar" is AA, and a three-letter
 * monogram in a 48px circle is unreadable at the distance this is read from.
 * A single-word name gives one letter rather than an awkward doubling.
 */
export function initialsOf(name) {
  const words = String(name ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0].slice(0, 1) + words.at(-1).slice(0, 1)).toUpperCase();
}

/**
 * Who this room is for.
 *
 * `project` may carry its own principal — a deployment running two campaigns
 * needs that — and falls back to the deployment's, then to the default above.
 * The party is resolved through the register so its colour and full name come
 * from the one place that defines them, and a principal naming a party this
 * product has never heard of fails loudly here rather than drawing a grey bar
 * somewhere three screens away.
 */
export function principalOf(project = null) {
  const partyId =
    project?.principalParty ?? process.env.POLL360_PRINCIPAL_PARTY ?? FALLBACK.party;
  const candidate =
    project?.principalCandidate ?? process.env.POLL360_PRINCIPAL_CANDIDATE ?? FALLBACK.candidate;

  /* Comma-separated in the environment, because the people who change it are
     changing a deployment rather than editing code. */
  const contenders = (
    project?.contenders ??
    (process.env.POLL360_CONTENDERS
      ? process.env.POLL360_CONTENDERS.split(",")
      : FALLBACK.contenders)
  )
    .map((id) => String(id).trim().toUpperCase())
    .filter(Boolean);

  const party = partyById(partyId);
  if (!party) {
    throw new Error(
      `The principal is set to ${partyId}, which the party register does not name. ` +
        `Add it in lib/party-register.js or correct POLL360_PRINCIPAL_PARTY.`
    );
  }

  return {
    party: party.id,
    partyName: party.name,
    /* The fill, or the "other" grey. A principal without a colour still works
       everywhere — see the note in lib/party-register.js about why a party
       does not need one to be counted. */
    token: party.token ?? "var(--color-party-other)",
    pattern: party.pattern ?? null,
    candidate,
    /* The principal first, then the named opposition, with no duplicates —
       a deployment that lists its own party among the contenders should not
       get two rows for it. */
    headline: [party.id, ...contenders.filter((id) => id !== party.id)],
    initials: initialsOf(candidate),
    portrait: portraitFor(candidate),
    room: FALLBACK.room,
  };
}
