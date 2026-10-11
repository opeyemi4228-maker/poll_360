import { json, withActor } from "@/lib/room/api";
import { lights } from "@/lib/room/store";
import { childLevel, levelOf, tidyCode, touches } from "@/lib/ground";

export const dynamic = "force-dynamic";

const shape = (row) => ({
  code: row.code,
  name: row.name,
  light: row.light.toLowerCase(),
  counts: row.counts,
  coverage_pct: row.coveragePct,
  bvas_accredited: row.bvas.accredited,
  updated_at: row.updatedAt,
});

/**
 * GET /api/lights?level=state|lga|ward|pu&parent_code=
 *
 * The lights on the places under `parent_code`, narrowed to the asker's
 * ground. `level` must be the level directly under the parent. With
 * `level=national` it is the one light on everything the asker holds. A
 * technical account is given the counts and not the BVAS figure.
 */
export async function GET(request) {
  return withActor(null, async (ctx) => {
    const full = ctx.holds("room:read") || ctx.holds("room:cleared");
    if (!full && !ctx.holds("room:counts")) return json({ error: "Your account cannot do that.", code: "FORBIDDEN" }, 403);
    if (!ctx.project) return json({ error: "No election project is open." }, 409);
    const asked = new URL(request.url).searchParams;
    const level = String(asked.get("level") ?? "state").toLowerCase();
    const parent = tidyCode(asked.get("parent_code")) ?? "";
    if (parent && !touches(ctx.ground, parent)) return json({ error: "That place is not on your ground.", code: "FORBIDDEN" }, 403);
    const args = { electionId: ctx.project.id, race: ctx.race, code: parent, ground: ctx.ground };
    const tidy = (row) => (full ? shape(row) : { ...shape(row), bvas_accredited: undefined });
    if (level === "national") return json([tidy(await lights.at(args))]);
    if (childLevel(levelOf(parent)) !== level) return json({ error: `Under that parent the level is ${childLevel(levelOf(parent))}.` }, 400);
    return json((await lights.under(args)).map(tidy));
  });
}
