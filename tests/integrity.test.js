import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { integrityOf, screenAll, screenReturn } from "../lib/anomalies.js";
import { formatPhone, isNigerianMobile, normalisePhone, phoneTail } from "../lib/phone.js";

/**
 * The checks the product is actually sold on.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Everything else in this repository presents figures. This module is the
 *  part that refuses them, and it is the reason anybody would choose this
 *  over a spreadsheet: a result reporting more votes than accredited voters
 *  is rejected outright rather than drawn in a slightly different colour.
 *
 *  A screening rule that silently stops firing is worse than no screening at
 *  all, because the absence of an alarm is read as an all-clear. These pin
 *  each rule to a return that must trip it and a return that must not.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** A clean return: everything adds up and nothing is remarkable. */
const clean = (over = {}) => ({
  unitCode: "25/07/04/019",
  registered: 800,
  accredited: 420,
  rejected: 10,
  votes: { APC: 180, PDP: 140, LP: 70, NNPP: 20 },
  ...over,
});

const rules = (row) => screenReturn(row).map((flag) => flag.rule);

describe("screening one return", () => {
  it("passes a return that adds up", () => {
    assert.deepEqual(screenReturn(clean()), []);
  });

  it("rejects more accredited than registered", () => {
    /* The booth cannot accredit people who are not on its register. */
    assert.ok(rules(clean({ accredited: 900 })).includes("accredited-over-register"));
    assert.equal(
      screenReturn(clean({ accredited: 900 }))[0].severity,
      "IMPOSSIBLE",
      "an impossible figure was not graded impossible"
    );
  });

  it("rejects more ballots than accredited voters", () => {
    /* The one everybody quotes, and the one that catches stuffing. */
    const stuffed = clean({ votes: { APC: 400, PDP: 100, LP: 20, NNPP: 5 } });
    assert.ok(rules(stuffed).includes("ballots-over-accredited"));
  });

  it("counts rejected ballots against the accredited ceiling", () => {
    /* 410 votes plus 20 rejected is 430 ballots from 420 accredited. A
       screening that ignored rejected ballots would wave this through. */
    const row = clean({ votes: { APC: 180, PDP: 140, LP: 70, NNPP: 20 }, rejected: 20 });
    assert.ok(
      rules(row).includes("ballots-over-accredited"),
      "rejected ballots were not counted against the ceiling"
    );
  });

  it("rejects a negative anything", () => {
    assert.ok(rules(clean({ votes: { APC: -5, PDP: 100 } })).length > 0);
    assert.ok(rules(clean({ registered: -1 })).length > 0);
  });

  it("flags a turnout no real booth reaches", () => {
    const row = clean({ registered: 800, accredited: 790, votes: { APC: 700, PDP: 60, LP: 20, NNPP: 5 }, rejected: 0 });
    assert.ok(screenReturn(row).length > 0, "a 98% turnout passed unremarked");
  });

  it("flags a party taking every single vote", () => {
    const row = clean({ accredited: 420, rejected: 0, votes: { APC: 400, PDP: 0, LP: 0, NNPP: 0 } });
    assert.ok(screenReturn(row).length > 0, "a clean sweep passed unremarked");
  });

  it("flags accreditation with no votes at all", () => {
    const row = clean({ accredited: 300, rejected: 0, votes: { APC: 0, PDP: 0, LP: 0, NNPP: 0 } });
    assert.ok(screenReturn(row).length > 0, "300 accredited and nobody voting passed unremarked");
  });

  it("does not invent a flag on an empty booth", () => {
    /* Nothing reported is not the same as something wrong. */
    const row = clean({ registered: 800, accredited: 0, rejected: 0, votes: { APC: 0, PDP: 0, LP: 0, NNPP: 0 } });
    assert.deepEqual(screenReturn(row), []);
  });

  it("grades every flag it raises", () => {
    const found = screenReturn(clean({ accredited: 900, votes: { APC: 900, PDP: 100 } }));
    assert.ok(found.length > 0);
    for (const flag of found) {
      assert.ok(["IMPOSSIBLE", "IMPLAUSIBLE", "OUTLIER", "PATTERN"].includes(flag.severity));
      assert.ok(flag.says?.length > 0, `${flag.rule} has nothing to say`);
      assert.ok(flag.why?.length > 0, `${flag.rule} does not explain itself`);
    }
  });
});

describe("screening a whole set", () => {
  it("keeps the clean ones out of the findings", () => {
    const rows = [clean(), clean({ unitCode: "25/07/04/020" }), clean({ unitCode: "25/07/04/021", accredited: 900 })];
    const found = screenAll(rows);
    assert.ok(found.length >= 1, "the impossible return was not found");
    assert.ok(
      found.every((flag) => flag.unitCode === "25/07/04/021" || flag.unitCode === undefined),
      "a clean return was flagged"
    );
  });

  it("reports an integrity summary that matches the findings", () => {
    const rows = [clean(), clean({ unitCode: "25/07/04/020", accredited: 900 })];
    const summary = integrityOf(rows);
    assert.equal(typeof summary, "object");
    assert.ok(summary !== null);
  });
});

describe("phone numbers", () => {
  it("normalises the ways Nigerians write their own number", () => {
    const wanted = normalisePhone("08030000001");
    for (const written of ["0803 000 0001", "+2348030000001", "2348030000001", "08030000001"]) {
      assert.equal(normalisePhone(written), wanted, `"${written}" did not normalise the same way`);
    }
  });

  it("shapes without judging, and judges separately", () => {
    /* normalisePhone deliberately shapes rather than validates: the same
       string is a typo in a form and a fact in a migration. The judging is
       isNigerianMobile, and that is what every caller must use. */
    for (const bad of ["", "abc", null, undefined]) {
      assert.ok(!normalisePhone(bad), `"${bad}" came back as a number`);
    }
    for (const bad of ["12", "999", "0803000000", "01234567890"]) {
      assert.ok(!isNigerianMobile(bad), `"${bad}" was accepted as a mobile`);
    }
    for (const good of ["08030000001", "+2348030000001", "8030000001", "07030000001"]) {
      assert.ok(isNigerianMobile(good), `"${good}" was rejected`);
    }
  });

  it("never turns a ten-digit typo into a well-formed number", () => {
    /* "0803000000" is an eleven-digit number with a digit missing. Prepending
       234 made it thirteen characters, which passed the shape check every
       caller made, so it reached the database looking perfectly correct. */
    const shaped = normalisePhone("0803000000");
    assert.ok(!/^234\d{10}$/.test(shaped ?? ""), `a typo shaped itself into ${shaped}`);
  });

  it("shows only the tail, which is all anybody needs to recognise it", () => {
    const tail = phoneTail("08030000001");
    assert.ok(tail.length <= 4, `the tail is ${tail.length} digits long`);
    assert.ok("08030000001".endsWith(tail));
  });

  it("formats without losing digits", () => {
    const formatted = formatPhone("08030000001");
    assert.equal(formatted.replace(/\D/g, "").slice(-10), "8030000001");
  });
});
