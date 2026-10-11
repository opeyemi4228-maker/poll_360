import { NextResponse } from "next/server";

import { currentCoordinator } from "@/lib/coordinator-session";
import { assignments } from "@/lib/room/assign";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * The polling units this agent holds now.
 *
 * Asked by the agents' app every few seconds while it is open, so an agent
 * moved off a unit sees it go without signing out. Shared for a few seconds
 * per agent, which is what keeps four thousand open phones from being four
 * thousand queries at once. The filing action asks storage directly in any
 * case: this route is a courtesy to the screen, never the control.
 */
export async function GET() {
  const person = await currentCoordinator();
  if (!person) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const units = await cached(`agent:units:${person.id}`, () => assignments.unitsOf(person.id), { ttlMs: 4000 });
  return NextResponse.json({ units: units.map((unit) => unit.code) }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
