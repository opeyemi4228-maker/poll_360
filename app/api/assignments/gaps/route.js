import { json, withActor } from "@/lib/room/api";
import { assignments, listed } from "@/lib/room/assign";
import { tidyCode } from "@/lib/ground";

export const dynamic = "force-dynamic";

/** GET /api/assignments/gaps?state_code= */
export async function GET(request) {
  return withActor("assignments:manage", async () => {
    const state = tidyCode(new URL(request.url).searchParams.get("state_code"));
    if (!state) return json({ error: "Name a state: state_code=19." }, 400);
    return json(await assignments.gaps({ ...listed(state), under: state }));
  });
}
