import { json, withActor } from "@/lib/room/api";
import { readPreview } from "@/lib/room/assign";

export const dynamic = "force-dynamic";

/** GET /api/assignments/import/:preview_id → the diff, the rows with errors, the conflicts. */
export async function GET(_request, { params }) {
  return withActor("assignments:manage", async () => {
    const { previewId } = await params;
    const preview = await readPreview(previewId);
    return preview ? json(preview) : json({ error: "That preview is no longer there." }, 404);
  });
}
