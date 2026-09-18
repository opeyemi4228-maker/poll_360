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
       confuses inside a week. These differ on register, contour, figure
       length and timbre at once, so a listener has four ways to tell them
       apart and needs only one of them to be working.

       Note what is NOT asserted here: that the waveforms differ. They are
       both square now, and it does not matter — a two-note blip at 2kHz and
       a five-note arch at 600Hz are not confusable whatever the oscillator
       is set to. Pinning the oscillator would be pinning a detail nobody can
       hear over the four things they can. */
    const attention = VOICES.ATTENTION;
    const situation = VOICES.SITUATION;

    const first = (pattern) => pattern.steps[0][0];
    const last = (pattern) => pattern.steps[pattern.steps.length - 1][0];
    const top = (pattern) => Math.max(...pattern.steps.map(([hz]) => hz));

    /* Contour. Attention climbs and stays up; situation goes up and comes
       back to where it started, which is the shape of a monitor alarm. */
    assert.ok(last(attention.levels.CRITICAL) > first(attention.levels.CRITICAL), "attention rises");
    assert.ok(
      last(situation.levels.CRITICAL) <= first(situation.levels.CRITICAL),
      "situation comes back down"
    );

    /* Register, by more than an octave, so they do not compete even when
       both fire in the same second. */
    assert.ok(top(situation.levels.CRITICAL) < top(attention.levels.CRITICAL) / 2);

    /* Figure length. Two notes reads as a blip; five reads as a phrase. */
    assert.ok(
      situation.levels.CRITICAL.steps.length >= attention.levels.CRITICAL.steps.length + 2,
      "the figures are not different enough lengths to tell apart"
    );

    /* Timbre. The attention voice is driven and bandpassed, the situation
       voice is clean and round. */
    assert.ok(attention.drive > situation.drive, "the harsher voice is the lesser emergency");
    assert.notEqual(attention.filter[0], situation.filter[0]);
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

describe("sounding like an alarm rather than like a notification", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════
   *  The first version of these voices was two pure sine tones with a soft
   *  rise and a soft fall. It was polite, and across a room with four people
   *  talking it was not there at all — which is the same as not having an
   *  alarm, except that everybody believes there is one.
   *
   *  What follows pins the five things that make a noise carry: harmonics,
   *  a resonant filter, drive, a loudness that is not apologetic, and
   *  movement. None of them can be heard by a test, so each is pinned as the
   *  structural fact it comes from.
   * ══════════════════════════════════════════════════════════════════════
   */

  it("builds every voice out of a harmonic stack, not one clean tone", () => {
    /* A single oscillator is a flute and is masked by conversation. A stack
       with its harmonics is a horn and cuts through it. */
    for (const id of VOICE_ORDER) {
      const voice = VOICES[id];
      assert.ok(voice.partials.length >= 3, `${id} is too thin to carry`);
      assert.ok(
        voice.partials.some(([ratio]) => ratio >= 2),
        `${id} has no harmonics above the fundamental`
      );
      /* The fundamental is the loudest thing in the stack, or the note is
         not the note the level table says it is. */
      const fundamental = voice.partials.find(([ratio]) => ratio === 1);
      assert.ok(fundamental, `${id} has no fundamental`);
      for (const [ratio, gain] of voice.partials) {
        if (ratio !== 1) assert.ok(gain < fundamental[1], `${id} partial ${ratio} drowns the note`);
      }
    }
  });

  it("gives every voice a body, whether or not it gives it a buzz", () => {
    /* The filter is what stops an oscillator stack sounding like a
       synthesiser, so every voice has one and it moves across the note.

       Drive deliberately is NOT required. The first situation voice was
       built on heavy distortion, on the theory that harsh reads as urgent,
       and it was rejected on hearing: it came out muddy rather than
       alarming. A voice is allowed to be completely clean, and the one that
       fires most often through the night is. */
    for (const id of VOICE_ORDER) {
      const voice = VOICES[id];
      const [type, from, to, q] = voice.filter;
      assert.ok(["lowpass", "bandpass", "highpass"].includes(type), `${id} filter type`);
      assert.ok(from > 0 && to > 0, `${id} filter has no sweep`);
      assert.notEqual(from, to, `${id} filter does not move`);
      assert.ok(q >= 1, `${id} filter thins the sound instead of shaping it`);

      /* What is required is that the oscillator has edges to filter. A sine
         has no harmonics, so no amount of stacking or filtering will make it
         carry across a room. */
      assert.notEqual(voice.wave, "sine", `${id} cannot carry on a sine`);
      assert.ok(voice.drive >= 0 && voice.drive < 1, `${id} drive out of range`);
    }
  });

  it("is loud enough to be heard across a room", () => {
    /* Not a number anybody can hear in a test, but a floor that stops the
       voices quietly drifting back to being notification beeps. The old
       ones topped out at 0.34 and that was the whole problem. */
    for (const id of VOICE_ORDER) {
      assert.ok(VOICES[id].levels.CRITICAL.volume >= 0.5, `${id} critical is too quiet`);
      assert.ok(VOICES[id].levels.INFO.volume >= 0.2, `${id} info is too quiet`);
      /* And still under 1, because a voice at full scale into a limiter is
         a crackle, and a room hears a crackle as a broken speaker. */
      assert.ok(VOICES[id].levels.CRITICAL.volume < 1, `${id} critical will clip`);
    }
  });

  it("never lets a voice sit still", () => {
    /* A steady tone becomes part of the room within about four seconds. A
       voice may move in three ways — by pulsing, by sliding, or by having a
       figure that goes somewhere — and it has to do at least one of them.

       Both voices currently take the third route, which is why neither has a
       tremolo or a glide set. That is a choice and not an oversight, so the
       test asks for movement rather than for a particular mechanism. */
    for (const id of VOICE_ORDER) {
      const voice = VOICES[id];
      const figure = voice.levels.CRITICAL;

      const pulses = Boolean(voice.tremolo);
      const slides = voice.glide > 0;
      const travels = new Set(figure.steps.map(([hz]) => hz)).size > 1;
      const repeats = figure.repeat > 1;

      assert.ok(
        pulses || slides || travels || repeats,
        `${id} sits on one note and will be ignored`
      );

      /* And whichever mechanism a voice uses, it has to be configured
         sanely — a tremolo below 5Hz is a wobble and above 14 is a buzz. */
      if (pulses) {
        const [rate, depth] = voice.tremolo;
        assert.ok(rate >= 5 && rate <= 14, `${id} tremolo is not a pulse`);
        assert.ok(depth > 0 && depth < 1, `${id} tremolo depth out of range`);
      }
      if (slides) assert.ok(voice.glide <= 1, `${id} glide is a fraction of a note`);
    }
  });

  it("escalates by repeating as well as by getting louder", () => {
    /* Volume alone is not escalation on a wall speaker somebody has turned
       down. A figure that comes back more times is urgent at any volume. */
    for (const id of VOICE_ORDER) {
      const levels = VOICES[id].levels;
      assert.ok(levels.CRITICAL.repeat > levels.INFO.repeat, `${id} does not escalate`);
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
