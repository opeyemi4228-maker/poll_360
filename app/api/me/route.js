import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";

/**
 * Who is signed in, for the chrome.
 *
 * ── WHY THIS EXISTS RATHER THAN READING THE SESSION IN THE LAYOUT ──────────
 * Putting the session in the root layout makes every page on the site render
 * per request — and, worse for an installed app, makes every cached page carry
 * whoever was signed in when it was cached. The service worker then serves a
 * signed-out copy to a signed-in reader, React finds markup it did not expect,
 * and hydration fails.
 *
 * So the pages stay public and cacheable, and the two or three elements that
 * depend on who is reading ask for that separately, here. The response is
 * marked private and no-store so it is the one thing never cached anywhere.
 * ───────────────────────────────────────────────────────────────────────────
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();

  return NextResponse.json(
    {
      user: user
        ? { name: user.name, role: user.role, scope: user.scope, home: homeFor(user.role) }
        : null,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}

/** Each role lands somewhere different; the chrome links to the right one. */
export function homeFor(role) {
  switch (role) {
    case "SUPER_ADMIN":
      return "/admin";
    case "PU_AGENT":
      return "/field";
    case "BROADCASTER":
      return "/broadcast";
    case "SITUATION_ROOM":
      return "/room";
    default:
      return "/console";
  }
}
