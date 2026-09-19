import { notFound } from "next/navigation";

import LiveUpdate from "@/components/live/LiveUpdate";
import { broadcastDispatches, broadcastItems } from "@/lib/db";
import { latestDeliveries } from "@/lib/broadcast";
import { basisLine, stampFor } from "@/lib/stamp";

export const dynamic = "force-dynamic";

/**
 * The page every published update links back to.
 *
 * ── WHY EVERY POST HAS ONE ─────────────────────────────────────────────────
 * A caption is cut to fit X; a card is cropped by whoever reposts it. This is
 * the version that is never cut: the whole update, where and when it was
 * true, what it rests on, and a link to every platform it went out on — so
 * somebody handed a screenshot can find the original and check it.
 *
 * On air only, like the picture it shows. See app/live/[id]/image/route.js.
 */
async function load(id) {
  const item = await broadcastItems.get(String(id ?? "")).catch(() => null);
  if (!item || item.kind !== "SOCIAL" || item.state !== "ON_AIR") return null;
  return item;
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const item = await load(id);
  if (!item) return { title: "Update not found", robots: { index: false } };
  const stamp = item.payload?.stamp ?? stampFor({ scope: item.scope, at: item.createdAt });
  const description = [item.body, `${stamp.place.name}, ${stamp.time}.`, basisLine(item.payload?.figures)]
    .filter(Boolean)
    .join(" ");
  /* The wide shape for link previews: it is what X, Facebook and WhatsApp
     draw a shared link as. */
  const image = { url: `/live/${item.id}/image?shape=wide`, width: 1200, height: 675, alt: item.title };
  return {
    title: item.title,
    description,
    openGraph: { title: item.title, description, type: "article", images: [image] },
    twitter: { card: "summary_large_image", title: item.title, description, images: [image.url] },
  };
}

export default async function LivePostPage({ params }) {
  const { id } = await params;
  const item = await load(id);
  if (!item) notFound();

  const deliveries = Object.values(latestDeliveries(await broadcastDispatches.forItem(item.id))[item.id] ?? {});

  return (
    <main className="min-h-screen bg-dash-bg px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-5 flex items-center justify-between gap-3">
          <a href={`/live/p/${item.electionId}`} className="flex items-center gap-2 text-[0.75rem] font-bold tracking-[0.14em] text-dash-muted uppercase hover:text-dash-ink">
            <span aria-hidden="true" className="size-2 rounded-full bg-red-500" />
            Poll360 live · all updates
          </a>
          {item.payload?.project && (
            <span className="truncate text-[0.75rem] font-semibold text-dash-muted">{item.payload.project}</span>
          )}
        </header>
        <LiveUpdate item={item} deliveries={deliveries} />
      </div>
    </main>
  );
}
