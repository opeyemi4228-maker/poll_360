import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nightPulse, sheetAudits, MOVEMENT_MINUTES } from "../lib/pulse.js";

/**
 * The night's vital signs, pinned.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Every figure this file checks is one a room lead reads out loud to people
 *  who then ring somebody. "Fourteen booths have not reported" sends four
 *  phone calls; "the count has been still for two hours" is the sentence that
 *  decides whether a room escalates. A number like that has to be checkable
 *  by a test rather than by staring at a dashboard on the night.
 *
 *  The denominators are the point. Most of what follows is not testing that
 *  the arithmetic adds up — it is testing that the *bottom* of each fraction
 *  is the one that was promised, because a coverage figure against the wrong
 *  denominator is the single most quotable wrong number this product can
 *  produce, and it looks completely reasonable on screen.
 * ══════════════════════════════════════════════════════════════════════════
 */

const NOW = Date.UTC(2027, 1, 20, 18, 0, 0);
const ago = (minutes) => new Date(NOW - minutes * 60 * 1000);

/** A return, with only what the pulse reads. */
const ret = (over = {}) => ({
  unitCode: "01/01/01/001",
  stateCode: "ABI",
  registered: 500,
  accredited: 300,
  rejected: 4,
  votes: { APC: 150, PDP: 146 },
  status: "SUBMITTED",
  source: "APP",
  submittedAt: ago(30),
  verifiedAt: null,
  ...over,
});

/** Somebody on the watch, with only what the pulse reads. */
const person = (over = {}) => ({
  id: "c1",
  name: "A Coordinator",
  scope: "01/01/01/001",
  filed: false,
  band: "unknown",
  lastSeen: null,
  ...over,
});

describe("the funnel", () => {
  it("counts every stage against the roster, never against the registry", () => {
    const pulse = nightPulse({
      rows: [ret({ status: "VERIFIED", verifiedAt: ago(10) })],
      watchList: [
        person({ id: "a", filed: true, lastSeen: ago(400) }),
        person({ id: "b", scope: "02/01/01/001", lastSeen: ago(400) }),
        person({ id: "c", scope: "03/01/01/001" }),
      ],
      /* A registry three orders of magnitude larger than the deployment, which
         is the realistic case and the one that produces a 0.002% coverage
         figure if it is ever allowed near the funnel. */
      unitsRegistered: 176846,
      now: NOW,
    });

    assert.deepEqual(
      pulse.funnel.map((stage) => stage.count),
      [3, 2, 1, 1]
    );
    /* Carried, so a screen can name it — and separate, so nothing can quietly
       divide by it. */
    assert.equal(pulse.assigned, 3);
    assert.equal(pulse.unitsRegistered, 176846);
  });

  it("does not count a disputed return as verified", () => {
    const pulse = nightPulse({
      rows: [ret(), ret({ unitCode: "01/01/01/002", status: "VERIFIED", verifiedAt: ago(5) })],
      now: NOW,
    });
    assert.equal(pulse.filed, 2);
    assert.equal(pulse.verified, 1);
    assert.equal(pulse.awaiting, 1);
  });
});

describe("the clocks", () => {
  it("measures the stillness from the newest return, not the oldest", () => {
    const pulse = nightPulse({
      rows: [ret({ submittedAt: ago(300) }), ret({ unitCode: "x", submittedAt: ago(90) })],
      now: NOW,
    });
    assert.equal(Math.round(pulse.clocks.quietMinutes), 90);
  });

  it("has no verification times at all until something has been verified", () => {
    const pulse = nightPulse({ rows: [ret()], now: NOW });
    assert.equal(pulse.clocks.verify.counted, 0);
    /* Null and not zero. Zero is a measurement — "checked instantly" — and
       this is the absence of one. */
    assert.equal(pulse.clocks.verify.p50, null);
  });
});

describe("what moved", () => {
  it("only counts inside the window, and names the states it moved in", () => {
    const pulse = nightPulse({
      rows: [
        ret({ submittedAt: ago(MOVEMENT_MINUTES - 1) }),
        ret({ unitCode: "05/01/01/001", submittedAt: ago(MOVEMENT_MINUTES + 5) }),
      ],
      incidents: [{ severity: "CRITICAL", createdAt: ago(2) }, { severity: "LOW", createdAt: ago(200) }],
      now: NOW,
    });

    assert.equal(pulse.movement.filed, 1);
    assert.equal(pulse.movement.incidents, 1);
    assert.deepEqual(pulse.movement.states, ["Abia"]);
  });
});

describe("silence", () => {
  it("lists the people nobody has heard from, never-signed-in first", () => {
    const pulse = nightPulse({
      watchList: [
        person({ id: "filed", filed: true }),
        person({ id: "quiet", scope: "02/01/01/001", lastSeen: ago(120) }),
        person({ id: "never", scope: "03/01/01/001", lastSeen: null }),
      ],
      now: NOW,
    });

    assert.deepEqual(
      pulse.silence.map((row) => row.id),
      ["never", "quiet"]
    );
    /* Never signed in carries no age rather than an invented one. */
    assert.equal(pulse.silence[0].quietMinutes, null);
    assert.equal(Math.round(pulse.silence[1].quietMinutes), 120);
    assert.equal(pulse.silence[1].state, "Adamawa");
  });
});

describe("the sheet audit", () => {
  const balanced = {
    unitCode: "01/01/01/001",
    registered: 500,
    accredited: 300,
    rejected: 4,
    spoiled: 0,
    ballotsIssued: 400,
    unusedBallots: 100,
    usedBallots: 300,
    statedValid: 296,
    votes: { APC: 150, PDP: 146 },
  };

  it("counts only the returns that captured the boxes", () => {
    const pulse = nightPulse({
      rows: [balanced, { ...ret(), unitCode: "01/01/01/002" }],
      now: NOW,
    });
    /* The second return has no boxes at all. It is not a passing audit and it
       is not a failing one — it is not auditable, and folding it into either
       would move a rate the room reads. */
    assert.equal(pulse.sheets.audited, 1);
    assert.equal(pulse.sheets.fails, 0);
  });

  it("names the single box every failure touches", () => {
    /* One wrong number in #8, seen by two identities at once. */
    const [finding] = sheetAudits([{ ...balanced, usedBallots: 301 }]);
    assert.equal(finding.culprit, "#8");
    assert.ok(finding.findings.length >= 2);
  });

  it("puts the sheet that is furthest out at the top", () => {
    const found = sheetAudits([
      { ...balanced, unitCode: "01/01/01/001", usedBallots: 301 },
      { ...balanced, unitCode: "01/01/01/002", usedBallots: 4000 },
    ]);
    assert.equal(found[0].unitCode, "01/01/01/002");
  });
});

describe("what arrived with the returns", () => {
  it("separates a photograph that was compared from one that was merely attached", () => {
    const pulse = nightPulse({
      rows: [
        ret({ sheetMatch: { compared: true } }),
        ret({ unitCode: "01/01/01/002", sheetMatch: { compared: false } }),
        ret({ unitCode: "01/01/01/003" }),
      ],
      now: NOW,
    });
    assert.equal(pulse.capture.photographed, 2);
    assert.equal(pulse.capture.compared, 1);
  });
});

describe("the states", () => {
  it("keeps a state somebody was deployed to and nothing came from", () => {
    const pulse = nightPulse({
      rows: [ret()],
      watchList: [person({ filed: true }), person({ id: "b", scope: "02/01/01/001" })],
      now: NOW,
    });

    const adamawa = pulse.states.find((row) => row.name === "Adamawa");
    /* The row a room rings. Dropping it because it has no returns would hide
       exactly the state that needs a phone call. */
    assert.ok(adamawa);
    assert.equal(adamawa.assigned, 1);
    assert.equal(adamawa.filed, 0);
  });
});
