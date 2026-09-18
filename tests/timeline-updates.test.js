import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nightTimeline } from "../lib/timeline.js";

/**
 * The agents' updates, on the room's clock.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT WAS WRONG, AND WHY IT DID NOT LOOK WRONG
 *
 *  Every agent in the country was pressing "Voting has started" at their
 *  booth, and `unit_updates` was recording all of it. Nothing read that table
 *  from the room's side, so the timeline inferred "Polling under way" from the
 *  first *incident* — the first thing to go wrong.
 *
 *  On a bad morning that is roughly right and nobody notices. On a good one it
 *  is hours late, and on a clean morning with no incidents at all the phase
 *  that says polling started stayed blank through an entire day of successful
 *  voting. The screen did not look broken. It looked like a country that had
 *  not opened its polls.
 *
 *  These tests pin the fix in both directions: an update times the phase when
 *  there is one, and the old inference still stands when there is not.
 * ══════════════════════════════════════════════════════════════════════════
 */

const NOW = Date.UTC(2027, 1, 20, 20, 0, 0);
const ago = (minutes) => new Date(NOW - minutes * 60 * 1000);

const update = (step, minutes, extra = {}) => ({
  unitCode: "25/01/02/001",
  step,
  at: ago(minutes),
  reporter: "Amina Bello",
  ...extra,
});

const ret = ({ minutes = 90, unitCode = "25/01/02/001" } = {}) => ({
  unitCode,
  submittedAt: ago(minutes),
  verifiedAt: null,
  status: "COUNTED",
});

describe("a phase timed from what an agent actually said", () => {
  it("times polling from the agent who reported voting, not from the first thing that went wrong", () => {
    const line = nightTimeline({
      updates: [update("polls_open", 600)],
      incidents: [{ id: "i1", unitCode: "25/01/02/001", severity: "INFO", createdAt: ago(120) }],
      now: NOW,
    });

    const opened = line.phases.find((phase) => phase.id === "opened");
    assert.equal(opened.at.getTime(), ago(600).getTime());
  });

  it("still falls back to the first report where no agent sent an update", () => {
    const line = nightTimeline({
      incidents: [{ id: "i1", unitCode: "25/01/02/001", severity: "INFO", createdAt: ago(120) }],
      now: NOW,
    });

    const opened = line.phases.find((phase) => phase.id === "opened");
    assert.equal(opened.at.getTime(), ago(120).getTime());
  });

  it("takes whichever actually happened first when it has both", () => {
    /* A booth that filed a report before anyone pressed anything. The honest
       answer is the earlier observation, not a preference for one source. */
    const line = nightTimeline({
      updates: [update("polls_open", 100)],
      incidents: [{ id: "i1", unitCode: "25/01/02/001", severity: "INFO", createdAt: ago(300) }],
      now: NOW,
    });

    assert.equal(
      line.phases.find((phase) => phase.id === "opened").at.getTime(),
      ago(300).getTime()
    );
  });

  it("times arrival and counting from their own steps", () => {
    const line = nightTimeline({
      updates: [update("arrival", 700), update("counting_start", 200)],
      rows: [ret({ minutes: 90 })],
      now: NOW,
    });

    const at = Object.fromEntries(line.phases.map((phase) => [phase.id, phase.at]));
    assert.equal(at.deploy.getTime(), ago(700).getTime());
    /* The agent said counting had begun before the first return arrived, which
       is the real order of a night and the one the old timeline could not see. */
    assert.equal(at.counting.getTime(), ago(200).getTime());
  });

  it("places an agent from an update that carried a position", () => {
    const line = nightTimeline({
      updates: [update("arrival", 500, { lat: 9.06, lon: 7.49 })],
      now: NOW,
    });

    assert.equal(line.phases.find((phase) => phase.id === "located").at.getTime(), ago(500).getTime());
  });

  it("does not place an agent from an update that carried none", () => {
    const line = nightTimeline({ updates: [update("polls_open", 500)], now: NOW });
    assert.equal(line.phases.find((phase) => phase.id === "located").at, null);
  });
});

describe("the morning has a shape", () => {
  it("draws buckets back to the first update, not the first return", () => {
    /* The whole point. With returns alone the chart began in the evening and
       every hour the field spent working drew as nothing at all. */
    const line = nightTimeline({ updates: [update("arrival", 600)], now: NOW });

    assert.ok(line.slots.length > 10, "the morning was not drawn");
    assert.equal(line.slots.reduce((sum, slot) => sum + slot.updates, 0), 1);
  });

  it("counts updates into the half-hour they landed in", () => {
    const line = nightTimeline({
      updates: [update("arrival", 100), update("polls_open", 100), update("polls_close", 40)],
      now: NOW,
    });

    const busy = line.slots.filter((slot) => slot.updates > 0);
    assert.equal(busy.length, 2);
    assert.equal(Math.max(...busy.map((slot) => slot.updates)), 2);
  });

  it("counts every booth heard from, by any means, without double counting one", () => {
    const line = nightTimeline({
      updates: [update("polls_open", 40), update("counting_start", 40)],
      rows: [ret({ minutes: 40 })],
      incidents: [{ id: "i1", unitCode: "25/01/02/009", severity: "INFO", createdAt: ago(40) }],
      now: NOW,
    });

    const slot = line.slots.find((row) => row.booths > 0);
    /* Three events at 25/01/02/001 and one at 25/01/02/009 is two booths. */
    assert.equal(slot.booths, 2);
  });

  it("labels a morning bucket with its states although no return is in it", () => {
    const line = nightTimeline({ updates: [update("polls_open", 40)], now: NOW });
    const slot = line.slots.find((row) => row.updates > 0);
    assert.deepEqual(slot.states, ["Nasarawa"]);
  });
});

describe("the moments", () => {
  it("names the first booth to reach a step, once, not every press", () => {
    const line = nightTimeline({
      updates: [
        update("polls_open", 300, { unitCode: "25/01/02/001" }),
        update("polls_open", 200, { unitCode: "25/01/02/002" }),
        update("polls_open", 100, { unitCode: "25/01/02/003" }),
      ],
      now: NOW,
    });

    const steps = line.moments.filter((moment) => moment.kind === "step");
    assert.equal(steps.length, 1);
    assert.equal(steps[0].at.getTime(), ago(300).getTime());
    assert.match(steps[0].headline, /voting has started/i);
  });

  it("names the booth and the agent it came from", () => {
    const line = nightTimeline({
      updates: [update("arrival", 300, { unitCode: "25/01/02/007", reporter: "Chinwe Okoro" })],
      now: NOW,
    });

    const [moment] = line.moments.filter((row) => row.kind === "step");
    assert.match(moment.detail, /25\/01\/02\/007/);
    assert.match(moment.detail, /Chinwe Okoro/);
  });

  it("gives each step its own moment", () => {
    const line = nightTimeline({
      updates: [update("arrival", 400), update("polls_open", 300), update("counting_start", 100)],
      now: NOW,
    });

    assert.equal(line.moments.filter((moment) => moment.kind === "step").length, 3);
  });
});

describe("state by state", () => {
  it("gives each state its own hour for the same step", () => {
    const line = nightTimeline({
      updates: [
        update("polls_open", 600, { unitCode: "25/01/02/001" }), // Nasarawa
        update("polls_open", 300, { unitCode: "17/01/02/001" }), // Kano
      ],
      now: NOW,
    });

    const opened = line.phases.find((phase) => phase.id === "opened");
    const byCode = Object.fromEntries(opened.byState.map((row) => [row.code, row.at]));

    assert.equal(byCode["25"].getTime(), ago(600).getTime());
    assert.equal(byCode["17"].getTime(), ago(300).getTime());
    /* A state nobody has reported from is present and waiting, never absent —
       "we have not seen this in Bayelsa" is the finding. */
    assert.equal(byCode["06"], null);
  });

  it("measures the spread between the first state and the last", () => {
    const line = nightTimeline({
      updates: [
        update("polls_open", 600, { unitCode: "25/01/02/001" }),
        update("polls_open", 300, { unitCode: "17/01/02/001" }),
      ],
      now: NOW,
    });

    const opened = line.phases.find((phase) => phase.id === "opened");
    assert.equal(opened.spread.seen, 2);
    assert.equal(opened.spread.minutes, 300);
    assert.equal(opened.spread.waiting, 35);
  });

  it("counts the booths voting in a state rather than its reports", () => {
    const line = nightTimeline({
      updates: [
        update("polls_open", 600, { unitCode: "25/01/02/001" }),
        update("polls_open", 500, { unitCode: "25/01/02/002" }),
      ],
      now: NOW,
    });

    const opened = line.phases.find((phase) => phase.id === "opened");
    const nasarawa = opened.byState.find((row) => row.code === "25");
    assert.equal(nasarawa.figure, "2 booths voting");
  });
});

describe("nothing changes for a deployment with no agents' app", () => {
  it("draws exactly what it always drew when no updates are passed", () => {
    const line = nightTimeline({
      rows: [ret({ minutes: 90 })],
      incidents: [{ id: "i1", unitCode: "25/01/02/001", severity: "INFO", createdAt: ago(400) }],
      coordinators: [{ unitCode: "25/01/02/001", lastSeen: ago(600), seenAt: ago(500) }],
      now: NOW,
    });

    const at = Object.fromEntries(line.phases.map((phase) => [phase.id, phase.at]));
    assert.equal(at.deploy.getTime(), ago(600).getTime());
    assert.equal(at.located.getTime(), ago(500).getTime());
    assert.equal(at.opened.getTime(), ago(400).getTime());
    assert.equal(at.counting.getTime(), ago(90).getTime());
    assert.ok(line.slots.every((slot) => slot.updates === 0));
    assert.equal(line.moments.filter((moment) => moment.kind === "step").length, 0);
  });
});
