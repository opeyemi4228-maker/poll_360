import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchSheet, matchRecord, mismatchMessage } from "../lib/sheet-match.js";

/**
 * Does what the agent typed match the sheet they photographed?
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  For a long time the two halves of a filing never met: the reader checked
 *  the photograph against itself, and the bot then filed whatever the agent
 *  had typed, having replied "Sheet received" without ever comparing them.
 *
 *  Both directions of failure are serious and only one of them is obvious.
 *
 *  Missing a real mismatch files a figure that the photograph beside it
 *  contradicts, and stamps it as corroborated.
 *
 *  Inventing one is worse than it sounds. It stops a coordinator standing in
 *  a schoolyard at nine at night and tells them their sheet disagrees with
 *  their own typing, over a figure a machine misread. Do that twice and the
 *  agent stops photographing sheets, which removes the corroboration
 *  entirely. So a reading only gets to contradict a person when it is
 *  self-consistent, the field was actually read, and the two genuinely differ.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* What parseSheet hands over for a clean read. */
const read = (over = {}) => ({
  usable: true,
  accredited: 412,
  registered: 800,
  rejected: 2,
  votes: [180, 140, 70, 20],
  missing: [],
  problems: [],
  ...over,
});

const typed = (over = {}) => ({
  accredited: 412,
  registered: 800,
  rejected: 2,
  votes: { APC: 180, PDP: 140, LP: 70, NNPP: 20 },
  ...over,
});

describe("when there is nothing to compare", () => {
  it("says so rather than agreeing", () => {
    /* No comparison is not a match. A filing with no sheet behind it must
       never be recorded as corroborated by one. */
    const none = matchSheet(null, typed());
    assert.equal(none.comparable, false);
    assert.equal(none.agrees, false, "a missing reading was recorded as agreement");
    assert.ok(none.reason, "no reason was given for the absence");
  });

  it("refuses to let an incoherent reading contradict anybody", () => {
    /* A reading whose own arithmetic does not hold has no business
       contradicting a person. */
    const match = matchSheet(read({ usable: false, problems: ["the figures do not add up"] }), typed());
    assert.equal(match.comparable, false);
    assert.equal(match.agrees, false);
    assert.match(match.reason, /add up/);
  });

  it("does not record agreement when the two overlapped on nothing", () => {
    /* A reading that shares no field with what was typed has told us nothing,
       and "nothing" must not be filed as "agrees". */
    const match = matchSheet(
      read({ accredited: null, registered: null, rejected: null, missing: ["APC", "PDP", "LP", "NNPP"] }),
      typed()
    );
    assert.equal(match.comparable, false);
    assert.equal(match.agrees, false);
  });
});

describe("when the two agree", () => {
  it("agrees, and says what it checked", () => {
    const match = matchSheet(read(), typed());
    assert.equal(match.comparable, true);
    assert.equal(match.agrees, true, `mismatched on ${JSON.stringify(match.mismatches)}`);
    assert.ok(match.checked.includes("accredited"));
    assert.ok(match.checked.includes("APC"));
    assert.deepEqual(match.mismatches, []);
  });

  it("takes the votes as an array or keyed by party, because both are built", () => {
    /* The bot builds one shape and the web form builds the other. */
    const asArray = matchSheet(read(), { ...typed(), votes: [180, 140, 70, 20] });
    assert.equal(asArray.agrees, true, "an array of votes did not compare");
  });

  it("compares only what the agent actually entered", () => {
    /* A figure nobody typed is not a disagreement. */
    const match = matchSheet(read(), { accredited: 412, votes: { APC: 180 } });
    assert.equal(match.agrees, true);
    assert.ok(!match.checked.includes("PDP"), "compared a figure that was never entered");
  });

  it("never compares a party the reader could not make out", () => {
    /* parseSheet stores 0 for an unread party so the array keeps its shape,
       which makes `missing` the only way to tell an unread figure from a
       genuine nil. Comparing it to zero would invent a mismatch on every
       smudged sheet. */
    const match = matchSheet(read({ votes: [180, 140, 0, 20], missing: ["LP"] }), typed());
    assert.equal(match.agrees, true, "an unread party was compared as zero");
    assert.ok(!match.checked.includes("LP"));
  });
});

describe("when the two disagree", () => {
  it("catches a typed figure the photograph contradicts", () => {
    const match = matchSheet(read(), typed({ votes: { APC: 810, PDP: 140, LP: 70, NNPP: 20 } }));
    assert.equal(match.comparable, true);
    assert.equal(match.agrees, false, "a hundreds-sized difference was not caught");

    const found = match.mismatches.find((row) => row.field === "APC");
    assert.ok(found, `mismatches were ${JSON.stringify(match.mismatches)}`);
    assert.equal(found.read, 180);
    assert.equal(found.typed, 810);
  });

  it("catches a wrong accredited figure", () => {
    const match = matchSheet(read(), typed({ accredited: 421 }));
    assert.equal(match.agrees, false, "a transposed accredited figure passed");
    assert.ok(match.mismatches.some((row) => row.field === "accredited"));
  });

  it("reports every field that differs, not just the first", () => {
    const match = matchSheet(read(), typed({ accredited: 421, votes: { APC: 810, PDP: 140, LP: 70, NNPP: 20 } }));
    assert.ok(match.mismatches.length >= 2, `only reported ${match.mismatches.length}`);
  });
});

describe("what the agent is told", () => {
  it("names the figure, both numbers, and asks for it again", () => {
    /* Somebody standing in a schoolyard at nine at night is not helped by
       "validation failure: field mismatch". */
    const match = matchSheet(read(), typed({ votes: { APC: 810, PDP: 140, LP: 70, NNPP: 20 } }));
    const message = mismatchMessage(match, { channel: "whatsapp" });

    assert.ok(message.length > 0, "no message was produced for a mismatch");
    assert.match(message, /180/, "the message does not say what the picture shows");
    assert.match(message, /810/, "the message does not say what was typed");
    assert.match(message, /APC/);
  });

  it("does not accuse anybody", () => {
    /* The overwhelmingly likeliest reading is a fat thumb on a phone keypad,
       which is precisely the thing this check is for. */
    const match = matchSheet(read(), typed({ accredited: 421 }));
    const message = mismatchMessage(match, { channel: "whatsapp" });
    assert.ok(
      !/fraud|deliberate|falsif|lying|tamper/i.test(message),
      `the message accuses the agent: ${message}`
    );
  });
});

describe("what gets written down", () => {
  it("records a comparison that happened", () => {
    const record = matchRecord(matchSheet(read(), typed()));
    assert.ok(record, "an agreeing comparison recorded nothing");
  });

  it("does not record an absence as a corroborated sheet", () => {
    const record = matchRecord(matchSheet(null, typed()));
    assert.ok(
      !record || record.agrees !== true,
      "a filing with no sheet was recorded as corroborated"
    );
  });
});
