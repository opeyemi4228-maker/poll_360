/**
 * What a result sheet certifies, and who certified it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A SHEET IS EVIDENCE BECAUSE SOMEBODY SIGNED IT
 *
 *  The figures on Form EC8A are not what makes it evidence. What makes it
 *  evidence is that a named presiding officer signed and stamped it, at that
 *  booth, certifying those figures. A sheet with over-voting on it is one
 *  fact; a sheet with over-voting that nobody signed is a different and much
 *  louder one, and until now this product could read the first and not the
 *  second.
 *
 *  So the reader now returns three more observations — whether a signature is
 *  there, whether a stamp is there, whether the officer's name box was filled
 *  in — and this file is the only place allowed to reason about them.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS FILE WILL NOT DO, AND WHY THAT IS THE DESIGN
 *
 *  The obvious next step is the dangerous one: join the officer's name to the
 *  irregularities on their sheet and publish the list. Accountability is a
 *  real and good aim — an official should know that what happens at a booth
 *  can become a permanent public record — and this file exists to make that
 *  possible. It also refuses three things outright, because a sheet cannot
 *  support them:
 *
 *    IT NEVER INFERS INTENT.  A presiding officer may be a perpetrator. They
 *    may equally be a victim: coerced, threatened, or made to sign at
 *    gunpoint — a returning officer in Imo State has said exactly that of a
 *    senatorial declaration. From the paper alone there is no way to tell a
 *    forged figure from a forced one, and there never will be. Every finding
 *    here is therefore a statement about a *document*, never about a person's
 *    conduct, and the vocabulary is chosen so that a caller cannot casually
 *    print otherwise.
 *
 *    IT NEVER SCORES AN OFFICER.  No ranking, no history, no aggregate per
 *    name. A "worst presiding officers" table is one query away from this data
 *    and it would be a defamation engine: it reads as a finding of misconduct
 *    while resting entirely on paperwork that a coerced officer and a corrupt
 *    one produce identically. The absence of that function is deliberate;
 *    please do not add it.
 *
 *    IT NEVER PUBLISHES BY ITSELF.  `nameable()` is the gate, and it answers
 *    "is this record complete and serious enough that a human should decide",
 *    never "publish this". Nothing downstream may treat a true from it as
 *    permission.
 *
 *  ── AND THE THREE-STATE RULE IS THE WHOLE SAFEGUARD ──────────────────────
 *  "Absent" and "could not tell" are different claims. A cropped photograph,
 *  a shadowed corner, a thumb over the certification block — every one of
 *  those produces a picture in which no signature is visible, and not one of
 *  them is evidence that a sheet was unsigned. Collapsing the two into a
 *  boolean would turn every badly-taken photograph into an allegation against
 *  a named person, automatically and at scale. Nothing in this file lets that
 *  happen: `unclear` is carried end to end and never counted as `absent`.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** The three states a reader may report, and what each one is a fact about. */
export const OBSERVED = {
  PRESENT: "present",
  ABSENT: "absent",
  /* A fact about the photograph, never about the sheet or the officer. */
  UNCLEAR: "unclear",
};

/**
 * What the sheet says about its own certification.
 *
 * Returns observations, not judgements. Every field can be `unclear`, and a
 * caller that cannot handle that state is a caller that will eventually print
 * an allegation off a bad photograph.
 */
export function certification(reading = {}) {
  const held = reading.certification ?? {};

  const signature = state(held.signature);
  const stamp = state(held.stamp);
  /* ── A NAME IN HAND IS A NAME THAT WAS WRITTEN ────────────────────────
     `nameState` defaults to "illegible", which is right when nothing is known
     and wrong the moment a name has actually been read. The optical reader
     produces no certification block of its own — it cannot see a signature —
     so its readings arrived here with no state at all, defaulted to
     "illegible", and the screen said "could not be read from this photograph"
     over a sheet whose officer had just been read correctly off it.

     Where a name is present and no state contradicts it, the box was written
     in. That is the observation, not an assumption. */
  const named = String(reading.repName ?? reading.presidingOfficer ?? "").trim();
  const officerName =
    held.officerName === undefined && named ? "written" : nameState(held.officerName);
  const alteration = alterationState(held.alteration);

  return {
    /* As written. Not normalised, not title-cased, not matched against a roll:
       this is a transcription of somebody's handwriting and every tidy-up is a
       chance to attach a finding to the wrong person. */
    officer: named || null,
    officerName,
    signature,
    stamp,
    alteration,

    /* ── THE ONE DERIVED FIELD, AND IT IS DELIBERATELY CAUTIOUS ──────────
       True only where the sheet positively carries both marks. Anything less
       — including a photograph that could not show them — is not certified
       *as far as this photograph goes*, which is a different sentence from
       "was not certified" and the screens must use the longer one. */
    certified: signature === OBSERVED.PRESENT && stamp === OBSERVED.PRESENT,

    /* Whether this photograph can support any claim about the certification
       at all. False means: do not draw a conclusion, take another picture.

       Alteration is deliberately not in this test. It is a finding about the
       figures rather than about the certification, and a sheet whose signature
       and stamp are both plainly visible is legible for the purpose of judging
       the certification even where a crease makes one digit ambiguous. */
    legible: signature !== OBSERVED.UNCLEAR && stamp !== OBSERVED.UNCLEAR,
  };
}

/**
 * What is missing from a sheet's certification, stated as document findings.
 *
 * ── EVERY STRING HERE IS ABOUT THE PAPER ───────────────────────────────────
 * "This sheet carries no signature", never "the officer did not sign". The
 * first is what the photograph shows. The second is a claim about a person's
 * conduct that the photograph cannot support, and the difference is not
 * pedantry — it is the difference between a finding and an accusation.
 *
 * An `unclear` observation produces no finding at all. It produces a request
 * for a better photograph, which is what it actually warrants.
 */
export function omissions(reading = {}) {
  const seen = certification(reading);
  const found = [];

  if (seen.signature === OBSERVED.ABSENT) {
    found.push({
      rule: "unsigned",
      severity: "SERIOUS",
      says: "This sheet carries no presiding officer's signature.",
      why: "A result sheet is certified by a signature. Without one the figures on it are a transcription rather than a return.",
    });
  }

  if (seen.stamp === OBSERVED.ABSENT) {
    found.push({
      rule: "unstamped",
      severity: "SERIOUS",
      says: "This sheet carries no official stamp.",
      why: "The stamp is the polling unit's own mark on the certification.",
    });
  }

  if (seen.alteration === "altered") {
    found.push({
      rule: "altered",
      severity: "SERIOUS",
      says: "A figure on this sheet was written over or struck through.",
      why: "An alteration is not by itself wrong — a presiding officer correcting their own arithmetic is ordinary — but it is the one change to a return that cannot be checked against anything else on the page.",
    });
  }

  if (seen.officerName === "blank") {
    found.push({
      rule: "unnamed",
      severity: "SERIOUS",
      says: "The presiding officer's name box is empty on this sheet.",
      why: "A certification with nobody named on it identifies no one as answerable for the figures.",
    });
  }

  /* Not a finding. A job. Kept in its own list so a screen cannot render it
     beside the findings above and let a reader take it for one. */
  const retake = [];
  if (seen.signature === OBSERVED.UNCLEAR) {
    retake.push("the signature block could not be seen in this photograph");
  }
  if (seen.stamp === OBSERVED.UNCLEAR) {
    retake.push("the stamp could not be seen in this photograph");
  }
  if (seen.officerName === "illegible") {
    retake.push("the presiding officer's name could not be made out");
  }
  if (seen.alteration === OBSERVED.UNCLEAR) {
    retake.push("whether any figure was altered could not be judged from this photograph");
  }

  return { ...seen, findings: found, retake };
}

/**
 * Whether a record is complete enough to put a name in front of a person.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS IS A GATE, NOT A PERMISSION
 *
 *  It answers one question: is this record strong enough that a human being
 *  should be asked to look at it? It does not answer "should this be
 *  published", and no caller may treat it as though it does. Publication of a
 *  named official attached to an irregularity is an editorial act with legal
 *  consequences and a person's safety attached to it, and there is no
 *  arrangement of these fields that makes it a safe automatic one.
 *
 *  The bar is deliberately high, and every clause is here because failing it
 *  would mean naming somebody on thin evidence:
 *
 *    a name, actually read          you cannot name a person you could not read
 *    a legible certification        no conclusions off a photograph that could
 *                                   not show the block
 *    a finding that is not a guess  an irregularity the arithmetic proves, not
 *                                   an outlier or an unusual pattern
 *    the sheet's own serial         the one field that ties this finding to one
 *                                   specific piece of paper, so a challenge can
 *                                   be answered with the document itself
 * ══════════════════════════════════════════════════════════════════════════
 */
export function nameable(reading = {}, { impossible = false } = {}) {
  const seen = certification(reading);
  const missing = [];

  if (!seen.officer || seen.officerName !== "written") {
    missing.push("no legible presiding officer name on the sheet");
  }
  if (!seen.legible) {
    missing.push("the certification block could not be seen clearly enough to judge");
  }
  if (!impossible) {
    missing.push("no arithmetically impossible figure on this sheet");
  }
  if (!reading.formSerial) {
    missing.push("no form serial, so the finding cannot be tied to one sheet");
  }

  return {
    /* Even when everything passes, the word is "review" and never "publish". */
    forReview: missing.length === 0,
    missing,
    /* ── WHAT THE RECORD CANNOT ESTABLISH, CARRIED WITH IT ───────────────
       Returned rather than left to a caller to remember, so it travels with
       the finding into whatever screen or export shows it. A record that
       arrives without this line is a record somebody will read as a
       conclusion. */
    cannotEstablish:
      "Whether any irregularity on this sheet was deliberate. A presiding officer may " +
      "have been coerced, threatened or overruled, and nothing on the paper distinguishes " +
      "that from misconduct. This record identifies the officer of record for a document. " +
      "It is not a finding about their conduct.",
  };
}

/** One of the three states, defaulting to the cautious one. */
function state(value) {
  return value === OBSERVED.PRESENT || value === OBSERVED.ABSENT ? value : OBSERVED.UNCLEAR;
}

/** Whether a figure was changed, defaulting to the cautious one. */
function alterationState(value) {
  return value === "altered" || value === "none" ? value : OBSERVED.UNCLEAR;
}

/** The name box's three states, defaulting to the cautious one. */
function nameState(value) {
  return value === "written" || value === "blank" ? value : "illegible";
}
