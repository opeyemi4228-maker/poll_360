import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { unitCards } from "../lib/unit-card.js";

/**
 * Polling unit intelligence, pinned.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  The card is the screen somebody opens with a booth code they were given
 *  over the phone. Two things about it are worth a test more than any figure
 *  on it:
 *
 *    IT JOINS ON THE CANONICAL CODE. A second spelling of a unit code is a
 *    second booth that never joins to the first, and the symptom is a card
 *    that shows the agent and not their return — see lib/units.js.
 *
 *    A BLANK IS A FINDING, AND THERE ARE THREE DIFFERENT BLANKS. Nobody sent,
 *    somebody sent who has not filed, and somebody who filed that nobody
 *    checked. A card that collapsed them into "no data" would hide the only
 *    useful thing about the booth.
 * ══════════════════════════════════════════════════════════════════════════
 */

const NOW = Date.UTC(2027, 1, 20, 20, 0, 0);
const ago = (minutes) => new Date(NOW - minutes * 60 * 1000);

const CODE = "01/01/01/001";

const ret = (over = {}) => ({
  unitCode: CODE,
  stateCode: "ABI",
  race: "PRESIDENTIAL",
  registered: 500,
  accredited: 300,
  rejected: 4,
  votes: { APC: 150, PDP: 146 },
  status: "SUBMITTED",
  source: "APP",
  sheetMatch: null,
  submittedAt: ago(60),
  verifiedAt: null,
  ...over,
});

const person = (over = {}) => ({
  id: "c1",
  name: "A Coordinator",
  unitCode: CODE,
  kind: "coordinator",
  lastSeen: ago(600),
  lat: null,
  lon: null,
  derived: true,
  band: "unknown",
  filed: true,
  ...over,
});

describe("what a card is built from", () => {
  it("names the place, not only the code", () => {
    const cards = unitCards({ rows: [ret()] });
    const card = cards[CODE];

    assert.equal(card.state, "Abia");
    assert.equal(card.unitNo, "001");
    assert.equal(card.wardCode, "01/01/01");
    /* The local government by name. "01/01" is not a place anybody in a room
       recognises. */
    assert.ok(card.lga && card.lga.length > 1);
  });

  it("joins the agent, the return and the reports onto one booth", () => {
    const cards = unitCards({
      rows: [ret()],
      coordinators: [person()],
      incidents: [{ id: "i1", unitCode: CODE, kind: "Card reader failure", severity: "SERIOUS", createdAt: ago(120) }],
    });

    const card = cards[CODE];
    assert.equal(card.agent.name, "A Coordinator");
    assert.equal(card.result.status, "SUBMITTED");
    assert.equal(card.incidents.length, 1);
  });

  it("gives a booth with an agent and no return a card that says exactly that", () => {
    const card = unitCards({ coordinators: [person({ filed: false })] })[CODE];
    assert.equal(card.result, null);
    assert.ok(card.agent);
    assert.equal(card.incidents.length, 0);
  });

  it("gives a booth with a return and nobody assigned a card that says that", () => {
    const card = unitCards({ rows: [ret()] })[CODE];
    assert.equal(card.agent, null);
    assert.ok(card.result);
  });
});

describe("the return on the card", () => {
  it("carries where it is on the pipeline, from the pipeline's own function", () => {
    const card = unitCards({ rows: [ret()] })[CODE];
    assert.equal(card.result.stage, "received");
    assert.equal(card.result.next, "extracted");
  });

  it("keeps the three states of a sheet apart", () => {
    const none = unitCards({ rows: [ret()] })[CODE];
    const seen = unitCards({ rows: [ret({ sheetMatch: { compared: false } })] })[CODE];
    const held = unitCards({ rows: [ret({ sheetMatch: { compared: true, agrees: true } })] })[CODE];

    assert.equal(none.result.sheet, null);
    assert.equal(seen.result.sheet.compared, false);
    assert.equal(held.result.sheet.compared, true);
  });

  it("keeps a box nobody captured as null rather than as a zero", () => {
    const card = unitCards({ rows: [ret({ usedBallots: 300 })] })[CODE];
    assert.equal(card.result.boxes.usedBallots, 300);
    assert.equal(card.result.boxes.spoiled, null);
  });

  it("carries the screening findings in the words the screen prints", () => {
    /* More accredited than the register holds. */
    const card = unitCards({ rows: [ret({ accredited: 900 })] })[CODE];
    const flag = card.result.flags.find((row) => row.severity === "IMPOSSIBLE");

    assert.ok(flag);
    assert.ok(flag.says && flag.why);
    /* It states the arithmetic and never an accusation. */
    assert.ok(!/fraud|rigg|falsif/i.test(`${flag.says} ${flag.why}`));
  });
});

describe("the booth's own evening", () => {
  it("puts everything in the order it happened, oldest first", () => {
    const card = unitCards({
      rows: [ret({ status: "VERIFIED", submittedAt: ago(60), verifiedAt: ago(10) })],
      coordinators: [person({ lastSeen: ago(600), seenAt: ago(400), derived: false, lat: 7, lon: 5 })],
      incidents: [{ id: "i1", unitCode: CODE, kind: "Materials late", severity: "INFO", createdAt: ago(300) }],
    })[CODE];

    assert.deepEqual(
      card.timeline.map((event) => event.what),
      ["Agent signed in", "Position received", "Materials late", "Return filed", "Verified by a desk"]
    );

    const times = card.timeline.map((event) => new Date(event.at).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });

  it("reads the reports themselves newest first, the way a feed is read", () => {
    const card = unitCards({
      incidents: [
        { id: "old", unitCode: CODE, kind: "A", severity: "INFO", createdAt: ago(300) },
        { id: "new", unitCode: CODE, kind: "B", severity: "INFO", createdAt: ago(10) },
      ],
    })[CODE];

    assert.deepEqual(card.incidents.map((row) => row.id), ["new", "old"]);
  });

  it("counts the photographs on a report without carrying them", () => {
    const card = unitCards({
      incidents: [{ id: "i1", unitCode: CODE, kind: "A", severity: "INFO", createdAt: ago(10) }],
      photos: { i1: [{ id: "m1" }, { id: "m2" }] },
    })[CODE];

    assert.equal(card.incidents[0].photos, 2);
  });

  it("leaves a booth nothing happened at with an empty evening rather than throwing", () => {
    const card = unitCards({ coordinators: [person({ lastSeen: null, filed: false })] })[CODE];
    assert.deepEqual(card.timeline, []);
  });
});

describe("what it refuses to do", () => {
  it("ignores a row with no unit code at all", () => {
    const cards = unitCards({
      rows: [ret({ unitCode: null })],
      incidents: [{ id: "i1", unitCode: "", kind: "A", severity: "INFO", createdAt: ago(5) }],
    });
    assert.deepEqual(Object.keys(cards), []);
  });

  it("does not invent a place for a code that names no state we know", () => {
    const card = unitCards({ rows: [ret({ unitCode: "99/01/01/001" })] })["99/01/01/001"];
    assert.equal(card.state, null);
    assert.equal(card.lga, null);
    /* The return itself is still there: the figures are real even where the
       code is not one we can place. */
    assert.ok(card.result);
  });
});
