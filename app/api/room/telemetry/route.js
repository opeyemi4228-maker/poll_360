import { json, withActor } from "@/lib/room/api";
import { tech } from "@/lib/room/store";
import { snapshotOf } from "@/lib/room/tech-checks";
import { health, webhookTraffic } from "@/lib/system";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/room/telemetry
 *
 * The technical desk's measurements, taken now. The Technical screen asks
 * every few seconds and redraws itself; a monitor can read the same JSON.
 * Shared for three seconds between everybody asking, so ten open screens
 * are one set of measurements and not ten. Counts, timings and ages only:
 * no vote figure is in it. `?raw=1` adds the measurements themselves.
 */
export async function GET(request) {
  return withActor("tech:run", async (ctx) => {
    if (!ctx.project) return json({ error: "No election project is open." }, 409);
    const out = await cached(`room:telemetry:${ctx.project.id}:${ctx.race}`, async () => {
      const [t, system, hooks] = await Promise.all([
        tech.telemetry(ctx.project.id, ctx.race),
        health().catch(() => ({})),
        webhookTraffic().catch(() => ({ checked: false })),
      ]);
      const memory = process.memoryUsage();
      const snapshot = snapshotOf(t, {
        second: system.secondDatabase ?? null,
        hooks,
        autoMigrate: process.env.NODE_ENV !== "production" || process.env.POLL360_AUTO_MIGRATE === "1",
        runtime: { rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal, uptime: Math.round(process.uptime()), node: process.version, region: process.env.VERCEL_REGION ?? "local", build: String(process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7) },
      });
      return { snapshot, raw: t };
    }, { ttlMs: 3000 });
    return json(new URL(request.url).searchParams.get("raw") === "1" ? out : out.snapshot);
  });
}
