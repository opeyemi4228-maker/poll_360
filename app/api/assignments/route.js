import { answer, body, json, withActor } from "@/lib/room/api";
import { assignments } from "@/lib/room/assign";
import { changeByOps } from "@/lib/room/assign-act";
import { tidyCode } from "@/lib/ground";

export const dynamic = "force-dynamic";

/** GET /api/assignments?pu_code=&ward_code=&person_id=&active=true */
export async function GET(request) {
  return withActor("assignments:manage", async () => {
    const asked = new URL(request.url).searchParams;
    return json({
      assignments: await assignments.list({
        puCode: tidyCode(asked.get("pu_code")),
        wardCode: tidyCode(asked.get("ward_code")),
        personId: asked.get("person_id"),
        active: asked.get("active") !== "false",
      }),
    });
  });
}

/** POST /api/assignments { person_id, target_type, target_code, role, reason, note } */
export async function POST(request) {
  return withActor("assignments:manage", async (ctx) => {
    const sent = await body(request);
    const role = sent.role === "BACKUP" ? "BACKUP" : sent.role === "COORDINATOR" || sent.target_type === "WARD" ? "COORDINATOR" : "PRIMARY";
    return answer(await changeByOps(ctx, [{ op: "assign", personId: sent.person_id, code: sent.target_code, role }], { reason: sent.reason, note: sent.note }));
  });
}
