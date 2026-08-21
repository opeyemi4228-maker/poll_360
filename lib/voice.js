/**
 * Choosing a voice worth listening to.
 *
 * ── WHY THIS IS NOT ONE LINE ───────────────────────────────────────────────
 * A browser will happily hand back thirty voices, and the gap between the
 * best and the worst of them is the gap between a newsreader and a 1998
 * satnav. Taking the first English one, which is what most code does, usually
 * lands on a small local voice that mangles every Nigerian place name it
 * meets. On a desk that reads figures out on air, that is the difference
 * between a tool and a joke.
 *
 * ── WHAT ACTUALLY MAKES ONE BETTER ─────────────────────────────────────────
 * Three things, in this order.
 *
 *   The accent.   Nigerian English if the device has it. Failing that,
 *                 British, then South African or Indian: all of them read
 *                 "Ogun", "Bayelsa" and "Kwankwaso" recognisably, where
 *                 General American does not.
 *   The engine.   A network voice is a large model rendered on a server; a
 *                 local one is a few megabytes shipped with the operating
 *                 system. They do not sound remotely alike, and the browser
 *                 tells us which is which.
 *   The name.     Vendors put their quality tier in the name and nowhere
 *                 else. "Natural", "Neural", "Enhanced" and "Premium" are
 *                 the good ones; "Compact" and the novelty voices are the
 *                 ones that make people switch the sound off.
 *
 * ── AND WHY THE LIST ARRIVES LATE ──────────────────────────────────────────
 * `getVoices()` is very often empty the first time it is called, because the
 * list is still loading. Code that picks once at start-up therefore picks
 * nothing, falls back to the system default, and sounds bad forever. That is
 * almost certainly the commonest cause of "the speech is terrible" in any web
 * app. The fix is to wait for the list and choose again when it lands.
 * ───────────────────────────────────────────────────────────────────────────
 */

/* The accent, best first. */
const ACCENT = [
  [/^en[-_]ng/i, 60],
  [/^en[-_]gb/i, 45],
  [/^en[-_]za/i, 35],
  [/^en[-_]ke/i, 35],
  [/^en[-_]in/i, 28],
  [/^en[-_]ie/i, 22],
  [/^en[-_]au/i, 18],
  [/^en/i, 8],
];

/* Names that say "this is the good one". */
const GOOD = /natural|neural|premium|enhanced|online|siri|google|multilingual/i;

/* Named voices that are reliably pleasant to listen to for minutes at a time,
   across the three platforms this product is actually opened on. */
const KNOWN = /libby|sonia|ryan|thomas|serena|kate|daniel|arthur|samantha|aria|jenny|ada|ezinne|abeo/i;

/* Names that mean a tiny local engine or a joke. */
const POOR = /compact|eloquence|espeak|novelty|zarvox|albert|bahh|bells|boing|bubbles|cellos|deranged|hysterical|trinoids|whisper|wobble|organ|superstar/i;

/**
 * How good a voice is for reading election figures aloud.
 *
 * @returns a score, or null for a voice that should never be used
 */
export function rankVoice(voice) {
  const lang = voice?.lang ?? "";
  if (!/^en/i.test(lang)) return null;

  const name = voice.name ?? "";
  let score = 0;

  for (const [pattern, points] of ACCENT) {
    if (pattern.test(lang)) {
      score += points;
      break;
    }
  }

  /* `localService` is false for the server-rendered voices, which are the
     large ones. This single flag separates most of the good from most of the
     bad, so it is weighted like an accent rather than a tiebreak. */
  if (voice.localService === false) score += 40;

  if (GOOD.test(name)) score += 25;
  if (KNOWN.test(name)) score += 18;
  if (POOR.test(name)) score -= 80;

  /* A voice the browser itself nominates is a reasonable signal, worth a
     nudge and no more. */
  if (voice.default) score += 4;

  return score;
}

/** The best of what this device has, or null if it has nothing in English. */
export function bestVoice(voices) {
  let best = null;
  let bestScore = -Infinity;

  for (const voice of voices ?? []) {
    const score = rankVoice(voice);
    if (score === null || score <= bestScore) continue;
    best = voice;
    bestScore = score;
  }

  return best;
}

/**
 * A paragraph, split where a reader would breathe.
 *
 * ── WHY NOT JUST HAND OVER THE WHOLE THING ─────────────────────────────────
 * Every engine flattens as an utterance gets longer: the intonation it plans
 * at the start does not survive to the end, and several of them simply stop
 * partway through a long one. Sentence by sentence, each is planned as a
 * sentence and read as a sentence, which is both more reliable and markedly
 * more natural. Abbreviations that end in a full stop are the obvious trap,
 * so the split requires a capital or a digit after the space.
 */
export function sentences(text) {
  return String(text ?? "")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map((part) => part.trim())
    .filter(Boolean);
}
