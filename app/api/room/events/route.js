import { NextResponse, after } from "next/server";

import { roomActor } from "@/lib/room/access";
import { events, field, staff, sweep, tech } from "@/lib/room/store";
import { rolesOf } from "@/lib/roles";
import { touches } from "@/lib/ground";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * What every open room screen asks, every few seconds: what happened since
 * the last thing I heard?
 *
 * The answer is narrowed here, on the server, to the asker's ground and
 * desk. A screen is never sent an event about a place it may not read and
 * left to ignore it.
 */
const FOR_DESK = {
  DIRECTOR: ["DIRECTOR", "SUPER_ADMIN"],
  ZONE_LEAD: ["ZONE_LEAD", "SUPER_ADMIN"],
  LEAD_VERIFIER: ["LEAD_VERIFIER", "SUPER_ADMIN"],
  LEGAL: ["LEGAL", "SUPER_ADMIN"],
  TECH: ["TECH_OPS", "TECH_SECURITY", "SUPER_ADMIN", "DIRECTOR"],
};

export async function GET(request) {
  const ctx = await roomActor();
  if (!ctx) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!ctx.faces.length) return NextResponse.json({ error: "This account has no desk in the room." }, { status: 403 });

  const asked = new URL(request.url).searchParams.get("after");
  const mine = rolesOf(ctx.user);
  const hears = (event) => {
    if (event.electionId && ctx.project && event.electionId !== ctx.project.id) return false;
    if (event.audience) {
      if (event.audience.startsWith("user:")) return event.audience === `user:${ctx.user.id}`;
      if (event.audience.startsWith("agent:")) return false;
      if (!(FOR_DESK[event.audience] ?? []).some((role) => mine.includes(role))) return false;
    }
    return !event.areaCode || touches(ctx.ground, event.areaCode);
  };

  const [heard, latest, techLight, sos] = await Promise.all([
    asked == null ? [] : events.since(asked),
    asked == null ? events.latest() : null,
    tech.light(),
    /* Critical reports from the last twelve hours that nobody has
       acknowledged, on this ground. They ring until somebody does. Twelve
       hours is one election night: a report older than that is on the
       situations list, and is not an alarm any more. Shared for two seconds between everybody with the
       same ground, so sixty screens are not sixty queries. */
    ctx.project && ctx.holds("field:act")
      ? cached(`room:sos:${ctx.project.id}:${JSON.stringify(ctx.ground)}`, async () =>
          (await field.incidents({ electionId: ctx.project.id, ground: ctx.ground, critical: true, hours: 12, take: 20 })).filter((row) => !row.acknowledgedAt),
          { ttlMs: 2000 })
      : [],
  ]);

  after(async () => {
    try {
      await staff.seen(ctx.user.id);
      if (ctx.project) await sweep(ctx.project, ctx.race);
    } catch (error) {
      console.error("room heartbeat:", error?.message ?? error);
    }
  });

  const seq = heard.length ? heard[heard.length - 1].seq : (latest ?? Number(asked) ?? 0);
  return NextResponse.json(
    {
      seq,
      events: heard.filter(hears).map(({ seq: n, type, areaCode, payload, at }) => ({ seq: n, type, areaCode, payload, at })),
      techLight,
      sos: sos.map((row) => ({ id: row.id, name: row.reporter, phone: row.reporterPhone, place: row.place, kind: row.kind, sos: row.sos, at: row.createdAt })),
      now: Date.now(),
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
