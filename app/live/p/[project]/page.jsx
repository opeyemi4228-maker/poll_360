import { notFound } from "next/navigation";
import { Radio } from "lucide-react";

import LiveUpdate from "@/components/live/LiveUpdate";
import { broadcastDispatches, broadcastItems } from "@/lib/db";
import { elections } from "@/lib/elections";
import { latestDeliveries, programmeOnAir } from "@/lib/broadcast";
import { site } from "@/lib/site";
import { nowWAT } from "@/lib/stamp";

export const dynamic = "force-dynamic";

/**
 * The live wire: every update this election's desk has put out, newest first.
 *
 * The one address an organisation can pin to the top of every profile on
 * results night. It reloads itself every minute with no script — a meta
 * refresh — because it is opened on phones on bad networks, and it shows
 * only what is on air: a post taken off air leaves it.
 *
 * ── IT WEARS WHAT IT PRINTS ────────────────────────────────────────────────
 * Cream paper and navy ink, the palette lib/cards.jsx draws every card in and
 * the one the desk itself wears (`.air-desk` in app/globals.css). This page
 * was the odd one out: the cards are cream and it set them on the dashboards'
 * cool grey, so every square announced its own edges. One class puts the page
 * in the same palette as its contents, and nothing else had to move.
 */
export async function generateMetadata({ params }) {
  const { project } = await params;
  const election = await elections.get(String(project ?? "")).catch(() => null);
  if (!election) return { title: "Not found", robots: { index: false } };
  const description = `Every update on ${election.title}, stamped with where and when. A parallel count from our own agents, not an official declaration.`;
  return {
    title: `Live: ${election.title}`,
    description,
    alternates: { canonical: `/live/p/${election.id}` },
    openGraph: { title: `Live: ${election.title}`, description, type: "website" },
    twitter: { card: "summary_large_image", title: `Live: ${election.title}`, description },
  };
}

export default async function LiveWirePage({ params }) {
  const { project } = await params;
  const election = await elections.get(String(project ?? "")).catch(() => null);
  if (!election) notFound();

  const items = await broadcastItems.live(election.id);
  /* Where each post went is a footnote to the post, not the post. A database
     that has not been given the table that records it yet (see DEPLOY.md,
     "Publishing to social media") would otherwise take the whole wire down
     over a line of small print, so the wire goes out without it. */
  const deliveries = latestDeliveries(await broadcastDispatches.all(election.id).catch(() => []));
  /* A programme is not an entry in a feed — it is a thing happening now — so
     it is lifted out of the list and given the top of the page. */
  const programme = programmeOnAir(items);
  const feed = items.filter((item) => item !== programme);
  const read = await nowWAT();

  return (
    <div className="air-desk min-h-screen">
      {/* ── THE MASTHEAD ─────────────────────────────────────────────────
          Whose count this is, said once at the top. Everything below is a
          figure somebody may repost; a reader who has landed from a link
          should never have to scroll to find out who is publishing it. */}
      <header className="air-band">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <a href={site.url} className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] hover:underline">
            {site.name}
          </a>
          <span className="flex items-center gap-2 text-[0.6875rem] font-bold tracking-[0.16em] text-red-400 uppercase">
            <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-red-500" />
            Live
          </span>
          <span className="figure ml-auto text-[0.75rem] opacity-70">{read}</span>
        </div>
      </header>

      <main id="main" className="px-4 py-8 sm:py-12">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6">
            <h1 className="font-display text-[1.75rem] leading-tight font-extrabold tracking-[-0.02em] text-dash-ink sm:text-[2.25rem]">
              {election.title}
            </h1>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-dash-muted">
              Every update stamped with where and when it was true. A parallel count from our own
              agents at the polling units, not an official declaration. This page refreshes itself
              every minute.
            </p>
          </div>

          {/* ── ON AIR NOW ────────────────────────────────────────────────
              A programme that is open is the only thing on this page with
              something to do rather than something to read, so it goes above
              the feed and it looks like a button, not like a headline. */}
          {programme && (
            <section className="mb-6 rounded-dash border border-red-500 bg-dash-card p-5 sm:p-6">
              <p className="flex items-center gap-2 text-[0.6875rem] font-extrabold tracking-[0.16em] text-red-600 uppercase">
                <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-red-500" />
                On air now
              </p>
              <h2 className="mt-2 font-display text-[1.25rem] leading-tight font-extrabold tracking-[-0.02em] text-dash-ink sm:text-[1.5rem]">
                {programme.title}
              </h2>
              {programme.body && (
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-dash-ink">{programme.body}</p>
              )}
              {programme.payload?.stage && (
                <a
                  href={programme.payload.stage}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-[0.8125rem] font-bold text-white hover:bg-red-700"
                >
                  <Radio size={15} strokeWidth={2.5} aria-hidden="true" />
                  Watch live now
                </a>
              )}
            </section>
          )}

          {feed.length === 0 ? (
            /* ── NOTHING ON AIR IS NOT NOTHING TO SAY ────────────────────
               This address is printed on profiles and read out on air, so it
               is opened at four in the afternoon as often as at midnight. A
               single grey sentence told that reader nothing about what they
               had found or when to come back. */
            <section className="rounded-dash border border-dash-line bg-dash-card p-6 sm:p-8">
              <h2 className="font-display text-[1.125rem] font-extrabold tracking-[-0.01em] text-dash-ink">
                {programme ? "No written updates yet" : "Nothing on air yet"}
              </h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-dash-muted">
                {programme
                  ? "The programme above is running. Written updates appear here the moment the desk puts one out."
                  : "Updates appear here the moment an editor puts one out, and this page checks for them every minute on its own — there is nothing to press."}
              </p>
              <p className="mt-4 border-l-2 border-red-500 pl-3 text-[0.8125rem] leading-relaxed text-dash-muted">
                Nothing reaches this page automatically. Every figure on it has been checked against
                a photographed result sheet and passed for air by a person who did not file it.
              </p>
            </section>
          ) : (
            <ol className="flex flex-col gap-5">
              {feed.map((item) => (
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

          <footer className="mt-10 border-t border-dash-line pt-5 text-[0.8125rem] leading-relaxed text-dash-muted">
            <p>
              <a href={site.url} className="font-semibold text-dash-ink hover:underline">
                {site.name}
              </a>{" "}
              counts an election alongside the official count. A named agent files the result from
              every polling unit with a photograph of the sheet, and the share of polling units
              counted is shown beside every figure.
            </p>
            <p className="mt-2">
              Official results are declared by INEC. Nothing on this page is a declaration.
            </p>
          </footer>
        </div>
      </main>

      {/* ── WHY A META REFRESH AND NOT A SCRIPT ────────────────────────────
          This page is read on a phone on a congested network in a hall with
          no seats. A polling script is a connection held open and a bundle to
          download before anything moves; this is one line in the head that
          costs nothing and works with JavaScript switched off entirely. */}
      <meta httpEquiv="refresh" content="60" />
    </div>
  );
}
