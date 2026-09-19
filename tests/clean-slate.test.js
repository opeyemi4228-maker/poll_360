import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { raiseAlerts } from "../lib/alerts.js";
import { integrityOf } from "../lib/anomalies.js";
import { pipeline } from "../lib/operations.js";
import { nightPulse, sheetAudits } from "../lib/pulse.js";
import { boothBoard } from "../lib/reporting.js";
import { nightTimeline } from "../lib/timeline.js";
import { unitCards } from "../lib/unit-card.js";

/**
 * The room before anybody has filed anything.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE EMPTY CASE GETS A TEST FILE OF ITS OWN
 *
 *  Every other test in this directory feeds these assemblers rows and checks
 *  the arithmetic. This one feeds them nothing, because nothing is the state
 *  a live project is in for every hour of its life until the first return
 *  lands — and it is the state that was never exercised, because the database
 *  always held a rehearsal's test traffic and the screens were always read
 *  with something in them.
 *
 *  `npm run project:clear` is what takes that traffic off a project before a
 *  night. The morning after it runs, these five surfaces open with empty
 *  hands for the first time, at the hour when the room is fullest.
 *
 *  ── AND WHY THE ASSERTIONS ARE ABOUT NULL RATHER THAN ZERO ──────────────
 *  Not throwing is the easy half. The half that matters is that an empty
 *  count must not be dressed as a measured one. "0% reporting" and "no
 *  reporting rate yet" are different claims: the first says we looked and
 *  found nothing, the second says we have not looked. On a wall in a room
 *  deciding who to ring next, the first sends somebody to a booth that is
 *  fine and the second sends them to find out.
 *
 *  So every figure below that is a *rate* — a share, a median wait, the hour
 *  a phase of the day was observed — is asserted to be null and not 0. A
 *  zero that arrives here is not a cosmetic bug; it is the product inventing
 *  a finding out of its own silence.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* A fixed hour, so a test that runs at midnight agrees with one that runs at
   noon. Mid-afternoon on a polling day: late enough that a room reading these
   screens would expect to see something, which is exactly when a fabricated
   zero would be believed. */
const NOW = Date.UTC(2027, 1, 27, 14, 0, 0);

const NOTHING = { rows: [], incidents: [], coordinators: [], updates: [], photos: {} };

describe("a project nobody has filed into", () => {
  it("reports no reporting rate, rather than a rate of nought", () => {
    const board = boothBoard({ roster: [], rows: [] });

    assert.equal(board.total.assigned, 0);
    assert.equal(board.total.filed, 0);
    /* The distinction this whole file exists for. A room with no roster has
       not achieved 0% coverage; it has no denominator. */
    assert.equal(board.total.reporting, null, "no roster is not nought per cent");
    assert.equal(board.total.stage, null);
    /* Nobody has gone quiet, because nobody was sent anywhere. A place drawn
       as silent is a place somebody drives to. */
    assert.equal(board.total.silent, 0);
  });

  it("has no median wait, because nothing has waited", () => {
    const ops = pipeline({ rows: [], disputed: 0, assigned: 0, unitsRegistered: 0, now: NOW });

    assert.equal(ops.kpis.received, 0);
    assert.equal(ops.kpis.pending, 0);
    assert.equal(ops.kpis.wait.counted, 0);
    assert.equal(ops.kpis.wait.p50, null, "a median of nothing is not nought minutes");
    assert.equal(ops.kpis.wait.p90, null);
    /* The stages still draw. An operations screen that vanishes when the
       pipeline is empty is a screen nobody can tell from a broken one. */
    assert.ok(ops.stages.length > 0, "the pipeline still shows its stages");
  });

  it("screens nothing and finds nothing, which are not the same as clean", () => {
    const integrity = integrityOf([]);

    assert.equal(integrity.screened, 0);
    assert.equal(integrity.impossible, 0);
    assert.equal(integrity.flagged, 0);
    assert.deepEqual(integrity.flags, []);
    assert.deepEqual(integrity.work, []);
    assert.deepEqual(sheetAudits([]), []);
  });

  it("raises one alert, and it says there is nothing to raise", () => {
    const pulse = nightPulse({ ...NOTHING, watchList: [], unitsRegistered: 0, now: NOW });
    const operations = pipeline({ rows: [], disputed: 0, assigned: 0, unitsRegistered: 0, now: NOW });

    const raised = raiseAlerts({
      pulse,
      integrity: integrityOf([]),
      operations,
      incidents: [],
      now: NOW,
    });

    /* ── THE ALARM MUST NOT GO OFF OVER SILENCE ───────────────────────────
       Several of these dials are "how long since the last return" and "how
       many are waiting to be checked". Fed an empty night, an implementation
       that measures from the epoch reports a stall of half a century and
       wakes a room at four in the morning over a project that has not
       started. */
    assert.equal(raised.alerts.length, 1);
    assert.equal(raised.alerts[0].level, "NORMAL");
    assert.ok(
      raised.dials.every((dial) => dial.over === false),
      "no dial is over its limit on a night that has not begun"
    );
  });

  it("draws the whole day unobserved rather than skipping to now", () => {
    const timeline = nightTimeline({ ...NOTHING, now: NOW });

    assert.deepEqual(timeline.moments, [], "nothing is worth naming yet");

    /* ── THE PHASES STAY, AND STAY EMPTY ──────────────────────────────────
       Accreditation, polls open, counting. All of them still listed, none of
       them with an hour against it. A timeline that only listed what had
       happened would show a blank screen, and a blank screen cannot say
       which part of the day has not been heard from — which is the single
       thing this surface is for. */
    assert.ok(timeline.phases.length > 0, "every phase of the day is still listed");
    for (const phase of timeline.phases) {
      assert.equal(phase.at, null, `${phase.id} was not observed`);
      for (const state of phase.byState) {
        assert.equal(state.at, null, `${phase.id} was not observed in ${state.name}`);
        assert.equal(state.figure, null);
      }
    }
  });

  it("opens no booth card, because there is nothing to put on one", () => {
    assert.deepEqual(unitCards(NOTHING), {});
  });
});
