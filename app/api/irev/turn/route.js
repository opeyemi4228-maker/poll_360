import { currentUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { bank } from "@/lib/irev/bank";
import { deskTurn } from "@/lib/irev/desk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* A turn works to a budget of twelve to eighteen seconds and may finish a
   round of sheet reading after it. A minute is the ceiling, not the plan. */
export const maxDuration = 60;

/**
 * One turn of the INEC gatherer, asked for by a dashboard page that is open.
 *
 * ── WHO MAY ASK ────────────────────────────────────────────────────────────
 * A signed-in account allowed to run the system console, from this site's own
 * pages. The second half matters as much as the first: this does work and
 * spends money when a paid reader is set, so a page on another site must not
 * be able to make a signed-in browser ask for it. A browser will not attach
 * the header below to a request from another origin without this site saying
 * it may, and this site never says so.
 *
 * It always answers with what happened, and it never fails loudly: a turn
 * that could not run says why in one line and the page asks again later.
 */
export async function POST(request) {
  if (request.headers.get("x-poll360-turn") !== "1") return new Response("Not found", { status: 404 });

  const user = await currentUser();
  if (!user || !can(user.role, "system:read")) return new Response("Not found", { status: 404 });

  const db = bank();
  if (!db) return Response.json({ idle: true });

  try {
    return Response.json(await deskTurn(db));
  } catch (error) {
    return Response.json({ errors: [error?.message ?? "The turn could not be run."] });
  }
}
