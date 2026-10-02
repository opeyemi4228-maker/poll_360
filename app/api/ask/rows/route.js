import { currentUser } from "@/lib/session";
import { isStranded, mayOpen } from "@/lib/roles";
import { resolveTerritory } from "@/lib/constituencies";
import { allow } from "@/lib/ask/limits";
import { holds } from "@/lib/ask/sign";
import { readJson } from "@/lib/ask/http";
import { pageOf, sectionsOf } from "@/lib/ask/rows";

/**
 * Any page of any table of an Ask Poll360 answer.
 *
 * ── THE SAME RULES AS A DOWNLOAD ─────────────────────────────────────────
 * Only an answer sealed for this account is paged, and its rows are worked
 * out again from the sealed plan inside the ground the account holds now.
 * The browser names a page, a search and a sort; it never supplies a row.
 */

export const maxDuration = 60;

const MAX_BODY = 256 * 1024;
/* Paging a national list into a file is a few dozen requests; reading one
   on screen is a handful. This is well above both and well below a loop. */
const PAGE_LIMIT = 600;

export async function POST(request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to read this answer." }, { status: 401 });
  if (user.status === "PENDING" || isStranded(user.role) || !mayOpen(user.role, "/room")) {
    return Response.json({ error: "This account cannot open the analytics room." }, { status: 403 });
  }
  const limited = await allow("rows", user.id, PAGE_LIMIT);
  if (!limited.ok) {
    return Response.json({ error: "Too many pages at once. Try again in a few minutes." }, { status: 429, headers: { "Retry-After": String(limited.retryAfter) } });
  }

  const body = await readJson(request, MAX_BODY);
  if (!body) return Response.json({ error: "The request did not arrive in one piece." }, { status: 400 });
  const payload = body.payload;
  if (!holds(payload, user.id, body.token)) {
    return Response.json({ error: "This answer can no longer be read. Ask the question again." }, { status: 409 });
  }

  const resolved = user.territory ? resolveTerritory(user.territory) : null;
  const territory =
    user.territory && !resolved
      ? { level: "UNRESOLVED", key: user.territory, name: "a place we no longer hold", stateCode: null, lgas: [] }
      : resolved;

  try {
    const sections = await sectionsOf(payload.plans ?? [], territory, `${user.id}:${payload.id}:${user.territory ?? ""}`);
    const section = sections[Number(body.section) || 0];
    if (!section) return Response.json({ error: "That table is not part of this answer." }, { status: 404 });
    const page = pageOf(section, {
      offset: Number(body.offset) || 0,
      limit: Number(body.limit) || 100,
      query: typeof body.query === "string" ? body.query.slice(0, 80) : "",
      sort: body.sort && typeof body.sort === "object" ? { key: String(body.sort.key ?? ""), dir: body.sort.dir === "asc" ? "asc" : "desc" } : null,
    });
    return Response.json(page, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[ask] rows failed:", error);
    return Response.json({ error: "Those rows could not be read just now." }, { status: 500 });
  }
}
