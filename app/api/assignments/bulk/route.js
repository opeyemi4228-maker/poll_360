import { answer, body, withActor } from "@/lib/room/api";
import { changeByOps } from "@/lib/room/assign-act";

export const dynamic = "force-dynamic";

/**
 * POST /api/assignments/bulk { operations: [...], reason, note }
 *
 * All succeed or none do. Each operation is one of: assign, assignMany,
 * replace, end, move, promote, clearPrimary, swap.
 */
export async function POST(request) {
  return withActor("assignments:manage", async (ctx) => {
    const sent = await body(request);
    const operations = (Array.isArray(sent.operations) ? sent.operations : []).map((op) => ({
      ...op,
      personId: op.personId ?? op.person_id,
      code: op.code ?? op.target_code ?? op.new_target_code,
      id: op.id ?? op.assignment_id,
    }));
    return answer(await changeByOps(ctx, operations, { reason: sent.reason, note: sent.note }));
  });
}
