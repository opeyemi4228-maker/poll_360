import { media, incidents } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/roles";

/**
 * A photograph from the field.
 *
 * ── THIS IS EVIDENCE, NOT AN ASSET ─────────────────────────────────────────
 * A photograph taken at a polling unit can carry a bystander's face, an
 * agent's handwriting, a party official, and the exact building somebody stood
 * in at a known hour. It is served only to accounts that may read incidents,
 * never from a public URL, never from a CDN, and never cached by anything in
 * between. `no-store` is deliberate even though the bytes never change: the
 * question is not whether the image is stale, it is who else's disk it ends up
 * on.
 *
 * The ETag is the content hash, so a client that already has the image is told
 * so with a 304 and the bytes are not sent twice — the one optimisation that
 * costs no privacy, because the hash reveals nothing.
 * ───────────────────────────────────────────────────────────────────────────
 */
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const user = await currentUser();
  if (!user || !can(user.role, "incidents:read")) {
    /* A missing image and a forbidden one answer identically. Otherwise this
       route becomes a way of asking whether a given incident exists. */
    return new Response("Not found", { status: 404 });
  }

  const { id } = await params;
  const row = media.bytes(id);
  if (!row) return new Response("Not found", { status: 404 });

  const etag = `"${row.hash}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return new Response(row.bytes, {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(row.bytes.length),
      ETag: etag,
      "Cache-Control": "private, no-store",
      /* Never let a browser be talked into treating these bytes as something
         executable, and never let them be framed. */
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
