import { notFound } from "next/navigation";

import LiveUpdate from "@/components/live/LiveUpdate";
import { broadcastDispatches, broadcastItems } from "@/lib/db";
import { elections } from "@/lib/elections";
import { latestDeliveries } from "@/lib/broadcast";

export const dynamic = "force-dynamic";

/**
 * The live wire: every update this election's desk has put out, newest first.
 *
 * The one address an organisation can pin to the top of every profile on
 * results night. It reloads itself every minute with no script — a meta
 * refresh — because it is opened on phones on bad networks, and it shows
 * only what is on air: a post taken off air leaves it.
 */
export async function generateMetadata({ params }) {
  const { project } = await params;
  const election = await elections.get(String(project ?? "")).catch(() => null);
  if (!election) return { title: "Not found", robots: { index: false } };
  return {
    title: `Live: ${election.title}`,
    description: `Every update on ${election.title}, stamped with where and when. A parallel count from our own agents, not an official declaration.`,
  };
}

export default async function LiveWirePage({ params }) {
  const { project } = await params;
  const election = await elections.get(String(project ?? "")).catch(() => null);
  if (!election) notFound();

  const items = await broadcastItems.live(election.id);
  const deliveries = latestDeliveries(await broadcastDispatches.all(election.id));

  return (
    <main className="min-h-screen bg-dash-bg px-4 py-8 sm:py-12">
      <meta httpEquiv="refresh" content="60" />
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <p className="flex items-center gap-2 text-[0.75rem] font-bold tracking-[0.14em] text-red-600 uppercase">
            <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-red-500" />
            Live updates
          </p>
          <h1 className="mt-1 font-display text-[1.75rem] leading-tight font-extrabold tracking-[-0.02em] text-dash-ink sm:text-[2.25rem]">
            {election.title}
          </h1>
          <p className="mt-1 text-[0.875rem] text-dash-muted">
            Every update stamped with where and when it was true. A parallel count from our own
            agents at the polling units, not an official declaration. This page refreshes every minute.
          </p>
        </header>

        {items.length === 0 ? (
          <p className="rounded-dash border border-dash-line bg-dash-card p-6 text-[0.9375rem] text-dash-muted">
            Nothing has been published yet. Updates appear here the moment they go out.
          </p>
        ) : (
          <ol className="flex flex-col gap-5">
            {items.map((item) => (
              <li key={item.id}>
                <LiveUpdate
                  item={item}
                  headingLevel="h2"
                  linkTo={`/live/${item.id}`}
                  deliveries={Object.values(deliveries[item.id] ?? {})}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
