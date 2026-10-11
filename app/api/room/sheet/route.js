import { media } from "@/lib/db";
import { roomActor } from "@/lib/room/access";
import { latestRead } from "@/lib/room/store";
import { tidyCode } from "@/lib/ground";

export const dynamic = "force-dynamic";

/**
 * The photographed result sheet for one polling unit.
 *
 * Private, and narrowed twice: to accounts that may see sheets at all, and to
 * the asker's own ground. Anything else is "not found", never "forbidden",
 * so the route cannot be used to ask whether a unit has a sheet.
 */
export async function GET(request) {
  const ctx = await roomActor();
  const code = tidyCode(new URL(request.url).searchParams.get("unit"));
  if (!ctx?.project || !code || !ctx.holds("sheets:read") || !ctx.covers(code)) return new Response("Not found", { status: 404 });

  const read = await latestRead(ctx.project.id, code);
  const row = read?.mediaId ? await media.bytes(read.mediaId) : null;
  if (!row) return new Response("Not found", { status: 404 });

  const etag = `"${row.hash}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  return new Response(row.bytes, {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(row.bytes.length),
      ETag: etag,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
