import { answer, body, withActor } from "@/lib/room/api";
import { changeByOps } from "@/lib/room/assign-act";

export const dynamic = "force-dynamic";

/** POST /api/assignments/move { assignment_id, new_target_code, reason, note } */
export async function POST(request) {
  return withActor("assignments:manage", async (ctx) => {
    const sent = await body(request);
    return answer(await changeByOps(ctx, [{ op: "move", id: sent.assignment_id, code: sent.new_target_code }], { reason: sent.reason, note: sent.note }));
  });
}
