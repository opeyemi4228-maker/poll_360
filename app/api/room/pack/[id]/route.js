import { NextResponse } from "next/server";

import { log } from "@/lib/guard";
import { roomActor } from "@/lib/room/access";
import { packs } from "@/lib/room/store";

export const dynamic = "force-dynamic";

/**
 * Download one evidence pack, as it was sealed.
 *
 * The pack is hashed again on the way out. One that no longer matches its
 * seal is refused, not handed over as if it did. Every download is recorded.
 */
export async function GET(_request, { params }) {
  const ctx = await roomActor();
  if (!ctx?.holds("evidence:pack")) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const pack = await packs.get(id);
  if (!pack || pack.electionId !== ctx.project?.id) return new Response("Not found", { status: 404 });
  if (!pack.sound) return NextResponse.json({ error: "This pack no longer matches its seal. Tell the technical team." }, { status: 409 });
  await log(ctx.user, "evidence:downloaded", pack.id, { hash: pack.hash });
  const body = JSON.stringify({ title: pack.title, note: pack.note, sealedAt: pack.at, sealedBy: pack.builtName, sha256: pack.hash, contents: pack.contents }, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="poll360-evidence-${pack.id.slice(0, 8)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
