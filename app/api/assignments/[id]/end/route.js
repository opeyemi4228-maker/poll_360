import { answer, body, withActor } from "@/lib/room/api";
import { changeByOps } from "@/lib/room/assign-act";

export const dynamic = "force-dynamic";

/** POST /api/assignments/:id/end { reason, note } */
export async function POST(request, { params }) {
  return withActor("assignments:manage", async (ctx) => {
    const { id } = await params;
    const sent = await body(request);
    return answer(await changeByOps(ctx, [{ op: "end", id }], { reason: sent.reason, note: sent.note }));
  });
}
