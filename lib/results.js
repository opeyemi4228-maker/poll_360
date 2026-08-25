/**
 * The arithmetic of a ballot box.
 *
 * In its own module, imported by both the browser and the server, so there is
 * exactly one definition of a valid return. The copy that runs as the agent
 * types is a courtesy that catches a mistyped figure while the sheet is still
 * in their hand; the copy that runs in the action is the one that counts. They
 * cannot drift apart, because they are the same function.
 *
 * (It cannot live in the action file: a "use server" module may only export
 * async functions, and a validator that has to run synchronously on every
 * keystroke is not one.)
 */
export function validateReturn({ registered, accredited, rejected, votes }) {
  const errors = {};
  const cast = Object.values(votes).reduce((sum, count) => sum + count, 0);

  /* Checked first: a negative vote also makes the accreditation test pass by
     cancelling a real one. */
  const negative = [registered, accredited, rejected, ...Object.values(votes)].some((n) => n < 0);
  if (negative) errors.figures = "No figure can be negative.";

  if (accredited > registered) {
    errors.accredited = "More people cannot be accredited than are registered here.";
  }

  if (cast + rejected > accredited) {
    errors.votes = `${cast} votes and ${rejected} rejected is more than the ${accredited} accredited.`;
  }

  if (cast === 0) errors.votes = "A return of nothing is not a return.";

  return { errors, cast, ok: Object.keys(errors).length === 0 };
}

/**
 * Does Form EC8A add up against itself?
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SHEET IS A CLOSED SYSTEM, AND THAT IS THE POINT
 *
 *  The eight numbered boxes at the head of an EC8A are not eight independent
 *  facts. They are one fact — what happened to 974 pieces of paper — written
 *  down six different ways, and they have to agree:
 *
 *      #3 issued  −  #4 unused   =  #8 used
 *      #5 spoiled +  #6 rejected +  #7 valid  =  #8 used
 *      #7 valid   =  the party rows added up
 *      #6 rejected + #7 valid  =  #2 accredited
 *
 *  Every one of those is checkable from the paper alone, with no reference to
 *  anything this product knows. A sheet that fails one has a transcription
 *  error on its face, and the failure is almost never in the party rows — it
 *  is in a total somebody copied.
 *
 *  The first real sheet this product was shown fails two of them. Osun 2026,
 *  S/N 0000611: issued 974 less unused 417 is 557, and spoiled 1 plus
 *  rejected 1 plus valid 555 is 557, but box #8 says 556. The presiding
 *  officer wrote the accredited figure into #8 and lost the spoiled ballot.
 *
 * ── WHY THIS NEVER REFUSES A RETURN ───────────────────────────────────────
 *  Because the error is the sheet's and the agent's job is to transcribe it
 *  faithfully. A product that refuses a return whose sheet does not balance
 *  cannot be used on the sheets that most need reporting, and it teaches the
 *  agent to type figures that reconcile instead of figures that are written —
 *  which destroys the only evidence there was.
 *
 *  So this returns findings, never errors. They are stored with the return,
 *  shown to the desk, and travel with the figures to anybody reading them
 *  later. `validateReturn` above keeps its errors, which catch a mistyped
 *  figure while the sheet is still in the agent's hand; this catches a sheet
 *  that disagrees with itself, which is a different thing entirely and must
 *  reach a human rather than a validator.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** A figure that was actually captured. Null and NaN are absences, not zeros. */
const given = (value) => typeof value === "number" && Number.isFinite(value);

export function auditSheet(sheet = {}) {
  const {
    registered, accredited, rejected, spoiled,
    ballotsIssued, unusedBallots, usedBallots, statedValid, votes,
  } = sheet;

  const findings = [];
  /* Which boxes each failing identity touches. If every failure shares one
     box and no passing identity does, that box is the one that is wrong —
     see `culprit` below. */
  const touched = [];

  const cast = votes ? Object.values(votes).reduce((sum, n) => sum + (Number(n) || 0), 0) : null;

  const check = (boxes, left, right, says, why) => {
    if (!given(left) || !given(right)) return;
    if (left === right) return;
    findings.push({ boxes, says, why, off: left - right });
    touched.push(boxes);
  };

  check(
    ["#3", "#4", "#8"],
    given(ballotsIssued) && given(unusedBallots) ? ballotsIssued - unusedBallots : NaN,
    usedBallots,
    "Issued less unused does not equal the used total.",
    `${ballotsIssued} issued less ${unusedBallots} unused is ${ballotsIssued - unusedBallots}, but box #8 says ${usedBallots}.`
  );

  check(
    ["#5", "#6", "#7", "#8"],
    given(spoiled) && given(rejected) && given(statedValid) ? spoiled + rejected + statedValid : NaN,
    usedBallots,
    "Spoiled plus rejected plus valid does not equal the used total.",
    `${spoiled} spoiled, ${rejected} rejected and ${statedValid} valid is ${spoiled + rejected + statedValid}, but box #8 says ${usedBallots}.`
  );

  check(
    ["#7", "parties"],
    statedValid,
    cast,
    "The valid total does not equal the party rows added up.",
    `Box #7 says ${statedValid}, and the party rows add up to ${cast}.`
  );

  check(
    ["#2", "#6", "#7"],
    given(rejected) && given(statedValid) ? rejected + statedValid : NaN,
    accredited,
    "Rejected plus valid does not equal the accredited count.",
    `${rejected} rejected and ${statedValid} valid is ${rejected + statedValid}, but ${accredited} were accredited.`
  );

  /* Impossibilities rather than disagreements: no arrangement of the other
     boxes makes these right. Still findings, still never refusals — a sheet
     can say an impossible thing and the product's job is to report that it
     did, not to pretend the sheet said something else. */
  if (given(accredited) && given(registered) && accredited > registered) {
    findings.push({
      boxes: ["#1", "#2"],
      says: "More voters were accredited than are on the register.",
      why: `${accredited} accredited against a register of ${registered}.`,
      off: accredited - registered,
    });
  }

  if (given(usedBallots) && given(ballotsIssued) && usedBallots > ballotsIssued) {
    findings.push({
      boxes: ["#3", "#8"],
      says: "More ballot papers were used than were issued to the unit.",
      why: `${usedBallots} used against ${ballotsIssued} issued.`,
      off: usedBallots - ballotsIssued,
    });
  }

  return { findings, balances: findings.length === 0, culprit: culpritOf(touched) };
}

/**
 * The one box every failing identity has in common.
 *
 * Two identities failing by the same amount, both touching box #8 and nothing
 * else in common, is not two errors — it is one wrong number in #8, seen
 * twice. Naming it turns "this sheet does not add up" into "box #8 says 556
 * and everything else on the page says 557", which is a sentence a desk can
 * act on in the time it takes to read.
 *
 * Only claimed where the evidence is unambiguous: two or more failures, and
 * exactly one box shared by all of them.
 */
function culpritOf(touched) {
  if (touched.length < 2) return null;
  const shared = touched.reduce((a, b) => a.filter((box) => b.includes(box)));
  return shared.length === 1 ? shared[0] : null;
}

/** The boxes, in the words the form prints beside them. */
export const EC8A_BOXES = {
  "#1": "Voters on the register",
  "#2": "Accredited voters",
  "#3": "Ballot papers issued",
  "#4": "Unused ballot papers",
  "#5": "Spoiled ballot papers",
  "#6": "Rejected ballots",
  "#7": "Total valid votes",
  "#8": "Total used ballot papers",
  parties: "The party rows",
};
