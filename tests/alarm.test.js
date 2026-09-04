import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SEVERITY_RANK,
  VOICES,
  VOICE_ORDER,
  durationOf,
  newArrivals,
  soundable,
} from "../lib/alarm.js";

/**
 * The two alarms, pinned.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  An alarm is the only thing in this product designed to be heard rather
 *  than read, and it fails in a way nobody reports: it goes off once too
 *  often, somebody mutes the tab, and then the one at 02:40 is silent. By the
 *  time that matters it is far too late to find out.
 *
 *  So the logic that decides whether to make a noise is a pure function and
 *  everything below is about the two ways it can destroy itself — sounding
 *  for something already announced, and sounding for the backlog on arrival.
 * ══════════════════════════════════════════════════════════════════════════
 */

const row = (id, level) => ({ id, level });

describe("the two voices", () => {
  it("keeps them apart on more than pitch", () => {
    /* Two alarms that differ only in pitch are two alarms a tired person
       confuses inside a week. These differ on direction, register, pulse
       count and timbre at once, so a listener has four ways to tell them
       apart and needs only one of them to be working. */
    const attention = VOICES.ATTENTION;
    const situation = VOICES.SITUATION;

    assert.notEqual(attention.wave, situation.wave);
    assert.equal(attention.warble, 0);
    assert.ok(situation.warble > 0, "the situation alarm needs its wobble");

    const rises = (pattern) => pattern.steps[pattern.steps.length - 1][0] > pattern.steps[0][0];
    assert.ok(rises(attention.levels.CRITICAL), "attention rises");
    assert.ok(!rises(situation.levels.CRITICAL), "situation falls");

    /* And in different registers, so they do not compete even when both fire. */
    const top = (pattern) => Math.max(...pattern.steps.map(([hz]) => hz));
    assert.ok(top(situation.levels.CRITICAL) < top(attention.levels.CRITICAL) / 2);
  });

  it("gives every severity a figure in both voices", () => {
    for (const id of VOICE_ORDER) {
      for (const level of ["INFO", "WARNING", "SERIOUS", "CRITICAL"]) {
        const pattern = VOICES[id].levels[level];
        assert.ok(pattern, `${id} has no ${level}`);
        assert.ok(pattern.steps.length > 0);
        assert.ok(pattern.volume > 0 && pattern.volume <= 1);
      }
    }
  });

  it("gets louder with severity and does not change shape", () => {
    /* A louder version of the same alarm is still recognisably that alarm.
       Changing the shape per severity would be four alarms per voice, which
       is four things to learn instead of two. */
    for (const id of VOICE_ORDER) {
      const levels = VOICES[id].levels;
      assert.ok(levels.INFO.volume < levels.WARNING.volume);
      assert.ok(levels.WARNING.volume < levels.SERIOUS.volume);
      assert.ok(levels.SERIOUS.volume < levels.CRITICAL.volume);
    }
  });

  it("never lets an alarm run long enough to talk over the next one", () => {
    /* The room refreshes every fifteen seconds. An alarm that outlasts that
       overlaps itself and turns into noise. */
    for (const id of VOICE_ORDER) {
      for (const level of ["INFO", "WARNING", "SERIOUS", "CRITICAL"]) {
        assert.ok(durationOf(id, level) < 3, `${id} ${level} runs too long`);
      }
    }
  });
});

describe("deciding whether to make a noise", () => {
  it("is silent on the very first look, however much is on the page", () => {
    /* Somebody opening the dashboard at 9pm must not be met by forty alarms
       for things that happened before they sat down. */
    const seen = newArrivals(
      [row("a", "CRITICAL"), row("b", "SERIOUS"), row("c", "INFO")],
      null
    );

    assert.equal(seen.first, true);
    assert.deepEqual(seen.fresh, []);
    assert.equal(seen.level, null);
    assert.equal(seen.seen.size, 3);
  });

  it("sounds once for something new, and never again for it", () => {
    const first = newArrivals([row("a", "INFO")], null);
    const second = newArrivals([row("a", "INFO"), row("b", "SERIOUS")], first.seen);

    assert.equal(second.fresh.length, 1);
    assert.equal(second.fresh[0].id, "b");
    assert.equal(second.level, "SERIOUS");

    /* The same page again: nothing new, so nothing sounds. */
    const third = newArrivals([row("a", "INFO"), row("b", "SERIOUS")], second.seen);
    assert.deepEqual(third.fresh, []);
    assert.equal(third.level, null);
  });

  it("does not sound again for a row that scrolled off a capped feed and came back", () => {
    /* The feed shows the most recent N. A busy minute pushes an old row off
       the end; a quiet minute lets it back on. It is not new either time. */
    const first = newArrivals([row("a", "INFO"), row("b", "INFO")], null);
    const pushedOff = newArrivals([row("b", "INFO"), row("c", "INFO")], first.seen);
    const cameBack = newArrivals([row("a", "INFO"), row("b", "INFO")], pushedOff.seen);

    assert.equal(pushedOff.fresh.length, 1, "only c is new");
    assert.deepEqual(cameBack.fresh, [], "a is not new the second time it is seen");
  });

  it("takes its level from the worst thing in the batch", () => {
    /* Two arriving together should sound like the more serious of the two,
       never like two of the milder one. */
    const first = newArrivals([], null);
    const batch = newArrivals(
      [row("a", "INFO"), row("b", "CRITICAL"), row("c", "WARNING")],
      first.seen
    );

    assert.equal(batch.fresh.length, 3);
    assert.equal(batch.level, "CRITICAL");
  });

  it("reads a severity as readily as a level", () => {
    /* Alerts carry `level`, field reports carry `severity`. One function
       serves both feeds rather than two that can drift apart. */
    const first = newArrivals([], null);
    const batch = newArrivals([{ id: "x", severity: "SERIOUS" }], first.seen);
    assert.equal(batch.level, "SERIOUS");
  });

  it("treats a row with no level as the quietest thing there is", () => {
    const first = newArrivals([], null);
    const batch = newArrivals([{ id: "x" }], first.seen);
    assert.equal(batch.level, "INFO");
  });

  it("ignores a row with no id rather than sounding for it every poll", () => {
    /* A row without an id cannot be told apart from itself on the next
       refresh, so it would sound forever. Dropped, silently, because the
       alternative is an alarm that never stops. */
    const first = newArrivals([], null);
    const batch = newArrivals([{ severity: "CRITICAL" }], first.seen);
    assert.deepEqual(batch.fresh, []);
    assert.equal(batch.level, null);
  });
});

describe("what an alarm is allowed to sound for", () => {
  it("never sounds for the row that says everything is fine", () => {
    /* "Normal" is a row in the alert list, on purpose — an empty panel reads
       as "all clear" and as "this is broken" equally well. But an alarm for
       it is the fastest way to lose the feature. */
    const rows = [{ id: "normal", level: "NORMAL" }, { id: "real", level: "WARNING" }];
    const allowed = soundable(rows);
    assert.equal(allowed.length, 1);
    assert.equal(allowed[0].id, "real");
  });

  it("leaves a clear room completely silent", () => {
    const first = newArrivals(soundable([{ id: "normal", level: "NORMAL" }]), null);
    const next = newArrivals(soundable([{ id: "normal", level: "NORMAL" }]), first.seen);
    assert.deepEqual(next.fresh, []);
  });

  it("ranks the severities in the order the room uses everywhere else", () => {
    assert.ok(SEVERITY_RANK.CRITICAL > SEVERITY_RANK.SERIOUS);
    assert.ok(SEVERITY_RANK.SERIOUS > SEVERITY_RANK.WARNING);
    assert.ok(SEVERITY_RANK.WARNING > SEVERITY_RANK.INFO);
  });
});
