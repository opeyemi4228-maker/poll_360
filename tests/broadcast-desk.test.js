import assert from "node:assert/strict";
import { test } from "node:test";

import {
  correctedBy,
  correctionOf,
  embargoAtWAT,
  fillTemplate,
  holdOf,
  isEmbargoed,
  isPublicPage,
  mayCorrect,
  nextStep,
  TEMPLATES,
  untilWords,
} from "../lib/broadcast.js";

/**
 * The desk's rules for corrections, embargoes, holds and the next step.
 *
 * Each of these decides whether something reaches the public, or when — an
 * embargo that lifts an hour early because a laptop was on London time is a
 * broken embargo — so they are pinned here rather than trusted to a screen.
 */

const MIN = 60_000;
/* 20:30 in Lagos on election day, 2027-02-20 (19:30 UTC). */
const NIGHT = Date.UTC(2027, 1, 20, 19, 30);

const post = (values = {}) => ({ id: "p1", kind: "SOCIAL", state: "ON_AIR", title: "Kano: APC leads", payload: {}, ...values });

test("an embargo time is read on the Lagos clock, whatever the laptop's", () => {
  /* 21:00 WAT is 20:00 UTC. */
  assert.equal(embargoAtWAT("21:00", NIGHT), new Date(Date.UTC(2027, 1, 20, 20, 0)).toISOString());
  /* A time already past tonight means tomorrow, not an embargo that has already lifted. */
  assert.equal(embargoAtWAT("20:00", NIGHT), new Date(Date.UTC(2027, 1, 21, 19, 0)).toISOString());
  /* Just after midnight in Lagos is still the evening before in UTC. */
  assert.equal(embargoAtWAT("00:30", NIGHT), new Date(Date.UTC(2027, 1, 20, 23, 30)).toISOString());
  assert.equal(embargoAtWAT("25:00", NIGHT), null);
  assert.equal(embargoAtWAT("nonsense", NIGHT), null);
});

test("an embargoed item is held until its minute and not after", () => {
  const until = new Date(NIGHT + 30 * MIN).toISOString();
  const item = post({ state: "CLEARED", payload: { embargoUntil: until } });
  assert.equal(isEmbargoed(item, NIGHT), true);
  assert.equal(isEmbargoed(item, NIGHT + 30 * MIN), false);
  assert.equal(isEmbargoed(post({ state: "CLEARED" }), NIGHT), false);
  assert.equal(untilWords(until, NIGHT), "in 30 min");
  assert.equal(untilWords(new Date(NIGHT + 125 * MIN), NIGHT), "in 2 h 5 min");
});

test("the next step never offers air to an embargoed item", () => {
  const may = { draft: true, clear: true, air: true };
  const until = new Date(NIGHT + 10 * MIN).toISOString();
  const cleared = post({ state: "CLEARED", payload: { embargoUntil: until } });
  assert.equal(nextStep(cleared, { may, now: NIGHT }).step, "embargoed");
  assert.equal(nextStep(cleared, { may, now: NIGHT + 11 * MIN }).step, "air");
  /* Approving it is allowed; the button just no longer promises it goes live. */
  const waiting = post({ state: "REVIEW", payload: { embargoUntil: until, sendOnClear: true } });
  assert.deepEqual(nextStep(waiting, { may, now: NIGHT }), { step: "approve", label: "Approve" });
});

test("the next step keeps the two-person rule and the grants", () => {
  const review = post({ state: "REVIEW", createdBy: "me" });
  assert.equal(nextStep(review, { may: { clear: true, air: true }, mine: true }).step, "wait");
  assert.equal(nextStep(review, { may: { clear: true, air: true }, mine: false }).label, "Approve & go live");
  assert.equal(nextStep(review, { may: { draft: true }, mine: false }), null);
  assert.equal(nextStep(post({ state: "ON_AIR" }), { may: { air: true }, failedOn: ["x"] }).step, "resend");
  assert.equal(nextStep(post({ state: "DRAFT" }), { may: { draft: true } }).step, "submit");
});

test("a correction points at the update it corrects, and only out updates can be corrected", () => {
  assert.equal(mayCorrect(post()), true);
  assert.equal(mayCorrect(post({ state: "REVIEW" })), false);
  assert.equal(mayCorrect(post({ kind: "TICKER" })), false);
  /* A withdrawn update cannot be corrected again; a corrected one can. */
  assert.equal(mayCorrect(post({ state: "OFF_AIR", payload: { correctedBy: { id: "c", mode: "retract" } } })), false);
  assert.equal(mayCorrect(post({ payload: { correctedBy: { id: "c", mode: "correct" } } })), true);
  /* A correction is not itself corrected through this door. */
  assert.equal(mayCorrect(post({ payload: { corrects: { id: "p0", mode: "correct" } } })), false);

  assert.equal(correctionOf(post({ payload: { corrects: { id: "p0", mode: "bogus" } } })), null);
  assert.equal(correctionOf(post({ payload: { corrects: { id: "p0", mode: "retract" } } })).id, "p0");
  assert.equal(correctedBy(post()), null);
});

test("a withdrawn update's own address still answers, but only with a retraction", () => {
  assert.equal(isPublicPage(post()), true);
  assert.equal(isPublicPage(post({ state: "OFF_AIR" })), false);
  assert.equal(isPublicPage(post({ state: "OFF_AIR", payload: { correctedBy: { id: "c", mode: "retract" } } })), true);
  assert.equal(isPublicPage(post({ state: "OFF_AIR", kind: "TICKER", payload: { correctedBy: { id: "c", mode: "retract" } } })), false);
});

test("a hold runs out by itself", () => {
  const item = post({ state: "REVIEW", payload: { hold: { by: "u1", name: "Ada", until: new Date(NIGHT + 4 * MIN).toISOString() } } });
  assert.equal(holdOf(item, NIGHT).name, "Ada");
  assert.equal(holdOf(item, NIGHT + 5 * MIN), null);
});

test("every template names its place and asserts no figure of its own", () => {
  for (const template of TEMPLATES) {
    assert.ok(template.body.includes("{place}"), template.id);
    assert.doesNotMatch(template.body, /\d+%/, template.id);
    assert.ok(fillTemplate(template, "Kano State").includes("Kano State"));
  }
});
