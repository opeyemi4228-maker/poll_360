import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OBSERVED, certification, nameable, omissions } from "../lib/certification.js";

/**
 * The certification block, pinned.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Every test in this file guards the same boundary: the difference between
 *  what a photograph shows and what an official did.
 *
 *  A sheet that carries no signature is a finding. A photograph in which no
 *  signature is visible is a camera problem. They look identical to any
 *  reader that flattens three states into a boolean, and the cost of getting
 *  it wrong is not a wrong number on a dashboard — it is a named person
 *  publicly attached to an allegation of misconduct on the strength of a
 *  cropped picture.
 *
 *  So the assertions below are mostly about what this module refuses to say.
 * ══════════════════════════════════════════════════════════════════════════
 */

const sheet = (over = {}) => ({
  repName: "A. Bello",
  formSerial: "0000611",
  certification: {
    signature: "present",
    stamp: "present",
    officerName: "written",
    alteration: "none",
  },
  ...over,
});

const seen = (over) => sheet({ certification: { ...sheet().certification, ...over } });

describe("what the photograph showed", () => {
  it("reads a fully certified sheet as certified", () => {
    const found = certification(sheet());
    assert.equal(found.certified, true);
    assert.equal(found.legible, true);
    assert.equal(found.officer, "A. Bello");
  });

  it("never reports an unclear photograph as certified", () => {
    const found = certification(seen({ signature: "unclear" }));
    assert.equal(found.certified, false);
    /* And says why it cannot tell, which is the part that matters. */
    assert.equal(found.legible, false);
  });

  it("defaults every unknown value to the cautious state", () => {
    /* A reader that returned nothing, an older reading, a truncated payload.
       None of them may come out as an allegation. */
    for (const input of [{}, { certification: {} }, { certification: { signature: "yes" } }]) {
      const found = certification(input);
      assert.equal(found.signature, OBSERVED.UNCLEAR);
      assert.equal(found.stamp, OBSERVED.UNCLEAR);
      assert.equal(found.officerName, "illegible");
      assert.equal(found.certified, false);
    }
  });

  it("does not tidy the officer's name", () => {
    /* Handwriting transcribed. Every normalisation is a chance to attach a
       finding to a different person with a similar name — so no case folding,
       no initial expansion, no matching against a roll.

       Surrounding whitespace is the one exception, and it is not a
       normalisation: it is not part of anybody's name, and a value carrying it
       compares unequal to the same name without it, which would make one
       officer read as two across two sheets. The characters are untouched. */
    const found = certification(sheet({ repName: "  a. bello  " }));
    assert.equal(found.officer, "a. bello");
    assert.notEqual(found.officer, "A. Bello", "the name was case-folded");
  });

  it("counts a name that was read as a name that was written", () => {
    /* The optical reader produces no certification block of its own, so its
       readings arrive with no state for the name box. Defaulting those to
       "illegible" made the screen say "could not be read from this
       photograph" over a sheet whose officer had just been read off it. */
    const found = certification({ repName: "HASSAN HABEEB" });
    assert.equal(found.officerName, "written");
    assert.equal(found.officer, "HASSAN HABEEB");
    /* And it still says nothing about the signature, which it has not seen. */
    assert.equal(found.signature, OBSERVED.UNCLEAR);
  });

  it("still reports a name box the reader said was blank", () => {
    /* An explicit "blank" from a reader that looked outranks the presence of
       a name from anywhere else: that is an observation, not a default. */
    const found = certification({
      repName: "HASSAN HABEEB",
      certification: { officerName: "blank" },
    });
    assert.equal(found.officerName, "blank");
  });
});

describe("what is missing, and what is merely unseen", () => {
  it("raises a finding only when the sheet is clearly empty", () => {
    const { findings } = omissions(seen({ signature: "absent" }));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, "unsigned");
  });

  it("raises no finding at all for an unclear photograph", () => {
    /* Every observation unreadable: the worst photograph, and the one most
       likely to arrive from a handset at nine at night. */
    const { findings, retake } = omissions(
      seen({
        signature: "unclear",
        stamp: "unclear",
        officerName: "illegible",
        alteration: "unclear",
      })
    );

    assert.deepEqual(findings, [], "an unreadable photograph produced an allegation");
    /* One request per thing that could not be seen, rather than a count that
       has to be edited every time an observation is added. */
    assert.equal(retake.length, 4, "it did not ask for a better picture either");
    for (const what of [/signature/, /stamp/, /name/, /altered/]) {
      assert.ok(retake.some((line) => what.test(line)), `nothing asked about ${what}`);
    }
  });

  it("keeps findings and retakes in separate lists", () => {
    /* One sheet, genuinely unsigned, photographed too badly to see the stamp.
       The first is a finding; the second is a job. A screen that rendered them
       in one list would let a reader take the second for the first. */
    const { findings, retake } = omissions(seen({ signature: "absent", stamp: "unclear" }));

    assert.deepEqual(findings.map((row) => row.rule), ["unsigned"]);
    assert.ok(retake.some((line) => /stamp/.test(line)));
    assert.ok(
      !retake.some((line) => /signature/.test(line)),
      "a proven finding was also filed as a retake"
    );
  });

  it("words every finding as a fact about the document", () => {
    const { findings } = omissions(
      seen({ signature: "absent", stamp: "absent", officerName: "blank", alteration: "altered" })
    );
    assert.equal(findings.length, 4);

    for (const finding of findings) {
      const words = `${finding.says} ${finding.why}`.toLowerCase();
      /* "This sheet carries no signature", never "the officer did not sign". */
      assert.ok(
        /sheet|certification|figures|figure|stamp|name box|polling unit|return/.test(words),
        `"${finding.says}" does not name the document`
      );
      for (const accusation of ["refused", "failed to", "did not sign", "neglect", "fraud", "deliberate"]) {
        assert.ok(!words.includes(accusation), `a finding says "${accusation}"`);
      }
    }
  });
});

describe("the gate in front of a person's name", () => {
  const impossible = { impossible: true };

  it("opens only when every clause is satisfied", () => {
    const gate = nameable(sheet(), impossible);
    assert.equal(gate.forReview, true);
    assert.deepEqual(gate.missing, []);
  });

  it("is called review and never publication", () => {
    /* If this ever becomes `publish`, the editorial decision has been moved
       into a function, which is the one thing this module exists to prevent. */
    const gate = nameable(sheet(), impossible);
    assert.ok("forReview" in gate);
    assert.ok(!("publish" in gate), "the gate grew a publish flag");
  });

  it("refuses a name that could not be read", () => {
    const gate = nameable(seen({ officerName: "illegible" }), impossible);
    assert.equal(gate.forReview, false);
    assert.ok(gate.missing.some((why) => /name/.test(why)));
  });

  it("refuses any conclusion drawn off an unclear photograph", () => {
    const gate = nameable(seen({ stamp: "unclear" }), impossible);
    assert.equal(gate.forReview, false);
    assert.ok(gate.missing.some((why) => /clearly/.test(why)));
  });

  it("refuses a finding that is not arithmetically proven", () => {
    /* An outlier is context. Only an impossible figure — one the arithmetic
       proves cannot be true — is enough to put a name in front of anybody. */
    const gate = nameable(sheet(), { impossible: false });
    assert.equal(gate.forReview, false);
    assert.ok(gate.missing.some((why) => /impossible/.test(why)));
  });

  it("refuses a finding that cannot be tied to one sheet", () => {
    const gate = nameable(sheet({ formSerial: null }), impossible);
    assert.equal(gate.forReview, false);
    assert.ok(gate.missing.some((why) => /serial/.test(why)));
  });

  it("carries the coercion caveat even when every clause passes", () => {
    /* The caveat travels with the record rather than living in a screen's
       footer, because a record exported, pasted or forwarded without it is a
       record somebody reads as a conclusion. */
    const gate = nameable(sheet(), impossible);
    const words = gate.cannotEstablish.toLowerCase();

    assert.ok(words.includes("coerced"));
    assert.ok(words.includes("deliberate"));
    assert.ok(words.includes("not a finding about their conduct"));
  });
});

describe("what this module deliberately does not offer", () => {
  it("exposes no way to score or rank an officer", () => {
    /* A "worst presiding officers" table is one query from this data and would
       be a defamation engine: it reads as a finding of misconduct while
       resting on paperwork a coerced officer and a corrupt one produce
       identically. Its absence is the design. */
    const api = Object.keys({ OBSERVED, certification, nameable, omissions });
    for (const name of api) {
      assert.ok(
        !/score|rank|worst|history|record_of|reputation/i.test(name),
        `${name} looks like an aggregate over people`
      );
    }
  });
});
