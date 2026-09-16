import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT360_STEPS,
  SITUATION_GROUPS,
  SOS_KIND,
  UPDATE_STEPS,
  URGENCY,
  situationKind,
  updateProgress,
  updateStep,
  urgency,
} from "../lib/agent-day.js";

/**
 * The words an agent's three buttons are built from.
 *
 * The form offers these lists, the server action checks against them and the
 * situation room reads what they store. A duplicate id would let one choice
 * file as another; an unknown urgency would reach a room that sorts by it.
 */

describe("updates", () => {
  it("names every step once", () => {
    const types = UPDATE_STEPS.map((step) => step.type);
    assert.equal(new Set(types).size, types.length);
    for (const step of UPDATE_STEPS) assert.ok(step.label, `${step.type} has no label`);
  });

  it("only sends Agent360 the steps it knows", () => {
    /* Materials arriving is this product's own step. Agent360 refuses types it
       has not heard of, and a refusal there must not look like a failed update. */
    assert.equal(AGENT360_STEPS.has("materials_arrived"), false);
    assert.equal(AGENT360_STEPS.has("polls_open"), true);
  });

  it("reads progress from what was sent, newest first", () => {
    const at = (minute) => new Date(Date.UTC(2027, 1, 18, 7, minute));
    const progress = updateProgress([
      { step: "polls_open", at: at(30) },
      { step: "arrival", at: at(5) },
      { step: "arrival", at: at(2) },
    ]);

    assert.equal(progress.done, 2);
    assert.equal(progress.total, UPDATE_STEPS.length);
    assert.equal(progress.latest.label, updateStep("polls_open").label);
    /* The skipped step is still owed, even though a later one was sent. */
    assert.equal(progress.next.type, "materials_arrived");
  });

  it("starts at the beginning with nothing sent", () => {
    const progress = updateProgress([]);
    assert.equal(progress.done, 0);
    assert.equal(progress.latest, null);
    assert.equal(progress.next.type, "arrival");
  });

  it("ignores a step it does not recognise", () => {
    const progress = updateProgress([{ step: "retired_step", at: new Date() }]);
    assert.equal(progress.done, 0);
    assert.equal(progress.latest, null);
  });
});

describe("situations", () => {
  const kinds = SITUATION_GROUPS.flatMap((group) => group.kinds);

  it("gives every kind a unique id and a unique name", () => {
    assert.equal(new Set(kinds.map((kind) => kind.id)).size, kinds.length);
    assert.equal(new Set(kinds.map((kind) => kind.label)).size, kinds.length);
    assert.ok(!kinds.some((kind) => kind.label === SOS_KIND), "an ordinary kind is named like an SOS");
  });

  it("defaults every kind to an urgency the room understands", () => {
    for (const kind of kinds) assert.ok(urgency(kind.urgency), `${kind.id} has urgency ${kind.urgency}`);
    assert.deepEqual(URGENCY.map((level) => level.id), ["CRITICAL", "SERIOUS", "INFO"]);
  });

  it("finds a kind by id and nothing else", () => {
    assert.equal(situationKind("card_reader").label, "Card reader failure");
    assert.equal(situationKind("Card reader failure"), null);
    assert.equal(situationKind(""), null);
    assert.equal(urgency("URGENT"), null);
  });
});
