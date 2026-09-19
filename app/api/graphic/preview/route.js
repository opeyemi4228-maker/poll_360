import { currentUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { postImageBytes } from "@/lib/graphic";
import { socialPayload } from "@/lib/post-payload";
import { isRace } from "@/lib/races";
import { viewing } from "@/lib/viewing";

/**
 * The card a post *would* be, drawn while it is being written.
 *
 * ── THE PREVIEW IS THE RENDERER, NOT A DRAWING OF IT ───────────────────────
 * The composer used to draw its own sketch of the card in the browser, which
 * meant two designs to keep in step and a preview that could show something
 * the file would not. This draws with the same builder and the same renderer
 * the post will use when it is saved and sent, so what the writer sees is the
 * file — and with `?as=json`, the frozen figures and stamp behind it.
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await currentUser();
  if (!user) return new Response("Sign in.", { status: 401 });
  if (!can(user.role, "broadcast:draft")) return new Response("This account cannot write for the desk.", { status: 403 });

  const url = new URL(request.url);
  const read = (key, max = 400) => (url.searchParams.get(key) ?? "").slice(0, max);
  const { project, race: roomRace } = await viewing("/room");
  const race = isRace(read("race")) ? read("race") : roomRace;

  const payload = await socialPayload({
    scope: read("scope", 40) || "NATION",
    race,
    payload: { format: read("format", 40) || "result-card", shape: read("shape", 10) || "square", headline: read("headline", 120) || null },
  });

  if (url.searchParams.get("as") === "json") {
    return Response.json({ figures: payload.figures, stamp: payload.stamp, place: payload.place, level: payload.level });
  }

  /* ── THE SAME PREVIEW, TWICE IN A SECOND ────────────────────────────
     A writer typing a caption asks for a picture on every pause, and the
     answer only changes when the words or the place do. Held for a few
     seconds, per account, because what a person may read depends on their
     ground. Not long enough for the figures behind it to go stale. */
  const key = `${user.id}\u0000${url.search}`;
  const held = recent.get(key);
  if (held && Date.now() - held.at < 6000) {
    return new Response(held.png, { headers: { "content-type": "image/png", "cache-control": "private, no-store" } });
  }

  const png = await postImageBytes({
    electionId: project?.id ?? null,
    race,
    title: read("headline", 120) || payload.place?.name || "Update",
    body: read("body", 600),
    payload,
  });
  recent.set(key, { png, at: Date.now() });
  while (recent.size > 24) recent.delete(recent.keys().next().value);

  return new Response(png, { headers: { "content-type": "image/png", "cache-control": "private, no-store" } });
}

/* Oldest first, so trimming drops the least recently asked for. */
const recent = new Map();
