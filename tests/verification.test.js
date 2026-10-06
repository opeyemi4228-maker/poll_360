import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { alarmRows, sheetsAgainstAnnounced, updatesOf, verificationOf, within } from "../lib/verification.js";

/**
 * Verification: three records held together.
 *
 * The screen paints a place green or red and a room acts on the colour, so
 * the two things pinned here are the two ways the colour can lie: calling a
 * place agreed when nothing was compared, and calling it a disagreement when
 * the two totals were never over the same polling units.
 */

const place = (over = {}) => ({
  key: "01",
  name: "Abia",
  stateCode: "ABI",
  units: 10,
  sheets: 10,
  read: 10,
  sound: 10,
  doubt: 0,
  irregular: 0,
  replaced: 0,
  parts: { picture: 0, overvote: 0, paper: 0, missing: 0, late: 0, gone: 0 },
  inec: { votes: { APC: 500, PDP: 300 }, valid: 800, accredited: 900, rejected: 10, registered: 2000 },
  ours: { returns: 0, votes: {} },
  shared: { units: 0, agree: 0, differ: 0, unsure: 0, noSheet: 0, inec: {}, ours: {} },
  announced: null,
  ...over,
});

const account = (children, flags = []) => ({
  under: "",
  level: "state",
  crumbs: [{ key: "", name: "Nigeria" }],
  election: { id: 1, name: "Test" },
  children,
  flags,
  flagged: flags.length,
  whole: {
    units: 0, sheets: 0, read: 0, sound: 0, doubt: 0, irregular: 0, replaced: 0,
    parts: { picture: 0, overvote: 0, paper: 0, missing: 0, late: 0, gone: 0 },
    inec: { votes: {} }, ours: { returns: 0, votes: {} },
    shared: {
      units: 0,
      agree: children.reduce((sum, child) => sum + child.shared.agree, 0),
      differ: children.reduce((sum, child) => sum + child.shared.differ, 0),
      unsure: 0, noSheet: 0, inec: {}, ours: {},
    },
    announced: { places: 0, votes: {} },
  },
});

describe("which places agree", () => {
  it("never calls a place agreed when nothing was compared there", () => {
    const picture = verificationOf({ account: account([place()]) });
    assert.equal(picture.places[0].verdict, "waiting");
    assert.equal(picture.state, "waiting");
  });

  it("is green where our agents and INEC's sheets agree on shared units", () => {
    const picture = verificationOf({ account: account([place({ shared: { units: 4, agree: 4, differ: 0, unsure: 0, noSheet: 0 } })]) });
    assert.equal(picture.places[0].verdict, "agrees");
    assert.equal(picture.totals.agrees, 1);
  });

  it("is red if a single shared unit differs, however many agree", () => {
    const picture = verificationOf({ account: account([place({ shared: { units: 400, agree: 399, differ: 1, unsure: 0, noSheet: 0 } })]) });
    assert.equal(picture.places[0].verdict, "differs");
    assert.equal(picture.state, "differs");
    assert.equal(picture.counts.mismatch, 1);
  });

  it("a finding with nothing to compare is amber, not green and not red", () => {
    const picture = verificationOf({ account: account([place({ parts: { picture: 2, overvote: 0, paper: 0, missing: 0, late: 0, gone: 0 } })]) });
    assert.equal(picture.places[0].verdict, "look");
    assert.equal(picture.places[0].counts.fraud, 2);
  });

  it("does not call late, absent or empty sheets findings, and does not colour a place for them", () => {
    /* The 2023 presidential election as gathered: seven sheets in ten went up
       late. Counted as irregularities that was a headline of 125,963 and a
       country painted one colour. */
    const picture = verificationOf({
      account: account([place({ units: 1000, sheets: 950, parts: { picture: 0, overvote: 0, paper: 0, missing: 50, late: 700, gone: 12 } })]),
    });
    assert.equal(picture.places[0].verdict, "waiting");
    assert.equal(picture.places[0].counts.total, 0);
    assert.equal(picture.places[0].counts.fraud, 0);
    assert.deepEqual(picture.places[0].counts.published, { units: 1000, sheets: 950, missing: 50, late: 700, gone: 12 });
    assert.equal(picture.state, "waiting");
  });

  it("draws the states from our returns alone when INEC's sheets are not gathered", () => {
    const divergence = {
      ready: true,
      flags: [{ id: "STATE:01:winner-differs", severity: "FLIPPED", level: "STATE", key: "01", says: "x", why: "y" }],
      checked: [{ level: "STATE", key: "01", mode: "COMPLETE" }, { level: "STATE", key: "02", mode: "COMPLETE" }, { level: "STATE", key: "03", mode: "PARTIAL" }],
    };
    const picture = verificationOf({ account: { none: true, why: "not-gathered" }, divergence });
    const by = Object.fromEntries(picture.places.map((item) => [item.key, item.verdict]));
    assert.equal(picture.places.length, 37);
    assert.equal(by["01"], "differs");
    assert.equal(by["02"], "agrees");
    /* Partly covered: not enough to say either way. */
    assert.equal(by["03"], "waiting");
  });
});

describe("INEC's sheets against INEC's announcement", () => {
  it("is not judged until every sheet in the place is read", () => {
    const judged = sheetsAgainstAnnounced(place({ sound: 9, announced: { votes: { APC: 100, PDP: 900 } } }));
    assert.equal(judged.status, "waiting");
  });

  it("finds a different winner when both sides cover the same ground", () => {
    const judged = sheetsAgainstAnnounced(place({ announced: { votes: { APC: 300, PDP: 500 } } }));
    assert.equal(judged.status, "differs");
    assert.equal(judged.flipped, true);
  });

  it("lets a misread digit pass", () => {
    const judged = sheetsAgainstAnnounced(place({ announced: { votes: { APC: 503, PDP: 298 } } }));
    assert.equal(judged.status, "agrees");
  });
});

describe("the updates", () => {
  const integrity = {
    flags: [
      { id: "01/01/01/001:ballots-over-accredited", rule: "ballots-over-accredited", severity: "IMPOSSIBLE", unitCode: "01/01/01/001", says: "600 ballots from 500", why: "w" },
      { id: "02/01/01/001:turnout-outlier", rule: "turnout-outlier", severity: "OUTLIER", unitCode: "02/01/01/001", says: "outlier", why: "w" },
    ],
    work: [{ unitCode: "01/01/01/001", action: "HOLD" }],
  };

  it("sorts each finding into its family and puts the loudest first", () => {
    const updates = updatesOf({ integrity });
    assert.deepEqual(updates.map((update) => update.kind), ["rigging", "unusual"]);
    assert.equal(updates[0].action, "HOLD");
  });

  it("keeps to the place that is open", () => {
    assert.equal(updatesOf({ integrity, under: "02" }).length, 1);
    assert.ok(within("02/01", "02") && !within("021", "02"));
  });

  it("gives the same id on every refresh, so the alarm sounds once", () => {
    const first = updatesOf({ integrity }).map((update) => update.id);
    const again = updatesOf({ integrity }).map((update) => update.id);
    assert.deepEqual(first, again);
    assert.equal(new Set(first).size, first.length);
  });

  it("does not sound the alarm for what is only worth reading", () => {
    const rows = alarmRows(updatesOf({ integrity }));
    assert.deepEqual(rows, [{ id: "agents:01/01/01/001:ballots-over-accredited", level: "SERIOUS" }]);
  });
});
