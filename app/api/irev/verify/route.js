import { declared, results } from "@/lib/db";
import { currentElection, currentRace } from "@/lib/election-scope";
import { inecAgainstOurs } from "@/lib/irev/verify";
import { can } from "@/lib/roles";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * One place of the verification account, for the room's map to open into.
 *
 * The room draws the country from what the page was built with. Opening a
 * state, then a local government, then a ward asks here for that place alone:
 * INEC's sheets under it added up, our returns under it, the two held
 * together, and what is irregular. Always for the project the reader is
 * looking at, and for the one INEC election that project is tied to — the
 * request names a place and nothing else.
 */
export async function GET(request) {
  const user = await currentUser();
  /* Reading, so the grant that reads our count against the commission's. It
     was `results:verify`, which is the power to mark a return checked and is
     the administrator's alone: the room was handed the country with its page
     and then refused every state it pressed. */
  if (!user || !can(user.role, "gap:read")) return new Response("Not found", { status: 404 });

  const project = await currentElection();
  if (!project) return Response.json(null);

  const race = await currentRace(project);
  const under = new URL(request.url).searchParams.get("under") ?? "";
  const [rows, announced] = await Promise.all([
    results.counted(project.id, race, null),
    declared.all(project.id, race, null),
  ]);

  return Response.json(await inecAgainstOurs(project, rows, under, announced), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
