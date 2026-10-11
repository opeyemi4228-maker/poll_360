import { answer, body, withActor } from "@/lib/room/api";
import { resolveItem } from "@/lib/room/act";

export const dynamic = "force-dynamic";

/** POST /api/items/:id/resolve { resolution_type, note } */
export async function POST(request, { params }) {
  return withActor(null, async (ctx) => {
    const { id } = await params;
    const sent = await body(request);
    return answer(await resolveItem(ctx, id, String(sent.resolution_type ?? ""), sent.note));
  });
}
