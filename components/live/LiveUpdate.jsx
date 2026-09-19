import { MapPin, Clock } from "lucide-react";

import { platformLabel } from "@/lib/broadcast";
import { basisLine, stampFor } from "@/lib/stamp";

/**
 * One published update, as the public sees it.
 *
 * Drawn on the server with no script of its own: this is the page every post
 * links back to, opened from a feed on a phone on a slow network, and all it
 * has to do is show the card, say where and when, and say what it rests on.
 */
export default function LiveUpdate({ item, deliveries = [], headingLevel = "h1", linkTo = null }) {
  const payload = item.payload ?? {};
  const stamp = payload.stamp ?? stampFor({ scope: item.scope, at: item.createdAt });
  const figures = payload.figures ?? null;
  const Heading = headingLevel;
  const posted = deliveries.filter((row) => row.status === "SENT" && row.remoteUrl);

  return (
    <article className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
      {/* The card itself, the same file every platform received. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- our own route, already sized */}
      <img
        src={`/live/${item.id}/image`}
        alt={`${item.title}. ${basisLine(figures)}`}
        className="block w-full border-b border-dash-line bg-white"
        loading={headingLevel === "h1" ? "eager" : "lazy"}
      />

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

        <p className="mt-3 border-l-2 border-red-500 pl-3 text-[0.8125rem] leading-relaxed text-dash-muted">
          {basisLine(figures)}
        </p>

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
