import { json, withActor } from "@/lib/room/api";
import { items } from "@/lib/room/store";
import { tidyCode, touches } from "@/lib/ground";

export const dynamic = "force-dynamic";

/**
 * GET /api/lights/:area_code/items?light=red|yellow&status=open
 *
 * The area code is written with dashes in the address (19-04-11), because a
 * slash there would be read as another level of the path.
 */
export async function GET(request, { params }) {
  return withActor("room:read", async (ctx) => {
    if (!ctx.project) return json({ error: "No election project is open." }, 409);
    const { areaCode } = await params;
    const code = tidyCode(decodeURIComponent(areaCode));
    if (!code) return json({ error: "That is not a place code." }, 400);
    if (!touches(ctx.ground, code)) return json({ error: "That place is not on your ground.", code: "FORBIDDEN" }, 403);
    const asked = new URL(request.url).searchParams;
    const light = String(asked.get("light") ?? "").toUpperCase();
    return json({
      items: await items.list({
        electionId: ctx.project.id,
        race: ctx.race,
        ground: ctx.ground,
        under: code,
        light: light === "RED" || light === "YELLOW" ? light : null,
        status: asked.get("status") === "all" ? null : "OPEN",
      }),
    });
  });
}
