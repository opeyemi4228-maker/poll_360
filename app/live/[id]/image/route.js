import { hasCard, isPublic } from "@/lib/broadcast";
import { broadcastItems } from "@/lib/db";
import { postImageBytes } from "@/lib/graphic";

/**
 * The picture of one published update, at a public address.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  PUBLIC, AND ONLY FOR WHAT IS ALREADY PUBLIC
 *
 *  Instagram and Threads do not accept an upload: they are given an address
 *  and fetch the picture themselves, from their own servers, with no session.
 *  X and Facebook read the same address for the preview when somebody shares
 *  the link. So this cannot sit behind a sign-in.
 *
 *  What makes that safe is what it will serve: a social post that is on air —
 *  cleared by an editor and sent out in the organisation's name — and nothing
 *  else. A draft, a post waiting for an editor, a refused one or one taken off
 *  air answers 404, the same as an address that never existed, so the route
 *  cannot be used to ask whether something is being prepared.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const dynamic = "force-dynamic";

const SHAPES = new Set(["wide", "square", "story"]);

export async function GET(request, { params }) {
  const { id } = await params;
  const item = await broadcastItems.get(String(id ?? "")).catch(() => null);
  /* Public, and on air, and something that actually has a card: a strap or a
     programme carries no figures, and drawing one produces a blank sheet with
     a masthead on it, which is a worse answer than no answer. */
  if (!isPublic(item) || !hasCard(item)) {
    return new Response("Not found.", { status: 404 });
  }

  const url = new URL(request.url);
  const asked = url.searchParams.get("shape");
  const png = await postImageBytes(item, SHAPES.has(asked) ? asked : null);

  /* ── INSTAGRAM TAKES JPEG ─────────────────────────────────────────────
     Its publishing interface documents JPEG as the only picture it accepts,
     and a PNG is refused some of the time rather than all of it — the worst
     kind of failure. Converted here with the image library Next already
     ships; if it is somehow missing, the PNG is served and the platform's
     own answer is what the desk sees. */
  if (url.searchParams.get("format") === "jpg") {
    try {
      const { default: sharp } = await import("sharp");
      const jpeg = await sharp(png).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
      return new Response(jpeg, { headers: headers("image/jpeg") });
    } catch {
      /* Fall through to the PNG. */
    }
  }
  return new Response(png, { headers: headers("image/png") });
}

/* The post is frozen — its figures and stamp never change once it is on
   air — so a platform or a browser may keep it for a while. Not for ever:
   taking a post off air should stop it being served within minutes. */
const headers = (type) => ({
  "content-type": type,
  "cache-control": "public, max-age=300",
});
