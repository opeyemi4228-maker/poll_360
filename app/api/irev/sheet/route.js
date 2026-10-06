import { currentUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { bank } from "@/lib/irev/bank";
import { fetchSheet, fit } from "@/lib/irev/read";
import * as vault from "@/lib/irev/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One INEC result sheet, served from here.
 *
 * ── WHY THE PAGE DOES NOT SIMPLY POINT AT INEC'S STORAGE ───────────────────
 * This site loads no image from a host it does not own, and that rule is
 * enforced by the browser on every page (lib/security-headers.js). It is a
 * good rule and a sheet viewer is not a reason to loosen it. So the sheet is
 * fetched here, brought down to a size a screen needs — the originals are
 * four megabytes and upwards — and handed over as our own.
 *
 * ── AND IT WILL ONLY FETCH A SHEET IT ALREADY HOLDS THE ADDRESS OF ─────────
 * The request names an election and a polling unit, never an address. The
 * address comes out of Data Bank, where the gatherer put it. A route that
 * fetched whatever address it was handed would be a way for anybody signed in
 * to make this server call anything on the internet.
 */
export async function GET(request) {
  const user = await currentUser();
  if (!user || !can(user.role, "results:verify")) return new Response("Not found", { status: 404 });

  const at = new URL(request.url).searchParams;
  const [election, unit] = [Number(at.get("e")), Number(at.get("u"))];
  const db = bank();
  if (!db || !Number.isInteger(election) || !Number.isInteger(unit)) return new Response("Not found", { status: 404 });

  const held = await vault.unit(db, election, unit);
  if (!held?.sheet_url) return new Response("Not found", { status: 404 });

  const etag = `"${Buffer.from(held.sheet_url).toString("base64url").slice(-40)}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });

  const got = await fetchSheet(held.sheet_url);
  if (!got.ok) return new Response(got.reason, { status: got.gone ? 404 : 502 });

  /* A scanned document comes back as the photograph inside it where there is
     one. Where there is not, the document itself is handed over. */
  const fitted = await fit(got.bytes, got.kind);
  const bytes = fitted.ok ? fitted.bytes : got.bytes;
  const image = bytes[0] === 0xff && bytes[1] === 0xd8;

  return new Response(bytes, {
    headers: {
      "Content-Type": image ? "image/jpeg" : bytes[0] === 0x89 ? "image/png" : "application/pdf",
      "Content-Length": String(bytes.length),
      ETag: etag,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
