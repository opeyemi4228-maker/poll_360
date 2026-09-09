import { randomBytes } from "node:crypto";

/**
 * The code an agent is given at the end of registration.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS NOT THE POLLING UNIT CODE
 *
 *  The obvious reading of "give each agent a unique polling unit code" is to
 *  hand them 33/01/01/001 and let them sign in with it. That cannot be done,
 *  and the reason is worth writing down because it will be proposed again.
 *
 *  A polling unit code is public. It is printed at the top of every result
 *  sheet, it is in INEC's own published list — all 176,623 of them are in
 *  this repository — and it is not unique to a person: several agents may
 *  stand at one booth across a day. Accepting it as a credential means
 *  anybody holding a result sheet, or a copy of a list anybody can download,
 *  can sign in as the agent for that booth and file whatever they like.
 *
 *  So the code an agent is *given* carries their booth where they can read it
 *  and a secret they cannot guess. It looks like their polling unit, because
 *  that is what makes it memorable and what the room asked for, and the half
 *  that logs them in is the half that was never public.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT IT LOOKS LIKE, AND WHY IT IS SHAPED THAT WAY ──────────────────────
 *
 *     33-0101001-K7M4QX
 *     ── ─────── ──────
 *     │     │       └ six random symbols: the credential
 *     │     └ their booth, so they can check it against their sheet
 *     └ their state
 *
 * Read down a phone line at six in the morning by somebody who has not slept,
 * onto a cheap handset, into WhatsApp. Every decision follows from that:
 *
 *   · Crockford's base 32, which drops I, L, O and U. The first three because
 *     they are the ones misread as 1 and 0, and U so the alphabet cannot
 *     produce an obscenity by accident. Thirty-two symbols to a character,
 *     six characters, thirty bits — about a billion, which against the rate
 *     limit on the sign-in path is far past anything guessable.
 *
 *   · Read back leniently and stored strictly. Somebody typing this will use
 *     spaces or no hyphens or lower case or the letter O for a nought, and
 *     every one of those is the same code. `normalise` folds all of it; the
 *     canonical form is what is hashed.
 *
 *   · The booth is in the code but is never trusted from it. It is there to be
 *     read by a human. Sign-in looks up the hash, and the account's own booth
 *     is whatever the database says — never what the code claims.
 *
 * ── AND IT IS A CREDENTIAL, SO IT IS HASHED ────────────────────────────────
 * Stored the same way a password is, and shown exactly once. An agent who
 * loses it is re-issued a new one by an administrator; there is no screen
 * anywhere that can show an existing one, because there is nothing to show.
 */

/**
 * Crockford's base 32: ten digits and twenty-two letters, with I, L, O and U
 * removed. Ordered so the alphabet is a straight index.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** The confusions a tired person actually makes, folded on the way in. */
const FOLD = { I: "1", L: "1", O: "0", U: "V" };

/** How many random symbols the secret half carries. Six is thirty bits. */
const SECRET_LENGTH = 6;

/**
 * A fresh code for one agent at one booth.
 *
 * @param unitCode  their polling unit, "SS/LL/WW/UUU"
 */
export function issueAgentCode(unitCode) {
  const digits = String(unitCode ?? "").replace(/\D/g, "");
  if (digits.length !== 9) {
    throw new Error("An agent code needs a nine-digit polling unit to be built from.");
  }

  return `${digits.slice(0, 2)}-${digits.slice(2)}-${secret()}`;
}

/**
 * Six symbols nobody can guess.
 *
 * ── REJECTION SAMPLING, NOT A MODULO ───────────────────────────────────────
 * A byte is 256 values and the alphabet is 32, which divides evenly — so the
 * modulo here happens to be unbiased. It is written as a mask anyway, because
 * the day somebody adds a symbol to the alphabet the modulo silently starts
 * favouring the first few letters, and a biased credential is a smaller
 * credential than it looks.
 */
function secret() {
  const out = [];
  while (out.length < SECRET_LENGTH) {
    for (const byte of randomBytes(SECRET_LENGTH)) {
      const index = byte & 0x1f;
      if (index < ALPHABET.length) out.push(ALPHABET[index]);
      if (out.length === SECRET_LENGTH) break;
    }
  }
  return out.join("");
}

/**
 * One code, however it was typed.
 *
 * Returns the canonical form — "33-0101001-K7M4QX" — or null if what arrived
 * cannot be one. Null rather than a best effort: a sign-in that half-read a
 * code and looked up something adjacent is worse than one that says no.
 */
export function normaliseAgentCode(input) {
  const raw = String(input ?? "").toUpperCase();

  /* ── ONLY SEPARATORS ARE REMOVED, NOT EVERYTHING UNRECOGNISED ─────────
     The first version filtered down to symbols in the alphabet, which reads
     as generous and is a hole: every letter of "CODE" is in the alphabet, so
     somebody typing "code: 33-…" would have had four extra symbols folded
     silently into their credential and been refused for a reason no message
     could explain. Worse, some other prefix of exactly the wrong length
     would have been accepted as a different code entirely.

     So the punctuation people actually use is removed by name, and anything
     still left that is not a symbol makes the whole thing not a code. */
  const folded = [...raw.replace(/[\s\-_./:]+/g, "")]
    .map((character) => FOLD[character] ?? character)
    .join("");

  if (![...folded].every((character) => ALPHABET.includes(character))) return null;

  /* Nine digits of booth and six of secret. Anything else is not a code, and
     length is the only structural check worth making — the alphabet has
     already thrown away everything that could not belong. */
  if (folded.length !== 9 + SECRET_LENGTH) return null;

  const booth = folded.slice(0, 9);
  /* The booth half is digits. A letter there is somebody's typo landing in the
     part that is supposed to be readable, and accepting it would produce a
     code that cannot name a polling unit. */
  if (!/^\d{9}$/.test(booth)) return null;

  return `${booth.slice(0, 2)}-${booth.slice(2)}-${folded.slice(9)}`;
}

/** Whether something a person typed could be a code at all. */
export function looksLikeAgentCode(input) {
  return normaliseAgentCode(input) !== null;
}

/**
 * The polling unit a code names, in the form the rest of this product uses.
 *
 * ── FOR DISPLAY, NEVER FOR AUTHORISATION ───────────────────────────────────
 * A code carries its booth so a human can check it. It is not evidence of
 * anything: anybody can write nine digits in front of six symbols. Sign-in
 * finds the account by the hash of the whole code and reads the booth off that
 * account, and this is only ever used to show somebody what they typed.
 */
export function unitOfAgentCode(input) {
  const code = normaliseAgentCode(input);
  if (!code) return null;
  const digits = code.replace(/\D/g, "");
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 6)}/${digits.slice(6, 9)}`;
}
