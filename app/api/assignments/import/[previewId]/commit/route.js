import { answer, body, withActor } from "@/lib/room/api";
import { importCommit } from "@/lib/room/assign-act";

export const dynamic = "force-dynamic";

/**
 * POST /api/assignments/import/:preview_id/commit { manual: { [assignmentId]: "keep" | "list" }, end: [assignmentId] }
 *
 * `manual` says, for each manual override the list disagrees with, which one
 * wins; anything not named keeps the override. `end` names the assignments
 * missing from the new file that should be ended. Neither happens silently.
 */
export async function POST(request, { params }) {
  return withActor("assignments:manage", async (ctx) => {
    const { previewId } = await params;
    const sent = await body(request);
    return answer(await importCommit(ctx, previewId, { manual: sent.manual ?? {}, end: Array.isArray(sent.end) ? sent.end.map(String) : [] }));
  });
}
