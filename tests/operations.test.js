import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pipeline, stageOf, STAGES } from "../lib/operations.js";

/**
 * The result pipeline, pinned.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Two properties matter more than any individual figure here, and both are
 *  the kind that fail silently on a live night:
 *
 *    THE LADDER NEVER WIDENS.  A funnel with a rung wider than the one above
 *    it is read by everybody in the room as a bug, and the moment somebody
 *    decides one chart in this product is broken they stop trusting the rest
 *    of them. The monotonicity is enforced by construction in stageOf, and it
 *    is checked here against the exact case that breaks a naive version — a
 *    return verified by a desk that never had its sheet photographed.
 *
 *    THE DROP IS A REAL PILE OF WORK.  "Held" is what somebody has to go and
 *    do. If it is off by one the room dispatches the wrong number of people.
 * ══════════════════════════════════════════════════════════════════════════
 */

const NOW = Date.UTC(2027, 1, 20, 20, 0, 0);
const ago = (minutes) => new Date(NOW - minutes * 60 * 1000);

/** A return, carrying only what the pipeline reads. */
const ret = (over = {}) => ({
  unitCode: "01/01/01/001",
  stateCode: "ABI",
  registered: 500,
  accredited: 300,
  rejected: 4,
  votes: { APC: 150, PDP: 146 },
  status: "SUBMITTED",
  source: "APP",
  sheetMatch: null,
  submittedAt: ago(30),
  verifiedAt: null,
  ...over,
});

/* A sheet whose own boxes balance: issued − unused − spoiled = used = valid. */
const balanced = {
  ballotsIssued: 500,
  unusedBallots: 196,
  spoiled: 4,
  usedBallots: 300,
  statedValid: 296,
};

describe("where one return is standing", () => {
  it("puts a bare return on 'received' and names the next thing owed to it", () => {
    const at = stageOf(ret());
    assert.equal(at.reached, "received");
    assert.equal(at.next, "extracted");
  });

  it("counts a verified return as having cleared every rung beneath it", () => {
    /* The case a naive funnel gets wrong: a desk rang the presiding officer
       and accepted the figures, so nothing was ever photographed. */
    const at = stageOf(ret({ status: "VERIFIED", verifiedAt: ago(5) }));
    assert.equal(at.reached, "verified");
    assert.equal(at.next, null);
    assert.equal(at.cleared.extracted, true);
    assert.equal(at.cleared.confirmed, true);
  });

  it("holds a return at 'extracted' when a sheet arrived and was never compared", () => {
    const at = stageOf(ret({ sheetMatch: { compared: false } }));
    assert.equal(at.reached, "extracted");
    assert.equal(at.next, "confirmed");
  });

  it("fails validation on an impossible figure, however good the paperwork", () => {
    const at = stageOf(
      ret({
        ...balanced,
        sheetMatch: { compared: true },
        accredited: 900, // more accredited than the 500 on the register
      })
    );
    assert.equal(at.impossible, true);
    assert.equal(at.reached, "confirmed");
    assert.equal(at.next, "validated");
  });

  it("fails validation on a sheet that does not add up", () => {
    const at = stageOf(
      ret({
        sheetMatch: { compared: true },
        ...balanced,
        usedBallots: 250, // no longer 500 − 196 − 4
      })
    );
    assert.equal(at.balances, false);
    assert.equal(at.next, "validated");
  });

  it("does not withdraw validation from a return that captured no boxes at all", () => {
    /* auditSheet withdraws a check it has no figures for. A return with an
       uncaptured sheet must not be held back for failing a test that never
       ran — that would report a rising failure rate every time somebody filed
       without photographing the form. */
    const at = stageOf(ret({ sheetMatch: { compared: true } }));
    assert.equal(at.balances, true);
    assert.equal(at.reached, "validated");
  });
});

describe("the ladder", () => {
  it("never widens, whatever mixture of returns is put through it", () => {
    const rows = [
      ret({ status: "VERIFIED", verifiedAt: ago(5) }), // no sheet at all
      ret({ unitCode: "02/01/01/001", sheetMatch: { compared: true }, ...balanced }),
      ret({ unitCode: "03/01/01/001", sheetMatch: { compared: false } }),
      ret({ unitCode: "04/01/01/001" }),
      ret({ unitCode: "05/01/01/001", accredited: 900 }),
    ];

    const { stages } = pipeline({ rows, assigned: 8, now: NOW });

    for (let index = 1; index < stages.length; index += 1) {
      assert.ok(
        stages[index].count <= stages[index - 1].count,
        `${stages[index].id} (${stages[index].count}) is wider than ${stages[index - 1].id} (${stages[index - 1].count})`
      );
    }
  });

  it("measures 'expected' against the roster and never against the registry", () => {
    const { stages, kpis } = pipeline({
      rows: [ret()],
      assigned: 12,
      unitsRegistered: 176846,
      now: NOW,
    });

    const expected = stages.find((stage) => stage.id === "expected");
    assert.equal(expected.count, 12);
    assert.equal(kpis.expected, 12);
    /* Carried, so the screen can print it — and never divided by. */
    assert.equal(stages.find((stage) => stage.id === "received").count, 1);
  });

  it("never reports fewer expected than have actually arrived", () => {
    /* A deployment can under-record its own roster; returns cannot be
       un-filed. An "expected" below "received" would draw a funnel that
       widens at the first rung. */
    const { kpis } = pipeline({ rows: [ret(), ret({ unitCode: "02/01/01/001" })], assigned: 0, now: NOW });
    assert.equal(kpis.expected, 2);
  });

  it("counts a rung's held returns as exactly the ones that stopped there", () => {
    const rows = [
      ret({ unitCode: "01/01/01/001" }), // stops at received
      ret({ unitCode: "02/01/01/001" }), // stops at received
      ret({ unitCode: "03/01/01/001", sheetMatch: { compared: false } }), // stops at extracted
    ];

    const { stages } = pipeline({ rows, assigned: 3, now: NOW });
    const received = stages.find((stage) => stage.id === "received");
    const extracted = stages.find((stage) => stage.id === "extracted");

    assert.equal(received.held, 2);
    assert.equal(extracted.held, 1);
  });

  it("ages a held return from when it was filed", () => {
    const rows = [ret({ submittedAt: ago(200) }), ret({ unitCode: "02/01/01/001", submittedAt: ago(20) })];
    const { stages } = pipeline({ rows, assigned: 2, now: NOW });
    const received = stages.find((stage) => stage.id === "received");

    assert.equal(Math.round(received.oldest), 200);
    assert.ok(received.p50 <= received.oldest);
  });
});

describe("what is stuck", () => {
  it("names the booth, the step it is waiting on, and why", () => {
    const { stuck } = pipeline({
      rows: [ret({ unitCode: "07/02/03/004", sheetMatch: { compared: false } })],
      assigned: 1,
      now: NOW,
    });

    assert.equal(stuck.length, 1);
    assert.equal(stuck[0].unitCode, "07/02/03/004");
    assert.equal(stuck[0].next, "confirmed");
    assert.match(stuck[0].because, /held against/i);
  });

  it("tells an impossible figure apart from a sheet that will not balance", () => {
    const rows = [
      ret({ unitCode: "01/01/01/001", sheetMatch: { compared: true }, accredited: 900 }),
      ret({
        unitCode: "02/01/01/001",
        sheetMatch: { compared: true },
        ...balanced,
        usedBallots: 250,
      }),
    ];

    const { stuck } = pipeline({ rows, assigned: 2, now: NOW });
    const reasons = Object.fromEntries(stuck.map((row) => [row.unitCode, row.because]));

    assert.match(reasons["01/01/01/001"], /arithmetic/i);
    assert.match(reasons["02/01/01/001"], /does not add up/i);
  });

  it("leaves out anything that has been all the way through", () => {
    const { stuck } = pipeline({
      rows: [ret({ status: "VERIFIED", verifiedAt: ago(5) })],
      assigned: 1,
      now: NOW,
    });
    assert.equal(stuck.length, 0);
  });

  it("puts the longest wait first", () => {
    const rows = [
      ret({ unitCode: "01/01/01/001", submittedAt: ago(10) }),
      ret({ unitCode: "02/01/01/001", submittedAt: ago(300) }),
      ret({ unitCode: "03/01/01/001", submittedAt: ago(90) }),
    ];
    const { stuck } = pipeline({ rows, assigned: 3, now: NOW });
    assert.deepEqual(
      stuck.map((row) => row.unitCode),
      ["02/01/01/001", "03/01/01/001", "01/01/01/001"]
    );
  });
});

describe("the headline figures", () => {
  it("carries rejections that the counted rows are right to exclude", () => {
    const { kpis } = pipeline({ rows: [ret()], disputed: 3, assigned: 4, now: NOW });
    assert.equal(kpis.rejected, 3);
    /* And they are not silently folded into anything else. */
    assert.equal(kpis.received, 1);
    assert.equal(kpis.pending, 1);
  });

  it("times the desk with percentiles rather than a mean", () => {
    const rows = [
      ret({ unitCode: "01/01/01/001", status: "VERIFIED", submittedAt: ago(70), verifiedAt: ago(60) }),
      ret({ unitCode: "02/01/01/001", status: "VERIFIED", submittedAt: ago(70), verifiedAt: ago(50) }),
      /* The outlier a mean would smear across the other two. */
      ret({ unitCode: "03/01/01/001", status: "VERIFIED", submittedAt: ago(400), verifiedAt: ago(5) }),
    ];

    const { kpis } = pipeline({ rows, assigned: 3, now: NOW });
    assert.equal(kpis.wait.counted, 3);
    assert.equal(kpis.wait.p50, 20);
    assert.equal(kpis.wait.p90, 395);
  });

  it("counts what was verified without a sheet ever being compared", () => {
    const rows = [
      ret({ unitCode: "01/01/01/001", status: "VERIFIED", verifiedAt: ago(5) }),
      ret({
        unitCode: "02/01/01/001",
        status: "VERIFIED",
        verifiedAt: ago(5),
        sheetMatch: { compared: true },
      }),
    ];

    const { withoutEvidence } = pipeline({ rows, assigned: 2, now: NOW });
    assert.equal(withoutEvidence, 1);
  });

  it("draws an honest empty pipeline with nothing at all in it", () => {
    const empty = pipeline({ now: NOW });
    assert.equal(empty.kpis.received, 0);
    assert.equal(empty.kpis.complete, 0);
    assert.equal(empty.stuck.length, 0);
    assert.equal(empty.stages.length, STAGES.length);
  });
});

describe("the two cuts", () => {
  it("rolls the ladder up by state, biggest backlog first", () => {
    const rows = [
      ret({ unitCode: "01/01/01/001" }),
      ret({ unitCode: "01/01/01/002" }),
      ret({ unitCode: "02/01/01/001", status: "VERIFIED", verifiedAt: ago(5) }),
    ];

    const { byState } = pipeline({ rows, assigned: 3, now: NOW });
    assert.equal(byState[0].stuck, 2);
    assert.equal(byState[0].received, 2);
    assert.equal(byState.at(-1).stuck, 0);
  });

  it("rolls it up by how the return arrived, in the words the room uses", () => {
    const rows = [
      ret({ unitCode: "01/01/01/001", source: "WHATSAPP" }),
      ret({ unitCode: "02/01/01/001", source: "APP" }),
      /* Filed at a desk. The column stores DESK; the room says UPLOAD. */
      ret({ unitCode: "03/01/01/001", source: "DESK" }),
    ];

    const { byChannel } = pipeline({ rows, assigned: 3, now: NOW });
    const ids = byChannel.map((row) => row.id).sort();
    assert.deepEqual(ids, ["APP", "UPLOAD", "WHATSAPP"]);
    assert.ok(byChannel.every((row) => row.label && row.label !== row.id));
  });
});
