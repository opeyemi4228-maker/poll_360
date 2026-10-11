import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ITEMS, LIGHTS, RESOLUTIONS, bvasOf, itemsForUnit, lightOf, mayResolve, readSettings, rollUp, winnerOf } from "../lib/lights.js";

/**
 * The traffic lights, pinned.
 *
 * Written as the room's rules in sentences and not derived from the table in
 * lib/lights.js: a test that reads the table to learn what red means agrees
 * with the table by construction. Each case below is a row of the
 * specification, and a change to what turns a unit red has to change one of
 * these on purpose.
 */

const clean = { registered: 500, accredited: 300, rejected: 5, votes: { APC: 150, PDP: 100, LP: 40 }, status: "VERIFIED" };
const codes = (facts) => itemsForUnit(facts).map((item) => item.code);

describe("what is open on a polling unit", () => {
  it("a checked, sound result has nothing open", () => {
    assert.deepEqual(codes({ result: clean }), []);
  });

  it("no result and no deadline is silence, not an item", () => {
    assert.deepEqual(codes({ result: null }), []);
  });

  it("more ballots than BVAS accredited is red", () => {
    assert.ok(codes({ result: { ...clean, accredited: 200 } }).includes("R_OVERVOTE"));
  });

  it("BVAS accredited above registered is red", () => {
    assert.ok(codes({ result: { ...clean, registered: 250 } }).includes("R_ACCRED_OVER_REG"));
  });

  it("a result with no BVAS figure is yellow, and is never checked as zero accredited", () => {
    const found = codes({ result: { ...clean, accredited: null } });
    assert.ok(found.includes("Y_BVAS_MISSING"));
    assert.ok(!found.includes("R_OVERVOTE"));
  });

  it("turnout at the threshold is yellow, and the threshold is the project's", () => {
    const high = { ...clean, registered: 310, accredited: 300 };
    assert.ok(codes({ result: high }).includes("Y_IMPLAUSIBLE"));
    assert.ok(!codes({ result: high, settings: readSettings({ turnoutPercent: 99 }) }).includes("Y_IMPLAUSIBLE"));
  });

  it("BVAS and a different manual figure is yellow", () => {
    assert.ok(codes({ result: { ...clean, accreditedManual: 290 } }).includes("Y_BVAS_MANUAL_DIFF"));
  });

  it("a filed, unchecked result waits for a second person", () => {
    assert.deepEqual(codes({ result: { ...clean, status: "SUBMITTED" } }), ["Y_AWAITING_CHECK"]);
  });

  it("a corrected result waits for a different verifier", () => {
    assert.deepEqual(codes({ result: { ...clean, status: "CORRECTED" } }), ["Y_AWAITING_SECOND_CHECK"]);
  });

  it("a disputed result is red", () => {
    assert.ok(codes({ result: { ...clean, status: "DISPUTED" } }).includes("R_DISPUTED"));
  });

  it("INEC naming a different winner is red; the same winner with other figures is yellow", () => {
    const flipped = { published: true, votes: { APC: 100, PDP: 150, LP: 40 } };
    const nudged = { published: true, votes: { APC: 149, PDP: 100, LP: 40 } };
    assert.ok(codes({ result: clean, inec: flipped }).includes("R_WINNER_MISMATCH"));
    assert.deepEqual(codes({ result: clean, inec: nudged }), ["Y_FIGURE_DIFF"]);
  });

  it("a tie names no winner, so it is never a winner mismatch", () => {
    assert.equal(winnerOf({ APC: 10, PDP: 10 }), null);
    assert.ok(!codes({ result: clean, inec: { published: true, votes: { APC: 100, PDP: 100, LP: 40 } } }).includes("R_WINNER_MISMATCH"));
  });

  it("differing BVAS figures are yellow, and red when INEC's would mean over-voting", () => {
    assert.ok(codes({ result: clean, inec: { published: true, accredited: 299, votes: clean.votes } }).includes("Y_BVAS_SOURCE_DIFF"));
    const flips = codes({ result: clean, inec: { published: true, accredited: 200, votes: clean.votes } });
    assert.ok(flips.includes("R_OVERVOTE"));
    assert.ok(!flips.includes("Y_BVAS_SOURCE_DIFF"));
  });

  it("a sheet carrying another unit's code is red", () => {
    assert.ok(codes({ result: clean, inec: { published: true, votes: clean.votes, faults: [{ kind: "wrong_paper" }] } }).includes("R_PAPER_FRAUD"));
  });

  it("a missing INEC sheet is yellow only once the deadline has passed", () => {
    assert.ok(!codes({ result: clean, inec: { published: false } }).includes("Y_INEC_MISSING"));
    assert.ok(codes({ result: clean, inec: { published: false }, inecOverdue: true }).includes("Y_INEC_MISSING"));
  });

  it("an absent signature is one thing and 'could not tell' is another", () => {
    assert.ok(codes({ result: clean, certification: { signature: "absent", stamp: "present", officer: "present" } }).includes("Y_SIGNATURE_STAMP"));
    assert.deepEqual(codes({ result: clean, certification: { signature: "unknown", stamp: "present", officer: "present" } }), ["Y_COULD_NOT_TELL"]);
  });

  it("an SOS is red with no result at all, and a late-materials report is yellow", () => {
    assert.deepEqual(codes({ incidents: [{ id: "a", kind: "Something else", sos: true }] }), ["R_SOS"]);
    assert.deepEqual(codes({ incidents: [{ id: "b", kind: "Violence or intimidation", severity: "CRITICAL" }] }), ["R_CRITICAL_SITUATION"]);
    assert.deepEqual(codes({ incidents: [{ id: "c", kind: "Materials arrived late", severity: "SERIOUS" }] }), ["Y_SITUATION"]);
  });

  it("an overdue return is yellow only for a unit with nothing filed", () => {
    assert.deepEqual(codes({ overdue: true }), ["Y_OVERDUE_RETURN"]);
    assert.ok(!codes({ result: clean, overdue: true }).includes("Y_OVERDUE_RETURN"));
  });

  it("a pattern in the digits never attaches to one polling unit", () => {
    const found = codes({ result: clean, findings: [{ severity: "PATTERN", rule: "last-digit", says: "x" }] });
    assert.deepEqual(found, []);
    assert.equal(ITEMS.Y_PATTERN.area, true);
    assert.equal(ITEMS.Y_PATTERN.light, "YELLOW");
  });

  it("two agents' differing figures are yellow, and there is still one result", () => {
    assert.ok(codes({ result: clean, pending: { conflicting: 1 } }).includes("Y_CONFLICTING_SUBMISSION"));
  });
});

describe("the light", () => {
  it("red beats yellow beats green, and grey is only silence", () => {
    assert.equal(lightOf({ red: 1, yellow: 4, hasResult: true, checked: true }), "RED");
    assert.equal(lightOf({ yellow: 1, hasResult: true, checked: true }), "YELLOW");
    assert.equal(lightOf({ hasResult: true, checked: true }), "GREEN");
    assert.equal(lightOf({}), "GREY");
  });

  it("no result with an open SOS is red, not grey", () => {
    assert.equal(lightOf({ red: 1, hasResult: false }), "RED");
  });

  it("an unchecked result is never green", () => {
    assert.equal(lightOf({ hasResult: true, checked: false }), "YELLOW");
  });

  it("an area takes its worst light, and is never green for having no data", () => {
    assert.equal(rollUp({ red: 1, yellow: 300, green: 6000, grey: 2000 }), "RED");
    assert.equal(rollUp({ yellow: 1, green: 6000 }), "YELLOW");
    assert.equal(rollUp({ green: 1, grey: 8000 }), "GREEN");
    assert.equal(rollUp({ grey: 8000 }), "GREY");
    assert.equal(rollUp({}), "GREY");
  });

  it("an item on the area itself colours it", () => {
    assert.equal(rollUp({ green: 10, areaYellow: 1 }), "YELLOW");
    assert.equal(rollUp({ green: 10, areaRed: 1 }), "RED");
  });

  it("every light has a label and an icon, so colour is never the only clue", () => {
    for (const light of Object.values(LIGHTS)) {
      assert.ok(light.label && light.icon);
    }
  });
});

describe("BVAS", () => {
  it("headroom is accredited less every ballot out of the box", () => {
    assert.equal(bvasOf(clean).headroom, 5);
    assert.equal(bvasOf({ ...clean, accredited: 290 }).overvote, true);
  });

  it("no BVAS figure is no headroom, never zero", () => {
    const none = bvasOf({ ...clean, accredited: null });
    assert.equal(none.accredited, null);
    assert.equal(none.headroom, null);
    assert.equal(none.overvote, false);
  });
});

describe("who may resolve", () => {
  const item = (code, extra = {}) => ({ code, status: "OPEN", areaCode: "19/01/01/001", ...extra });
  const everywhere = () => true;
  const as = (...held) => (capability) => held.includes(capability);

  it("nobody resolves an item they raised or a result they filed", () => {
    const all = as("items:resolve-red", "items:resolve-yellow", "results:dispute", "items:close-dispute");
    assert.equal(mayResolve({ item: item("R_OVERVOTE", { raisedBy: "u1" }), resolution: "CONFIRMED_GENUINE_NO_ISSUE", userId: "u1", holds: all, covers: everywhere }).ok, false);
    assert.equal(mayResolve({ item: item("R_OVERVOTE", { filedBy: "u1" }), resolution: "CONFIRMED_GENUINE_NO_ISSUE", userId: "u1", holds: all, covers: everywhere }).ok, false);
    assert.equal(mayResolve({ item: item("R_OVERVOTE", { filedBy: "u2" }), resolution: "CONFIRMED_GENUINE_NO_ISSUE", userId: "u1", holds: all, covers: everywhere }).ok, true);
  });

  it("an observer resolves yellow and not red", () => {
    const observer = as("items:resolve-yellow");
    assert.equal(mayResolve({ item: item("Y_FIGURE_DIFF"), resolution: "CLERICAL_ERROR_CORRECTED", userId: "u1", holds: observer, covers: everywhere }).ok, true);
    assert.equal(mayResolve({ item: item("R_OVERVOTE"), resolution: "CLERICAL_ERROR_CORRECTED", userId: "u1", holds: observer, covers: everywhere }).ok, false);
  });

  it("field operations resolve field items and nothing else", () => {
    const fieldOps = as("items:resolve-field");
    assert.equal(mayResolve({ item: item("Y_FIELD_CONFIRM"), resolution: "FIELD_CONFIRMED", userId: "u1", holds: fieldOps, covers: everywhere }).ok, true);
    assert.equal(mayResolve({ item: item("Y_FIGURE_DIFF"), resolution: "FIELD_CONFIRMED", userId: "u1", holds: fieldOps, covers: everywhere }).ok, false);
  });

  it("nothing is resolved off the asker's ground", () => {
    const all = as("items:resolve-red", "items:resolve-yellow");
    assert.equal(mayResolve({ item: item("Y_FIGURE_DIFF"), resolution: "DUPLICATE", userId: "u1", holds: all, covers: () => false }).ok, false);
  });

  it("only the Director or the Super Admin closes a disputed result", () => {
    const zoneLead = as("items:resolve-red", "items:resolve-yellow", "results:dispute");
    const director = as("items:resolve-red", "items:resolve-yellow", "results:dispute", "items:close-dispute");
    assert.equal(mayResolve({ item: item("R_DISPUTED"), resolution: "CONFIRMED_GENUINE_NO_ISSUE", userId: "u1", holds: zoneLead, covers: everywhere }).ok, false);
    assert.equal(mayResolve({ item: item("R_DISPUTED"), resolution: "CONFIRMED_GENUINE_NO_ISSUE", userId: "u1", holds: director, covers: everywhere }).ok, true);
  });

  it("an item waiting on an event is not closed by hand", () => {
    const all = as("items:resolve-red", "items:resolve-yellow");
    assert.equal(mayResolve({ item: item("Y_AWAITING_CHECK"), resolution: "DUPLICATE", userId: "u1", holds: all, covers: everywhere }).ok, false);
    assert.equal(mayResolve({ item: item("R_SOS"), resolution: "SITUATION_RESOLVED", userId: "u1", holds: all, covers: everywhere }).ok, false);
  });

  it("the call floor can be raised and never lowered below 25%", () => {
    assert.equal(readSettings({ callFloorPercent: 10 }).callFloorPercent, 25);
    assert.equal(readSettings({ callFloorPercent: 40 }).callFloorPercent, 40);
    assert.ok(RESOLUTIONS.CONFIRMED_MALPRACTICE_ESCALATED.malpractice);
  });
});
