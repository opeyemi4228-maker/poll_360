import { reader, readsHandwriting } from "./sheet-vision.js";
import { prepare } from "./sql.js";

/**
 * Whether this deployment is fit to run a real election.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE PRODUCT CHECKS ITSELF RATHER THAN A DOCUMENT DESCRIBING IT
 *
 *  Every one of these is written down in DEPLOY.md, and a written checklist
 *  is exactly the thing that gets read once during setup and never again.
 *  The failures it guards against do not announce themselves: a demonstration
 *  account left enabled looks identical to a real one, a missing site URL
 *  breaks nothing anybody notices until a link is shared, and a demo project
 *  left live looks like a quiet night.
 *
 *  None of these is detectable by looking at the screens. All of them are one
 *  query away. So the product answers the question itself, on the dashboard
 *  of the person responsible for it, every time they open it.
 *
 *  ── AND WHY IT IS NOT A HEALTH ENDPOINT ─────────────────────────────────
 *  A green tick on a monitoring page is read by a machine and nobody else. The
 *  person who can actually disable an account is the super administrator, and
 *  the moment to tell them is when they are already looking at the dashboard
 *  where the button is.
 * ══════════════════════════════════════════════════════════════════════════
 */

/**
 * The accounts whose passwords are printed in `.env.example`, and therefore in
 * every checkout, every fork and every screenshot of this repository. They
 * exist so somebody can see the product working within a minute of cloning it.
 * On a deployment holding real returns they are an unlocked door with the key
 * taped to it.
 */
const PUBLISHED = ["%@poll360.ng", "%@example.ng"];

export async function readiness() {
  const checks = [];

  /* ---------------------------------------------------- published accounts */
  let openDemoAccounts = 0;
  try {
    for (const pattern of PUBLISHED) {
      const row = await prepare(
        `SELECT COUNT(*)::int AS n FROM users WHERE email LIKE ? AND disabled_at IS NULL`
      ).get(pattern);
      openDemoAccounts += Number(row?.n ?? 0);
    }

    checks.push({
      id: "demo-accounts",
      ok: openDemoAccounts === 0,
      severity: "critical",
      title:
        openDemoAccounts === 0
          ? "No demonstration accounts can sign in"
          : `${openDemoAccounts} demonstration account${openDemoAccounts === 1 ? "" : "s"} can still sign in`,
      detail:
        openDemoAccounts === 0
          ? "Every account with a password printed in the repository is disabled."
          : "Their passwords are printed in .env.example, which is in every copy of this repository. Anyone who has seen it can sign in as a super administrator.",
      fix: "npm run demo:retire",
    });
  } catch {
    /* A database that will not answer is its own, louder problem, and the
       page that renders this has an error boundary for it. Silence here
       rather than a check that claims to have passed. */
  }

  /* ------------------------------------------------------- demo projects */
  try {
    const row = await prepare(
      `SELECT COUNT(*)::int AS n FROM elections WHERE is_demo = TRUE AND status = 'ACTIVE'`
    ).get();
    const live = Number(row?.n ?? 0);

    checks.push({
      id: "demo-projects",
      ok: live === 0,
      severity: "warning",
      title: live === 0 ? "No demonstration project is active" : `${live} demonstration project${live === 1 ? " is" : "s are"} active`,
      detail:
        live === 0
          ? "Every active project holds real work."
          : "A demonstration project draws a worked example rather than a count. Close it before the room is briefed from it.",
      fix: "Close it from the election switcher.",
    });
  } catch {
    /* As above. */
  }

  /* ------------------------------------------------------- the environment
     Read here rather than at import time so a missing variable is reported
     rather than thrown: a deployment that will not render the page telling
     you what is wrong is worse than one that renders it. */
  const env = [
    ["ENCRYPTION_KEY", "Phone numbers and message bodies are sealed with it. Without it, nothing that needs sealing can be written."],
    ["NEXT_PUBLIC_SITE_URL", "Canonical URLs, the sitemap and every shared link are built from it."],
  ];

  for (const [name, why] of env) {
    const set = Boolean(process.env[name]);
    checks.push({
      id: `env-${name}`,
      ok: set,
      severity: name === "ENCRYPTION_KEY" ? "critical" : "warning",
      title: set ? `${name} is set` : `${name} is not set`,
      detail: why,
      fix: `Set ${name} in the deployment's environment variables.`,
    });
  }

  /* ── CAN THIS DEPLOYMENT READ A RESULT SHEET? ─────────────────────────────
     Every figure that matters on an INEC form is handwritten, and only one of
     the three readers can read handwriting. Without a key for it the product
     still works — the figures are typed, as they always were — but the single
     feature the photograph exists for is switched off, and it is switched off
     silently. An agent at a booth cannot fix that and should never be shown
     it; an administrator can, and this is the screen they read. */
  const handwriting = readsHandwriting();
  const which = reader();
  const off = which === null;

  checks.push({
    id: "sheet-reader",
    ok: handwriting || off,
    /* A warning, not critical: nothing is unsafe, a feature is simply absent.
       Critical is reserved for things that make the count wrong or the
       deployment unlocked. */
    severity: "warning",
    title: off
      ? "Sheet reading is switched off"
      : handwriting
        ? "Result sheets can be read from photographs"
        : "The reader here cannot read handwriting, and result sheets are handwritten",
    detail: off
      ? "SHEET_READER is set to off, so photographs are kept with returns but never read."
      : handwriting
        ? `An agent photographs the sheet and the figures are proposed for them to check. Reader in use: ${which}.`
        : "Every figure on an EC8A is written by hand and the reader running here only reads print, so it recovers almost nothing. Photographs are still kept with each return, and agents type the figures as they always did.",
    fix: handwriting || off
      ? null
      : "Set one of ANTHROPIC_API_KEY, GOOGLE_VISION_API_KEY or OCRSPACE_API_KEY. OCR.space issues a free key against an email address alone, with no card and no cloud account.",
  });

  return {
    checks,
    failing: checks.filter((check) => !check.ok),
    /* A single answer for the banner, because "mostly ready" is not a state
       anybody can act on. */
    ready: checks.every((check) => check.ok),
    blocking: checks.some((check) => !check.ok && check.severity === "critical"),
  };
}
