import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { homeFor } from "@/lib/roles";

/**
 * Who is signed in, for the chrome.
 *
 * ── WHY THIS EXISTS RATHER THAN READING THE SESSION IN THE LAYOUT ──────────
 * Putting the session in the root layout makes every page on the site render
 * per request, and, worse for an installed app, makes every cached page carry
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

/* ── WHERE A ROLE LANDS IS NOT DECIDED HERE ────────────────────────────────
   This file used to carry its own copy of the answer, as a switch over role
   names. It was correct on the day it was written and wrong the moment the
   roles table changed underneath it: the broadcast desk was folded into the
   room, `homeFor` in lib/roles.js started returning /room, and this copy went
   on sending the chrome to /broadcast — a link to a page the reader is no
   longer entitled to open, produced by the one part of the product whose
   whole job is telling the chrome where to point.

   Two tables answering one question is a bug with a delay on it. There is one
   now, in lib/roles.js, and this imports it. */
