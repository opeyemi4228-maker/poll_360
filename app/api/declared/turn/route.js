import { revalidatePath } from "next/cache";

import { currentUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { declared, declaredSources } from "@/lib/db";
import { pullDue } from "@/lib/declared-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * One reading of every sheet declared figures are fetched from, asked for by
 * a dashboard page that is open.
 *
 * Nothing on the server runs by itself between requests, so an open screen
 * does the asking, the same way the INEC gatherer is kept going. Asking often
 * costs nothing: an address read in the last two minutes is not read again,
 * and where no address has been given this is one small question and no
 * request to anywhere.
 *
 * ── WHO MAY ASK ────────────────────────────────────────────────────────────
 * Anybody signed in who may see the comparison, from this site's own pages.
 * They choose nothing: which sheet is read was decided by somebody allowed to
 * enter declared figures, and this only says "look again".
 */
export async function POST(request) {
  if (request.headers.get("x-poll360-turn") !== "1") return new Response("Not found", { status: 404 });

  const user = await currentUser();
  if (!user || !can(user.role, "gap:read")) return new Response("Not found", { status: 404 });

  try {
    const went = await pullDue({ declared, declaredSources });
    if (went.changed) {
      revalidatePath("/gap");
      revalidatePath("/room");
    }
    return Response.json(went);
  } catch {
    return Response.json({ read: 0, changed: 0, written: 0 });
  }
}
