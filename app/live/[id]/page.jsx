import { notFound } from "next/navigation";

import LiveUpdate from "@/components/live/LiveUpdate";
import { broadcastDispatches, broadcastItems } from "@/lib/db";
import { hasCard, isPublic, latestDeliveries } from "@/lib/broadcast";
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
 *
 * ── AND NOT ONLY SOCIAL POSTS ──────────────────────────────────────────────
 * This asked for a social post specifically, while the wire now links every
 * entry it carries — a breaking strap among them — back here. A strap whose
 * headline was a dead link is the one thing on the wire a reader would think
 * to check. The kinds a public address may serve are named once, in
 * lib/broadcast.js, and all three public routes read them from there.
 */
async function load(id) {
  const item = await broadcastItems.get(String(id ?? "")).catch(() => null);
  return isPublic(item) ? item : null;
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
     draw a shared link as. Only where there is a card to draw — naming a
     picture that answers 404 is worse than naming none, because the platform
     shows a broken frame where it would otherwise have shown the words. */
  const image = hasCard(item)
    ? { url: `/live/${item.id}/image?shape=wide`, width: 1200, height: 675, alt: item.title }
    : null;
  return {
    title: item.title,
    description,
    alternates: { canonical: `/live/${item.id}` },
    openGraph: {
      title: item.title,
      description,
      type: "article",
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: item.title,
      description,
      ...(image ? { images: [image.url] } : {}),
    },
  };
}

export default async function LivePostPage({ params }) {
  const { id } = await params;
  const item = await load(id);
  if (!item) notFound();

  const deliveries = Object.values(latestDeliveries(await broadcastDispatches.forItem(item.id))[item.id] ?? {});

  return (
    /* The same cream the card is drawn on, so the card sits on the page
       instead of being outlined against it. See app/live/p/[project]. */
    <main id="main" className="air-desk min-h-screen px-4 py-8 sm:py-12">
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

        {/* The way back is the point of this page: somebody arrives on it
            holding one screenshot, and the thing they need next is every
            other update, in order. */}
        <p className="mt-6 text-center text-[0.8125rem] text-dash-muted">
          <a href={`/live/p/${item.electionId}`} className="font-semibold text-dash-ink hover:underline">
            See every update on this election
          </a>
        </p>
      </div>
    </main>
  );
}
