import { MapPin, Clock, Radio } from "lucide-react";

import { hasCard, kindLabel, platformLabel } from "@/lib/broadcast";
import { basisLine, stampFor } from "@/lib/stamp";

/**
 * One published update, as the public sees it.
 *
 * Drawn on the server with no script of its own: this is the page every post
 * links back to, opened from a feed on a phone on a slow network, and all it
 * has to do is show the card, say where and when, and say what it rests on.
 *
 * ── NOT EVERY UPDATE HAS A PICTURE ─────────────────────────────────────────
 * A social post is written around its card and carries the frozen figures the
 * card is drawn from. A breaking strap is three words and a place; a
 * programme is a stream that is open. Asking the picture route for either of
 * the last two used to produce a blank card with a masthead on it, so the
 * card is drawn only where there is one, and the rest are set as type — which
 * is also the fastest thing to load on the network these are read on.
 */
export default function LiveUpdate({ item, deliveries = [], headingLevel = "h1", linkTo = null }) {
  const payload = item.payload ?? {};
  const stamp = payload.stamp ?? stampFor({ scope: item.scope, at: item.airedAt ?? item.createdAt });
  const figures = payload.figures ?? null;
  const Heading = headingLevel;
  const posted = deliveries.filter((row) => row.status === "SENT" && row.remoteUrl);
  const card = hasCard(item);
  const breaking = item.kind === "BANNER";
  const programme = item.kind === "VIDEO" || item.kind === "PROGRAMME";
  const watch = programme ? payload.stage ?? null : null;

  return (
    <article className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
      {/* The card itself, the same file every platform received. */}
      {card && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- our own route, already sized */}
          <img
            src={`/live/${item.id}/image`}
            alt={`${item.title}. ${basisLine(figures)}`}
            /* The card is 1080 × 1080. Saying so reserves the square before
               the bytes land, so the words below it do not jump down the
               screen a second after the reader started reading them. */
            width={1080}
            height={1080}
            className="block aspect-square w-full border-b border-dash-line bg-white object-cover"
            loading={headingLevel === "h1" ? "eager" : "lazy"}
          />
        </>
      )}

      {/* The red strap, as the picture carried it. */}
      {breaking && (
        <p className="flex items-center gap-2 bg-red-600 px-5 py-2 text-[0.6875rem] font-extrabold tracking-[0.16em] text-white uppercase sm:px-6">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-white" />
          Breaking
        </p>
      )}

      <div className="p-5 sm:p-6">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] font-semibold text-dash-muted">
          <a
            href={stamp.mapLink}
            className="inline-flex items-center gap-1.5 text-red-600 hover:underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            <MapPin size={15} strokeWidth={2.5} aria-hidden="true" />
            {stamp.place.name}
            <span className="figure font-normal text-dash-muted">{stamp.coords}</span>
          </a>
          {stamp.time && (
            <time dateTime={stamp.at} className="inline-flex items-center gap-1.5">
              <Clock size={15} strokeWidth={2.5} aria-hidden="true" />
              {stamp.time}
            </time>
          )}
          {/* What kind of thing this is, for anything that is not the
              ordinary written update. A reader who has just landed from a
              link should not have to work out why one entry has a picture
              and the next one does not. */}
          {!card && !breaking && (
            <span className="text-dash-muted">{kindLabel(item.kind)}</span>
          )}
        </p>

        <Heading className="mt-2 font-display text-[1.375rem] leading-tight font-extrabold tracking-[-0.02em] text-dash-ink sm:text-[1.625rem]">
          {linkTo ? (
            <a href={linkTo} className="hover:underline">
              {item.title}
            </a>
          ) : (
            item.title
          )}
        </Heading>

        {item.body && (
          <p className="mt-2 text-[1rem] leading-relaxed whitespace-pre-line text-dash-ink">{item.body}</p>
        )}

        {/* A programme that is open is the one entry here with something to
            do rather than something to read. */}
        {programme && watch && (
          <p className="mt-4">
            <a
              href={watch}
              className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-[0.8125rem] font-bold text-white hover:bg-red-700"
            >
              <Radio size={15} strokeWidth={2.5} aria-hidden="true" />
              Watch live now
            </a>
          </p>
        )}

        {/* The basis, on anything that rests on figures. A strap and a
            programme rest on nothing countable, and printing "0 results in"
            under three words of breaking news would be a claim about the
            count rather than a fact about it. */}
        {figures && (
          <p className="mt-3 border-l-2 border-red-500 pl-3 text-[0.8125rem] leading-relaxed text-dash-muted">
            {basisLine(figures)}
          </p>
        )}

        {posted.length > 0 && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-[0.8125rem] text-dash-muted">
            <span className="font-semibold">Also on</span>
            {posted.map((row) => (
              <a
                key={row.platform}
                href={row.remoteUrl}
                rel="noopener noreferrer"
                target="_blank"
                className="rounded-full border border-dash-line px-3 py-1 font-semibold text-dash-ink hover:border-dash-ink"
              >
                {platformLabel(row.platform)}
              </a>
            ))}
          </p>
        )}
      </div>
    </article>
  );
}
