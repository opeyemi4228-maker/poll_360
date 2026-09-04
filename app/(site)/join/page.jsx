import { redirect } from "next/navigation";

/**
 * The coordinators' front door moved.
 *
 * ── WHY THIS IS A REDIRECT AND NOT A PAGE ──────────────────────────────────
 * There were briefly two of these, built in parallel: this one, which made a
 * coordinator an account in `users` awaiting approval, and /agent/join, which
 * gives them a row in the `coordinators` table and a session that cannot open
 * a Poll360 room at all.
 *
 * Two sign-up pages is not a cosmetic duplication. They write to different
 * tables, and only one of them is read by the queue an administrator actually
 * works — so a coordinator who found this one would have signed up correctly,
 * been told to wait, and waited for a decision nobody was ever going to be
 * shown. Every link that ever pointed here now lands where somebody is
 * watching.
 *
 * ── AND WHY THE ADDRESS SURVIVES ───────────────────────────────────────────
 * It may be written on a briefing sheet or in somebody's messages by now. A
 * dead URL costs an agent their booth on the one morning it matters; a
 * redirect costs nothing.
 * ───────────────────────────────────────────────────────────────────────────
 */
export const metadata = { robots: { index: false } };

export default function JoinPage() {
  redirect("/agent/join");
}
