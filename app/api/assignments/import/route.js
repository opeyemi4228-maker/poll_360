import { answer, json, withActor } from "@/lib/room/api";
import { importPreview } from "@/lib/room/assign-act";

export const dynamic = "force-dynamic";

/** POST /api/assignments/import (multipart, field `file`) → { id }, the preview's id. Writes nothing else. */
export async function POST(request) {
  return withActor("assignments:manage", async (ctx) => {
    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ error: "Send the file as multipart form data, in a field named file." }, 400);
    }
    const out = await importPreview(ctx, form.get("file"));
    return out.ok ? json({ preview_id: out.id }, 201) : answer(out);
  });
}
