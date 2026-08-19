import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from "node:crypto";

/**
 * Encryption at rest for the fields that would actually hurt if the database
 * were taken.
 *
 * ── WHAT IS ENCRYPTED, AND WHAT IS NOT ─────────────────────────────────────
 * Not everything. Encrypting a column you have to search, sort or aggregate on
 * turns it into a column you cannot use, and a product that encrypts vote
 * totals cannot draw a map. So the rule is: aggregate figures stay in the
 * clear, and anything that identifies or endangers a *person* is sealed.
 *
 *   sealed      incident narratives (they name people and places),
 *               agent contact details, result-sheet object keys
 *   clear       vote counts, coverage, timestamps, unit codes
 *
 * ── AES-256-GCM, NOT AES-CBC ───────────────────────────────────────────────
 * GCM authenticates as well as encrypts: a row tampered with in the database
 * fails to decrypt rather than quietly returning different plaintext. For
 * election evidence that distinction is the whole point, silent corruption is
 * worse than loud failure.
 *
 * Format: v1.<iv>.<tag>.<ciphertext>, all base64url. The version prefix means
 * the scheme can be changed later without guessing at old rows.
 * ───────────────────────────────────────────────────────────────────────────
 */

const VERSION = "v1";

/**
 * The key is derived from ENCRYPTION_KEY. In development a key is derived from
 * a fixed string so the app runs out of the box, and says so loudly, because
 * a deployment that inherits the development key is a deployment with no
 * encryption at all.
 */
let cachedKey = null;

function key() {
  if (cachedKey) return cachedKey;

  const secret = process.env.ENCRYPTION_KEY;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ENCRYPTION_KEY is not set. Refusing to start in production with a known key, " +
          "generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
      );
    }
    console.warn(
      "\n⚠  ENCRYPTION_KEY is not set. Using a development key: sealed fields are NOT secret.\n"
    );
    cachedKey = scryptSync("poll360-development-key", "poll360", 32);
    return cachedKey;
  }

  /* Accept either raw base64 32 bytes, or any passphrase, which is stretched. */
  const raw = Buffer.from(secret, "base64");
  cachedKey = raw.length === 32 ? raw : scryptSync(secret, "poll360", 32);
  return cachedKey;
}

/** Encrypt a string. Returns null for null, so callers need no special case. */
export function seal(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === "") return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Decrypt. A row that fails authentication returns a marker rather than
 * throwing, so one tampered incident cannot take down the whole feed, but it
 * is never silently rendered as though it were the original text.
 */
export function unseal(sealed) {
  if (!sealed) return null;

  try {
    const [version, iv, tag, ciphertext] = String(sealed).split(".");
    if (version !== VERSION) return "[unreadable: unknown encryption version]";

    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "[unreadable: this record failed its integrity check]";
  }
}

/**
 * A blind index: a keyed hash used to look a sealed value up by equality
 * without decrypting the column. Same input, same output, and it reveals
 * nothing about the plaintext to anyone without the key.
 */
export function blindIndex(value) {
  if (!value) return null;
  return createHash("sha256")
    .update(key())
    .update(String(value).trim().toLowerCase())
    .digest("hex");
}
