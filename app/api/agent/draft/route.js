import { NextResponse } from "next/server";

import { currentCoordinator } from "@/lib/coordinator-session";
import { agentElection } from "@/lib/agent-election";
import { isRace } from "@/lib/races";
import { tidyCode } from "@/lib/ground";
import { submissions } from "@/lib/room/store";
import { roomSaw } from "@/lib/room/hooks";

export const dynamic = "force-dynamic";

/**
 * A draft left behind by an agent who was moved off a polling unit.
 *
 * Their phone hands it over as it removes the unit. It is kept for the field
 * desk to look at and it is never a result: nothing here writes to the count.
 */
export async function POST(request) {
  const person = await currentCoordinator();
  if (!person?.canFile) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  let sent;
  try {
    sent = await request.json();
  } catch {
    return NextResponse.json({ error: "Nothing was sent." }, { status: 400 });
  }
  const unitCode = tidyCode(sent?.unit);
  const race = String(sent?.race ?? "").toUpperCase();
  if (!unitCode || unitCode.split("/").length !== 4 || !isRace(race) || !sent?.figures || typeof sent.figures !== "object") {
    return NextResponse.json({ error: "That is not a draft." }, { status: 400 });
  }
  const project = await agentElection(unitCode);
  if (!project) return NextResponse.json({ ok: true, kept: false });
  /* Only what a draft holds, and only so much of it. */
  const figures = JSON.parse(JSON.stringify(sent.figures).slice(0, 4000) || "{}");
  await submissions.keep({ electionId: project.id, race, unitCode, kind: "ORPHANED_DRAFT", person, figures, note: "Left when the agent was moved off this polling unit" });
  await roomSaw({ project, race, unitCode, cause: "Draft left behind" });
  return NextResponse.json({ ok: true, kept: true });
}
