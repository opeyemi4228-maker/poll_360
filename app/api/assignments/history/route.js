import { json, withActor } from "@/lib/room/api";
import { assignments } from "@/lib/room/assign";
import { tidyCode } from "@/lib/ground";

export const dynamic = "force-dynamic";

/** GET /api/assignments/history?target_code= or ?person_id= */
export async function GET(request) {
  return withActor("assignments:manage", async () => {
    const asked = new URL(request.url).searchParams;
    const code = tidyCode(asked.get("target_code"));
    const personId = asked.get("person_id");
    if (!code && !personId) return json({ error: "Name a place or a person." }, 400);
    return json({ history: await assignments.list({ puCode: code, personId, active: false, take: 500 }) });
  });
}
