/**
 * Whether this deployment is actually configured, or only appears to be.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY SETTING BELOW HAS A FAILURE MODE THAT LOOKS LIKE SUCCESS
 *
 *  That is the whole reason this file exists. A product that refuses to start
 *  when something is missing needs no checker — you find out immediately. The
 *  dangerous settings are the ones where the absence changes nothing visible:
 *
 *    ENCRYPTION_KEY unset       every sealed field is sealed with a key that
 *                               is printed in this repository. The incident
 *                               narratives encrypt, decrypt and display
 *                               perfectly. They are simply not secret.
 *
 *    the development key in use  the same, and it survives a deploy, so a
 *                               staging database restored into production
 *                               carries rows nobody can read and rows
 *                               anybody can.
 *
 *    no signing secret          the pipeline to Data Bank works. Nothing
 *                               proves a body was not altered in transit,
 *                               which is the difference between evidence and
 *                               a claim.
 *
 *    limiter in memory          sign-in is limited per instance, so the
 *                               limit is however many instances the platform
 *                               happens to be running. It fires, it counts,
 *                               it looks correct.
 *
 *    TRUSTED_PROXY_HOPS wrong   either every caller in the world shares one
 *                               rate-limit bucket, or every caller gets a
 *                               fresh one. Both are invisible from outside.
 *
 *  None of these is detectable by looking at the screens. All of them are one
 *  question away. So the product asks itself, and prints the answer where the
 *  person responsible for it is already looking.
 *
 *  ── AND IT IS A REPORT, NOT A REFUSAL ────────────────────────────────────
 *  With one exception, below. Refusing to start over a missing signing secret
 *  on the morning of an election, when the alternative is a pipeline that
 *  works slightly less provably, would be this product choosing its own
 *  tidiness over a count. The exception is the encryption key, which
 *  lib/crypto.js already refuses to start without in production — because
 *  there the failure is not "less provable", it is "sealed rows that are not
 *  sealed", and that cannot be undone afterwards.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Imports nothing but the counter's own report, so this can be run from a
 * script, a test, or a screen.
 */

import { counterBacking } from "./shared-counter.js";

const SEVERITY = { SERIOUS: "serious", WORTH_FIXING: "worth-fixing", FINE: "fine" };

const set = (name) => Boolean(process.env[name] && String(process.env[name]).trim());

/**
 * Is a secret actually a secret?
 *
 * ── LENGTH IS THE ONLY RULE WORTH APPLYING ─────────────────────────────────
 * A composition rule ("must contain a symbol") produces `Password1!` and a
 * false sense of having asked for something — the same reasoning the sign-up
 * form uses for people's passwords, and it is more true of a machine secret,
 * which nobody has to type.
 *
 * What is worth catching is a placeholder. "changeme", "secret", "test" and
 * the values printed in `.env.example` are what actually end up in a
 * production environment, put there during setup by somebody who meant to
 * come back to it.
 */
const PLACEHOLDERS = [
  "changeme", "change-me", "secret", "password", "test", "example",
  "your-key-here", "todo", "xxx", "placeholder", "dev", "development",
];

function weak(value) {
  if (!value) return "missing";
  const text = String(value).trim();
  if (text.length < 24) return "too short to be worth guessing at";
  const lowered = text.toLowerCase();
  if (PLACEHOLDERS.some((word) => lowered === word || lowered.startsWith(`${word}-`))) {
    return "still set to a placeholder";
  }
  return null;
}

/**
 * Everything worth knowing about how this deployment is configured.
 *
 * Returns a list rather than throwing, so one bad answer does not hide the
 * five below it — which is exactly what a check that throws on the first
 * problem does, and is why setup takes five deploys instead of one.
 *
 * @returns {Array<{ name, severity, says, fix }>}
 */
export function checkEnvironment() {
  const findings = [];
  const production = process.env.NODE_ENV === "production";

  const say = (name, severity, says, fix) => findings.push({ name, severity, says, fix });

  /* ── SEALING ─────────────────────────────────────────────────────────── */
  const sealing = weak(process.env.ENCRYPTION_KEY);
  if (sealing === "missing") {
    say(
      "Sealing key",
      production ? SEVERITY.SERIOUS : SEVERITY.WORTH_FIXING,
      production
        ? "No sealing key is set. The product will refuse to start."
        : "No sealing key is set, so incident narratives and contact details are not actually secret. That is fine on this machine and is not fine anywhere real.",
      "Generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\", and set ENCRYPTION_KEY."
    );
  } else if (sealing) {
    say(
      "Sealing key",
      SEVERITY.SERIOUS,
      `The sealing key is ${sealing}. Everything sealed with it can be read by anybody who guesses it — and sealed rows cannot be re-sealed afterwards without the old key.`,
      "Set ENCRYPTION_KEY to 32 random bytes, base64."
    );
  }

  /* ── THE PIPELINE TO DATA BANK ───────────────────────────────────────── */
  const hubConfigured = set("DATABANK_URL") || set("DUMPSITE_URL");
  if (hubConfigured) {
    const signing = weak(process.env.DATABANK_SIGNING_SECRET);
    if (signing === "missing") {
      say(
        "Data Bank signatures",
        SEVERITY.WORTH_FIXING,
        "Deliveries to Data Bank carry a key but are not signed. The key proves somebody knew the key; it proves nothing about the body it arrived on, so a figure altered in transit would be accepted as evidence.",
        "Set DATABANK_SIGNING_SECRET to the same long random string on both products. Deliveries keep working while only one end has it."
      );
    } else if (signing) {
      say(
        "Data Bank signatures",
        SEVERITY.SERIOUS,
        `The signing secret is ${signing}.`,
        "Set DATABANK_SIGNING_SECRET to a long random string, held by both products and sent nowhere."
      );
    }

    if (!set("DATABANK_API_KEY") && !set("DUMPSITE_API_KEY")) {
      say(
        "Data Bank key",
        SEVERITY.WORTH_FIXING,
        "An address for the hub is set and no key is. Nothing is being delivered: every forward is held in the outbox instead.",
        "Set DATABANK_API_KEY, then run npm run databank:replay to send what was held."
      );
    }
  }

  /* ── THE SIGN-IN LIMITER ─────────────────────────────────────────────── */
  const limiter = counterBacking();
  if (limiter === "memory") {
    say(
      "Sign-in limit",
      SEVERITY.SERIOUS,
      "Failed sign-ins are counted in one process's memory, so the limit is per instance and a restart forgets it. On a platform that runs several instances the limit is effectively however many are running.",
      "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or make sure DATABASE_URL is set so the count can live in the database."
    );
  } else if (limiter === "postgres" && production) {
    say(
      "Sign-in limit",
      SEVERITY.FINE,
      "Failed sign-ins are counted in the database, which every instance shares. That is correct and costs one round trip on the paths where somebody types a credential.",
      "For a large deployment, Redis is faster: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
    );
  }

  /* ── WHOSE ADDRESS THE LIMITER COUNTS ────────────────────────────────── */
  const hops = process.env.TRUSTED_PROXY_HOPS;
  if (hops !== undefined && !(Number.isInteger(Number(hops)) && Number(hops) >= 0)) {
    say(
      "Proxies in front",
      SEVERITY.SERIOUS,
      `TRUSTED_PROXY_HOPS is "${hops}", which is not a number of proxies. It is being ignored, and the address every limit is counted against may be one the caller chose.`,
      "Set it to how many proxies sit in front of this deployment — 1 on Vercel — or remove it."
    );
  }

  /* ── THE ADDRESS THE PRODUCT THINKS IT HAS ───────────────────────────── */
  if (production && !set("NEXT_PUBLIC_SITE_URL")) {
    say(
      "Site address",
      SEVERITY.WORTH_FIXING,
      "This deployment does not know its own address, so shared links, the sitemap and the WhatsApp webhook address are all wrong or missing.",
      "Set NEXT_PUBLIC_SITE_URL to the address people actually type."
    );
  }

  /* ── WHATSAPP, WHICH IS EITHER WIRED UP OR NOT ───────────────────────── */
  if (set("WHATSAPP_TOKEN") && !set("WHATSAPP_APP_SECRET")) {
    say(
      "WhatsApp deliveries",
      SEVERITY.SERIOUS,
      "Messages can be sent but incoming deliveries are not signature-checked, so anybody who finds the webhook address can post a situation report as any number.",
      "Set WHATSAPP_APP_SECRET from the Meta app. The webhook refuses unsigned deliveries once it is set."
    );
  }

  /* ── THE DATABASE ────────────────────────────────────────────────────── */
  const url = process.env.DATABANK_DATABASE_URL?.trim() || process.env.DATABASE_URL;
  if (url && !/-pooler\./.test(url) && production) {
    say(
      "Database connection",
      SEVERITY.WORTH_FIXING,
      "The connection string does not look like the pooled one. Every instance opens its own connections, and a busy night reaches the database's connection limit long before it reaches its capacity.",
      "Use the pooled connection string — the host with -pooler in it."
    );
  }

  return findings;
}

/**
 * The same, as one answer.
 *
 * ── WHY "serious" IS NOT "BROKEN" ──────────────────────────────────────────
 * Every one of these deployments works. A count runs, returns file, boards
 * draw. "Serious" means something that is meant to be protecting the product
 * is not, and nothing on any screen would ever say so — which is a different
 * and quieter kind of wrong than a page that fails to load.
 */
export function environmentVerdict() {
  const findings = checkEnvironment();
  const serious = findings.filter((finding) => finding.severity === SEVERITY.SERIOUS);
  const worth = findings.filter((finding) => finding.severity === SEVERITY.WORTH_FIXING);

  return {
    ok: serious.length === 0,
    serious: serious.length,
    worthFixing: worth.length,
    findings,
  };
}

export { SEVERITY };
