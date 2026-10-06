import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FAULT_ORDER, FAULT_WORDS, buildFaults, faultSentences, tidyKind, tidyUnder, uploadSteps } from "../lib/irev/faults.js";
import { FAULT_NAMES } from "../lib/irev/vault.js";

/**
 * What is wrong with what INEC published.
 *
 * The rows below are the shape the database hands back for a place. What is
 * tested is what would mislead quietly: a fault the screen has no words for,
 * a unit with no voters called a missing sheet, the day after the poll called
 * late, and a total that is not the sum of what is under it.
 */

const row = (key, over = {}) => ({
  key,
  lga_name: "AROCHUKWU",
  ward_name: "AROCHUKWU III",
  unit_name: "TOWN HALL",
  unit_id: 7,
  units: 100,
  sheets: 90,
  no_voters: 0,
  timed: 90,
  faulty: 30,
  ...Object.fromEntries(FAULT_NAMES.map((name) => [name, 0])),
  ...over,
});

describe("publishing faults, in words", () => {
  it("has words for every fault the database counts, and for no other", () => {
    assert.deepEqual([...FAULT_ORDER].sort(), [...FAULT_NAMES].sort());
    for (const name of FAULT_ORDER) assert.ok(FAULT_WORDS[name].label && FAULT_WORDS[name].what, name);
  });

  it("takes a fault or a place only where it is one", () => {
    assert.equal(tidyKind("late"), "late");
    assert.equal(tidyKind("1; DROP TABLE"), null);
    assert.equal(tidyUnder("05/16/01/004"), "05/16/01");
    assert.equal(tidyUnder("99"), "");
    assert.equal(tidyUnder("../etc"), "");
  });

  it("says what is wrong at a polling unit, and nothing where nothing is", () => {
    assert.deepEqual(faultSentences({ sheet_up: false, no_voters: false }), ["no sheet published"]);
    assert.deepEqual(faultSentences({ sheet_up: false, no_voters: true }), []);
    assert.deepEqual(faultSentences({ sheet_up: true, days_after: 1 }), []);
    assert.deepEqual(faultSentences({ sheet_up: true, days_after: 21, earlier_sheets: 2 }), [
      "went up 21 days after polling day",
      "replaced 2 times",
    ]);
    assert.deepEqual(faultSentences({ sheet_up: true, no_file: true }), ["listed as up, with no file at its address"]);
  });
});

describe("when the sheets went up, in steps", () => {
  const days = [
    { day: 0, sheets: 20 },
    { day: 1, sheets: 580 },
    { day: 2, sheets: 1457 },
    { day: 5, sheets: 49 },
    { day: 21, sheets: 1 },
  ];

  it("counts every sheet once, and calls late only what is two days or more after", () => {
    const steps = uploadSteps(days);
    assert.equal(steps.timed, 2107);
    assert.equal(steps.steps.reduce((sum, step) => sum + step.sheets, 0), 2107);
    assert.deepEqual(steps.steps.filter((step) => !step.late).map((step) => step.key), ["day", "next"]);
    assert.equal(steps.steps.filter((step) => step.late).reduce((sum, step) => sum + step.sheets, 0), 1507);
    assert.equal(steps.lastDay, 21);
  });

  it("keeps an empty step between the ends, and drops an empty end", () => {
    const keys = uploadSteps(days).steps.map((step) => step.key);
    assert.ok(keys.includes("three"));
    assert.ok(!keys.includes("before"));
    assert.ok(!keys.includes("later"));
    assert.ok(uploadSteps([{ day: -3, sheets: 1 }]).steps.some((step) => step.key === "before" && step.odd));
  });

  it("is nothing where no sheet carries a time", () => {
    assert.equal(uploadSteps([]), null);
  });
});

describe("publishing faults, added up by place", () => {
  it("names states at the top and sums what is under a place", () => {
    const account = buildFaults({
      under: "",
      totals: [row("01", { missing: 10, late: 40 }), row("24", { units: 200, sheets: 150, missing: 50, late: 5, faulty: 55 })],
    });
    assert.equal(account.level, "state");
    assert.deepEqual(account.children.map((place) => place.name), ["Abia", "Lagos"]);
    assert.equal(account.whole.units, 300);
    assert.equal(account.whole.sheets, 240);
    assert.equal(account.whole.faults.missing, 60);
    assert.equal(account.whole.faults.late, 45);
    assert.equal(account.whole.faulty, 85);
  });

  it("names local governments, wards and polling units as it goes down", () => {
    assert.equal(buildFaults({ under: "01", totals: [row("01/02")] }).children[0].name, "AROCHUKWU");
    assert.equal(buildFaults({ under: "01/02", totals: [row("01/02/03")] }).children[0].name, "AROCHUKWU III");
    const unit = buildFaults({ under: "01/02/03", totals: [row("01/02/03/004")] });
    assert.equal(unit.level, "unit");
    assert.deepEqual([unit.children[0].name, unit.children[0].unitId], ["TOWN HALL", 7]);
  });

  it("lists a flagged polling unit with where it is and what is wrong", () => {
    const { flags } = buildFaults({
      under: "",
      kind: "late",
      totals: [row("01")],
      flags: [{ unit_id: 9, pu_code: "01/05/04/002", unit_name: "MARKET SQUARE", ward_name: "W", lga_name: "IKWUANO", state_name: "ABIA", sheet_up: true, days_after: 21 }],
    });
    assert.deepEqual(flags, [
      { unitId: 9, unitCode: "01/05/04/002", name: "MARKET SQUARE", where: "W, IKWUANO, ABIA", what: ["went up 21 days after polling day"] },
    ]);
  });
});
