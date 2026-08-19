import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

/**
 * Password hashing with scrypt, from Node's own crypto.
 *
 * No dependency. scrypt is memory-hard, it is in the standard library, and it
 * is the recommendation of the people who would otherwise be telling us to use
 * argon2, which would mean a native module in the deployment image for no
 * meaningful gain at this scale.
 *
 * Parameters are stored in the hash itself rather than in a constant, so the
 * cost can be raised later and old hashes still verify.
 *
 *   scrypt$N$r$p$salt$key
 */
const N = 16384; // CPU/memory cost
const R = 8; // block size
const P = 1; // parallelism
const KEYLEN = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

/**
 * Verify a password against a stored hash.
 *
 * Compared with `timingSafeEqual`, so the time taken cannot be used to learn
 * how much of a hash was guessed correctly.
 */
export async function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, salt, key] = String(stored).split("$");
    if (scheme !== "scrypt") return false;

    const expected = Buffer.from(key, "base64");
    const actual = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
