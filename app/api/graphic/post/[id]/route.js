import { currentUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { broadcastItems } from "@/lib/db";
import { postImageBytes } from "@/lib/graphic";

/**
 * The card for any post on the desk, for the desk.
 *
 * The public address (app/live/[id]/image) serves only what is on air. The
 * desk has to see the card *before* that — the editor clearing a post is
 * clearing this exact picture, drawn by the same function the platforms will
 * be sent — so this serves every state, to anybody who may read the desk.
 */
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const user = await currentUser();
  if (!user) return new Response("Sign in.", { status: 401 });
  if (!can(user.role, "broadcast:draft") && !can(user.role, "broadcast:clear") && !can(user.role, "broadcast:air")) {
    return new Response("This account cannot read the desk.", { status: 403 });
  }

  const { id } = await params;
  const item = await broadcastItems.get(String(id ?? "")).catch(() => null);
  if (!item || item.kind !== "SOCIAL") return new Response("Not found.", { status: 404 });

  const shape = new URL(request.url).searchParams.get("shape");
  const png = await postImageBytes(item, ["wide", "square", "story"].includes(shape) ? shape : null);
  return new Response(png, {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=60" },
  });
}
