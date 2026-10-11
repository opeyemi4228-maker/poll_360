import { json, withActor } from "@/lib/room/api";
import { tech } from "@/lib/room/store";

export const dynamic = "force-dynamic";

/** GET /api/room/telemetry: the technical desk's measurements, as JSON, for a monitor to read. */
export async function GET() {
  return withActor("tech:run", async (ctx) => {
    if (!ctx.project) return json({ error: "No election project is open." }, 409);
    return json(await tech.telemetry(ctx.project.id, ctx.race));
  });
}
