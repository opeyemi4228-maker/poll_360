import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { campaign } from "../lib/campaign.js";
import { pathKey } from "../lib/coverage.js";

/**
 * The plan is the thing every dashboard writes into, so the properties that
 * matter are about what happens when several screens touch it: adding twice
 * must not undo, adding a place already covered must not create a mark that
 * does nothing, and dropping a state must not take its neighbour with it
 * because their codes share letters.
 */

const key = (...parts) => pathKey(parts);

beforeEach(() => campaign.clear());

test("a place added from a dashboard carries the reason with it", () => {
  campaign.add([["KAN"]], "3.1m registered voters did not vote in 2023", "Behaviour");

  const reason = campaign.reasonFor(key("KAN"));
  assert.equal(reason.why, "3.1m registered voters did not vote in 2023");
  assert.equal(reason.from, "Behaviour");
  assert.ok(reason.at > 0, "and when it was added");
});

test("adding is idempotent, because a button gets pressed twice", () => {
  campaign.add([["KAN"], ["LAG"]], "big register", "Voters");
  campaign.add([["KAN"], ["LAG"]], "big register", "Voters");

  assert.equal(campaign.snapshot().marks.size, 2, "not four, and not zero");
  assert.equal(campaign.statusOf(key("KAN")), "chosen");
});

test("adding a place already covered by its state writes no useless mark", () => {
  campaign.add([["KAN"]], "whole state", "Planning");
  campaign.add([["KAN", "Bagwai"]], "close last time", "Parties");

  /* The local government is already covered, so the plan does not grow a mark
     that changes nothing — but the reason is kept, because the reason is the
     argument. */
  assert.equal(campaign.snapshot().marks.size, 1);
  assert.equal(campaign.statusOf(key("KAN", "Bagwai")), "covered");
  assert.equal(campaign.reasonFor(key("KAN", "Bagwai")).why, "close last time");
});

test("tapping a place on the map flips it, and flipping back leaves nothing", () => {
  campaign.flip(["KAN"]);
  assert.equal(campaign.statusOf(key("KAN")), "chosen");
  assert.ok(campaign.reasonFor(key("KAN")), "even a tap records why");

  campaign.flip(["KAN"]);
  assert.equal(campaign.statusOf(key("KAN")), "none");
  assert.equal(campaign.reasonFor(key("KAN")), null, "and the reason goes with it");
});

test("dropping a state does not touch a state whose code shares its letters", () => {
  /* Path keys are joined on a separator precisely so that "KAN" is not an
     ancestor of "KANO". A prefix test would silently empty the wrong state. */
  campaign.add([["KAN"], ["KANO"], ["KAN", "Bagwai"]], "test", "test");
  campaign.drop(["KAN"]);

  assert.equal(campaign.statusOf(key("KANO")), "chosen", "the neighbour survives");
  assert.equal(campaign.statusOf(key("KAN")), "none");
  assert.equal(campaign.reasonFor(key("KAN", "Bagwai")), null, "what was inside it went too");
  assert.ok(campaign.reasonFor(key("KANO")), "and its reason did not");
});

test("every screen writes into one plan", () => {
  campaign.add([["KAN"]], "stay-at-home pool", "Behaviour");
  campaign.add([["LAG"]], "within three points", "Parties");
  campaign.add([["RIV"]], "worst crowding", "Clusters");

  const { marks, reasons } = campaign.snapshot();
  assert.equal(marks.size, 3);
  assert.deepEqual(
    [...new Set(Object.values(reasons).map((reason) => reason.from))].sort(),
    ["Behaviour", "Clusters", "Parties"]
  );
});

test("subscribers are told when the plan changes", () => {
  let told = 0;
  const stop = campaign.subscribe(() => (told += 1));

  campaign.add([["KAN"]], "why", "test");
  campaign.flip(["LAG"]);
  campaign.drop(["KAN"]);

  stop();
  campaign.add([["OYO"]], "after unsubscribing", "test");

  assert.equal(told, 3, "three changes while listening, none after");
});

test("the snapshot keeps its identity until something changes", () => {
  /* useSyncExternalStore re-renders on identity, so a snapshot that is a new
     object every call is an infinite render loop. */
  const first = campaign.snapshot();
  assert.equal(campaign.snapshot(), first);

  campaign.add([["KAN"]], "why", "test");
  assert.notEqual(campaign.snapshot(), first);
});
