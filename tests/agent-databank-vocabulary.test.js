import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DATABANK_CATEGORY,
  DATABANK_SEVERITY,
  DATABANK_STAGE,
  SITUATION_GROUPS,
  SOS_CATEGORY,
  UPDATE_STEPS,
  URGENCY,
} from "../lib/agent-day.js";

/**
 * The two vocabularies, pinned together.
 *
 * Data Bank's Situation dashboard sorts on its own categories and stages. A
 * button this product adds without a line in these tables would reach that
 * board as "Other" at no stage — filed, counted, and impossible to dispatch
 * against. That is exactly the failure these tests exist to catch, because
 * nothing else does: the relay succeeds, and the report is simply wrong.
 */

test("every update step has a stage on Data Bank's board", () => {
  for (const step of UPDATE_STEPS) {
    assert.ok(DATABANK_STAGE[step.type], `no stage for the "${step.label}" step`);
  }
});

test("every situation an agent can choose has a category", () => {
  for (const group of SITUATION_GROUPS) {
    for (const kind of group.kinds) {
      assert.ok(DATABANK_CATEGORY[kind.id], `no category for "${kind.label}"`);
    }
  }
});

test("every urgency has a severity, and an SOS has a category", () => {
  for (const level of URGENCY) {
    assert.ok(DATABANK_SEVERITY[level.id], `no severity for "${level.label}"`);
  }
  assert.ok(SOS_CATEGORY);
});

test("the mappings name only things Data Bank knows", () => {
  /* Kept as literals rather than imported across products: these two lists are
     Data Bank's published vocabulary, and a copy that drifts is the whole
     point of the test above it. */
  const STAGES = [
    "EN_ROUTE", "ARRIVED", "SETUP", "ACCREDITATION", "VOTING", "POLLS_CLOSED",
    "SORTING", "COUNTED", "SHEET_SIGNED", "RESULT_FILED", "COLLATION", "STOOD_DOWN",
  ];
  const CATEGORIES = [
    "VIOLENCE", "BALLOT_SNATCHING", "VOTE_BUYING", "BVAS_FAILURE", "LATE_START",
    "MATERIALS", "OBSTRUCTION", "OVERVOTING", "COLLATION", "LOGISTICS", "OTHER",
  ];
  const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

  for (const stage of Object.values(DATABANK_STAGE)) assert.ok(STAGES.includes(stage), stage);
  for (const category of Object.values(DATABANK_CATEGORY)) assert.ok(CATEGORIES.includes(category), category);
  for (const severity of Object.values(DATABANK_SEVERITY)) assert.ok(SEVERITIES.includes(severity), severity);
  assert.ok(CATEGORIES.includes(SOS_CATEGORY));
});
