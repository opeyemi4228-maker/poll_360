import { currentElection } from "@/lib/election-scope";
import { faultsSpreadsheet, publishingFaults } from "@/lib/irev/faults";
import { can } from "@/lib/roles";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * What is wrong with what INEC published, for one place.
 *
 * The verification screen asks here for the country and then for each place
 * opened under it: how many polling units have no sheet, a late one, a
 * replaced one or one that is not there, and — once a fault is picked — the
 * polling units behind the count. Always for the project the reader is
 * looking at and the one INEC election tied to it; the request names a place
 * and a fault and nothing else.
 *
 * `download=1` hands back every polling unit under the place carrying the
 * fault as a spreadsheet, not only the ones the screen lists.
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

  const at = new URL(request.url).searchParams;
  const under = at.get("under") ?? "";
  const kind = at.get("kind");

  if (at.get("download") === "1") {
    const sheet = await faultsSpreadsheet(project, under, kind);
    if (!sheet) return new Response("Not found", { status: 404 });
    return new Response(sheet.text, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${sheet.name.replace(/[^\x20-\x7e]/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const account = await publishingFaults(project, under, { kind });
  /* The single-sheet screens belong to the system console. The panel only
     offers a way to them to somebody who can go through it. */
  if (account && !account.none) account.canOpenSheets = can(user.role, "system:read");

  return Response.json(account, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
